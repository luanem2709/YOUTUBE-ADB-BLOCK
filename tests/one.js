// Chạy riêng 1 trang test và in kết quả + lỗi console.
// node tests/one.js /tests/popup.html
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const PORT = 9100 + Math.floor(Math.random() * 400);
const target = process.argv[2] || "/tests/main.html";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".gif": "image/gif", ".json": "application/json" };

const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const file = path.join(root, decodeURIComponent(u.pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("nf"); }
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

server.listen(PORT, () => {
    const chrome = findChrome();
    const p = spawn(chrome, [
        "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
        "--autoplay-policy=no-user-gesture-required", "--virtual-time-budget=120000",
        "--enable-logging=stderr", "--v=0",
        "--dump-dom", `http://localhost:${PORT}${target}`,
    ]);
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", () => {
        const m = out.match(/<pre id="out">([\s\S]*?)<\/pre>/);
        console.log(m ? m[1] : "=== KHONG CO pre#out (trang crash/navigate) ===\n" + out.slice(0, 800));
        const noise = /external_registry_loader|Missing value path|GPU process|dbus|Fontconfig|DevTools listening|net::ERR_|swiftshader|vulkan/i;
        const lines = err.split(/\r?\n/).filter((l) => /ERROR|SEVERE|Uncaught|TypeError|ReferenceError/i.test(l) && !noise.test(l));
        if (lines.length) {
            console.log("\n=== LOI CONSOLE ===");
            [...new Set(lines)].slice(0, 15).forEach((l) => console.log("  " + l.trim().slice(0, 250)));
        }
        server.close();
        process.exit(0);
    });
});
