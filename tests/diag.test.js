// Kiểm tra tĩnh cho nhật ký chẩn đoán iOS: schema hợp lệ, KHÔNG có trường cho phép dữ liệu nhận dạng,
// và Swift/JS/build script khớp nhau (không cần Mac để bắt lỗi lệch giữa hai ngôn ngữ).
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const rd = (f) => fs.readFileSync(path.join(root, f), "utf8").replace(/\r\n/g, "\n");
const results = [];
const check = (name, cond, extra) => results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : ""));

let schema;
try { schema = JSON.parse(rd("ios/diag-schema.json")); } catch (e) { check("G0 diag-schema.json hop le", false, String(e)); }
const events = (schema && schema.events) || {};
const names = Object.keys(events);
check("G0 diag-schema.json hop le va co su kien", names.length >= 10, names.length + " su kien");

// ---- Cấu trúc schema ----
let structOk = true;
const problems = [];
for (const [n, def] of Object.entries(events)) {
    if (!/^[a-z][a-z0-9_]{2,30}$/.test(n)) { structOk = false; problems.push("ten " + n); }
    if (def.src !== "swift" && def.src !== "js") { structOk = false; problems.push(n + ".src"); }
    for (const [k, r] of Object.entries(def.fields || {})) {
        if (!/^[a-z][a-z0-9_]{0,24}$/.test(k)) { structOk = false; problems.push(n + "." + k); }
        if (r.t === "enum") { if (!Array.isArray(r.v) || !r.v.length || !r.v.every((s) => /^[A-Za-z0-9_]{1,16}$/.test(s))) { structOk = false; problems.push(n + "." + k + " enum"); } }
        else if (r.t === "int") { if (!Number.isInteger(r.min) || !Number.isInteger(r.max) || r.min > r.max) { structOk = false; problems.push(n + "." + k + " int"); } }
        else if (r.t === "bool") { /* ok */ }
        else if (r.t === "pattern") { if (typeof r.re !== "string" || !r.re.startsWith("^") || !r.re.endsWith("$")) { structOk = false; problems.push(n + "." + k + " pattern khong neo"); } else { try { new RegExp(r.re); } catch { structOk = false; problems.push(n + "." + k + " regex loi"); } } }
        else { structOk = false; problems.push(n + "." + k + " kieu la " + r.t); }
    }
}
check("G1 moi su kien/truong dung dinh dang va chi dung kieu enum|int|bool|pattern (khong co van ban tu do)", structOk, problems.join(", "));

// ---- Không thể ghi dữ liệu nhận dạng: mọi mẫu/enum phải TỪ CHỐI các chuỗi nhạy cảm ----
const SENSITIVE = [
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ", "FG-ABCD-EFGH-JKMN", "someone@example.com",
    "192.168.1.20", "10.0.0.1.5", "E621E1F8-C36C-495A-93FC-0C247A3E6E5F", "iPhone14,5", "Nguyen Van A", "watch?v=abc",
];
let leaks = [];
for (const [n, def] of Object.entries(events)) {
    for (const [k, r] of Object.entries(def.fields || {})) {
        if (r.t === "pattern") {
            const re = new RegExp(r.re);
            for (const s of SENSITIVE) if (re.test(s)) leaks.push(n + "." + k + " nhan '" + s + "'");
        } else if (r.t === "enum") {
            for (const s of SENSITIVE) if (r.v.includes(s)) leaks.push(n + "." + k + " enum chua '" + s + "'");
        }
    }
}
check("G2 khong truong nao chap nhan URL / ma video / key / email / IP / UUID / model may / ten", leaks.length === 0, leaks.join("; "));

const intFields = [];
for (const [n, def] of Object.entries(events)) for (const [k, r] of Object.entries(def.fields || {})) if (r.t === "int") intFields.push(n + "." + k + "[" + r.min + ".." + r.max + "]");
check("G3 truong so nguyen deu co khoang gioi han nho (khong the nhoi ma dinh danh dai)", Object.values(events).every((d) => Object.values(d.fields || {}).every((r) => r.t !== "int" || (r.max - r.min) <= 200000)), intFields.join(" "));

const lim = (schema && schema.limits) || {};
check("G4 gioi han nhat ky hop ly (<=200 muc, <=64KB, <=512B/su kien, <=6/phut)", lim.maxEntries <= 200 && lim.maxBytes <= 65536 && lim.maxEventBytes <= 512 && lim.perEventPerMinute <= 6, JSON.stringify(lim));

