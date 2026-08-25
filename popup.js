const DEFAULT_SETTINGS = {
    blockVideo: true,
    blockBanner: true,
    blockOverlay: true,
    blockAntiAdblock: true,
    muteAds: true,
    fastSkip: true,
    blockSpotify: true,
};

let dailyGoal = 50;

const $ = (id) => document.getElementById(id);

const enableToggle = $("enableToggle");
const headerStatus = $("headerStatus");
const tabStatus = $("tabStatus");
const adsBlockedCount = $("adsBlockedCount");
const sessionCount = $("sessionCount");
const timeSavedCount = $("timeSavedCount");
const progressFill = $("progressFill");
const progressLabel = $("progressLabel");
const statVideo = $("statVideo");
const statBanner = $("statBanner");
const statOverlay = $("statOverlay");
const statAnti = $("statAnti");
const statSpotify = $("statSpotify");
const refreshTabBtn = $("refreshTabBtn");
const openYoutubeBtn = $("openYoutubeBtn");
const openOptionsBtn = $("openOptionsBtn");
const resetStatsBtn = $("resetStatsBtn");
const resetModal = $("resetModal");
const cancelResetBtn = $("cancelResetBtn");
const confirmResetBtn = $("confirmResetBtn");
const toast = $("toast");
const versionBadge = $("versionBadge");

const settingInputs = {
    blockVideo: $("blockVideo"),
    blockBanner: $("blockBanner"),
    blockOverlay: $("blockOverlay"),
    blockAntiAdblock: $("blockAntiAdblock"),
    muteAds: $("muteAds"),
    fastSkip: $("fastSkip"),
    blockSpotify: $("blockSpotify"),
};

let toastTimer = null;

function initTabs() {
    const dockItems = document.querySelectorAll(".dock-item");
    const indicator = document.getElementById("dockIndicator");

    function moveIndicator(activeBtn) {
        if (!indicator || !activeBtn) return;
        indicator.style.width = activeBtn.offsetWidth + "px";
        indicator.style.transform = `translateX(${activeBtn.offsetLeft - 6}px)`;
    }

    dockItems.forEach((btn) => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            dockItems.forEach((b) => {
                b.classList.remove("active");
                b.setAttribute("aria-selected", "false");
            });
            document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
            btn.classList.add("active");
            btn.setAttribute("aria-selected", "true");
            $("panel-" + tab).classList.add("active");
            moveIndicator(btn);
        });
    });

    const active = document.querySelector(".dock-item.active");
    moveIndicator(active);
    requestAnimationFrame(() => moveIndicator(active));
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function formatNumber(num) {
    return new Intl.NumberFormat("vi-VN").format(num);
}

function formatTimeSaved(blockedCount) {
    const seconds = blockedCount * 15;
    if (seconds < 60) return `${seconds} giây`;
    if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remain = seconds % 60;
        return remain > 0 ? `${minutes} phút ${remain} giây` : `${minutes} phút`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}

function animateStat(el) {
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
}

function updateProgress(blocked) {
    const pct = Math.min(100, (blocked / dailyGoal) * 100);
    progressFill.style.width = pct + "%";
    progressLabel.textContent = `${formatNumber(Math.min(blocked, dailyGoal))} / ${dailyGoal}`;
}

function updateBreakdown(breakdown) {
    const b = breakdown || { video: 0, banner: 0, overlay: 0, antiAdblock: 0, spotify: 0 };
    statVideo.textContent = formatNumber(b.video || 0);
    statBanner.textContent = formatNumber(b.banner || 0);
    statOverlay.textContent = formatNumber(b.overlay || 0);
    statAnti.textContent = formatNumber(b.antiAdblock || 0);
    if (statSpotify) statSpotify.textContent = formatNumber(b.spotify || 0);
}

function updateTabStatus() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs?.[0]?.url || "";
        if (url.includes("open.spotify.com")) {
            tabStatus.textContent = "Tab hiện tại: Spotify";
            tabStatus.classList.add("active-platform");
            return;
        }
        if (!url.includes("youtube.com")) {
            tabStatus.textContent = "Tab hiện tại: không phải YouTube/Spotify";
            tabStatus.classList.remove("active-platform");
            return;
        }
        tabStatus.classList.add("active-platform");
        if (url.includes("/shorts/")) tabStatus.textContent = "Tab hiện tại: YouTube Shorts";
        else if (url.includes("music.youtube.com")) tabStatus.textContent = "Tab hiện tại: YouTube Music";
        else if (url.includes("/watch")) tabStatus.textContent = "Tab hiện tại: đang xem video";
        else if (url.includes("/live/")) tabStatus.textContent = "Tab hiện tại: live stream";
        else tabStatus.textContent = "Tab hiện tại: YouTube";
    });
}

