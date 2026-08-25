const $ = (id) => document.getElementById(id);

const totalUsersEl = $("totalUsers");
const yourRankEl = $("yourRank");
const adsBlockedCount = $("adsBlockedCount");
const sessionCount = $("sessionCount");
const timeSavedCount = $("timeSavedCount");
const progressFill = $("progressFill");
const progressLabel = $("progressLabel");
const statVideo = $("statVideo");
const statBanner = $("statBanner");
const statOverlay = $("statOverlay");
const statAnti = $("statAnti");
const podiumEl = $("podium");
const rankBoard = $("rankBoard");
const displayName = $("displayName");
const profileAvatar = $("profileAvatar");
const avatarFallback = $("avatarFallback");
const avatarFile = $("avatarFile");
const profileSub = $("profileSub");
const saveNameBtn = $("saveNameBtn");
const refreshBtn = $("refreshBtn");
const resetStatsBtn = $("resetStatsBtn");
const resetModal = $("resetModal");
const cancelResetBtn = $("cancelResetBtn");
const confirmResetBtn = $("confirmResetBtn");
const toast = $("toast");

let dailyGoal = 50;
let toastTimer = null;
let currentId = "";

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function formatNumber(num) {
    return new Intl.NumberFormat("vi-VN").format(num || 0);
}

function formatTimeSaved(blockedCount) {
    const seconds = (blockedCount || 0) * 15;
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

function formatLastActive(ts) {
    if (!ts) return "Chưa hoạt động";
    const diff = Date.now() - ts;
    if (diff < 60 * 1000) return "Vừa xong";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} phút trước`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} giờ trước`;
    return new Date(ts).toLocaleString("vi-VN");
}

function initialFromName(name) {
    const text = (name || "?").trim();
    return text.slice(0, 1).toUpperCase();
}

function rankMeta(rank) {
    if (rank === 1) return { cls: "gold", crown: "👑", title: "Vô địch" };
    if (rank === 2) return { cls: "silver", crown: "🥈", title: "Á quân" };
    if (rank === 3) return { cls: "bronze", crown: "🥉", title: "Hạng 3" };
    if (rank <= 10) return { cls: "", crown: "", title: "Cao thủ" };
    return { cls: "", crown: "", title: "Tân binh" };
}

function usersFromStats(userStats, adsBlocked) {
    const users = Object.values(userStats?.users || {});
    if (users.length) return users;
    if (!adsBlocked) return [];
    return [{
        id: "device",
        name: "Thiết bị này",
        avatar: "",
        adsBlocked,
        lastActive: Date.now(),
        days: [],
    }];
}

function safeAvatar(src) {
    if (!src) return "";
    if (src.startsWith("data:image/")) {
        return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(src) ? src : "";
    }
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

function applyAvatar(el, user) {
    const src = safeAvatar(user.customAvatar || user.avatar);
    const fallback = el.querySelector(".avatar-fallback");
    if (src) {
        el.style.backgroundImage = `url("${src.replace(/"/g, "")}")`;
        if (fallback) fallback.textContent = "";
        else el.textContent = "";
    } else {
        el.style.backgroundImage = "";
        const letter = initialFromName(user.name);
        if (fallback) fallback.textContent = letter;
        else el.textContent = letter;
    }
}

function compressAvatar(file) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith("image/")) {
            reject(new Error("Chọn file ảnh"));
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            reject(new Error("Ảnh tối đa 5MB"));
            return;
        }

        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            const size = 128;
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");
            const scale = Math.max(size / img.width, size / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
            resolve(canvas.toDataURL("image/jpeg", 0.86));
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Không đọc được ảnh"));
        };
        img.src = objectUrl;
    });
}

function patchCurrentUser(patch, successMsg) {
    if (!chrome?.storage?.local) {
        showToast(successMsg);
        return;
    }

    chrome.storage.local.get(["userStats"], (result) => {
        const userStats = result.userStats || { currentId: "guest", users: {} };
        const id = userStats.currentId || currentId || "guest";
        if (!userStats.users[id]) {
            userStats.users[id] = {
                id,
                name: patch.name || "Người dùng",
                avatar: "",
                customAvatar: "",
                adsBlocked: 0,
                lastActive: Date.now(),
                firstSeen: Date.now(),
                days: [],
            };
        }
        Object.assign(userStats.users[id], patch);
        userStats.currentId = id;
        chrome.storage.local.set({ userStats }, () => {
            showToast(successMsg);
            loadStats();
        });
    });
}

function makeAvatarNode(className, user) {
    const el = document.createElement("div");
    el.className = className;
    applyAvatar(el, user);
    return el;
}

