importScripts("license.js");

const DEFAULTS = {
    enabled: true,
    licenseValid: false,
    licenseExpires: "",
    licenseKey: "",
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
        applyLicenseRules();
    });
});

chrome.runtime.onStartup.addListener(() => {
    applyLicenseRules();
    FunnyLicense.recheck().then(() => applyLicenseRules());
});

chrome.alarms.create("funny-license", { periodInMinutes: 30 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== "funny-license") return;
    FunnyLicense.recheck().then(() => applyLicenseRules());
});

const mutedByUs = new Set();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "LICENSE_SYNC") {
        applyLicenseRules().then(() => sendResponse({ ok: true }));
        return true;
    }
    if (msg?.type === "FG_MUTE_TAB") {
        const tabId = sender.tab?.id;
        if (tabId == null) {
            sendResponse({ ok: false });
            return false;
        }
        if (msg.muted) {
            chrome.tabs.update(tabId, { muted: true }, () => sendResponse({ ok: true }));
            mutedByUs.add(tabId);
        } else if (mutedByUs.has(tabId)) {
            chrome.tabs.update(tabId, { muted: false }, () => sendResponse({ ok: true }));
            mutedByUs.delete(tabId);
        } else {
            sendResponse({ ok: true });
        }
        return true;
    }
    return false;
});

chrome.tabs.onRemoved.addListener((tabId) => mutedByUs.delete(tabId));

async function applyLicenseRules() {
    const state = await FunnyLicense.load();
    if (!state.ok) {
        await chrome.storage.local.set({ licenseValid: false });
    }
    try {
        if (state.ok) {
            await chrome.declarativeNetRequest.updateEnabledRulesets({
                enableRulesetIds: ["ad_rules"],
            });
        } else {
            await chrome.declarativeNetRequest.updateEnabledRulesets({
                disableRulesetIds: ["ad_rules"],
            });
        }
    } catch {
        /* ruleset co the chua san sang */
    }
}

applyLicenseRules();
