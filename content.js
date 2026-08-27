let isEnabled = false;
let msgToken = null;
let adsBlockedCount = 0;
let debounceTimer = null;
let whitelistChannels = [];
let ytLoggedIn = null;
let currentUserKey = "";
let currentUser = { id: "guest", name: "Khách", avatar: "" };
let userDetectTimer = null;
const DEBOUNCE_DELAY = 50;
const hiddenElements = new WeakSet();

const DEFAULT_SETTINGS = {
    blockVideo: true,
    blockBanner: true,
    blockOverlay: true,
    blockAntiAdblock: true,
    muteAds: true,
    fastSkip: true,
};

function licenseAllows(result) {
    if (result.licenseValid !== true) return false;
    const raw = result.licenseExpires;
    if (!raw) return false;
    const text = String(raw).trim();
    let day = null;
    let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    else {
        m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
        if (m) day = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    }
    if (!day || Number.isNaN(day.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return day >= today;
}

let settings = { ...DEFAULT_SETTINGS };

function applyEnabled(enabledFlag, licensed) {
    isEnabled = !!enabledFlag && !!licensed;
    window.postMessage({ type: "FG_LICENSE", ok: isEnabled }, "*");
    if (isEnabled) startWhenReady();
    else if (typeof stopObserver === "function") stopObserver();
}

const SKIP_SELECTORS = [
    "button.ytp-ad-skip-button-modern.ytp-button",
    ".ytp-ad-skip-button-slot button",
    ".ytp-ad-skip-button-container button",
    ".ytp-ad-skip-button-container",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-modern",
    ".ytp-skip-ad-button",
];

const OVERLAY_SELECTORS = [
    ".ytp-ad-overlay-container",
    ".ytp-ad-text-overlay",
    ".ytp-ad-image-overlay",
];

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
];

function postToMain(type, extra = {}) {
    if (!msgToken) return;
    window.postMessage({ type, token: msgToken, ...extra }, "*");
}

function initialize() {
    chrome.storage.local.get(
        ["enabled", "adsBlocked", "settings", "whitelistChannels", "licenseValid", "licenseExpires"],
        (result) => {
            adsBlockedCount = result.adsBlocked || 0;
            settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
            whitelistChannels = result.whitelistChannels || [];
            const on = result.enabled !== undefined ? result.enabled : true;
            applyEnabled(on, licenseAllows(result));
        }
    );

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;

        if (changes.enabled || changes.licenseValid || changes.licenseExpires) {
            chrome.storage.local.get(["enabled", "licenseValid", "licenseExpires"], (r) => {
                const on = changes.enabled ? changes.enabled.newValue : (r.enabled !== false);
                applyEnabled(on, licenseAllows(r));
            });
        }
        if (changes.settings) {
            settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
            if (isEnabled) handleAds();
        }
        if (changes.whitelistChannels) {
            whitelistChannels = changes.whitelistChannels.newValue || [];
        }
    });

    window.addEventListener("message", (event) => {
        if (event.source !== window) return;

        if (event.data?.type === "FG_TOKEN_READY") {
            msgToken = event.data.token;
            if (isEnabled) handleAds();
            return;
        }

        if (event.data?.type === "FG_COUNT" && event.data.token === msgToken) {
            incrementBlockCount(event.data.category || "video");
        }

        if (event.data?.type === "FG_IDENTITY" && event.data.token === msgToken) {
            ytLoggedIn = !!event.data.loggedIn;
            if (event.data.userKey) currentUserKey = String(event.data.userKey).slice(0, 48);
            detectAndStoreUser();
        }
    });

    document.addEventListener("yt-navigate-finish", () => {
        detectAndStoreUser();
        if (isEnabled) handleAds();
    });

    detectAndStoreUser();
    setInterval(detectAndStoreUser, 10000);
}

