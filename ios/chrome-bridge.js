// FUNNYGAME — Cầu nối WebExtension API (chrome.*) & Bộ nâng cấp iOS chuyên sâu (WKWebView)
// Đồng bộ trực tiếp với UserDefaults, UIPasteboard, MPNowPlayingInfoCenter & PiP trên iOS.
(function () {
    if (window.__fgIosBridgeReady) return;
    window.__fgIosBridgeReady = true;

    const DEFAULTS = {
        enabled: true,
        licenseValid: false,
        licenseExpires: "",
        licenseKey: "",
        adsBlocked: 0,
        dailyGoal: 50,
        whitelistChannels: [],
        statsBreakdown: { video: 0, banner: 0, overlay: 0, antiAdblock: 0, shopping: 0, spotify: 0 },
        statsHistory: [],
        userStats: { currentId: "guest", users: {} },
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
            videoQuality: "auto",
            sponsorBlock: true,
            jumpAhead: true,
            ambientGlow: false,
            customLogo: true,
        },
    };

    const initialLocal = (window.__FG_IOS_INITIAL_STORAGE__ && typeof window.__FG_IOS_INITIAL_STORAGE__ === "object")
        ? window.__FG_IOS_INITIAL_STORAGE__
        : {};
    const localStore = {
        ...DEFAULTS,
        ...initialLocal,
        settings: { ...DEFAULTS.settings, ...(initialLocal.settings || {}) },
        statsBreakdown: { ...DEFAULTS.statsBreakdown, ...(initialLocal.statsBreakdown || {}) },
    };
    const sessionStore = (window.__FG_IOS_INITIAL_SESSION__ && typeof window.__FG_IOS_INITIAL_SESSION__ === "object")
        ? { ...window.__FG_IOS_INITIAL_SESSION__ }
        : {};

    const storageListeners = new Set();
    const messageListeners = new Set();

    function postNative(payload) {
        try {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fgBridge) {
                window.webkit.messageHandlers.fgBridge.postMessage(payload);
            }
        } catch { /* ignore */ }
    }

    function clone(val) {
        try { return JSON.parse(JSON.stringify(val)); } catch { return val; }
    }

    function pickKeys(store, keys) {
        if (keys == null) return clone(store);
        if (typeof keys === "string") {
            return { [keys]: clone(store[keys]) };
        }
        if (Array.isArray(keys)) {
            const out = {};
            for (const k of keys) {
                if (k in store) out[k] = clone(store[k]);
            }
            return out;
        }
        if (typeof keys === "object") {
            const out = {};
            for (const k of Object.keys(keys)) {
                out[k] = (k in store && store[k] !== undefined) ? clone(store[k]) : clone(keys[k]);
            }
            return out;
        }
        return {};
    }

    function notifyStorageChange(changes, area) {
        if (!changes || !Object.keys(changes).length) return;
        for (const fn of storageListeners) {
            try { fn(clone(changes), area); } catch { /* ignore */ }
        }
        if (area === "local" && ("adsBlocked" in changes || "enabled" in changes)) {
            postNative({
                action: "updateBadge",
                adsBlocked: Number(localStore.adsBlocked || 0),
                enabled: localStore.enabled !== false,
            });
        }
    }

    // Được gọi từ Swift khi WKWebView khác (ví dụ popup.html) cập nhật dữ liệu
    window.__fgOnExternalStorageChange = function (patch, area) {
        if (!patch || typeof patch !== "object") return;
        const target = area === "session" ? sessionStore : localStore;
        const changes = {};
        for (const k of Object.keys(patch)) {
            const oldValue = clone(target[k]);
            const newValue = clone(patch[k]);
            target[k] = newValue;
            changes[k] = { oldValue, newValue };
        }
        notifyStorageChange(changes, area || "local");
    };

    // Được gọi từ Swift để chuyển tiếp message từ popup sang tab chính (ví dụ FG_COLLECT_DIAG)
    window.__fgDispatchRuntimeMessage = function (msg, reqId) {
        let responded = false;
        const sendResponse = (res) => {
            if (responded) return;
            responded = true;
            if (reqId) postNative({ action: "tabMessageResponse", reqId, response: res || null });
        };
        for (const fn of messageListeners) {
            try {
                const asyncFlag = fn(msg, { id: "funnygame-ios", tab: { id: 1, url: location.href } }, sendResponse);
                if (asyncFlag === true) return;
            } catch { /* ignore */ }
        }
        if (!responded && reqId) sendResponse(null);
    };

    const pendingTabCallbacks = new Map();
    window.__fgResolveTabMessage = function (reqId, response) {
        const cb = pendingTabCallbacks.get(reqId);
        if (cb) {
            pendingTabCallbacks.delete(reqId);
            try { cb(response); } catch { /* ignore */ }
        }
    };

    function makeStorageArea(store, areaName) {
        return {
            get(keys, cb) {
                const res = pickKeys(store, keys);
                if (typeof cb === "function") {
                    setTimeout(() => { try { cb(res); } catch { /* ignore */ } }, 0);
                }
                return Promise.resolve(res);
            },
            set(patch, cb) {
                const changes = {};
                if (patch && typeof patch === "object") {
                    for (const k of Object.keys(patch)) {
                        const oldValue = clone(store[k]);
                        const newValue = clone(patch[k]);
                        store[k] = newValue;
                        changes[k] = { oldValue, newValue };
                    }
                    postNative({ action: "storageSet", area: areaName, patch: clone(patch) });
                    notifyStorageChange(changes, areaName);
                }
                if (typeof cb === "function") {
                    setTimeout(() => { try { cb(); } catch { /* ignore */ } }, 0);
                }
                return Promise.resolve();
            },
            remove(keys, cb) {
                const list = Array.isArray(keys) ? keys : [keys];
                const changes = {};
                for (const k of list) {
                    if (k in store) {
                        changes[k] = { oldValue: clone(store[k]) };
                        delete store[k];
                    }
                }
                postNative({ action: "storageRemove", area: areaName, keys: list });
                notifyStorageChange(changes, areaName);
                if (typeof cb === "function") {
                    setTimeout(() => { try { cb(); } catch { /* ignore */ } }, 0);
                }
                return Promise.resolve();
            },
            setAccessLevel() { return Promise.resolve(); },
        };
    }

    const SB_CATEGORIES = ["sponsor", "selfpromo", "interaction"];
    const sbCache = new Map();

    async function sha256Hex(text) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    async function fetchSponsorSegments(videoId) {
        if (!/^[\w-]{6,20}$/.test(String(videoId || ""))) return [];
        if (sbCache.has(videoId)) return sbCache.get(videoId);
        let segments = [];
        try {
            const prefix = (await sha256Hex(videoId)).slice(0, 4);
            const url = "https://sponsor.ajay.app/api/skipSegments/" + prefix +
                "?categories=" + encodeURIComponent(JSON.stringify(SB_CATEGORIES)) +
                "&actionTypes=" + encodeURIComponent(JSON.stringify(["skip"]));
            const res = await fetch(url);
            if (res.ok) {
                const list = await res.json();
                const hit = Array.isArray(list) ? list.find((v) => v && v.videoID === videoId) : null;
                segments = ((hit && hit.segments) || [])
                    .filter((x) => x && Array.isArray(x.segment) && SB_CATEGORIES.includes(x.category) && (x.actionType || "skip") === "skip")
                    .map((x) => ({ start: Number(x.segment[0]), end: Number(x.segment[1]), category: x.category, uuid: String(x.UUID || "") }))
                    .filter((x) => isFinite(x.start) && isFinite(x.end) && x.end - x.start >= 1);
            }
        } catch { /* ignore */ }
        sbCache.set(videoId, segments);
        return segments;
    }

    function handleRuntimeMessage(msg, cb) {
        const reply = (val) => {
            if (typeof cb === "function") {
                setTimeout(() => { try { cb(val); } catch { /* ignore */ } }, 0);
            }
            return Promise.resolve(val);
        };
        if (!msg || typeof msg !== "object") return reply({ ok: false });

        if (msg.type === "FG_OPEN_PANEL") {
            postNative({ action: "openPanel", page: "popup.html" });
            return reply({ ok: true });
        }
        if (msg.type === "LICENSE_SYNC") {
            postNative({ action: "licenseSync" });
            return reply({ ok: true });
        }
        if (msg.type === "FG_MUTE_TAB") {
            try {
                document.querySelectorAll("video, audio").forEach((m) => { m.muted = !!msg.muted; });
            } catch { /* ignore */ }
            return reply({ ok: true });
        }
        if (msg.type === "FG_SB_SEGMENTS") {
            if (localStore.settings && localStore.settings.sponsorBlock === false) {
                return reply({ segments: [] });
            }
            return fetchSponsorSegments(msg.videoId).then((segments) => {
                if (typeof cb === "function") {
                    try { cb({ segments }); } catch { /* ignore */ }
                }
                return { segments };
            });
        }
        return reply({ ok: true });
    }

    const I18N_MAP = {
        extName: "FUNNYGAME Chặn Quảng Cáo YouTube & Spotify",
        extDescription: "Chặn quảng cáo YouTube 3 lớp và Spotify Web Player.",
    };

    window.chrome = window.chrome || {};
    window.chrome.storage = {
        local: makeStorageArea(localStore, "local"),
        session: makeStorageArea(sessionStore, "session"),
        onChanged: {
            addListener(fn) { if (typeof fn === "function") storageListeners.add(fn); },
            removeListener(fn) { storageListeners.delete(fn); },
        },
    };

    window.chrome.runtime = {
        id: "funnygame-ios-app",
        lastError: null,
        getManifest() {
            return {
                name: I18N_MAP.extName,
                description: I18N_MAP.extDescription,
                version: window.__FG_IOS_VERSION__ || "2.4.15",
                manifest_version: 3,
            };
        },
        getURL(path) {
            const clean = String(path || "").replace(/^\//, "");
            if (clean === "images/fg-logo-yt.png" && window.__FG_IOS_LOGO_DATA_URL__) {
                return window.__FG_IOS_LOGO_DATA_URL__;
            }
            if (clean === "images/icon48.png" && window.__FG_IOS_ICON_DATA_URL__) {
                return window.__FG_IOS_ICON_DATA_URL__;
            }
            return clean;
        },
        sendMessage(msg, cb) {
            return handleRuntimeMessage(msg, cb);
        },
        onMessage: {
            addListener(fn) { if (typeof fn === "function") messageListeners.add(fn); },
            removeListener(fn) { messageListeners.delete(fn); },
        },
    };

    window.chrome.tabs = {
        query(_queryInfo, cb) {
            const tabs = [{ id: 1, active: true, url: window.__FG_IOS_MAIN_URL__ || location.href }];
            if (typeof cb === "function") {
                setTimeout(() => { try { cb(tabs); } catch { /* ignore */ } }, 0);
            }
            return Promise.resolve(tabs);
        },
        sendMessage(_tabId, msg, cb) {
            const reqId = "req_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
            return new Promise((resolve) => {
                const timer = setTimeout(() => {
                    pendingTabCallbacks.delete(reqId);
                    if (typeof cb === "function") { try { cb(null); } catch { /* ignore */ } }
                    resolve(null);
                }, 2500);
                pendingTabCallbacks.set(reqId, (res) => {
                    clearTimeout(timer);
                    if (typeof cb === "function") { try { cb(res); } catch { /* ignore */ } }
                    resolve(res);
                });
                postNative({ action: "sendMessageToMainTab", reqId, msg });
            });
        },
        create(createProperties, cb) {
            const url = (createProperties && createProperties.url) || "";
            if (/stats\.html|options\.html|popup\.html/i.test(url)) {
                const page = url.split("/").pop();
                postNative({ action: "openPanel", page });
            } else if (url) {
                postNative({ action: "openUrl", url });
            }
            if (typeof cb === "function") {
                setTimeout(() => { try { cb({ id: 2, url }); } catch { /* ignore */ } }, 0);
            }
            return Promise.resolve({ id: 2, url });
        },
        update(_tabId, _updateProps, cb) {
            if (typeof cb === "function") setTimeout(() => { try { cb({}); } catch { /* ignore */ } }, 0);
            return Promise.resolve({});
        },
    };

    window.chrome.i18n = {
        getMessage(key) {
            return I18N_MAP[key] || "";
        },
    };

    // ---------- Hỗ trợ Clipboard qua UIPasteboard gốc của iOS ----------
    try {
        const origWriteText = navigator.clipboard && navigator.clipboard.writeText
            ? navigator.clipboard.writeText.bind(navigator.clipboard)
            : null;
        const writeClipboard = async (text) => {
            postNative({ action: "copyClipboard", text: String(text || "") });
            if (origWriteText) {
                try { await origWriteText(text); } catch { /* ignore */ }
            }
        };
        if (navigator.clipboard) {
            navigator.clipboard.writeText = writeClipboard;
        } else {
            Object.defineProperty(navigator, "clipboard", {
                configurable: true,
                value: { writeText: writeClipboard },
            });
        }
    } catch { /* ignore */ }

    // ---------- Mở khoá & Tự động bật Picture-in-Picture (Auto-PiP) chuẩn iOS ----------
    // Chặn YouTube khoá tính năng Picture-in-Picture trên phần tử <video>
    try {
        Object.defineProperty(HTMLVideoElement.prototype, "disablePictureInPicture", {
            configurable: true,
            get() { return false; },
            set() {},
        });
        Object.defineProperty(HTMLVideoElement.prototype, "webkitWirelessVideoPlaybackDisabled", {
            configurable: true,
            get() { return false; },
            set() {},
        });
    } catch { /* ignore */ }

    let autoPipActive = false;
    let wasPlayingBeforeHide = false;

    function isAutoPipSettingOn() {
        return localStore.enabled !== false && (!localStore.settings || localStore.settings.pipButton !== false);
    }

    function prepareVideoForAutoPiP(v) {
        if (!v || v.tagName !== "VIDEO") return;
        try {
            v.removeAttribute("disablepictureinpicture");
            v.setAttribute("playsinline", "");
            v.setAttribute("webkit-playsinline", "");
            if (isAutoPipSettingOn()) {
                v.setAttribute("autopictureinpicture", "");
                v.autoPictureInPicture = true;
            } else {
                v.removeAttribute("autopictureinpicture");
                v.autoPictureInPicture = false;
            }
        } catch { /* ignore */ }
    }

    function findMainPlayingVideo() {
        const player = document.querySelector("#movie_player, .html5-video-player, #player-container-id, ytm-player");
        if (player && player.classList && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting"))) {
            return null;
        }
        const videos = [...document.querySelectorAll("video")];
        const v = videos.find((el) => el.readyState >= 1 && (el.offsetWidth > 0 || el.offsetHeight > 0)) || videos[0];
        if (!v) return null;
        prepareVideoForAutoPiP(v);
        return v;
    }

    // Gọi tự động khi vuốt thanh Home lên để thoát ra màn hình chính (willResignActive / visibilitychange)
    window.__fgAutoEnterPiP = function () {
        try {
            if (!isAutoPipSettingOn()) return "disabled";
            if (document.documentElement.classList.contains("fg-audio-only")) return "audio-only";
            const v = findMainPlayingVideo();
            if (!v || v.paused || v.ended || v.currentTime <= 0) return "not-playing";
            wasPlayingBeforeHide = true;
            if (typeof v.webkitSupportsPresentationMode === "function" && typeof v.webkitSetPresentationMode === "function") {
                if (v.webkitPresentationMode !== "picture-in-picture") {
                    v.webkitSetPresentationMode("picture-in-picture");
                    autoPipActive = true;
                }
                return "picture-in-picture";
            }
            if (!document.pictureInPictureElement && typeof v.requestPictureInPicture === "function") {
                v.requestPictureInPicture().catch(() => {});
                autoPipActive = true;
                return "picture-in-picture";
            }
        } catch { /* ignore */ }
        return "ignored";
    };

    // Gọi tự động khi người dùng mở lại App FUNNYGAME (didBecomeActive)
    window.__fgAutoExitPiP = function () {
        try {
            if (!autoPipActive) return;
            autoPipActive = false;
            const v = findMainPlayingVideo();
            if (!v) return;
            if (typeof v.webkitSetPresentationMode === "function" && v.webkitPresentationMode === "picture-in-picture") {
                v.webkitSetPresentationMode("inline");
            } else if (document.pictureInPictureElement && typeof document.exitPictureInPicture === "function") {
                document.exitPictureInPicture().catch(() => {});
            }
        } catch { /* ignore */ }
    };

    window.__fgShouldKeepPlaying = function () {
        return wasPlayingBeforeHide;
    };

    // ---------- Hàm điều khiển Picture-in-Picture (PiP) & Media từ thanh Native iOS ----------
    window.__fgTogglePiP = function () {
        try {
            const v = findMainPlayingVideo();
            if (!v) return "no-video";
            if (typeof v.webkitSupportsPresentationMode === "function" && typeof v.webkitSetPresentationMode === "function") {
                const cur = v.webkitPresentationMode;
                const next = cur === "picture-in-picture" ? "inline" : "picture-in-picture";
                v.webkitSetPresentationMode(next);
                autoPipActive = (next === "picture-in-picture");
                return next;
            }
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture();
                autoPipActive = false;
                return "inline";
            }
            if (typeof v.requestPictureInPicture === "function") {
                v.requestPictureInPicture();
                autoPipActive = true;
                return "picture-in-picture";
            }
        } catch { /* ignore */ }
        return "unsupported";
    };

    window.__fgRemoteCommand = function (cmd, value) {
        try {
            const v = document.querySelector("video.html5-main-video, video, audio");
            if (!v) return;
            if (cmd === "play") v.play().catch(() => {});
            else if (cmd === "pause") v.pause();
            else if (cmd === "toggle") {
                if (v.paused) v.play().catch(() => {});
                else v.pause();
            } else if (cmd === "seek" && typeof value === "number" && isFinite(value)) {
                v.currentTime = Math.max(0, v.currentTime + value);
            } else if (cmd === "seekTo" && typeof value === "number" && isFinite(value)) {
                v.currentTime = Math.max(0, value);
            } else if (cmd === "next") {
                const nextBtn = document.querySelector(
                    ".ytp-next-button, button[aria-label*='Next'], button[aria-label*='Tiếp'], [data-testid='control-button-skip-forward']"
                );
                if (nextBtn) nextBtn.click();
            } else if (cmd === "prev") {
                const prevBtn = document.querySelector(
                    ".ytp-prev-button, button[aria-label*='Previous'], [data-testid='control-button-skip-back']"
                );
                if (prevBtn) prevBtn.click();
            }
        } catch { /* ignore */ }
    };

    // ---------- Bộ nâng cấp giao diện & cử chỉ iOS cho YouTube / YT Music / Spotify ----------
    if (!/youtube\.com|spotify\.com/i.test(location.hostname)) return;

    const IOS_EXTRA_CSS = `
        /* Ẩn nút "Chặn QC" nổi trên web vì đã có thanh Dock Native của App iOS ở dưới cùng */
        #fg-mobile-open {
            display: none !important;
        }
        /* Ẩn triệt để mọi banner thúc ép mở App YouTube / Spotify gốc trên iOS */
        ytm-mealbar-promo-renderer,
        ytm-app-promo-banner-renderer,
        ytm-Clarification-renderer,
        ytm-statement-banner-renderer,
        .mobile-topbar-header-open-app,
        a[href^="vnd.youtube://"],
        a[href^="youtube://"],
        a[href*="itms-apps://"],
        [data-testid="open-in-app"],
        [data-testid="smart-banner"],
        .smartbanner {
            display: none !important;
        }
        /* Ẩn sạch các slot quảng cáo đặc thù của giao diện di động m.youtube.com */
        html.fg-block-banner ytm-promoted-sparkles-web-renderer,
        html.fg-block-banner ytm-promoted-video-renderer,
        html.fg-block-banner ytm-companion-ad-renderer,
        html.fg-block-banner ytm-ad-slot-renderer,
        html.fg-block-banner ytm-in-feed-ad-layout-renderer,
        html.fg-block-banner ytm-rich-item-renderer:has(ytm-ad-slot-renderer),
        html.fg-block-banner ytm-reel-item-renderer:has(ytm-ad-slot-renderer) {
            display: none !important;
        }
        /* Nhãn báo Nhấn giữ 2x Speed kiểu YouTube Premium */
        #__fg_hold_2x_badge {
            position: fixed;
            top: calc(env(safe-area-inset-top, 12px) + 14px);
            left: 50%;
            transform: translateX(-50%) scale(0.92);
            z-index: 2147483646;
            padding: 6px 14px;
            border-radius: 999px;
            background: rgba(15, 15, 20, 0.85);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.16);
            color: #fff;
            font: 700 13px/1.2 -apple-system, BlinkMacSystemFont, sans-serif;
            letter-spacing: 0.02em;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.15s ease, transform 0.15s ease;
        }
        #__fg_hold_2x_badge.fg-show {
            opacity: 1;
            transform: translateX(-50%) scale(1);
        }
        /* Tối ưu thanh Pivot Bar của m.youtube.com theo phong cách kính mờ iOS 18 */
        ytm-pivot-bar-renderer {
            background: rgba(12, 14, 22, 0.88) !important;
            backdrop-filter: blur(20px) !important;
            -webkit-backdrop-filter: blur(20px) !important;
            border-top: 0.5px solid rgba(255, 255, 255, 0.10) !important;
        }
        /* Thanh Công cụ Nhanh kiểu App YouTube gốc ngay dưới video trên iPhone */
        #__fg_ios_action_bar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            overflow-x: auto;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
            background: rgba(10, 12, 20, 0.94);
            border-bottom: 0.5px solid rgba(255, 255, 255, 0.08);
        }
        #__fg_ios_action_bar::-webkit-scrollbar {
            display: none;
        }
        .fg-ios-chip {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 6px 12px;
            border-radius: 999px;
            border: 0.5px solid rgba(255, 255, 255, 0.14);
            background: rgba(255, 255, 255, 0.07);
            color: #f8fafc;
            font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
            white-space: nowrap;
            cursor: pointer;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
            transition: transform 0.12s ease, background 0.15s ease;
        }
        .fg-ios-chip:active {
            transform: scale(0.94);
        }
        .fg-ios-chip.fg-active {
            background: rgba(37, 99, 235, 0.25);
            border-color: rgba(96, 165, 250, 0.55);
            color: #93c5fd;
        }
        /* Chế độ Chỉ nghe âm thanh (Tắt hình tiết kiệm pin OLED iPhone) */
        html.fg-audio-only #movie_player video,
        html.fg-audio-only .html5-video-player video {
            opacity: 0.02 !important;
            filter: brightness(0) !important;
        }
        #__fg_audio_only_banner {
            position: absolute;
            inset: 0;
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            background: radial-gradient(circle, rgba(15, 23, 42, 0.92) 0%, rgba(5, 7, 15, 0.98) 100%);
            color: #93c5fd;
            font: 700 13px/1.35 -apple-system, BlinkMacSystemFont, sans-serif;
            z-index: 25;
            text-align: center;
            padding: 16px;
        }
        html.fg-audio-only #__fg_audio_only_banner {
            display: flex !important;
        }
        /* Hiệu ứng Sóng tròn Chạm đúp tua ±10 giây như App YouTube gốc */
        .__fg_seek_ripple {
            position: absolute;
            top: 50%;
            transform: translateY(-50%) scale(0.85);
            padding: 10px 16px;
            border-radius: 999px;
            background: rgba(15, 18, 28, 0.82);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.18);
            color: #fff;
            font: 800 13px/1 -apple-system, BlinkMacSystemFont, sans-serif;
            pointer-events: none;
            z-index: 2147483645;
            opacity: 0;
            transition: opacity 0.18s ease, transform 0.18s ease;
        }
        .__fg_seek_ripple.fg-left { left: 12%; }
        .__fg_seek_ripple.fg-right { right: 12%; }
        .__fg_seek_ripple.fg-show {
            opacity: 1;
            transform: translateY(-50%) scale(1);
        }
    `;

    function buildLogoCss() {
        const logoUrl = window.__FG_IOS_LOGO_DATA_URL__ || window.__FG_IOS_YT_LOGO_DATA_URL__ || "";
        if (!logoUrl) return "";
        return `
        /* Logo FUNNYGAME chuẩn giao diện iPhone cho thanh đầu trang m.youtube.com & www.youtube.com */
        html.fg-logo-on ytm-mobile-topbar-renderer c3-icon#home-icon svg,
        html.fg-logo-on ytm-mobile-topbar-renderer .mobile-topbar-logo svg,
        html.fg-logo-on ytm-logo-entity svg,
        html.fg-logo-on ytd-topbar-logo-renderer #logo-icon svg,
        html.fg-logo-on ytd-topbar-logo-renderer #country-code {
            display: none !important;
        }
        html.fg-logo-on ytm-mobile-topbar-renderer c3-icon#home-icon,
        html.fg-logo-on ytm-mobile-topbar-renderer .mobile-topbar-logo,
        html.fg-logo-on ytm-logo-entity,
        html.fg-logo-on ytd-topbar-logo-renderer #logo-icon {
            display: inline-flex !important;
            align-items: center !important;
            gap: 7px !important;
            width: auto !important;
            height: 28px !important;
            text-decoration: none !important;
        }
        html.fg-logo-on ytm-mobile-topbar-renderer c3-icon#home-icon::before,
        html.fg-logo-on ytm-mobile-topbar-renderer .mobile-topbar-logo::before,
        html.fg-logo-on ytm-logo-entity::before,
        html.fg-logo-on ytd-topbar-logo-renderer #logo-icon::before {
            content: "" !important;
            display: inline-block !important;
            width: 26px !important;
            height: 26px !important;
            border-radius: 7px !important;
            background: url("${logoUrl}") center / cover no-repeat !important;
            box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35) !important;
            flex-shrink: 0 !important;
        }
        html.fg-logo-on ytm-mobile-topbar-renderer c3-icon#home-icon::after,
        html.fg-logo-on ytm-mobile-topbar-renderer .mobile-topbar-logo::after,
        html.fg-logo-on ytm-logo-entity::after,
        html.fg-logo-on ytd-topbar-logo-renderer #logo-icon::after {
            content: "FUNNYGAME" !important;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif !important;
            font-size: 15.5px !important;
            font-weight: 800 !important;
            letter-spacing: -0.02em !important;
            color: #f8fafc !important;
            line-height: 1 !important;
            white-space: nowrap !important;
        }
        `;
    }

    function injectIosExtraCss() {
        if (document.getElementById("__fg_ios_extra_css")) return;
        const s = document.createElement("style");
        s.id = "__fg_ios_extra_css";
        s.textContent = IOS_EXTRA_CSS + "\n" + buildLogoCss();
        (document.head || document.documentElement).appendChild(s);
    }
    if (document.head || document.documentElement) injectIosExtraCss();
    else document.addEventListener("DOMContentLoaded", injectIosExtraCss, { once: true });

    // ---------- Nhấn giữ màn hình video để phát tốc độ 2x (Hold for 2x Speed) ----------
    let holdTimer = null;
    let holdActive = false;
    let savedHoldRate = 1;
    let holdVideo = null;
    let startX = 0;
    let startY = 0;

    function showHoldBadge(on) {
        let badge = document.getElementById("__fg_hold_2x_badge");
        if (!badge && on && document.body) {
            badge = document.createElement("div");
            badge.id = "__fg_hold_2x_badge";
            badge.textContent = "⏩ Đang phát 2x";
            document.body.appendChild(badge);
        }
        if (badge) badge.classList.toggle("fg-show", !!on);
    }

    function endHold2x() {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
        if (!holdActive) return;
        holdActive = false;
        if (holdVideo && holdVideo.playbackRate === 2) {
            try { holdVideo.playbackRate = savedHoldRate; } catch { /* ignore */ }
        }
        holdVideo = null;
        showHoldBadge(false);
    }

    document.addEventListener("touchstart", (e) => {
        if (!e.touches || e.touches.length !== 1) {
            endHold2x();
            return;
        }
        const t = e.target;
        if (!t || !t.closest) return;
        // Không kích hoạt khi đang chạm vào nút bấm hoặc thanh tua
        if (t.closest("button, a, input, [role='button'], [role='slider'], .ytp-chrome-bottom, ytm-custom-control")) return;
        const player = t.closest("#movie_player, .html5-video-player, #player-container-id, ytm-player");
        if (!player) return;
        if (player.classList && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting"))) return;
        const v = player.querySelector("video") || document.querySelector("video");
        if (!v || v.paused || v.playbackRate > 3) return;

        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        if (holdTimer) clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
            if (!v || v.paused) return;
            savedHoldRate = (v.playbackRate > 0 && v.playbackRate <= 4) ? v.playbackRate : 1;
            holdVideo = v;
            holdActive = true;
            try { v.playbackRate = 2; } catch { /* ignore */ }
            showHoldBadge(true);
            postNative({ action: "haptic", style: "light" });
        }, 420);
    }, { passive: true });

    document.addEventListener("touchmove", (e) => {
        if (!holdTimer && !holdActive) return;
        if (!e.touches || !e.touches.length) return;
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 18 || dy > 18) endHold2x();
    }, { passive: true });

    document.addEventListener("touchend", endHold2x, { passive: true });
    document.addEventListener("touchcancel", endHold2x, { passive: true });

    // ---------- Chạm đúp Trái/Phải tua ±10s & Vuốt lên Toàn màn hình như App YouTube gốc ----------
    let lastTapTime = 0;
    let lastTapSide = "";
    let rippleTimeout = null;
    let swipeStartX = 0;
    let swipeStartY = 0;
    let swipePlayer = null;

    function showSeekRipple(player, side, text) {
        let el = player.querySelector(".__fg_seek_ripple");
        if (!el) {
            el = document.createElement("div");
            el.className = "__fg_seek_ripple";
            player.appendChild(el);
        }
        el.className = "__fg_seek_ripple " + (side === "left" ? "fg-left" : "fg-right");
        el.textContent = text;
        void el.offsetWidth;
        el.classList.add("fg-show");
        if (rippleTimeout) clearTimeout(rippleTimeout);
        rippleTimeout = setTimeout(() => {
            el.classList.remove("fg-show");
        }, 550);
    }

    document.addEventListener("touchstart", (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        const t = e.target;
        if (!t || !t.closest) return;
        if (t.closest("button, a, input, [role='button'], [role='slider'], .ytp-chrome-bottom, #__fg_ios_action_bar")) return;
        const player = t.closest("#movie_player, .html5-video-player, #player-container-id, ytm-player");
        if (!player) return;
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
        swipePlayer = player;
    }, { passive: true });

    document.addEventListener("touchend", (e) => {
        if (!swipePlayer || !e.changedTouches || !e.changedTouches.length) return;
        const player = swipePlayer;
        swipePlayer = null;
        if (player.classList && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting"))) return;
        const v = player.querySelector("video") || document.querySelector("video");
        if (!v) return;

        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const dx = endX - swipeStartX;
        const dy = endY - swipeStartY;

        // Vuốt dọc trên trình phát: Vuốt lên -> Toàn màn hình, Vuốt xuống -> Thoát Toàn màn hình
        if (Math.abs(dy) > 62 && Math.abs(dy) > Math.abs(dx) * 1.7) {
            if (dy < 0) {
                try {
                    if (typeof v.webkitEnterFullscreen === "function") v.webkitEnterFullscreen();
                    else if (player.requestFullscreen) player.requestFullscreen();
                    postNative({ action: "haptic" });
                } catch { /* ignore */ }
            } else {
                try {
                    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
                    else if (typeof v.webkitExitFullscreen === "function") v.webkitExitFullscreen();
                    postNative({ action: "haptic" });
                } catch { /* ignore */ }
            }
            return;
        }

        // Chạm đúp 2 bên mép trình phát (Trái 32% / Phải 32%) để tua ±10 giây
        if (Math.abs(dx) < 16 && Math.abs(dy) < 16) {
            const rect = player.getBoundingClientRect();
            if (!rect || rect.width < 120) return;
            const relX = (endX - rect.left) / rect.width;
            const side = relX < 0.32 ? "left" : (relX > 0.68 ? "right" : "");
            if (!side) return;
            const now = Date.now();
            if (now - lastTapTime < 280 && lastTapSide === side) {
                const delta = side === "left" ? -10 : 10;
                try {
                    v.currentTime = Math.max(0, Math.min(v.duration || 999999, v.currentTime + delta));
                    showSeekRipple(player, side, side === "left" ? "⏪ -10 giây" : "10 giây ⏩");
                    postNative({ action: "haptic" });
                } catch { /* ignore */ }
                lastTapTime = 0;
            } else {
                lastTapTime = now;
                lastTapSide = side;
            }
        }
    }, { passive: true });

    // ---------- Thanh Công cụ Nhanh chuẩn App YouTube Premium dưới trình phát iPhone ----------
    const SPEED_STEPS = [1, 1.25, 1.5, 2, 0.75];
    let currentUserSpeed = 1;

    // YouTube Premium: Hẹn giờ đi ngủ (Sleep Timer)
    const SLEEP_STEPS = [
        { min: 0, label: "Tắt" },
        { min: -1, label: "Hết video" },
        { min: 15, label: "15p" },
        { min: 30, label: "30p" },
        { min: 60, label: "60p" },
    ];
    let sleepStepIdx = 0;
    let sleepTimerId = null;

    function applySleepTimer() {
        if (sleepTimerId) {
            clearTimeout(sleepTimerId);
            sleepTimerId = null;
        }
        const step = SLEEP_STEPS[sleepStepIdx];
        if (step.min > 0) {
            sleepTimerId = setTimeout(() => {
                const v = document.querySelector("video.html5-main-video, video, audio");
                if (v && !v.paused) {
                    try { v.pause(); } catch { /* ignore */ }
                }
                sleepStepIdx = 0;
                const chip = document.getElementById("__fg_chip_sleep");
                if (chip) {
                    chip.textContent = "🌙 Hẹn giờ: Tắt";
                    chip.classList.remove("fg-active");
                }
                postNative({ action: "toast", text: "🌙 Hẹn giờ tắt đã kích hoạt — Chúc bạn ngủ ngon!" });
            }, step.min * 60 * 1000);
        }
    }

    document.addEventListener("ended", (ev) => {
        if (SLEEP_STEPS[sleepStepIdx] && SLEEP_STEPS[sleepStepIdx].min === -1) {
            const v = ev.target;
            if (v && (v.tagName === "VIDEO" || v.tagName === "AUDIO")) {
                try { v.pause(); } catch { /* ignore */ }
                sleepStepIdx = 0;
                const chip = document.getElementById("__fg_chip_sleep");
                if (chip) {
                    chip.textContent = "🌙 Hẹn giờ: Tắt";
                    chip.classList.remove("fg-active");
                }
                postNative({ action: "toast", text: "🌙 Đã dừng phát khi hết video theo Hẹn giờ" });
            }
        }
    }, true);

    // YouTube Premium: Tự động nhớ vị trí đang xem dở (Continue Watching) & Tự khóa 1080p Premium
    const RESUME_KEY = "__fg_resume_map_v1";
    let lastRestoredVid = "";
    function getVideoIdFromUrl() {
        try {
            const u = new URL(location.href);
            return u.searchParams.get("v") || "";
        } catch {
            return "";
        }
    }

    function saveWatchProgress(v) {
        if (!v || !isFinite(v.duration) || v.duration < 60) return;
        const vid = getVideoIdFromUrl();
        if (!vid) return;
        try {
            const raw = localStorage.getItem(RESUME_KEY);
            const map = raw ? JSON.parse(raw) : {};
            if (v.currentTime > 10 && v.currentTime < v.duration - 15) {
                map[vid] = Math.floor(v.currentTime);
            } else if (v.currentTime >= v.duration - 15) {
                delete map[vid];
            }
            const keys = Object.keys(map);
            if (keys.length > 80) delete map[keys[0]];
            localStorage.setItem(RESUME_KEY, JSON.stringify(map));
        } catch { /* ignore */ }
    }

    function restoreWatchProgressAndQuality(v) {
        if (!v) return;
        // 1. Tự động áp dụng chất lượng cao (1080p Premium / 4K) theo cài đặt
        try {
            const prefQ = (localStore.settings && localStore.settings.videoQuality) || "hd1080";
            if (prefQ && prefQ !== "auto") {
                const mp = document.getElementById("movie_player");
                if (mp && typeof mp.setPlaybackQualityRange === "function") {
                    mp.setPlaybackQualityRange(prefQ, "highres");
                }
            }
        } catch { /* ignore */ }

        // 2. Tiếp tục xem từ vị trí đang dở
        const vid = getVideoIdFromUrl();
        if (!vid || vid === lastRestoredVid) return;
        lastRestoredVid = vid;
        try {
            const raw = localStorage.getItem(RESUME_KEY);
            const map = raw ? JSON.parse(raw) : {};
            const savedSec = map[vid];
            if (savedSec && savedSec > 10 && v.currentTime < 5 && (!isFinite(v.duration) || savedSec < v.duration - 15)) {
                v.currentTime = savedSec;
                const mins = Math.floor(savedSec / 60);
                const secs = String(savedSec % 60).padStart(2, "0");
                postNative({ action: "toast", text: `▶️ Tiếp tục xem từ ${mins}:${secs}` });
            }
        } catch { /* ignore */ }
    }

    setInterval(() => {
        const v = document.querySelector("video.html5-main-video, video");
        if (v && !v.paused) saveWatchProgress(v);
    }, 5000);

    function ensureIosActionBar() {
        if (!/youtube\.com/i.test(location.hostname)) return;
        const isWatch = location.pathname.startsWith("/watch");
        const existing = document.getElementById("__fg_ios_action_bar");
        if (!isWatch) {
            if (existing) existing.style.display = "none";
            return;
        }
        const anchor = document.querySelector("ytm-slim-video-metadata-section-renderer, .slim-video-metadata-header, #below, ytm-item-section-renderer");
        if (!anchor || !anchor.parentNode) return;

        let bar = existing;
        if (!bar) {
            bar = document.createElement("div");
            bar.id = "__fg_ios_action_bar";
            const autoPipOn = isAutoPipSettingOn();
            bar.innerHTML = `
                <button type="button" class="fg-ios-chip" data-act="jump" id="__fg_chip_jump">⏭️ Đoạn hay nhất</button>
                <button type="button" class="fg-ios-chip ${autoPipOn ? "fg-active" : ""}" data-act="autopip" id="__fg_chip_autopip">📺 Tự động PiP: ${autoPipOn ? "BẬT" : "TẮT"}</button>
                <button type="button" class="fg-ios-chip" data-act="pip">🗗 Mở PiP ngay</button>
                <button type="button" class="fg-ios-chip" data-act="speed" id="__fg_chip_speed">⚡ Tốc độ: 1x</button>
                <button type="button" class="fg-ios-chip" data-act="audio" id="__fg_chip_audio">🎧 Tắt hình (OLED)</button>
                <button type="button" class="fg-ios-chip" data-act="sleep" id="__fg_chip_sleep">🌙 Hẹn giờ: Tắt</button>
                <button type="button" class="fg-ios-chip" data-act="loop" id="__fg_chip_loop">🔁 Lặp video</button>
                <button type="button" class="fg-ios-chip" data-act="hd">✨ 1080p Premium</button>
                <button type="button" class="fg-ios-chip" data-act="share">📤 Chia sẻ</button>
            `;
            bar.addEventListener("click", (ev) => {
                const btn = ev.target && ev.target.closest ? ev.target.closest(".fg-ios-chip") : null;
                if (!btn) return;
                const act = btn.getAttribute("data-act");
                const v = document.querySelector("video.html5-main-video, video");
                if (act === "jump") {
                    postNative({ action: "haptic" });
                    if (typeof window.__fgJumpAhead === "function") {
                        const msg = window.__fgJumpAhead();
                        if (msg) postNative({ action: "toast", text: msg });
                    } else if (v) {
                        v.currentTime = Math.min(v.duration || 999999, v.currentTime + 15);
                        postNative({ action: "toast", text: "⏭️ Đã nhảy nhanh +15s qua đoạn mở đầu" });
                    }
                } else if (act === "autopip") {
                    const next = !isAutoPipSettingOn();
                    localStore.settings = { ...(localStore.settings || {}), pipButton: next };
                    postNative({ action: "storageSet", area: "local", patch: { settings: clone(localStore.settings) } });
                    btn.textContent = "📺 Tự động PiP: " + (next ? "BẬT" : "TẮT");
                    btn.classList.toggle("fg-active", next);
                    if (v) prepareVideoForAutoPiP(v);
                    postNative({ action: "toast", text: next ? "📺 Đã BẬT Tự động Hình-trong-hình khi vuốt thoát App" : "📺 Đã TẮT Tự động Hình-trong-hình" });
                } else if (act === "pip") {
                    const state = window.__fgTogglePiP();
                    postNative({ action: "toast", text: state === "picture-in-picture" ? "📺 Đã bật Hình-trong-hình (PiP)" : "📺 Đã thu về trình phát chính" });
                } else if (act === "speed") {
                    const idx = (SPEED_STEPS.indexOf(currentUserSpeed) + 1) % SPEED_STEPS.length;
                    currentUserSpeed = SPEED_STEPS[idx];
                    if (v) { try { v.playbackRate = currentUserSpeed; } catch { /* ignore */ } }
                    btn.textContent = "⚡ Tốc độ: " + currentUserSpeed + "x";
                    btn.classList.toggle("fg-active", currentUserSpeed !== 1);
                    postNative({ action: "toast", text: "⚡ Tốc độ phát: " + currentUserSpeed + "x" });
                } else if (act === "audio") {
                    const on = document.documentElement.classList.toggle("fg-audio-only");
                    btn.classList.toggle("fg-active", on);
                    const mp = document.querySelector("#movie_player, .html5-video-player");
                    if (mp && !document.getElementById("__fg_audio_only_banner")) {
                        const b = document.createElement("div");
                        b.id = "__fg_audio_only_banner";
                        b.innerHTML = "<div>🎧 Đang bật Chế độ Chỉ nghe nhạc (Tiết kiệm pin OLED)</div><div style='font-size:11px;color:#cbd5e1;font-weight:500'>Chạm vào đây để bật lại hình ảnh</div>";
                        b.addEventListener("click", () => {
                            document.documentElement.classList.remove("fg-audio-only");
                            btn.classList.remove("fg-active");
                        });
                        mp.appendChild(b);
                    }
                    postNative({ action: "toast", text: on ? "🎧 Đã tắt hình · Chỉ phát âm thanh tiết kiệm pin" : "🎬 Đã bật lại hình ảnh video" });
                } else if (act === "sleep") {
                    sleepStepIdx = (sleepStepIdx + 1) % SLEEP_STEPS.length;
                    const step = SLEEP_STEPS[sleepStepIdx];
                    applySleepTimer();
                    btn.textContent = "🌙 Hẹn giờ: " + step.label;
                    btn.classList.toggle("fg-active", step.min !== 0);
                    postNative({
                        action: "toast",
                        text: step.min === 0
                            ? "🌙 Đã tắt Hẹn giờ đi ngủ"
                            : `🌙 Tự động dừng phát sau: ${step.label}`,
                    });
                } else if (act === "loop") {
                    if (!v) return;
                    v.loop = !v.loop;
                    btn.classList.toggle("fg-active", v.loop);
                    postNative({ action: "toast", text: v.loop ? "🔁 Đã bật Tự động lặp lại video" : "🔁 Đã tắt lặp lại video" });
                } else if (act === "hd") {
                    try {
                        const mp = document.getElementById("movie_player");
                        if (mp && typeof mp.setPlaybackQualityRange === "function") {
                            mp.setPlaybackQualityRange("hd1080", "highres");
                        }
                        btn.classList.add("fg-active");
                        postNative({ action: "toast", text: "✨ Đã kích hoạt 1080p Premium / 4K Bitrate cao nhất" });
                    } catch { /* ignore */ }
                } else if (act === "share") {
                    postNative({
                        action: "shareUrl",
                        url: location.href,
                        title: document.title.replace(/\s*-\s*YouTube$/i, ""),
                    });
                }
            });
        }
        bar.style.display = "flex";
        if (bar.nextSibling !== anchor) {
            anchor.parentNode.insertBefore(bar, anchor);
        }
    }

    document.addEventListener("yt-navigate-finish", () => setTimeout(ensureIosActionBar, 150));
    window.addEventListener("popstate", () => setTimeout(ensureIosActionBar, 150));
    setInterval(ensureIosActionBar, 2400);

    // ---------- Đồng bộ thông tin bài hát/video sang Màn hình khoá iOS (Now Playing — Không spam timeupdate) ----------
    let lastNowPlayingSignature = "";
    function syncNowPlaying(ev) {
        const v = (ev && ev.target && (ev.target.tagName === "VIDEO" || ev.target.tagName === "AUDIO"))
            ? ev.target
            : document.querySelector("video.html5-main-video, video, audio");
        if (!v) return;
        if (v.tagName === "VIDEO") {
            prepareVideoForAutoPiP(v);
            if (ev && (ev.type === "loadedmetadata" || ev.type === "play")) {
                restoreWatchProgressAndQuality(v);
            }
        }
        if (ev && ev.type === "play") wasPlayingBeforeHide = true;
        else if (ev && ev.type === "pause" && document.visibilityState === "visible") wasPlayingBeforeHide = false;

        if (!isFinite(v.duration) || v.duration <= 0) return;

        let title = document.title.replace(/\s*-\s*YouTube(\s*Music)?$/i, "").trim();
        let artist = location.hostname.replace(/^m\.|^www\./, "");
        try {
            if (navigator.mediaSession && navigator.mediaSession.metadata) {
                title = navigator.mediaSession.metadata.title || title;
                artist = navigator.mediaSession.metadata.artist || artist;
            } else {
                const titleEl = document.querySelector(
                    "h1.ytd-watch-metadata, .slim-video-information-title, ytmusic-player-bar .title"
                );
                const ownerEl = document.querySelector(
                    "ytd-watch-metadata #channel-name, .slim-owner-icon-and-title .subhead, ytmusic-player-bar .byline"
                );
                if (titleEl && titleEl.textContent.trim()) title = titleEl.textContent.trim();
                if (ownerEl && ownerEl.textContent.trim()) artist = ownerEl.textContent.trim();
            }
        } catch { /* ignore */ }

        const rate = v.paused ? 0 : (Number(v.playbackRate) || 1);
        const curBucket = Math.floor((Number(v.currentTime) || 0) / 3);
        const sig = `${title}|${artist}|${Math.round(v.duration)}|${rate}|${curBucket}`;
        if (sig === lastNowPlayingSignature) return;
        lastNowPlayingSignature = sig;

        postNative({
            action: "nowPlaying",
            title: title || "FUNNYGAME",
            artist: artist || "YouTube",
            duration: Number(v.duration) || 0,
            currentTime: Number(v.currentTime) || 0,
            rate,
        });
    }

    document.addEventListener("loadedmetadata", syncNowPlaying, true);
    document.addEventListener("play", syncNowPlaying, true);
    document.addEventListener("pause", syncNowPlaying, true);
    document.addEventListener("seeked", syncNowPlaying, true);
    document.addEventListener("ratechange", syncNowPlaying, true);
})();
