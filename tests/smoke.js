// Kiểm tra lỗi runtime/console trên tất cả trang test.
// node tests/smoke.js
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const PORT = 9400 + Math.floor(Math.random() * 400);

// Dọn process Chrome headless còn sót lại (KHÔNG đụng Chrome thật của người dùng)
function cleanupLeftoverChrome() {
    try {
        const ps = `
$cut=(Get-Date).AddMinutes(-20);
$ids=@();
foreach($x in (Get-Process chrome -EA SilentlyContinue)){
  try{
    if($x.StartTime -gt $cut){
      $c=(Get-CimInstance Win32_Process -Filter "ProcessId=$($x.Id)").CommandLine
      if($c -match "--headless" -or $c -match "dump-dom"){ $ids+=$x.Id }
    }
  }catch{}
}
if($ids.Count){ $ids | ForEach-Object { Stop-Process -Id $_ -Force -EA SilentlyContinue } }
$ids.Count
`;
        const n = Number(execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim() || 0);
        if (n > 0) console.log("(da don " + n + " process Chrome headless con sot lai)");
    } catch { /* ignore */ }
    try {
        for (const d of fs.readdirSync(os.tmpdir())) {
            if (/^(fgsmoke|HeadlessChrome)/.test(d)) {
                try { fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true }); } catch { /* ignore */ }
            }
        }
    } catch { /* ignore */ }
}

const PAGES = [
    { file: "main.html", url: "/tests/main.html" },
    { file: "net.html", url: "/tests/net.html" },
    { file: "spotify.html", url: "/tests/spotify.html" },
    { file: "pause.html", url: "/watch?v=abc&t=pause.html" },
    { file: "premium.html", url: "/watch?v=abc&t=premium.html" },
    { file: "features.html", url: "/watch?v=abc&t=features.html" },
    { file: "ambient.html", url: "/watch?v=abc&t=ambient.html" },
    { file: "logo.html", url: "/tests/logo.html" },
    { file: "banner.html", url: "/tests/banner.html" },
    { file: "css.html", url: "/tests/css.html" },
    { file: "popup.html", url: "/tests/popup.test.html" },
    { file: "stats.html", url: "/tests/stats.test.html" },
    { file: "options.html", url: "/tests/options.test.html" },
];

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css" };

const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    let file;
    if (u.pathname === "/watch") file = path.join(__dirname, u.searchParams.get("t") || "pause.html");
    else file = path.join(root, decodeURIComponent(u.pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end("nf");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
});

function findChrome() {
    const c = [
        process.env.CHROME_PATH,
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    ].filter(Boolean);
    return c.find((p) => fs.existsSync(p));
}

// Chạy Chrome với --enable-logging=stderr để thu console error của trang
function runPage(chrome, url) {
    return new Promise((resolve) => {
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fgsmoke-"));
        const args = [
            "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
            "--autoplay-policy=no-user-gesture-required", "--virtual-time-budget=150000",
            "--enable-logging=stderr", "--v=0",
            "--user-data-dir=" + profile,
            "--dump-dom", url,
        ];
        const p = spawn(chrome, args);
        let out = "", err = "";
        p.stdout.on("data", (d) => { out += d; });
        p.stderr.on("data", (d) => { err += d; });
        const t = setTimeout(() => p.kill(), 120000);
        p.on("close", () => {
            clearTimeout(t);
            try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
            resolve({ dom: out, err });
        });
        p.on("error", () => { clearTimeout(t); resolve({ dom: out, err }); });
    });
}

// Lọc lỗi thật (bỏ qua cảnh báo nhiễu của Chrome)
const NOISE = [
    /VoiceTranscription|Speech|registration_state|GPU process|gpu_|dbus|Fontconfig|DevTools listening/i,
    /Failed to (connect|read|create)|net::ERR_/i,
    /Autofill|autofill/i,
    /SharedImageManager|ContextResult|gl_display/i,
    /swiftshader|vulkan|dxdiag/i,
    /Please run the following command to regenerate/i,
    // Tiếng ồi của chính Chrome (registry extension, không liên quan tới mã dự án)
    /external_registry_loader_win|Missing value path for key/i,
    /policy|Policy/i,
];

function extractErrors(stderr) {
    const lines = stderr.split(/\r?\n/);
    const bad = [];
    for (const l of lines) {
        if (!l.trim()) continue;
        if (!/ERROR|SEVERE|Uncaught|TypeError|ReferenceError|SyntaxError/i.test(l)) continue;
        if (NOISE.some((r) => r.test(l))) continue;
        bad.push(l.trim());
    }
    return [...new Set(bad)];
}

server.listen(PORT, async () => {
    const chrome = findChrome();
    if (!chrome) { console.log("FAIL khong tim thay Chrome"); server.close(); process.exit(1); }
    // Sinh trang test popup/stats/options truoc khi smoke
    for (const gen of ["mkpopup.js", "mkpages.js"]) {
        try { require("child_process").execFileSync(process.execPath, [path.join(__dirname, gen)], { encoding: "utf8" }); }
        catch (e) { console.log("FAIL khong sinh duoc " + gen + ": " + (e.message || e)); }
    }
    let problems = 0;
    for (const pg of PAGES) {
        const { dom, err } = await runPage(chrome, "http://localhost:" + PORT + pg.url);
        const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
        const outText = m ? m[1] : "";
        const lines = outText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const fails = lines.filter((l) => l.startsWith("FAIL"));
        const passes = lines.filter((l) => l.startsWith("PASS"));
        const errors = extractErrors(err);
        const notFinished = !m || outText.trim() === "RUNNING";
        const bad = [];
        if (notFinished) bad.push("trang khong chay xong (loi JS hoac treo)");
        if (fails.length) bad.push(fails.length + " test FAIL");
        if (errors.length) bad.push(errors.length + " loi console");
        if (bad.length) {
            problems++;
            console.log("\n== " + pg.file + "  ==> " + bad.join(" | "));
            fails.forEach((f) => console.log("   " + f));
            errors.slice(0, 6).forEach((e) => console.log("   [console] " + e.slice(0, 200)));
        } else {
            console.log("== " + pg.file + "  OK (" + passes.length + " PASS, khong loi console)");
        }
    }
    server.close();
    console.log(problems ? "\nKET QUA: " + problems + " trang co van de" : "\nKET QUA: tat ca trang sach - khong loi runtime/console");
    cleanupLeftoverChrome();
    process.exit(problems ? 1 : 0);
});
