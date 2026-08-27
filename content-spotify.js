// FUNNYGAME — chan quang cao cho Spotify Web Player (open.spotify.com)
// Luu y: chi tac dong duoc tren trinh duyet, khong anh huong app Spotify desktop/mobile.
(function () {
    let isEnabled = false;
    let blockSpotify = true;
    let adsBlockedCount = 0;

    const AD_LABELS = [
        "advertisement", "quảng cáo", "quang cao", "anuncio", "publicité",
        "werbung", "annuncio", "reklam", "реклама", "광고", "広告",
    ];

    const AD_UI_SELECTORS = [
        '[data-testid="ad-slot-container"]',
        '[data-testid="ad-container"]',
        '[data-testid="advertisement"]',
        '[data-testid="ad-tag"]',
        '[data-testid="video-ad"]',
        '[aria-label="Advertisement"]',
        '[aria-label="Quảng cáo"]',
        "div[data-ad-slot]",
        'iframe[src*="doubleclick"]',
        'iframe[src*="googlesyndication"]',
    ];

    const SKIP_AD_SELECTORS = [
        '[data-testid="skip-ad-button"]',
        '[data-testid="ad-skip-button"]',
        'button[aria-label*="Skip ad" i]',
        'button[aria-label*="Skip advert" i]',
        'button[aria-label*="Bỏ qua quảng cáo" i]',
    ];

    let mutedByUs = false;
    let ratedByUs = false;
    let lastSkipAt = 0;
    let adActive = false;

    function postLicense() {
        try { window.postMessage({ type: "FG_SPOTIFY_LICENSE", ok: isEnabled && blockSpotify }, "*"); }
        catch { /* ignore */ }
    }

    function licenseAllows(result) {
        if (result.licenseValid !== true) return false;
        const raw = result.licenseExpires;
        if (!raw) return false;
        const text = String(raw).trim();
        let day = null;
        let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        else {
            m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
            if (m) day = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        }
        if (!day || Number.isNaN(day.getTime())) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return day >= today;
    }

    function loadSettings(cb) {
        try {
            chrome.storage.local.get(["enabled", "settings", "licenseValid", "licenseExpires"], (result) => {
                isEnabled = (result.enabled !== false) && licenseAllows(result);
                blockSpotify = result.settings?.blockSpotify !== false;
                adsBlockedCount = 0;
                postLicense();
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
                if (changes.enabled || changes.licenseValid || changes.licenseExpires || changes.settings) {
                    loadSettings();
                }
            });
        } catch { /* ignore */ }
    }

    function isPlaybackActive() {
        const btn = document.querySelector('[data-testid="control-button-playpause"]');
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
        const label = (widget.getAttribute("aria-label") || "").toLowerCase();
        const text = (widget.innerText || "").toLowerCase();
        const blob = label + " " + text;
        if (AD_LABELS.some((k) => blob.includes(k))) return true;

        const trackLink = widget.querySelector(
            'a[href*="/track/"], a[href*="/album/"], a[href*="/playlist/"], a[href*="/artist/"], a[href*="/episode/"], [data-testid="context-item-link"]'
        );
        if (isPlaybackActive() && !trackLink && text.trim().length > 0 && shortAdMediaPlaying())
            return true;
        return false;
    }

    function isAdPlaying() {
        if (document.querySelector(SKIP_AD_SELECTORS.join(","))) return true;

        const widget = document.querySelector('[data-testid="now-playing-widget"]');
        if (widget && widgetLooksLikeAd(widget)) return true;

        const title = (document.title || "").toLowerCase();
        if (AD_LABELS.some((k) => title.includes(k))) return true;

        const link = document.querySelector('a[data-testid="context-item-link"]');
        if (link) {
            const href = (link.getAttribute("href") || "").toLowerCase();
            if (href.includes("/ad") || href.includes("advertis") || href.includes("spotify:ad:")) return true;
        }
        return false;
    }

    function mediaElements() {
        return Array.from(document.querySelectorAll("video, audio"));
    }

    function trySkipAd() {
        const now = Date.now();
        if (now - lastSkipAt < 1800) return false;
        for (const selector of SKIP_AD_SELECTORS) {
            const btn = document.querySelector(selector);
            if (btn && btn.offsetParent !== null) {
                lastSkipAt = now;
                btn.click();
                return true;
            }
        }
        const next = document.querySelector('[data-testid="control-button-skip-forward"]');
        if (next && !next.disabled && next.offsetParent !== null) {
            lastSkipAt = now;
            next.click();
            return true;
        }
        return false;
    }

    function handleAd() {
        trySkipAd();
        const media = mediaElements();
        for (const m of media) {
            if (!m.muted) { m.muted = true; mutedByUs = true; }
            if (m.playbackRate !== 16) { m.playbackRate = 16; ratedByUs = true; }
            try {
                if (isFinite(m.duration) && m.duration > 0 && m.currentTime < m.duration - 0.2) {
                    m.currentTime = m.duration;
                }
            } catch { /* seek co the bi chan */ }
        }
        hideAdUI();
    }

    function restorePlayback() {
        for (const m of mediaElements()) {
            if (ratedByUs && m.playbackRate === 16) m.playbackRate = 1;
            if (mutedByUs && m.muted) m.muted = false;
        }
        mutedByUs = false;
        ratedByUs = false;
    }

    function hideAdUI() {
        for (const selector of AD_UI_SELECTORS) {
            document.querySelectorAll(selector).forEach((el) => {
                el.style.setProperty("display", "none", "important");
            });
        }
    }

    function tick() {
        if (!isEnabled || !blockSpotify) {
            if (adActive) { restorePlayback(); adActive = false; }
            postLicense();
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
        return new Date().toISOString().slice(0, 10);
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
                    chrome.storage.session.set({ sessionAds: (r.sessionAds || 0) + 1 });
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

    function start() {
        watchSettings();
        postLicense();
        setInterval(tick, 500);
        const observer = new MutationObserver(() => tick());
        const root = document.querySelector('[data-testid="now-playing-bar"]') || document.body;
        observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "href"] });
    }

    loadSettings(start);
})();
