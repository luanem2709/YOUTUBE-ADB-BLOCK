/**
 * Tạo bộ nguồn Safari Web Extension cho iPhone/iPad.
 * Đây chưa phải file cài đặt: cần Safari Web Extension Packager/Xcode ký thành app.
 * Chạy: node scripts/build-safari-source.js
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const outName = `funnygame-safari-source-v${sourceManifest.version}.zip`;
const outPath = path.join(root, "dist", outName);
const staging = path.join(root, "dist", "_staging-safari");

const include = [
    "manifest.json",
    "background.js",
    "license.js",
    "content.js",
    "content-main.js",
    "content-yt-net.js",
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

function copyItem(item) {
    const src = path.join(root, item);
    const dest = path.join(staging, item);
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
include.forEach(copyItem);

for (const file of ["mobile-ui.js", "mobile.css", "popup-mobile.css"]) {
    fs.copyFileSync(path.join(root, "mobile", file), path.join(staging, file));
}
fs.copyFileSync(
    path.join(root, "mobile", "IOS-INSTALL.md"),
    path.join(staging, "HUONG-DAN-IOS.md")
);

const manifestPath = path.join(staging, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
delete manifest.key;
delete manifest.browser_specific_settings;
manifest.name = "FUNNYGAME cho Safari";
manifest.description = "Chặn quảng cáo YouTube và Spotify Web trong Safari trên iPhone và iPad.";
manifest.action.default_title = "FUNNYGAME";
manifest.content_scripts.push({
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
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

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
console.log("Đã tạo bộ nguồn Safari:", outPath);
