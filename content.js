let isEnabled = true;
let msgToken = null;
let adsBlockedCount = 0;
let debounceTimer = null;
let whitelistChannels = [];
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

let settings = { ...DEFAULT_SETTINGS };

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
        ["enabled", "adsBlocked", "settings", "whitelistChannels"],
        (result) => {
            isEnabled = result.enabled !== undefined ? result.enabled : true;
            adsBlockedCount = result.adsBlocked || 0;
            settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
            whitelistChannels = result.whitelistChannels || [];

            if (isEnabled) {
                startWhenReady();
            }
        }
    );

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;

        if (changes.enabled) {
            isEnabled = changes.enabled.newValue;
            if (isEnabled) startWhenReady();
            else stopObserver();
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
    });

    document.addEventListener("yt-navigate-finish", () => {
        if (isEnabled) handleAds();
    });
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

function flushStats() {
    const delta = pendingBreakdown || { video: 0, banner: 0, overlay: 0, antiAdblock: 0 };
    pendingBreakdown = null;

    chrome.storage.local.get(["statsBreakdown", "statsHistory"], (result) => {
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

        chrome.storage.local.set({
            adsBlocked: adsBlockedCount,
            statsBreakdown: breakdown,
            statsHistory: history.slice(-7),
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
