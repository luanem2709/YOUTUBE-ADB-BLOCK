let isEnabled = false;
let msgToken = null;
let adsBlockedCount = 0;
let debounceTimer = null;
let whitelistChannels = [];
let cachedWhitelisted = false;
let lastWhitelistCheckAt = 0;
let lastWhitelistUrl = "";
let ytLoggedIn = null;
let currentUserKey = "";
let currentUser = { id: "guest", name: "Khách", avatar: "" };
let userDetectTimer = null;
const DEBOUNCE_DELAY = 80;
const hiddenElements = new WeakSet();

let cachedPlayer = null;
let cachedVideo = null;

function getPlayer() {
    if (cachedPlayer && cachedPlayer.isConnected) return cachedPlayer;
    cachedPlayer = document.getElementById("movie_player");
    return cachedPlayer;
}

function getVideo() {
    if (cachedVideo && cachedVideo.isConnected) return cachedVideo;
    const player = getPlayer();
    cachedVideo = (player && player.querySelector("video.html5-main-video")) ||
        document.querySelector("#movie_player video.html5-main-video, video.html5-main-video");
    return cachedVideo;
}

const DEFAULT_SETTINGS = {
    blockVideo: true,
    blockBanner: true,
    blockOverlay: true,
    blockAntiAdblock: true,
    muteAds: true,
    fastSkip: true,
    backgroundPlay: true,
    pipButton: true,
    hideUpsell: true,
    videoQuality: "auto",
    sponsorBlock: true,
    jumpAhead: true,
    ambientGlow: true,
    customLogo: true,
};

function applyPageClasses() {
    const root = document.documentElement;
    if (!root) return;
    const want = isEnabled && settings.hideUpsell !== false;
    if (root.classList.contains("fg-hide-upsell") !== want) {
        root.classList.toggle("fg-hide-upsell", want);
    }
    const logo = isEnabled && settings.customLogo !== false;
    if (root.classList.contains("fg-logo-on") !== logo) {
        root.classList.toggle("fg-logo-on", logo);
    }
}

const LICENSE_KEYS = ["licenseKey", "licenseToken", "licenseSig"];

// Xác thực chữ ký số của key (license.js được nạp trước file này)
async function licenseAllows(result) {
    try {
        return (await FunnyLicense.verifyStored(result)).ok;
    } catch {
        return false;
    }
}

let settings = { ...DEFAULT_SETTINGS };

function syncConfigToMain() {
    applyPageClasses();
    const whitelisted = isWhitelisted();
    lastSentWhitelisted = whitelisted;
    window.postMessage({
        type: "FG_LICENSE",
        ok: isEnabled,
        settings,
        whitelisted,
        remote: remoteYt,
    }, "*");
    if (msgToken) {
        postToMain("FG_CONFIG", { settings, whitelisted, remote: remoteYt });
    }
}

function applyEnabled(enabledFlag, licensed) {
    isEnabled = !!enabledFlag && !!licensed;
    syncConfigToMain();
    if (isEnabled) {
        startWhenReady();
        startAdTick();
        window.postMessage({ type: "FG_RESUME_PLAY" }, "*");
    } else {
        if (typeof stopObserver === "function") stopObserver();
        stopAdTick();
    }
}

const OVERLAY_SELECTORS = [
    ".ytp-ad-overlay-container",
    ".ytp-ad-text-overlay",
    ".ytp-ad-image-overlay",
];
const OVERLAY_SELECTOR_STR = OVERLAY_SELECTORS.join(",");

const BANNER_SELECTORS = [
    "#player-ads",
    "ytd-companion-slot-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-display-ad-renderer",
    "ytd-ad-slot-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "#masthead-ad",
    "ytd-banner-promo-renderer",
    "ytd-reel-video-renderer ytd-ad-slot-renderer",
    "ytm-companion-ad-slot-renderer",
    "ytm-promoted-sparkles-text-search-renderer",
    "ytm-banner-promo-renderer",
    "ytm-display-ad-renderer",
    "ytm-ad-slot-renderer",
    "ytm-in-feed-ad-layout-renderer",
    "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-ads']",
    "ytd-ads-engagement-panel-content-renderer",
    "ytd-action-companion-ad-renderer",
    "ytd-player-legacy-desktop-watch-ads-renderer",
    "panel-ad-header-image-lockup-view-model",
    "ad-grid-card-collection-view-model",
    "ytd-video-masthead-ad-v3-renderer",
    "ytd-search-pyv-renderer",
    "ytd-promoted-video-renderer",
    "#below #player-ads",
    "#panels ytd-ads-engagement-panel-content-renderer",
];
let BANNER_SELECTOR_STR = BANNER_SELECTORS.join(",");

