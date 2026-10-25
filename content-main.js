// FUNNYGAME — MAIN world YouTube
// Nguyên tắc: CHỈ đụng vào video (mute / 16x / tua / skip) khi QC được XÁC NHẬN chặt chẽ:
//   player có class ad-showing/ad-interrupting  VÀ  có ít nhất 1 thành phần UI quảng cáo đang hiển thị.
// Mọi thay đổi đều được ghi nhớ và KHÔI PHỤC khi hết QC. Có watchdog chống video chính bị kẹt 16x.
(function () {
    if (window.__fgYtMain) return;
    window.__fgYtMain = true;
    const FG_TOKEN = "fg_" + Math.random().toString(36).slice(2) + Date.now().toString(36);

    // ---------- Selector ----------
    // Thành phần UI chỉ xuất hiện khi player đang phát quảng cáo
    const AD_SIGNAL_STR_BASE = [
        ".ytp-ad-player-overlay",
        ".ytp-ad-player-overlay-layout",
        ".ytp-ad-player-overlay-instream-info",
        ".ytp-ad-simple-ad-badge",
        ".ytp-ad-badge",
        ".ytp-ad-duration-remaining",
        ".ytp-ad-preview-container",
        ".ytp-ad-preview-text",
        ".ytp-ad-preview-text-modern",
        ".ytp-ad-text",
        ".ytp-ad-visit-advertiser-button",
        ".ytp-visit-advertiser-link",
        ".ytp-skip-ad-button",
        ".ytp-ad-skip-button",
        ".ytp-ad-skip-button-modern",
        ".ytp-ad-skip-button-slot",
    ];
    let AD_SIGNAL_STR = AD_SIGNAL_STR_BASE.join(",");

    const SKIP_STR_BASE = [
        "button.ytp-skip-ad-button",
        "button.ytp-ad-skip-button",
        "button.ytp-ad-skip-button-modern",
        ".ytp-ad-skip-button-slot button",
        ".ytp-skip-ad-button-container button",
        ".ytp-ad-skip-button-container button",
        ".ytp-ad-survey-player-overlay-skip-or-preview button",
    ];
    let SKIP_STR = SKIP_STR_BASE.join(",");

    const ANTI_ADBLOCK_SELECTOR_STR_BASE = [
        "ytd-enforcement-message-view-model",
        "bka-enforcement-message-view-model",
    ];
    let ANTI_ADBLOCK_SELECTOR_STR = ANTI_ADBLOCK_SELECTOR_STR_BASE.join(",");

    const DISMISS_SELECTOR_STR = [
        "button.ytp-ad-overlay-close-button",
        ".ytp-ad-feedback-dialog-close-button",
        ".ytp-ad-survey-player-overlay-close-button",
        ".ytp-ad-action-interstitial-close-button",
    ].join(",");

    // ---------- Trạng thái ----------
    let allowLicense = false;
    try { allowLicense = sessionStorage.getItem("__fg_lic") === "1"; } catch { /* ignore */ }

    let fgSettings = {
        blockVideo: true,
        blockBanner: true,
        blockOverlay: true,
        blockAntiAdblock: true,
        muteAds: true,
        fastSkip: true,
        backgroundPlay: true,
        pipButton: true,
        videoQuality: "auto",
        sponsorBlock: true,
        jumpAhead: true,
        ambientGlow: true,
    };
    let isWhitelistedChannel = false;

    // ---------- Cấu hình từ xa (đã được content script làm sạch) ----------
    function mergeSelectors(base, extra) {
        const out = base.slice();
        if (Array.isArray(extra)) {
            for (const sel of extra) {
                if (typeof sel !== "string" || out.includes(sel)) continue;
                try { document.createDocumentFragment().querySelector(sel); out.push(sel); } catch { /* bỏ selector lỗi */ }
            }
        }
        return out.join(",");
    }

    function applyRemote(remote) {
        if (!remote || typeof remote !== "object") return;
        AD_SIGNAL_STR = mergeSelectors(AD_SIGNAL_STR_BASE, remote.adSignals);
        SKIP_STR = mergeSelectors(SKIP_STR_BASE, remote.skipButtons);
        ANTI_ADBLOCK_SELECTOR_STR = mergeSelectors(ANTI_ADBLOCK_SELECTOR_STR_BASE, remote.antiAdblock);
    }

    function adBlockingActive() {
        return allowLicense && !isWhitelistedChannel && fgSettings.blockVideo;
    }

    // ---------- Premium: PHÁT NỀN ----------
    // YouTube (nhất là m.youtube.com / music) dừng video khi tab bị ẩn / tắt màn hình.
    // Báo cho YouTube rằng trang luôn "visible" và chặn sự kiện visibilitychange tới YouTube.
    const realVisDesc = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
    function realVisibility() {
        try { return realVisDesc ? realVisDesc.get.call(document) : "visible"; } catch { return "visible"; }
    }
    function bgPlayOn() {
        return allowLicense && fgSettings.backgroundPlay !== false;
    }
    try {
        const fakeState = () => (bgPlayOn() ? "visible" : realVisibility());
        const fakeHidden = () => (bgPlayOn() ? false : realVisibility() === "hidden");
        Object.defineProperty(document, "visibilityState", { configurable: true, get: fakeState });
        Object.defineProperty(document, "webkitVisibilityState", { configurable: true, get: fakeState });
        Object.defineProperty(document, "hidden", { configurable: true, get: fakeHidden });
        Object.defineProperty(document, "webkitHidden", { configurable: true, get: fakeHidden });
    } catch { /* ignore */ }

    const realVisHandlers = [];
    let hiddenAt = 0;
    function onRealVisibilityChange(fn) { realVisHandlers.push(fn); }
    function visibilityGate(e) {
        if (realVisibility() === "hidden") hiddenAt = Date.now();
        for (let i = 0; i < realVisHandlers.length; i++) {
            try { realVisHandlers[i](); } catch { /* ignore */ }
        }
        if (bgPlayOn()) e.stopImmediatePropagation();
    }
    // Đăng ký ở capture của window ngay document_start → chạy trước mọi listener của YouTube
    window.addEventListener("visibilitychange", visibilityGate, true);
    window.addEventListener("webkitvisibilitychange", visibilityGate, true);

    function postCount(category) {
        window.postMessage({ type: "FG_COUNT", category, token: FG_TOKEN }, "*");
    }

    let lastIdentityHash = "";
    function postIdentity(force) {
        let loggedIn = false;
        let userKey = "";
        try {
            if (window.ytcfg && typeof window.ytcfg.get === "function") {
                loggedIn = !!window.ytcfg.get("LOGGED_IN");
                userKey = window.ytcfg.get("DELEGATED_SESSION_ID") || "";
            }
        } catch { /* ignore */ }
        const hash = (loggedIn ? "1:" : "0:") + userKey;
        if (!force && hash === lastIdentityHash) return;
        lastIdentityHash = hash;
        window.postMessage({ type: "FG_IDENTITY", token: FG_TOKEN, loggedIn, userKey }, "*");
    }

    // ---------- Tiện ích DOM ----------
    function hasBox(el) {
        return !!el && el.isConnected && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
    }

    function isVisibleEl(el) {
        if (!hasBox(el)) return false;
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden";
    }

    function playerVideo(player) {
        return player ? player.querySelector("video.html5-main-video") || player.querySelector("video") : null;
    }

    function mainPlayer() {
        return document.getElementById("movie_player");
    }

    function clampRate(r) {
        return (typeof r === "number" && isFinite(r) && r > 0 && r <= 4) ? r : 1;
    }

    function userRate(player, video) {
        try {
            if (player && typeof player.getPlaybackRate === "function") {
                const r = player.getPlaybackRate();
                if (typeof r === "number" && r > 0 && r <= 4) return r;
            }
        } catch { /* ignore */ }
        return clampRate(video ? video.playbackRate : 1);
    }

    // ---------- Xác nhận QC (nghiêm ngặt) ----------
    function hasAdClass(player) {
        return !!player && (player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting"));
    }

    function isConfirmedAd(player) {
        if (!hasAdClass(player)) return false;
        const signals = player.querySelectorAll(AD_SIGNAL_STR);
        for (let i = 0; i < signals.length; i++) {
            if (hasBox(signals[i])) return true;
        }
        return false;
    }

    // ---------- Máy trạng thái QC theo từng player ----------
    const stateMap = new WeakMap();
    const knownPlayers = new Set();

    function getState(player) {
        let st = stateMap.get(player);
        if (!st) {
            st = { active: false, savedRate: 1, weMuted: false, weRated: false, video: null };
            stateMap.set(player, st);
        }
        return st;
    }

    function enterAd(player, st, video) {
        st.active = true;
        st.video = video;
        st.savedRate = userRate(player, video);
        st.weMuted = false;
        st.weRated = false;
        postCount("video");
    }

    function exitAd(player, st) {
        st.active = false;
        const video = playerVideo(player) || st.video;
        if (video) {
            if (st.weRated && video.playbackRate !== st.savedRate) {
                try { video.playbackRate = st.savedRate; } catch { /* ignore */ }
            }
            if (st.weMuted && video.muted) {
                try { video.muted = false; } catch { /* ignore */ }
            }
        }
        st.weMuted = false;
        st.weRated = false;
        st.video = null;
        // YouTube có thể nạp lại video chính sau vài trăm ms — kiểm tra lại lần nữa
        setTimeout(() => watchdog(player), 400);
    }

    function clickSkip(player) {
        const btns = player.querySelectorAll(SKIP_STR);
        for (let i = 0; i < btns.length; i++) {
            if (isVisibleEl(btns[i])) {
                try { btns[i].click(); } catch { /* ignore */ }
                return true;
            }
        }
        return false;
    }

    function handleAd(player, st, video) {
        // Kiểm tra lại ngay trước khi tác động — tránh đụng video chính trong lúc chuyển tiếp
        if (!isConfirmedAd(player)) return;

        if (clickSkip(player)) return;

        if (!video) return;
        if (fgSettings.muteAds && !video.muted) {
            video.muted = true;
            st.weMuted = true;
        }
        if (fgSettings.fastSkip) {
            if (video.playbackRate !== 16) {
                try { video.playbackRate = 16; st.weRated = true; } catch { /* ignore */ }
            }
            const d = video.duration;
            if (isFinite(d) && d > 0.5 && video.currentTime < d - 0.3) {
                try { video.currentTime = d - 0.1; } catch { /* ignore */ }
            }
        }
        if (video.paused && !video.ended) {
            const p = video.play();
            if (p && typeof p.catch === "function") p.catch(() => {});
        }
    }

    // Không có QC mà video bị kẹt ở tốc độ bất thường (>4x, YouTube không cho phép) → chắc chắn là lỗi, khôi phục
    function watchdog(player) {
        if (!player) return;
        const st = getState(player);
        if (st.active || isConfirmedAd(player)) return;
        const video = playerVideo(player);
        if (!video) return;
        if (video.playbackRate > 4) {
            try { video.playbackRate = userRate(player, null); } catch { /* ignore */ }
        }
    }

    function processPlayer(player) {
        if (!player || !player.isConnected) return;
        const st = getState(player);

        if (!adBlockingActive()) {
            if (st.active) exitAd(player, st);
            return;
        }

        const video = playerVideo(player);
        if (isConfirmedAd(player)) {
            st.missSince = 0;
            if (!st.active) enterAd(player, st, video);
            handleAd(player, st, video);
        } else {
            if (st.active) {
                // Class ad-showing vẫn còn nhưng UI QC tạm biến mất (chuyển giữa 2 QC trong 1 chuỗi):
                // chờ tối đa 700ms trước khi khôi phục. Mất class → khôi phục ngay.
                if (hasAdClass(player)) {
                    if (!st.missSince) st.missSince = Date.now();
                    if (Date.now() - st.missSince < 700) return;
                }
                st.missSince = 0;
                exitAd(player, st);
            }
            watchdog(player);
        }
    }

    function attachPlayer(player) {
        if (knownPlayers.has(player)) return;
        knownPlayers.add(player);
        // Phản ứng tức thì khi class ad-showing thay đổi (không quét subtree → rất nhẹ)
        try {
            const mo = new MutationObserver(() => processPlayer(player));
            mo.observe(player, { attributes: true, attributeFilter: ["class"] });
        } catch { /* ignore */ }
    }

    function attachVideo(player) {
        const video = playerVideo(player);
        if (!video || video.__fgHooked) return;
        video.__fgHooked = true;
        const onMedia = () => processPlayer(player);
        video.addEventListener("loadedmetadata", onMedia);
        video.addEventListener("playing", onMedia);
        video.addEventListener("ratechange", onMedia);
        if (player.id === "movie_player") {
            video.addEventListener("pause", onUnexpectedPause);
            video.addEventListener("timeupdate", () => onSponsorTimeUpdate(player, video));
            // Video mới được nạp (đổi clip) → theo dõi 8s đầu, YouTube hay pause ngay lúc này
            video.addEventListener("loadeddata", () => startLoadWatch());
        }
    }

    function scanPlayers() {
        const players = document.querySelectorAll(".html5-video-player");
        for (let i = 0; i < players.length; i++) {
            attachPlayer(players[i]);
            attachVideo(players[i]);
            processPlayer(players[i]);
        }
        for (const p of knownPlayers) {
            if (!p.isConnected) knownPlayers.delete(p);
        }
    }

    // ---------- Chống YouTube tự pause (chỉ video chính trên trang /watch) ----------
    // Nguyên tắc: CHỈ phát lại khi chắc chắn người dùng KHÔNG bấm dừng
    // (chuột/chạm vào player, phím Space/K, phím media phần cứng, PiP đều được tính là thao tác người dùng).
    let lastUserMediaIntent = 0;
    function markUserIntent() {
        lastUserMediaIntent = Date.now();
        loadWatchUntil = 0; // người dùng đã thao tác → ngừng tự phát lại sau khi đổi clip
    }
    function userActedRecently() {
        return Date.now() - lastUserMediaIntent < 2500;
    }

    document.addEventListener("pointerdown", (e) => {
        if (!e.isTrusted || !e.target || !e.target.closest) return;
        if (e.target.closest(".html5-video-player, video, ytd-miniplayer, .ytp-miniplayer-ui")) markUserIntent();
    }, true);

    document.addEventListener("keydown", (e) => {
        if (!e.isTrusted) return;
        const el = e.target;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
        if (e.code === "Space" || e.key === "k" || e.key === "K" || e.key === "MediaPlayPause" ||
            e.key === "MediaStop" || e.key === "MediaTrackNext" || e.key === "MediaTrackPrevious") markUserIntent();
    }, true);

    // Phím media phần cứng / điều khiển media của hệ điều hành đi qua MediaSession (không có keydown)
    try {
        const ms = navigator.mediaSession;
        if (ms && typeof ms.setActionHandler === "function") {
            const origSet = ms.setActionHandler.bind(ms);
            ms.setActionHandler = function (action, handler) {
                if (typeof handler === "function") {
                    const h = handler;
                    return origSet(action, function (...args) {
                        markUserIntent();
                        return h.apply(this, args);
                    });
                }
                return origSet(action, handler);
            };
        }
    } catch { /* ignore */ }

    function isWatchPage() {
        return /^\/(watch|live\/)/.test(location.pathname);
    }

    function canAutoResume(player, video) {
        if (!allowLicense || !player || !video) return false;
        if (!isWatchPage()) return false;
        if (hasAdClass(player)) return false;
        if (!video.paused || video.ended) return false;
        if (realVisibility() !== "visible") {
            // Tab ẩn: chỉ phát lại khi bật Phát nền và YouTube vừa pause ngay lúc ẩn (≤3s).
            // Không tự phát lại các lần dừng về sau (ví dụ cuộc gọi điện thoại chiếm âm thanh).
            if (!bgPlayOn() || Date.now() - hiddenAt > 3000) return false;
        }
        if (document.pictureInPictureElement) return false;
        if (userActedRecently()) return false;
        const d = video.duration;
        if (isFinite(d) && d > 0 && video.currentTime >= d - 1) return false; // sắp hết video → để YouTube xử lý
        if (findPauseDialog()) {
            confirmContinueWatching();
        }
        return true;
    }

    // Chống "giằng co" nếu YouTube cứ pause liên tục: tối đa 4 lần / 10 giây
    const resumeHistory = [];
    function resumeAllowedNow() {
        const now = Date.now();
        while (resumeHistory.length && now - resumeHistory[0] > 10000) resumeHistory.shift();
        if (resumeHistory.length >= 4) return false;
        resumeHistory.push(now);
        return true;
    }

    function doResume(player, video) {
        if (!resumeAllowedNow()) return;
        let viaApi = false;
        try {
            if (typeof player.playVideo === "function") {
                player.playVideo();
                viaApi = true;
            }
        } catch { /* ignore */ }
        if (viaApi) return;
        // Chỉ dùng video.play() khi API của player không có / lỗi (vẫn nằm trong giới hạn số lần)
        const p = video.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
    }

    function resumeMainPlayer() {
        const player = mainPlayer();
        const video = playerVideo(player);
        if (canAutoResume(player, video)) doResume(player, video);
    }

    let pausedWhileHidden = false;

    function onUnexpectedPause(e) {
        const video = e.target;
        if (!video || video.ended) return;
        if (realVisibility() === "hidden" && !bgPlayOn()) {
            if (!userActedRecently()) pausedWhileHidden = true;
            return;
        }
        if (userActedRecently()) return;
        setTimeout(resumeMainPlayer, 250);
    }

    // Sau khi đổi clip: YouTube có thể nạp video ở trạng thái pause (không phát sinh sự kiện "pause")
    let loadWatchUntil = 0;
    let loadWatchTimer = null;

    function startLoadWatch() {
        if (!allowLicense || !isWatchPage()) return;
        loadWatchUntil = Date.now() + 8000;
        if (loadWatchTimer) return;
        loadWatchTimer = setInterval(() => {
            if (Date.now() > loadWatchUntil) {
                clearInterval(loadWatchTimer);
                loadWatchTimer = null;
                return;
            }
            const player = mainPlayer();
            const video = playerVideo(player);
            if (video && video.readyState >= 2 && canAutoResume(player, video)) doResume(player, video);
        }, 500);
    }

    // Listener trên document có thể bị chặn bởi visibilityGate → đăng ký qua kênh nội bộ
    onRealVisibilityChange(() => {
        if (realVisibility() !== "visible" || !pausedWhileHidden) return;
        pausedWhileHidden = false;
        setTimeout(resumeMainPlayer, 300);
    });

    // ---------- Khôi phục màn hình lỗi ----------
    let lastRecoveredVid = "";
    let lastRecoveredAt = 0;

    function recoverFromPlaybackError() {
        const player = mainPlayer();
        if (!player) return;
        const errEl = player.querySelector(".ytp-error");
        if (!errEl || !isVisibleEl(errEl)) return;
        const now = Date.now();
        if (now - lastRecoveredAt < 5000) return;
        let vid = "";
        try {
            vid = (typeof player.getVideoData === "function" && player.getVideoData()?.video_id) ||
                new URLSearchParams(location.search).get("v") || "";
        } catch { /* ignore */ }
        if (!vid || vid === lastRecoveredVid) return;
        lastRecoveredVid = vid;
        lastRecoveredAt = now;
        try {
            const t = (typeof player.getCurrentTime === "function" && player.getCurrentTime()) || 0;
            if (typeof player.loadVideoById === "function") player.loadVideoById(vid, t > 1 ? t : 0);
        } catch { /* ignore */ }
    }

    // ---------- Hộp thoại ----------
    const PAUSE_DIALOG_RE = /video paused|continue watching|still watching|still listening|tạm dừng|tam dung|tiếp tục xem|tiep tuc xem|vẫn đang|se ha pausado|vidéo en pause/i;

    function findPauseDialog() {
        // YouTube Music: "Bạn vẫn đang nghe chứ?"
        const music = document.querySelector("ytmusic-you-there-renderer");
        if (music && isVisibleEl(music)) return music;
        const dialogs = document.querySelectorAll("yt-confirm-dialog-renderer");
        for (let i = 0; i < dialogs.length; i++) {
            const d = dialogs[i];
            if (!isVisibleEl(d)) continue;
            if (PAUSE_DIALOG_RE.test(d.textContent || "")) return d;
        }
        return null;
    }

    function confirmContinueWatching() {
        const dialog = findPauseDialog();
        if (!dialog) return false;
        const btn = dialog.querySelector("#confirm-button button, #confirm-button, .yt-button-renderer button, button");
        if (btn && isVisibleEl(btn)) {
            try { btn.click(); } catch { /* ignore */ }
            setTimeout(resumeMainPlayer, 100);
            return true;
        }
        return false;
    }

    function dismissDialogs() {
        const root = mainPlayer() || document;
        const btns = root.querySelectorAll(DISMISS_SELECTOR_STR);
        for (let i = 0; i < btns.length; i++) {
            if (isVisibleEl(btns[i])) {
                try { btns[i].click(); } catch { /* ignore */ }
            }
        }
    }

    const LOCK_CLASSES = ["iron-overlay-scroll-block", "hidenscroll", "no-scroll", "disable-scroll", "yt-dialog-scroll-disable"];

    function unlockPageScroll() {
        [document.documentElement, document.body].forEach((el) => {
            if (!el) return;
            for (let i = 0; i < LOCK_CLASSES.length; i++) el.classList.remove(LOCK_CLASSES[i]);
            if (el.style.overflow === "hidden" || el.style.overflowY === "hidden") {
                el.style.removeProperty("overflow");
                el.style.removeProperty("overflow-y");
            }
        });
        document.querySelectorAll("tp-yt-iron-overlay-backdrop.opened").forEach((b) => b.remove());
    }

    function removeAntiAdblock() {
        const matches = document.querySelectorAll(ANTI_ADBLOCK_SELECTOR_STR);
        if (!matches.length) return false;
        for (let i = 0; i < matches.length; i++) {
            const el = matches[i];
            const btn = el.querySelector("#dismiss-button button, #dismiss-button, button[aria-label*='Close' i], button[aria-label*='Đóng' i]");
            if (btn) { try { btn.click(); } catch { /* ignore */ } }
            const dialog = el.closest("tp-yt-paper-dialog");
            (dialog || el).remove();
        }
        unlockPageScroll();
        postCount("antiAdblock");
        setTimeout(resumeMainPlayer, 150);
        return true;
    }

    // ---------- Premium: HÌNH TRONG HÌNH (PiP) ----------
    const SVG_NS = "http://www.w3.org/2000/svg";

    function pipSupported() {
        return !!document.pictureInPictureEnabled;
    }

    async function togglePip() {
        const video = playerVideo(mainPlayer());
        if (!video) return;
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                video.disablePictureInPicture = false;
                await video.requestPictureInPicture();
            }
        } catch { /* trình duyệt từ chối */ }
    }

    function buildPipButton() {
        const btn = document.createElement("button");
        btn.className = "ytp-button fg-pip-button";
        btn.type = "button";
        btn.title = "Hình trong hình (Alt+P)";
        btn.setAttribute("aria-label", "Hình trong hình");
        // Tạo SVG bằng DOM API (YouTube bật Trusted Types → không dùng innerHTML)
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", "0 0 36 36");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        const outer = document.createElementNS(SVG_NS, "path");
        outer.setAttribute("d", "M25 17h-8v6h8v-6zm4 8V11c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H9V10.98h18v14.04z");
        outer.setAttribute("fill", "#fff");
        svg.appendChild(outer);
        btn.appendChild(svg);
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePip();
        });
        return btn;
    }

    function ensurePipButton() {
        const existing = document.querySelectorAll(".fg-pip-button");
        const want = allowLicense && fgSettings.pipButton !== false && pipSupported();
        if (!want) {
            existing.forEach((b) => b.remove());
            return;
        }
        const player = mainPlayer();
        const ctrls = player && player.querySelector(".ytp-right-controls");
        if (!ctrls || ctrls.querySelector(".fg-pip-button")) return;
        ctrls.insertBefore(buildPipButton(), ctrls.firstChild);
    }

    document.addEventListener("keydown", (e) => {
        if (!e.isTrusted || !e.altKey || (e.key !== "p" && e.key !== "P")) return;
        if (!allowLicense || fgSettings.pipButton === false || !pipSupported()) return;
        const el = e.target;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
        e.preventDefault();
        togglePip();
    }, true);

    // ---------- Premium: CHẤT LƯỢNG ƯU TIÊN ----------
    const QUALITY_ORDER = ["highres", "hd2880", "hd2160", "hd1440", "hd1080", "hd720", "large", "medium", "small", "tiny"];
    const QUALITY_TARGET = { "2160": "hd2160", "1440": "hd1440", "1080": "hd1080", "720": "hd720", "480": "large" };
    let lastQualityVid = "";

    // Áp dụng 1 lần cho mỗi video — người dùng tự đổi chất lượng giữa chừng vẫn được tôn trọng
    function applyQuality(player) {
        const pref = String(fgSettings.videoQuality || "auto");
        if (!allowLicense || pref === "auto" || !player || hasAdClass(player)) return;
        let vid = "";
        try { vid = (typeof player.getVideoData === "function" && player.getVideoData()?.video_id) || ""; } catch { /* ignore */ }
        if (!vid || vid === lastQualityVid) return;
        let levels = [];
        try { levels = (typeof player.getAvailableQualityLevels === "function" && player.getAvailableQualityLevels()) || []; } catch { /* ignore */ }
        levels = levels.filter((l) => QUALITY_ORDER.includes(l));
        if (!levels.length) return; // chưa sẵn sàng, thử lại ở lần quét sau

        let pick;
        if (pref === "max") {
            pick = QUALITY_ORDER.find((q) => levels.includes(q));
        } else {
            const ti = QUALITY_ORDER.indexOf(QUALITY_TARGET[pref] || "hd1080");
            pick = QUALITY_ORDER.find((q, i) => i >= ti && levels.includes(q)) || levels[levels.length - 1];
        }
        if (!pick) return;
        try {
            if (typeof player.setPlaybackQualityRange === "function") player.setPlaybackQualityRange(pick, pick);
            if (typeof player.setPlaybackQuality === "function") player.setPlaybackQuality(pick);
        } catch { /* ignore */ }
        lastQualityVid = vid;
    }

    // ---------- Thông báo nhỏ trên trình phát ----------
    let toastTimer = null;
    function showPlayerToast(text) {
        const player = mainPlayer();
        if (!player) return;
        let el = player.querySelector(".fg-toast");
        if (!el) {
            el = document.createElement("div");
            el.className = "fg-toast";
            player.appendChild(el);
        }
        el.textContent = text;
        el.classList.add("fg-toast-show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("fg-toast-show"), 2200);
    }

    function fmtTime(sec) {
        sec = Math.max(0, Math.floor(sec));
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), ss = sec % 60;
        const mm = h ? String(m).padStart(2, "0") : String(m);
        return (h ? h + ":" : "") + mm + ":" + String(ss).padStart(2, "0");
    }

    function currentVideoId(player) {
        try {
            const id = player && typeof player.getVideoData === "function" && player.getVideoData()?.video_id;
            if (id) return String(id);
        } catch { /* ignore */ }
        try { return new URLSearchParams(location.search).get("v") || ""; } catch { return ""; }
    }

    // ---------- SponsorBlock: tự bỏ qua đoạn tài trợ / tự quảng bá / nhắc đăng ký ----------
    const SB_LABEL = { sponsor: "đoạn tài trợ", selfpromo: "đoạn tự quảng bá", interaction: "đoạn nhắc đăng ký" };
    let sb = { vid: "", segments: [], skipped: new Set() };
    let sbRequestedVid = "";

    function maybeRequestSponsor() {
        if (!allowLicense || fgSettings.sponsorBlock === false || !isWatchPage()) return;
        const vid = currentVideoId(mainPlayer());
        if (!vid || vid === sbRequestedVid) return;
        sbRequestedVid = vid;
        sb = { vid, segments: [], skipped: new Set() };
        window.postMessage({ type: "FG_SB_REQ", token: FG_TOKEN, videoId: vid }, "*");
    }

    function receiveSponsorSegments(msg) {
        if (!msg || msg.videoId !== sb.vid || !Array.isArray(msg.segments)) return;
        sb.segments = msg.segments
            .filter((x) => x && isFinite(x.start) && isFinite(x.end) && x.end > x.start)
            .map((x) => ({ start: +x.start, end: +x.end, category: String(x.category || "sponsor"), uuid: String(x.uuid || x.start) }))
            .sort((a, b) => a.start - b.start);
    }

    function onSponsorTimeUpdate(player, video) {
        if (!allowLicense || isWhitelistedChannel || fgSettings.sponsorBlock === false) return;
        if (!sb.segments.length || hasAdClass(player)) return;
        if (currentVideoId(player) !== sb.vid) return;
        const t = video.currentTime;
        for (const seg of sb.segments) {
            if (sb.skipped.has(seg.uuid)) continue;
            if (t >= seg.start && t < seg.end - 0.5) {
                // Chỉ bỏ qua 1 lần — người dùng tua ngược lại xem thì để yên
                sb.skipped.add(seg.uuid);
                const d = video.duration;
                const target = isFinite(d) && d > 0 ? Math.min(seg.end, d - 0.25) : seg.end;
                try { video.currentTime = target; } catch { /* ignore */ }
                showPlayerToast("Đã bỏ qua " + (SB_LABEL[seg.category] || "đoạn tài trợ") + " (" + fmtTime(seg.end - seg.start) + ")");
                break;
            }
        }
    }

    // ---------- Premium: NHẢY TỚI ĐOẠN HAY NHẤT (Jump ahead) ----------
    // Dữ liệu "được xem lại nhiều nhất" của YouTube: [{t: giây bắt đầu, d: độ dài, v: 0..1}]
    let heat = { vid: "", markers: [] };

    function extractHeatMarkers(root) {
        const found = [];
        const stack = [[root, 0]];
        let guard = 0;
        while (stack.length && guard++ < 200000) {
            const [node, depth] = stack.pop();
            if (!node || typeof node !== "object" || depth > 40) continue;
            // Định dạng mới: macroMarkersListEntity (MARKER_TYPE_HEATMAP)
            const ml = node.macroMarkersListEntity && node.macroMarkersListEntity.markersList;
            if (ml && ml.markerType === "MARKER_TYPE_HEATMAP" && Array.isArray(ml.markers)) {
                for (const m of ml.markers) {
                    found.push({ t: +m.startMillis / 1000, d: +m.durationMillis / 1000, v: +m.intensityScoreNormalized });
                }
                if (found.length) return found;
            }
            // Định dạng cũ: heatMarkerRenderer
            const hm = node.heatMarkerRenderer;
            if (hm) {
                found.push({ t: +hm.timeRangeStartMillis / 1000, d: +hm.markerDurationMillis / 1000, v: +hm.heatMarkerIntensityScoreNormalized });
                continue;
            }
            for (const k in node) {
                const v = node[k];
                if (v && typeof v === "object") stack.push([v, depth + 1]);
            }
        }
        return found;
    }

    function cleanMarkers(list) {
        return list.filter((m) => isFinite(m.t) && isFinite(m.v) && m.t >= 0).sort((a, b) => a.t - b.t);
    }

    function captureHeatmap(detail) {
        try {
            const src = detail && detail.response ? detail.response.response || detail.response : null;
            if (!src) return;
            const markers = cleanMarkers(extractHeatMarkers(src));
            const vid = (src.currentVideoEndpoint && src.currentVideoEndpoint.watchEndpoint && src.currentVideoEndpoint.watchEndpoint.videoId) ||
                new URLSearchParams(location.search).get("v") || "";
            heat = { vid, markers };
        } catch { /* ignore */ }
    }

    // Phương án dự phòng: đọc đồ thị nhiệt vẽ trên thanh tiến trình
    function heatFromDom(player, duration) {
        const container = player.querySelector(".ytp-heat-map-container");
        if (!container || !isFinite(duration) || duration <= 0) return [];
        const total = container.getBoundingClientRect().width;
        if (!total) return [];
        const out = [];
        container.querySelectorAll(".ytp-heat-map-chapter").forEach((ch) => {
            const left = parseFloat(ch.style.left) || 0;
            const width = parseFloat(ch.style.width) || ch.getBoundingClientRect().width;
            const path = ch.querySelector("path.ytp-heat-map-path, path");
            const dAttr = path && path.getAttribute("d");
            if (!dAttr || !width) return;
            const nums = dAttr.match(/-?\d+(\.\d+)?/g) || [];
            for (let i = 0; i + 1 < nums.length; i += 2) {
                const x = +nums[i], y = +nums[i + 1];
                if (x < 0 || x > 1000) continue;
                out.push({ t: ((left + (x / 1000) * width) / total) * duration, d: 0, v: Math.max(0, Math.min(1, (100 - y) / 100)) });
            }
        });
        return cleanMarkers(out);
    }

    function getHeatMarkers(player, video) {
        const vid = currentVideoId(player);
        if (heat.vid === vid && heat.markers.length) return heat.markers;
        if (!heat.markers.length || heat.vid !== vid) {
            // Lần tải trang đầu tiên: dữ liệu nằm trong ytInitialData
            try {
                const init = window.ytInitialData;
                const initVid = init && init.currentVideoEndpoint && init.currentVideoEndpoint.watchEndpoint &&
                    init.currentVideoEndpoint.watchEndpoint.videoId;
                if (init && initVid === vid) {
                    const markers = cleanMarkers(extractHeatMarkers(init));
                    if (markers.length) { heat = { vid, markers }; return markers; }
                }
            } catch { /* ignore */ }
        }
        return heatFromDom(player, video ? video.duration : NaN);
    }

    /** Chọn điểm "được xem lại nhiều nhất" phía trước thời điểm hiện tại (bỏ qua 5 giây sát bên).
     *  Loại trừ phần cuối video (màn hình kết thúc hay có đỉnh giả): max(10s, 3% thời lượng). */
    function pickJumpTarget(markers, now, duration) {
        const tail = isFinite(duration) && duration > 0 ? Math.max(10, duration * 0.03) : 0;
        let best = null;
        for (const m of markers) {
            if (m.t < now + 5) continue;
            if (tail && m.t > duration - tail) continue;
            if (!best || m.v > best.v) best = m;
        }
        return best;
    }

    function jumpAhead() {
        const player = mainPlayer();
        const video = playerVideo(player);
        if (!player || !video || hasAdClass(player)) return;
        const target = pickJumpTarget(getHeatMarkers(player, video), video.currentTime, video.duration);
        if (!target) {
            showPlayerToast("Video này chưa có dữ liệu đoạn hay nhất");
            return;
        }
        try {
            if (typeof player.seekTo === "function") player.seekTo(target.t, true);
            else video.currentTime = target.t;
        } catch { video.currentTime = target.t; }
        showPlayerToast("Đã nhảy tới đoạn được xem nhiều nhất · " + fmtTime(target.t));
    }

    function buildJumpButton() {
        const btn = document.createElement("button");
        btn.className = "ytp-button fg-jump-button";
        btn.type = "button";
        btn.title = "Nhảy tới đoạn hay nhất (Alt+J)";
        btn.setAttribute("aria-label", "Nhảy tới đoạn hay nhất");
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", "0 0 36 36");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", "M9 12l8 6-8 6V12zm9 0l8 6-8 6V12zm10-3l.9 2.1L31 12l-2.1.9L28 15l-.9-2.1L25 12l2.1-.9L28 9z");
        path.setAttribute("fill", "#fff");
        svg.appendChild(path);
        btn.appendChild(svg);
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            jumpAhead();
        });
        return btn;
    }

    function ensureJumpButton() {
        const want = allowLicense && fgSettings.jumpAhead !== false && isWatchPage();
        if (!want) {
            document.querySelectorAll(".fg-jump-button").forEach((b) => b.remove());
            return;
        }
        const player = mainPlayer();
        const ctrls = player && player.querySelector(".ytp-right-controls");
        if (!ctrls || ctrls.querySelector(".fg-jump-button")) return;
        ctrls.insertBefore(buildJumpButton(), ctrls.firstChild);
    }

    document.addEventListener("keydown", (e) => {
        if (!e.isTrusted || !e.altKey || (e.key !== "j" && e.key !== "J")) return;
        if (!allowLicense || fgSettings.jumpAhead === false || !isWatchPage()) return;
        const el = e.target;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
        e.preventDefault();
        jumpAhead();
    }, true);

    // ---------- HIỆU ỨNG ÁNH SÁNG NỀN (kiểu "Ambient light for YouTube") ----------
    // Màu video toả rực ra QUANH CẢ 4 PHÍA trình phát, lan ra nền trang.
    // Cách làm an toàn — KHÔNG chèn gì vào cây DOM của YouTube (từng làm hỏng trình phát):
    //   • 1 canvas riêng gắn vào <body>, nằm SAU toàn bộ trang (z-index -1), to hơn trình phát
    //     → phần lộ ra quanh trình phát chính là màu viền của khung hình (như đèn hắt sau TV).
    //   • Khi bật: class "fg-ambient-on" trên <html> → CSS làm trong suốt nền khung trang để thấy lớp sáng,
    //     ẩn "Chế độ môi trường" gốc của YouTube (tránh 2 lớp).
    // Hiệu năng: canvas 64×36, 10 khung/giây, dừng hẳn khi video tạm dừng / tab ẩn.
    const AMB_W = 64, AMB_H = 36;
    const AMB_SPREAD_X = 0.2, AMB_SPREAD_Y = 0.26; // toả ra mỗi phía (theo tỉ lệ kích thước trình phát)
    let amb = { canvas: null, ctx: null, player: null, timer: null, ro: null, drew: false };

    const AMB_STYLE = {
        position: "absolute", zIndex: "-1", pointerEvents: "none", display: "block", margin: "0",
        filter: "blur(72px) saturate(1.6) brightness(1.1)", opacity: "0.9", transform: "translateZ(0)",
        borderRadius: "40px",
    };

    function ambientWanted() {
        return allowLicense && fgSettings.ambientGlow !== false && isWatchPage() && !!document.body &&
            document.documentElement.hasAttribute("dark") && !document.fullscreenElement;
    }

    function teardownAmbient() {
        if (amb.timer) clearInterval(amb.timer);
        if (amb.ro) amb.ro.disconnect();
        if (amb.canvas) amb.canvas.remove();
        document.documentElement.classList.remove("fg-ambient-on");
        amb = { canvas: null, ctx: null, player: null, timer: null, ro: null, drew: false };
    }

    function layoutAmbient() {
        if (!amb.canvas || !amb.player) return;
        const pr = amb.player.getBoundingClientRect();
        const st = amb.canvas.style;
        if (pr.width < 50 || pr.height < 30) {
            if (st.visibility !== "hidden") st.visibility = "hidden";
            return;
        }
        const vw = document.documentElement.clientWidth || window.innerWidth;
        const sx = window.scrollX || 0, sy = window.scrollY || 0;
        // Không vượt mép màn hình theo chiều ngang (tránh thanh cuộn ngang); ánh mờ vẫn lan tới sát mép
        const left = Math.max(pr.left - pr.width * AMB_SPREAD_X, 0);
        const right = Math.min(pr.right + pr.width * AMB_SPREAD_X, vw);
        const next = {
            left: (left + sx) + "px",
            top: (pr.top - pr.height * AMB_SPREAD_Y + sy) + "px",
            width: Math.max(0, right - left) + "px",
            height: (pr.height * (1 + 2 * AMB_SPREAD_Y)) + "px",
            visibility: "visible",
        };
        for (const k in next) if (st[k] !== next[k]) st[k] = next[k];
    }

    function drawAmbient(alpha) {
        const video = playerVideo(amb.player);
        const ctx = amb.ctx;
        if (!ctx || !video || video.readyState < 2) return;
        try {
            ctx.globalAlpha = alpha; // cộng dồn khung → chuyển màu mượt, không nháy
            ctx.drawImage(video, 0, 0, AMB_W, AMB_H);
            amb.drew = true;
        } catch { /* khung hình chưa sẵn sàng */ }
    }

    function ensureAmbient() {
        if (!ambientWanted()) { if (amb.canvas) teardownAmbient(); return; }
        const player = mainPlayer();
        if (!player) { if (amb.canvas) teardownAmbient(); return; }
        if (amb.canvas && (amb.player !== player || !amb.canvas.isConnected)) teardownAmbient();

        if (!amb.canvas) {
            const canvas = document.createElement("canvas");
            canvas.className = "fg-ambient";
            canvas.width = AMB_W;
            canvas.height = AMB_H;
            canvas.setAttribute("aria-hidden", "true");
            Object.assign(canvas.style, AMB_STYLE);
            document.body.appendChild(canvas);
            amb = { canvas, ctx: canvas.getContext("2d", { alpha: false }), player, timer: null, ro: null, drew: false };
            if (amb.ctx) { amb.ctx.fillStyle = "#0f0f0f"; amb.ctx.fillRect(0, 0, AMB_W, AMB_H); }
            try {
                amb.ro = new ResizeObserver(layoutAmbient);
                amb.ro.observe(player);
            } catch { /* trình duyệt cũ: vòng quét 300ms vẫn tự căn lại */ }
        }
        if (!document.documentElement.classList.contains("fg-ambient-on")) {
            document.documentElement.classList.add("fg-ambient-on");
        }
        layoutAmbient();

        const video = playerVideo(player);
        const playing = !!video && !video.paused && !video.ended && realVisibility() === "visible";
        if (!amb.drew && video && video.readyState >= 2) drawAmbient(1); // khung đầu tiên (kể cả khi đang dừng)
        if (playing && !amb.timer) amb.timer = setInterval(() => drawAmbient(0.3), 100);
        if (!playing && amb.timer) { clearInterval(amb.timer); amb.timer = null; } // giữ khung cuối, không tốn CPU
    }

    window.addEventListener("resize", () => layoutAmbient(), { passive: true });
    document.addEventListener("fullscreenchange", () => ensureAmbient());

    // Cho bộ test truy cập hàm thuần (không ảnh hưởng hoạt động)
    if (window.__FG_TEST__) window.__FG_TEST__.main = { pickJumpTarget, extractHeatMarkers, heatFromDom };

    // ---------- Giao tiếp với content script ----------
    function applyConfig(msg) {
        if (msg.settings && typeof msg.settings === "object") fgSettings = { ...fgSettings, ...msg.settings };
        if (typeof msg.whitelisted === "boolean") isWhitelistedChannel = msg.whitelisted;
        if (msg.remote) applyRemote(msg.remote);
        scanPlayers();
    }

    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || typeof msg !== "object") return;

        if (msg.type === "FG_TOKEN_REQUEST") {
            window.postMessage({ type: "FG_TOKEN_READY", token: FG_TOKEN }, "*");
            return;
        }
        if (msg.type === "FG_LICENSE") {
            allowLicense = !!msg.ok;
            try { sessionStorage.setItem("__fg_lic", allowLicense ? "1" : "0"); } catch { /* ignore */ }
            applyConfig(msg);
            return;
        }
        if (msg.type === "FG_RESUME_PLAY") return;
        if (msg.token !== FG_TOKEN) return;

        if (msg.type === "FG_CONFIG") { applyConfig(msg); return; }
        if (msg.type === "FG_SB") { receiveSponsorSegments(msg); return; }
        if (!allowLicense || isWhitelistedChannel) return;

        if (msg.type === "FG_DISMISS") dismissDialogs();
        else if (msg.type === "FG_ANTI_ADBLOCK" && fgSettings.blockAntiAdblock) {
            confirmContinueWatching();
            removeAntiAdblock();
        }
    });

    // ---------- Vòng lặp ----------
    setInterval(() => {
        scanPlayers();
        ensurePipButton();
        ensureJumpButton();
        ensureAmbient();
        applyQuality(mainPlayer());
        maybeRequestSponsor();
        if (allowLicense && !isWhitelistedChannel) recoverFromPlaybackError();
    }, 300);

    setInterval(() => {
        if (!allowLicense || isWhitelistedChannel || !fgSettings.blockAntiAdblock) return;
        confirmContinueWatching();
        removeAntiAdblock();
    }, 1500);

    document.addEventListener("yt-navigate-finish", (e) => {
        captureHeatmap(e && e.detail);
        postIdentity(false);
        setTimeout(scanPlayers, 200);
        startLoadWatch();
    });

    window.postMessage({ type: "FG_TOKEN_READY", token: FG_TOKEN }, "*");
    postIdentity(true);
    setInterval(() => postIdentity(false), 10000);
})();
