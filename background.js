importScripts("license.js");

// Cho phép content script đọc/ghi chrome.storage.session (bộ đếm "Phiên này") — mặc định Chrome chặn
try {
    chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
} catch { /* trình duyệt cũ */ }

const DEFAULTS = {
    enabled: true,
    licenseValid: false,
    licenseExpires: "",
    licenseKey: "",
    adsBlocked: 0,
    dailyGoal: 50,
    whitelistChannels: [],
    statsBreakdown: { video: 0, banner: 0, overlay: 0, antiAdblock: 0, shopping: 0, spotify: 0 },
    statsHistory: [],
    userStats: { currentId: "guest", users: {} },
    settings: {
        blockVideo: true,
        blockBanner: true,
        blockOverlay: true,
        blockAntiAdblock: true,
        blockShopping: true,
        muteAds: true,
        fastSkip: true,
        blockManifest: true,
        blockSpotify: true,
        backgroundPlay: true,
        pipButton: true,
        hideUpsell: true,
        videoQuality: "auto",
        sponsorBlock: true,
        jumpAhead: true,
        ambientGlow: true,
        customLogo: true,
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
        refreshRemoteConfig();
    });
});

chrome.runtime.onStartup.addListener(() => {
    applyLicenseRules();
    refreshRemoteConfig();
    FunnyLicense.recheck().then(() => applyLicenseRules());
    setTimeout(resumeYoutubeTabs, 2000);
});

chrome.alarms.clear("funny-keepalive");
chrome.alarms.create("funny-license", { periodInMinutes: 30 });
chrome.alarms.create("funny-remote-config", { periodInMinutes: 360 });

// ---------- Cấu hình từ xa ----------
// Chỉ là DỮ LIỆU (danh sách selector), không phải code → hợp lệ với Manifest V3.
const REMOTE_CONFIG_URL = "https://raw.githubusercontent.com/luanem2709/YOUTUBE-ADB-BLOCK/main/release/remote-config.json";
const REMOTE_LISTS = {
    yt: ["adSignals", "skipButtons", "antiAdblock", "banners", "shopping"],
    spotify: ["adUi", "skipButtons"],
};

function sanitizeRemoteConfig(raw) {
    if (!raw || typeof raw !== "object" || typeof raw.version !== "number") return null;
    const out = { version: raw.version, fetchedAt: Date.now() };
    for (const [section, keys] of Object.entries(REMOTE_LISTS)) {
        const src = raw[section] && typeof raw[section] === "object" ? raw[section] : {};
        out[section] = {};
        for (const k of keys) {
            const list = Array.isArray(src[k]) ? src[k] : [];
            out[section][k] = list
                .slice(0, 100)
                .map((x) => String(x || "").trim())
                .filter((x) => x && x.length <= 200 && !/[{}<>]/.test(x));
        }
    }
    return out;
}

async function refreshRemoteConfig() {
    try {
        const res = await fetch(REMOTE_CONFIG_URL + "?t=" + Date.now(), { cache: "no-store" });
        if (!res.ok) return;
        const cfg = sanitizeRemoteConfig(await res.json());
        if (!cfg) return;
        const cur = (await chrome.storage.local.get(["remoteConfig"])).remoteConfig;
        if (!cur || cur.version !== cfg.version || JSON.stringify(cur.yt) !== JSON.stringify(cfg.yt) ||
            JSON.stringify(cur.spotify) !== JSON.stringify(cfg.spotify)) {
            await chrome.storage.local.set({ remoteConfig: cfg });
        }
    } catch { /* mất mạng → giữ bản cũ */ }
}

// ---------- SponsorBlock ----------
// Dùng API băm tiền tố (chỉ gửi 4 ký tự đầu SHA-256 của ID video) → máy chủ không biết bạn xem video nào.
const SB_CATEGORIES = ["sponsor", "selfpromo", "interaction"];
const sbCache = new Map();