function renderPersonal(result) {
    const blocked = result.adsBlocked || 0;
    const breakdown = result.statsBreakdown || { video: 0, banner: 0, overlay: 0, antiAdblock: 0 };
    dailyGoal = result.dailyGoal || 50;
    adsBlockedCount.textContent = formatNumber(blocked);
    sessionCount.textContent = formatNumber(result.sessionAds || 0);
    timeSavedCount.textContent = formatTimeSaved(blocked);
    progressFill.style.width = Math.min(100, (blocked / dailyGoal) * 100) + "%";
    progressLabel.textContent = `${formatNumber(Math.min(blocked, dailyGoal))} / ${dailyGoal}`;
    statVideo.textContent = formatNumber(breakdown.video || 0);
    statBanner.textContent = formatNumber(breakdown.banner || 0);
    statOverlay.textContent = formatNumber(breakdown.overlay || 0);
    statAnti.textContent = formatNumber(breakdown.antiAdblock || 0);
}

function renderPodium(list) {
    podiumEl.innerHTML = "";
    if (!list.length) {
        podiumEl.innerHTML = '<p class="empty-copy">Chưa có dữ liệu xếp hạng. Mở YouTube và dùng extension để bắt đầu đua top.</p>';
        return;
    }

    const slots = [list[1], list[0], list[2]];
    const ranks = [2, 1, 3];
    slots.forEach((user, i) => {
        const rank = ranks[i];
        const card = document.createElement("article");
        if (!user) {
            card.className = "podium-card";
            card.innerHTML = '<p class="empty-copy">Đang chờ đối thủ</p>';
            podiumEl.appendChild(card);
            return;
        }
        const meta = rankMeta(rank);
        card.className = `podium-card ${meta.cls}${user.id === currentId ? " me" : ""}`;
        const name = document.createElement("div");
        name.className = "podium-name";
        name.textContent = user.name || "Người dùng";
        card.innerHTML = `
            <div class="crown">${meta.crown}</div>
            <div class="podium-title">${meta.title}</div>
            <div class="podium-score">${formatNumber(user.adsBlocked)}</div>
            <div class="podium-sub">${formatTimeSaved(user.adsBlocked)}</div>
        `;
        const titleEl = card.querySelector(".podium-title");
        card.insertBefore(makeAvatarNode("podium-avatar", user), titleEl);
        card.insertBefore(name, titleEl);
        podiumEl.appendChild(card);
    });
}

function renderBoard(list) {
    rankBoard.innerHTML = "";
    if (!list.length) return;

    const topScore = Math.max(list[0].adsBlocked || 0, 1);
    list.forEach((user, index) => {
        const rank = index + 1;
        const meta = rankMeta(rank);
        const above = list[index - 1];
        const gap = above ? Math.max(0, (above.adsBlocked || 0) - (user.adsBlocked || 0) + 1) : 0;
        const row = document.createElement("article");
        row.className = `rank-row ${meta.cls}${user.id === currentId ? " me" : ""}`;

        const userBox = document.createElement("div");
        userBox.className = "user-cell";
        userBox.appendChild(makeAvatarNode("user-avatar", user));
        const info = document.createElement("div");
        info.innerHTML = `<div class="user-name"></div><div class="user-title"></div>`;
        info.querySelector(".user-name").textContent = user.name || "Người dùng";
        if (user.id === currentId) {
            const you = document.createElement("span");
            you.className = "user-you";
            you.textContent = "Bạn";
            info.querySelector(".user-name").appendChild(you);
        }
        info.querySelector(".user-title").textContent = `${meta.title} · ${formatNumber((user.days || []).length)} ngày`;
        userBox.appendChild(info);

        row.innerHTML = `
            <div class="rank-no ${meta.cls}">${rank}</div>
            <div></div>
            <div class="score-block">
                <div class="score">${formatNumber(user.adsBlocked)}</div>
                <div class="score-sub">${formatTimeSaved(user.adsBlocked)}</div>
            </div>
            <div class="gap-block">
                <div class="gap-text">${rank === 1 ? "Đang giữ ngôi đầu" : `Còn ${formatNumber(gap)} để vượt ${above?.name || "hạng trên"}`}</div>
                <div class="gap-bar"><div class="gap-fill" style="width:${Math.max(8, ((user.adsBlocked || 0) / topScore) * 100)}%"></div></div>
            </div>
        `;
        row.children[1].replaceWith(userBox);
        rankBoard.appendChild(row);
    });
}

