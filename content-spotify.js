// FUNNYGAME — chặn quảng cáo Spotify Web Player (open.spotify.com)
// Chỉ chạy trên trình duyệt, không ảnh hưởng app Spotify desktop/mobile.
(function () {
    let isEnabled = false;
    let blockSpotify = true;
    let adsBlockedCount = 0;

    const AD_LABELS = [
        "advertisement", "quảng cáo", "quang cao", "anuncio", "publicité",
        "werbung", "annuncio", "reklam", "реклама", "광고", "広告",
    ];

    // Cụm chữ của màn QC (ảnh: "Nhạc của bạn sẽ tiếp tục sau quảng cáo")
    const AD_BREAK_PHRASES = [
        "nhạc của bạn sẽ tiếp tục",
        "nhac cua ban se tiep tuc",
        "your music will continue after",
        "giây quảng cáo",
        "giay quang cao",
        "seconds of ads",
        "seconds of ad remaining",
        "quảng cáo •",
        "quảng cáo ·",
        "advertisement •",
        "advertisement ·",
        "advertisement • ",
    ];

    const AD_UI_SELECTORS = [
        '[data-testid="ad-slot-container"]',
        '[data-testid="ad-container"]',
        '[data-testid="advertisement"]',
        '[data-testid="ad-tag"]',
        '[data-testid="video-ad"]',
        '[data-testid="VideoPlayerAd"]',
        '[aria-label="Advertisement"]',
        '[aria-label="Quảng cáo"]',
        "div[data-ad-slot]",
        'iframe[src*="doubleclick"]',
        'iframe[src*="googlesyndication"]',
    ];
    let AD_UI_SELECTOR_STR = AD_UI_SELECTORS.join(",");

    const SKIP_AD_SELECTORS = [
        '[data-testid="skip-ad-button"]',
        '[data-testid="ad-skip-button"]',
        'button[aria-label*="Skip ad" i]',
        'button[aria-label*="Skip advert" i]',
        'button[aria-label*="Bỏ qua quảng cáo" i]',
        'button[aria-label*="Skip" i][aria-label*="ad" i]',
    ];
    let SKIP_AD_SELECTOR_STR = SKIP_AD_SELECTORS.join(",");

    function cleanSelectors(list) {
        if (!Array.isArray(list)) return [];
        const out = [];
        for (const raw of list.slice(0, 100)) {
            const sel = String(raw || "").trim();
            if (!sel || sel.length > 200 || /[{}<>]/.test(sel)) continue;
            try { document.createDocumentFragment().querySelector(sel); } catch { continue; }
            out.push(sel);
        }
        return out;
    }

    function applyRemoteConfig(cfg) {
        const sp = cfg && typeof cfg === "object" && cfg.spotify && typeof cfg.spotify === "object" ? cfg.spotify : {};
        const ui = cleanSelectors(sp.adUi).filter((x) => !AD_UI_SELECTORS.includes(x));
        const skip = cleanSelectors(sp.skipButtons).filter((x) => !SKIP_AD_SELECTORS.includes(x));
        AD_UI_SELECTOR_STR = AD_UI_SELECTORS.concat(ui).join(",");
        SKIP_AD_SELECTOR_STR = SKIP_AD_SELECTORS.concat(skip).join(",");
    }

    let mutedByUs = false;
    let ratedByUs = false;
    let tabMutedByUs = false;
    // Tốc độ phát GỐC của từng phần tử media (người dùng có thể đang xem ở 1.5x…)
    const savedRates = new WeakMap();
    let lastSkipAt = 0;
    let skippedForwardThisAd = false;
    let adActive = false;

    let cachedBar = null;
    let cachedWidget = null;

    function getNowPlayingBar() {
        if (cachedBar && cachedBar.isConnected) return cachedBar;
        cachedBar = document.querySelector('[data-testid="now-playing-bar"]');
        return cachedBar;
    }

    function getNowPlayingWidget() {
        if (cachedWidget && cachedWidget.isConnected) return cachedWidget;
        cachedWidget = document.querySelector('[data-testid="now-playing-widget"]');
        return cachedWidget;
    }

    function postLicense() {
        const ok = isEnabled && blockSpotify;
        try {
            sessionStorage.setItem("__fg_sp_lic", ok ? "1" : "0");
        } catch { /* ignore */ }
        try { window.postMessage({ type: "FG_SPOTIFY_LICENSE", ok }, "*"); }
        catch { /* ignore */ }
    }

    function postAdState(on) {
        try { window.postMessage({ type: "FG_SPOTIFY_AD", ok: on }, "*"); }
        catch { /* ignore */ }
    }

    function setTabMuted(on) {
        if (on === tabMutedByUs) return;
        tabMutedByUs = on;
        try { chrome.runtime.sendMessage({ type: "FG_MUTE_TAB", muted: on }); }
        catch { /* ignore */ }
    }

    async function licenseAllows(result) {
        try {
            return (await FunnyLicense.verifyStored(result)).ok;
        } catch {
            return false;
        }
    }

    function loadSettings(cb) {
        try {
            chrome.storage.local.get(["enabled", "settings", "remoteConfig", "licenseKey", "licenseToken", "licenseSig"], async (result) => {
                applyRemoteConfig(result.remoteConfig);
                isEnabled = (result.enabled !== false) && await licenseAllows(result);
                blockSpotify = result.settings?.blockSpotify !== false;
                adsBlockedCount = 0;
                postLicense();
                if (!isEnabled || !blockSpotify) {
                    postAdState(false);
                    setTabMuted(false);
                }
                cb && cb();
            });
        } catch {
            cb && cb();
        }
    }

    function watchSettings() {
        try {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== "local") return;
                if (changes.enabled || changes.licenseToken || changes.licenseSig || changes.licenseKey || changes.settings || changes.remoteConfig) {
                    loadSettings();
                }
            });
        } catch { /* ignore */ }
    }

    function isPlaybackActive() {
        const bar = getNowPlayingBar() || document;
        const btn = bar.querySelector('[data-testid="control-button-playpause"]');
        if (!btn) return true;
        const label = (btn.getAttribute("aria-label") || "").toLowerCase();
        return label.includes("pause") || label.includes("tạm dừng") || label.includes("tam dung");
    }

    function shortAdMediaPlaying() {
        for (const m of mediaElements()) {
            if (!m.paused && isFinite(m.duration) && m.duration > 0 && m.duration <= 40)
                return true;
        }
        return false;
    }

    function widgetLooksLikeAd(widget) {
        const label = (widget.getAttribute("aria-label") || "").trim().toLowerCase();
        const text = (widget.textContent || "").toLowerCase();
        // aria-label của widget là nhãn giao diện ("Đang phát" / "Now playing") → so khớp chính xác.
        if (label && AD_LABELS.some((k) => label === k)) return true;
        // Cụm chữ màn QC rất đặc thù → dùng "includes" ở đây là an toàn.
        if (AD_BREAK_PHRASES.some((k) => text.includes(k))) return true;

        const trackLink = widget.querySelector(
            'a[href*="/track/"], a[href*="/album/"], a[href*="/playlist/"], a[href*="/artist/"], a[href*="/episode/"], [data-testid="context-item-link"]'
        );
        if (isPlaybackActive() && !trackLink && text.trim().length > 0 && shortAdMediaPlaying())
            return true;
        return false;
    }

    function hasBox(el) {
        return !!el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
    }

    // Chỉ xét trong thanh "đang phát" — banner QC tĩnh ở trang chủ/sidebar KHÔNG có nghĩa bài đang phát là QC
    function pageHasAdBreak() {
        const bar = getNowPlayingBar();
        if (bar) {
            const uiAds = bar.querySelectorAll(AD_UI_SELECTOR_STR);
            for (let i = 0; i < uiAds.length; i++) {
                if (hasBox(uiAds[i])) return true;
            }
            const barText = (bar.textContent || "").toLowerCase();
            if (AD_BREAK_PHRASES.some((k) => barText.includes(k))) return true;
        }
        if (shortAdMediaPlaying()) {
            const main = document.querySelector('[data-testid="now-playing-view"], [data-testid="fullscreen-mode-container"]');
            if (main) {
                const mainText = (main.textContent || "").toLowerCase();
                if (AD_BREAK_PHRASES.some((k) => mainText.includes(k))) return true;
            }
        }
        return false;
    }

    function mediaSessionLooksLikeAd() {
        try {
            const meta = navigator.mediaSession && navigator.mediaSession.metadata;
            if (!meta) return false;
            // So khớp CHÍNH XÁC từng trường (tiêu đề / nghệ sĩ / album).
            // Dùng "includes" sẽ báo nhầm bài hát bình thường có tên chứa "advertisement"
            // hoặc tên nghệ sĩ chứa "quảng cáo" → bị tua/mute nhầm bài nhạc thật.
            const fields = [meta.title, meta.artist, meta.album];
            for (const raw of fields) {
                const v = String(raw || "").trim().toLowerCase();
                if (!v) continue;
                if (AD_LABELS.some((k) => v === k)) return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    function isAdPlaying() {
        const skipBtn = document.querySelector(SKIP_AD_SELECTOR_STR);
        if (skipBtn && hasBox(skipBtn)) return true;
        if (mediaSessionLooksLikeAd()) return true;

        const widget = getNowPlayingWidget();
        if (widget && widgetLooksLikeAd(widget)) return true;

        if (pageHasAdBreak()) return true;

        const title = (document.title || "").trim().toLowerCase();
        // Chỉ coi là QC khi tiêu đề trang BẰNG ĐÚNG nhãn QC (không dùng "includes" —
        // bài hát tên "Advertisement" sẽ bị nhận nhầm là quảng cáo).
        if (AD_LABELS.some((k) => title === k)) return true;

        const link = (widget || document).querySelector('a[data-testid="context-item-link"]');
        if (link) {
            const href = (link.getAttribute("href") || "").toLowerCase();
            if (href.includes("spotify:ad:") || href.includes("/ad/") || href.includes("advertis")) return true;
        }
        return false;
    }

    function mediaElements() {
        return document.querySelectorAll("video, audio");
    }

    function trySkipAd() {
        const now = Date.now();
        if (now - lastSkipAt < 1200) return false;
        const btn = document.querySelector(SKIP_AD_SELECTOR_STR);
        if (btn && btn.offsetParent !== null) {
            lastSkipAt = now;
            btn.click();
            return true;
        }
        if (skippedForwardThisAd) return false;
        const bar = getNowPlayingBar() || document;
        const next = bar.querySelector('[data-testid="control-button-skip-forward"]');
        if (next && next.offsetParent !== null) {
            lastSkipAt = now;
            skippedForwardThisAd = true;
            try {
                next.disabled = false;
                next.removeAttribute("disabled");
                next.removeAttribute("aria-disabled");
            } catch { /* ignore */ }
            next.click();
            return true;
        }
        return false;
    }

    function handleAd() {
        postAdState(true);
        setTabMuted(true);
        trySkipAd();
        const media = mediaElements();
        for (let i = 0; i < media.length; i++) {
            const m = media[i];
            if (!m.muted) { m.muted = true; mutedByUs = true; }
            if (m.playbackRate !== 16) {
                // Nhớ tốc độ GỐC của người dùng để khôi phục đúng sau QC
                // (trước đây luôn trả về 1 → người nghe ở 1.5x bị đổi về 1x).
                savedRates.set(m, m.playbackRate);
                m.playbackRate = 16;
                ratedByUs = true;
            }
            try {
                if (isFinite(m.duration) && m.duration > 0 && m.currentTime < m.duration - 0.2) {
                    m.currentTime = m.duration;
                }
            } catch { /* seek có thể bị chặn */ }
        }
        hideAdUI();
    }

    function restorePlayback() {
        skippedForwardThisAd = false;
        postAdState(false);
        setTabMuted(false);
        const media = mediaElements();
        for (let i = 0; i < media.length; i++) {
            const m = media[i];
            if (ratedByUs && m.playbackRate === 16) {
                const saved = savedRates.get(m);
                m.playbackRate = (typeof saved === "number" && isFinite(saved) && saved > 0 && saved <= 16) ? saved : 1;
            }
            if (mutedByUs && m.muted) m.muted = false;
            savedRates.delete(m);
        }
        mutedByUs = false;
        ratedByUs = false;
    }

    function hideAdUI() {
        const nodes = document.querySelectorAll(AD_UI_SELECTOR_STR);
        for (let i = 0; i < nodes.length; i++) {
            nodes[i].style.setProperty("display", "none", "important");
        }
    }

    let lastLicensePostAt = 0;
    function tick() {
        if (!isEnabled || !blockSpotify) {
            if (adActive) { restorePlayback(); adActive = false; }
            const now = Date.now();
            if (now - lastLicensePostAt > 2000) {
                lastLicensePostAt = now;
                postLicense();
            }
            return;
        }
        const ad = isAdPlaying();
        if (ad) {
            if (!adActive) {
                adActive = true;
                incrementBlockCount();
            }
            handleAd();
        } else if (adActive) {
            adActive = false;
            restorePlayback();
        }
    }

    document.addEventListener("ratechange", (e) => {
        const m = e.target;
        if (!m || (m.tagName !== "VIDEO" && m.tagName !== "AUDIO")) return;
        if (!isEnabled || !blockSpotify) return;
        if (adActive && m.playbackRate !== 16) {
            m.playbackRate = 16;
            m.muted = true;
        }
    }, true);

    function todayKey() {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
    }

    let persistTimer = null;
    let pending = 0;

    function incrementBlockCount() {
        adsBlockedCount++;
        pending++;
        clearTimeout(persistTimer);
        persistTimer = setTimeout(flushStats, 1500);
        try {
            if (chrome.storage.session) {
                chrome.storage.session.get(["sessionAds"], (r) => {
                    if (chrome.runtime.lastError) return;
                    chrome.storage.session.set({ sessionAds: ((r && r.sessionAds) || 0) + 1 });
                });
            }
        } catch { /* ignore */ }
    }

    function flushStats() {
        const delta = pending;
        pending = 0;
        if (!delta) return;
        try {
            chrome.storage.local.get(["adsBlocked", "statsBreakdown", "statsHistory"], (r) => {
                const breakdown = { video: 0, banner: 0, overlay: 0, antiAdblock: 0, spotify: 0, ...(r.statsBreakdown || {}) };
                breakdown.spotify = (breakdown.spotify || 0) + delta;

                const history = [...(r.statsHistory || [])];
                const key = todayKey();
                const entry = history.find((h) => h.date === key);
                if (entry) entry.count += delta;
                else history.push({ date: key, count: delta });

                chrome.storage.local.set({
                    adsBlocked: (r.adsBlocked || 0) + delta,
                    statsBreakdown: breakdown,
                    statsHistory: history.slice(-7),
                });
            });
        } catch { /* ignore */ }
    }

    let observer = null;
    let debounceTimer = null;

    function attachObserver() {
        const bar = getNowPlayingBar();
        const target = bar || document.body;
        if (!target) return;
        if (observer && observer.__fgTarget === target) return;
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        observer = new MutationObserver(() => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(tick, 80);
        });
        observer.__fgTarget = target;
        observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: !!bar,
            attributes: true,
            attributeFilter: ["aria-label", "href", "title"],
        });
    }

    function start() {
        watchSettings();
        postLicense();
        setInterval(() => {
            if (!cachedBar || !cachedBar.isConnected) attachObserver();
            tick();
        }, 300);
        attachObserver();
    }

    loadSettings(start);
})();
