// FUNNYGAME — MAIN world YouTube
// Nguyên tắc: CHỈ đụng vào video (mute / 16x / tua / skip) khi QC được XÁC NHẬN chặt chẽ:
//   player có class ad-showing/ad-interrupting  VÀ  có ít nhất 1 thành phần UI quảng cáo đang hiển thị.
// Mọi thay đổi đều được ghi nhớ và KHÔI PHỤC khi hết QC. Có watchdog chống video chính bị kẹt 16x.
(function () {
    if (window.__fgYtMain) return;
    window.__fgYtMain = true;
    const FG_TOKEN = "fg_" + Math.random().toString(36).slice(2) + Date.now().toString(36);

    const fgSkipStats = { fired: 0, throttled: 0, capped: 0 };
    const fgHandleStats = { calls: 0, rateSet: 0, seekEnd: 0, seek5: 0 };

    // ---------- Selector ----------
    // Thành phần UI chỉ xuất hiện khi player đang phát quảng cáo
    const AD_SIGNAL_STR_BASE = [
        ".ytp-ad-player-overlay",
        ".ytp-ad-player-overlay-layout",
        ".ytp-ad-player-overlay-instream-info",
        ".ytp-ad-simple-ad-badge",
        ".ytp-ad-badge",
        ".ytp-ad-badge--clean-player",
        ".ytp-ad-duration-remaining",
        ".ytp-ad-preview-container",
        ".ytp-ad-preview-text",
        ".ytp-ad-preview-text-modern",
        ".ytp-ad-text",
        ".ytp-ad-visit-advertiser-button",
        ".ytp-visit-advertiser-link",
        ".ytp-skip-ad-button",
        ".ytp-skip-ad-button-fix-fullscreen-grid",
        ".ytp-ad-skip-button",
        ".ytp-ad-skip-button-modern",
        ".ytp-ad-skip-button-slot",
        ".ytp-ad-action-interstitial",
        ".ytp-video-interstitial-buttoned-centered-layout",
        ".ytp-ad-avatar",
        ".ytp-ad-headline",
        ".ytp-ad-call-to-action",
        "[class*='ytp-ad-']:not(.ytp-ad-module):not(.video-ads):not(.ytp-ad-overlay-container):not([class*='progress']):not(.ytp-progress-bar-container *):not(.ytp-chrome-bottom .ytp-progress-bar *)",
    ];
    let AD_SIGNAL_STR = AD_SIGNAL_STR_BASE.join(",");

    const SKIP_STR_BASE = [
        "button.ytp-skip-ad-button",
        "button.ytp-skip-ad-button-fix-fullscreen-grid",
        "button[id^='skip-button']",
        ".ytp-skip-ad-button",
        ".ytp-skip-ad-button-fix-fullscreen-grid",
        "button.ytp-ad-skip-button",
        "button.ytp-ad-skip-button-modern",
        ".ytp-ad-skip-button-slot button",
        ".ytp-skip-ad-button-container button",
        ".ytp-ad-skip-button-container button",
        ".ytp-ad-survey-player-overlay-skip-or-preview button",
        ".ytp-ad-action-interstitial-skip-button",
        "button[class*='skip-ad']",
        "button[class*='ad-skip']",
        "[id^='skip-button'] button",
        // YouTube 2025+: nút "Bỏ qua" có thể là <div> / <span> với class lạ, không nằm trong <button>
        ".ytp-ad-skip-button-modern",
        ".ytp-skip-ad-button-modern",
        ".ytp-ad-skip-button-slot",
        "[class*='skip-ad-button']",
        "[class*='ad-skip-button']",
        "[id^='skip-button']",
    ];
    let SKIP_STR = SKIP_STR_BASE.join(",");

    // Nút "Bỏ qua" kiểu mới (đổi tên class): tìm theo chữ, CHỈ trong vùng quảng cáo → không bấm nhầm nút khác
    const AD_ZONE_BUTTONS = ".video-ads button, .ytp-ad-module button, [class*='ytp-ad-'] button, [class*='ytp-ad-'] [role='button']";
    const SKIP_TEXT_RE = /^\s*(bỏ qua|bo qua|skip)(\s*(quảng cáo|quang cao|ads?|video))?\s*[›>▶▸⏭]?\s*$/i;
    // Vùng chứa UI QC — dùng để tìm nút "Bỏ qua" theo CHỮ khi class lạ (YouTube đổi class liên tục).
    // Chỉ quét trong các vùng này để KHÔNG bấm nhầm nút "Bỏ qua" của chapter (ngoài vùng QC).
    const AD_ZONE_ROOTS = [
        ".video-ads",
        ".ytp-ad-module",
        ".ytp-ad-player-overlay",
        ".ytp-ad-player-overlay-layer",
        ".ytp-ad-overlay-container",
        ".ytp-ad-skip-button-slot",
        ".ytp-ad-action-interstitial",
        ".ytp-video-interstitial-buttoned-centered-layout",
        ".ytp-ad-survey-player-overlay",
    ].join(",");

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
    blockShopping: true,
    muteAds: true,
    fastSkip: true,
    blockManifest: true,
        backgroundPlay: true,
        pipButton: true,
        videoQuality: "auto",
        sponsorBlock: true,
        jumpAhead: true,
        ambientGlow: true,
    };
    let isWhitelistedChannel = false;

    // ---------- Cấu hình từ xa (đã được content script làm sạch) ----------
    function mergeSelectors(base, extra, isSkip) {
        const out = base.slice();
        if (Array.isArray(extra)) {
            for (const sel of extra) {
                if (typeof sel !== "string" || out.includes(sel)) continue;
                // Không nhận selector CTA nhà quảng cáo hoặc khung bao rỗng từ bộ nhớ đệm cũ
                if (isSkip && (/ytp-ad-button|ad-clickable|call-to-action/.test(sel) || /^\.ytp-ad-skip-button-slot\s*$/.test(sel))) continue;
                try { document.createDocumentFragment().querySelector(sel); out.push(sel); } catch { /* bỏ selector lỗi */ }
            }
        }
        return out.join(",");
    }

    function applyRemote(remote) {
        if (!remote || typeof remote !== "object") return;
        AD_SIGNAL_STR = mergeSelectors(AD_SIGNAL_STR_BASE, remote.adSignals, false);
        SKIP_STR = mergeSelectors(SKIP_STR_BASE, remote.skipButtons, true);
        ANTI_ADBLOCK_SELECTOR_STR = mergeSelectors(ANTI_ADBLOCK_SELECTOR_STR_BASE, remote.antiAdblock, false);
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
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
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
    // LƯU Ý QUAN TRỌNG (báo cáo lỗi thật 2.4.12):
    //   YouTube KHÔNG LUÔN gắn "ad-showing"/"ad-interrupting" khi đang phát QC.
    //   Quan sát thực tế (báo cáo 2026-10-31, video j8U06veqxdU):
    //     playerClass = "... ytp-transparent ... ad-created ytp-branding-shown
    //                    playing-mode buffering-mode unstarted-mode"
    //   → KHÔNG có "ad-showing"/"ad-interrupting" → hasAdClass() = false
    //   → isConfirmedAd() = false → extension KHÔNG xử lý QC
    //   → exitAd() reset video.style.opacity = "" → QC hiện ra cho người dùng.
    //   Ngoài ra player.getAdState() KHÔNG tồn tại (ytAdState = -1) → không dùng được.
    //   → Phải nhận biết QC qua: ad-created + ytp-branding-shown + UI QC thực tế.
    const AD_CLASS = "ad-showing";
    const AD_CLASS_2 = "ad-interrupting";
    // YouTube tạo player QC → gắn "ad-created" (giữ nguyên cả sau khi QC kết thúc).
    const AD_CREATED_CLASS = "ad-created";
    // Hiện nhãn "Quảng cáo"/logo nhà quảng cáo → dấu hiệu QC đang phát.
    const AD_BRANDING_CLASS = "ytp-branding-shown";

    function hasAdClass(player) {
        return !!player && (player.classList.contains(AD_CLASS) || player.classList.contains(AD_CLASS_2));
    }

    // Player đã được YouTube gắn "ad-created" (đã tạo slot QC).
    function hasAdCreatedClass(player) {
        return !!player && player.classList.contains(AD_CREATED_CLASS);
    }

    // Hiện nhãn thương hiệu QC (logo/ngữ "Quảng cáo") → QC đang phát.
    function hasAdBranding(player) {
        return !!player && player.classList.contains(AD_BRANDING_CLASS);
    }

    // API nội bộ của YouTube: trả về trạng thái player (1=đang phát, 2=dừng, 3=đang tua...).
    // Dùng để biết QC CÓ THỰC SỰ đang phát hay không (đáng tin hơn class trong DOM).
    function ytPlayerState(player) {
        try {
            if (player && typeof player.getPlayerState === "function") return player.getPlayerState();
        } catch { /* ignore */ }
        return -1;
    }

    // YouTube có API getAdState(): 1 = đang phát QC, 2 = QC đã chờ/kết thúc.
    // Trả về -1 nếu API không có (bản cũ / không phải player YouTube).
    function ytAdState(player) {
        try {
            if (player && typeof player.getAdState === "function") {
                const s = player.getAdState();
                if (typeof s === "number") return s;
            }
        } catch { /* ignore */ }
        return -1;
    }

    // QC có thực sự đang phát? Ưu tiên API YouTube (đáng tin hơn class trong DOM).
    // -1 = API không có → phải dựa vào DOM.
    function isAdReallyPlaying(player) {
        const adState = ytAdState(player);
        if (adState === 1) return true;
        if (adState === 2) return false;   // YouTube nói QC đã xong → tin YouTube
        return -1;
    }

    // QC bumper (YouTube 2025+): KHÔNG gắn class ad-showing/ad-interrupting,
    // chỉ có lớp overlay QC + badge QC nằm trong vùng .video-ads.
    // Phải có CẢ overlay LẪN badge (badge nằm trong overlay) để tránh nhận nhầm
    // badge sót lại sau khi QC kết thúc (sẽ tua nhầm video chính).
    function hasBumperAd(player) {
        const zone = player.querySelector(".video-ads, .ytp-ad-module");
        if (!zone) return false;
        const overlay = zone.querySelector(".ytp-ad-player-overlay-layer, .ytp-ad-player-overlay");
        if (!overlay || !hasBox(overlay)) return false;
        const badge = overlay.querySelector(AD_BADGE_SELECTORS);
        return !!badge && hasBox(badge);
    }

    // UI QC THỰC SỰ đang hiển thị trong player. Đây là tín hiệu ĐÁNG TIN nhất để biết QC đang phát,
    // vì nó không phụ thuộc tên class do YouTube đặt trên <html class="...">.
    //
    // CẨN THẬN — KHÔNG được coi là QC (tránh tua nhầm video chính):
    //   • .ytp-ad-progress-list (LUÔN có trong thanh tiến trình, kể cả video chính)
    //   • badge nằm NGOÀI vùng .video-ads (có thể là badge sót lại từ QC trước)
    // Được coi là QC:
    //   • nút "Bỏ qua" hiển thị
    //   • badge QC nằm trong vùng .video-ads / .ytp-ad-module
    //   • khung chỉ có khi QC: skip-button-slot, interstitial, overlay-container
    const AD_UI_ALONE_SELECTORS = [
        ".ytp-ad-skip-button-slot",              // khung chứa nút "Bỏ qua" — chỉ có khi QC
        ".ytp-ad-action-interstitial",           // thẻ bỏ qua dạng mới
        ".ytp-video-interstitial-buttoned-centered-layout",
        ".ytp-ad-survey-player-overlay",
        ".ytp-ad-overlay-container",             // khung overlay QC (riêng .video-ads)
    ];

    // Badge QC (nhãn "Quảng cáo") nằm trong vùng .video-ads → chắc chắn đang phát QC.
    const AD_BADGE_SELECTORS = ".ytp-ad-simple-ad-badge, .ytp-ad-badge, .ytp-ad-badge--clean-player, .ytp-ad-duration-remaining, .ytp-ad-text";

    // Kiểm tra UI QC có hiển thị thật không.
    // Overlay QC nằm trong vùng .video-ads và có kích thước → QC đang phát.
    function hasAdOverlayInZone(player) {
        const zone = player.querySelector(".video-ads, .ytp-ad-module");
        if (!zone) return false;
        const ov = zone.querySelector(".ytp-ad-player-overlay-layer, .ytp-ad-player-overlay, .ytp-ad-overlay-container");
        return !!ov && hasBox(ov);
    }

    function hasVisibleAdUi(player) {
        if (!player) return false;
        // 1) Nút "Bỏ qua" hiển thị → chắc chắn là QC
        if (findVisibleSkipButton(player)) return true;
        // 2) UI QC nằm trong vùng .video-ads (badge, overlay có badge) → QC
        const zone = player.querySelector(".video-ads, .ytp-ad-module");
        if (zone) {
            // 2a) Badge QC trong vùng .video-ads → dấu hiệu mạnh nhất
            const badges = zone.querySelectorAll(AD_BADGE_SELECTORS);
            for (let i = 0; i < badges.length; i++) {
                if (hasBox(badges[i])) return true;
            }
            // 2b) Overlay QC có badge bên trong
            const overlay = zone.querySelector(".ytp-ad-player-overlay-layer, .ytp-ad-player-overlay");
            if (overlay && hasBox(overlay)) {
                const badge = overlay.querySelector(AD_BADGE_SELECTORS);
                if (badge && hasBox(badge)) return true;
            }
        }
        // 3) Các khung UI CHỈ có khi QC (khung nút bỏ qua, thẻ interstitial, overlay container)
        for (let i = 0; i < AD_UI_ALONE_SELECTORS.length; i++) {
            const els = player.querySelectorAll(AD_UI_ALONE_SELECTORS[i]);
            for (let j = 0; j < els.length; j++) {
                if (hasBox(els[j])) return true;
            }
        }
        return false;
    }

    function isConfirmedAd(player) {
        if (!player) return false;
        // API YouTube báo đang phát QC → xác nhận chắc chắn, kể cả khi DOM chưa kịp render UI.
        // (Trường hợp UI QC render chậm → không thấy badge/nút "Bỏ qua" → dễ bị bỏ lọt)
        if (isAdReallyPlaying(player) === true) return true;
        // Đường 1: có class ad-showing/ad-interrupting + UI QC hiển thị
        if (hasAdClass(player)) {
            const signals = player.querySelectorAll(AD_SIGNAL_STR);
            for (let i = 0; i < signals.length; i++) {
                if (hasBox(signals[i])) return true;
            }
        }
        // Đường 2 (MỚI — fix lỗi thật 2.4.12): YouTube KHÔNG gắn "ad-showing", chỉ gắn
        // "ad-created" + "ytp-branding-shown" (nhãn QC hiện ra) và UI QC vẫn hiển thị.
        // → coi như QC khi có UI QC thật sự hiển thị.
        if (hasAdCreatedClass(player) && hasVisibleAdUi(player)) return true;
        // Đường 2b: "ad-created" + "ytp-branding-shown" (YouTube đang hiện nhãn QC)
        // + có overlay QC trong .video-ads → QC chắc chắn đang phát.
        if (hasAdCreatedClass(player) && hasAdBranding(player) && hasAdOverlayInZone(player)) return true;
        // Đường 3: QC bumper (overlay + badge), không có class ad-showing
        if (!hasAdClass(player) && hasBumperAd(player)) return true;
        return false;
    }

    // ---------- Máy trạng thái QC theo từng player ----------
    const stateMap = new WeakMap();
    const knownPlayers = new Set();
    const playerObservers = new Map();
    const adUiZones = new Map();

    function getState(player) {
        let st = stateMap.get(player);
        if (!st) {
            st = { active: false, savedRate: 1, weMuted: false, weRated: false, video: null, seekRetryAt: 0, adStartAt: 0, skipClickedAt: 0, skipApiCalled: false, skipApiAt: 0, skipApiCount: 0 };
            stateMap.set(player, st);
        }
        return st;
    }

    // ---------- Gọi API skip của player (bỏ qua tức thì, 0 giây) ----------
    // player.skipAd() là cách nhanh nhất: YouTube tự chuyển thẳng sang video chính.
    // NHƯNG gọi lặp lại liên tục khiến player re-init liên tục → Chrome đứng.
    // Vì vậy: tối đa SKIP_API_MAX lần mỗi QC, mỗi lần cách nhau tối thiểu SKIP_API_GAP.
    const SKIP_API_GAP = 700;
    const SKIP_API_MAX = 4;

    function trySkipApi(player, st) {
        if (!st) return false;
        const now = Date.now();
        if (st.skipApiCount >= SKIP_API_MAX) return false;
        if (st.skipApiAt && now - st.skipApiAt < SKIP_API_GAP) return false;
        if (typeof player.skipAd !== "function") return false;
        st.skipApiAt = now;
        st.skipApiCount++;
        st.skipApiCalled = true;
        try { player.skipAd(); } catch { /* ignore */ }
        return true;
    }

    let fastAdTimer = null;
    function startFastAdLoop() {
        if (fastAdTimer) return;
        fastAdTimer = setInterval(() => {
            const p = mainPlayer();
            // QC bumper / QC kiểu mới (chỉ có "ad-created") không có class ad-showing/ad-interrupting
            // → vẫn phải giữ vòng quét nhanh, nếu không QC chỉ được xử lý mỗi 300ms (chậm, dễ lọt).
            if (!p || (!hasAdClass(p) && !hasBumperAd(p) && !(hasAdCreatedClass(p) && hasVisibleAdUi(p)))) {
                clearInterval(fastAdTimer);
                fastAdTimer = null;
                if (p) processPlayer(p);
                return;
            }
            processPlayer(p);
        }, 35);
    }

    function stopFastAdLoop() {
        if (fastAdTimer) {
            clearInterval(fastAdTimer);
            fastAdTimer = null;
        }
    }

    // Bật/tắt class "fg-ad-active" trên <html> để CSS ẩn lớp phủ QC (người dùng không thấy QC).
    let fgAdActive = false;
    function setAdActive(on) {
        if (fgAdActive === on) return;
        fgAdActive = on;
        try {
            document.documentElement.classList.toggle("fg-ad-active", on);
        } catch { /* ignore */ }
    }

    function enterAd(player, st, video) {
        st.active = true;
        st.video = video;
        st.savedRate = userRate(player, video);
        st.weMuted = false;
        st.weRated = false;
        st.lastDur = 0;
        st.seekedEnd = false;
        st.seeked5 = false;
        st.adStartAt = Date.now();
        st.skipClickedAt = 0;
        st.skipApiCalled = false;
        st.skipApiAt = 0;
        st.skipApiCount = 0;
        if (video) {
            try { video.style.opacity = "0"; } catch { /* ignore */ }
        }
        setAdActive(true);
        startFastAdLoop();
        postCount("video");
        // Thử skip tức thì qua API player (nhanh nhất có thể) — nhưng chỉ 1 lần,
        // và vẫn giữ đường dự phòng (bấm nút + tua 16x + seek cuối).
        setTimeout(() => {
            try { trySkipApi(player, st); } catch { /* ignore */ }
        }, 120);
    }

    function exitAd(player, st) {
        st.active = false;
        st.lastDur = 0;
        st.seekedEnd = false;
        st.seeked5 = false;
        // Reset mốc "đã bấm nút Bỏ qua" — nếu không, fallbackActive sẽ bị bật sai
        // ở QC kế tiếp (và QC sau sẽ bị tua thẳng về cuối ngay lập tức).
        st.skipClickedAt = 0;
        st.skipApiCalled = false;
        st.skipApiAt = 0;
        st.skipApiCount = 0;
        stopFastAdLoop();
        const video = playerVideo(player) || st.video;
        if (video) {
            try { video.style.opacity = ""; } catch { /* ignore */ }
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
        setAdActive(false);
        // YouTube có thể nạp lại video chính sau vài trăm ms — kiểm tra lại lần nữa
        setTimeout(() => {
            watchdog(player);
            if (player.id === "movie_player") resumeMainPlayer();
        }, 400);
    }

    // Dispatch chuỗi sự kiện chuột & pointer đầy đủ — YouTube interstitial bỏ qua .click() đơn thuần.
    // CHỈ gửi MỘT sự kiện "click" trên phần tử trong cùng nhất: bấm nút con rồi gọi el.click() sẽ
    // kích hoạt handler 2-4 lần (do event nổi lên nút cha) → spam click & loạt trình duyệt.
    function fireClick(el) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
        try { el.dispatchEvent(new PointerEvent("pointerover", opts)); } catch { /* ignore */ }
        try { el.dispatchEvent(new MouseEvent("pointerover", opts)); } catch { /* ignore */ }
        try { el.dispatchEvent(new MouseEvent("mouseover", opts)); } catch { /* ignore */ }
        try { el.dispatchEvent(new PointerEvent("pointerdown", opts)); } catch { /* ignore */ }
        try { el.dispatchEvent(new MouseEvent("mousedown", opts)); } catch { /* ignore */ }
        try { el.dispatchEvent(new PointerEvent("pointerup", opts)); } catch { /* ignore */ }
        try { el.dispatchEvent(new MouseEvent("mouseup", opts)); } catch { /* ignore */ }
        try { el.dispatchEvent(new MouseEvent("click", opts)); } catch { /* ignore */ }
    }

    function isCtaOrLink(el) {
        if (!el || !el.closest) return false;
        return !!el.closest("a[href], .ytp-ad-button-vm, .ytp-ad-button-link, .ytp-ad-call-to-action, .ytp-ad-hover-text-button, .ytp-visit-advertiser-button, .ytp-visit-advertiser-link");
    }

    // Chống spam click nút "Bỏ qua":
    //  - Mỗi NÚT chỉ được bấm lại sau SKIP_RETRY_MS (1.2s) — nhanh hơn nhiều so với 3s cũ,
    //    để nút vừa render là ăn ngay, nhưng vẫn đủ để không spam làm treo trình duyệt.
    //  - Tổng số lần bấm trên cùng một nút có trần (SKIP_MAX_PER_BTN).
    const SKIP_RETRY_MS = 1200;
    const SKIP_MAX_PER_BTN = 8;

    // Thời gian chờ (tính từ lúc vào QC) trước khi tua 16x QC DÀI khi chưa thấy nút "Bỏ qua".
    // YouTube thường hiện nút "Bỏ qua" sau ~5s; nếu tua quá sớm thì QC vẫn chạy tới hết.
    const GRACE_MS = 1500;

    // Sau khi bấm nút "Bỏ qua", nếu QC vẫn còn (YouTube chưa chuyển sang video chính) thì
    // phải có phương án dự phòng: tua 16x + seek tới cuối. Nếu không, QC cứ chạy tới hết
    // (triệu chứng "phải đợi tới hết time quảng cáo mới tự mất").
    const SKIP_FALLBACK_MS = 1200;

    function triggerSkipButton(player, b, now, st) {
        const last = b.__fgClickAt || 0;
        const count = b.__fgClickCount || 0;
        if (now - last < SKIP_RETRY_MS) { fgSkipStats.throttled++; return false; }
        if (count >= SKIP_MAX_PER_BTN) { fgSkipStats.capped++; return false; }
        b.__fgClickAt = now;
        b.__fgClickCount = count + 1;
        fgSkipStats.fired++;
        // Ghi nhớ thời điểm bấm đầu tiên → nếu QC vẫn còn sau SKIP_FALLBACK_MS thì chuyển dự phòng
        if (st && !st.skipClickedAt) st.skipClickedAt = now;
        // Bọc trong nav guard: nếu nút "Bỏ qua" nằm trong <a> → chặn điều hướng ra trang quảng cáo
        withNavGuard(() => fireClick(b));
        // player.skipAd(): gọi lặp lại liên tục khiến player re-init liên tục → Chrome đứng.
        // Dùng bộ giới hạn tần suất (trySkipApi) thay vì cờ 1 lần.
        trySkipApi(player, st);
        return true;
    }

    // Tìm nút "Bỏ qua" theo CHỮ trong mọi vùng QC (kể cả khi class đã đổi hoàn toàn).
    // Chỉ nhận phần tử có kích thước thật + không phải CTA nhà quảng cáo.
    function findSkipByText(player) {
        const roots = player.querySelectorAll(AD_ZONE_ROOTS);
        for (let i = 0; i < roots.length; i++) {
            const candidates = roots[i].querySelectorAll("button, [role='button'], .ytp-ad-component--clickable, [class*='skip']");
            for (let j = 0; j < candidates.length; j++) {
                const b = candidates[j];
                if (isCtaOrLink(b) || !isVisibleEl(b)) continue;
                const label = (b.getAttribute("aria-label") || b.textContent || "").trim();
                if (label && SKIP_TEXT_RE.test(label)) return b;
            }
        }
        return null;
    }

    // Gom TẤT CẢ nút "Bỏ qua" ứng viên (đã loại CTA, đã loại nút ẩn).
    // Dùng chung cho cả "bấm" và "kiểm tra có nút" → tránh tình trạng 2 hàm thấy 2 nút khác nhau.
    function collectSkipButtons(player) {
        const out = [];
        const seen = new Set();
        const add = (raw) => {
            if (!raw || seen.has(raw)) return;
            if (isCtaOrLink(raw) || !isVisibleEl(raw)) return;
            const b = (raw.closest && raw.closest("button")) || raw;
            if (seen.has(b)) return;
            seen.add(b);
            seen.add(raw);
            out.push(b);
        };
        // Pass 1: selector chuẩn
        const btns = player.querySelectorAll(SKIP_STR);
        for (let i = 0; i < btns.length; i++) add(btns[i]);
        // Pass 2: tìm theo chữ "Bỏ qua / Skip" trong vùng QC
        const zone = player.querySelectorAll(AD_ZONE_BUTTONS);
        for (let i = 0; i < zone.length; i++) {
            const b = zone[i];
            if (isCtaOrLink(b) || !isVisibleEl(b)) continue;
            const label = (b.getAttribute("aria-label") || b.textContent || "").trim();
            if (label && SKIP_TEXT_RE.test(label)) add(b);
        }
        // Pass 3: quét MỌI vùng QC tìm nút theo chữ (class lạ) — bắt nút YouTube đặt ngoài .video-ads
        const byText = findSkipByText(player);
        if (byText) add(byText);
        return out;
    }

    function clickSkip(player, st) {
        const now = Date.now();
        const list = collectSkipButtons(player);
        for (let i = 0; i < list.length; i++) {
            if (triggerSkipButton(player, list[i], now, st)) return true;
        }
        return false;
    }

    function isBufferedAt(video, targetTime) {
        try {
            const buf = video.buffered;
            if (!buf || !buf.length) return false;
            for (let i = 0; i < buf.length; i++) {
                if (buf.start(i) <= video.currentTime + 0.5 && buf.end(i) >= targetTime) {
                    return true;
                }
            }
        } catch { /* ignore */ }
        return false;
    }

    // Tìm nút "Bỏ qua" ĐANG HIỂN THỊ trong vùng QC (không bấm) — dùng để biết
    // QC đã có nút bỏ qua hay chưa (quyết định có nên seek tới cuối hay không).
    // Dùng CHUNG collectSkipButtons với clickSkip → hai hàm luôn thấy cùng một nút.
    function findVisibleSkipButton(player) {
        const list = collectSkipButtons(player);
        return list.length ? list[0] : null;
    }

    function handleAd(player, st, video) {
        // Kiểm tra lại ngay trước khi tác động — tránh đụng video chính trong lúc chuyển tiếp
        if (!isConfirmedAd(player)) return;

        fgHandleStats.calls++;
        clickSkip(player, st);

        if (!video) return;
        if (video.style.opacity !== "0") {
            try { video.style.opacity = "0"; } catch { /* ignore */ }
        }
        if (fgSettings.muteAds && !video.muted) {
            video.muted = true;
            st.weMuted = true;
        }
        // ---- Quy tắc tua nhanh QC ----
        // Mục tiêu: bỏ QC NHANH NHẤT, không bao giờ phải đợi QC chạy tới hết.
        //   1) Luôn bấm nút "Bỏ qua" ngay khi xuất hiện (clickSkip ở trên).
        //   2) Luôn tua 16x — tua 16x KHÔNG làm mất nút "Bỏ qua",
        //      nên không có lý do phải giữ tốc độ 1x cho QC dài.
        //   3) Nếu đã bấm nút "Bỏ qua" nhưng QC vẫn còn → sau SKIP_FALLBACK_MS
        //      chuyển sang chế độ dự phòng: seek thẳng tới cuối QC.
        const dNow = video.duration;
        const isLongAd = isFinite(dNow) && dNow > 20;
        const skipBtn = findVisibleSkipButton(player);
        const skipBtnPresent = !!skipBtn;
        const adAge = Date.now() - (st.adStartAt || 0);
        // QC dài: chờ GRACE_MS để nút "Bỏ qua" có cơ hội xuất hiện (YouTube hiện sau ~5s).
        // QC ngắn: không cần chờ.
        const graceOver = !isLongAd || adAge >= GRACE_MS;

        // Đã bấm nút "Bỏ qua" từ trước nhưng QC vẫn còn → dự phòng seek cuối
        const skipFallbackOver = !!st.skipClickedAt && (Date.now() - st.skipClickedAt) >= SKIP_FALLBACK_MS;
        // Chế độ dự phòng: seek thẳng tới cuối QC (bỏ qua cả kiểm tra buffer)
        const forceSeekEnd = skipFallbackOver;

        if (fgSettings.fastSkip && graceOver && !video.ended && !player.classList.contains("ended-mode")) {
            if (video.playbackRate !== 16) {
                try { video.playbackRate = 16; st.weRated = true; fgHandleStats.rateSet++; } catch { /* ignore */ }
            }
            const d = video.duration;
            if (isFinite(d) && d > 0.5) {
                if (Math.abs(d - (st.lastDur || 0)) > 0.5) {
                    st.lastDur = d;
                    st.seekedEnd = false;
                    st.seeked5 = false;
                    st.seekRetryAt = 0;
                }
                // YouTube có thể RESET QC về đầu (currentTime = 0) sau khi ta tua.
                // Nếu vậy phải tua lại — nhưng chỉ sau một khoảng chờ để tránh vòng lặp tua liên tục.
                const now = Date.now();
                const nearStart = video.currentTime < 4.8;
                if (st.seekedEnd && nearStart && now - (st.seekRetryAt || 0) > 700) {
                    st.seekedEnd = false;   // cho phép tua lại tới cuối
                    st.seeked5 = false;
                    st.seekRetryAt = now;
                }
                // 1) Tìm nút "Bỏ qua" đang hiển thị → nếu có nút thì ưu tiên BẤM nút (YouTube tự xử lý).
                //    Nếu KHÔNG có nút (hoặc đã bấm mà không ăn → forceSeekEnd) → seek tới cuối QC.
                //    Seek KHÔNG cần buffer: Chrome tự tải phần còn lại (vài KB) — nhanh hơn nhiều
                //    so với việc phải đợi tua 16x chạy tới hết QC.
                const canSeekEnd = forceSeekEnd || !skipBtnPresent;
                if (!st.seekedEnd && canSeekEnd && video.currentTime < d - 0.3) {
                    st.seekedEnd = true;
                    fgHandleStats.seekEnd++;
                    try { video.currentTime = d - 0.15; } catch { /* ignore */ }
                } else if (!st.seeked5 && d > 15 && video.currentTime < 4.8 && isBufferedAt(video, 5.2)) {
                    // 2) Nếu QC dài (30s+) chưa buffer tới cuối nhưng đã buffer qua mốc 5s → nhảy thẳng tới 5.0s
                    // để mở khoá nút "Bỏ qua" ngay lập tức mà không làm treo bộ đệm ở cuối video
                    st.seeked5 = true;
                    fgHandleStats.seek5++;
                    try { video.currentTime = 5.0; } catch { /* ignore */ }
                }
            }
        }
        // Phát lại nếu video QC đang bị dừng và chưa kết thúc
        if (video.paused && !video.ended && !player.classList.contains("ended-mode")) {
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
        if (video.style.opacity === "0") {
            try { video.style.opacity = ""; } catch { /* ignore */ }
        }
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
                // UI QC tạm biến mất (chuyển giữa 2 QC trong 1 chuỗi, hoặc YouTube render lại):
                // chờ tối đa 700ms trước khi khôi phục — CHỈ khi vẫn còn dấu hiệu QC.
                // Mất hết dấu hiệu → khôi phục NGAY (không để video chính bị kẹt 16x).
                const stillAdHint = hasAdClass(player) || (hasAdCreatedClass(player) && hasVisibleAdUi(player));
                if (stillAdHint) {
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
            playerObservers.set(player, mo);
        } catch { /* ignore */ }
    }

    // Dọn player đã bị YouTube gỡ khỏi DOM.
    // RẤT QUAN TRỌNG về bộ nhớ: MutationObserver giữ tham chiếu MẠNH tới player
    // (qua closure). Nếu không disconnect, mỗi lần YouTube thay player (SPA) sẽ
    // giữ lại player cũ + toàn bộ cây con → rò rỉ bộ nhớ sau vài giờ xem.
    function releasePlayer(player) {
        const mo = playerObservers.get(player);
        if (mo) {
            try { mo.disconnect(); } catch { /* ignore */ }
            playerObservers.delete(player);
        }
        try { adUiObserver.unobserve(adUiZones.get(player) || player); } catch { /* ignore */ }
        adUiZones.delete(player);
        knownPlayers.delete(player);
    }

    // Theo dõi vùng UI QC để biết khi nút "Bỏ qua" XUẤT HIỆN → bấm ngay lập tức.
    // Quan sát thực tế: YouTube chèn nút "Bỏ qua" vào DOM sau khi QC đã chạy vài giây.
    // Không có observer này thì phải chờ tới lượt quét 300ms → thấy muộn.
    const adUiObserver = new MutationObserver((mutations) => {
        for (let i = 0; i < mutations.length; i++) {
            const added = mutations[i].addedNodes;
            for (let j = 0; j < added.length; j++) {
                const n = added[j];
                if (!n || n.nodeType !== 1) continue;
                const p = mainPlayer();
                if (!p) continue;
                // Có thêm node → có thể là nút "Bỏ qua" → xử lý ngay
                if (isConfirmedAd(p) || hasAdClass(p) || hasAdCreatedClass(p)) {
                    const st = getState(p);
                    if (!st.active) enterAd(p, st, playerVideo(p));
                    handleAd(p, st, playerVideo(p));
                }
                return;
            }
        }
    });

    function watchAdUi(player) {
        if (player.__fgAdUiWatched) return;
        player.__fgAdUiWatched = true;
        try {
            const zone = player.querySelector(".video-ads, .ytp-ad-module") || player;
            adUiObserver.observe(zone, { childList: true, subtree: true });
            adUiZones.set(player, zone);
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
        video.addEventListener("timeupdate", onMedia);
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
            watchAdUi(players[i]);
            processPlayer(players[i]);
        }
        for (const p of knownPlayers) {
            if (!p.isConnected) releasePlayer(p);
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
        // CẦU CHÌ: nếu vừa gỡ slot QC ở tầng mạng mà YouTube lỗi phát video
        // → ngắt lớp chặn mạng (vĩnh viễn cho phiên này) rồi tải lại video.
        // Đây là trường hợp hiếm (YouTube đôi khi cần adPlacements để dựng player),
        // nhưng nếu xảy ra thì phải tự phục hồi thay vì để user bị "văng" khỏi video.
        try {
            const net = window.__fgNet;
            if (net && typeof net.trip === "function" && !net.forced && net.stripped > 0 &&
                now - (net.lastStripAt || 0) < 30000) {
                net.trip();
            }
        } catch { /* ignore */ }
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

    // ---------- NAV GUARD: chặn điều hướng ra trang nhà quảng cáo ----------
    // Khi bấm nút "Bỏ qua" trong layout interstitial, nút đôi khi nằm trong <a href="trang QC">.
    // Bấm vào → trình duyệt NHẢY sang trang quảng cáo → người dùng bị đưa ra ngoài YouTube.
    // Dùng Navigation API để chặn điều hướng trong đúng khoảnh khắc bấm nút skip.
    let navBlockedCount = 0;
    let navGuardDepth = 0;

    function navGuardActive() { return navGuardDepth > 0; }

    function onNavigate(e) {
        if (!navGuardActive()) return;
        // Chỉ chặn điều hướng ra ngoài (khác origin hiện tại) — điều hướng nội bộ vẫn hợp lệ
        let dest = null;
        try { dest = e.destination && e.destination.url; } catch { /* ignore */ }
        if (!dest) return;
        try {
            const destUrl = new URL(dest, location.href);
            if (destUrl.origin === location.origin) return;
            e.preventDefault();
            navBlockedCount++;
        } catch { /* ignore */ }
    }

    try {
        if (window.navigation && typeof window.navigation.addEventListener === "function") {
            window.navigation.addEventListener("navigate", onNavigate);
        }
    } catch { /* trình duyệt cũ không có Navigation API */ }

    // Dự phòng cho trình duyệt không có Navigation API: chặn click <a> ra ngoài trong khi guard bật
    document.addEventListener("click", (e) => {
        if (!navGuardActive()) return;
        const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (!a) return;
        try {
            const href = a.getAttribute("href") || "";
            if (!/^https?:\/\//i.test(href)) return;
            const destUrl = new URL(href, location.href);
            if (destUrl.origin === location.origin) return;
            e.preventDefault();
            e.stopPropagation();
            navBlockedCount++;
        } catch { /* ignore */ }
    }, true);

    function withNavGuard(fn) {
        navGuardDepth++;
        try { return fn(); } finally { navGuardDepth--; }
    }
    function getNavBlocked() { return navBlockedCount; }

    // Cho bộ test truy cập hàm thuần (không ảnh hưởng hoạt động)
    if (window.__FG_TEST__) {
        window.__FG_TEST__.main = { pickJumpTarget, extractHeatMarkers, heatFromDom };
        window.__FG_TEST__.main.getNavBlocked = getNavBlocked;
        window.__FG_TEST__.main.withNavGuard = withNavGuard;
        window.__FG_TEST__.main.trySkipApi = trySkipApi;
        // Số player đang được theo dõi + số observer còn sống.
        // Dùng để test rò rỉ bộ nhớ: sau khi player bị gỡ khỏi DOM, cả 2 số
        // phải về 0 (nếu không, MutationObserver giữ player cũ trong bộ nhớ).
        window.__FG_TEST__.main.getTracked = () => ({
            players: knownPlayers.size,
            observers: playerObservers.size,
            zones: adUiZones.size,
        });
        window.__FG_TEST__.main.releasePlayer = releasePlayer;
        window.__FG_TEST__.main.scanPlayers = scanPlayers;
    }

    // ---------- Báo lỗi quảng cáo: chụp nhanh trạng thái trình phát (không gửi đi đâu, chỉ chép vào clipboard) ----------
    function describeEl(e) {
        return e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.classList.length ? "." + [...e.classList].join(".") : "");
    }

    function collectDiagnostics() {
        const p = mainPlayer();
        const v = playerVideo(p);
        const visible = (e) => e.offsetWidth > 0 || e.offsetHeight > 0;
        const adParts = p ? [...new Set([...p.querySelectorAll("[class*='ad'],[class*='sponsor']")]
            .filter(visible).map(describeEl))].slice(0, 40) : [];
        const skipButtons = p ? [...p.querySelectorAll("button,[role='button']")]
            .filter((b) => visible(b) && /bỏ qua|bo qua|skip/i.test((b.textContent || "") + " " + (b.getAttribute("aria-label") || "")))
            .map((b) => b.outerHTML.slice(0, 300)).slice(0, 5) : [];
        const pagePanels = [...document.querySelectorAll("#below *, #secondary *, #panels *")]
            .filter((e) => /(^|-)ads?(-|$)|sponsor|promoted|companion/i.test(e.tagName) && visible(e))
            .map(describeEl).slice(0, 20);
        const st = p ? getState(p) : { skipClickedAt: 0 };
        return {
            path: location.pathname + location.search.slice(0, 40),
            playerClass: p ? p.className : null,
            adShowing: hasAdClass(p),
            confirmedAd: p ? isConfirmedAd(p) : false,
            video: v ? { duration: v.duration, time: v.currentTime, rate: v.playbackRate, muted: v.muted, paused: v.paused } : null,
            adParts,
            skipButtons,
            pagePanels: [...new Set(pagePanels)],
            settings: fgSettings,
            whitelisted: isWhitelistedChannel,
            licensed: allowLicense,
            // Chẩn đoán skip: giúp theo dõi hành vi bỏ QC trên trang YouTube thật
            ad: {
                ytAdState: ytAdState(p),
                ytPlayerState: ytPlayerState(p),
                reallyPlaying: isAdReallyPlaying(p),
                adClass: hasAdClass(p),
                adCreated: hasAdCreatedClass(p),
                adBranding: hasAdBranding(p),
                visibleAdUi: hasVisibleAdUi(p),
                skipBtnPresent: !!findVisibleSkipButton(p),
                skipCandidates: p ? collectSkipButtons(p).length : 0,
                skipClickedAt: st.skipClickedAt || 0,
                fallbackActive: !!(st.skipClickedAt && Date.now() - st.skipClickedAt >= SKIP_FALLBACK_MS),
                skipApiCount: st.skipApiCount || 0,
            },
            skipStats: { ...fgSkipStats },
            handleStats: { ...fgHandleStats },
            net: (() => {
                try {
                    const net = window.__fgNet;
                    if (!net) return null;
                    return { stripped: net.stripped, forced: !!net.forced, ready: !!net.ready, lastStripAt: net.lastStripAt || 0 };
                } catch { return null; }
            })(),
        };
    }

    // ---------- Giao tiếp với content script ----------
    function applyConfig(msg) {
        if (msg.settings && typeof msg.settings === "object") fgSettings = { ...fgSettings, ...msg.settings };
        if (typeof msg.whitelisted === "boolean") isWhitelistedChannel = msg.whitelisted;
        if (msg.remote) applyRemote(msg.remote);
        scanPlayers();
        // Vòng quét có thể đã chuyển sang chậm (tab ẩn / vừa tắt extension) →
        // đồng bộ lại ngay thay vì chờ tick kế tiếp.
        if (typeof refreshLoopRate === "function") refreshLoopRate();
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
            const wasEnabled = allowLicense;
            allowLicense = !!msg.ok;
            try { sessionStorage.setItem("__fg_lic", allowLicense ? "1" : "0"); } catch { /* ignore */ }
            applyConfig(msg);
            // Vừa bị tắt bảo vệ → dọn ngay các hiệu ứng (ánh sáng nền, class QC,
            // nút phụ) thay vì chờ vòng quét kế tiếp (có thể tới 1.5s nếu tab ẩn).
            if (wasEnabled && !allowLicense) {
                teardownAmbient();
                setAdActive(false);
                stopFastAdLoop();
                ensurePipButton();
                ensureJumpButton();
            }
            return;
        }
        if (msg.type === "FG_RESUME_PLAY") return;
        if (msg.token !== FG_TOKEN) return;

        if (msg.type === "FG_CONFIG") { applyConfig(msg); return; }
        if (msg.type === "FG_SB") { receiveSponsorSegments(msg); return; }
        if (msg.type === "FG_DIAG_REQ") {
            window.postMessage({ type: "FG_DIAG_RES", token: FG_TOKEN, id: msg.id, data: collectDiagnostics() }, "*");
            return;
        }
        if (!allowLicense || isWhitelistedChannel) return;

        if (msg.type === "FG_DISMISS") dismissDialogs();
        else if (msg.type === "FG_ANTI_ADBLOCK" && fgSettings.blockAntiAdblock) {
            confirmContinueWatching();
            removeAntiAdblock();
        }
    });

    // ---------- Vòng lặp ----------
    // Vòng quét chính. Khi tab ẩn hoặc extension không hoạt động → giảm tần suất
    // (1.5s thay vì 300ms) để không đốt CPU khi người dùng xem video ở tab khác.
    // Khi tab nhìn thấy lại → quay về 300ms ngay lập tức (không chờ tick kế tiếp).
    let mainLoopTimer = null;
    let mainLoopFast = true;
    const LOOP_FAST_MS = 300;
    const LOOP_SLOW_MS = 1500;

    function loopInterval() {
        // Tab ẩn → chậm. Extension không hoạt động → chậm. Còn lại → nhanh.
        if (!allowLicense || isWhitelistedChannel) return LOOP_SLOW_MS;
        if (realVisibility() !== "visible") return LOOP_SLOW_MS;
        return LOOP_FAST_MS;
    }

    function scheduleLoop() {
        if (mainLoopTimer) clearInterval(mainLoopTimer);
        mainLoopFast = loopInterval() === LOOP_FAST_MS;
        mainLoopTimer = setInterval(runMainLoop, mainLoopFast ? LOOP_FAST_MS : LOOP_SLOW_MS);
    }

    // Đồng bộ lại tần suất quét mà không cần chờ tick kế tiếp.
    function refreshLoopRate() {
        const wantFast = loopInterval() === LOOP_FAST_MS;
        if (wantFast !== mainLoopFast) scheduleLoop();
    }

    function runMainLoop() {
        scanPlayers();
        ensurePipButton();
        ensureJumpButton();
        ensureAmbient();
        applyQuality(mainPlayer());
        maybeRequestSponsor();
        if (allowLicense && !isWhitelistedChannel) recoverFromPlaybackError();
        // Tự điều chỉnh tần suất theo trạng thái hiện tại (tab vừa ẩn/hiện).
        refreshLoopRate();
    }

    scheduleLoop();
    onRealVisibilityChange(() => scheduleLoop());

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
