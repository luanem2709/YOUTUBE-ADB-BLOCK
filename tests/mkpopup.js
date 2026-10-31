// Sinh tests/popup.test.html từ popup.html gốc: chèn mock chrome API + script kiểm tra.
// node tests/mkpopup.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
let html = fs.readFileSync(path.join(root, "popup.html"), "utf8");

// BỎ <script src="license.js"> — file đó khai báo `const FunnyLicense` (lexical binding)
// sẽ che mờ mock trên window.FunnyLicense → license.load() fail → initPopup() không chạy.
const licenseTag = '<script src="license.js"></script>';
if (!html.includes(licenseTag)) throw new Error("khong tim thay <script src=license.js>");
html = html.replace(licenseTag, "");

const MOCK = `
    <script>
    // ---- Mock chrome API (hỗ trợ cả callback và Promise) ----
    const _store = {
        enabled: true,
        adsBlocked: 42,
        dailyGoal: 50,
        licenseKey: "FG-TEST-1234-ABCD",
        licenseToken: "tok",
        licenseSig: "sig",
        licenseValid: true,
        licenseExpires: "2099-12-31",
        settings: {
            blockVideo: true, blockBanner: true, blockOverlay: true,
            blockAntiAdblock: true, blockShopping: true, muteAds: true, fastSkip: true,
            blockSpotify: true, backgroundPlay: true, pipButton: true,
            hideUpsell: true, videoQuality: "auto", sponsorBlock: true,
            jumpAhead: true, ambientGlow: true, customLogo: true,
        },
        statsBreakdown: { video: 10, banner: 20, overlay: 5, antiAdblock: 3, shopping: 6, spotify: 4 },
        statsHistory: [],
        userStats: { currentId: "u1", users: { u1: { id: "u1", name: "Test User", avatar: "", adsBlocked: 42, lastActive: Date.now(), days: [] } } },
    };
    const _read = (keys) => {
        const out = {};
        const list = Array.isArray(keys) ? keys : (typeof keys === "string" ? [keys] : Object.keys(_store));
        for (const k of list) if (k in _store) out[k] = _store[k];
        return out;
    };
    window.chrome = {
        storage: {
            local: {
                get: (keys, cb) => {
                    const out = _read(keys);
                    if (typeof cb === "function") { setTimeout(() => cb(out), 0); return; }
                    return Promise.resolve(out);
                },
                set: (obj, cb) => {
                    Object.assign(_store, obj);
                    if (typeof cb === "function") { setTimeout(cb, 0); return; }
                    return Promise.resolve();
                },
            },
            session: {
                get: (k, cb) => {
                    const out = { sessionAds: 7 };
                    if (typeof cb === "function") { setTimeout(() => cb(out), 0); return; }
                    return Promise.resolve(out);
                },
                set: (o, cb) => { if (typeof cb === "function") cb(); else return Promise.resolve(); },
            },
            onChanged: { addListener: () => { } },
        },
        runtime: {
            id: "test",
            getManifest: () => ({ version: "2.4.10" }),
            sendMessage: (m, cb) => { if (cb) cb({ ok: true }); return Promise.resolve({ ok: true }); },
            lastError: null,
            onMessage: { addListener: () => { } },
            openOptionsPage: () => { },
            getURL: (p) => "/" + p,
        },
        tabs: {
            query: (q, cb) => cb([{ id: 1, url: "https://www.youtube.com/watch?v=x", active: true }]),
            sendMessage: (id, m, cb) => { if (cb) cb({}); },
            create: (o, cb) => { if (cb) cb({ id: 2 }); },
            reload: () => { },
        },
        action: { setIcon: () => { }, setBadgeText: () => { } },
    };
    window.FunnyLicense = {
        verifyStored: async () => ({ ok: true, exp: "2099-12-31" }),
        load: async () => ({ ok: true, key: "FG-TEST-1234-ABCD", expires: "2099-12-31", label: "Không giới hạn", hasToken: true }),
        recheck: async () => ({ ok: true }),
        activate: async () => ({ ok: true }),
        clear: async () => { },
        isStillValid: () => true,
        formatExpiry: () => "Không giới hạn thời gian",
        normalizeKey: (k) => String(k || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    };

    // Bắt lỗi runtime — phải đăng ký TRƯỚC khi popup.js chạy
    const results = [];
    window.__FG_RESULTS__ = results;
    const __out = () => { const el = document.getElementById("out"); if (el) el.textContent = results.join("\\n"); };
    window.addEventListener("error", (e) => { results.push("FAIL runtime error: " + e.message + " @" + e.lineno); __out(); });
    window.addEventListener("unhandledrejection", (e) => { results.push("FAIL unhandled rejection: " + (e.reason && e.reason.message || e.reason)); __out(); });
    </script>
`;

