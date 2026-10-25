// FUNNYGAME — Key authentic có chữ ký số.
// Máy chủ ký hạn dùng bằng khóa RSA riêng (chỉ nằm trên Google Apps Script).
// Extension kiểm tra bằng khóa công khai bên dưới → sửa chrome.storage bằng DevTools KHÔNG mở khóa được.
const FunnyLicense = (() => {
    const SCRIPT_URL =
        "https://script.google.com/macros/s/AKfycbxaF75rDeLDET5E75ePiOwVzVSM0q6eiG5S4MkdBnfDGuHc80oZBmxSySAmVsoDFFR9/exec";

    const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoe1Q3pLMTRGBV0+3g11S
aNYN/AvPhowJ6U1r02ZsCd9yec35bcQm+DfigdoTDcCItUx8MQYyZMNeJcBsb0nr
zK2NkSVp5D9xw3d1BA9ydC9WaCM25rJMME8wcbG1aN6lZRh2EMxlvi9sPdF4lkpE
+YwZbtoYFVp7xyvU6HeOeyjnM/hzok7C4GtbKr1f9TddHdRSgDs1UMT/OF6COWDt
KWUXR2NkIps4LocAtchdz3VneZk/jan4JqChl2rXXfLmzZPeAwpIbETizXltHWdi
Ef1EnfCZL6xoGl6HS7Vs9bnoo8E6655WEvHSJLTN8maQYF4XFZ+YMl+JS6s4CdGK
OwIDAQAB
-----END PUBLIC KEY-----`;

    const STORAGE_KEYS = ["licenseValid", "licenseExpires", "licenseKey", "licenseToken", "licenseSig"];

    // ---------- Ngày ----------
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
        if (day.getFullYear() >= 9999) return "Không giới hạn thời gian";
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

    // ---------- Mã hoá ----------
    function b64urlToBytes(s) {
        let t = String(s || "").replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
        while (t.length % 4) t += "=";
        const bin = atob(t);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    async function sha256Hex(text) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    const keyCache = new Map();
    function importPublicKey(pem) {
        if (keyCache.has(pem)) return keyCache.get(pem);
        const der = b64urlToBytes(pem.replace(/-----[^-]+-----/g, ""));
        const p = crypto.subtle.importKey("spki", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
        keyCache.set(pem, p);
        return p;
    }

    /**
     * Kiểm tra token đã ký. Hàm thuần — không đọc storage.
     * token = base64url(JSON {v, k, exp, iat}); sig = base64url(RSA-SHA256(token))
     * @returns {Promise<{ok:boolean, exp?:string, reason?:string}>}
     */
    async function checkToken(key, token, sig, publicKeyPem) {
        try {
            if (!key || !token || !sig) return { ok: false, reason: "missing" };
            const pub = await importPublicKey(publicKeyPem || PUBLIC_KEY_PEM);
            const valid = await crypto.subtle.verify(
                { name: "RSASSA-PKCS1-v1_5" }, pub, b64urlToBytes(sig), new TextEncoder().encode(token)
            );
            if (!valid) return { ok: false, reason: "signature" };
            const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(token)));
            if (!payload || payload.v !== 1) return { ok: false, reason: "version" };
            const expectK = (await sha256Hex(normalizeKey(key))).slice(0, 32);
            if (payload.k !== expectK) return { ok: false, reason: "key" };
            const exp = String(payload.exp || "");
            if (!isStillValid(exp)) return { ok: false, reason: "expired", exp };
            return { ok: true, exp };
        } catch {
            return { ok: false, reason: "error" };
        }
    }

    // Kết quả xác thực được nhớ theo nội dung token → không tốn CPU khi gọi liên tục
    let memo = { sig: "", key: "", day: "", result: null };
    async function verifyStored(st) {
        const day = today().toISOString();
        if (memo.result && memo.sig === st.licenseSig && memo.key === st.licenseKey && memo.day === day) {
            return memo.result;
        }
        const result = await checkToken(st.licenseKey, st.licenseToken, st.licenseSig);
        memo = { sig: st.licenseSig, key: st.licenseKey, day, result };
        return result;
    }

    async function load() {
        const st = await chrome.storage.local.get(STORAGE_KEYS);
        const r = await verifyStored(st);
        return {
            ok: r.ok,
            key: st.licenseKey || "",
            expires: r.exp || st.licenseExpires || "",
            label: r.ok ? formatExpiry(r.exp) : "",
            hasToken: !!(st.licenseToken && st.licenseSig),
        };
    }

    async function saveSigned(key, token, sig, exp) {
        await chrome.storage.local.set({
            licenseValid: true,
            licenseKey: key,
            licenseExpires: exp,
            licenseToken: token,
            licenseSig: sig,
        });
    }

    async function clear() {
        await chrome.storage.local.set({ licenseValid: false, licenseToken: "", licenseSig: "" });
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
        return JSON.parse(text.slice(start, end + 1));
    }

    async function acceptServerReply(rawKey, data) {
        if (!data || !data.ok) return { ok: false, message: (data && data.message) || "Key authentic không đúng." };
        if (!data.token || !data.sig) {
            return { ok: false, message: "Máy chủ key chưa được cập nhật (thiếu chữ ký). Liên hệ người bán." };
        }
        const r = await checkToken(rawKey, data.token, data.sig);
        if (!r.ok) {
            return { ok: false, message: r.reason === "expired" ? "Key đã hết hạn." : "Chữ ký key không hợp lệ." };
        }
        await saveSigned(String(rawKey).trim().toUpperCase(), data.token, data.sig, r.exp);
        return { ok: true, expires: r.exp, label: formatExpiry(r.exp) };
    }

    async function activate(rawKey) {
        const key = normalizeKey(rawKey);
        if (key.length < 8) return { ok: false, message: "Key authentic quá ngắn." };
        try {
            return await acceptServerReply(rawKey, await callServer("activate", key));
        } catch {
            return { ok: false, message: "Không kết nối được máy chủ key. Cần Internet." };
        }
    }

    async function recheck() {
        const st = await chrome.storage.local.get(STORAGE_KEYS);
        if (!st.licenseKey) {
            await clear();
            return { ok: false };
        }
        let data;
        try {
            data = await callServer("check", normalizeKey(st.licenseKey));
        } catch {
            return load(); // mất mạng → giữ token đã ký (vẫn còn hạn thì vẫn chạy)
        }
        if (data && data.ok === false) {
            await clear();
            return { ok: false, message: data.message || "Key đã hết hạn." };
        }
        const r = await acceptServerReply(st.licenseKey, data);
        return r.ok ? r : load();
    }

    return { load, activate, recheck, verifyStored, checkToken, isStillValid, formatExpiry, normalizeKey, clear };
})();