function startWhenReady() {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            startObserver();
            handleAds();
        }, { once: true });
    } else {
        startObserver();
        handleAds();
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
    const channelId = getChannelId();
    if (!channelId) return false;
    return whitelistChannels.some((entry) => {
        const normalized = entry.trim().replace(/^@/, "");
        return normalized && (
            channelId === normalized ||
            channelId.includes(normalized) ||
            normalized.includes(channelId)
        );
    });
}

let observer = null;

function startObserver() {
    if (observer) return;

    const targetNode = document.getElementById("movie_player") || document.body;

    observer = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(handleAds, DEBOUNCE_DELAY);
    });

    observer.observe(targetNode, { childList: true, subtree: true });
}

function stopObserver() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    clearTimeout(debounceTimer);
}

function handleAds() {
    if (!isEnabled || isWhitelisted()) return;

    try {
        if (settings.blockAntiAdblock) postToMain("FG_ANTI_ADBLOCK");
        if (settings.blockVideo) skipVideoAd();
        if (settings.blockOverlay) hideOverlayAds();
        if (settings.blockBanner) hideCompanionAds();
        if (settings.blockOverlay) postToMain("FG_DISMISS");
    } catch (error) {
        console.debug("[FUNNYGAME] Lỗi:", error.message);
    }
}

function skipVideoAd() {
    const moviePlayer = document.getElementById("movie_player");
    const isAdActive = moviePlayer && (
        moviePlayer.classList.contains("ad-showing") ||
        moviePlayer.classList.contains("ad-interrupting")
    );

    const adModule = document.querySelector(".video-ads.ytp-ad-module");
    const hasAdModule = adModule && adModule.children.length > 0;

    let hasSkipButton = SKIP_SELECTORS.some((s) => document.querySelector(s));
    const hasSurveySkip = document.querySelector(
        ".ytp-ad-skip-ad-slot button, .ytp-ad-survey-player-overlay-skip-or-preview button"
    );

    if (!isAdActive && !hasAdModule && !hasSkipButton && !hasSurveySkip) return;

    const adVideo = document.querySelector("video.html5-main-video");
    if (adVideo) {
        if (settings.fastSkip) adVideo.playbackRate = 16;
        if (settings.muteAds) adVideo.muted = true;
        if (settings.fastSkip && adVideo.duration && isFinite(adVideo.duration)) {
            adVideo.currentTime = adVideo.duration;
        }
    }

    postToMain("FG_SKIP", { selectors: SKIP_SELECTORS });
}

function hideElements(selectors, category) {
    for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((el) => {
            if (hiddenElements.has(el)) return;
            hiddenElements.add(el);
            if (category === "overlay") {
                el.remove();
            } else {
                el.style.setProperty("display", "none", "important");
            }
            incrementBlockCount(category);
        });
    }
}

function hideOverlayAds() {
    hideElements(OVERLAY_SELECTORS, "overlay");
}

function hideCompanionAds() {
    hideElements(BANNER_SELECTORS, "banner");
}

let persistTimer = null;
let pendingBreakdown = null;

function todayKey() {
    return new Date().toISOString().slice(0, 10);
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

    chrome.storage.local.get(["statsBreakdown", "statsHistory", "userStats"], (result) => {
        const breakdown = { ...(result.statsBreakdown || { video: 0, banner: 0, overlay: 0, antiAdblock: 0 }) };
        for (const [key, val] of Object.entries(delta)) {
            if (breakdown[key] !== undefined) breakdown[key] += val;
        }

        const history = [...(result.statsHistory || [])];
        const key = todayKey();
        const totalDelta = Object.values(delta).reduce((a, b) => a + b, 0);
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

        chrome.storage.local.set({
            adsBlocked: adsBlockedCount,
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

    if (chrome.storage.session) {
        chrome.storage.session.get(["sessionAds"], (result) => {
            chrome.storage.session.set({ sessionAds: (result.sessionAds || 0) + 1 });
        });
    }
}

initialize();
