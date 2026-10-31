const DEFAULT_SETTINGS = {
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
const statShopping = $("statShopping");
const statSpotify = $("statSpotify");
const refreshTabBtn = $("refreshTabBtn");
const openYoutubeBtn = $("openYoutubeBtn");
const openOptionsBtn = $("openOptionsBtn");
const openStatsBtn = $("openStatsBtn");
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
    blockShopping: $("blockShopping"),
    muteAds: $("muteAds"),
    fastSkip: $("fastSkip"),
    blockManifest: $("blockManifest"),
    blockSpotify: $("blockSpotify"),
    backgroundPlay: $("backgroundPlay"),
    pipButton: $("pipButton"),
    hideUpsell: $("hideUpsell"),
    videoQuality: $("videoQuality"),
    jumpAhead: $("jumpAhead"),
    sponsorBlock: $("sponsorBlock"),
    ambientGlow: $("ambientGlow"),
    customLogo: $("customLogo"),
};

function isCheckbox(input) {
    return input && input.type === "checkbox";
}

let toastTimer = null;

function todayKey() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

// Hàng đợi ghi chrome.storage.local — tránh race condition đọc→sửa→ghi trên cùng key
// (userStats) khi nhiều nhánh code cùng cập nhật chạy song song.
let storageWriteChain = Promise.resolve();
function enqueueStorageWrite(task) {
    storageWriteChain = storageWriteChain
        .then(() => task())
        .catch(() => { /* lỗi storage không được làm hỏng chuỗi */ });
    return storageWriteChain;
}

function getTodayCount(statsHistory, fallbackTotal) {
    if (Array.isArray(statsHistory) && statsHistory.length > 0) {
        const key = todayKey();
        const entry = statsHistory.find((h) => h.date === key);
        return entry ? (entry.count || 0) : 0;
    }
    return fallbackTotal || 0;
}

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

function updateProgress(todayBlocked) {
    const pct = Math.min(100, (todayBlocked / dailyGoal) * 100);
    progressFill.style.width = pct + "%";
    progressLabel.textContent = `${formatNumber(Math.min(todayBlocked, dailyGoal))} / ${dailyGoal}`;
}

function updateBreakdown(breakdown) {
    const b = breakdown || { video: 0, banner: 0, overlay: 0, antiAdblock: 0, shopping: 0, spotify: 0 };
    statVideo.textContent = formatNumber(b.video || 0);
    statBanner.textContent = formatNumber(b.banner || 0);
    statOverlay.textContent = formatNumber(b.overlay || 0);
    statAnti.textContent = formatNumber(b.antiAdblock || 0);
    if (statShopping) statShopping.textContent = formatNumber(b.shopping || 0);
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
        const input = settingInputs[key];
        if (settings[key] === undefined || !input) return;
        if (isCheckbox(input)) input.checked = !!settings[key];
        else input.value = String(settings[key]);
    });
}

function getSettingsFromUI() {
    const settings = {};
    Object.keys(settingInputs).forEach((key) => {
        const input = settingInputs[key];
        if (!input) return;
        settings[key] = isCheckbox(input) ? input.checked : input.value;
    });
    return settings;
}

const licenseGate = $("licenseGate");
const licenseKey = $("licenseKey");
const licenseBtn = $("licenseBtn");
const licenseError = $("licenseError");
const licenseHint = $("licenseHint");
const headerExpiry = $("headerExpiry");
const appShell = $("appShell");

function setLicenseLocked(locked, expiryLabel) {
    appShell.classList.toggle("locked", locked);
    if (headerExpiry) {
        headerExpiry.textContent = locked ? "" : (expiryLabel || "");
        headerExpiry.style.display = locked || !expiryLabel ? "none" : "block";
    }
    if (!locked && headerStatus) {
        headerStatus.textContent = "Đang bảo vệ";
        headerStatus.classList.remove("off");
    }
    if (locked && headerStatus) {
        headerStatus.textContent = "Chưa kích hoạt";
        headerStatus.classList.add("off");
    }
}

async function applyLicenseGate() {
    let state = await FunnyLicense.load();
    // Nâng cấp từ bản cũ: đã có key nhưng chưa có token ký số → xin token từ máy chủ, không bắt nhập lại
    if (!state.ok && state.key && !state.hasToken) {
        if (licenseHint) licenseHint.textContent = "Đang nâng cấp key lên chuẩn bảo mật mới...";
        if (licenseKey) licenseKey.value = state.key;
        const r = await FunnyLicense.recheck();
        state = await FunnyLicense.load();
        if (!state.ok && licenseError) licenseError.textContent = (r && r.message) || "Không nâng cấp được key. Hãy bấm Kích hoạt lại.";
        if (licenseHint) licenseHint.textContent = "Nhập key để bật chặn quảng cáo YouTube & Spotify.";
    }
    setLicenseLocked(!state.ok, state.label);
    chrome.runtime.sendMessage({ type: "LICENSE_SYNC" });
    if (state.ok) initPopup();
}

