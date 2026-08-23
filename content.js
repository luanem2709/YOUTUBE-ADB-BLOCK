let isEnabled = true;
let adsBlockedCount = 0;
let debounceTimer = null;
const DEBOUNCE_DELAY = 50;

const DEFAULT_SETTINGS = {
    blockVideo: true,
    blockBanner: true,
    blockOverlay: true,
    muteAds: true,
    fastSkip: true,
};

let settings = { ...DEFAULT_SETTINGS };

function initialize() {
    chrome.storage.local.get(["enabled", "adsBlocked", "settings"], (result) => {
        isEnabled = result.enabled !== undefined ? result.enabled : true;
        adsBlockedCount = result.adsBlocked || 0;
        settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };

        if (isEnabled) {
            startObserver();
            handleAds();
        }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local") {
            if (changes.enabled) {
                isEnabled = changes.enabled.newValue;
                if (isEnabled) {
                    startObserver();
                    handleAds();
                } else {
                    stopObserver();
                }
            }
            if (changes.settings) {
                settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
                if (isEnabled) handleAds();
            }
        }
    });

    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        if (event.data && event.data.type === "YT_AD_BLOCKER_COUNT_INCREMENT") {
            incrementBlockCount();
        }
    });

    document.addEventListener("yt-navigate-finish", () => {
        if (isEnabled) handleAds();
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

    observer.observe(targetNode, {
        childList: true,
        subtree: true,
    });
}

function stopObserver() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    clearTimeout(debounceTimer);
}

function handleAds() {
    if (!isEnabled) return;

    try {
        if (settings.blockVideo) skipVideoAd();
        if (settings.blockOverlay) hideOverlayAds();
        if (settings.blockBanner) hideCompanionAds();
        if (settings.blockOverlay) dismissAdDialogs();
    } catch (error) {
        console.debug("[FUNNYGAME] Lỗi xử lý quảng cáo:", error.message);
    }
}

function skipVideoAd() {
    const moviePlayer = document.getElementById("movie_player");
    const isAdActive = moviePlayer && (
        moviePlayer.classList.contains("ad-showing") ||
        moviePlayer.classList.contains("ad-interrupting")
    );

    const adModule = document.querySelector(".video-ads.ytp-ad-module");
    const hasAdModuleContent = adModule && adModule.children.length > 0;

    const skipSelectors = [
        "button.ytp-ad-skip-button-modern.ytp-button",
        ".ytp-ad-skip-button-slot button",
        ".ytp-ad-skip-button-container button",
        ".ytp-ad-skip-button-container",
        ".ytp-ad-skip-button",
        ".ytp-ad-skip-button-modern",
        ".ytp-skip-ad-button",
    ];

    let hasSkipButton = false;
    for (const selector of skipSelectors) {
        if (document.querySelector(selector) !== null) {
            hasSkipButton = true;
            break;
        }
    }

    const hasSurveySkip = document.querySelector(
        ".ytp-ad-skip-ad-slot button, .ytp-ad-survey-player-overlay-skip-or-preview button"
    ) !== null;

    if (!isAdActive && !hasAdModuleContent && !hasSkipButton && !hasSurveySkip) {
        return;
    }

    const adVideo = document.querySelector("video.html5-main-video");

    if (adVideo) {
        if (settings.fastSkip) {
            adVideo.playbackRate = 16;
        }
        if (settings.muteAds) {
            adVideo.muted = true;
        }
        if (settings.fastSkip && adVideo.duration && isFinite(adVideo.duration)) {
            adVideo.currentTime = adVideo.duration;
        }
    }

    window.postMessage({
        type: "YT_AD_BLOCKER_SKIP",
        selectors: skipSelectors,
    }, "*");
}

function hideOverlayAds() {
    const overlaySelectors = [
        ".ytp-ad-overlay-container",
        ".ytp-ad-text-overlay",
        ".ytp-ad-image-overlay",
    ];

    for (const selector of overlaySelectors) {
        document.querySelectorAll(selector).forEach((overlay) => {
            overlay.remove();
            incrementBlockCount();
        });
    }
}

function hideCompanionAds() {
    const companionSelectors = [
        "#player-ads",
        "ytd-companion-slot-renderer",
        "ytd-promoted-sparkles-web-renderer",
        "ytd-display-ad-renderer",
        "ytd-ad-slot-renderer",
        "ytd-in-feed-ad-layout-renderer",
        "#masthead-ad",
        "ytd-banner-promo-renderer",
    ];

    for (const selector of companionSelectors) {
        document.querySelectorAll(selector).forEach((companion) => {
            companion.style.setProperty("display", "none", "important");
        });
    }
}

function dismissAdDialogs() {
    const dismissSelectors = [
        "button.ytp-ad-overlay-close-button",
        ".ytp-ad-feedback-dialog-close-button",
        'tp-yt-paper-dialog #dismiss-button',
        ".ytp-ad-survey-player-overlay-close-button",
        ".ytp-ad-action-interstitial-close-button",
    ];

    for (const selector of dismissSelectors) {
        const btn = document.querySelector(selector);
        if (btn) btn.click();
    }
}

let persistTimer = null;

function incrementBlockCount() {
    adsBlockedCount++;

    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        chrome.storage.local.set({ adsBlocked: adsBlockedCount });
    }, 2000);

    if (chrome.storage.session) {
        chrome.storage.session.get(["sessionAds"], (result) => {
            const sessionAds = (result.sessionAds || 0) + 1;
            chrome.storage.session.set({ sessionAds });
        });
    }
}

initialize();
