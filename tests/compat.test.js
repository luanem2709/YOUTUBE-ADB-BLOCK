// Cổng tương thích iOS 15.0: fail nếu mã được nạp trên iOS dùng cú pháp/API/CSS mới hơn iOS 15.0
// mà không có dự phòng. Bảng phiên bản là ƯỚC LƯỢNG từ hiểu biết về Safari/WebKit, cần kiểm chứng trên Simulator/thiết bị.
// Cho phép ngoại lệ có chủ ý bằng comment "compat-ok: lý do" trên cùng dòng.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const FLOOR = "iOS 15.0";
const results = [];
const check = (name, cond, extra) => results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : ""));
const rd = (f) => fs.readFileSync(path.join(root, f), "utf8").replace(/\r\n/g, "\n");

// File JS thực sự được nạp trong WebView của app (tiêm bởi ViewController.swift) hoặc trong bảng điều khiển
const JS_FILES = [
    "ios/chrome-bridge.js", "ios/diag.js", "content-main.js", "content.js", "content-yt-net.js",
    "content-spotify-main.js", "content-spotify.js", "license.js", "mobile/mobile-ui.js", "popup.js",
];
const CSS_FILES = ["content.css", "mobile/mobile.css", "popup.css", "mobile/popup-mobile.css"];

// Bỏ comment để không báo nhầm (giữ lại dòng có "compat-ok" để biết ngoại lệ)
function stripJsComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
        .split("\n")
        .map((line) => {
            if (/compat-ok/.test(line)) return "";
            if (/^\s*\/\//.test(line)) return "";
            return line.replace(/(^|\s)\/\/\s.*$/, "$1"); // comment cuối dòng (không đụng "https://")
        })
        .join("\n");
}

