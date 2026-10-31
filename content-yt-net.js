// FUNNYGAME — Lớp chặn quảng cáo TẦNG MẠNG (YouTube)
// Chạy trong MAIN world, document_start → chạy TRƯỚC mã của YouTube để can thiệp phản hồi API.
//
// MỤC TIÊU: "bỏ qua hẳn" — YouTube KHÔNG BAO GIỜ nhận được danh sách quảng cáo
// (adPlacements / playerAds / adSlots) trong playerResponse
//   → không tạo slot QC → không tải video QC, không hiện UI QC
//   → người dùng xem thẳng video chính, 0 giây, không đen màn hình.
//
// VÌ SAO PHẢI LÀM Ở TẦNG MẠNG (không chỉ dựa vào DOM)?
//   1) QC kiểu mới (YouTube 2025+) không gắn class "ad-showing" → nhận biết bằng DOM
//      không ổn định (báo cáo thật: video j8U06veqxdU, class chỉ có "ad-created").
//   2) QC chèn phía server (SSAI) nằm CHUNG luồng video chính → seek tới cuối sẽ
//      tua mất luôn video chính.
//   3) QC đã tải về = tốn băng thông + người dùng thấy khung hình QC.
//   Gỡ slot QC ngay từ playerResponse → YouTube không bao giờ biết tới quảng cáo.
//
// AN TOÀN:
//   • Chỉ can thiệp khi: extension đã kích hoạt (license hợp lệ) + người dùng bật
//     chặn QC + video KHÔNG nằm trong whitelist + cài đặt "Bỏ qua hẳn" đang bật.
//   • Nếu gỡ slot QC làm YouTube lỗi phát video → "cầu chì" tự ngắt (trip) và tải lại
//     video KHÔNG gỡ nữa (xem S.trip trong content-main.js).
(function () {
    if (window.__fgNet) return;

    // ---------- Trạng thái chia sẻ với content-main.js (cùng MAIN world) ----------
    const S = {
        enabled: false,      // extension đang bảo vệ (đã kích hoạt + bật)
        stripped: 0,         // số phản hồi player đã gỡ slot QC
        forced: false,       // đã "trip" (ngắt tự động) vì gỡ slot QC gây lỗi phát video
        ready: false,        // đã nhận cấu hình lần đầu
        lastStripAt: 0,
        trip: null,          // hàm do content-main.js gọi khi player lỗi
    };
    window.__fgNet = S;

    let allowLicense = false;
    let enabled = false;
    let whitelisted = false;
    let whitelistChannels = [];
    let blockManifest = true;

    // Đường tắt nhanh: lưu sẵn trạng thái kích hoạt + whitelist + cài đặt vào
    // localStorage (dùng chung giữa các tab) → lớp mạng biết ngay từ khi khởi động,
    // không phải chờ tin nhắn cấu hình → không bỏ lọt phản hồi player đầu tiên.
    //
    // AN TOÀN: nếu YouTube tự sửa giá trị này, hậu quả tối đa chỉ là bật/tắt việc
    // gỡ quảng cáo — không ảnh hưởng bảo mật hay dữ liệu người dùng.
    //
    // TTL: ảnh chụp cũ hơn 6 giờ bị coi là không hợp lệ → tránh trường hợp người
    // dùng đã gỡ extension (hoặc license đã hết hạn) mà trang vẫn còn snapshot
    // "lic:1" trong localStorage → lớp mạng tưởng còn được phép gỡ QC.
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
                // Snapshot quá hạn → xoá để không phải kiểm tra lại mỗi lần tải trang
                localStorage.removeItem("__fg_state_v1");
            }
        }
    } catch { /* ignore */ }
    // Dự phòng: sessionStorage (cùng cơ chế content-main.js dùng)
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

    // Chờ cấu hình đầu tiên từ content.js (license + cài đặt). Không chặn vô hạn
    // để tránh làm chậm trang: tối đa 900ms rồi quyết định theo mặc định.
    // Đường tắt nhanh đã có đáp án → resolve ngay, không chờ.
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
    // Các mảng chứa slot quảng cáo. Xoá (đặt rỗng) → player không tạo QC nào.
    const AD_SLOT_KEYS = ["adPlacements", "playerAds", "adSlots"];
    // Tên biến chứa playerResponse dạng chuỗi JSON.
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
        // playerResponse có thể nằm lồng trong "playerResponse" / "response.playerResponse"
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
        // Phải là JSON object (bắt đầu bằng '{', sau khi bỏ khoảng trắng đầu)
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

    function sanitizeValue(value, keyHint) {
        if (typeof value === "string") {
            if (keyHint && PLAYER_KEY_RE.test(keyHint)) return sanitizeText(value);
            return value;
        }
        if (value && typeof value === "object") {
            if (sanitizeObject(value, 0)) {
                S.stripped++;
                S.lastStripAt = Date.now();
            }
            return value;
        }
        return value;
    }

    // ---------- Điều kiện được phép gỡ slot QC ----------
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

    // ---------- Nhận cấu hình từ content.js ----------
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
    });

    // ---------- Hook fetch (đường chính của YouTube hiện nay) ----------
    const origFetch = window.fetch;
    function urlOf(input) {
        try {
            if (typeof input === "string") return input;
            if (input && typeof input.url === "string") return input.url;
        } catch { /* ignore */ }
        return "";
    }
    function isPlayerApi(url) {
        if (!url) return false;
        return /\/youtubei\/v1\/player(\?|$)/.test(url);
    }

    window.fetch = async function (...args) {
        const res = await origFetch.apply(this, args);
        try {
            if (!isPlayerApi(urlOf(args[0]))) return res;
            await readyPromise;
            if (!shouldStrip()) return res;
            const text = await res.clone().text();
            const clean = sanitizeText(text);
            if (clean === text) return res;
            const headers = new Headers(res.headers);
            // Phải bỏ content-encoding + content-length gốc: body đã giải nén và
            // có độ dài khác. Giữ lại → trình duyệt cố giải nén body đã giải nén → lỗi.
            try { headers.delete("content-encoding"); } catch { /* ignore */ }
            try { headers.delete("content-length"); } catch { /* ignore */ }
            try {
                const bytes = new TextEncoder().encode(clean).length;
                headers.set("content-length", String(bytes));
            } catch { /* ignore */ }
            const out = new Response(clean, {
                status: res.status,
                statusText: res.statusText,
                headers,
            });
            // Giữ lại thông tin gốc (url/redirected/type) để YouTube không bỗng lỗi
            try {
                Object.defineProperty(out, "url", { get: () => res.url });
                Object.defineProperty(out, "redirected", { get: () => res.redirected });
                Object.defineProperty(out, "type", { get: () => res.type });
            } catch { /* ignore */ }
            return out;
        } catch {
            return res;
        }
    };

    // ---------- Hook XMLHttpRequest (một số luồng cũ vẫn dùng XHR) ----------
    try {
        const respTextDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "responseText");
        const respDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "response");
        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url) {
            try { this.__fgUrl = String(url || ""); } catch { /* ignore */ }
            return origOpen.apply(this, arguments);
        };
        if (respTextDesc && respTextDesc.get) {
            Object.defineProperty(XMLHttpRequest.prototype, "responseText", {
                configurable: true,
                enumerable: respTextDesc.enumerable,
                get() {
                    const raw = respTextDesc.get.call(this);
                    try {
                        if (!isPlayerApi(this.__fgUrl) || !shouldStrip()) return raw;
                    } catch { return raw; }
                    return sanitizeText(raw);
                },
            });
        }
        if (respDesc && respDesc.get) {
            Object.defineProperty(XMLHttpRequest.prototype, "response", {
                configurable: true,
                enumerable: respDesc.enumerable,
                get() {
                    const raw = respDesc.get.call(this);
                    try {
                        if (!isPlayerApi(this.__fgUrl) || !shouldStrip()) return raw;
                    } catch { return raw; }
                    if (typeof raw === "string") return sanitizeText(raw);
                    if (raw && typeof raw === "object") sanitizeObject(raw, 0);
                    return raw;
                },
            });
        }
    } catch { /* ignore */ }

    // ---------- ytInitialPlayerResponse / ytcfg / ytplayer ----------
    // YouTube nhúng playerResponse dưới nhiều tên. Ta dò ở nhiều chỗ và gỡ slot QC
    // ngay khi tìm thấy (trước khi player đọc) để QC không bao giờ được tạo.
    function sanitizeCfgValue(key, value) {
        try {
            if (!shouldStrip()) return value;
            if (typeof value === "string") {
                if (key && PLAYER_KEY_RE.test(key)) return sanitizeText(value);
                return value;
            }
            if (value && typeof value === "object") {
                if (sanitizeObject(value, 0)) {
                    S.stripped++;
                    S.lastStripAt = Date.now();
                }
                // gỡ luôn các biến con dạng player_response
                for (const k in value) {
                    if (PLAYER_KEY_RE.test(k)) {
                        const v = value[k];
                        if (typeof v === "string") value[k] = sanitizeText(v);
                        else if (v && typeof v === "object") sanitizeObject(v, 0);
                    }
                }
            }
            return value;
        } catch {
            return value;
        }
    }

    function patchYtcfg(cfg) {
        if (!cfg || typeof cfg !== "object" || cfg.__fgPatched) return;
        try {
            const origSet = cfg.set;
            if (typeof origSet === "function") {
                cfg.set = function (a, b) {
                    try {
                        if (typeof a === "string") sanitizeCfgValue(a, b);
                        else if (a && typeof a === "object") {
                            for (const k in a) a[k] = sanitizeCfgValue(k, a[k]);
                        }
                    } catch { /* ignore */ }
                    return origSet.apply(this, arguments);
                };
            }
            const origSet_ = cfg.set_;
            if (typeof origSet_ === "function") {
                cfg.set_ = function (a, b) {
                    try {
                        if (typeof a === "string") sanitizeCfgValue(a, b);
                        else if (a && typeof a === "object") {
                            for (const k in a) a[k] = sanitizeCfgValue(k, a[k]);
                        }
                    } catch { /* ignore */ }
                    return origSet_.apply(this, arguments);
                };
            }
            cfg.__fgPatched = true;
        } catch { /* ignore */ }
    }

    function scanGlobals() {
        if (!shouldStrip()) return;
        // 1) ytInitialPlayerResponse — object trực tiếp
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

        // 2) ytcfg — nơi YouTube gửi playerResponse dạng chuỗi
        try {
            const cfg = window.ytcfg;
            if (cfg) {
                patchYtcfg(cfg);
                if (cfg.data_ && typeof cfg.data_ === "object") {
                    for (const k in cfg.data_) {
                        if (PLAYER_KEY_RE.test(k)) {
                            const v = cfg.data_[k];
                            if (typeof v === "string") cfg.data_[k] = sanitizeText(v);
                            else if (v && typeof v === "object") sanitizeObject(v, 0);
                        }
                    }
                }
            }
        } catch { /* ignore */ }

        // 3) ytplayer.config.args.player_response — chuỗi JSON
        try {
            const args = window.ytplayer && window.ytplayer.config && window.ytplayer.config.args;
            if (args && typeof args.player_response === "string") {
                args.player_response = sanitizeText(args.player_response);
            }
        } catch { /* ignore */ }
    }

    // Quét nhanh lúc đầu (player đọc playerResponse rất sớm), sau đó thưa thớt hơn.
    let scans = 0;
    const scanTimer = setInterval(() => {
        scans++;
        scanGlobals();
        if (scans >= 200) clearInterval(scanTimer); // ~20s rồi dừng quét liên tục
    }, 100);
    scanGlobals();

    // ---------- Cầu chì: nếu gỡ slot QC làm YouTube lỗi phát video ----------
    S.trip = function () {
        if (S.forced) return;
        S.forced = true;
        S.stripped = 0;
    };

    // ---------- API cho bộ test ----------
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
