const dailyGoalInput = document.getElementById("dailyGoal");
const whitelistInput = document.getElementById("whitelistChannels");
const saveBtn = document.getElementById("saveBtn");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const historyChart = document.getElementById("historyChart");
const toast = document.getElementById("toast");

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
}

function loadOptions() {
    chrome.storage.local.get(
        ["dailyGoal", "whitelistChannels", "statsHistory", "settings", "enabled"],
        (result) => {
            dailyGoalInput.value = result.dailyGoal || 50;
            const list = result.whitelistChannels || [];
            whitelistInput.value = list.join("\n");
            renderHistory(result.statsHistory || []);
        }
    );
}

function renderHistory(history) {
    historyChart.innerHTML = "";
    if (!history.length) {
        historyChart.innerHTML = '<p class="hint" style="margin:0">Chưa có dữ liệu thống kê.</p>';
        return;
    }

    const max = Math.max(...history.map((h) => h.count), 1);

    history.forEach((item) => {
        const wrap = document.createElement("div");
        wrap.className = "bar-wrap";

        const val = document.createElement("div");
        val.className = "bar-val";
        val.textContent = item.count;

        const bar = document.createElement("div");
        bar.className = "bar";
        bar.style.height = Math.max(8, (item.count / max) * 72) + "px";

        const label = document.createElement("div");
        label.className = "bar-label";
        label.textContent = item.date.slice(5);

        wrap.appendChild(val);
        wrap.appendChild(bar);
        wrap.appendChild(label);
        historyChart.appendChild(wrap);
    });
}

function saveOptions() {
    const dailyGoal = Math.min(500, Math.max(10, parseInt(dailyGoalInput.value, 10) || 50));
    const whitelistChannels = whitelistInput.value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

    chrome.storage.local.set({ dailyGoal, whitelistChannels }, () => {
        showToast("Đã lưu cài đặt");
    });
}

exportBtn.addEventListener("click", () => {
    chrome.storage.local.get(null, (data) => {
        const exportData = {
            dailyGoal: data.dailyGoal,
            whitelistChannels: data.whitelistChannels,
            settings: data.settings,
            enabled: data.enabled,
            exportedAt: new Date().toISOString(),
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "funnygame-adblock-settings.json";
        a.click();
        URL.revokeObjectURL(url);
        showToast("Đã xuất file cài đặt");
    });
});

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            const patch = {};
            if (data.dailyGoal) patch.dailyGoal = data.dailyGoal;
            if (data.whitelistChannels) patch.whitelistChannels = data.whitelistChannels;
            if (data.settings) patch.settings = data.settings;
            if (data.enabled !== undefined) patch.enabled = data.enabled;
            chrome.storage.local.set(patch, () => {
                loadOptions();
                showToast("Đã nhập cài đặt");
            });
        } catch {
            showToast("File không hợp lệ");
        }
    };
    reader.readAsText(file);
    importFile.value = "";
});

saveBtn.addEventListener("click", saveOptions);

chrome.storage.onChanged.addListener((changes) => {
    if (changes.statsHistory) renderHistory(changes.statsHistory.newValue || []);
});

loadOptions();
