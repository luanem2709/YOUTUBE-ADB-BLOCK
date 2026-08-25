const DEFAULTS = {
    enabled: true,
    adsBlocked: 0,
    dailyGoal: 50,
    whitelistChannels: [],
    statsBreakdown: { video: 0, banner: 0, overlay: 0, antiAdblock: 0, spotify: 0 },
    statsHistory: [],
    settings: {
        blockVideo: true,
        blockBanner: true,
        blockOverlay: true,
        blockAntiAdblock: true,
        muteAds: true,
        fastSkip: true,
        blockSpotify: true,
    },
};

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(null, (existing) => {
        const merged = { ...DEFAULTS, ...existing };
        if (!existing.settings) merged.settings = DEFAULTS.settings;
        if (!existing.statsBreakdown) merged.statsBreakdown = DEFAULTS.statsBreakdown;
        if (!existing.statsHistory) merged.statsHistory = DEFAULTS.statsHistory;
        if (!existing.whitelistChannels) merged.whitelistChannels = [];
        if (!existing.dailyGoal) merged.dailyGoal = DEFAULTS.dailyGoal;
        chrome.storage.local.set(merged);
    });
});
