// Chạy toàn bộ test: node tests/run.js   (hoặc: npm test)
// - Test trình duyệt: mở từng trang trong Chrome headless qua server local, đọc kết quả PASS/FAIL.
// - Test Node: license.test.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawn } = require("child_process");

// Chạy Chrome bất đồng bộ — spawnSync sẽ chặn luôn server HTTP trong cùng tiến trình
function runChrome(chrome, args, timeoutMs) {
    return new Promise((resolve) => {
        const p = spawn(chrome, args);
        let out = "";
        p.stdout.on("data", (d) => { out += d; });
        p.stderr.on("data", () => {});
        const timer = setTimeout(() => p.kill(), timeoutMs);
        p.on("close", () => { clearTimeout(timer); resolve(out); });
        p.on("error", () => { clearTimeout(timer); resolve(out); });
    });
}

const root = path.join(__dirname, "..");
const PORT = 8765 + Math.floor(Math.random() * 1000);

// Trang nào cần chạy trên đường dẫn /watch (giống YouTube)
const BROWSER_TESTS = [
    { file: "main.html", url: "/tests/main.html" },
    { file: "spotify.html", url: "/tests/spotify.html" },
    { file: "pause.html", url: "/watch?v=abc&t=pause.html" },
    { file: "premium.html", url: "/watch?v=abc&t=premium.html" },
    { file: "features.html", url: "/watch?v=abc&t=features.html" },
    { file: "ambient.html", url: "/watch?v=abc&t=ambient.html" },
];

function findChrome() {
    const c = [
        process.env.CHROME_PATH,
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ].filter(Boolean);
    return c.find((p) => fs.existsSync(p));
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json" };

const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    let file;
    if (u.pathname === "/watch" || u.pathname.startsWith("/feed")) file = path.join(__dirname, u.searchParams.get("t") || "pause.html");
    else file = path.join(root, decodeURIComponent(u.pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        return res.end("not found");
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(fs.readFileSync(file));
});

function parse(dom) {
    const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
    if (!m) return ["FAIL khong doc duoc ket qua"];
    const lines = m[1].split(/\r?\n/).map((x) => x.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").trim()).filter(Boolean);
    if (lines.length === 1 && lines[0] === "RUNNING") return ["FAIL trang test chua chay xong (loi JS?)"];
    return lines;
}

server.listen(PORT, async () => {
    let failed = 0, passed = 0;
    const chrome = findChrome();
    if (!chrome) {
        console.log("FAIL khong tim thay Chrome (dat bien CHROME_PATH)");
        failed++;
    } else {
        for (const t of BROWSER_TESTS) {
            const stdout = await runChrome(chrome, [
                "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
                "--autoplay-policy=no-user-gesture-required", "--virtual-time-budget=120000",
                "--dump-dom", `http://localhost:${PORT}${t.url}`,
            ], 180000);
            const lines = parse(stdout);
            console.log(`\n== ${t.file}`);
            for (const l of lines) {
                console.log("  " + l);
                if (l.startsWith("PASS")) passed++;
                else if (l.startsWith("FAIL")) failed++;
            }
        }
    }
    server.close();

    for (const nodeTest of ["license.test.js", "server.test.js"]) {
        console.log("\n== " + nodeTest);
        try {
            const out = execFileSync(process.execPath, [path.join(__dirname, nodeTest)], { encoding: "utf8" });
            for (const l of out.trim().split(/\r?\n/)) {
                console.log("  " + l);
                if (l.startsWith("PASS")) passed++;
                else if (l.startsWith("FAIL")) failed++;
            }
        } catch (e) {
            const out = String(e.stdout || e.message);
            for (const l of out.trim().split(/\r?\n/)) {
                console.log("  " + l);
                if (l.startsWith("PASS")) passed++;
                else failed++;
            }
        }
    }

    console.log(`\nTong: ${passed} PASS, ${failed} FAIL`);
    process.exit(failed ? 1 : 0);
});
