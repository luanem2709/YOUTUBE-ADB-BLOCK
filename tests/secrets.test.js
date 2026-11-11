// Quét bí mật trong các file đang được git theo dõi (chạy trong `npm test` và CI).
// Mục tiêu (Giai đoạn 0): không còn khoá riêng, token, key cấp phép thật, hash key, hay link xuất CSV công khai
// của Google Sheet trong mã nguồn. Key giả chỉ được phép nằm trong allowlist rõ ràng bên dưới.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const results = [];
const check = (name, cond, extra) => results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : ""));

// Danh sách file đang theo dõi (ưu tiên git; nếu không có git thì duyệt thư mục, bỏ thư mục sinh ra)
function listFiles() {
    try {
        const out = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
        return out.split("\0").filter(Boolean);
    } catch {
        const skip = new Set([".git", "node_modules", "dist", "build", "release"]);
        const acc = [];
        (function walk(dir) {
            for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
                if (skip.has(e.name)) continue;
                const rel = dir ? dir + "/" + e.name : e.name;
                if (e.isDirectory()) walk(rel); else acc.push(rel);
            }
        })("");
        return acc;
    }
}

const BINARY = /\.(png|gif|jpg|jpeg|ico|ipa|crx|zip|exe|woff2?|ttf)$/i;
const files = listFiles().filter((f) => !BINARY.test(f) && fs.existsSync(path.join(root, f)));
const text = new Map();
for (const f of files) {
    // Chuẩn hoá CRLF → LF để kết quả giống nhau trên Windows (autocrlf) và Linux (CI)
    try { text.set(f, fs.readFileSync(path.join(root, f), "utf8").replace(/\r\n/g, "\n")); } catch { /* bỏ qua file không đọc được */ }
}

// Chuỗi nhạy cảm được ghép lúc chạy để chính file test này không khớp mẫu quét
const PEM = new RegExp("-----BEGIN (?:[A-Z]+ )?" + "PRIVATE KEY-----");
const TOKENS = [
    new RegExp("gh[pousr]_[A-Za-z0-9]{30,}"),
    new RegExp("github_pat_[A-Za-z0-9_]{30,}"),
    new RegExp("AIza[0-9A-Za-z_-]{35}"),
    new RegExp("AKIA[0-9A-Z]{16}"),
];
// Key cấp phép có dạng FG-XXXX-XXXX-XXXX; chỉ cho phép key giả (TEST/DEMO) và ô gợi ý FG-XXXX-XXXX-XXXX
const KEY_RE = /\bFG-[A-Z0-9]{3,6}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/g;
const FAKE_KEY_OK = /^FG-(?:(?:TEST|DEMO)-[A-Z0-9]{4}-[A-Z0-9]{4}|X{3,6}-X{4}-X{4})$/;
// Link xuất CSV của Google Sheet (sheet công khai đọc được toàn bộ key)
const SHEET_EXPORT = /docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/(?:export|gviz)/;

function scan(re, only) {
    const hits = [];
    for (const [f, t] of text) {
        if (only && !only(f)) continue;
        if (re.test(t)) hits.push(f);
    }
    return hits;
}

const pem = scan(PEM);
check("K1 khong co khoa rieng (PRIVATE KEY) trong file duoc theo doi", pem.length === 0, pem.join(", "));

const tok = [];
for (const re of TOKENS) tok.push(...scan(re));
check("K2 khong co token GitHub/Google/AWS trong file duoc theo doi", tok.length === 0, [...new Set(tok)].join(", "));

// Key giả của test nằm trong tests/ (fixture); phần còn lại của dự án phải sạch
const realKeys = [];
for (const [f, t] of text) {
    if (f.startsWith("tests/")) continue;
    const m = t.match(KEY_RE);
    if (!m) continue;
    for (const k of new Set(m)) if (!FAKE_KEY_OK.test(k)) realKeys.push(f + ":" + k.slice(0, 8) + "…");
}
check("K3 khong co key cap phep that (chi cho phep key gia FG-TEST-/FG-DEMO-) ngoai tests/", realKeys.length === 0, realKeys.join(", "));

const sheet = scan(SHEET_EXPORT, (f) => f !== "CHANGELOG.md");
check("K4 khong con link xuat CSV cong khai cua Google Sheet trong ma nguon", sheet.length === 0, sheet.join(", "));

const tracked = new Set(files);
check("K5 keys.csv (danh sach key that) khong duoc theo doi trong git", !tracked.has("installer/google-apps-script/keys.csv"));

const prog = text.get("installer/Program.cs") || "";
check("K6 installer khong con bang hash key cung (LocalHashes) hay duong doc CSV cong khai", !/LocalHashes/.test(prog) && !/SheetCsvUrl|FetchSheetKeysAsync/.test(prog), "Program.cs");

check("K7 .gitignore che keys.csv, *.pem, build/", (() => {
    const g = text.get(".gitignore") || "";
    return /keys\.csv/.test(g) && /\*\.pem/.test(g) && /^build\/$/m.test(g);
})());

console.log(results.join("\n"));
process.exitCode = results.some((x) => x.startsWith("FAIL")) ? 1 : 0;
