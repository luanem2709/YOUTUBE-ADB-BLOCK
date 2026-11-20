// Canary quảng cáo: mở YouTube THẬT (không đăng nhập) trong Chrome headless, nạp content-yt-net.js + content-main.js + content.css
// rồi đổi clip liên tiếp, đo thời gian quảng cáo hiện (class ad-showing) và lỗi phát video.
// KHÔNG nằm trong `npm test` (cần mạng + playwright): chạy bằng workflow .github/workflows/ad-canary.yml hoặc tay:
//   npm i --no-save playwright && node tests/canary.js [số clip=6] [giây/clip=12]
// Kết quả: exit 1 nếu có lỗi phát, thiếu player, hoặc 1 quảng cáo hiện > MAX_AD_SEC giây.
const fs = require("fs");
const path = require("path");
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.error("Thiếu playwright: npm i --no-save playwright"); process.exit(2); }

const ROOT = path.join(__dirname, "..");
const CLIPS = Number(process.argv[2] || 6), SECS = Number(process.argv[3] || 12);
const MAX_AD_SEC = Number(process.env.MAX_AD_SEC || 3);
const rd = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

(async () => {
    const browser = await chromium.launch({
        channel: process.env.CHROME_PATH ? undefined : "chrome",
        executablePath: process.env.CHROME_PATH || undefined,
        headless: true,
        args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    });
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "vi-VN" })).newPage();
    const settings = { blockVideo: true, blockBanner: true, blockOverlay: true, blockAntiAdblock: true, blockShopping: true, muteAds: true, fastSkip: true, blockManifest: true, backgroundPlay: true, pipButton: false, hideUpsell: true, videoQuality: "auto", sponsorBlock: false, jumpAhead: false, ambientGlow: false, customLogo: false };
    await page.addInitScript({ content: rd("content-yt-net.js") });
    await page.addInitScript({ content: rd("content-main.js") });
    await page.addInitScript({ content: `(function(){var css=${JSON.stringify(rd("content.css"))};var add=function(){var s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s)};if(document.head)add();else document.addEventListener('DOMContentLoaded',add);var cfg={settings:${JSON.stringify(settings)},whitelisted:false,whitelistChannels:[]};var send=function(){window.postMessage(Object.assign({type:'FG_LICENSE',ok:true,enabled:true},cfg),'*');window.postMessage(Object.assign({type:'FG_NET_CONFIG',ok:true,enabled:true},cfg),'*');};send();setTimeout(send,300);setTimeout(send,1500);setInterval(send,5000);})();` });
    // Nhật ký quảng cáo ngay trong trang (50ms)
    await page.addInitScript({ content: `window.__adLog=[];setInterval(function(){var p=document.querySelector('.html5-video-player');var ad=!!p&&/ad-showing|ad-interrupting/.test(p.className);var L=window.__adLog,last=L[L.length-1];if(ad&&(!last||last.end))L.push({start:performance.now()});if(!ad&&last&&!last.end)last.end=performance.now();},50);` });

    const report = [];
    await page.goto("https://www.youtube.com/watch?v=dQw4w9WgXcQ", { waitUntil: "domcontentloaded", timeout: 60000 });
    for (let i = 0; i < CLIPS; i++) {
        await page.waitForTimeout(2500);
        try { await page.evaluate(() => { const v = document.querySelector("video"); if (v) { v.muted = true; v.play().catch(() => {}); } }); } catch { /* ignore */ }
        let playerSeen = false, err = false;
        const t0 = Date.now();
        while (Date.now() - t0 < SECS * 1000) {
            try {
                const s = await page.evaluate(() => { const p = document.querySelector(".html5-video-player"); const e = p && p.querySelector(".ytp-error"); return { p: !!p, e: !!(e && e.offsetParent !== null) }; });
                playerSeen = playerSeen || s.p; err = err || s.e;
            } catch { /* trang đang điều hướng */ }
            await page.waitForTimeout(250);
        }
        let ads = [];
        try { ads = await page.evaluate(() => { const n = performance.now(); return window.__adLog.splice(0).map((x) => +(((x.end || n) - x.start) / 1000).toFixed(2)); }); } catch { /* ignore */ }
        let vid = ""; try { vid = await page.evaluate(() => new URLSearchParams(location.search).get("v")); } catch { /* ignore */ }
        report.push({ clip: i + 1, vid, adSeconds: ads, playerSeen, playbackError: err });
        // đổi clip bằng click video đề xuất (điều hướng SPA); không được thì tải thẳng 1 video khác
        let changed = false;
        try {
            await page.waitForFunction((cur) => [...document.querySelectorAll("a[href*='/watch?v=']")].some((a) => a.offsetParent !== null && !a.href.includes(cur) && !/list=/.test(a.href)), vid || "", { timeout: 8000 });
            const href = await page.evaluate((cur) => { const as = [...document.querySelectorAll("a[href*='/watch?v=']")].filter((a) => a.offsetParent !== null && !a.href.includes(cur) && !/list=/.test(a.href)); const a = as[Math.min(2, as.length - 1)]; return a ? new URL(a.href).pathname + new URL(a.href).search : null; }, vid || "");
            if (href) { await page.locator(`a[href="${href}"]:visible`).first().click({ timeout: 4000 }); changed = true; }
        } catch { /* ignore */ }
        if (!changed) await page.goto("https://www.youtube.com/watch?v=" + ["kJQP7kiw5Fk", "9bZkp7q19f0", "JGwWNGJdvx8", "OPf0YbXqDm0", "fJ9rUzIMcZQ", "RgKAFK5djSk"][i % 6], { waitUntil: "domcontentloaded" });
    }
    await browser.close();

    const allAds = report.flatMap((r) => r.adSeconds);
    const problems = [];
    if (report.some((r) => !r.playerSeen)) problems.push("không thấy player ở ít nhất 1 clip (YouTube đổi giao diện / bị chặn?)");
    if (report.some((r) => r.playbackError)) problems.push("có lỗi phát video (.ytp-error) khi bật lớp chặn");
    const worst = allAds.length ? Math.max(...allAds) : 0;
    if (worst > MAX_AD_SEC) problems.push(`có quảng cáo hiện ${worst}s > ${MAX_AD_SEC}s (chặn/tua quảng cáo không còn hiệu quả)`);
    const summary = { clips: CLIPS, adsSeen: allAds.length, worstAdSeconds: worst, maxAllowed: MAX_AD_SEC, problems, report };
    console.log(JSON.stringify(summary, null, 1));
    if (!allAds.length) console.log("LƯU Ý: phiên không gặp quảng cáo nào → chỉ kiểm được 'không lỗi phát', chưa đo được tốc độ bỏ qua.");
    fs.writeFileSync(path.join(ROOT, "canary-result.json"), JSON.stringify(summary, null, 2));
    process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