async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchSponsorSegments(videoId) {
    if (sbCache.has(videoId)) return sbCache.get(videoId);
    let segments = [];
    try {
        const prefix = (await sha256Hex(videoId)).slice(0, 4);
        const url = "https://sponsor.ajay.app/api/skipSegments/" + prefix +
            "?categories=" + encodeURIComponent(JSON.stringify(SB_CATEGORIES)) +
            "&actionTypes=" + encodeURIComponent(JSON.stringify(["skip"]));
        const res = await fetch(url);
        if (res.ok) {
            const list = await res.json();
            const hit = Array.isArray(list) ? list.find((v) => v && v.videoID === videoId) : null;
            segments = ((hit && hit.segments) || [])
                .filter((x) => x && Array.isArray(x.segment) && SB_CATEGORIES.includes(x.category) && (x.actionType || "skip") === "skip")
                .map((x) => ({ start: Number(x.segment[0]), end: Number(x.segment[1]), category: x.category, uuid: String(x.UUID || "") }))
                .filter((x) => isFinite(x.start) && isFinite(x.end) && x.end - x.start >= 1);
        }
    } catch { /* bỏ qua */ }
    sbCache.set(videoId, segments);
    if (sbCache.size > 200) sbCache.delete(sbCache.keys().next().value);
    return segments;
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "funny-license") {
        FunnyLicense.recheck().then(() => applyLicenseRules());
    }
    if (alarm.name === "funny-remote-config") refreshRemoteConfig();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.enabled || changes.licenseToken || changes.licenseSig || changes.licenseKey)) {
        applyLicenseRules();
    }
});

// Nâng cấp từ bản cũ (chưa có token ký số): xin token mới từ máy chủ ngay khi khởi động
(async () => {
    try {
        const st = await FunnyLicense.load();
        if (!st.ok && st.key) {
            await FunnyLicense.recheck();
            applyLicenseRules();
        }
    } catch { /* ignore */ }
})();

const mutedByUs = new Set();

async function loadMutedTabs() {
    try {
        if (!chrome.storage?.session) return;
        const data = await chrome.storage.session.get(["mutedTabIds"]);
        if (Array.isArray(data.mutedTabIds)) {
            data.mutedTabIds.forEach((id) => mutedByUs.add(id));
        }
    } catch { /* ignore */ }
}

function saveMutedTabs() {
    try {
        if (!chrome.storage?.session) return;
        chrome.storage.session.set({ mutedTabIds: [...mutedByUs] });
    } catch { /* ignore */ }
}

loadMutedTabs();

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
        loadMutedTabs().then(() => {
            if (msg.muted) {
                mutedByUs.add(tabId);
                saveMutedTabs();
                chrome.tabs.update(tabId, { muted: true }, () => sendResponse({ ok: true }));
            } else if (mutedByUs.has(tabId)) {
                mutedByUs.delete(tabId);
                saveMutedTabs();
                chrome.tabs.update(tabId, { muted: false }, () => sendResponse({ ok: true }));
            } else {
                sendResponse({ ok: true });
            }
        });
        return true;
    }
    if (msg?.type === "FG_SB_SEGMENTS") {
        const videoId = String(msg.videoId || "");
        if (!/^[\w-]{6,20}$/.test(videoId)) {
            sendResponse({ segments: [] });
            return false;
        }
        chrome.storage.local.get(["settings"], async (r) => {
            if (r.settings && r.settings.sponsorBlock === false) return sendResponse({ segments: [] });
            sendResponse({ segments: await fetchSponsorSegments(videoId) });
        });
        return true;
    }
    if (msg?.type === "FG_OPEN_PANEL") {
        chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") }, () => sendResponse({ ok: true }));
        return true;
    }
    return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (mutedByUs.delete(tabId)) {
        saveMutedTabs();
    }
});

async function applyLicenseRules() {
    const raw = await chrome.storage.local.get(["enabled"]);
    const isEnabled = raw.enabled !== false;
    // Chỉ tin token có chữ ký số hợp lệ — cờ licenseValid trong storage KHÔNG còn được tin
    const state = await FunnyLicense.load();
    const shouldEnableRules = isEnabled && state.ok;
    try {
        if (shouldEnableRules) {
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

function resumeYoutubeTabs() {
    try {
        chrome.tabs.query({ url: ["*://*.youtube.com/*", "*://music.youtube.com/*"] }, (tabs) => {
            (tabs || []).forEach((tab) => {
                if (!tab.id) return;
                chrome.tabs.sendMessage(tab.id, { type: "FG_RESUME" }, () => {
                    void chrome.runtime.lastError;
                });
            });
        });
    } catch { /* ignore */ }
}

applyLicenseRules();