async function submitLicense() {
    licenseError.textContent = "";
    licenseBtn.disabled = true;
    licenseBtn.textContent = "Đang kiểm tra...";
    const result = await FunnyLicense.activate(licenseKey.value);
    licenseBtn.disabled = false;
    licenseBtn.textContent = "Kích hoạt";
    if (!result.ok) {
        licenseError.textContent = result.message || "Key authentic không đúng.";
        return;
    }
    chrome.runtime.sendMessage({ type: "LICENSE_SYNC" });
    setLicenseLocked(false, result.label);
    showToast("Đã kích hoạt. Chặn quảng cáo đã bật.");
    initPopup();
}

licenseBtn.addEventListener("click", () => submitLicense());
licenseKey.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitLicense();
});

function initPopup() {
    chrome.storage.local.get(
        ["enabled", "adsBlocked", "settings", "dailyGoal", "statsBreakdown", "statsHistory"],
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
            updateProgress(getTodayCount(result.statsHistory, blocked));
            updateBreakdown(result.statsBreakdown);
        }
    );

    if (chrome.storage.session) {
        chrome.storage.session.get(["sessionAds"], (result) => {
            sessionCount.textContent = formatNumber(result.sessionAds || 0);
        });
    }

    updateTabStatus();
    touchCurrentUser();
}

function touchCurrentUser() {
    // Serialize với confirmResetBtn: cả hai đều đọc→sửa→ghi userStats.
    enqueueStorageWrite(async () => {
        const result = await chrome.storage.local.get(["userStats"]);
        const userStats = result.userStats;
        if (!userStats?.users) return;
        const id = userStats.currentId;
        const user = userStats.users[id];
        if (!user) return;
        user.lastActive = Date.now();
        const today = todayKey();
        if (!Array.isArray(user.days)) user.days = [];
        if (!user.days.includes(today)) user.days.push(today);
        await chrome.storage.local.set({ userStats });
    });
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
            chrome.storage.local.get(["statsHistory"], (r) => {
                updateProgress(getTodayCount(r.statsHistory, count));
            });
        }
        if (changes.statsHistory) {
            chrome.storage.local.get(["adsBlocked"], (r) => {
                updateProgress(getTodayCount(changes.statsHistory.newValue, r.adsBlocked || 0));
            });
        }
        if (changes.statsBreakdown) {
            updateBreakdown(changes.statsBreakdown.newValue);
        }
        if (changes.dailyGoal) {
            dailyGoal = changes.dailyGoal.newValue || 50;
            chrome.storage.local.get(["adsBlocked", "statsHistory"], (r) => {
                updateProgress(getTodayCount(r.statsHistory, r.adsBlocked || 0));
            });
        }
        if (changes.enabled) {
            enableToggle.checked = changes.enabled.newValue;
            updateMasterUI(changes.enabled.newValue);
        }
        if (changes.licenseToken || changes.licenseSig || changes.licenseKey) {
            FunnyLicense.load().then((state) => {
                setLicenseLocked(!state.ok, state.label);
            });
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

openStatsBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("stats.html") });
});

const reportAdBtn = $("reportAdBtn");
reportAdBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs?.[0];
        if (!tab || !/youtube\.com/.test(tab.url || "")) {
            showToast("Hãy mở tab YouTube đang có quảng cáo rồi bấm lại");
            return;
        }
        chrome.tabs.sendMessage(tab.id, { type: "FG_DIAG" }, async (res) => {
            if (chrome.runtime.lastError || !res) {
                showToast("Không đọc được tab — tải lại trang YouTube rồi thử lại");
                return;
            }
            const text = "FUNNYGAME báo lỗi QC\n" + JSON.stringify(res, null, 1);
            try {
                await navigator.clipboard.writeText(text);
                showToast("Đã chép thông tin — dán gửi cho người hỗ trợ");
            } catch {
                showToast("Không chép được vào clipboard");
            }
        });
    });
});

resetStatsBtn.addEventListener("click", () => resetModal.classList.add("show"));
cancelResetBtn.addEventListener("click", () => resetModal.classList.remove("show"));

confirmResetBtn.addEventListener("click", () => {
    enqueueStorageWrite(async () => {
        const res = await chrome.storage.local.get(["userStats"]);
        const userStats = res.userStats || { currentId: "guest", users: {} };
        Object.values(userStats.users || {}).forEach((user) => {
            user.adsBlocked = 0;
            user.days = [];
        });
        await chrome.storage.local.set({
            adsBlocked: 0,
            statsBreakdown: { video: 0, banner: 0, overlay: 0, antiAdblock: 0, spotify: 0 },
            statsHistory: [],
            userStats,
        });
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
applyLicenseGate();