// ---------- Cấu hình từ xa (selector mới tải từ GitHub, không cần phát hành bản mới) ----------
let remoteYt = null;

function cleanSelectors(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const raw of list.slice(0, 100)) {
        const sel = String(raw || "").trim();
        if (!sel || sel.length > 200 || /[{}<>]/.test(sel)) continue;
        try { document.createDocumentFragment().querySelector(sel); } catch { continue; }
        out.push(sel);
    }
    return out;
}

// Tinh chỉnh tốc độ vượt QC (số học, giới hạn an toàn) — cho phép chỉnh mà không cần phát hành bản mới
function cleanAdSpeed(sp) {
    if (!sp || typeof sp !== "object") return null;
    const n = (x, lo, hi, dflt) => {
        const v = Number(x);
        return isFinite(v) && v >= lo && v <= hi ? v : dflt;
    };
    return {
        skipWaitMs: n(sp.skipWaitMs, 0, 15000, 1500),
        waitRate: n(sp.waitRate, 1, 16, 4),
        fastAdMaxDuration: n(sp.fastAdMaxDuration, 1, 600, 20),
    };
}

function applyRemoteConfig(cfg) {
    const yt = cfg && typeof cfg === "object" && cfg.yt && typeof cfg.yt === "object" ? cfg.yt : {};
    const banners = cleanSelectors(yt.banners);
    BANNER_SELECTOR_STR = BANNER_SELECTORS.concat(banners.filter((b) => !BANNER_SELECTORS.includes(b))).join(",");
    remoteYt = {
        adSignals: cleanSelectors(yt.adSignals),
        skipButtons: cleanSelectors(yt.skipButtons),
        antiAdblock: cleanSelectors(yt.antiAdblock),
        adSpeed: cleanAdSpeed(yt.adSpeed),
    };
}

const DISMISS_CHECK_STR =
    "button.ytp-ad-overlay-close-button, .ytp-ad-feedback-dialog-close-button, .ytp-ad-survey-player-overlay-close-button, .ytp-ad-action-interstitial-close-button";

const ANTI_ADBLOCK_CHECK_STR =
    "ytd-enforcement-message-view-model, .ytd-enforcement-message-view-model, bka-enforcement-message-view-model, yt-confirm-dialog-renderer";

function postToMain(type, extra = {}) {
    if (!msgToken) return;
    window.postMessage({ type, token: msgToken, ...extra }, "*");
}

