// FUNNYGAME — Lớp chặn quảng cáo TẦNG MẠNG (YouTube)
// Chạy trong MAIN world, document_start → chạy TRƯỚC mã của YouTube để can thiệp phản hồi API.
//
// TRẠNG THÁI: BẬT LẠI (thử nghiệm) với CẦU CHÌ tự ngắt.
//   Trước đây lớp này bị tắt trên YouTube thật vì SABR (serverAbrStreamingUrl): sửa phản hồi có thể làm
//   trình phát báo lỗi đen màn hình "(282054944)". Nay bật lại nhưng:
//     • chỉ gỡ khóa quảng cáo (adPlacements / playerAds / adSlots), không đụng streamingData;
//     • nếu thấy lỗi phát video (.ytp-error) sau khi đã gỡ → S.trip(): ngắt lớp này 24 giờ
//       (lưu localStorage) rồi tải lại trang đúng 1 lần; DOM fallback trong content-main.js vẫn chạy bình thường;
//     • người dùng tắt được bằng công tắc "Bỏ qua hẳn quảng cáo" (blockManifest).
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

    // Cầu chì đã nổ trong 24 giờ qua → không gỡ QC ở tầng mạng (bỏ qua trong môi trường test để các trang test không nhiễm nhau)
    const TRIP_KEY = "__fg_net_trip";
    const TRIP_TTL = 24 * 60 * 60 * 1000;
    const RELOAD_KEY = "__fg_net_reload";
    function recentlyTripped() {
        if (window.__FG_TEST__) return false;
        try {
            const ts = Number(localStorage.getItem(TRIP_KEY) || 0);
            return ts > 0 && Date.now() - ts >= 0 && Date.now() - ts < TRIP_TTL;
        } catch { return false; }
    }

    const isTestEnv = !!window.__FG_TEST__;
    if (recentlyTripped()) S.forced = true;

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
        // /youtubei/v1/get_watch (điều hướng SPA khi đổi clip) trả về MẢNG: [{ playerResponse: {...adPlacements...}, ... }, ...]
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length && i < 8; i++) {
                if (obj[i] && typeof obj[i] === "object" && sanitizeObject(obj[i], d)) changed = true;
            }
            return changed;
        }
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
        const c0 = start < 0 ? -1 : text.charCodeAt(start);
        if (c0 !== 123 && c0 !== 91) return text; // 123 = '{', 91 = '['
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
        scanGlobals();
    });

    function isPlayerApi(url) {
        if (!url) return false;
        // KHÔNG móc /youtubei/v1/get_watch (điều hướng SPA khi đổi clip): đã thử gỡ QC ở đó trên YouTube thật,
        // YouTube vẫn tạo slot QC rỗng (class ad-created) và treo ~4.8s ở trạng thái buffering đen trước khi vào video chính
        // — tệ hơn để QC hiện rồi bị tua (≈0.5s). Chỉ móc /player.
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

    {
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
        const hadStripped = S.stripped > 0 || (S.lastStripAt && Date.now() - S.lastStripAt < 60000);
        S.forced = true;
        S.stripped = 0;
        if (isTestEnv) return;
        try { localStorage.setItem(TRIP_KEY, String(Date.now())); } catch { /* ignore */ }
        // Tải lại đúng 1 lần (chống vòng lặp) để lấy lại phản hồi player nguyên vẹn
        if (!hadStripped) return;
        try {
            const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
            if (Date.now() - last < 60000) return;
            sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
            location.reload();
        } catch { /* ignore */ }
    };

    // ---------- Cầu chì bắt video "đứng" âm thầm ----------
    // Ngoài lỗi hiện rõ (.ytp-error) còn có ca video không bao giờ bắt đầu phát sau khi đã gỡ QC (không có thông báo lỗi).
    // Khởi động chậm bình thường tới ~7s (đo thật) → chỉ ngắt sau STALL_MS liên tục, và chỉ khi vừa gỡ QC trong 60s qua.
    const STALL_MS = 15000;
    let stallSince = 0;
    function checkStall(now) {
        if (S.forced || !S.stripped || !S.lastStripAt || now - S.lastStripAt > 60000) { stallSince = 0; return false; }
        const v = document.querySelector("video");
        const p = document.querySelector(".html5-video-player");
        const adNow = !!(p && /ad-showing|ad-interrupting/.test(p.className));
        const stalled = !!v && !document.hidden && !adNow && v.currentTime < 0.5 && v.readyState < 3;
        if (!stalled) { stallSince = 0; return false; }
        if (!stallSince) stallSince = now;
        if (now - stallSince >= STALL_MS) { S.trip(); return true; }
        return false;
    }
    setInterval(() => { try { checkStall(Date.now()); } catch { /* ignore */ } }, 2000);

    // ---------- Móc fetch / XHR của /youtubei/v1/player ----------
    function rebuildResponse(res, text) {
        const headers = new Headers(res.headers);
        headers.delete("content-length");
        headers.delete("content-encoding");
        return new Response(text, { status: res.status, statusText: res.statusText, headers });
    }

    try {
        const origFetch = window.fetch;
        if (typeof origFetch === "function" && !origFetch.__fgNet) {
            const wrapped = function (input) {
                const p = origFetch.apply(this, arguments);
                let url = "";
                try { url = typeof input === "string" ? input : (input && input.url) || String(input || ""); } catch { /* ignore */ }
                if (!isPlayerApi(url)) return p;
                return p.then(async (res) => {
                    try {
                        if (!res || !res.ok) return res;
                        if (!S.ready) await readyPromise;
                        if (!shouldStrip()) return res;
                        const text = await res.clone().text();
                        const out = sanitizeText(text);
                        return out === text ? res : rebuildResponse(res, out);
                    } catch {
                        return res;
                    }
                });
            };
            wrapped.__fgNet = true;
            window.fetch = wrapped;
        }
    } catch { /* ignore */ }

    try {
        const XHR = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
        const textDesc = XHR && Object.getOwnPropertyDescriptor(XHR, "responseText");
        const respDesc = XHR && Object.getOwnPropertyDescriptor(XHR, "response");
        if (XHR && textDesc && textDesc.get && respDesc && respDesc.get && !XHR.open.__fgNet) {
            const origOpen = XHR.open;
            const openWrapped = function (method, url) {
                try {
                    if (isPlayerApi(String(url))) {
                        const xhr = this;
                        Object.defineProperty(xhr, "responseText", {
                            configurable: true,
                            get() {
                                const raw = textDesc.get.call(xhr);
                                return xhr.readyState === 4 && shouldStrip() ? sanitizeText(raw) : raw;
                            },
                        });
                        Object.defineProperty(xhr, "response", {
                            configurable: true,
                            get() {
                                const raw = respDesc.get.call(xhr);
                                if (xhr.readyState !== 4 || !shouldStrip()) return raw;
                                if (typeof raw === "string") return sanitizeText(raw);
                                if (raw && typeof raw === "object" && xhr.responseType === "json") {
                                    if (sanitizeObject(raw, 0)) { S.stripped++; S.lastStripAt = Date.now(); }
                                }
                                return raw;
                            },
                        });
                    }
                } catch { /* ignore */ }
                return origOpen.apply(this, arguments);
            };
            openWrapped.__fgNet = true;
            XHR.open = openWrapped;
        }
    } catch { /* ignore */ }

    if (window.__FG_TEST__) {
        window.__FG_TEST__.net = {
            sanitizeObject,
            sanitizeText,
            checkStall,
            isPlayerApi,
            shouldStrip: () => shouldStrip(),
            state: S,
        };
    }
})();
