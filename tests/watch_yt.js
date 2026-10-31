// Theo dõi hành vi bỏ quảng cáo trên trang YouTube THẬT.
// Chạy:  node tests/watch_yt.js [videoId] [soGiay]
// Mở Chrome headless với extension đã load, mở video YouTube, poll trạng thái mỗi 500ms
// và in ra timeline: QC xuất hiện → bấm nút "Bỏ qua" → QC kết thúc (mất bao lâu).
//
// Yêu cầu: user đã đăng nhập Chrome? Không cần — nhưng QC chỉ xuất hiện với video có quảng cáo.
// Lưu ý: headless Chrome không đăng nhập nên YouTube có thể không hiện QC cho mọi video.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const VIDEO = process.argv[2] || "jNQXAC9IVRw"; // ví dụ: video dài, thường có QC
const SECONDS = Number(process.argv[3] || 60);
const ROOT = path.join(__dirname, "..");
const PORT = 9500 + Math.floor(Math.random() * 400);

function findChrome() {
    const c = [
        process.env.CHROME_PATH,
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    ].filter(Boolean);
    return c.find((p) => fs.existsSync(p));
}

async function main() {
    const chrome = findChrome();
    if (!chrome) { console.log("FAIL khong tim thay Chrome"); process.exit(1); }
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "fgyt-"));
    console.log(`Dang mo YouTube: https://www.youtube.com/watch?v=${VIDEO}`);
    console.log(`Theo doi ${SECONDS}s. Nhan Ctrl+C de dung.\n`);

    const p = spawn(chrome, [
        "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
        "--autoplay-policy=no-user-gesture-required",
        // Load extension để logic skip thật sự chạy trong trang
        "--disable-extensions-except=" + ROOT,
        "--load-extension=" + ROOT,
        "--remote-debugging-port=" + PORT,
        "--user-data-dir=" + profile,
        `https://www.youtube.com/watch?v=${VIDEO}`,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    p.stderr.on("data", (d) => { stderr += d; });

    const cleanup = () => {
        try { p.kill(); } catch { /* ignore */ }
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
    };
    process.on("exit", cleanup);

    // Chờ DevTools endpoint
    let ws = null;
    for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
            const list = await res.json();
            const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
            if (page) { ws = page.webSocketDebuggerUrl; break; }
        } catch { /* chua len */ }
    }
    if (!ws) { console.log("FAIL khong ket noi duoc DevTools\n" + stderr.slice(-500)); cleanup(); process.exit(1); }

    const { WebSocket } = require("ws");
    let sock;
    try { sock = new WebSocket(ws); } catch (e) {
        console.log("FAIL thieu module 'ws' — chay: npm i ws");
        cleanup(); process.exit(1);
    }
    await new Promise((r, j) => { sock.on("open", r); sock.on("error", j); });

    let id = 0;
    const pending = new Map();
    sock.on("message", (raw) => {
        let m; try { m = JSON.parse(raw.toString()); } catch { return; }
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    });
    const send = (method, params) => new Promise((res) => {
        const i = ++id;
        pending.set(i, res);
        sock.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
    const evalJs = async (expr) => {
        const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
        return r.result && r.result.result ? r.result.result.value : null;
    };

    await send("Runtime.enable");
    await send("Page.enable");

    // Script theo dõi trong trang: ghi lại timeline QC
    await evalJs(`
        window.__fgLog = [];
        window.__fgT0 = Date.now();
        (function poll(){
            const mp = document.getElementById('movie_player');
            const v = mp && mp.querySelector('video');
            const adShowing = mp && (mp.classList.contains('ad-showing')||mp.classList.contains('ad-interrupting'));
            const badge = mp && mp.querySelector('.ytp-ad-badge, .ytp-ad-simple-ad-badge, .ytp-ad-duration-remaining');
            const skipBtn = mp && mp.querySelector(".ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-slot");
            const skipVisible = !!(skipBtn && skipBtn.offsetWidth>0 && skipBtn.offsetHeight>0);
            const rec = {
                t: Date.now()-window.__fgT0,
                adShowing: !!adShowing,
                badge: !!badge,
                skipVisible,
                rate: v ? v.playbackRate : null,
                cur: v ? Math.round(v.currentTime*10)/10 : null,
                dur: v && isFinite(v.duration) ? Math.round(v.duration*10)/10 : null,
                muted: v ? v.muted : null,
                fgActive: document.documentElement.classList.contains('fg-ad-active'),
            };
            const last = window.__fgLog[window.__fgLog.length-1];
            if (!last || JSON.stringify(last)!==JSON.stringify(rec)) window.__fgLog.push(rec);
            setTimeout(poll, 300);
        })();
    `);

    const t0 = Date.now();
    let lastLine = "";
    while (Date.now() - t0 < SECONDS * 1000) {
        await new Promise((r) => setTimeout(r, 2000));
        const log = await evalJs("JSON.stringify(window.__fgLog||[])");
        let arr = [];
        try { arr = JSON.parse(log || "[]"); } catch { /* ignore */ }
        // In thay đổi đáng chú ý
        const interesting = arr.filter((x) => x.adShowing || x.fgActive || x.skipVisible || x.rate > 1);
        if (interesting.length) {
            const s = interesting[interesting.length - 1];
            const line = `t=${(s.t / 1000).toFixed(1)}s ad=${s.adShowing ? "Y" : "n"} badge=${s.badge ? "Y" : "n"} skipBtn=${s.skipVisible ? "Y" : "n"} rate=${s.rate} cur=${s.cur}/${s.dur} muted=${s.muted} fgAdActive=${s.fgActive}`;
            if (line !== lastLine) { console.log(line); lastLine = line; }
        }
    }

    const log = await evalJs("JSON.stringify(window.__fgLog||[])");
    let arr = []; try { arr = JSON.parse(log || "[]"); } catch { /* ignore */ }
    console.log("\n=== TIMELINE CHI TIET ===");
    for (const r of arr) {
        console.log(`t=${(r.t / 1000).toFixed(2)}s ad=${r.adShowing ? "Y" : "n"} badge=${r.badge ? "Y" : "n"} skip=${r.skipVisible ? "Y" : "n"} rate=${r.rate} cur=${r.cur}/${r.dur} muted=${r.muted} fgAdActive=${r.fgActive}`);
    }
    // Kết luận
    const adStart = arr.find((r) => r.adShowing);
    const adEnd = [...arr].reverse().find((r) => !r.adShowing && adStart && r.t > adStart.t);
    if (adStart && adEnd) {
        console.log(`\n=> QC keo dai ${((adEnd.t - adStart.t) / 1000).toFixed(1)}s`);
    } else if (adStart) {
        console.log(`\n=> QC van dang phat sau ${SECONDS}s (khong do duoc thoi diem ket thuc)`);
    } else {
        console.log(`\n=> KHONG thay QC nao trong ${SECONDS}s (video nay co the khong co QC)`);
    }
    cleanup();
    process.exit(0);
}

main().catch((e) => { console.log("FAIL " + (e && e.message)); process.exit(1); });