const TEST = `
    <pre id="out">RUNNING</pre>
    <script>
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    function check(name, cond, extra) { results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : "")); }
    const hasRuntimeErr = () => results.some((r) => r.startsWith("FAIL runtime") || r.startsWith("FAIL unhandled"));
    </script>
`;

const RUN = `
    <script>
    (async () => {
        try {
            await sleep(1200);

            check("P1 popup khoi dong khong loi", !hasRuntimeErr(),
                results.filter((r) => r.startsWith("FAIL runtime") || r.startsWith("FAIL unhandled")).join(" / "));

            const blocked = document.getElementById("adsBlockedCount").textContent.trim();
            check("P2 hien thi so QC da chan", blocked === "42", "text=" + blocked);

            const session = document.getElementById("sessionCount").textContent.trim();
            check("P3 hien thi dem phien nay", session === "7", "text=" + session);

            const badge = document.getElementById("versionBadge").textContent.trim();
            check("P4 badge version khop manifest", badge === "v2.4.10", "text=" + badge);

            const tg = document.getElementById("enableToggle");
            check("P5 toggle reflect trang thai dang bat", tg.checked === true);
            tg.checked = false;
            tg.dispatchEvent(new Event("change"));
            await sleep(250);
            check("P6 tat toggle -> luu storage", _store.enabled === false, "enabled=" + _store.enabled);
            tg.checked = true;
            tg.dispatchEvent(new Event("change"));
            await sleep(250);
            check("P7 bat toggle -> luu storage", _store.enabled === true, "enabled=" + _store.enabled);

            document.getElementById("openYoutubeBtn").click();
            document.getElementById("openOptionsBtn").click();
            document.getElementById("openStatsBtn").click();
            await sleep(300);
            check("P8 cac nut dieu khong nem loi", !hasRuntimeErr());

            document.getElementById("resetStatsBtn").click();
            await sleep(150);
            document.getElementById("confirmResetBtn").click();
            await sleep(600);
            check("P9 dat lai thong ke chay xong khong loi", !hasRuntimeErr());
            check("P10 dat lai thong ke -> adsBlocked = 0", _store.adsBlocked === 0, "adsBlocked=" + _store.adsBlocked);
            check("P11 userStats van la struct hop le", !!_store.userStats && !!_store.userStats.users);

            document.getElementById("out").textContent = results.join("\\n");
        } catch (e) {
            results.push("FAIL exception: " + (e && e.stack || e));
            document.getElementById("out").textContent = results.join("\\n");
        }
    })();
    </script>
`;

// Chèn mock + <pre id="out"> NGAY TRƯỚC <script src="popup.js">
const marker = '<script src="popup.js"></script>';
if (!html.includes(marker)) throw new Error("khong tim thay <script src=popup.js>");
html = html.replace(marker, MOCK + "\n" + TEST + "\n" + marker);
html = html.replace("</body>", RUN + "\n</body>");

// Bản test nằm ở /tests/ nên đường dẫn tương đối ("popup.js", "popup.css", "images/...")
// sẽ 404. Đổi sang đường dẫn tuyệt đối từ thư mục gốc.
html = html
    .replace(/src="popup\.js"/g, 'src="/popup.js"')
    .replace(/href="popup\.css"/g, 'href="/popup.css"')
    .replace(/src="\.\/images\//g, 'src="/images/')
    .replace(/src="images\//g, 'src="/images/');

const outPath = path.join(__dirname, "popup.test.html");
fs.writeFileSync(outPath, html, "utf8");
console.log("Da sinh " + outPath);