// ---- Khớp Swift <-> JS <-> schema ----
const swift = rd("ios/ViewController.swift");
const diagJs = rd("ios/diag.js");
const swiftEvents = [...swift.matchAll(/DiagLog\.shared\.record\("([a-z_]+)"/g)].map((m) => m[1]);
const jsEvents = [...diagJs.matchAll(/emit\("([a-z_]+)"/g)].map((m) => m[1]);
const badSwift = [...new Set(swiftEvents)].filter((e) => !events[e] || events[e].src !== "swift");
const badJs = [...new Set(jsEvents)].filter((e) => !events[e] || events[e].src !== "js");
check("G5 moi su kien Swift ghi deu co trong schema voi src=swift", swiftEvents.length > 0 && badSwift.length === 0, badSwift.join(", "));
check("G6 moi su kien JS phat deu co trong schema voi src=js", jsEvents.length > 0 && badJs.length === 0, badJs.join(", "));
const orphan = names.filter((n) => events[n].src === "swift" ? !swiftEvents.includes(n) : !jsEvents.includes(n));
check("G7 khong co su kien nao trong schema ma khong ai phat", orphan.length === 0, orphan.join(", "));

// ---- Kiểm soát nguồn tin nhắn trong Swift ----
function caseBody(name) {
    const i = swift.indexOf('case "' + name + '":');
    if (i < 0) return "";
    const j = swift.indexOf('\n        case "', i + 5);
    return swift.slice(i, j < 0 ? i + 800 : j);
}
const diagBody = caseBody("diag");
check("G8 tin 'diag' tu trang chi nhan neu la khung chinh + web tab + host YouTube/Spotify", /isMainFrame/.test(diagBody) && /isTabWebView/.test(diagBody) && /isAllowedDiagHost/.test(diagBody), diagBody ? "" : "khong thay case diag");
const panelActions = ["diagStatus", "diagExport", "diagClear", "diagSetEnabled"];
const missing = panelActions.filter((a) => !/isPanelMessage\(message\)/.test(caseBody(a)));
check("G9 cac lenh xuat/xoa/bat-tat/trang thai chi nhan tu bang dieu khien (isPanelMessage)", missing.length === 0, missing.join(", "));
check("G10 DiagLog xac thuc theo schema va co gioi han tan suat", /fromJS/.test(swift) && /perEventPerMinute|perMinute/.test(swift) && /maxEventBytes/.test(swift));
check("G11 nhat ky khong tu gui di dau (khong URLSession/URLRequest trong DiagLog)", (() => {
    const a = swift.indexOf("final class DiagLog");
    const b = swift.indexOf("\n}\n", a);
    const body = swift.slice(a, b);
    return a > 0 && !/URLSession|URLRequest|NSURLConnection|\.upload|fetch\(/.test(body);
})());
check("G12 xuat chan doan co thong bao rieng tu va dung UIActivityViewController (nguoi dung tu chon noi chia se)", /UIActivityViewController/.test(swift) && /Không chứa/.test(swift));

// ---- Build/CI ----
const build = rd("ios/build-ipa.sh");
check("G13 build-ipa.sh dong goi diag.js va diag-schema.json vao app", /diag\.js/.test(build) && /diag-schema\.json/.test(build));
check("G14 Swift nap schema + diag.js va bao gia tri bat/tat cho JS", /diag-schema\.json/.test(swift) && /readResString\("diag\.js"\)/.test(swift) && /__FG_DIAG_SCHEMA__/.test(swift) && /__FG_DIAG_ENABLED__/.test(swift));
const ci = rd(".github/workflows/test.yml");
check("G15 CI kiem tra cu phap ios/chrome-bridge.js, ios/diag.js, mobile/mobile-ui.js", /ios\/chrome-bridge\.js/.test(ci) && /ios\/diag\.js/.test(ci) && /mobile\/mobile-ui\.js/.test(ci));
check("G16 xu ly tien trinh WebContent bi kill + loi dieu huong", /webViewWebContentProcessDidTerminate/.test(swift) && /didFailProvisionalNavigation/.test(swift));

console.log(results.join("\n"));
process.exitCode = results.some((x) => x.startsWith("FAIL")) ? 1 : 0;
