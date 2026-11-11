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
    private let storageQueue = DispatchQueue(label: "com.funnygame.storage", qos: .utility)
    private let sharedProcessPool = WKProcessPool()
    private let lightHaptic = UIImpactFeedbackGenerator(style: .light)
    private let mediumHaptic = UIImpactFeedbackGenerator(style: .medium)
    private var audioConfigured = false
    private var resCache: [String: String] = [:]
    private var cachedCombinedScript: WKUserScript?
    private var cachedContentRuleList: WKContentRuleList?
    private var cachedLocalDict: [String: Any] = [:]
    private var cachedSessionDict: [String: Any] = [:]
    private var cachedLocalJson: String = "{}"
    private var cachedSessionJson: String = "{}"
    private var terminateTimes: [TimeInterval] = []

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

        loadInitialStorageCache()
        configureDiagnostics()
        lightHaptic.prepare()
        mediumHaptic.prepare()
        compileNativeContentBlocker()
        configureAudioSession()
        configureRemoteCommands()
        observeAppLifecycle()

        setupLayout()
        updateBadgeFromStorage()
        switchToTab(0)

        // Khởi tạo ngầm Bảng điều khiển Cài đặt sau 1.2s khi CPU rảnh để lần bấm đầu tiên mở tức thì 120Hz (0ms trễ)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            self?.prewarmPanelIfNeeded()
        }
    }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        DiagLog.shared.record("memory_warning", ["tabs": webViews.count])
        resCache.removeAll()
        // Giải phóng các tab phụ đang ẩn nếu thiết bị thiếu RAM (giữ nguyên tab đang xem)
        for (idx, wv) in webViews where idx != activeTabIndex {
            progressObservations[idx]?.invalidate()
            progressObservations.removeValue(forKey: idx)
            wv.removeFromSuperview()
            webViews.removeValue(forKey: idx)
        }
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
        DiagLog.shared.flush()
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
        let optVal = (info[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0
        let shouldResume = AVAudioSession.InterruptionOptions(rawValue: optVal).contains(.shouldResume)
        DiagLog.shared.record("audio_interrupt", ["type": type == .began ? "began" : "ended", "resume": shouldResume])
        if type == .ended {
            configureAudioSession()
            if isBackgroundPlayEnabled() {
                sendRemoteCommand("play")
            }
        }
    }

    private func loadInitialStorageCache() {
        let rawLocal = UserDefaults.standard.string(forKey: storageKeyLocal) ?? "{}"
        cachedLocalJson = rawLocal
        if let data = rawLocal.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            cachedLocalDict = parsed
        }
        let rawSession = UserDefaults.standard.string(forKey: storageKeySession) ?? "{}"
        cachedSessionJson = rawSession
        if let data = rawSession.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            cachedSessionDict = parsed
        }
    }

    // ---------- Chặn Quảng cáo tầng Mạng C++ gốc của WebKit (WKContentRuleListStore) ----------
    // Chặn quảng cáo Spotify & Shopping từ tầng mạng mà KHÔNG động vào googlevideo (tránh lỗi 282054944)
    private func compileNativeContentBlocker() {
        let rulesJson = """
        [
          {
            "trigger": { "url-filter": "^https?://spclient\\\\.wg\\\\.spotify\\\\.com/(ads|ad-logic|gabo-receiver-service)/" },
            "action": { "type": "block" }
          },
          {
            "trigger": { "url-filter": "^https?://(adeventtracker|pixel)\\\\.spotify\\\\.com" },
            "action": { "type": "block" }
          },
          {
            "trigger": { "url-filter": "^https?://audio-fa\\\\.(scdn\\\\.co|spotifycdn\\\\.com)" },
            "action": { "type": "block" }
          },
          {
            "trigger": {
              "url-filter": "^https?://([a-z0-9-]+\\\\.)*(doubleclick\\\\.net|googlesyndication\\\\.com|googleadservices\\\\.com)",
              "if-domain": ["*open.spotify.com", "*play.spotify.com", "*spotify.com"]
            },
            "action": { "type": "block" }
          },
          {
            "trigger": {
              "url-filter": "^https?://([a-z0-9-]+\\\\.)*youtube\\\\.com/(api/stats/shopping|pagead/shopping|ptracking/shopping)"
            },
            "action": { "type": "block" }
          }
        ]
        """
        WKContentRuleListStore.default()?.compileContentRuleList(
            forIdentifier: "fg-ios-native-blocker-v2",
            encodedContentRuleList: rulesJson
        ) { [weak self] list, _ in
            guard let self = self, let ruleList = list else { return }
            self.cachedContentRuleList = ruleList
            for (_, wv) in self.webViews {
                wv.configuration.userContentController.add(ruleList)
            }
        }
    }

    private func isBackgroundPlayEnabled() -> Bool {
        if let enabled = cachedLocalDict["enabled"] as? Bool, !enabled { return false }
        if let settings = cachedLocalDict["settings"] as? [String: Any],
           let bg = settings["backgroundPlay"] as? Bool {
            return bg
        }
        return true
    }

    private func isAutoPiPEnabled() -> Bool {
        if let enabled = cachedLocalDict["enabled"] as? Bool, !enabled { return false }
        if let settings = cachedLocalDict["settings"] as? [String: Any],
           let pip = settings["pipButton"] as? Bool {
            return pip
        }
        return true
    }

    // ---------- Đọc tài nguyên (Có bộ đệm RAM chống giật lag) & Lưu trữ UserDefaults Bất đồng bộ ----------
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
        return (key == storageKeySession) ? cachedSessionJson : cachedLocalJson
    }

    private func persistDictAsync(_ dict: [String: Any], forKey key: String) {
        if let outData = try? JSONSerialization.data(withJSONObject: dict),
           let outStr = String(data: outData, encoding: .utf8) {
            if key == storageKeySession {
                cachedSessionJson = outStr
            } else {
                cachedLocalJson = outStr
            }
            storageQueue.async {
                UserDefaults.standard.set(outStr, forKey: key)
            }
        }
    }

    private func mergeStoredJson(_ key: String, patch: [String: Any]) {
        if key == storageKeySession {
            for (k, v) in patch { cachedSessionDict[k] = v }
            persistDictAsync(cachedSessionDict, forKey: key)
        } else {
            for (k, v) in patch { cachedLocalDict[k] = v }
            persistDictAsync(cachedLocalDict, forKey: key)
        }
    }

    private func removeStoredKeys(_ key: String, keys: [String]) {
        if key == storageKeySession {
            for k in keys { cachedSessionDict.removeValue(forKey: k) }
            persistDictAsync(cachedSessionDict, forKey: key)
        } else {
            for k in keys { cachedLocalDict.removeValue(forKey: k) }
            persistDictAsync(cachedLocalDict, forKey: key)
        }
    }

    private func updateBadgeFromStorage() {
        let count = (cachedLocalDict["adsBlocked"] as? Int) ?? 0
        let enabled = (cachedLocalDict["enabled"] as? Bool) ?? true
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
        let diagSchema = DiagLog.shared.schemaJSON
        let diagEnabled = DiagLog.shared.isEnabled ? "true" : "false"
        return """
        window.__FG_IOS_INITIAL_STORAGE__ = \(localJson);
        window.__FG_IOS_INITIAL_SESSION__ = \(sessionJson);
        window.__FG_IOS_VERSION__ = "2.4.15";
        window.__FG_IOS_MAIN_URL__ = "\(safeMainUrl)";
        window.__FG_IOS_LOGO_DATA_URL__ = "\(logoDataUrl)";
        window.__FG_IOS_YT_LOGO_DATA_URL__ = "\(ytLogoDataUrl)";
        window.__FG_IOS_ICON_DATA_URL__ = "\(iconDataUrl)";
        window.__FG_DIAG_SCHEMA__ = \(diagSchema);
        window.__FG_DIAG_ENABLED__ = \(diagEnabled);
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
        let diagJs = forPanel ? "" : readResString("diag.js")

        ucc.addUserScript(WKUserScript(
            source: bootstrap + "\n" + bridgeJs + "\n" + diagJs + "\n" + licenseJs,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))

        if !forPanel {
            if let ruleList = cachedContentRuleList {
                ucc.add(ruleList)
            }
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
            ("gearshape.fill", "Cài đặt", #selector(onTapPanel)),
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
        config.processPool = sharedProcessPool
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
        if style == .medium {
            mediumHaptic.impactOccurred()
        } else {
            lightHaptic.impactOccurred()
        }
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

    // ---------- Nhật ký chẩn đoán cục bộ (không dữ liệu nhận dạng — xem DiagLog & ios/diag-schema.json) ----------
    private func configureDiagnostics() {
        // Nạp schema TRƯỚC khi tạo WebView đầu tiên để bootstrap có sẵn schema cho JS
        DiagLog.shared.configure(schemaJSON: readResString("diag-schema.json"))
        let osParts = UIDevice.current.systemVersion.split(separator: ".").prefix(3).map { String($0) }
        let idiom: String
        switch UIDevice.current.userInterfaceIdiom {
        case .phone: idiom = "phone"
        case .pad: idiom = "pad"
        default: idiom = "other"
        }
        DiagLog.shared.record("app_launch")
        DiagLog.shared.record("env", ["os": osParts.joined(separator: "."), "idiom": idiom, "app": "2.4.15"])
    }

    private func tabIndex(for webView: WKWebView?) -> Int? {
        guard let webView = webView else { return nil }
        for (idx, wv) in webViews where wv === webView { return idx }
        return nil
    }

    private func tabName(for webView: WKWebView?) -> String {
        guard let webView = webView else { return "other" }
        if let p = panelWebView, p === webView { return "panel" }
        switch tabIndex(for: webView) {
        case .some(0): return "yt"
        case .some(1): return "music"
        case .some(2): return "spotify"
        default: return "other"
        }
    }

    private func isTabWebView(_ wv: WKWebView) -> Bool {
        return tabIndex(for: wv) != nil
    }

    /// Lệnh điều khiển nhật ký (xuất/xoá/bật-tắt/trạng thái) CHỈ được nhận từ bảng điều khiển native, không nhận từ trang web.
    private func isPanelMessage(_ message: WKScriptMessage) -> Bool {
        guard let p = panelWebView, let wv = message.webView else { return false }
        return wv === p
    }

    /// Sự kiện chẩn đoán từ JS chỉ chấp nhận khi trang đang ở YouTube/Spotify.
    private func isAllowedDiagHost(_ host: String?) -> Bool {
        guard let h = host?.lowercased() else { return false }
        for base in ["youtube.com", "spotify.com"] where h == base || h.hasSuffix("." + base) { return true }
        return false
    }

    private func pushDiagStatus() {
        DiagLog.shared.status { [weak self] count, bytes in
            let enabled = DiagLog.shared.isEnabled ? "true" : "false"
            let js = "if (window.__fgDiagStatus) window.__fgDiagStatus({enabled:\(enabled),count:\(count),bytes:\(bytes)});"
            self?.panelWebView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    private func broadcastDiagEnabled(_ on: Bool) {
        let flag = on ? "true" : "false"
        let js = "if (window.__fgDiagSetEnabled) window.__fgDiagSetEnabled(\(flag));"
        for (_, wv) in webViews { wv.evaluateJavaScript(js, completionHandler: nil) }
    }

    private func presentDiagExport() {
        DiagLog.shared.exportText { [weak self] text in
            guard let self = self else { return }
            let avc = UIActivityViewController(activityItems: [text], applicationActivities: nil)
            if let pop = avc.popoverPresentationController {
                pop.sourceView = self.view
                pop.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY, width: 1, height: 1)
            }
            self.present(avc, animated: true, completion: nil)
        }
    }

    // ---------- Vòng đời WKWebView: iOS kill tiến trình WebContent, lỗi điều hướng ----------
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // iOS kill tiến trình WebContent (thiếu RAM...): trang trắng/đơ. Tự nạp lại, nhưng chặn vòng lặp (>2 lần/30 giây).
        let now = Date().timeIntervalSince1970
        terminateTimes = terminateTimes.filter { now - $0 < 30 } + [now]
        let canReload = terminateTimes.count <= 2
        DiagLog.shared.record("web_terminated", ["tab": tabName(for: webView), "reloaded": canReload])
        guard canReload else { return }
        if let url = webView.url {
            webView.load(URLRequest(url: url))
        } else if let idx = tabIndex(for: webView), let fallback = URL(string: tabUrls[idx]) {
            webView.load(URLRequest(url: fallback))
        } else {
            webView.reload()
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        logNavFail(webView, error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        logNavFail(webView, error)
    }

    private func logNavFail(_ webView: WKWebView, _ error: Error) {
        let code = (error as NSError).code
        if code == NSURLErrorCancelled { return } // người dùng/trang tự huỷ điều hướng: không phải lỗi
        DiagLog.shared.record("nav_fail", ["tab": tabName(for: webView), "code": code])
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

    private func prewarmPanelIfNeeded() {
        guard panelContainer == nil else { return }
        ensurePanelCreated()
        panelContainer?.isHidden = true
        if currentPanelPage != "popup.html" {
            currentPanelPage = "popup.html"
            let html = buildPanelHtml(page: "popup.html")
            panelWebView?.loadHTMLString(html, baseURL: URL(string: "https://m.youtube.com/funnygame-panel"))
        }
    }

    private func ensurePanelCreated() {
        guard panelContainer == nil else { return }
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

        // Tiêu đề Bảng điều khiển Cài đặt gọn gàng (chỉ hiển thị Bảng điều khiển chính)
        let sheetTitle = UILabel()
        sheetTitle.translatesAutoresizingMaskIntoConstraints = false
        sheetTitle.text = "Bảng điều khiển · Cài đặt"
        sheetTitle.font = UIFont.systemFont(ofSize: 15.0, weight: .bold)
        sheetTitle.textColor = .white

        let closeBtn = UIButton(type: .system)
        closeBtn.translatesAutoresizingMaskIntoConstraints = false
        closeBtn.setTitle("Xong ✕", for: .normal)
        closeBtn.titleLabel?.font = UIFont.systemFont(ofSize: 13.5, weight: .bold)
        closeBtn.setTitleColor(UIColor(red: 0.38, green: 0.65, blue: 0.98, alpha: 1.0), for: .normal)
        closeBtn.addTarget(self, action: #selector(onClosePanelTapped), for: .touchUpInside)

        header.addSubview(sheetTitle)
        header.addSubview(closeBtn)

        // Hỗ trợ vuốt xuống thanh Header để đóng Sheet như App iOS gốc
        let pan = UIPanGestureRecognizer(target: self, action: #selector(onSheetHeaderPan(_:)))
        header.addGestureRecognizer(pan)

        let cfg = WKWebViewConfiguration()
        cfg.processPool = sharedProcessPool
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
            header.heightAnchor.constraint(equalToConstant: 54),
            grabber.topAnchor.constraint(equalTo: header.topAnchor, constant: 6),
            grabber.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            grabber.widthAnchor.constraint(equalToConstant: 38),
            grabber.heightAnchor.constraint(equalToConstant: 5),
            logoImgView.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 14),
            logoImgView.bottomAnchor.constraint(equalTo: header.bottomAnchor, constant: -9),
            logoImgView.widthAnchor.constraint(equalToConstant: 26),
            logoImgView.heightAnchor.constraint(equalToConstant: 26),
            sheetTitle.centerYAnchor.constraint(equalTo: logoImgView.centerYAnchor),
            sheetTitle.leadingAnchor.constraint(equalTo: logoImgView.trailingAnchor, constant: 10),
            sheetTitle.trailingAnchor.constraint(lessThanOrEqualTo: closeBtn.leadingAnchor, constant: -8),
            closeBtn.centerYAnchor.constraint(equalTo: logoImgView.centerYAnchor),
            closeBtn.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -14),
            pWeb.topAnchor.constraint(equalTo: header.bottomAnchor),
            pWeb.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            pWeb.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            pWeb.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])

        panelContainer = container
        panelWebView = pWeb
    }

    private func openPanel(page: String) {
        highlightTab(4)
        let isNewSheet = (panelContainer == nil)
        ensurePanelCreated()

        let wasHidden = panelContainer?.isHidden ?? false
        panelContainer?.isHidden = false

        // Luôn nạp Bảng điều khiển chính (popup.html) một lần duy nhất để mở tức thì (0ms)
        if currentPanelPage != "popup.html" {
            currentPanelPage = "popup.html"
            let html = buildPanelHtml(page: "popup.html")
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
        case "diag":
            // Sự kiện tự chẩn đoán từ JS: chỉ nhận từ khung chính của tab YouTube/Spotify (không phải bảng điều khiển/trang lạ)
            guard message.frameInfo.isMainFrame,
                  let wv = message.webView, isTabWebView(wv),
                  isAllowedDiagHost(message.frameInfo.request.url?.host),
                  let ev = body["e"] as? String,
                  let fields = body["f"] as? [String: Any] else { return }
            DiagLog.shared.record(ev, fields, tab: tabName(for: wv), fromJS: true)
        case "diagStatus":
            guard isPanelMessage(message) else { return }
            pushDiagStatus()
        case "diagExport":
            guard isPanelMessage(message) else { return }
            presentDiagExport()
        case "diagClear":
            guard isPanelMessage(message) else { return }
            DiagLog.shared.clear { [weak self] in self?.pushDiagStatus() }
        case "diagSetEnabled":
            guard isPanelMessage(message), let on = body["on"] as? Bool else { return }
            DiagLog.shared.setEnabled(on)
            broadcastDiagEnabled(on)
            pushDiagStatus()
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
        case "setBrightness":
            if let val = body["value"] as? Double {
                UIScreen.main.brightness = CGFloat(max(0.05, min(1.0, val)))
            }
        case "shareImage":
            if let dataUrl = body["dataUrl"] as? String,
               let commaIdx = dataUrl.firstIndex(of: ",") {
                let b64 = String(dataUrl[dataUrl.index(after: commaIdx)...])
                if let imgData = Data(base64Encoded: b64),
                   let img = UIImage(data: imgData) {
                    triggerHaptic(style: .medium)
                    let avc = UIActivityViewController(activityItems: [img], applicationActivities: nil)
                    if let pop = avc.popoverPresentationController {
                        pop.sourceView = self.view
                        pop.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY, width: 1, height: 1)
                    }
                    self.present(avc, animated: true, completion: nil)
                }
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

// MARK: - Nhật ký chẩn đoán cục bộ
// Nguồn sự thật: ios/diag-schema.json (cũng được tiêm sang JS). Schema không có trường văn bản tự do nên KHÔNG thể ghi
// địa chỉ trang, mã video, key, IP hay mã thiết bị. Chỉ lưu trên máy (Application Support, loại khỏi sao lưu iCloud);
// lớp này không chứa bất kỳ mã mạng nào. Người dùng tự xuất/xoá từ bảng Cài đặt.
final class DiagLog {
    static let shared = DiagLog()

    private enum Rule {
        case enumeration([String])
        case integer(Int, Int)
        case boolean
        case pattern(NSRegularExpression)
    }

    private struct EventDef {
        let fromJS: Bool
        let fields: [String: Rule]
    }

    private let queue = DispatchQueue(label: "com.funnygame.diag", qos: .utility)
    private let enabledKey = "fg_diag_enabled_v1"
    private var events: [String: EventDef] = [:]
    private var maxEntries = 200
    private var maxBytes = 65536
    private var maxEventBytes = 512
    private var perEventPerMinute = 6
    private var entries: [String] = []
    private var totalBytes = 0
    private var windows: [String: (start: TimeInterval, count: Int)] = [:]
    private var saveWork: DispatchWorkItem?
    private let fileURL: URL
    private(set) var schemaJSON: String = "{}"

    /// Mặc định BẬT (chỉ lưu cục bộ); người dùng tắt được trong Cài đặt.
    var isEnabled: Bool {
        if UserDefaults.standard.object(forKey: enabledKey) == nil { return true }
        return UserDefaults.standard.bool(forKey: enabledKey)
    }

    private init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        var dir = base.appendingPathComponent("FUNNYGAME", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? dir.setResourceValues(values)
        fileURL = dir.appendingPathComponent("diag.log")
        if let text = try? String(contentsOf: fileURL, encoding: .utf8) {
            entries = text.split(separator: "\n").map { String($0) }.filter { !$0.isEmpty }
            totalBytes = entries.reduce(0) { $0 + $1.utf8.count + 1 }
        }
    }

    /// Nạp schema (gọi trên main thread, trước khi tạo WebView). Schema hỏng/thiếu ⇒ bỏ mọi sự kiện (an toàn).
    func configure(schemaJSON raw: String) {
        guard let data = raw.data(using: .utf8),
              let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let evs = root["events"] as? [String: Any] else {
            queue.sync { self.events = [:] }
            schemaJSON = "{}"
            return
        }
        var parsed: [String: EventDef] = [:]
        for (name, anyDef) in evs {
            guard let def = anyDef as? [String: Any], let src = def["src"] as? String else { continue }
            var fields: [String: Rule] = [:]
            var valid = true
            let fdefs = (def["fields"] as? [String: Any]) ?? [:]
            for (fname, anyRule) in fdefs {
                guard let r = anyRule as? [String: Any], let kind = r["t"] as? String else { valid = false; break }
                switch kind {
                case "enum":
                    if let vals = r["v"] as? [String], !vals.isEmpty { fields[fname] = .enumeration(vals) } else { valid = false }
                case "int":
                    if let lo = r["min"] as? Int, let hi = r["max"] as? Int, lo <= hi { fields[fname] = .integer(lo, hi) } else { valid = false }
                case "bool":
                    fields[fname] = .boolean
                case "pattern":
                    if let re = r["re"] as? String, let rx = try? NSRegularExpression(pattern: re) { fields[fname] = .pattern(rx) } else { valid = false }
                default:
                    valid = false
                }
                if !valid { break }
            }
            if valid { parsed[name] = EventDef(fromJS: src == "js", fields: fields) }
        }
        let lim = (root["limits"] as? [String: Any]) ?? [:]
        queue.sync {
            self.events = parsed
            self.maxEntries = (lim["maxEntries"] as? Int) ?? 200
            self.maxBytes = (lim["maxBytes"] as? Int) ?? 65536
            self.maxEventBytes = (lim["maxEventBytes"] as? Int) ?? 512
            self.perEventPerMinute = (lim["perEventPerMinute"] as? Int) ?? 6
        }
        if let out = try? JSONSerialization.data(withJSONObject: root), let s = String(data: out, encoding: .utf8) {
            schemaJSON = s
        } else {
            schemaJSON = "{}"
        }
    }

    func setEnabled(_ on: Bool) {
        UserDefaults.standard.set(on, forKey: enabledKey)
    }

    /// Ghi 1 sự kiện. Sự kiện/trường ngoài schema, giá trị sai kiểu/khoảng, hoặc sai nguồn (JS giả sự kiện của Swift) bị bỏ.
    func record(_ event: String, _ raw: [String: Any] = [:], tab: String? = nil, fromJS: Bool = false) {
        guard isEnabled else { return }
        queue.async { [weak self] in
            self?.append(event, raw, tab: tab, fromJS: fromJS)
        }
    }

    private func append(_ event: String, _ raw: [String: Any], tab: String?, fromJS: Bool) {
        guard let def = events[event], def.fromJS == fromJS else { return }
        var clean: [String: Any] = [:]
        for (key, rule) in def.fields {
            guard let value = raw[key] else { continue }
            guard let ok = validated(value, rule) else { return } // giá trị lạ ⇒ bỏ cả sự kiện
            clean[key] = ok
        }
        // Giới hạn tần suất theo loại sự kiện (chống trang độc hại làm tràn nhật ký)
        let now = Date().timeIntervalSince1970
        var w = windows[event] ?? (start: now, count: 0)
        if now - w.start > 60 { w = (start: now, count: 0) }
        if w.count >= perEventPerMinute { windows[event] = w; return }
        w.count += 1
        windows[event] = w

        var entry: [String: Any] = ["t": Int(now), "e": event, "f": clean]
        if let tab = tab { entry["tab"] = tab }
        guard let data = try? JSONSerialization.data(withJSONObject: entry, options: [.sortedKeys]),
              data.count <= maxEventBytes,
              let line = String(data: data, encoding: .utf8) else { return }
        entries.append(line)
        totalBytes += data.count + 1
        while entries.count > maxEntries || totalBytes > maxBytes {
            guard let first = entries.first else { break }
            entries.removeFirst()
            totalBytes -= first.utf8.count + 1
        }
        scheduleSave()
    }

    private func validated(_ value: Any, _ rule: Rule) -> Any? {
        switch rule {
        case .boolean:
            guard let n = value as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { return nil }
            return n.boolValue
        case .integer(let lo, let hi):
            guard let n = value as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return nil }
            let d = n.doubleValue
            guard d == d.rounded(), d >= Double(lo), d <= Double(hi) else { return nil }
            return Int(d)
        case .enumeration(let allowed):
            guard let s = value as? String, allowed.contains(s) else { return nil }
            return s
        case .pattern(let rx):
            guard let s = value as? String, s.count <= 24 else { return nil }
            let range = NSRange(location: 0, length: (s as NSString).length)
            guard rx.firstMatch(in: s, options: [], range: range) != nil else { return nil }
            return s
        }
    }

    private func scheduleSave() {
        saveWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.writeFile() }
        saveWork = work
        queue.asyncAfter(deadline: .now() + 2.0, execute: work)
    }

    private func writeFile() {
        try? entries.joined(separator: "\n").write(to: fileURL, atomically: true, encoding: .utf8)
    }

    /// Ghi ngay xuống đĩa (gọi khi app vào nền).
    func flush() {
        queue.async { [weak self] in
            guard let self = self else { return }
            self.saveWork?.cancel()
            self.writeFile()
        }
    }

    func clear(completion: (() -> Void)? = nil) {
        queue.async { [weak self] in
            guard let self = self else { return }
            self.saveWork?.cancel()
            self.entries.removeAll()
            self.totalBytes = 0
            self.windows.removeAll()
            try? FileManager.default.removeItem(at: self.fileURL)
            DispatchQueue.main.async { completion?() }
        }
    }

    func status(_ completion: @escaping (Int, Int) -> Void) {
        queue.async { [weak self] in
            let count = self?.entries.count ?? 0
            let bytes = self?.totalBytes ?? 0
            DispatchQueue.main.async { completion(count, bytes) }
        }
    }

    /// Nội dung để người dùng tự chia sẻ (qua bảng chia sẻ của iOS — ứng dụng không tự gửi đi đâu).
    func exportText(_ completion: @escaping (String) -> Void) {
        let os = UIDevice.current.systemVersion
        let idiom = UIDevice.current.userInterfaceIdiom == .pad ? "pad" : "phone"
        let enabled = isEnabled ? "bat" : "tat"
        queue.async { [weak self] in
            let lines = self?.entries ?? []
            let header = "FUNNYGAME chẩn đoán v1\napp=2.4.15 os=\(os) idiom=\(idiom) ghi=\(enabled) so_su_kien=\(lines.count)\n"
                + "Không chứa địa chỉ video, key, IP hay mã thiết bị. Chỉ lưu trên máy này.\n---\n"
            let text = header + lines.joined(separator: "\n") + "\n"
            DispatchQueue.main.async { completion(text) }
        }
    }
}