function render(result) {
    renderPersonal(result);

    const userStats = result.userStats || { currentId: "", users: {} };
    const list = usersFromStats(userStats, result.adsBlocked || 0)
        .sort((a, b) => (b.adsBlocked || 0) - (a.adsBlocked || 0));

    currentId = userStats.currentId || list[0]?.id || "";
    const me = list.find((u) => u.id === currentId) || list[0];
    const myRank = me ? list.findIndex((u) => u.id === me.id) + 1 : 0;

    totalUsersEl.textContent = formatNumber(list.length);
    yourRankEl.textContent = myRank ? `#${myRank}` : "—";

    if (me) {
        displayName.value = me.name || "";
        applyAvatar(profileAvatar, me);
        profileSub.textContent = me.id === "guest"
            ? "Đang dùng với tư cách khách (chưa đăng nhập YouTube)"
            : `Đã hoạt động ${formatNumber((me.days || []).length)} ngày · ${formatLastActive(me.lastActive)}`;
    }

    renderPodium(list);
    renderBoard(list);
}

function previewData() {
    const now = Date.now();
    return {
        adsBlocked: 860,
        sessionAds: 12,
        dailyGoal: 50,
        statsBreakdown: { video: 120, banner: 640, overlay: 70, antiAdblock: 30 },
        userStats: {
            currentId: "yt_demo",
            users: {
                yt_demo: { id: "yt_demo", name: "Bạn", avatar: "", adsBlocked: 860, lastActive: now - 120000, days: ["1", "2", "3", "4", "5"] },
                yt_a: { id: "yt_a", name: "Minh Anh", avatar: "", adsBlocked: 1240, lastActive: now - 3600000, days: ["1", "2", "3", "4", "5", "6", "7"] },
                yt_b: { id: "yt_b", name: "Hoàng", avatar: "", adsBlocked: 540, lastActive: now - 86400000, days: ["1", "2"] },
                guest: { id: "guest", name: "Khách", avatar: "", adsBlocked: 90, lastActive: now - 7200000, days: ["1"] },
            },
        },
    };
}

function loadStats() {
    if (new URLSearchParams(location.search).has("preview")) {
        render(previewData());
        return;
    }
    if (!chrome?.storage?.local) {
        podiumEl.innerHTML = '<p class="empty-copy">Hãy mở trang này từ nút trong popup của extension.</p>';
        return;
    }
    chrome.storage.local.get(["userStats", "adsBlocked", "statsBreakdown", "dailyGoal"], (result) => {
        if (chrome.storage.session) {
            chrome.storage.session.get(["sessionAds"], (session) => {
                render({ ...result, sessionAds: session.sessionAds || 0 });
            });
            return;
        }
        render(result);
    });
}

saveNameBtn.addEventListener("click", () => {
    const name = displayName.value.trim().slice(0, 24);
    if (!name) {
        showToast("Nhập tên hiển thị");
        return;
    }
    if (avatarFallback) avatarFallback.textContent = initialFromName(name);
    patchCurrentUser({ name }, "Đã lưu tên hiển thị");
});

profileAvatar.addEventListener("click", () => avatarFile.click());

avatarFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
        const dataUrl = await compressAvatar(file);
        profileAvatar.style.backgroundImage = `url("${dataUrl}")`;
        if (avatarFallback) avatarFallback.textContent = "";
        patchCurrentUser({ customAvatar: dataUrl }, "Đã đổi ảnh đại diện");
    } catch (error) {
        showToast(error.message || "Không đổi được ảnh");
    }
});

refreshBtn.addEventListener("click", () => {
    loadStats();
    showToast("Đã làm mới bảng xếp hạng");
});

resetStatsBtn.addEventListener("click", () => resetModal.classList.add("show"));
cancelResetBtn.addEventListener("click", () => resetModal.classList.remove("show"));
resetModal.addEventListener("click", (e) => {
    if (e.target === resetModal) resetModal.classList.remove("show");
});

confirmResetBtn.addEventListener("click", () => {
    if (!chrome?.storage?.local) {
        resetModal.classList.remove("show");
        return;
    }
    chrome.storage.local.get(["userStats"], (result) => {
        const userStats = result.userStats || { currentId: "guest", users: {} };
        Object.values(userStats.users || {}).forEach((user) => {
            user.adsBlocked = 0;
            user.days = [];
        });
        chrome.storage.local.set({
            adsBlocked: 0,
            statsBreakdown: { video: 0, banner: 0, overlay: 0, antiAdblock: 0, spotify: 0 },
            statsHistory: [],
            userStats,
        }, () => {
            if (chrome.storage.session) chrome.storage.session.set({ sessionAds: 0 });
            resetModal.classList.remove("show");
            showToast("Đã đặt lại thống kê");
            loadStats();
        });
    });
});

if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && (changes.userStats || changes.adsBlocked || changes.statsBreakdown || changes.dailyGoal)) {
            loadStats();
        }
        if (area === "session" && changes.sessionAds) loadStats();
    });
}

loadStats();
