// Kiểm tra key có chữ ký số (license.js) — chạy bằng Node, mô phỏng đúng cách Code.gs ký.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const results = [];
const check = (name, cond, extra) => results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : ""));

function loadLicense() {
    const code = fs.readFileSync(path.join(root, "license.js"), "utf8");
    const ctx = vm.createContext({ crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, btoa, console });
    vm.runInContext(code + "\n;this.FunnyLicense = FunnyLicense;", ctx);
    return ctx.FunnyLicense;
}

// Giống Utilities.base64EncodeWebSafe của Apps Script (có dấu '=')
const b64web = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
const normalizeKey = (k) => String(k).toUpperCase().replace(/[^A-Z0-9]/g, "");
const sha256Hex = (t) => crypto.createHash("sha256").update(t, "utf8").digest("hex");

function sign(privateKey, key, exp, overrides = {}) {
    const payload = JSON.stringify(Object.assign({ v: 1, k: sha256Hex(normalizeKey(key)).slice(0, 32), exp, iat: Date.now() }, overrides));
    const token = b64web(Buffer.from(payload, "utf8"));
    const sig = b64web(crypto.sign("sha256", Buffer.from(token, "utf8"), privateKey));
    return { token, sig };
}

(async () => {
    const L = loadLicense();
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    const KEY = "FG-ABCD-1234-WXYZ";

    let r = await L.checkToken(KEY, ...Object.values(sign(privateKey, KEY, "2099-12-31")), publicKey);
    check("L1 token hop le -> mo khoa", r.ok && r.exp === "2099-12-31", JSON.stringify(r));

    r = await L.checkToken("fg abcd 1234 wxyz", ...Object.values(sign(privateKey, KEY, "2099-12-31")), publicKey);
    check("L2 key go khac dinh dang (thuong/khoang trang) van khop", r.ok);

    r = await L.checkToken("FG-OTHER-KEY-0000", ...Object.values(sign(privateKey, KEY, "2099-12-31")), publicKey);
    check("L3 dung token cua key khac -> tu choi", !r.ok && r.reason === "key", r.reason);

    r = await L.checkToken(KEY, ...Object.values(sign(privateKey, KEY, "2001-01-01")), publicKey);
    check("L4 het han -> tu choi", !r.ok && r.reason === "expired", r.reason);

    const good = sign(privateKey, KEY, "2001-01-01");
    const forgedPayload = Buffer.from(Buffer.from(good.token.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString().replace("2001-01-01", "2099-12-31"));
    r = await L.checkToken(KEY, b64web(forgedPayload), good.sig, publicKey);
    check("L5 sua han dung trong token -> chu ky sai, tu choi", !r.ok && r.reason === "signature", r.reason);

    r = await L.checkToken(KEY, ...Object.values(sign(other.privateKey, KEY, "2099-12-31")), publicKey);
    check("L6 token ky bang khoa la -> tu choi", !r.ok && r.reason === "signature", r.reason);

    r = await L.checkToken(KEY, "", "", publicKey);
    check("L7 thieu token (chi sua licenseValid=true) -> tu choi", !r.ok);

    r = await L.checkToken(KEY, "rác!!", "rác!!", publicKey);
    check("L8 du lieu rac -> tu choi, khong loi", !r.ok);

    r = await L.checkToken(KEY, ...Object.values(sign(privateKey, KEY, "2099-12-31", { v: 2 })), publicKey);
    check("L9 sai phien ban dinh dang -> tu choi", !r.ok && r.reason === "version", r.reason);

    r = await L.checkToken(KEY, ...Object.values(sign(privateKey, KEY, "9999-12-31")), publicKey);
    check("L10 key vinh vien (9999-12-31)", r.ok && L.formatExpiry(r.exp) === "Không giới hạn thời gian", L.formatExpiry(r.exp || ""));

    // Khóa công khai nhúng trong license.js khớp với khóa riêng trên máy (nếu có — không có trong CI)
    const privPath = path.join(root, "build", "license-private.pem");
    if (fs.existsSync(privPath)) {
        r = await L.checkToken(KEY, ...Object.values(sign(fs.readFileSync(privPath, "utf8"), KEY, "2099-12-31")));
        check("L11 khoa cong khai nhung trong extension khop voi build/license-private.pem", r.ok, JSON.stringify(r));
    }

    // Code.gs phải là JavaScript hợp lệ
    try {
        new vm.Script(fs.readFileSync(path.join(root, "server", "Code.gs"), "utf8"));
        check("L12 server/Code.gs dung cu phap", true);
    } catch (e) {
        check("L12 server/Code.gs dung cu phap", false, e.message);
    }

    console.log(results.join("\n"));
    process.exitCode = results.some((x) => x.startsWith("FAIL")) ? 1 : 0;
})();
