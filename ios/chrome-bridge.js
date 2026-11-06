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
            ambientGlow: true,
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

    // ---------- Hàm điều khiển Picture-in-Picture (PiP) & Media từ thanh Native iOS ----------
    window.__fgTogglePiP = function () {
        try {
            const videos = [...document.querySelectorAll("video")];
            const v = videos.find((el) => el.readyState >= 1 && (el.offsetWidth > 0 || el.offsetHeight > 0)) || videos[0];
            if (!v) return "no-video";
            if (typeof v.webkitSupportsPresentationMode === "function" && typeof v.webkitSetPresentationMode === "function") {
                const cur = v.webkitPresentationMode;
                const next = cur === "picture-in-picture" ? "inline" : "picture-in-picture";
                v.webkitSetPresentationMode(next);
                return next;
            }
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture();
                return "inline";
            }
            if (typeof v.requestPictureInPicture === "function") {
                v.requestPictureInPicture();
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
    `;

    function injectIosExtraCss() {
        if (document.getElementById("__fg_ios_extra_css")) return;
        const s = document.createElement("style");
        s.id = "__fg_ios_extra_css";
        s.textContent = IOS_EXTRA_CSS;
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

    // ---------- Đồng bộ thông tin bài hát/video sang Màn hình khoá iOS (Now Playing) ----------
    let lastMetaAt = 0;
    function syncNowPlaying() {
        const now = Date.now();
        if (now - lastMetaAt < 1800) return;
        const v = document.querySelector("video.html5-main-video, video, audio");
        if (!v || !isFinite(v.duration) || v.duration <= 0) return;
        lastMetaAt = now;

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

        postNative({
            action: "nowPlaying",
            title: title || "FUNNYGAME",
            artist: artist || "YouTube",
            duration: Number(v.duration) || 0,
            currentTime: Number(v.currentTime) || 0,
            rate: v.paused ? 0 : (Number(v.playbackRate) || 1),
        });
    }

    document.addEventListener("play", syncNowPlaying, true);
    document.addEventListener("pause", syncNowPlaying, true);
    document.addEventListener("timeupdate", syncNowPlaying, true);
})();
