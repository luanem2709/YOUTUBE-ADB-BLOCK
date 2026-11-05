import UIKit
import WebKit
import AVFoundation

class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    private var mainWebView: WKWebView!
    private var panelContainer: UIView?
    private var panelWebView: WKWebView?
    private var bottomBar: UIView!
    private var tabButtons: [UIButton] = []

    private let storageKeyLocal = "fg_chrome_storage_local_v1"
    private let storageKeySession = "fg_chrome_storage_session_v1"

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.06, green: 0.06, blue: 0.08, alpha: 1.0)

        if let storyboardWebView = self.webView {
            storyboardWebView.removeFromSuperview()
        }

        configureAudioSession()
        setupBottomBar()
        setupMainWebView()
        loadSite(urlString: "https://m.youtube.com", activeIndex: 0)
    }

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback, options: [])
            try session.setActive(true)
        } catch {
            // Ignore audio session error
        }
    }

    private func readResString(_ name: String) -> String {
        if let path = Bundle.main.path(forResource: name, ofType: nil, inDirectory: "fg-ext"),
           let content = try? String(contentsOfFile: path, encoding: .utf8) {
            return content
        }
        if let path = Bundle.main.path(forResource: name, ofType: nil),
           let content = try? String(contentsOfFile: path, encoding: .utf8) {
            return content
        }
        return ""
    }

    private func readResBase64(_ name: String, mime: String) -> String {
        let paths = [
            Bundle.main.path(forResource: name, ofType: nil, inDirectory: "fg-ext/images"),
            Bundle.main.path(forResource: name, ofType: nil, inDirectory: "images"),
            Bundle.main.path(forResource: name, ofType: nil),
        ]
        for p in paths {
            if let validPath = p, let data = try? Data(contentsOf: URL(fileURLWithPath: validPath)) {
                return "data:\(mime);base64," + data.base64EncodedString()
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

    private func buildBootstrapScript(mainUrl: String) -> String {
        let localJson = getStoredJson(storageKeyLocal)
        let sessionJson = getStoredJson(storageKeySession)
        let logoDataUrl = readResBase64("fg-logo-yt.png", mime: "image/png")
        let iconDataUrl = readResBase64("icon48.png", mime: "image/png")
        let safeMainUrl = mainUrl.replacingOccurrences(of: "\"", with: "\\\"")
        return """
        window.__FG_IOS_INITIAL_STORAGE__ = \(localJson);
        window.__FG_IOS_INITIAL_SESSION__ = \(sessionJson);
        window.__FG_IOS_VERSION__ = "2.4.15";
        window.__FG_IOS_MAIN_URL__ = "\(safeMainUrl)";
        window.__FG_IOS_LOGO_DATA_URL__ = "\(logoDataUrl)";
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

        let currentUrl = mainWebView?.url?.absoluteString ?? "https://m.youtube.com/"
        let bootstrap = buildBootstrapScript(mainUrl: currentUrl)
        let bridgeJs = readResString("chrome-bridge.js")
        let licenseJs = readResString("license.js")

        ucc.addUserScript(WKUserScript(source: bootstrap + "\n" + bridgeJs + "\n" + licenseJs, injectionTime: .atDocumentStart, forMainFrameOnly: false))

        if !forPanel {
            let cssCombined = readResString("content.css") + "\n" + readResString("mobile.css")
            let cssScript = buildCssInjectionScript(cssCombined)
            let ytNetJs = readResString("content-yt-net.js")
            let ytMainJs = readResString("content-main.js")
            let ytContentJs = readResString("content.js")
            let spMainJs = readResString("content-spotify-main.js")
            let spContentJs = readResString("content-spotify.js")
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
            ucc.addUserScript(WKUserScript(source: combinedStart, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        }
        return ucc
    }

    private func setupMainWebView() {
        let config = WKWebViewConfiguration()
        config.userContentController = makeUserContentController(forPanel: false)
        config.allowsInlineMediaPlayback = true
        config.allowsPictureInPictureMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        mainWebView = WKWebView(frame: .zero, configuration: config)
        mainWebView.translatesAutoresizingMaskIntoConstraints = false
        mainWebView.navigationDelegate = self
        mainWebView.uiDelegate = self
        mainWebView.allowsBackForwardNavigationGestures = true
        mainWebView.backgroundColor = UIColor(red: 0.06, green: 0.06, blue: 0.08, alpha: 1.0)
        mainWebView.scrollView.backgroundColor = mainWebView.backgroundColor
        mainWebView.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"

        view.insertSubview(mainWebView, belowSubview: bottomBar)

        NSLayoutConstraint.activate([
            mainWebView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            mainWebView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            mainWebView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            mainWebView.bottomAnchor.constraint(equalTo: bottomBar.topAnchor),
        ])
    }

    private func setupBottomBar() {
        bottomBar = UIView()
        bottomBar.translatesAutoresizingMaskIntoConstraints = false
        bottomBar.backgroundColor = UIColor(red: 0.08, green: 0.08, blue: 0.11, alpha: 0.98)

        let topBorder = UIView()
        topBorder.translatesAutoresizingMaskIntoConstraints = false
        topBorder.backgroundColor = UIColor(white: 1.0, alpha: 0.1)
        bottomBar.addSubview(topBorder)

        let stack = UIStackView()
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.alignment = .fill
        bottomBar.addSubview(stack)

        let items: [(String, Selector)] = [
            ("▶ YouTube", #selector(onTapYouTube)),
            ("🎵 YT Music", #selector(onTapMusic)),
            ("🎧 Spotify", #selector(onTapSpotify)),
            ("🛡️ Chặn QC", #selector(onTapPanel)),
        ]

        for (idx, item) in items.enumerated() {
            let btn = UIButton(type: .system)
            btn.setTitle(item.0, for: .normal)
            btn.titleLabel?.font = UIFont.systemFont(ofSize: 13, weight: .semibold)
            btn.setTitleColor(idx == 0 ? UIColor(red: 1.0, green: 0.28, blue: 0.34, alpha: 1.0) : UIColor(white: 0.78, alpha: 1.0), for: .normal)
            btn.addTarget(self, action: item.1, for: .touchUpInside)
            stack.addArrangedSubview(btn)
            tabButtons.append(btn)
        }

        view.addSubview(bottomBar)

        NSLayoutConstraint.activate([
            bottomBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bottomBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bottomBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            topBorder.topAnchor.constraint(equalTo: bottomBar.topAnchor),
            topBorder.leadingAnchor.constraint(equalTo: bottomBar.leadingAnchor),
            topBorder.trailingAnchor.constraint(equalTo: bottomBar.trailingAnchor),
            topBorder.heightAnchor.constraint(equalToConstant: 0.5),
            stack.topAnchor.constraint(equalTo: bottomBar.topAnchor),
            stack.leadingAnchor.constraint(equalTo: bottomBar.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: bottomBar.trailingAnchor),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            stack.heightAnchor.constraint(equalToConstant: 48),
        ])
    }

    private func highlightTab(_ activeIndex: Int) {
        for (idx, btn) in tabButtons.enumerated() {
            let active = (idx == activeIndex)
            btn.setTitleColor(active ? UIColor(red: 1.0, green: 0.28, blue: 0.34, alpha: 1.0) : UIColor(white: 0.78, alpha: 1.0), for: .normal)
        }
    }

    private func loadSite(urlString: String, activeIndex: Int) {
        highlightTab(activeIndex)
        closePanel()
        guard let url = URL(string: urlString) else { return }
        mainWebView.load(URLRequest(url: url))
    }

    @objc private func onTapYouTube() {
        loadSite(urlString: "https://m.youtube.com", activeIndex: 0)
    }

    @objc private func onTapMusic() {
        loadSite(urlString: "https://music.youtube.com", activeIndex: 1)
    }

    @objc private func onTapSpotify() {
        loadSite(urlString: "https://open.spotify.com", activeIndex: 2)
    }

    @objc private func onTapPanel() {
        openPanel(page: "popup.html")
    }

    private func buildPanelHtml(page: String) -> String {
        let cleanPage = page.components(separatedBy: "?").first ?? "popup.html"
        var html = readResString(cleanPage)
        if html.isEmpty { html = readResString("popup.html") }

        let cssName = cleanPage.replacingOccurrences(of: ".html", with: ".css")
        let jsName = cleanPage.replacingOccurrences(of: ".html", with: ".js")
        let cssContent = readResString(cssName) + "\n" + (cleanPage == "popup.html" ? readResString("popup-mobile.css") : "")
        let jsContent = readResString(jsName)
        let iconData = readResBase64("icon48.png", mime: "image/png")

        html = html.replacingOccurrences(of: "images/icon48.png", with: iconData)
        html = html.replacingOccurrences(of: "<link rel=\"stylesheet\" href=\"\(cssName)\" />", with: "<style>\(cssContent)</style>")
        html = html.replacingOccurrences(of: "<link rel=\"stylesheet\" href=\"popup-mobile.css\" />", with: "")
        html = html.replacingOccurrences(of: "<script src=\"license.js\"></script>", with: "")
        html = html.replacingOccurrences(of: "<script src=\"\(jsName)\"></script>", with: "<script>\(jsContent)</script>")
        return html
    }

    private func openPanel(page: String) {
        highlightTab(3)
        if panelContainer == nil {
            let container = UIView()
            container.translatesAutoresizingMaskIntoConstraints = false
            container.backgroundColor = UIColor(red: 0.05, green: 0.05, blue: 0.07, alpha: 0.98)

            let header = UIView()
            header.translatesAutoresizingMaskIntoConstraints = false
            header.backgroundColor = UIColor(red: 0.09, green: 0.09, blue: 0.12, alpha: 1.0)

            let titleLabel = UILabel()
            titleLabel.translatesAutoresizingMaskIntoConstraints = false
            titleLabel.text = "FUNNYGAME · Bảng điều khiển"
            titleLabel.font = UIFont.systemFont(ofSize: 15, weight: .bold)
            titleLabel.textColor = .white

            let closeBtn = UIButton(type: .system)
            closeBtn.translatesAutoresizingMaskIntoConstraints = false
            closeBtn.setTitle("Đóng ✕", for: .normal)
            closeBtn.titleLabel?.font = UIFont.systemFont(ofSize: 14, weight: .semibold)
            closeBtn.setTitleColor(UIColor(red: 1.0, green: 0.35, blue: 0.4, alpha: 1.0), for: .normal)
            closeBtn.addTarget(self, action: #selector(closePanel), for: .touchUpInside)

            header.addSubview(titleLabel)
            header.addSubview(closeBtn)

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
                container.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
                container.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                container.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                container.bottomAnchor.constraint(equalTo: bottomBar.topAnchor),
                header.topAnchor.constraint(equalTo: container.topAnchor),
                header.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                header.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                header.heightAnchor.constraint(equalToConstant: 44),
                titleLabel.centerYAnchor.constraint(equalTo: header.centerYAnchor),
                titleLabel.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: 16),
                closeBtn.centerYAnchor.constraint(equalTo: header.centerYAnchor),
                closeBtn.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -16),
                pWeb.topAnchor.constraint(equalTo: header.bottomAnchor),
                pWeb.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                pWeb.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                pWeb.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            ])

            panelContainer = container
            panelWebView = pWeb
        }

        let html = buildPanelHtml(page: page)
        // Dùng baseURL https://m.youtube.com/ để tạo Secure Context (bật window.crypto.subtle cho RSA-2048)
        panelWebView?.loadHTMLString(html, baseURL: URL(string: "https://m.youtube.com/funnygame-panel"))
    }

    @objc private func closePanel() {
        panelContainer?.removeFromSuperview()
        panelContainer = nil
        panelWebView = nil
    }

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
                if let data = try? JSONSerialization.data(withJSONObject: patch),
                   let jsonStr = String(data: data, encoding: .utf8) {
                    let js = "if (window.__fgOnExternalStorageChange) window.__fgOnExternalStorageChange(\(jsonStr), '\(area)');"
                    if message.webView !== mainWebView {
                        mainWebView?.evaluateJavaScript(js, completionHandler: nil)
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
            }
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
                mainWebView?.evaluateJavaScript(js, completionHandler: nil)
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
