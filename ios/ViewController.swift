import UIKit
import WebKit
import AVFoundation
import MediaPlayer

class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    private var contentContainer: UIView!
    private var progressView: UIProgressView!
    private var bottomBar: UIVisualEffectView!
    private var bottomBarHeightConstraint: NSLayoutConstraint!
    private var tabButtons: [UIButton] = []
    private var badgeLabel: UILabel!

    private var webViews: [Int: WKWebView] = [:]
    private var activeTabIndex: Int = 0
    private var progressObservations: [Int: NSKeyValueObservation] = [:]

    private var panelContainer: UIView?
    private var panelWebView: WKWebView?
    private var panelSegment: UISegmentedControl?
    private var currentPanelPage: String = ""
    private var oauthContainer: UIView?
    private var oauthWebView: WKWebView?

    private var bgTask: UIBackgroundTaskIdentifier = .invalid
    private let audioQueue = DispatchQueue(label: "com.funnygame.audio", qos: .userInitiated)
    private var audioConfigured = false
    private var resCache: [String: String] = [:]
    private var cachedCombinedScript: WKUserScript?

    private let storageKeyLocal = "fg_chrome_storage_local_v1"
    private let storageKeySession = "fg_chrome_storage_session_v1"

    private let tabUrls: [String] = [
        "https://m.youtube.com",
        "https://music.youtube.com",
        "https://open.spotify.com",
    ]

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override var prefersHomeIndicatorAutoHidden: Bool {
        return view.bounds.width > view.bounds.height
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.05, green: 0.05, blue: 0.07, alpha: 1.0)

        if let storyboardWebView = self.webView {
            storyboardWebView.removeFromSuperview()
        }

        configureAudioSession()
        configureRemoteCommands()
        observeAppLifecycle()

        setupLayout()
        updateBadgeFromStorage()
        switchToTab(0)
    }

    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate(alongsideTransition: { _ in
            self.updateBarVisibility(for: size)
        }, completion: nil)
    }

    private func updateBarVisibility(for size: CGSize) {
        let isLandscape = size.width > size.height
        bottomBar.isHidden = isLandscape
        bottomBarHeightConstraint.constant = isLandscape ? 0 : 54
        setNeedsUpdateOfHomeIndicatorAutoHidden()
        view.layoutIfNeeded()
    }

    // ---------- Âm thanh nền & Màn hình khoá (Lock Screen / Control Center) ----------
    // Chạy bất đồng bộ trên audioQueue để KHÔNG bao giờ làm khựng/đơ cử chỉ vuốt thoát App (SpringBoard 120Hz)
    private func configureAudioSession(forceCategory: Bool = false) {
        audioQueue.async { [weak self] in
            guard let self = self else { return }
            do {
                let session = AVAudioSession.sharedInstance()
                if !self.audioConfigured || forceCategory {
                    try session.setCategory(.playback, mode: .moviePlayback, options: [])
                    self.audioConfigured = true
                }
                try session.setActive(true)
            } catch {
                // Ignore audio session error
            }
        }
    }

    private func configureRemoteCommands() {
        let cc = MPRemoteCommandCenter.shared()
        cc.playCommand.isEnabled = true
        cc.playCommand.addTarget { [weak self] _ in
            self?.sendRemoteCommand("play")
            return .success
        }
        cc.pauseCommand.isEnabled = true
        cc.pauseCommand.addTarget { [weak self] _ in
            self?.sendRemoteCommand("pause")
            return .success
        }
        cc.togglePlayPauseCommand.isEnabled = true
        cc.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.sendRemoteCommand("toggle")
            return .success
        }
        cc.nextTrackCommand.isEnabled = true
        cc.nextTrackCommand.addTarget { [weak self] _ in
            self?.sendRemoteCommand("next")
            return .success
        }
        cc.previousTrackCommand.isEnabled = true
        cc.previousTrackCommand.addTarget { [weak self] _ in
            self?.sendRemoteCommand("prev")
            return .success
        }
        cc.changePlaybackPositionCommand.isEnabled = true
        cc.changePlaybackPositionCommand.addTarget { [weak self] event in
            if let posEvent = event as? MPChangePlaybackPositionCommandEvent {
                self?.sendRemoteCommand("seekTo", value: posEvent.positionTime)
                return .success
            }
            return .commandFailed
        }
    }

    private func sendRemoteCommand(_ cmd: String, value: Double? = nil) {
        guard let wv = currentWebView() else { return }
        if let v = value {
            wv.evaluateJavaScript("if (window.__fgRemoteCommand) window.__fgRemoteCommand('\(cmd)', \(v));", completionHandler: nil)
        } else {
            wv.evaluateJavaScript("if (window.__fgRemoteCommand) window.__fgRemoteCommand('\(cmd)');", completionHandler: nil)
        }
    }

    private func observeAppLifecycle() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onWillResignActive),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onDidEnterBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onWillEnterForeground),
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onAudioInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
    }

    @objc private func onWillResignActive() {
        // Khi người dùng bắt đầu vuốt thanh Home lên để thoát ra ngoài màn hình chính:
        // Kích hoạt ngay Авто-PiP (Hình-trong-hình tự động) mượt mà không chặn luồng UI
        if isAutoPiPEnabled() {
            currentWebView()?.evaluateJavaScript("if (window.__fgAutoEnterPiP) window.__fgAutoEnterPiP();", completionHandler: nil)
        }
    }

    @objc private func onDidEnterBackground() {
        configureAudioSession()
        if bgTask == .invalid {
            bgTask = UIApplication.shared.beginBackgroundTask(withName: "FUNNYGAMEAudioKeepAlive") { [weak self] in
                if let task = self?.bgTask, task != .invalid {
                    UIApplication.shared.endBackgroundTask(task)
                    self?.bgTask = .invalid
                }
            }
        }
        // Tự động tiếp tục phát nhạc nền nếu không ở chế độ PiP và người dùng đang phát video trước khi khoá máy
        if isBackgroundPlayEnabled() {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) { [weak self] in
                self?.currentWebView()?.evaluateJavaScript("""
                (function() {
                    if (window.__fgShouldKeepPlaying && window.__fgShouldKeepPlaying()) {
                        var v = document.querySelector('video.html5-main-video, video, audio');
                        if (v && v.paused && !v.ended && v.webkitPresentationMode !== 'picture-in-picture') {
                            v.play().catch(function(){});
                        }
                    }
                })();
                """, completionHandler: nil)
            }
        }
    }

    @objc private func onWillEnterForeground() {
        if bgTask != .invalid {
            UIApplication.shared.endBackgroundTask(bgTask)
            bgTask = .invalid
        }
    }

    @objc private func onDidBecomeActive() {
        // Khi quay lại ứng dụng FUNNYGAME: tự động thu khung PiP về lại trong trang mượt mà
        currentWebView()?.evaluateJavaScript("if (window.__fgAutoExitPiP) window.__fgAutoExitPiP();", completionHandler: nil)
    }

    @objc private func onAudioInterruption(_ notification: Notification) {
        guard let info = notification.userInfo,
              let typeVal = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeVal) else { return }
        if type == .ended {
            configureAudioSession()
            if isBackgroundPlayEnabled() {
                sendRemoteCommand("play")
            }
        }
    }

    private func isBackgroundPlayEnabled() -> Bool {
        let raw = getStoredJson(storageKeyLocal)
        guard let data = raw.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return true }
        if let enabled = dict["enabled"] as? Bool, !enabled { return false }
        if let settings = dict["settings"] as? [String: Any],
           let bg = settings["backgroundPlay"] as? Bool {
            return bg
        }
        return true
    }

    private func isAutoPiPEnabled() -> Bool {
        let raw = getStoredJson(storageKeyLocal)
        guard let data = raw.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return true }
        if let enabled = dict["enabled"] as? Bool, !enabled { return false }
        if let settings = dict["settings"] as? [String: Any],
           let pip = settings["pipButton"] as? Bool {
            return pip
        }
        return true
    }

    // ---------- Đọc tài nguyên (Có bộ đệm RAM chống giật lag) & Lưu trữ UserDefaults ----------
    private func readResString(_ name: String) -> String {
        if let cached = resCache["str:" + name] {
            return cached
        }
        if let path = Bundle.main.path(forResource: name, ofType: nil, inDirectory: "fg-ext"),
           let content = try? String(contentsOfFile: path, encoding: .utf8) {
            resCache["str:" + name] = content
            return content
        }
        if let path = Bundle.main.path(forResource: name, ofType: nil),
           let content = try? String(contentsOfFile: path, encoding: .utf8) {
            resCache["str:" + name] = content
            return content
        }
        return ""
    }

    private func readResBase64(_ name: String, mime: String) -> String {
        let cacheKey = "b64:" + name
        if let cached = resCache[cacheKey] {
            return cached
        }
        let paths = [
            Bundle.main.path(forResource: name, ofType: nil, inDirectory: "fg-ext/images"),
            Bundle.main.path(forResource: name, ofType: nil, inDirectory: "images"),
            Bundle.main.path(forResource: name, ofType: nil),
        ]
        for p in paths {
            if let validPath = p, let data = try? Data(contentsOf: URL(fileURLWithPath: validPath)) {
                let out = "data:\(mime);base64," + data.base64EncodedString()
                resCache[cacheKey] = out
                return out
            }
        }
        return ""
    }

    private func getStoredJson(_ key: String) -> String {
        return UserDefaults.standard.string(forKey: key) ?? "{}"
    }

    private func mergeStoredJson(_ key: String, patch: [String: Any]) {
        let raw = getStoredJson(key)
        var dict: [String: Any] = [:]
        if let data = raw.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            dict = parsed
        }
        for (k, v) in patch {
            dict[k] = v
        }
        if let outData = try? JSONSerialization.data(withJSONObject: dict),
           let outStr = String(data: outData, encoding: .utf8) {
            UserDefaults.standard.set(outStr, forKey: key)
        }
    }

    private func removeStoredKeys(_ key: String, keys: [String]) {
        let raw = getStoredJson(key)
        var dict: [String: Any] = [:]
        if let data = raw.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            dict = parsed
        }
        for k in keys {
            dict.removeValue(forKey: k)
        }
        if let outData = try? JSONSerialization.data(withJSONObject: dict),
           let outStr = String(data: outData, encoding: .utf8) {
            UserDefaults.standard.set(outStr, forKey: key)
        }
    }

    private func updateBadgeFromStorage() {
        let raw = getStoredJson(storageKeyLocal)
        guard let data = raw.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        let count = (dict["adsBlocked"] as? Int) ?? 0
        let enabled = (dict["enabled"] as? Bool) ?? true
        updateBadgeUI(count: count, enabled: enabled)
    }

    private func updateBadgeUI(count: Int, enabled: Bool) {
        guard badgeLabel != nil else { return }
        if !enabled {
            badgeLabel.text = "TẮT"
            badgeLabel.backgroundColor = UIColor(white: 0.35, alpha: 1.0)
            badgeLabel.isHidden = false
        } else if count > 0 {
            badgeLabel.text = count > 999 ? "999+" : "\(count)"
            badgeLabel.backgroundColor = UIColor(red: 1.0, green: 0.24, blue: 0.32, alpha: 1.0)
            badgeLabel.isHidden = false
        } else {
            badgeLabel.isHidden = true
        }
    }

    // ---------- Khởi tạo WKUserContentController & Tiêm Script Chặn QC ----------
    private func buildBootstrapScript(mainUrl: String) -> String {
        let localJson = getStoredJson(storageKeyLocal)
        let sessionJson = getStoredJson(storageKeySession)
        var logoDataUrl = readResBase64("fg-logo-ios.png", mime: "image/png")
        if logoDataUrl.isEmpty {
            logoDataUrl = readResBase64("fg-logo-yt.png", mime: "image/png")
        }
        let ytLogoDataUrl = readResBase64("fg-logo-yt.png", mime: "image/png")
        let iconDataUrl = readResBase64("icon48.png", mime: "image/png")
        let safeMainUrl = mainUrl.replacingOccurrences(of: "\"", with: "\\\"")
        return """
        window.__FG_IOS_INITIAL_STORAGE__ = \(localJson);
        window.__FG_IOS_INITIAL_SESSION__ = \(sessionJson);
        window.__FG_IOS_VERSION__ = "2.4.15";
        window.__FG_IOS_MAIN_URL__ = "\(safeMainUrl)";
        window.__FG_IOS_LOGO_DATA_URL__ = "\(logoDataUrl)";
        window.__FG_IOS_YT_LOGO_DATA_URL__ = "\(ytLogoDataUrl)";
        window.__FG_IOS_ICON_DATA_URL__ = "\(iconDataUrl)";
        """
    }

    private func buildCssInjectionScript(_ cssText: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [cssText]),
              let arrStr = String(data: data, encoding: .utf8) else {
            return ""
        }
        return """
        (function() {
            var css = (\(arrStr))[0];
            function inject() {
                if (document.getElementById('__fg_ios_css')) return;
                var s = document.createElement('style');
                s.id = '__fg_ios_css';
                s.textContent = css;
                (document.head || document.documentElement).appendChild(s);
            }
            if (document.head || document.documentElement) inject();
            else document.addEventListener('DOMContentLoaded', inject, { once: true });
        })();
        """
    }

    private func makeUserContentController(forPanel: Bool) -> WKUserContentController {
        let ucc = WKUserContentController()
        ucc.add(self, name: "fgBridge")

        let currentUrl = currentWebView()?.url?.absoluteString ?? tabUrls[activeTabIndex]
        let bootstrap = buildBootstrapScript(mainUrl: currentUrl)
        let bridgeJs = readResString("chrome-bridge.js")
        let licenseJs = readResString("license.js")

        ucc.addUserScript(WKUserScript(
            source: bootstrap + "\n" + bridgeJs + "\n" + licenseJs,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        if !forPanel {
            if let cached = cachedCombinedScript {
                ucc.addUserScript(cached)
            } else {
                let cssCombined = readResString("content.css") + "\n" + readResString("mobile.css")
                let cssScript = buildCssInjectionScript(cssCombined)
                let ytNetJs = readResString("content-yt-net.js")
                let ytMainJs = readResString("content-main.js")
                let ytContentJs = readResString("content.js")
                let spMainJs = readResString("content-spotify-main.js")
                let spContentJs = readResString("content.spotify.js").isEmpty ? readResString("content-spotify.js") : readResString("content.spotify.js")
                let mobileUiJs = readResString("mobile-ui.js")

                let combinedStart = """
                if (/youtube\\.com/i.test(location.hostname)) {
                    \(cssScript)
                    \(ytNetJs)
                    \(ytMainJs)
                    \(ytContentJs)
                    \(mobileUiJs)
                } else if (/spotify\\.com/i.test(location.hostname)) {
                    \(cssScript)
                    \(spMainJs)
                    \(spContentJs)
                    \(mobileUiJs)
                }
                """
                let script = WKUserScript(
                    source: combinedStart,
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true
                )
                cachedCombinedScript = script
                ucc.addUserScript(script)
            }
        }
        return ucc
    }

    // ---------- Giao diện chính & Đa Tab độc lập ----------
    private func setupLayout() {
        contentContainer = UIView()
        contentContainer.translatesAutoresizingMaskIntoConstraints = false
        contentContainer.backgroundColor = UIColor(red: 0.05, green: 0.05, blue: 0.07, alpha: 1.0)
        view.addSubview(contentContainer)

        progressView = UIProgressView(progressViewStyle: .bar)
        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.progressTintColor = UIColor(red: 1.0, green: 0.25, blue: 0.35, alpha: 1.0)
        progressView.trackTintColor = .clear
        progressView.alpha = 0
        view.addSubview(progressView)

        let blur = UIBlurEffect(style: .systemChromeMaterialDark)
        bottomBar = UIVisualEffectView(effect: blur)
        bottomBar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bottomBar)

        let topBorder = UIView()
        topBorder.translatesAutoresizingMaskIntoConstraints = false
        topBorder.backgroundColor = UIColor(white: 1.0, alpha: 0.12)
        bottomBar.contentView.addSubview(topBorder)

        let stack = UIStackView()
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.alignment = .fill
        bottomBar.contentView.addSubview(stack)

        let items: [(String, String, Selector)] = [
            ("play.rectangle.fill", "YouTube", #selector(onTapYouTube)),
            ("waveform.circle.fill", "YT Music", #selector(onTapMusic)),
            ("headphones", "Spotify", #selector(onTapSpotify)),
            ("pip.enter", "PiP", #selector(onTapPiP)),
            ("shield.lefthalf.filled", "Chặn QC", #selector(onTapPanel)),
        ]

        let activeColor = UIColor(red: 1.0, green: 0.27, blue: 0.35, alpha: 1.0)
        let inactiveColor = UIColor(white: 0.72, alpha: 1.0)
        let symCfg = UIImage.SymbolConfiguration(pointSize: 16.5, weight: .semibold)

        for (idx, item) in items.enumerated() {
            let btn = UIButton(type: .system)
            btn.tag = idx
            let color = (idx == 0) ? activeColor : inactiveColor
            btn.tintColor = color

            let vStack = UIStackView()
            vStack.axis = .vertical
            vStack.alignment = .center
            vStack.spacing = 3
            vStack.isUserInteractionEnabled = false
            vStack.translatesAutoresizingMaskIntoConstraints = false

            let iconView = UIImageView()
            iconView.tag = 101
            iconView.image = UIImage(systemName: item.0, withConfiguration: symCfg)
            iconView.tintColor = color
            iconView.contentMode = .scaleAspectFit

            let titleLbl = UILabel()
            titleLbl.tag = 102
            titleLbl.text = item.1
            titleLbl.font = UIFont.systemFont(ofSize: 10.5, weight: idx == 0 ? .bold : .medium)
            titleLbl.textColor = color

            vStack.addArrangedSubview(iconView)
            vStack.addArrangedSubview(titleLbl)
            btn.addSubview(vStack)

            NSLayoutConstraint.activate([
                vStack.centerXAnchor.constraint(equalTo: btn.centerXAnchor),
                vStack.centerYAnchor.constraint(equalTo: btn.centerYAnchor, constant: 1),
                iconView.heightAnchor.constraint(equalToConstant: 20),
            ])

            btn.addTarget(self, action: item.2, for: .touchUpInside)
            stack.addArrangedSubview(btn)
            tabButtons.append(btn)

            if idx == 4 {
                let badge = UILabel()
                badge.translatesAutoresizingMaskIntoConstraints = false
                badge.font = UIFont.systemFont(ofSize: 9.5, weight: .bold)
                badge.textColor = .white
                badge.textAlignment = .center
                badge.backgroundColor = UIColor(red: 1.0, green: 0.24, blue: 0.32, alpha: 1.0)
                badge.layer.cornerRadius = 8
                badge.layer.masksToBounds = true
                badge.isHidden = true
                btn.addSubview(badge)
                NSLayoutConstraint.activate([
                    badge.topAnchor.constraint(equalTo: btn.topAnchor, constant: 3),
                    badge.trailingAnchor.constraint(equalTo: btn.trailingAnchor, constant: -8),
                    badge.heightAnchor.constraint(equalToConstant: 16),
                    badge.widthAnchor.constraint(greaterThanOrEqualToConstant: 18),
                ])
                badgeLabel = badge
            }
        }

        bottomBarHeightConstraint = stack.heightAnchor.constraint(equalToConstant: 54)

        NSLayoutConstraint.activate([
            contentContainer.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            contentContainer.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            contentContainer.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            contentContainer.bottomAnchor.constraint(equalTo: bottomBar.topAnchor),

            progressView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressView.heightAnchor.constraint(equalToConstant: 2),

            bottomBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottomBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottomBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            topBorder.topAnchor.constraint(equalTo: bottomBar.contentView.topAnchor),
            topBorder.leadingAnchor.constraint(equalTo: bottomBar.contentView.leadingAnchor),
            topBorder.trailingAnchor.constraint(equalTo: bottomBar.contentView.trailingAnchor),
            topBorder.heightAnchor.constraint(equalToConstant: 0.5),

            stack.topAnchor.constraint(equalTo: bottomBar.contentView.topAnchor),
            stack.leadingAnchor.constraint(equalTo: bottomBar.contentView.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: bottomBar.contentView.trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            bottomBarHeightConstraint,
        ])
    }

    private func getOrCreateWebView(for index: Int) -> WKWebView {
        if let existing = webViews[index] {
            return existing
        }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController = makeUserContentController(forPanel: false)
        config.allowsInlineMediaPlayback = true
        config.allowsPictureInPictureMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptCanOpenWindowsAutomatically = true

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.translatesAutoresizingMaskIntoConstraints = false
        wv.navigationDelegate = self
        wv.uiDelegate = self
        wv.allowsBackForwardNavigationGestures = true
        wv.backgroundColor = UIColor(red: 0.05, green: 0.05, blue: 0.07, alpha: 1.0)
        wv.scrollView.backgroundColor = wv.backgroundColor
        wv.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"

        // Kéo xuống để tải lại trang (Pull-to-Refresh)
        let rc = UIRefreshControl()
        rc.tintColor = UIColor(red: 1.0, green: 0.30, blue: 0.36, alpha: 1.0)
        rc.addTarget(self, action: #selector(onPullToRefresh(_:)), for: .valueChanged)
        wv.scrollView.refreshControl = rc

        contentContainer.addSubview(wv)
        NSLayoutConstraint.activate([
            wv.topAnchor.constraint(equalTo: contentContainer.topAnchor),
            wv.leadingAnchor.constraint(equalTo: contentContainer.leadingAnchor),
            wv.trailingAnchor.constraint(equalTo: contentContainer.trailingAnchor),
            wv.bottomAnchor.constraint(equalTo: contentContainer.bottomAnchor),
        ])

        let obs = wv.observe(\.estimatedProgress, options: [.new]) { [weak self] webView, _ in
            guard let self = self, webView === self.currentWebView() else { return }
            let p = Float(webView.estimatedProgress)
            self.progressView.alpha = (p > 0.02 && p < 0.99) ? 1.0 : 0.0
            self.progressView.setProgress(p, animated: true)
        }
        progressObservations[index] = obs
        webViews[index] = wv

        if let url = URL(string: tabUrls[index]) {
            wv.load(URLRequest(url: url))
        }
        return wv
    }

    private func currentWebView() -> WKWebView? {
        return webViews[activeTabIndex]
    }

    private func switchToTab(_ index: Int) {
        triggerHaptic(style: .light)
        closePanel()
        closeOAuth()

        // Nếu bấm lại vào tab đang mở -> cuộn lên đầu trang hoặc quay về trang chủ của tab đó
        if activeTabIndex == index, let existing = webViews[index] {
            highlightTab(index)
            if existing.scrollView.contentOffset.y > 120 {
                existing.scrollView.setContentOffset(.zero, animated: true)
            }
            return
        }

        activeTabIndex = index
        highlightTab(index)

        let targetWv = getOrCreateWebView(for: index)
        for (idx, wv) in webViews {
            wv.isHidden = (idx != index)
        }
        contentContainer.bringSubviewToFront(targetWv)
    }

    @objc private func onPullToRefresh(_ sender: UIRefreshControl) {
        triggerHaptic(style: .light)
        currentWebView()?.reload()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            sender.endRefreshing()
        }
    }

    private func highlightTab(_ activeIdx: Int) {
        let activeColor = UIColor(red: 1.0, green: 0.27, blue: 0.35, alpha: 1.0)
        let inactiveColor = UIColor(white: 0.72, alpha: 1.0)
        for (idx, btn) in tabButtons.enumerated() {
            let active = (idx == activeIdx)
            let color = active ? activeColor : inactiveColor
            btn.tintColor = color
            if let iconView = btn.viewWithTag(101) as? UIImageView {
                iconView.tintColor = color
            }
            if let titleLbl = btn.viewWithTag(102) as? UILabel {
                titleLbl.textColor = color
                titleLbl.font = UIFont.systemFont(ofSize: 10.5, weight: active ? .bold : .medium)
            }
            if active {
                UIView.animate(withDuration: 0.12, animations: {
                    btn.transform = CGAffineTransform(scaleX: 0.92, y: 0.92)
                }) { _ in
                    UIView.animate(withDuration: 0.22, delay: 0, usingSpringWithDamping: 0.55, initialSpringVelocity: 0.8, options: [], animations: {
                        btn.transform = .identity
                    }, completion: nil)
                }
            }
        }
    }

    @objc private func onTapYouTube() { switchToTab(0) }
    @objc private func onTapMusic() { switchToTab(1) }
    @objc private func onTapSpotify() { switchToTab(2) }

    @objc private func onTapPiP() {
        triggerHaptic(style: .medium)
        guard let wv = currentWebView() else { return }
        wv.evaluateJavaScript("window.__fgTogglePiP ? window.__fgTogglePiP() : 'no-video';") { [weak self] res, _ in
            let state = (res as? String) ?? ""
            if state == "no-video" {
                self?.showToast("Hãy phát 1 video trước khi bật Hình-trong-hình (PiP)")
            } else if state == "picture-in-picture" {
                self?.showToast("📺 Đã bật chế độ Hình-trong-hình (PiP)")
            }
        }
    }

    @objc private func onTapPanel() {
        triggerHaptic(style: .light)
        if let c = panelContainer, !c.isHidden {
            closePanel()
            highlightTab(activeTabIndex)
        } else {
            openPanel(page: currentPanelPage.isEmpty ? "popup.html" : currentPanelPage)
        }
    }

    private func triggerHaptic(style: UIImpactFeedbackGenerator.FeedbackStyle) {
        let gen = UIImpactFeedbackGenerator(style: style)
        gen.prepare()
        gen.impactOccurred()
    }

    private func showToast(_ text: String) {
        let lbl = UILabel()
        lbl.translatesAutoresizingMaskIntoConstraints = false
        lbl.text = "  \(text)  "
        lbl.font = UIFont.systemFont(ofSize: 13, weight: .semibold)
        lbl.textColor = .white
        lbl.backgroundColor = UIColor(red: 0.12, green: 0.12, blue: 0.16, alpha: 0.95)
        lbl.layer.cornerRadius = 16
        lbl.layer.masksToBounds = true
        lbl.alpha = 0
        view.addSubview(lbl)

        NSLayoutConstraint.activate([
            lbl.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            lbl.bottomAnchor.constraint(equalTo: bottomBar.topAnchor, constant: -16),
            lbl.heightAnchor.constraint(equalToConstant: 34),
        ])

        UIView.animate(withDuration: 0.2, animations: { lbl.alpha = 1 }) { _ in
            UIView.animate(withDuration: 0.25, delay: 1.8, options: [], animations: { lbl.alpha = 0 }) { _ in
                lbl.removeFromSuperview()
            }
        }
    }

    // ---------- Chặn Deep-Link sang App YouTube / Spotify gốc & Hỗ trợ OAuth Google ----------
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        let scheme = (url.scheme ?? "").lowercased()
        let host = (url.host ?? "").lowercased()

        // Chặn tuyệt đối các scheme nhảy ra App YouTube / Spotify gốc hoặc App Store
        if ["vnd.youtube", "youtube", "youtubemusic", "spotify", "itms-apps", "itms-appss", "intent"].contains(scheme) {
            decisionHandler(.cancel)
            return
        }
        if host.contains("apps.apple.com") || host.contains("itunes.apple.com") || host.contains("app.adjust.com") || host.contains("spotify.link") {
            decisionHandler(.cancel)
            return
        }

        // Nếu đang ở cửa sổ OAuth Google và đã đăng nhập xong quay về YouTube/Spotify -> đóng cửa sổ OAuth và tải lại tab chính
        if webView === oauthWebView {
            if host.contains("youtube.com") || host.contains("spotify.com") {
                closeOAuth()
                currentWebView()?.reload()
                decisionHandler(.cancel)
                return
            }
        }

        // Sử dụng cờ nội bộ _WKNavigationActionPolicyAllowWithoutTryingAppLink (rawValue = 3)
        // để iOS KHÔNG tự bung sang ứng dụng YouTube/Spotify cài trên máy khi bấm Universal Link
        if let noAppLinkPolicy = WKNavigationActionPolicy(rawValue: WKNavigationActionPolicy.allow.rawValue + 2) {
            decisionHandler(noAppLinkPolicy)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        let host = (url.host ?? "").lowercased()

        // Nếu là luồng đăng nhập Google / Spotify / Apple -> mở cửa sổ OAuth cùng session
        if host.contains("accounts.google.com") || host.contains("accounts.spotify.com") || host.contains("appleid.apple.com") || host.contains("facebook.com") {
            return openOAuthPopup(with: configuration, request: navigationAction.request)
        }

        // Các link target="_blank" thông thường -> mở ngay trong tab hiện tại
        webView.load(navigationAction.request)
        return nil
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView === oauthWebView {
            closeOAuth()
            currentWebView()?.reload()
        }
    }

    private func openOAuthPopup(with configuration: WKWebViewConfiguration, request: URLRequest) -> WKWebView {
        closeOAuth()
        let container = UIView()
        container.translatesAutoresizingMaskIntoConstraints = false
        container.backgroundColor = UIColor(red: 0.06, green: 0.06, blue: 0.08, alpha: 1.0)

        let header = UIView()
        header.translatesAutoresizingMaskIntoConstraints = false
        header.backgroundColor = UIColor(red: 0.10, green: 0.10, blue: 0.14, alpha: 1.0)

        let titleLbl = UILabel()
        titleLbl.translatesAutoresizingMaskIntoConstraints = false
        titleLbl.text = "Đăng nhập tài khoản"
        titleLbl.font = UIFont.systemFont(ofSize: 15, weight: .bold)
        titleLbl.textColor = .white

        let closeBtn = UIButton(type: .system)
        closeBtn.translatesAutoresizingMaskIntoConstraints = false
        closeBtn.setTitle("Đóng ✕", for: .normal)
        closeBtn.titleLabel?.font = UIFont.systemFont(ofSize: 14, weight: .semibold)
        closeBtn.setTitleColor(UIColor(red: 1.0, green: 0.35, blue: 0.40, alpha: 1.0), for: .normal)
        closeBtn.addTarget(self, action: #selector(closeOAuth), for: .touchUpInside)

        header.addSubview(titleLbl)
        header.addSubview(closeBtn)

        let popupWv = WKWebView(frame: .zero, configuration: configuration)
        popupWv.translatesAutoresizingMaskIntoConstraints = false
        popupWv.navigationDelegate = self
        popupWv.uiDelegate = self
        popupWv.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"

        container.addSubview(header)
        container.addSubview(popupWv)
        view.insertSubview(container, belowSubview: bottomBar)

        NSLayoutConstraint.activate([
            container.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            container.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            container.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            container.bottomAnchor.constraint(equalTo: bottomBar.topAnchor),
            header.topAnchor.constraint(equalTo: container.topAnchor),
            header.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 44),
            titleLbl.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            titleLbl.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 16),
            closeBtn.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            closeBtn.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -16),
            popupWv.topAnchor.constraint(equalTo: header.bottomAnchor),
            popupWv.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            popupWv.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            popupWv.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])

        oauthContainer = container
        oauthWebView = popupWv
        popupWv.load(request)
        return popupWv
    }

    @objc private func closeOAuth() {
        oauthContainer?.removeFromSuperview()
        oauthContainer = nil
        oauthWebView = nil
    }

    // ---------- Bảng điều khiển FUNNYGAME (Popup / Thống kê / Cài đặt) ----------
    private func buildPanelHtml(page: String) -> String {
        let cleanPage = page.components(separatedBy: "?").first ?? "popup.html"
        var html = readResString(cleanPage)
        if html.isEmpty { html = readResString("popup.html") }

        let cssName = cleanPage.replacingOccurrences(of: ".html", with: ".css")
        let jsName = cleanPage.replacingOccurrences(of: ".html", with: ".js")
        let cssContent = readResString(cssName) + "\n" + (cleanPage == "popup.html" ? readResString("popup-mobile.css") : "")
        let jsContent = readResString(jsName)
        var logoData = readResBase64("fg-logo-ios.png", mime: "image/png")
        if logoData.isEmpty { logoData = readResBase64("logo.gif", mime: "image/gif") }
        if logoData.isEmpty { logoData = readResBase64("icon128.png", mime: "image/png") }
        let iconData = readResBase64("icon48.png", mime: "image/png").isEmpty ? logoData : readResBase64("icon48.png", mime: "image/png")

        html = html.replacingOccurrences(of: "./images/logo.gif", with: logoData)
        html = html.replacingOccurrences(of: "images/logo.gif", with: logoData)
        html = html.replacingOccurrences(of: "./images/fg-logo-ios.png", with: logoData)
        html = html.replacingOccurrences(of: "images/fg-logo-ios.png", with: logoData)
        html = html.replacingOccurrences(of: "./images/logo.png", with: logoData)
        html = html.replacingOccurrences(of: "images/logo.png", with: logoData)
        html = html.replacingOccurrences(of: "images/icon128.png", with: logoData)
        html = html.replacingOccurrences(of: "images/icon48.png", with: iconData)
        html = html.replacingOccurrences(of: "<link rel=\"stylesheet\" href=\"\(cssName)\" />", with: "<style>\(cssContent)</style>")
        html = html.replacingOccurrences(of: "<link rel=\"stylesheet\" href=\"popup-mobile.css\" />", with: "")
        html = html.replacingOccurrences(of: "<script src=\"license.js\"></script>", with: "")
        html = html.replacingOccurrences(of: "<script src=\"\(jsName)\"></script>", with: "<script>\(jsContent)</script>")
        return html
    }

    private func openPanel(page: String) {
        highlightTab(4)
        let isNewSheet = (panelContainer == nil)
        if panelContainer == nil {
            let container = UIView()
            container.translatesAutoresizingMaskIntoConstraints = false
            container.backgroundColor = UIColor(red: 0.05, green: 0.06, blue: 0.10, alpha: 0.99)
            container.layer.cornerRadius = 24
            container.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
            container.layer.masksToBounds = true
            container.layer.borderWidth = 0.5
            container.layer.borderColor = UIColor(white: 1.0, alpha: 0.14).cgColor

            let header = UIView()
            header.translatesAutoresizingMaskIntoConstraints = false
            header.backgroundColor = UIColor(red: 0.08, green: 0.09, blue: 0.15, alpha: 1.0)

            // Thanh nắm kéo chuẩn iOS Sheet (Grabber Pill)
            let grabber = UIView()
            grabber.translatesAutoresizingMaskIntoConstraints = false
            grabber.backgroundColor = UIColor(white: 1.0, alpha: 0.28)
            grabber.layer.cornerRadius = 2.5
            header.addSubview(grabber)

            // Logo Squircle FUNNYGAME chuẩn iPhone trên thanh Sheet Header
            let logoImgView = UIImageView()
            logoImgView.translatesAutoresizingMaskIntoConstraints = false
            logoImgView.layer.cornerRadius = 7
            logoImgView.layer.masksToBounds = true
            logoImgView.contentMode = .scaleAspectFill
            if let path = Bundle.main.path(forResource: "fg-logo-ios.png", ofType: nil, inDirectory: "fg-ext/images") ?? Bundle.main.path(forResource: "icon128.png", ofType: nil, inDirectory: "fg-ext/images") {
                logoImgView.image = UIImage(contentsOfFile: path)
            }
            header.addSubview(logoImgView)

            let seg = UISegmentedControl(items: ["Điều khiển", "Xếp hạng", "Cài đặt"])
            seg.translatesAutoresizingMaskIntoConstraints = false
            seg.selectedSegmentIndex = 0
            seg.selectedSegmentTintColor = UIColor(red: 1.0, green: 0.26, blue: 0.34, alpha: 1.0)
            seg.setTitleTextAttributes([.foregroundColor: UIColor.white, .font: UIFont.systemFont(ofSize: 12.0, weight: .semibold)], for: .normal)
            seg.setTitleTextAttributes([.foregroundColor: UIColor.white, .font: UIFont.systemFont(ofSize: 12.0, weight: .bold)], for: .selected)
            seg.addTarget(self, action: #selector(onPanelSegmentChanged(_:)), for: .valueChanged)

            let closeBtn = UIButton(type: .system)
            closeBtn.translatesAutoresizingMaskIntoConstraints = false
            closeBtn.setTitle("Đóng ✕", for: .normal)
            closeBtn.titleLabel?.font = UIFont.systemFont(ofSize: 13.0, weight: .bold)
            closeBtn.setTitleColor(UIColor(red: 1.0, green: 0.35, blue: 0.4, alpha: 1.0), for: .normal)
            closeBtn.addTarget(self, action: #selector(onClosePanelTapped), for: .touchUpInside)

            header.addSubview(seg)
            header.addSubview(closeBtn)

            // Hỗ trợ vuốt xuống thanh Header để đóng Sheet như App iOS gốc
            let pan = UIPanGestureRecognizer(target: self, action: #selector(onSheetHeaderPan(_:)))
            header.addGestureRecognizer(pan)

            let cfg = WKWebViewConfiguration()
            cfg.userContentController = makeUserContentController(forPanel: true)
            let pWeb = WKWebView(frame: .zero, configuration: cfg)
            pWeb.translatesAutoresizingMaskIntoConstraints = false
            pWeb.backgroundColor = .clear
            pWeb.isOpaque = false
            pWeb.scrollView.backgroundColor = .clear

            container.addSubview(header)
            container.addSubview(pWeb)
            view.insertSubview(container, belowSubview: bottomBar)

            NSLayoutConstraint.activate([
                container.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 6),
                container.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                container.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                container.bottomAnchor.constraint(equalTo: bottomBar.topAnchor),
                header.topAnchor.constraint(equalTo: container.topAnchor),
                header.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                header.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                header.heightAnchor.constraint(equalToConstant: 56),
                grabber.topAnchor.constraint(equalTo: header.topAnchor, constant: 6),
                grabber.centerXAnchor.constraint(equalTo: header.centerXAnchor),
                grabber.widthAnchor.constraint(equalToConstant: 38),
                grabber.heightAnchor.constraint(equalToConstant: 5),
                logoImgView.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 12),
                logoImgView.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -9),
                logoImgView.widthAnchor.constraint(equalToConstant: 28),
                logoImgView.heightAnchor.constraint(equalToConstant: 28),
                seg.centerYAnchor.constraint(equalTo: logoImgView.centerYAnchor),
                seg.leadingAnchor.constraint(equalTo: logoImgView.trailingAnchor, constant: 8),
                seg.trailingAnchor.constraint(lessThanOrEqualTo: closeBtn.leadingAnchor, constant: -8),
                closeBtn.centerYAnchor.constraint(equalTo: logoImgView.centerYAnchor),
                closeBtn.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -12),
                pWeb.topAnchor.constraint(equalTo: header.bottomAnchor),
                pWeb.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                pWeb.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                pWeb.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            ])

            panelContainer = container
            panelWebView = pWeb
            panelSegment = seg
        }

        if page.contains("stats") {
            panelSegment?.selectedSegmentIndex = 1
        } else if page.contains("options") {
            panelSegment?.selectedSegmentIndex = 2
        } else {
            panelSegment?.selectedSegmentIndex = 0
        }

        let wasHidden = panelContainer?.isHidden ?? false
        panelContainer?.isHidden = false

        // Chỉ nạp lại HTML khi đổi tab con (Điều khiển / Xếp hạng / Cài đặt) để mở Sheet trong 0ms không giật
        if currentPanelPage != page {
            currentPanelPage = page
            let html = buildPanelHtml(page: page)
            panelWebView?.loadHTMLString(html, baseURL: URL(string: "https://m.youtube.com/funnygame-panel"))
        }

        if (isNewSheet || wasHidden), let c = panelContainer {
            c.transform = CGAffineTransform(translationX: 0, y: view.bounds.height * 0.35)
            c.alpha = 0
            UIView.animate(withDuration: 0.26, delay: 0, usingSpringWithDamping: 0.88, initialSpringVelocity: 0.9, options: [.curveEaseOut, .allowUserInteraction], animations: {
                c.transform = .identity
                c.alpha = 1
            }, completion: nil)
        }
    }

    @objc private func onSheetHeaderPan(_ gesture: UIPanGestureRecognizer) {
        guard let c = panelContainer else { return }
        let dy = max(0, gesture.translation(in: view).y)
        switch gesture.state {
        case .changed:
            c.transform = CGAffineTransform(translationX: 0, y: dy)
        case .ended, .cancelled:
            let vy = gesture.velocity(in: view).y
            if dy > 110 || vy > 650 {
                onClosePanelTapped()
            } else {
                UIView.animate(withDuration: 0.22, delay: 0, usingSpringWithDamping: 0.88, initialSpringVelocity: 0.5, options: [.allowUserInteraction], animations: {
                    c.transform = .identity
                }, completion: nil)
            }
        default:
            break
        }
    }

    @objc private func onPanelSegmentChanged(_ sender: UISegmentedControl) {
        triggerHaptic(style: .light)
        let pages = ["popup.html", "stats.html", "options.html"]
        let idx = max(0, min(sender.selectedSegmentIndex, pages.count - 1))
        openPanel(page: pages[idx])
    }

    @objc private func onClosePanelTapped() {
        triggerHaptic(style: .light)
        closePanel()
        highlightTab(activeTabIndex)
    }

    private func closePanel() {
        guard let c = panelContainer, !c.isHidden else { return }
        UIView.animate(withDuration: 0.2, delay: 0, options: [.curveEaseIn, .allowUserInteraction], animations: {
            c.transform = CGAffineTransform(translationX: 0, y: self.view.bounds.height * 0.35)
            c.alpha = 0
        }) { _ in
            c.isHidden = true
            c.transform = .identity
        }
    }

    // ---------- Nhận tin nhắn từ Cầu nối JavaScript (fgBridge) ----------
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "fgBridge",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        switch action {
        case "storageSet":
            let area = (body["area"] as? String) ?? "local"
            if let patch = body["patch"] as? [String: Any] {
                let key = (area == "session") ? storageKeySession : storageKeyLocal
                mergeStoredJson(key, patch: patch)
                updateBadgeFromStorage()
                if let data = try? JSONSerialization.data(withJSONObject: patch),
                   let jsonStr = String(data: data, encoding: .utf8) {
                    let js = "if (window.__fgOnExternalStorageChange) window.__fgOnExternalStorageChange(\(jsonStr), '\(area)');"
                    for (_, wv) in webViews where message.webView !== wv {
                        wv.evaluateJavaScript(js, completionHandler: nil)
                    }
                    if let pWeb = panelWebView, message.webView !== pWeb {
                        pWeb.evaluateJavaScript(js, completionHandler: nil)
                    }
                }
            }
        case "storageRemove":
            let area = (body["area"] as? String) ?? "local"
            if let keys = body["keys"] as? [String] {
                let key = (area == "session") ? storageKeySession : storageKeyLocal
                removeStoredKeys(key, keys: keys)
                updateBadgeFromStorage()
            }
        case "updateBadge":
            let count = (body["adsBlocked"] as? Int) ?? 0
            let enabled = (body["enabled"] as? Bool) ?? true
            updateBadgeUI(count: count, enabled: enabled)
        case "copyClipboard":
            if let text = body["text"] as? String {
                UIPasteboard.general.string = text
                triggerHaptic(style: .medium)
                showToast("📋 Đã chép dữ liệu vào bộ nhớ tạm")
            }
        case "haptic":
            triggerHaptic(style: .light)
        case "toast":
            if let text = body["text"] as? String {
                triggerHaptic(style: .light)
                showToast(text)
            }
        case "shareUrl":
            let urlStr = (body["url"] as? String) ?? (currentWebView()?.url?.absoluteString ?? "https://m.youtube.com")
            let title = (body["title"] as? String) ?? "FUNNYGAME iOS"
            triggerHaptic(style: .medium)
            var items: [Any] = [title]
            if let u = URL(string: urlStr) { items.append(u) }
            let avc = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let pop = avc.popoverPresentationController {
                pop.sourceView = self.view
                pop.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY, width: 1, height: 1)
            }
            self.present(avc, animated: true, completion: nil)
        case "nowPlaying":
            let title = (body["title"] as? String) ?? "FUNNYGAME"
            let artist = (body["artist"] as? String) ?? "YouTube"
            let duration = (body["duration"] as? Double) ?? 0
            let currentTime = (body["currentTime"] as? Double) ?? 0
            let rate = (body["rate"] as? Double) ?? 1.0
            var info: [String: Any] = [
                MPMediaItemPropertyTitle: title,
                MPMediaItemPropertyArtist: artist,
                MPNowPlayingInfoPropertyElapsedPlaybackTime: currentTime,
                MPNowPlayingInfoPropertyPlaybackRate: rate,
            ]
            if duration > 0 {
                info[MPMediaItemPropertyPlaybackDuration] = duration
            }
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        case "openPanel":
            let page = (body["page"] as? String) ?? "popup.html"
            openPanel(page: page)
        case "openUrl":
            if let urlStr = body["url"] as? String, let url = URL(string: urlStr) {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
            }
        case "sendMessageToMainTab":
            if let reqId = body["reqId"] as? String,
               let msgObj = body["msg"],
               let data = try? JSONSerialization.data(withJSONObject: msgObj),
               let msgJson = String(data: data, encoding: .utf8) {
                let safeReqId = reqId.replacingOccurrences(of: "'", with: "")
                let js = "if (window.__fgDispatchRuntimeMessage) window.__fgDispatchRuntimeMessage(\(msgJson), '\(safeReqId)');"
                currentWebView()?.evaluateJavaScript(js, completionHandler: nil)
            }
        case "tabMessageResponse":
            if let reqId = body["reqId"] as? String {
                let respObj = body["response"] ?? NSNull()
                if let data = try? JSONSerialization.data(withJSONObject: [respObj]),
                   let arrJson = String(data: data, encoding: .utf8) {
                    let safeReqId = reqId.replacingOccurrences(of: "'", with: "")
                    let js = "if (window.__fgResolveTabMessage) window.__fgResolveTabMessage('\(safeReqId)', (\(arrJson))[0]);"
                    panelWebView?.evaluateJavaScript(js, completionHandler: nil)
                }
            }
        default:
            break
        }
    }
}
