const DEFAULTS = {
    enabled: true,
    adsBlocked: 0,
    dailyGoal: 50,
    whitelistChannels: [],
    statsBreakdown: { video: 0, banner: 0, overlay: 0, antiAdblock: 0, spotify: 0 },
    statsHistory: [],
    userStats: { currentId: "guest", users: {} },
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

function migrateUserStats(existing) {
    const current = existing.userStats;
    if (current && current.users && Object.keys(current.users).length) return current;
    const blocked = existing.adsBlocked || 0;
    if (!blocked) return DEFAULTS.userStats;
    return {
        currentId: "device",
        users: {
            device: {
                id: "device",
                name: "Thiết bị này",
                avatar: "",
                adsBlocked: blocked,
                lastActive: Date.now(),
                firstSeen: Date.now(),
                days: [],
            },
        },
    };
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(null, (existing) => {
        const merged = { ...DEFAULTS, ...existing };
        if (!existing.settings) merged.settings = DEFAULTS.settings;
        if (!existing.statsBreakdown) merged.statsBreakdown = DEFAULTS.statsBreakdown;
        if (!existing.statsHistory) merged.statsHistory = DEFAULTS.statsHistory;
        merged.userStats = migrateUserStats(existing);
        if (!existing.whitelistChannels) merged.whitelistChannels = [];
        if (!existing.dailyGoal) merged.dailyGoal = DEFAULTS.dailyGoal;
        chrome.storage.local.set(merged);
    });
});
