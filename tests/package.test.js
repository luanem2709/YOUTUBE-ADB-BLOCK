// Kiểm tra các gói build (dist/*.zip): file đủ, không lộ khóa riêng, manifest hợp lệ.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist");
const results = [];
const check = (name, cond, extra) => results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : ""));

function listZip(zipPath) {
    const script = "Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
        "$z=[IO.Compression.ZipFile]::OpenRead('" + zipPath.replace(/'/g, "''") + "'); " +
        "$z.Entries | ForEach-Object { $_.FullName }; $z.Dispose()";
    return execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" })
        .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

const pkgVersion = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")).version;
const allZips = fs.existsSync(dist) ? fs.readdirSync(dist).filter((f) => f.endsWith(".zip")) : [];
check("B1 co goi build trong dist", allZips.length > 0, allZips.join(", "));

// Chi kiem tra goi cua phien ban hien tai. Goi cu hon la ban build cu — bo qua
// de tranh FAIL gia (vi du v2.4.13 con sot lai trong dist/ khi da len v2.4.14).
const stale = allZips.filter((f) => !f.includes("v" + pkgVersion));
if (stale.length) {
    check("B1b khong con goi build cu", false, "nen xoa: " + stale.join(", "));
} else {
    check("B1b khong con goi build cu", true);
}
const zips = allZips.filter((f) => f.includes("v" + pkgVersion));

const required = [
    "manifest.json", "background.js", "license.js",
    "content-main.js", "content.js", "content.css",
    "content-spotify.js", "content-spotify-main.js",
    "content-yt-net.js",
    "popup.html", "popup.js", "options.html", "options.js",
    "stats.html", "stats.js", "rules/dnr_rules.json",
];

for (const z of zips) {
    const files = listZip(path.join(dist, z));
    const names = files.map((f) => f.replace(/\\/g, "/"));
    const missing = required.filter((r) => !names.some((n) => n === r || n.endsWith("/" + r) || n.endsWith("\\" + r)));
    check("B2 " + z + " — khong thieu file bat buoc", missing.length === 0, missing.join(", "));

    const locales = names.filter((n) => n.includes("_locales"));
    check("B2b " + z + " — co _locales", locales.length > 0, locales.join(", "));

    const secrets = names.filter((n) => /\.pem$|\.key$|private/i.test(n));
    check("B3 " + z + " — khong lo khoa rieng", secrets.length === 0, secrets.join(", "));

    const manifestEntry = names.find((n) => n === "manifest.json");
    if (manifestEntry) {
        const script = "Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
            "$z=[IO.Compression.ZipFile]::OpenRead('" + path.join(dist, z).replace(/'/g, "''") + "'); " +
            "$e=$z.GetEntry('manifest.json'); $r=New-Object IO.StreamReader($e.Open()); $r.ReadToEnd(); $z.Dispose()";
        const json = execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" });
        let m = null;
        try { m = JSON.parse(json); } catch { /* ignore */ }
        check("B4 " + z + " — manifest hop le", !!m && m.manifest_version === 3, m ? "v" + m.version : "khong parse duoc");
        check("B5 " + z + " — manifest khop ban goc", !!m && m.version === JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")).version);
    }
}

// Du lieu demo (previewData) chi duoc dung khi co ?preview — khong duoc lo ra khi mo binh thuong
for (const z of zips) {
    const names = listZip(path.join(dist, z)).map((f) => f.replace(/\\/g, "/"));
    if (!names.some((n) => n.endsWith("stats.js"))) continue;
    const script = "Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
        "$z=[IO.Compression.ZipFile]::OpenRead('" + path.join(dist, z).replace(/'/g, "''") + "'); " +
        "$e=$z.GetEntry('stats.js'); if($e){$r=New-Object IO.StreamReader($e.Open()); $r.ReadToEnd()}; $z.Dispose()";
    const src = execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" });
    // previewData() phai duoc guard bang ?preview
    const guarded = /has\(\"preview\"\)|has\('preview'\)/.test(src) &&
        /render\(previewData\(\)\)/.test(src);
    check("B6 " + z + " — du lieu demo chi dung o che do ?preview", guarded);
}

console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(failed ? "\nFAIL " + failed : "\nPASS " + results.length);
process.exit(failed ? 1 : 0);
