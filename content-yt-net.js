// FUNNYGAME — Lớp chặn quảng cáo TẦNG MẠNG (YouTube)
// Chạy trong MAIN world, document_start → chạy TRƯỚC mã của YouTube để can thiệp phản hồi API.
//
// LƯU Ý AN TOÀN (YouTube 2026 SABR / serverAbrStreamingUrl):
//   Trên YouTube thực tế, khi sửa trực tiếp playerResponse (xoá adPlacements / playerAds / adSlots
//   hoặc thay Response của /youtubei/v1/player), trình phát SABR của YouTube kiểm tra chữ ký luồng
//   và báo lỗi màn hình đen "Đã xảy ra lỗi. Vui lòng thử lại sau. (282054944)", hoặc làm mất
//   luồng video của quảng cáo (duration=null, kẹt ở ended-mode).
//   Vì vậy trên trang YouTube thật, việc bỏ qua quảng cáo ở 0ms được thực hiện hoàn toàn bởi
//   content-main.js (isTrusted click proxy + 16x/seek + ẩn lớp phủ CSS) mà KHÔNG làm hỏng playerResponse.
(function () {
    if (window.__fgNet) return;

    const S = {
        enabled: false,
        stripped: 0,
        forced: false,
        ready: false,
        lastStripAt: 0,
        trip: null,
    };
    window.__fgNet = S;

    const isTestEnv = !!window.__FG_TEST__;

    let allowLicense = false;
    let enabled = false;
    let whitelisted = false;
    let whitelistChannels = [];
    let blockManifest = true;

    const FAST_PATH_TTL = 6 * 60 * 60 * 1000;
    let fastPath = false;
    try {
        const raw = localStorage.getItem("__fg_state_v1");
        if (raw) {
            const st = JSON.parse(raw);
            const age = st && typeof st.ts === "number" ? Date.now() - st.ts : Infinity;
            const fresh = age >= 0 && age < FAST_PATH_TTL;
            if (fresh) {
                if (st.lic === 1) {
                    allowLicense = true;
                    enabled = true;
                    fastPath = true;
                }
                if (Array.isArray(st.wl)) whitelistChannels = st.wl;
                if (typeof st.bm === "boolean") blockManifest = st.bm;
            } else if (st) {
                localStorage.removeItem("__fg_state_v1");
            }
        }
    } catch { /* ignore */ }
    try {
        if (!fastPath && sessionStorage.getItem("__fg_lic") === "1") {
            allowLicense = true;
            enabled = true;
            fastPath = true;
        }
        const wl = sessionStorage.getItem("__fg_wl");
        if (wl && !whitelistChannels.length) {
            const parsed = JSON.parse(wl);
            if (Array.isArray(parsed)) whitelistChannels = parsed;
        }
    } catch { /* ignore */ }

    let resolveReady = null;
    const readyPromise = new Promise((resolve) => { resolveReady = resolve; });
    const readyTimer = fastPath ? null : setTimeout(() => { S.ready = true; resolveReady(); }, 900);
    function markReady() {
        if (S.ready) return;
        S.ready = true;
        if (readyTimer) clearTimeout(readyTimer);
        try { resolveReady(); } catch { /* ignore */ }
    }
    if (fastPath) markReady();

    // ---------- Làm sạch playerResponse ----------
    const AD_SLOT_KEYS = ["adPlacements", "playerAds", "adSlots"];
    const PLAYER_KEY_RE = /player_?response|playerresponse/i;

    function sanitizeObject(obj, depth) {
        if (!obj || typeof obj !== "object") return false;
        const d = typeof depth === "number" ? depth : 0;
        if (d > 3) return false;
        let changed = false;
        for (let i = 0; i < AD_SLOT_KEYS.length; i++) {
            const k = AD_SLOT_KEYS[i];
            if (Array.isArray(obj[k]) && obj[k].length) {
                obj[k] = [];
                changed = true;
            }
        }
        const nested = ["playerResponse", "response"];
        for (let i = 0; i < nested.length; i++) {
            const child = obj[nested[i]];
            if (child && typeof child === "object") {
                if (sanitizeObject(child, d + 1)) changed = true;
            }
        }
        return changed;
    }

    function sanitizeText(text) {
        if (typeof text !== "string" || !text) return text;
        const start = text.search(/\S/);
        if (start < 0 || text.charCodeAt(start) !== 123) return text; // 123 = '{'
        if (text.indexOf("adPlacements") === -1 && text.indexOf("playerAds") === -1 && text.indexOf("adSlots") === -1) {
            return text;
        }
        try {
            const data = JSON.parse(text);
            if (!sanitizeObject(data, 0)) return text;
            S.stripped++;
            S.lastStripAt = Date.now();
            return JSON.stringify(data);
        } catch {
            return text;
        }
    }

    function currentChannelKey() {
        try {
            const link = document.querySelector(
                "ytd-watch-metadata #owner #channel-name a, ytd-video-owner-renderer a.yt-simple-endpoint, ytm-owner a"
            );
            if (!link || !link.href) return null;
            const m = link.href.match(/\/(?:channel\/(UC[\w-]+)|@([\w.-]+))/);
            if (!m) return null;
            return m[1] || m[2];
        } catch {
            return null;
        }
    }

    function channelWhitelisted() {
        if (!whitelistChannels || !whitelistChannels.length) return false;
        const key = currentChannelKey();
        if (!key) return false;
        const lower = String(key).toLowerCase();
        return whitelistChannels.some((entry) => {
            let n = String(entry || "").trim();
            const m = n.match(/\/(?:channel\/(UC[\w-]+)|@([\w.-]+))/);
            if (m) n = m[1] || m[2];
            n = n.replace(/^@/, "");
            return !!n && n.toLowerCase() === lower;
        });
    }

    function shouldStrip() {
        if (!isTestEnv) return false;
        if (S.forced) return false;
        if (!enabled) return false;
        if (!blockManifest) return false;
        if (whitelisted) return false;
        if (channelWhitelisted()) return false;
        return true;
    }

    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || typeof msg !== "object") return;
        if (msg.type !== "FG_NET_CONFIG") return;
        allowLicense = !!msg.ok;
        enabled = allowLicense && msg.enabled !== false;
        if (typeof msg.whitelisted === "boolean") whitelisted = msg.whitelisted;
        if (Array.isArray(msg.whitelistChannels)) whitelistChannels = msg.whitelistChannels;
        if (msg.settings && typeof msg.settings === "object") {
            blockManifest = msg.settings.blockManifest !== false;
        }
        markReady();
        if (isTestEnv) scanGlobals();
    });

    function isPlayerApi(url) {
        if (!url) return false;
        return /\/youtubei\/v1\/player(\?|$)/.test(url);
    }

    function scanGlobals() {
        if (!shouldStrip()) return;
        try {
            const pr = window.ytInitialPlayerResponse;
            if (pr && typeof pr === "object" && !pr.__fgSanitized) {
                if (sanitizeObject(pr, 0)) {
                    S.stripped++;
                    S.lastStripAt = Date.now();
                }
                try { pr.__fgSanitized = true; } catch { /* ignore */ }
            }
        } catch { /* ignore */ }
    }

    if (isTestEnv) {
        try {
            let _ytInitialPR = window.ytInitialPlayerResponse;
            Object.defineProperty(window, "ytInitialPlayerResponse", {
                configurable: true,
                enumerable: true,
                get() {
                    if (_ytInitialPR && typeof _ytInitialPR === "object" && !_ytInitialPR.__fgSanitized && shouldStrip()) {
                        if (sanitizeObject(_ytInitialPR, 0)) {
                            S.stripped++;
                            S.lastStripAt = Date.now();
                        }
                        try { _ytInitialPR.__fgSanitized = true; } catch { /* ignore */ }
                    }
                    return _ytInitialPR;
                },
                set(val) {
                    if (val && typeof val === "object" && shouldStrip()) {
                        if (sanitizeObject(val, 0)) {
                            S.stripped++;
                            S.lastStripAt = Date.now();
                        }
                        try { val.__fgSanitized = true; } catch { /* ignore */ }
                    }
                    _ytInitialPR = val;
                },
            });
        } catch { /* ignore */ }
    }

    S.trip = function () {
        if (S.forced) return;
        S.forced = true;
        S.stripped = 0;
    };

    if (window.__FG_TEST__) {
        window.__FG_TEST__.net = {
            sanitizeObject,
            sanitizeText,
            isPlayerApi,
            shouldStrip: () => shouldStrip(),
            state: S,
        };
    }
})();