// [tên, regex, phiên bản mới nhất hỗ trợ] — mọi thứ >15.0 đều bị cấm (trừ khi có compat-ok)
const JS_TOO_NEW = [
    ["RegExp lookbehind (?<=, (?<!", /\(\?<[=!]/, "16.4"],
    ["class static block", /static\s*\{/, "16.4"],
    ["Array/String .at()", /\.at\(\s*-?\d*\s*\)/, "15.4"],
    ["Object.hasOwn", /Object\.hasOwn\(/, "15.4"],
    ["structuredClone", /structuredClone\(/, "15.4"],
    ["crypto.randomUUID", /crypto\.randomUUID\(/, "15.4"],
    ["findLast / findLastIndex", /\.(findLast|findLastIndex)\(/, "15.4"],
    ["toSorted / toReversed / toSpliced", /\.(toSorted|toReversed|toSpliced)\(/, "16.0"],
    ["AbortSignal.timeout", /AbortSignal\.timeout\(/, "16.0"],
    ["Promise.withResolvers", /Promise\.withResolvers\(/, "17.4"],
    ["Object.groupBy / Map.groupBy", /(Object|Map)\.groupBy\(/, "17.4"],
    ["Array.fromAsync", /Array\.fromAsync\(/, "18.0"],
    ["checkVisibility()", /\.checkVisibility\(/, "17.4"],
    ["Intl.DurationFormat", /Intl\.DurationFormat/, "18.0"],
];
const CSS_TOO_NEW = [
    ["@layer", /@layer\b/, "15.4"],
    ["@container", /@container\b/, "16.0"],
    ["color-mix()", /color-mix\(/, "16.2"],
    ["oklch()/oklab()/lab()/lch()", /\b(oklch|oklab|lab|lch)\(/, "15.4"],
    ["@property", /@property\b/, "16.4"],
    ["subgrid", /subgrid/, "16.0"],
    ["text-wrap", /text-wrap\s*:/, "17.5"],
    ["field-sizing", /field-sizing\s*:/, "18.4"],
];

function lineOf(src, idx) { return src.slice(0, idx).split("\n").length; }

// ---- JS ----
const jsHits = [];
for (const f of JS_FILES) {
    if (!fs.existsSync(path.join(root, f))) continue;
    const src = stripJsComments(rd(f));
    for (const [name, re, ver] of JS_TOO_NEW) {
        const g = new RegExp(re.source, "g");
        let m;
        while ((m = g.exec(src))) jsHits.push(`${f}:${lineOf(src, m.index)} ${name} (iOS ${ver})`);
    }
}
check(`C1 JS duoc nap tren iOS khong dung cu phap/API moi hon ${FLOOR}`, jsHits.length === 0, jsHits.slice(0, 6).join(" | "));

// ---- CSS (file .css + CSS nhúng trong chrome-bridge.js) ----
const bridge = rd("ios/chrome-bridge.js");
const embedded = (bridge.match(/const IOS_EXTRA_CSS = `([\s\S]*?)`;/) || [, ""])[1];
const cssSources = CSS_FILES.filter((f) => fs.existsSync(path.join(root, f))).map((f) => [f, rd(f)]);
cssSources.push(["ios/chrome-bridge.js (IOS_EXTRA_CSS)", embedded]);
check("C2 tim thay CSS nhung trong chrome-bridge.js de kiem tra", embedded.length > 200);

const cssHits = [];
for (const [f, text] of cssSources) {
    const src = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    for (const [name, re, ver] of CSS_TOO_NEW) {
        const g = new RegExp(re.source, "g");
        let m;
        while ((m = g.exec(src))) cssHits.push(`${f}:${lineOf(src, m.index)} ${name} (iOS ${ver})`);
    }
}
check(`C3 CSS khong dung tinh nang moi hon ${FLOOR}`, cssHits.length === 0, cssHits.slice(0, 6).join(" | "));

// Tách các rule: [selectorList, body, startIndex]
function rules(text) {
    const src = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(src))) out.push({ sel: m[1].trim(), body: m[2], index: m.index + m[1].length - m[1].trimStart().length });
    return out;
}
function splitTopLevel(sel) {
    const parts = [];
    let depth = 0, cur = "";
    for (const ch of sel) {
        if (ch === "(" || ch === "[") depth++;
        if (ch === ")" || ch === "]") depth--;
        if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
}

// C4: selector mới (:has, :focus-visible — iOS 15.4) không được nằm chung nhóm với selector khác:
// trình duyệt không hiểu sẽ BỎ CẢ RULE, kéo theo mọi selector cùng nhóm.
const NEW_SEL = /:has\(|:focus-visible/;
const grouped = [];
for (const [f, text] of cssSources) {
    for (const r of rules(text)) {
        if (r.sel.startsWith("@")) continue;
        const parts = splitTopLevel(r.sel);
        if (parts.length > 1 && parts.some((p) => NEW_SEL.test(p)) && parts.some((p) => !NEW_SEL.test(p))) {
            grouped.push(`${f}:${lineOf(text, r.index)} (${parts.length} selector, ${parts.filter((p) => NEW_SEL.test(p)).length} moi)`);
        }
    }
}
check("C4 :has()/:focus-visible nam rieng rule (khong keo theo selector khac tren iOS < 15.4)", grouped.length === 0, grouped.join(" | "));

// C5: đơn vị dvh phải có khai báo vh cùng thuộc tính ngay trước trong cùng rule
const dvhMiss = [];
for (const [f, text] of cssSources) {
    for (const r of rules(text)) {
        const decls = r.body.split(";").map((d) => d.trim()).filter(Boolean);
        decls.forEach((d, i) => {
            const m = d.match(/^([a-z-]+)\s*:\s*(.+)$/i);
            if (!m || !/\d(dvh|svh|lvh)\b/.test(m[2])) return;
            const prop = m[1].toLowerCase();
            const hasFallback = decls.slice(0, i).some((p) => p.toLowerCase().startsWith(prop + ":") && /\dvh\b/.test(p) && !/\d(dvh|svh|lvh)\b/.test(p));
            if (!hasFallback) dvhMiss.push(`${f}:${lineOf(text, r.index)} ${prop}`);
        });
    }
}
check("C5 dvh/svh/lvh luon co khai bao vh du phong (iOS < 15.4)", dvhMiss.length === 0, dvhMiss.join(" | "));

// C6: backdrop-filter không tiền tố chỉ chạy iOS 18+; phải có -webkit-backdrop-filter cùng rule
const bdMiss = [];
for (const [f, text] of cssSources) {
    for (const r of rules(text)) {
        if (/(^|[;\s])backdrop-filter\s*:/.test(r.body) && !/-webkit-backdrop-filter\s*:/.test(r.body)) bdMiss.push(`${f}:${lineOf(text, r.index)}`);
    }
}
check("C6 backdrop-filter luon kem -webkit-backdrop-filter (iOS 15-17)", bdMiss.length === 0, bdMiss.join(" | "));

// C7: sàn triển khai thực tế
const gen = rd("ios/build-ipa.sh");
check("C7 tai lieu/CI khong bao iOS thap hon 15 (Safari Web Extension can iOS 15)", !/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*(1[0-4]|[0-9])(\.|\s|$)/.test(gen));

console.log(results.join("\n"));
process.exitCode = results.some((x) => x.startsWith("FAIL")) ? 1 : 0;
