/**
 * Gói bản điện thoại (Android, trình duyệt có extension).
 * Chạy: node scripts/build-mobile.js
 * Bản máy tính không đổi. File zip chỉ để sideload, không dùng installer Windows.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const outName = `funnygame-mobile-v${manifest.version}.zip`;
const outPath = path.join(root, "dist", outName);
const staging = path.join(root, "dist", "_staging-mobile");

const include = [
    "manifest.json",
    "background.js",
    "license.js",
    "content.js",
    "content-main.js",
    "content.css",
    "content-spotify.js",
    "content-spotify-main.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "options.html",
    "options.css",
    "options.js",
    "stats.html",
    "stats.css",
    "stats.js",
    "images",
    "rules",
    "_locales",
    "PRIVACY.md",
];

function copyItem(item, destRoot) {
    const src = path.join(root, item);
    const dest = path.join(destRoot, item);
    if (fs.statSync(src).isDirectory()) {
        fs.cpSync(src, dest, { recursive: true });
    } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }
}

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
fs.mkdirSync(staging, { recursive: true });

include.forEach((item) => copyItem(item, staging));
fs.copyFileSync(path.join(root, "mobile", "mobile-ui.js"), path.join(staging, "mobile-ui.js"));
fs.copyFileSync(path.join(root, "mobile", "mobile.css"), path.join(staging, "mobile.css"));
fs.copyFileSync(path.join(root, "mobile", "popup-mobile.css"), path.join(staging, "popup-mobile.css"));

const mobileManifest = JSON.parse(fs.readFileSync(path.join(staging, "manifest.json"), "utf8"));
mobileManifest.name = "FUNNYGAME Mobile";
mobileManifest.description = "Bản điện thoại: chặn quảng cáo YouTube và Spotify trên trình duyệt Android có hỗ trợ extension.";
mobileManifest.action.default_title = "FUNNYGAME Mobile";
mobileManifest.content_scripts.push({
    matches: [
        "*://*.youtube.com/*",
        "*://music.youtube.com/*",
        "*://m.youtube.com/*",
        "*://open.spotify.com/*",
        "*://play.spotify.com/*",
    ],
    js: ["mobile-ui.js"],
    css: ["mobile.css"],
    run_at: "document_idle",
});
fs.writeFileSync(path.join(staging, "manifest.json"), JSON.stringify(mobileManifest, null, 2) + "\n");

const popupPath = path.join(staging, "popup.html");
const popupHtml = fs.readFileSync(popupPath, "utf8");
fs.writeFileSync(
    popupPath,
    popupHtml.replace(
        '<link rel="stylesheet" href="popup.css" />',
        '<link rel="stylesheet" href="popup.css" />\n    <link rel="stylesheet" href="popup-mobile.css" />'
    )
);

if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${staging}\\*' -DestinationPath '${outPath}' -Force"`,
    { stdio: "inherit" }
);
fs.rmSync(staging, { recursive: true });
console.log("Đã tạo:", outPath);
