/**
 * Đóng gói extension thành file zip để sideload / upload store.
 * Chạy: node scripts/build.js
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const outName = `funnygame-adblock-v${manifest.version}.zip`;
const outPath = path.join(root, "dist", outName);

const include = [
    "manifest.json",
    "background.js",
    "content.js",
    "content-main.js",
    "content.css",
    "popup.html",
    "popup.css",
    "popup.js",
    "options.html",
    "options.css",
    "options.js",
    "images",
    "rules",
    "_locales",
    "PRIVACY.md",
];

fs.mkdirSync(path.join(root, "dist"), { recursive: true });

if (process.platform === "win32") {
    const staging = path.join(root, "dist", "_staging");
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
    fs.mkdirSync(staging, { recursive: true });

    include.forEach((item) => {
        const src = path.join(root, item);
        const dest = path.join(staging, item);
        if (fs.statSync(src).isDirectory()) {
            fs.cpSync(src, dest, { recursive: true });
        } else {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(src, dest);
        }
    });

    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    execSync(
        `powershell -NoProfile -Command "Compress-Archive -Path '${staging}\\*' -DestinationPath '${outPath}' -Force"`,
        { stdio: "inherit" }
    );
    fs.rmSync(staging, { recursive: true });
} else {
    execSync(`cd "${root}" && zip -r "${outPath}" ${include.join(" ")}`, { stdio: "inherit" });
}

console.log("Đã tạo:", outPath);