function initialize() {
    chrome.storage.local.get(
        ["enabled", "adsBlocked", "settings", "whitelistChannels", "remoteConfig", ...LICENSE_KEYS],
        async (result) => {
            adsBlockedCount = result.adsBlocked || 0;
            settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
            whitelistChannels = result.whitelistChannels || [];
            lastWhitelistCheckAt = 0;
            applyRemoteConfig(result.remoteConfig);
            const on = result.enabled !== undefined ? result.enabled : true;
            applyEnabled(on, await licenseAllows(result));
        }
    );

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;

        if (changes.adsBlocked) {
            adsBlockedCount = changes.adsBlocked.newValue || 0;
        }
        if (changes.enabled || changes.licenseToken || changes.licenseSig || changes.licenseKey) {
            chrome.storage.local.get(["enabled", ...LICENSE_KEYS], async (r) => {
                applyEnabled(r.enabled !== false, await licenseAllows(r));
            });
        }
        if (changes.remoteConfig) {
            applyRemoteConfig(changes.remoteConfig.newValue);
            syncConfigToMain();
        }
        if (changes.settings) {
            settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
            syncConfigToMain();
            if (isEnabled) handleAds(true);
        }
        if (changes.whitelistChannels) {
            whitelistChannels = changes.whitelistChannels.newValue || [];
            lastWhitelistCheckAt = 0;
            syncConfigToMain();
        }
    });

    window.addEventListener("message", (event) => {
        if (event.source !== window) return;

        if (event.data?.type === "FG_TOKEN_READY") {
            msgToken = event.data.token;
            syncConfigToMain();
            if (isEnabled) handleAds(true);
            return;
        }

        if (event.data?.type === "FG_COUNT" && event.data.token === msgToken) {
            incrementBlockCount(event.data.category || "video");
        }

        // SponsorBlock: MAIN world xin danh sách đoạn tài trợ → background tải (tránh CSP của YouTube)
        if (event.data?.type === "FG_SB_REQ" && event.data.token === msgToken && isEnabled) {
            const videoId = String(event.data.videoId || "");
            if (!/^[\w-]{6,20}$/.test(videoId)) return;
            try {
                chrome.runtime.sendMessage({ type: "FG_SB_SEGMENTS", videoId }, (res) => {
                    if (chrome.runtime.lastError) return;
                    postToMain("FG_SB", { videoId, segments: (res && res.segments) || [] });
                });
            } catch { /* extension vừa cập nhật */ }
            return;
        }

        if (event.data?.type === "FG_IDENTITY" && event.data.token === msgToken) {
            ytLoggedIn = !!event.data.loggedIn;
            if (event.data.userKey) currentUserKey = String(event.data.userKey).slice(0, 48);
            detectAndStoreUser();
        }
    });

    try {
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg?.type === "FG_RESUME") {
                window.postMessage({ type: "FG_RESUME_PLAY" }, "*");
                return false;
            }
            if (msg?.type === "FG_DIAG") {
                requestDiagnostics().then(sendResponse);
                return true;
            }
            return false;
        });
    } catch { /* ignore */ }

    document.addEventListener("yt-navigate-finish", () => {
        cachedPlayer = null;
        cachedVideo = null;
        lastWhitelistCheckAt = 0;
        syncConfigToMain();
        detectAndStoreUser();
        if (isEnabled) handleAds(true);
    });

    detectAndStoreUser();
    window.postMessage({ type: "FG_TOKEN_REQUEST" }, "*");
    setTimeout(() => window.postMessage({ type: "FG_TOKEN_REQUEST" }, "*"), 300);
}

function requestDiagnostics() {
    return new Promise((resolve) => {
        const id = Math.random().toString(36).slice(2);
        const base = {
            version: chrome.runtime.getManifest().version,
            url: location.href.slice(0, 120),
            time: new Date().toISOString(),
            enabled: isEnabled,
            hiddenBanners: document.querySelectorAll(BANNER_SELECTOR_STR).length,
        };
        const timer = setTimeout(() => {
            window.removeEventListener("message", onRes);
            resolve({ ...base, main: "không phản hồi (thử tải lại trang)" });
        }, 1500);
        function onRes(e) {
            if (e.source !== window || !e.data || e.data.type !== "FG_DIAG_RES" || e.data.token !== msgToken || e.data.id !== id) return;
            clearTimeout(timer);
            window.removeEventListener("message", onRes);
            resolve({ ...base, ...e.data.data });
        }
        window.addEventListener("message", onRes);
        postToMain("FG_DIAG_REQ", { id });
    });
}

function startWhenReady() {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => handleAds(true), { once: true });
    } else {
        handleAds(true);
    }
}

function getChannelId() {
    const link = document.querySelector(
        "ytd-watch-metadata #owner #channel-name a, ytd-video-owner-renderer a.yt-simple-endpoint, ytm-owner a"
    );
    if (!link?.href) return null;

    const match = link.href.match(/\/(channel\/(UC[\w-]+)|@([\w.-]+))/);
    if (match) return match[2] || match[3];
    return null;
}

function isWhitelisted() {
    if (!whitelistChannels.length) return false;
    const now = Date.now();
    const curUrl = location.href;
    if (curUrl === lastWhitelistUrl && now - lastWhitelistCheckAt < 2500) {
        return cachedWhitelisted;
    }
    lastWhitelistUrl = curUrl;
    lastWhitelistCheckAt = now;

    const channelId = getChannelId();
    if (!channelId) {
        cachedWhitelisted = false;
        return false;
    }
    cachedWhitelisted = whitelistChannels.some((entry) => {
        let normalized = String(entry || "").trim();
        const m = normalized.match(/\/(?:channel\/(UC[\w-]+)|@([\w.-]+))/);
        if (m) normalized = m[1] || m[2];
        normalized = normalized.replace(/^@/, "");
        // So khớp chính xác (không phân biệt hoa thường) — tránh 1 ký tự "a" whitelist toàn bộ kênh
        return normalized && channelId.toLowerCase() === normalized.toLowerCase();
    });
    return cachedWhitelisted;
}

