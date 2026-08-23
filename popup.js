const DEFAULT_SETTINGS = {
    blockVideo: true,
    blockBanner: true,
    blockOverlay: true,
    muteAds: true,
    fastSkip: true,
};

const DAILY_GOAL = 50;

const $ = (id) => document.getElementById(id);

const enableToggle = $("enableToggle");
const headerStatus = $("headerStatus");
const masterDesc = $("masterDesc");
const adsBlockedCount = $("adsBlockedCount");
const sessionCount = $("sessionCount");
const timeSavedCount = $("timeSavedCount");
const progressFill = $("progressFill");
const progressLabel = $("progressLabel");
const refreshTabBtn = $("refreshTabBtn");
const openYoutubeBtn = $("openYoutubeBtn");
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
    muteAds: $("muteAds"),
    fastSkip: $("fastSkip"),
};

let toastTimer = null;

function initTabs() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
            document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
            btn.classList.add("active");
            $("panel-" + tab).classList.add("active");
        });
    });
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
    const pct = Math.min(100, (blocked / DAILY_GOAL) * 100);
    progressFill.style.width = pct + "%";
    progressLabel.textContent = `${formatNumber(Math.min(blocked, DAILY_GOAL))} / ${DAILY_GOAL}`;
}

function updateMasterUI(isEnabled) {
    if (isEnabled) {
        headerStatus.textContent = "Đang bảo vệ";
        headerStatus.classList.remove("off");
        masterDesc.textContent = "Đang chặn quảng cáo trên mọi tab YouTube";
    } else {
        headerStatus.textContent = "Đã tắt";
        headerStatus.classList.add("off");
        masterDesc.textContent = "Quảng cáo sẽ hiển thị bình thường trên YouTube";
    }

    Object.values(settingInputs).forEach((input) => {
        input.disabled = !isEnabled;
    });
}

function applySettingsToUI(settings) {
    Object.keys(settingInputs).forEach((key) => {
        if (settings[key] !== undefined) {
            settingInputs[key].checked = settings[key];
        }
    });
}

function getSettingsFromUI() {
    const settings = {};
    Object.keys(settingInputs).forEach((key) => {
        settings[key] = settingInputs[key].checked;
    });
    return settings;
}

function saveSettings(settings) {
    chrome.storage.local.set({ settings });
}

function initPopup() {
    chrome.storage.local.get(["enabled", "adsBlocked", "settings"], (result) => {
        const isEnabled = result.enabled !== undefined ? result.enabled : true;
        const blocked = result.adsBlocked || 0;
        const settings = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };

        enableToggle.checked = isEnabled;
        applySettingsToUI(settings);
        updateMasterUI(isEnabled);

        adsBlockedCount.textContent = formatNumber(blocked);
        updateTimeSaved(blocked);
        updateProgress(blocked);
    });

    if (chrome.storage.session) {
        chrome.storage.session.get(["sessionAds"], (result) => {
            sessionCount.textContent = formatNumber(result.sessionAds || 0);
        });
    }
}

function updateTimeSaved(blockedCount) {
    timeSavedCount.textContent = formatTimeSaved(blockedCount);
}

enableToggle.addEventListener("change", () => {
    const isEnabled = enableToggle.checked;
    chrome.storage.local.set({ enabled: isEnabled });
    updateMasterUI(isEnabled);
    showToast(isEnabled ? "Đã bật bảo vệ YouTube" : "Đã tắt chặn quảng cáo");
});

Object.keys(settingInputs).forEach((key) => {
    settingInputs[key].addEventListener("change", () => {
        const settings = getSettingsFromUI();
        saveSettings(settings);
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
        if (tabs && tabs[0]) {
            chrome.tabs.reload(tabs[0].id);
            showToast("Đang tải lại tab...");
        }
    });
});

openYoutubeBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.youtube.com" });
    showToast("Đang mở YouTube");
});

resetStatsBtn.addEventListener("click", () => {
    resetModal.classList.add("show");
});

cancelResetBtn.addEventListener("click", () => {
    resetModal.classList.remove("show");
});

confirmResetBtn.addEventListener("click", () => {
    chrome.storage.local.set({ adsBlocked: 0 }, () => {
        if (chrome.storage.session) {
            chrome.storage.session.set({ sessionAds: 0 });
        }
        adsBlockedCount.textContent = "0";
        sessionCount.textContent = "0";
        timeSavedCount.textContent = "0 giây";
        updateProgress(0);
        resetModal.classList.remove("show");
        showToast("Đã đặt lại thống kê");
    });
});

resetModal.addEventListener("click", (e) => {
    if (e.target === resetModal) resetModal.classList.remove("show");
});

const manifest = chrome.runtime.getManifest();
versionBadge.textContent = "v" + manifest.version;

initTabs();
initPopup();
