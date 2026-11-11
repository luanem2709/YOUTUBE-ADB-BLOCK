/**
 * Tạo trang Mô phỏng Giao diện iPhone 16 Pro Max trực tiếp trên PC (ios/preview-iphone.html)
 * Nhúng trực tiếp popup.html, stats.html, options.html, mobile/popup-mobile.css và bộ Logo iPhone mới.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function toDataUrl(relPath, mime) {
    const p = path.join(root, relPath);
    if (!fs.existsSync(p)) return "";
    return `data:${mime};base64,` + fs.readFileSync(p).toString("base64");
}

const appIconUrl = toDataUrl("ios/AppIcon-1024.png", "image/png");
const squircleLogoUrl = toDataUrl("images/fg-logo-ios.png", "image/png");
const ytLogoUrl = toDataUrl("images/fg-logo-yt.png", "image/png");

function buildEmbeddedPage(pageFile, unlocked = true) {
    let html = fs.readFileSync(path.join(root, pageFile), "utf8");
    const cssName = pageFile.replace(".html", ".css");
    const jsName = pageFile.replace(".html", ".js");
    const cssContent = fs.readFileSync(path.join(root, cssName), "utf8") + "\n" +
        (pageFile === "popup.html" ? fs.readFileSync(path.join(root, "mobile", "popup-mobile.css"), "utf8") : "");
    const jsContent = fs.readFileSync(path.join(root, jsName), "utf8");
    const bridgeContent = fs.readFileSync(path.join(root, "ios", "chrome-bridge.js"), "utf8");
    const licenseContent = fs.readFileSync(path.join(root, "license.js"), "utf8");

    const demoStorage = {
        enabled: true,
        licenseValid: unlocked,
        licenseExpires: "2027-12-31T23:59:59.000Z",
        licenseKey: unlocked ? "FG-DEMO-0000-0000" : "",
        adsBlocked: 128,
        dailyGoal: 50,
        whitelistChannels: ["@FAPTV", "@MixiGaming3con"],
        statsBreakdown: { video: 84, banner: 29, overlay: 9, antiAdblock: 2, shopping: 3, spotify: 1 },
        statsHistory: [
            { date: "2026-10-31", count: 14 },
            { date: "2026-11-01", count: 22 },
            { date: "2026-11-02", count: 19 },
            { date: "2026-11-03", count: 31 },
            { date: "2026-11-04", count: 26 },
            { date: "2026-11-05", count: 16 },
        ],
        userStats: {
            currentId: "ios_vip",
            users: {
                ios_vip: { id: "ios_vip", displayName: "iPhone 16 Pro Max", handle: "@luanem2709", total: 128, video: 84, banner: 29 },
                u2: { id: "u2", displayName: "Minh Tuấn iOS", handle: "@minhtuan", total: 96, video: 64, banner: 32 },
                u3: { id: "u3", displayName: "Hoàng Nam", handle: "@hoangnam", total: 74, video: 50, banner: 24 },
            },
        },
        settings: {
            blockVideo: true,
            blockBanner: true,
            blockOverlay: true,
            blockAntiAdblock: true,
            blockShopping: true,
            muteAds: true,
            fastSkip: true,
            blockManifest: true,
            blockSpotify: true,
            backgroundPlay: true,
            pipButton: true,
            hideUpsell: true,
            videoQuality: "hd1080",
            sponsorBlock: true,
            jumpAhead: true,
            ambientGlow: true,
            customLogo: true,
        },
    };

    const bootstrap = `
    <script>
        window.__FG_IOS_INITIAL_STORAGE__ = ${JSON.stringify(demoStorage)};
        window.__FG_IOS_INITIAL_SESSION__ = { sessionBlocked: 18 };
        window.__FG_IOS_VERSION__ = "2.4.15";
        window.__FG_IOS_MAIN_URL__ = "https://m.youtube.com/watch?v=4jjOH2FR6-E";
        window.__FG_IOS_LOGO_DATA_URL__ = "${squircleLogoUrl}";
        window.__FG_IOS_ICON_DATA_URL__ = "${squircleLogoUrl}";
        ${bridgeContent}
        ${licenseContent}
        if (${unlocked ? "true" : "false"} && window.FG_LICENSE) {
            window.FG_LICENSE.ensureUnlocked = async () => ({ valid: true, expires: "2027-12-31T23:59:59.000Z" });
            window.FG_LICENSE.getState = async () => ({ valid: true, key: "FG-DEMO-0000-0000", expires: "2027-12-31T23:59:59.000Z" });
        }
    </script>`;

    html = html
        .replace(/\.\/images\/logo\.gif|images\/logo\.gif|images\/icon48\.png|images\/icon128\.png/g, squircleLogoUrl)
        .replace(`<link rel="stylesheet" href="${cssName}" />`, `<style>${cssContent}</style>\n${bootstrap}`)
        .replace(`<script src="license.js"></script>`, "")
        .replace(`<script src="${jsName}"></script>`, `<script>${jsContent}</script>`);
    return html;
}

const popupUnlockedB64 = Buffer.from(buildEmbeddedPage("popup.html", true), "utf8").toString("base64");
const popupLockedB64 = Buffer.from(buildEmbeddedPage("popup.html", false), "utf8").toString("base64");
const statsB64 = Buffer.from(buildEmbeddedPage("stats.html", true), "utf8").toString("base64");
const optionsB64 = Buffer.from(buildEmbeddedPage("options.html", true), "utf8").toString("base64");

const previewHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mô phỏng FUNNYGAME iOS (.ipa) trên iPhone 16 Pro Max</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
            background: radial-gradient(circle at 20% 15%, #172554 0%, #070913 55%, #030408 100%);
            color: #f8fafc;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            gap: 36px;
            flex-wrap: wrap;
        }
        /* Khung iPhone 16 Pro Max */
        .iphone-bezel {
            width: 404px;
            height: 856px;
            border-radius: 56px;
            padding: 12px;
            background: linear-gradient(145deg, #334155 0%, #0f172a 45%, #1e293b 100%);
            box-shadow:
                0 30px 80px rgba(0, 0, 0, 0.78),
                0 0 0 2px rgba(148, 163, 184, 0.25),
                inset 0 0 8px rgba(255, 255, 255, 0.18);
            position: relative;
            flex-shrink: 0;
        }
        .iphone-screen {
            width: 100%;
            height: 100%;
            border-radius: 46px;
            background: #06070d;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            position: relative;
        }
        /* Thanh trạng thái iOS + Dynamic Island */
        .ios-statusbar {
            height: 48px;
            padding: 0 26px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 13px;
            font-weight: 700;
            color: #fff;
            background: #090b12;
            position: relative;
            z-index: 20;
            flex-shrink: 0;
        }
        .dynamic-island {
            width: 116px;
            height: 31px;
            background: #000;
            border-radius: 999px;
            position: absolute;
            left: 50%;
            top: 9px;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 10px;
            box-shadow: inset 0 0 2px rgba(255, 255, 255, 0.16);
        }
        .di-wave {
            width: 14px;
            height: 10px;
            background: linear-gradient(90deg, #3b82f6, #ef4444);
            border-radius: 4px;
        }
        .di-cam {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: radial-gradient(circle, #1e3a8a 25%, #090d16 70%);
        }
        /* Màn hình nội dung chính */
        .ios-viewport {
            flex: 1;
            position: relative;
            overflow: hidden;
            background: #08090f;
            display: flex;
            flex-direction: column;
        }
        /* Giao diện m.youtube.com với Logo iPhone mới */
        .ytm-view {
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow-y: auto;
        }
        .ytm-topbar {
            height: 48px;
            padding: 0 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(10, 12, 20, 0.96);
            border-bottom: 1px solid rgba(255, 255, 255, 0.07);
            flex-shrink: 0;
        }
        .ytm-brand {
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .ytm-brand img {
            width: 28px;
            height: 28px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(37, 99, 235, 0.45);
        }
        .ytm-brand-text {
            font-size: 16px;
            font-weight: 800;
            letter-spacing: -0.02em;
            color: #f8fafc;
        }
        .ytm-brand-badge {
            font-size: 9.5px;
            font-weight: 800;
            color: #60a5fa;
            background: rgba(37, 99, 235, 0.18);
            border: 1px solid rgba(96, 165, 250, 0.35);
            padding: 2px 6px;
            border-radius: 6px;
            letter-spacing: 0.04em;
        }
        .ytm-actions {
            display: flex;
            align-items: center;
            gap: 14px;
            color: #cbd5e1;
            font-size: 14px;
        }
        .ytm-player {
            width: 100%;
            aspect-ratio: 16 / 9;
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #090d16 100%);
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            user-select: none;
            cursor: pointer;
        }
        .hold-pill {
            position: absolute;
            top: 12px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15, 18, 28, 0.88);
            border: 1px solid rgba(96, 165, 250, 0.4);
            padding: 5px 12px;
            border-radius: 999px;
            font-size: 11.5px;
            font-weight: 700;
            color: #fff;
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
        }
        .player-center-logo {
            width: 58px;
            height: 58px;
            border-radius: 16px;
            box-shadow: 0 8px 25px rgba(37, 99, 235, 0.45);
            margin-bottom: 8px;
        }
        .player-caption {
            font-size: 13px;
            font-weight: 700;
            color: #e2e8f0;
        }
        .player-sub {
            font-size: 11px;
            color: #93c5fd;
            margin-top: 3px;
        }
        .player-progress {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: rgba(255, 255, 255, 0.16);
        }
        .player-progress-bar {
            width: 62%;
            height: 100%;
            background: linear-gradient(90deg, #3b82f6, #ef4444);
        }
        .ytm-body {
            padding: 14px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .ytm-video-title {
            font-size: 15px;
            font-weight: 700;
            line-height: 1.38;
            color: #f8fafc;
        }
        .ytm-meta {
            font-size: 12px;
            color: #94a3b8;
        }
        .ytm-feature-pills {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .ytm-pill {
            font-size: 11px;
            font-weight: 600;
            padding: 6px 10px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.09);
            color: #e2e8f0;
        }
        .ytm-pill.active {
            background: rgba(37, 99, 235, 0.18);
            border-color: rgba(96, 165, 250, 0.4);
            color: #93c5fd;
        }
        .ytm-card {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 12px;
            display: flex;
            gap: 12px;
            align-items: center;
        }
        .ytm-thumb {
            width: 110px;
            height: 62px;
            border-radius: 10px;
            background: linear-gradient(135deg, #1e293b, #0f172a);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            color: #60a5fa;
            flex-shrink: 0;
            border: 1px solid rgba(96, 165, 250, 0.25);
        }
        /* Khung Bảng điều khiển Native iOS 18 Sheet (Popup / Stats / Options) */
        .ios-panel-container {
            position: absolute;
            top: 6px;
            left: 0;
            right: 0;
            bottom: 0;
            background: #06070d;
            border-radius: 24px 24px 0 0;
            border-top: 0.5px solid rgba(255, 255, 255, 0.16);
            box-shadow: 0 -10px 35px rgba(0, 0, 0, 0.65);
            display: none;
            flex-direction: column;
            z-index: 10;
            overflow: hidden;
        }
        .ios-panel-container.open {
            display: flex;
        }
        .ios-sheet-grabber-row {
            background: #141622;
            padding-top: 6px;
            display: flex;
            justify-content: center;
        }
        .ios-sheet-grabber {
            width: 38px;
            height: 5px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.28);
        }
        .ios-panel-header {
            height: 44px;
            padding: 0 12px;
            background: #141622;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-shrink: 0;
        }
        .ios-action-bar {
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 8px 12px;
            overflow-x: auto;
            scrollbar-width: none;
            background: rgba(10, 12, 20, 0.96);
            border-bottom: 0.5px solid rgba(255, 255, 255, 0.08);
            flex-shrink: 0;
        }
        .ios-action-bar::-webkit-scrollbar { display: none; }
        .ios-chip {
            padding: 6px 11px;
            border-radius: 999px;
            border: 0.5px solid rgba(255, 255, 255, 0.14);
            background: rgba(255, 255, 255, 0.07);
            color: #f8fafc;
            font-size: 11.5px;
            font-weight: 600;
            white-space: nowrap;
            cursor: pointer;
        }
        .ios-chip.active {
            background: rgba(37, 99, 235, 0.28);
            border-color: rgba(96, 165, 250, 0.55);
            color: #93c5fd;
        }
        .ios-seg {
            display: flex;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 9px;
            padding: 2px;
            flex: 1;
        }
        .ios-seg button {
            flex: 1;
            border: none;
            background: transparent;
            color: #cbd5e1;
            font-size: 12px;
            font-weight: 600;
            padding: 6px 4px;
            border-radius: 7px;
            cursor: pointer;
        }
        .ios-seg button.active {
            background: #ff4257;
            color: #fff;
            font-weight: 700;
        }
        .ios-close-btn {
            border: none;
            background: transparent;
            color: #ff5969;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            padding: 4px 6px;
        }
        .ios-panel-iframe {
            flex: 1;
            width: 100%;
            border: none;
            background: #06070d;
        }
        /* Thanh Dock 5 nút chuẩn iOS ở dưới cùng */
        .ios-dock {
            height: 54px;
            background: rgba(14, 16, 24, 0.94);
            backdrop-filter: blur(20px);
            border-top: 0.5px solid rgba(255, 255, 255, 0.14);
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            align-items: center;
            padding: 0 4px;
            flex-shrink: 0;
        }
        .ios-dock-btn {
            border: none;
            background: transparent;
            color: #b8c2d0;
            font-size: 10.5px;
            font-weight: 600;
            height: 100%;
            cursor: pointer;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2px;
        }
        .ios-dock-btn .dock-ico {
            font-size: 16px;
            line-height: 1;
        }
        .ios-dock-btn.active {
            color: #ff4757;
            font-weight: 700;
        }
        .ios-dock-badge {
            position: absolute;
            top: 6px;
            right: 4px;
            background: #ff3d51;
            color: #fff;
            font-size: 9px;
            font-weight: 800;
            padding: 1px 5px;
            border-radius: 8px;
        }
        .ios-home-bar {
            height: 20px;
            background: rgba(14, 16, 24, 0.94);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .ios-home-pill {
            width: 134px;
            height: 5px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.35);
        }
        /* Bảng điều khiển bên phải trên PC */
        .pc-inspector {
            max-width: 440px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .pc-card {
            background: rgba(15, 23, 42, 0.78);
            border: 1px solid rgba(96, 165, 250, 0.25);
            border-radius: 22px;
            padding: 20px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
        }
        .pc-card h2 {
            font-size: 18px;
            font-weight: 800;
            margin-bottom: 6px;
        }
        .pc-card p {
            font-size: 13px;
            color: #94a3b8;
            line-height: 1.5;
        }
        .logo-showcase {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-top: 14px;
            padding: 14px;
            border-radius: 16px;
            background: rgba(6, 9, 20, 0.75);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .logo-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: #cbd5e1;
            text-align: center;
        }
        .logo-item img.appicon {
            width: 68px;
            height: 68px;
            border-radius: 16px;
            box-shadow: 0 8px 24px rgba(37, 99, 235, 0.4);
            border: 1px solid rgba(96, 165, 250, 0.35);
        }
        .logo-item img.squircle {
            width: 52px;
            height: 52px;
            border-radius: 13px;
        }
        .pc-btn-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-top: 14px;
        }
        .pc-btn {
            padding: 11px 14px;
            border-radius: 12px;
            border: 1px solid rgba(96, 165, 250, 0.3);
            background: rgba(30, 41, 59, 0.8);
            color: #f8fafc;
            font-size: 12.5px;
            font-weight: 700;
            cursor: pointer;
            text-align: left;
            transition: all 0.18s ease;
        }
        .pc-btn:hover, .pc-btn.active {
            background: linear-gradient(135deg, #2563eb, #1d4ed8);
            border-color: #60a5fa;
        }
    </style>
</head>
<body>
    <!-- Khung mô phỏng iPhone 16 Pro Max -->
    <div class="iphone-bezel">
        <div class="iphone-screen">
            <div class="ios-statusbar">
                <span>9:41</span>
                <div class="dynamic-island">
                    <span class="di-wave"></span>
                    <span class="di-cam"></span>
                </div>
                <span>5G · 100%</span>
            </div>

            <div class="ios-viewport">
                <!-- Màn hình m.youtube.com -->
                <div class="ytm-view" id="ytmView">
                    <header class="ytm-topbar">
                        <div class="ytm-brand">
                            <img src="${squircleLogoUrl}" alt="FUNNYGAME iOS" />
                            <span class="ytm-brand-text">FUNNYGAME</span>
                            <span class="ytm-brand-badge">iOS VIP</span>
                        </div>
                        <div class="ytm-actions">
                            <span>🔍</span>
                            <span>📺</span>
                        </div>
                    </header>

                    <div class="ytm-player" id="demoPlayer" ondblclick="onDemoDoubleTap(event)">
                        <div class="hold-pill" id="holdPill">⏩ Chạm đúp Trái/Phải: ±10s · Nhấn giữ: 2x · Vuốt lên: Fullscreen</div>
                        <img src="${squircleLogoUrl}" class="player-center-logo" alt="FG" id="demoPlayerLogo" />
                        <div class="player-caption" id="demoPlayerCaption">Trình phát YouTube iOS không quảng cáo</div>
                        <div class="player-sub" id="demoPlayerSub">Phát nhạc tắt màn hình · PiP · Tắt hình tiết kiệm pin OLED</div>
                        <div class="player-progress"><div class="player-progress-bar"></div></div>
                    </div>

                    <!-- Thanh Công cụ Nhanh chuẩn App YouTube Premium ngay dưới video -->
                    <div class="ios-action-bar">
                        <button type="button" class="ios-chip" onclick="document.getElementById('holdPill').textContent='⏭️ Đã nhảy tới đoạn cao trào (Jump Ahead — YouTube Premium)'">⏭️ Đoạn hay nhất</button>
                        <button type="button" class="ios-chip active" onclick="this.classList.toggle('active'); this.textContent=this.classList.contains('active')?'📺 Tự động PiP: BẬT':'📺 Tự động PiP: TẮT'">📺 Tự động PiP: BẬT</button>
                        <button type="button" class="ios-chip" onclick="triggerPiP()">🗗 Mở PiP ngay</button>
                        <button type="button" class="ios-chip" id="demoSpeedChip" onclick="cycleDemoSpeed()">⚡ Tốc độ: 1x</button>
                        <button type="button" class="ios-chip" id="demoBoostChip" onclick="cycleDemoBoost()">🔊 Tăng âm: 100%</button>
                        <button type="button" class="ios-chip" id="demoAudioChip" onclick="toggleDemoOled()">🎧 Tắt hình (OLED)</button>
                        <button type="button" class="ios-chip" id="demoSleepChip" onclick="cycleDemoSleep()">🌙 Hẹn giờ: Tắt</button>
                        <button type="button" class="ios-chip" onclick="document.getElementById('holdPill').textContent='📸 Đã chụp khung hình gốc nét cao & mở bảng Lưu vào Ảnh iPhone'">📸 Chụp khung hình</button>
                        <button type="button" class="ios-chip" id="demoLoopChip" onclick="this.classList.toggle('active')">🔁 Lặp video</button>
                        <button type="button" class="ios-chip active">✨ 1080p Premium</button>
                        <button type="button" class="ios-chip" onclick="document.getElementById('holdPill').textContent='📤 Đã mở Bảng Chia sẻ Native iOS (AirDrop / Zalo / iMessage)'">📤 Chia sẻ</button>
                    </div>

                    <div class="ytm-body">
                        <div class="ytm-video-title">Tuyển tập Nhạc Chill Không Quảng Cáo — FUNNYGAME iOS v2.4.15</div>
                        <div class="ytm-meta">1,8 Tr lượt xem · Đã chặn 128 quảng cáo trên iPhone của bạn</div>
                        <div class="ytm-feature-pills">
                            <span class="ytm-pill active">⏭️ Nhảy tới đoạn hay nhất</span>
                            <span class="ytm-pill active">📺 Auto-PiP khi thoát App</span>
                            <span class="ytm-pill active">🌙 Hẹn giờ tắt (Sleep Timer)</span>
                            <span class="ytm-pill active">▶️ Tiếp tục xem vị trí đang dở</span>
                            <span class="ytm-pill active">☀️ Vuốt Cạnh chỉnh Sáng &amp; Âm lượng</span>
                            <span class="ytm-pill active">🔊 Khuếch đại âm lượng 200%</span>
                            <span class="ytm-pill active">📸 Chụp ảnh khung hình Video</span>
                        </div>

                        <div class="ytm-card">
                            <div class="ytm-thumb">0 QUẢNG CÁO</div>
                            <div>
                                <div style="font-size:13px;font-weight:700;color:#f8fafc;">Đã ẩn sạch Banner &amp; Popup mở App gốc</div>
                                <div style="font-size:11px;color:#94a3b8;margin-top:3px;">Tự động giữ bạn trong ứng dụng FUNNYGAME</div>
                            </div>
                        </div>

                        <div class="ytm-card">
                            <div class="ytm-thumb">LOCK SCREEN</div>
                            <div>
                                <div style="font-size:13px;font-weight:700;color:#f8fafc;">Điều khiển bài hát ngoài Màn hình khoá</div>
                                <div style="font-size:11px;color:#94a3b8;margin-top:3px;">Tích hợp MPNowPlayingInfoCenter &amp; Control Center</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Bảng điều khiển FUNNYGAME (Gộp toàn bộ Điều khiển & Cài đặt trên 1 màn hình duy nhất) -->
                <div class="ios-panel-container open" id="panelContainer">
                    <div class="ios-sheet-grabber-row"><div class="ios-sheet-grabber"></div></div>
                    <div class="ios-panel-header">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <img src="${squircleLogoUrl}" style="width:28px;height:28px;border-radius:7px;" alt="FG" />
                            <span style="font-size:15px;font-weight:800;color:#f8fafc;">Bảng điều khiển · Cài đặt</span>
                        </div>
                        <button type="button" class="ios-close-btn" onclick="closePanel()">Xong ✕</button>
                    </div>
                    <iframe class="ios-panel-iframe" id="panelFrame"></iframe>
                </div>
            </div>

            <!-- Thanh Dock 5 nút chuẩn Apple SF Symbols iPhone -->
            <nav class="ios-dock">
                <button type="button" class="ios-dock-btn" id="dockYt" onclick="closePanel()">
                    <span class="dock-ico">▶️</span><span>YouTube</span>
                </button>
                <button type="button" class="ios-dock-btn" onclick="closePanel()">
                    <span class="dock-ico">🎵</span><span>YT Music</span>
                </button>
                <button type="button" class="ios-dock-btn" onclick="closePanel()">
                    <span class="dock-ico">🎧</span><span>Spotify</span>
                </button>
                <button type="button" class="ios-dock-btn" onclick="triggerPiP()">
                    <span class="dock-ico">📺</span><span>PiP</span>
                </button>
                <button type="button" class="ios-dock-btn active" id="dockShield" onclick="showPanel('popup')">
                    <span class="dock-ico">⚙️</span><span>Cài đặt</span>
                    <span class="ios-dock-badge">128</span>
                </button>
            </nav>
            <div class="ios-home-bar"><div class="ios-home-pill"></div></div>
        </div>
    </div>

    <!-- Bảng kiểm tra nhanh trên PC -->
    <aside class="pc-inspector">
        <div class="pc-card">
            <h2>📱 Bản xem trước FUNNYGAME iOS trên PC</h2>
            <p>Nút <b>⚙️ Cài đặt</b> ở thanh dưới cùng giờ mở thẳng <b>Bảng điều khiển hợp nhất</b> (gồm cả Công tắc tổng, Thống kê 3 cột và toàn bộ Công tắc bật/tắt tính năng YouTube Premium trên cùng 1 trang cuộn mượt, không còn các thanh tab thừa).</p>

            <div class="logo-showcase">
                <div class="logo-item">
                    <img src="${appIconUrl}" class="appicon" alt="AppIcon 1024" />
                    <span>AppIcon Màn hình chính<br/>(1024×1024)</span>
                </div>
                <div class="logo-item">
                    <img src="${squircleLogoUrl}" class="squircle" alt="Squircle Logo" />
                    <span>Logo Bảng điều khiển<br/>&amp; Header iPhone</span>
                </div>
            </div>

            <div class="pc-btn-grid">
                <button class="pc-btn active" id="btnPopup" onclick="showPanel('popup')">⚙️ 1. Bảng Điều khiển &amp; Cài đặt hợp nhất</button>
                <button class="pc-btn" id="btnYt" onclick="closePanel()">▶️ 2. Trình phát YouTube Premium iPhone</button>
                <button class="pc-btn" id="btnLock" onclick="showPanel('locked')" style="grid-column: 1 / -1;">🔑 3. Xem thử Màn hình Khoá Key (License Gate)</button>
            </div>
        </div>
    </aside>

    <script>
        const PAGES = {
            popup: "${popupUnlockedB64}",
            locked: "${popupLockedB64}",
            stats: "${statsB64}",
            options: "${optionsB64}",
        };

        function decodeUtf8Base64(b64) {
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new TextDecoder("utf-8").decode(bytes);
        }

        function setActivePcBtn(id) {
            document.querySelectorAll(".pc-btn").forEach((b) => b.classList.remove("active"));
            const el = document.getElementById(id);
            if (el) el.classList.add("active");
        }

        function showPanel(kind) {
            const container = document.getElementById("panelContainer");
            const frame = document.getElementById("panelFrame");
            container.classList.add("open");
            document.getElementById("dockYt").classList.remove("active");
            document.getElementById("dockShield").classList.add("active");

            if (kind === "popup") setActivePcBtn("btnPopup");
            else if (kind === "locked") setActivePcBtn("btnLock");

            frame.srcdoc = decodeUtf8Base64(PAGES[kind] || PAGES.popup);
        }

        function closePanel() {
            document.getElementById("panelContainer").classList.remove("open");
            document.getElementById("dockShield").classList.remove("active");
            document.getElementById("dockYt").classList.add("active");
            setActivePcBtn("btnYt");
        }

        function triggerPiP() {
            closePanel();
            const pill = document.getElementById("holdPill");
            pill.textContent = "📺 Đã bật chế độ Hình-trong-hình (PiP) trên iOS";
        }

        const DEMO_SPEEDS = [1, 1.25, 1.5, 2, 0.75];
        let demoSpeedIdx = 0;
        function cycleDemoSpeed() {
            demoSpeedIdx = (demoSpeedIdx + 1) % DEMO_SPEEDS.length;
            const s = DEMO_SPEEDS[demoSpeedIdx];
            const chip = document.getElementById("demoSpeedChip");
            chip.textContent = "⚡ Tốc độ: " + s + "x";
            chip.classList.toggle("active", s !== 1);
            document.getElementById("holdPill").textContent = "⚡ Đã chuyển tốc độ phát sang " + s + "x";
        }

        const DEMO_BOOSTS = [100, 150, 200];
        let demoBoostIdx = 0;
        function cycleDemoBoost() {
            demoBoostIdx = (demoBoostIdx + 1) % DEMO_BOOSTS.length;
            const b = DEMO_BOOSTS[demoBoostIdx];
            const chip = document.getElementById("demoBoostChip");
            chip.textContent = "🔊 Tăng âm: " + b + "%";
            chip.classList.toggle("active", b > 100);
            document.getElementById("holdPill").textContent = "🔊 Đã khuếch đại âm lượng (WebAudio GainNode): " + b + "%";
        }

        const DEMO_SLEEPS = ["Tắt", "Hết video", "15p", "30p", "60p"];
        let demoSleepIdx = 0;
        function cycleDemoSleep() {
            demoSleepIdx = (demoSleepIdx + 1) % DEMO_SLEEPS.length;
            const label = DEMO_SLEEPS[demoSleepIdx];
            const chip = document.getElementById("demoSleepChip");
            chip.textContent = "🌙 Hẹn giờ: " + label;
            chip.classList.toggle("active", demoSleepIdx !== 0);
            document.getElementById("holdPill").textContent = demoSleepIdx === 0
                ? "🌙 Đã tắt Hẹn giờ đi ngủ"
                : "🌙 Tự động dừng phát sau: " + label;
        }

        let demoOled = false;
        function toggleDemoOled() {
            demoOled = !demoOled;
            document.getElementById("demoAudioChip").classList.toggle("active", demoOled);
            document.getElementById("demoPlayer").style.background = demoOled ? "#020306" : "";
            document.getElementById("demoPlayerCaption").textContent = demoOled
                ? "🎧 Đang bật Chế độ Chỉ nghe nhạc (Tiết kiệm pin OLED)"
                : "Trình phát YouTube iOS không quảng cáo";
            document.getElementById("holdPill").textContent = demoOled
                ? "🎧 Đã tắt hình video · Chỉ phát âm thanh nền tiết kiệm pin"
                : "🎬 Đã bật lại hình ảnh video";
        }

        function onDemoDoubleTap(e) {
            const rect = e.currentTarget.getBoundingClientRect();
            const left = (e.clientX - rect.left) < rect.width / 2;
            document.getElementById("holdPill").textContent = left ? "⏪ Đã chạm đúp tua lùi -10 giây" : "⏩ Đã chạm đúp tua tới +10 giây";
        }

        // Mặc định mở Bảng điều khiển (Popup iPhone) hoặc theo query ?view=yt
        const viewParam = new URLSearchParams(location.search).get("view");
        if (viewParam === "yt") closePanel();
        else if (viewParam === "stats") showPanel("stats");
        else if (viewParam === "options") showPanel("options");
        else showPanel("popup");
    </script>
</body>
</html>`;

const outFile = path.join(root, "ios", "preview-iphone.html");
fs.writeFileSync(outFile, previewHtml, "utf8");
console.log("Đã tạo trang mô phỏng iPhone:", outFile);
