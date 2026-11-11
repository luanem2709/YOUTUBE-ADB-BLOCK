// FUNNYGAME — Chẩn đoán cục bộ trên iOS (diag.js).
// Chạy chung scope với chrome-bridge.js (cùng một WKUserScript, sau bridge). CHỈ postMessage tới Swift — không gọi mạng.
// Mọi sự kiện đi qua validate() theo ios/diag-schema.json (do Swift tiêm vào window.__FG_DIAG_SCHEMA__),
// nên KHÔNG thể ghi URL, mã video, key, IP hay mã thiết bị: schema không có trường văn bản tự do.
(function () {
    if (window.__fgDiag) return;
    const TEST = window.__FG_TEST__ || null;
    // Chỉ chạy trên YouTube/Spotify (script được tiêm vào mọi trang trong WebView).
    const hostOk = /(^|\.)(youtube|spotify)\.com$/i.test(location.hostname) || !!(TEST && TEST.diagAnyHost);
    if (!hostOk) return;

    const schema = (window.__FG_DIAG_SCHEMA__ && typeof window.__FG_DIAG_SCHEMA__ === "object") ? window.__FG_DIAG_SCHEMA__ : {};
    const EVENTS = schema.events || {};
    const LIMITS = Object.assign({ perEventPerMinute: 6, maxEventBytes: 512, maxPerEventPerMinute: 30 }, schema.limits || {});
    let enabled = window.__FG_DIAG_ENABLED__ !== false;

    // Ngưỡng có thể chỉnh trong test (TEST.diagCfg) để không phải chờ hàng chục giây.
    const CFG = Object.assign({
        sampleMs: 3000,        // chu kỳ lấy mẫu sức khoẻ trình phát
        adStuckMs: [20000, 60000, 180000],
        rateStuckMs: [5000, 30000],
        errorDebounceMs: 30000,
    }, (TEST && TEST.diagCfg) || {});

    // ---------- Kiểm tra dữ liệu theo schema (phản chiếu DiagLog.validate bên Swift) ----------
    function isInt(v) { return typeof v === "number" && isFinite(v) && Math.floor(v) === v; }

    function checkField(rule, v) {
        if (!rule) return false;
        switch (rule.t) {
            case "enum": return typeof v === "string" && rule.v.indexOf(v) >= 0;
            case "int": return isInt(v) && v >= rule.min && v <= rule.max;
            case "bool": return typeof v === "boolean";
            case "pattern": {
                if (typeof v !== "string" || v.length > 24) return false;
                try { return new RegExp(rule.re).test(v); } catch { return false; }
            }
            default: return false;
        }
    }

    // Trả về object đã lọc (chỉ trường khai báo trong schema) hoặc null nếu sự kiện/giá trị không hợp lệ.
    function validate(event, raw) {
        const def = EVENTS[event];
        if (!def || def.src !== "js") return null;
        const src = (raw && typeof raw === "object") ? raw : {};
        const out = {};
        for (const key of Object.keys(def.fields || {})) {
            if (!(key in src)) continue;
            if (!checkField(def.fields[key], src[key])) return null; // giá trị lạ = nghi vấn -> bỏ cả sự kiện
            out[key] = src[key];
        }
        return out;
    }

    // ---------- Gửi sang Swift (giới hạn tần suất + kích thước) ----------
    const windows = {};
    function rateOk(event) {
        const now = Date.now();
        const w = windows[event] || (windows[event] = { start: now, n: 0 });
        if (now - w.start > 60000) { w.start = now; w.n = 0; }
        // Mỗi loại có thể khai báo "limit" riêng trong schema (tối đa maxPerEventPerMinute); mặc định perEventPerMinute
        const def = EVENTS[event];
        const cap = Math.min((def && isInt(def.limit)) ? def.limit : LIMITS.perEventPerMinute, LIMITS.maxPerEventPerMinute);
        if (w.n >= cap) return false;
        w.n++;
        return true;
    }

    function post(payload) {
        try {
            if (TEST && TEST.diagSink) { TEST.diagSink(payload); return true; }
            const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fgBridge;
            if (!h) return false;
            h.postMessage(payload);
            return true;
        } catch { return false; }
    }

    function emit(event, raw) {
        if (!enabled) return false;
        const clean = validate(event, raw);
        if (!clean) return false;
        if (!rateOk(event)) return false;
        const payload = { action: "diag", e: event, f: clean };
        if (JSON.stringify(payload).length > LIMITS.maxEventBytes) return false;
        return post(payload);
    }

    window.__fgDiagSetEnabled = function (on) { enabled = !!on; };

    // ---------- Tự chẩn đoán trình phát ----------
    const state = {
        adSince: 0, adSent: {},
        rateSince: 0, rateSent: {},
        errAt: {},
    };
    const lastCt = new WeakMap(); // vị trí phát gần nhất theo từng <video> (WeakMap để không gắn thuộc tính lên node của YouTube)

    function mainVideo() { return document.querySelector("video.html5-main-video, video"); }
    function playerEl() { return document.querySelector("#movie_player, .html5-video-player, #player-container-id, ytm-player"); }
    function isAdShowing(player) {
        return !!(player && player.classList && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting")));
    }
    function bucketOf(ms, list, names) {
        let name = null;
        for (let i = 0; i < list.length; i++) if (ms >= list[i]) name = names[i];
        return name;
    }

    function debounced(kind, ms) {
        const now = Date.now();
        if (state.errAt[kind] && now - state.errAt[kind] < ms) return false;
        state.errAt[kind] = now;
        return true;
    }

    function sample() {
        if (!enabled) return;
        if (document.hidden && !TEST) return; // tab ẩn: không lấy mẫu để tiết kiệm pin (test luôn lấy mẫu)
        const v = mainVideo();
        if (!v) return;
        const player = playerEl();
        const now = Date.now();

        // 1) Kẹt quảng cáo: class ad-showing kéo dài bất thường
        if (isAdShowing(player)) {
            if (!state.adSince) { state.adSince = now; state.adSent = {}; }
            const b = bucketOf(now - state.adSince, CFG.adStuckMs, ["20s", "60s", "180s"]);
            if (b && !state.adSent[b]) { state.adSent[b] = true; emit("ad_stuck", { bucket: b }); }
        } else {
            state.adSince = 0;
        }

        // 2) Kẹt tua nhanh: tốc độ >= 8x khi KHÔNG có quảng cáo (engine để quên 16x)
        const rate = Number(v.playbackRate) || 1;
        if (rate >= 8 && !isAdShowing(player)) {
            if (!state.rateSince) { state.rateSince = now; state.rateSent = {}; }
            const b = bucketOf(now - state.rateSince, CFG.rateStuckMs, ["5s", "30s"]);
            if (b && !state.rateSent[b]) { state.rateSent[b] = true; emit("rate_stuck", { bucket: b }); }
        } else {
            state.rateSince = 0;
        }

        // 3) Lỗi trình phát: MediaError của <video> hoặc lớp phủ lỗi của YouTube
        try {
            if (v.error && isInt(v.error.code) && debounced("media_error", CFG.errorDebounceMs)) {
                emit("player_error", { kind: "media_error", code: Math.max(0, Math.min(4, v.error.code)) });
            }
            if (player && player.querySelector(".ytp-error") && debounced("overlay", CFG.errorDebounceMs)) {
                emit("player_error", { kind: "overlay", code: 0 });
            }
        } catch { /* ignore */ }
    }

    // 4) Nghi ngờ nhận diện nhầm quảng cáo: video chính bị ẩn/mute rồi nhảy sát cuối trong khi KHÔNG có class quảng cáo
    function onTimeupdate(ev) {
        const v = ev && ev.target;
        if (v && v.tagName === "VIDEO") lastCt.set(v, Number(v.currentTime) || 0);
    }
    function onSeeked(ev) {
        try {
            const v = ev && ev.target;
            if (!v || v.tagName !== "VIDEO" || !enabled) return;
            const d = Number(v.duration);
            const ct = Number(v.currentTime) || 0;
            const prev = lastCt.has(v) ? lastCt.get(v) : ct;
            lastCt.set(v, ct);
            if (!isFinite(d) || d <= 180) return;
            const nearEnd = ct >= d - 1.5;
            if (!nearEnd || ct - prev < 30) return;
            if (isAdShowing(playerEl())) return;
            const hidden = parseFloat(getComputedStyle(v).opacity) < 0.1;
            const muted = !!v.muted;
            if (hidden || muted || (Number(v.playbackRate) || 1) >= 8) {
                emit("suspect_seek", { near_end: true, hidden: hidden, muted: muted, long: true });
            }
        } catch { /* ignore */ }
    }
    document.addEventListener("timeupdate", onTimeupdate, true);
    document.addEventListener("seeked", onSeeked, true);

    // 5) Trạng thái phát (play/pause/ended) kèm tab đang ẩn hay không và có đang là quảng cáo không:
    //    giúp thấy "khoá máy / vuốt Home thì ai đã tạm dừng phát" (iOS, YouTube hay app).
    function onMedia(ev) {
        try {
            const m = ev && ev.target;
            if (!m || (m.tagName !== "VIDEO" && m.tagName !== "AUDIO")) return;
            emit("media_state", { state: ev.type, hidden: !!document.hidden, ad: isAdShowing(playerEl()) });
        } catch { /* ignore */ }
    }
    document.addEventListener("play", onMedia, true);
    document.addEventListener("pause", onMedia, true);
    document.addEventListener("ended", onMedia, true);

    // ---------- Thăm dò tương thích (1 lần/trang): chỉ cờ boolean + 2 bucket thô ----------
    function safe(fn) { try { return !!fn(); } catch { return false; } }
    function probe() {
        const p = document.createElement("video");
        const can = (t) => safe(() => p.canPlayType(t));
        const w = window.innerWidth || 0;
        const bucket = w <= 375 ? "xs" : w <= 430 ? "s" : w <= 820 ? "m" : w <= 1100 ? "l" : "xl";
        const f = {
            css_has: safe(() => CSS.supports("selector(:has(a))")),
            css_dvh: safe(() => CSS.supports("height", "100dvh")),
            css_webkit_backdrop: safe(() => CSS.supports("-webkit-backdrop-filter", "blur(1px)")),
            css_gap: safe(() => CSS.supports("gap", "1px")),
            audio_ctx: safe(() => window.AudioContext || window.webkitAudioContext),
            media_session: safe(() => "mediaSession" in navigator),
            pip_webkit: safe(() => typeof p.webkitSetPresentationMode === "function"),
            pip_std: safe(() => document.pictureInPictureEnabled),
            mse: safe(() => typeof window.MediaSource !== "undefined"),
            mms: safe(() => typeof window.ManagedMediaSource !== "undefined"),
            vp9: can('video/webm; codecs="vp9"'),
            av1: can('video/mp4; codecs="av01.0.05M.08"'),
            avc: can('video/mp4; codecs="avc1.42E01E"'),
            opus: can('audio/webm; codecs="opus"'),
            hls: can("application/vnd.apple.mpegurl"),
            coarse: safe(() => window.matchMedia("(pointer: coarse)").matches),
            w: bucket,
            dpr: Math.max(1, Math.min(4, Math.round(window.devicePixelRatio || 1))),
        };
        return emit("compat", f);
    }

    window.__fgDiag = { emit: emit, validate: validate };
    if (TEST) TEST.diag = { validate: validate, emit: emit, sample: sample, probe: probe, state: state, onSeeked: onSeeked, onTimeupdate: onTimeupdate, onMedia: onMedia, CFG: CFG };

    if (!(TEST && TEST.diagNoTimers)) {
        setInterval(sample, CFG.sampleMs);
        setTimeout(probe, 2500);
    }
})();
