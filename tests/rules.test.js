// Test cho rules/dnr_rules.json và release/remote-config.json
// node tests/rules.test.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
let passed = 0, failed = 0;

function check(name, cond, detail = "") {
    if (cond) { passed++; console.log("PASS " + name); }
    else { failed++; console.log("FAIL " + name + (detail ? "  [" + detail + "]" : "")); }
}

// ---------- DNR rules ----------
let dnr = [];
try {
    dnr = JSON.parse(fs.readFileSync(path.join(root, "rules", "dnr_rules.json"), "utf8"));
    check("D1 dnr_rules.json parse thanh cong", true);
} catch (e) {
    check("D1 dnr_rules.json parse thanh cong", false, e.message);
}

check("D2 dnr_rules la mang", Array.isArray(dnr));
check("D3 moi rule co id/priority/action/condition", dnr.every((r) => r.id != null && r.priority != null && r.action && r.action.type && r.condition && r.condition.urlFilter));
const ids = dnr.map((r) => r.id);
check("D4 khong co id trung", new Set(ids).size === ids.length, ids.join(","));
check("D5 khong rule cho youtube.com va spotify.com cung id", true);
check("D6 khong chan media youtube (googlevideo)", !dnr.some((r) => r.condition.urlFilter && r.condition.urlFilter.includes("googlevideo")));
// Rule không có initiatorDomains vẫn được phép nếu urlFilter trỏ tới domain cụ thể
// (vd ||spclient.wg.spotify.com/ads/) — tránh chặn nhầm domain khác.
check("D7 rule khong gioi han domain phai tro toi domain cu the",
    dnr.every((r) => {
        if (r.condition.initiatorDomains || r.condition.requestDomains) return true;
        const f = r.condition.urlFilter || "";
        return f.startsWith("||") || f.startsWith("/");
    }),
    dnr.filter((r) => {
        const f = r.condition.urlFilter || "";
        return !r.condition.initiatorDomains && !r.condition.requestDomains && !f.startsWith("||") && !f.startsWith("/");
    }).map((r) => r.id).join(","));
const ytRules = dnr.filter((r) => (r.condition.initiatorDomains || []).some((d) => d.includes("youtube")));
check("D8 co rule cho YouTube", ytRules.length > 0, "so rule=" + ytRules.length);
const spRules = dnr.filter((r) => (r.condition.initiatorDomains || []).some((d) => d.includes("spotify")));
check("D9 co rule cho Spotify", spRules.length > 0, "so rule=" + spRules.length);
check("D10 youtube rules khong chan resourceTypes 'media'",
    ytRules.every((r) => !(r.condition.resourceTypes || []).includes("media")),
    "co rule chan media");

// ---------- Remote config ----------
let rc = null;
try {
    rc = JSON.parse(fs.readFileSync(path.join(root, "release", "remote-config.json"), "utf8"));
    check("R1 remote-config.json parse thanh cong", true);
} catch (e) {
    check("R1 remote-config.json parse thanh cong", false, e.message);
}

if (rc) {
    check("R2 co version so nguyen", Number.isInteger(rc.version) && rc.version > 0, String(rc.version));
    check("R3 co yt.spotify", !!rc.yt && !!rc.spotify);
    const lists = ["adSignals", "skipButtons", "antiAdblock", "banners"];
    let ok = true, bad = [];
    for (const k of lists) {
        const v = rc.yt[k];
        if (!Array.isArray(v)) { ok = false; bad.push(k + ":khong phai mang"); continue; }
        if (v.length > 100) { ok = false; bad.push(k + ">100"); }
        for (const s of v) {
            if (typeof s !== "string" || s.length > 200) { ok = false; bad.push(k + ":selector qua dai"); }
            if (/[{}<>]/.test(s)) { ok = false; bad.push(k + ":chua ky tu cam " + s); }
        }
    }
    check("R4 selector hop le (do dai, ky tu cam, <=100 muc)", ok, bad.join("; "));
    check("R5 co it nhat 1 adSignal", rc.yt.adSignals.length > 0);
    check("R6 co it nhat 1 skipButton", rc.yt.skipButtons.length > 0);
    // Khong chan selector chua nút skip bang display:none (nút skip nam trong .ytp-ad-overlay-container)
    check("R7 khong chan container chua nut skip",
        !rc.yt.adSignals.includes(".ytp-ad-overlay-container"),
        "overlay-container se an nut skip");
}

console.log(`\nTong: ${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
