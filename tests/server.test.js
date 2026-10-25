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

function makeGas(rows, props) {
    const sheet = {
        getSheetId: () => 1159168714,
        getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
        getRange: (r, c) => ({
            setValue: (v) => { while (rows.length < r) rows.push([]); rows[r - 1][c - 1] = v; },
            setNumberFormat: () => {},
        }),
    };
    const ctx = {
        console,
        Logger: { log: () => {} },
        LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
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
            newBlob: (s) => ({ getBytes: () => toSigned(Buffer.from(s, "utf8")) }),
            base64EncodeWebSafe: (bytes) => fromSigned(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
            computeDigest: (alg, text) => toSigned(crypto.createHash("sha256").update(text, "utf8").digest()),
            computeRsaSha256Signature: (value, pem) => toSigned(crypto.sign("sha256", Buffer.from(value, "utf8"), pem)),
        },
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(root, "server", "Code.gs"), "utf8"), ctx);
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
