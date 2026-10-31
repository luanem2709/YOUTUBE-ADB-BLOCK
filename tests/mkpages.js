// Sinh tests/stats.test.html + tests/options.test.html tu HTML goc: mock chrome API + script kiem tra.
// node tests/mkpages.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const MOCK_COMMON = `
    const _store = {
        enabled: true,
        adsBlocked: 42,
        dailyGoal: 50,
        statsBreakdown: { video: 10, banner: 20, overlay: 5, antiAdblock: 3, shopping: 6, spotify: 4 },
        statsHistory: [{ date: "x", count: 5 }],
        whitelistChannels: ["yt_channel_abc"],
        settings: {
            blockVideo: true, blockBanner: true, blockOverlay: true,
            blockAntiAdblock: true, blockShopping: true, muteAds: true, fastSkip: true,
            blockSpotify: true, backgroundPlay: true, pipButton: true,
            hideUpsell: true, videoQuality: "auto", sponsorBlock: true,
            jumpAhead: true, ambientGlow: true, customLogo: true,
        },
        userStats: {
            currentId: "u1",
            users: {
                u1: { id: "u1", name: "Nguyen A", avatar: "", adsBlocked: 42, lastActive: Date.now(), days: ["1"] },
                u2: { id: "u2", name: "Tran B", avatar: "", adsBlocked: 10, lastActive: Date.now(), days: ["1"] },
            },
        },
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
            getURL: (p) => "/" + p,
            openOptionsPage: () => { },
        },
        tabs: { query: (q, cb) => cb([]), create: (o, cb) => { if (cb) cb({ id: 1 }); } },
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
    const results = [];
    window.__FG_RESULTS__ = results;
    const __out = () => { const el = document.getElementById("out"); if (el) el.textContent = results.join("\\n"); };
    window.addEventListener("error", (e) => { results.push("FAIL runtime error: " + e.message + " @" + e.lineno); __out(); });
    window.addEventListener("unhandledrejection", (e) => { results.push("FAIL unhandled rejection: " + (e.reason && e.reason.message || e.reason)); __out(); });
`;

const HARNESS = `
    <pre id="out">RUNNING</pre>
    <script>
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    function check(name, cond, extra) { results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : "")); }
    const hasRuntimeErr = () => results.some((r) => r.startsWith("FAIL runtime") || r.startsWith("FAIL unhandled"));
    </script>
`;

// ---------------- STATS ----------------
const STATS_RUN = `
    <script>
    (async () => {
        try {
            await sleep(1000);
            check("S1 stats khoi dong khong loi", !hasRuntimeErr(),
                results.filter((r) => r.startsWith("FAIL runtime") || r.startsWith("FAIL unhandled")).join(" / "));

            const blocked = document.getElementById("adsBlockedCount").textContent.trim();
            check("S2 hien thi tong so QC da chan", blocked === "42", "text=" + blocked);

            const total = document.getElementById("totalUsers").textContent.trim();
            check("S3 hien thi tong so nguoi dung", total === "2", "text=" + total);

            // Bang xep hang co render
            const board = document.getElementById("rankBoard");
            check("S4 bang xep hang co du lieu", board && board.children.length > 0, "children=" + (board ? board.children.length : -1));

            // XSS: ten nguoi dung chua bien phai duoc gan bang textContent
            const names = Array.from(document.querySelectorAll("#rankBoard *")).map((n) => n.textContent).join("|");
            check("S5 ten nguoi dung hiển thị đúng", names.includes("Nguyen A"), "co=" + names.includes("Nguyen A"));

            // Do lai thong ke
            document.getElementById("resetStatsBtn").click();
            await sleep(150);
            document.getElementById("confirmResetBtn").click();
            await sleep(600);
            check("S6 dat lai thong ke khong nem loi", !hasRuntimeErr());
            check("S7 dat lai -> adsBlocked = 0", _store.adsBlocked === 0, "adsBlocked=" + _store.adsBlocked);

            document.getElementById("out").textContent = results.join("\\n");
        } catch (e) {
            results.push("FAIL exception: " + (e && e.stack || e));
            document.getElementById("out").textContent = results.join("\\n");
        }
    })();
    </script>
`;

// ---------------- OPTIONS ----------------
const OPTIONS_RUN = `
    <script>
    (async () => {
        try {
            await sleep(1000);
            check("O1 options khoi dong khong loi", !hasRuntimeErr(),
                results.filter((r) => r.startsWith("FAIL runtime") || r.startsWith("FAIL unhandled")).join(" / "));

            const goal = document.getElementById("dailyGoal").value;
            check("O2 nap dailyGoal tu storage", goal === "50", "value=" + goal);

            const wl = document.getElementById("whitelistChannels").value;
            check("O3 nap danh sach whitelist", String(wl).includes("yt_channel_abc"), "value=" + wl);

            // Luu thay doi
            document.getElementById("dailyGoal").value = "99";
            document.getElementById("whitelistChannels").value = "yt_new_channel";
            document.getElementById("saveBtn").click();
            await sleep(400);
            check("O4 luu dailyGoal moi", _store.dailyGoal === 99, "dailyGoal=" + _store.dailyGoal);
            check("O5 luu whitelist moi", Array.isArray(_store.whitelistChannels) && _store.whitelistChannels.includes("yt_new_channel"),
                JSON.stringify(_store.whitelistChannels));

            // KHONG test exportBtn: a.click() tao file download → Chrome headless bi treo.
            // Logic export chi doc storage roi ghi JSON, da duoc review tay.

            document.getElementById("out").textContent = results.join("\\n");
        } catch (e) {
            results.push("FAIL exception: " + (e && e.stack || e));
            document.getElementById("out").textContent = results.join("\\n");
        }
    })();
    </script>
`;

function build(srcFile, outFile, runScript, scriptFiles) {
    let html = fs.readFileSync(path.join(root, srcFile), "utf8");
    // Bo license.js (lexical binding che mo mock)
    html = html.replace(/<script src="license\.js"><\/script>/g, "");
    // Chuyen duong dan tuong doi sang tuyet doi
    html = html
        .replace(/src="\.\/images\//g, 'src="/images/')
        .replace(/src="images\//g, 'src="/images/');
    for (const sf of scriptFiles) {
        html = html.replace(new RegExp('src="' + sf.replace(/\./g, "\\.") + '"'), 'src="/' + sf + '"');
    }
    const marker = '<script src="/' + scriptFiles[scriptFiles.length - 1] + '"></script>';
    if (!html.includes(marker)) throw new Error("khong tim thay " + marker + " trong " + srcFile);
    html = html.replace(marker, "<script>\n" + MOCK_COMMON + "\n</script>\n" + HARNESS + "\n" + marker);
    html = html.replace("</body>", runScript + "\n</body>");
    fs.writeFileSync(path.join(__dirname, outFile), html, "utf8");
    console.log("Da sinh tests/" + outFile);
}

build("stats.html", "stats.test.html", STATS_RUN, ["stats.js"]);
build("options.html", "options.test.html", OPTIONS_RUN, ["options.js"]);