let lastSentWhitelisted = null;

// Tên kênh render chậm sau khi chuyển trang → báo lại MAIN world khi trạng thái whitelist thay đổi
function syncWhitelistIfChanged() {
    const w = isWhitelisted();
    if (w !== lastSentWhitelisted) {
        lastSentWhitelisted = w;
        syncConfigToMain();
    }
}

let adTick = null;

function startAdTick() {
    if (adTick) return;
    adTick = setInterval(() => {
        if (!isEnabled) return;
        applyPageClasses();
        syncWhitelistIfChanged();
        handleAds(false);
    }, 450);
}

function stopAdTick() {
    if (!adTick) return;
    clearInterval(adTick);
    adTick = null;
}

function stopObserver() {
    clearTimeout(debounceTimer);
}

let lastBannerScanAt = 0;

function handleAds(forceFullScan) {
    if (!isEnabled || isWhitelisted()) return;

    try {
        if (settings.blockAntiAdblock && document.querySelector(ANTI_ADBLOCK_CHECK_STR)) {
            postToMain("FG_ANTI_ADBLOCK");
        }
        // Quảng cáo video do content-main.js (MAIN world) xử lý duy nhất — tránh 2 nơi cùng tua/mute gây xung đột
        if (settings.blockOverlay) {
            hideOverlayAds();
            const root = getPlayer() || document;
            if (root.querySelector(DISMISS_CHECK_STR)) {
                postToMain("FG_DISMISS");
            }
        }
        if (settings.blockBanner && document.visibilityState !== "hidden") {
            const now = Date.now();
            if (forceFullScan || now - lastBannerScanAt >= 1200) {
                lastBannerScanAt = now;
                hideCompanionAds();
            }
        }
    } catch (error) {
        console.debug("[FUNNYGAME] Lỗi:", error.message);
    }
}

function hideElements(selectorStr, category, rootNode = document) {
    const nodes = rootNode.querySelectorAll(selectorStr);
    for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (hiddenElements.has(el)) continue;
        hiddenElements.add(el);
        // Chỉ ẩn, không remove node thuộc player (remove có thể làm player YouTube lỗi)
        el.style.setProperty("display", "none", "important");
        incrementBlockCount(category);
    }
}

function hideOverlayAds() {
    hideElements(OVERLAY_SELECTOR_STR, "overlay", getPlayer() || document);
}

function hideCompanionAds() {
    hideElements(BANNER_SELECTOR_STR, "banner", document);
}

let persistTimer = null;
let pendingBreakdown = null;
let sessionPersistTimer = null;
let pendingSessionAds = 0;

function todayKey() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function safeAvatar(src) {
    if (!src) return "";
    try {
        const url = new URL(src);
        const host = url.hostname;
        const allowed = host.endsWith(".ggpht.com") || host.endsWith(".googleusercontent.com") || host.endsWith(".ytimg.com");
        if (url.protocol !== "https:" || !allowed) return "";
        return url.href;
    } catch {
        return "";
    }
}

