const FunnyLicense = (() => {
    const SCRIPT_URL =
        "https://script.google.com/macros/s/AKfycbxaF75rDeLDET5E75ePiOwVzVSM0q6eiG5S4MkdBnfDGuHc80oZBmxSySAmVsoDFFR9/exec";

    function today() {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function parseDay(value) {
        if (!value) return null;
        const text = String(value).trim();
        let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
        if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        const d = new Date(text);
        if (Number.isNaN(d.getTime())) return null;
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    function isStillValid(expires) {
        const day = parseDay(expires);
        if (!day) return false;
        return day >= today();
    }

    function formatExpiry(expires) {
        const day = parseDay(expires);
        if (!day) return "";
        const dd = String(day.getDate()).padStart(2, "0");
        const mm = String(day.getMonth() + 1).padStart(2, "0");
        const left = Math.round((day - today()) / 86400000);
        if (left < 0) return "Đã hết hạn " + dd + "/" + mm + "/" + day.getFullYear();
        if (left === 0) return "Hết hạn hôm nay (" + dd + "/" + mm + "/" + day.getFullYear() + ")";
        return "Hết hạn: " + dd + "/" + mm + "/" + day.getFullYear() + "  ·  còn " + left + " ngày";
    }

    function normalizeKey(value) {
        return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    }

    async function load() {
        const st = await chrome.storage.local.get(["licenseValid", "licenseExpires", "licenseKey"]);
        const ok = st.licenseValid === true && isStillValid(st.licenseExpires);
        return {
            ok,
            key: st.licenseKey || "",
            expires: st.licenseExpires || "",
            label: ok ? formatExpiry(st.licenseExpires) : "",
        };
    }

    async function saveOk(key, expires) {
        await chrome.storage.local.set({
            licenseValid: true,
            licenseKey: key,
            licenseExpires: expires,
        });
    }

    async function clear() {
        await chrome.storage.local.set({ licenseValid: false });
    }

    async function callServer(action, key) {
        const url = SCRIPT_URL
            + "?action=" + encodeURIComponent(action)
            + "&key=" + encodeURIComponent(key)
            + "&user=" + encodeURIComponent("chrome-ext");
        const res = await fetch(url, { redirect: "follow" });
        const text = await res.text();
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start < 0 || end <= start) throw new Error("Máy chủ key trả về dữ liệu không hợp lệ.");
        const data = JSON.parse(text.slice(start, end + 1));
        return data;
    }

    async function activate(rawKey) {
        const key = normalizeKey(rawKey);
        if (key.length < 8) return { ok: false, message: "Key authentic quá ngắn." };
        try {
            const data = await callServer("activate", key);
            if (!data.ok) return { ok: false, message: data.message || "Key authentic không đúng." };
            const expires = data.expiresIso || data.expires || "";
            if (expires && !isStillValid(expires)) {
                await clear();
                return { ok: false, message: "Key đã hết hạn." };
            }
            await saveOk(rawKey.trim().toUpperCase(), expires);
            return { ok: true, expires, label: formatExpiry(expires) };
        } catch (err) {
            return { ok: false, message: "Không kết nối được máy chủ key. Cần Internet." };
        }
    }

    async function recheck() {
        const st = await load();
        if (!st.key) {
            await clear();
            return { ok: false };
        }
        if (!isStillValid(st.expires)) {
            await clear();
            return { ok: false, message: "Key đã hết hạn." };
        }
        try {
            const data = await callServer("check", normalizeKey(st.key));
            if (!data.ok) {
                await clear();
                return { ok: false, message: data.message || "Key đã hết hạn." };
            }
            const expires = data.expiresIso || data.expires || st.expires;
            await saveOk(st.key, expires);
            return { ok: true, expires, label: formatExpiry(expires) };
        } catch {
            return st;
        }
    }

    return { load, activate, recheck, isStillValid, formatExpiry, clear };
})();