function updateMasterUI(isEnabled) {
    if (isEnabled) {
        headerStatus.textContent = "Đang bảo vệ";
        headerStatus.classList.remove("off");
    } else {
        headerStatus.textContent = "Đã tắt";
        headerStatus.classList.add("off");
    }
    Object.values(settingInputs).forEach((input) => {
        if (input) input.disabled = !isEnabled;
    });
}

function applySettingsToUI(settings) {
    Object.keys(settingInputs).forEach((key) => {
        if (settings[key] !== undefined && settingInputs[key]) {
            settingInputs[key].checked = settings[key];
        }
    });
}

function getSettingsFromUI() {
    const settings = {};
    Object.keys(settingInputs).forEach((key) => {
        if (settingInputs[key]) settings[key] = settingInputs[key].checked;
    });
    return settings;
}

function initPopup() {
    chrome.storage.local.get(
        ["enabled", "adsBlocked", "settings", "dailyGoal", "statsBreakdown"],
        (result) => {
            const isEnabled = result.enabled !== undefined ? result.enabled : true;
            const blocked = result.adsBlocked || 0;
            const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
            dailyGoal = result.dailyGoal || 50;

            enableToggle.checked = isEnabled;
            applySettingsToUI(settings);
            updateMasterUI(isEnabled);
            adsBlockedCount.textContent = formatNumber(blocked);
            updateTimeSaved(blocked);
            updateProgress(blocked);
            updateBreakdown(result.statsBreakdown);
        }
    );

    if (chrome.storage.session) {
        chrome.storage.session.get(["sessionAds"], (result) => {
            sessionCount.textContent = formatNumber(result.sessionAds || 0);
        });
    }

    updateTabStatus();
}

function updateTimeSaved(blockedCount) {
    timeSavedCount.textContent = formatTimeSaved(blockedCount);
}

enableToggle.addEventListener("change", () => {
    const isEnabled = enableToggle.checked;
    chrome.storage.local.set({ enabled: isEnabled });
    updateMasterUI(isEnabled);
    showToast(isEnabled ? "Đã bật bảo vệ YouTube & Spotify" : "Đã tắt chặn quảng cáo");
});

Object.keys(settingInputs).forEach((key) => {
    if (!settingInputs[key]) return;
    settingInputs[key].addEventListener("change", () => {
        chrome.storage.local.set({ settings: getSettingsFromUI() });
        showToast("Đã lưu cài đặt");
    });
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
        if (changes.adsBlocked) {
            const count = changes.adsBlocked.newValue || 0;
            adsBlockedCount.textContent = formatNumber(count);
            animateStat(adsBlockedCount);
            updateTimeSaved(count);
            updateProgress(count);
        }
        if (changes.statsBreakdown) {
            updateBreakdown(changes.statsBreakdown.newValue);
        }
        if (changes.dailyGoal) {
            dailyGoal = changes.dailyGoal.newValue || 50;
            chrome.storage.local.get(["adsBlocked"], (r) => updateProgress(r.adsBlocked || 0));
        }
        if (changes.enabled) {
            enableToggle.checked = changes.enabled.newValue;
            updateMasterUI(changes.enabled.newValue);
        }
        if (changes.settings) {
            applySettingsToUI({ ...DEFAULT_SETTINGS, ...changes.settings.newValue });
        }
    }
    if (area === "session" && changes.sessionAds) {
        sessionCount.textContent = formatNumber(changes.sessionAds.newValue || 0);
        animateStat(sessionCount);
    }
});

refreshTabBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs?.[0]) {
            chrome.tabs.reload(tabs[0].id);
            showToast("Đang tải lại tab...");
        }
    });
});

openYoutubeBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.youtube.com" });
    showToast("Đang mở YouTube");
});

openOptionsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
});

resetStatsBtn.addEventListener("click", () => resetModal.classList.add("show"));
cancelResetBtn.addEventListener("click", () => resetModal.classList.remove("show"));

confirmResetBtn.addEventListener("click", () => {
    chrome.storage.local.set({
        adsBlocked: 0,
        statsBreakdown: { video: 0, banner: 0, overlay: 0, antiAdblock: 0, spotify: 0 },
        statsHistory: [],
    }, () => {
        if (chrome.storage.session) chrome.storage.session.set({ sessionAds: 0 });
        adsBlockedCount.textContent = "0";
        sessionCount.textContent = "0";
        timeSavedCount.textContent = "0 giây";
        updateProgress(0);
        updateBreakdown({});
        resetModal.classList.remove("show");
        showToast("Đã đặt lại thống kê");
    });
});

resetModal.addEventListener("click", (e) => {
    if (e.target === resetModal) resetModal.classList.remove("show");
});

versionBadge.textContent = "v" + chrome.runtime.getManifest().version;

initTabs();
initPopup();