function userIdFromAvatar(src) {
    try {
        const url = new URL(src);
        const key = url.pathname.replace(/^\//, "").split("=")[0].slice(-28);
        return key ? "yt_" + key : "yt_user";
    } catch {
        return "yt_user";
    }
}

function detectYoutubeUser() {
    const avatarImg = document.querySelector(
        "#avatar-btn img, ytd-masthead #avatar img, ytm-mobile-topbar-renderer img.mobile-topbar-header-avatar"
    );
    const signedIn = ytLoggedIn === true || !!avatarImg;

    if (!signedIn) {
        return { id: "guest", name: "Khách", avatar: "" };
    }

    const src = safeAvatar(avatarImg?.src || "");
    const accountName = (
        document.querySelector("ytd-active-account-header-renderer #account-name")?.textContent ||
        document.querySelector("#channel-handle")?.textContent ||
        ""
    ).trim();
    const aria = document.querySelector("#avatar-btn")?.getAttribute("aria-label") || "";
    let name = accountName;
    if (!name && aria && !/account menu|menu tài khoản|tài khoản/i.test(aria)) {
        name = aria.replace(/^Account:\s*/i, "").trim();
    }

    const id = currentUserKey
        ? "yt_" + currentUserKey.replace(/[^\w-]/g, "").slice(0, 32)
        : (src ? userIdFromAvatar(src) : "yt_user");

    return {
        id: id || "yt_user",
        name: name || "Người dùng YouTube",
        avatar: src,
    };
}

function makeUserRecord(info) {
    return {
        id: info.id,
        name: info.name,
        avatar: info.avatar || "",
        adsBlocked: 0,
        lastActive: Date.now(),
        firstSeen: Date.now(),
        days: [todayKey()],
    };
}

function detectAndStoreUser() {
    const info = detectYoutubeUser();
    const changed = info.id !== currentUser.id || info.name !== currentUser.name || info.avatar !== currentUser.avatar;
    currentUser = info;
    if (!changed) return;

    clearTimeout(userDetectTimer);
    userDetectTimer = setTimeout(() => {
        chrome.storage.local.get(["userStats"], (result) => {
            const userStats = result.userStats || { currentId: "guest", users: {} };
            userStats.currentId = info.id;
            if (!userStats.users[info.id]) {
                userStats.users[info.id] = makeUserRecord(info);
            } else {
                if (info.name && info.name !== "Người dùng YouTube") {
                    userStats.users[info.id].name = info.name;
                }
                if (info.avatar) userStats.users[info.id].avatar = info.avatar;
            }
            chrome.storage.local.set({ userStats });
        });
    }, 400);
}

function flushStats() {
    const delta = pendingBreakdown || { video: 0, banner: 0, overlay: 0, antiAdblock: 0 };
    pendingBreakdown = null;
    const totalDelta = Object.values(delta).reduce((a, b) => a + b, 0);
    if (!totalDelta) return;

    chrome.storage.local.get(["adsBlocked", "statsBreakdown", "statsHistory", "userStats"], (result) => {
        const breakdown = {
            video: 0,
            banner: 0,
            overlay: 0,
            antiAdblock: 0,
            spotify: 0,
            ...(result.statsBreakdown || {}),
        };
        for (const [key, val] of Object.entries(delta)) {
            if (breakdown[key] !== undefined) breakdown[key] += val;
        }

        const history = [...(result.statsHistory || [])];
        const key = todayKey();
        const entry = history.find((h) => h.date === key);
        if (entry) entry.count += totalDelta;
        else history.push({ date: key, count: totalDelta });

        const userStats = result.userStats || { currentId: currentUser.id, users: {} };
        const uid = userStats.currentId || currentUser.id || "guest";
        if (!userStats.users[uid]) {
            userStats.users[uid] = makeUserRecord({ ...currentUser, id: uid });
        }
        const user = userStats.users[uid];
        user.adsBlocked = (user.adsBlocked || 0) + totalDelta;
        user.lastActive = Date.now();
        if (!Array.isArray(user.days)) user.days = [];
        if (!user.days.includes(key)) user.days.push(key);
        user.days = user.days.slice(-365);

        const nextTotal = (result.adsBlocked || 0) + totalDelta;
        adsBlockedCount = nextTotal;

        chrome.storage.local.set({
            adsBlocked: nextTotal,
            statsBreakdown: breakdown,
            statsHistory: history.slice(-7),
            userStats,
        });
    });
}

function incrementBlockCount(category) {
    adsBlockedCount++;

    if (!pendingBreakdown) {
        pendingBreakdown = { video: 0, banner: 0, overlay: 0, antiAdblock: 0 };
    }
    if (pendingBreakdown[category] !== undefined) {
        pendingBreakdown[category]++;
    }

    clearTimeout(persistTimer);
    persistTimer = setTimeout(flushStats, 1500);

    // Đếm trong bộ nhớ rồi ghi 1 lần (đọc-ghi storage cho MỖI element bị ẩn gây nghẽn I/O
    // khi quảng cáo render nhiều node → Chrome đứng).
    pendingSessionAds = (pendingSessionAds || 0) + 1;
    clearTimeout(sessionPersistTimer);
    sessionPersistTimer = setTimeout(() => {
        const n = pendingSessionAds;
        pendingSessionAds = 0;
        try {
            if (chrome.storage.session) {
                chrome.storage.session.get(["sessionAds"], (result) => {
                    if (chrome.runtime.lastError) return;
                    chrome.storage.session.set({ sessionAds: ((result && result.sessionAds) || 0) + n });
                });
            }
        } catch { /* session storage chưa được cấp quyền */ }
    }, 1500);
}

initialize();
