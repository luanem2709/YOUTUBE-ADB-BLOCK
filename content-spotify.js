// FUNNYGAME — chan quang cao cho Spotify Web Player (open.spotify.com)
// Luu y: chi tac dong duoc tren trinh duyet, khong anh huong app Spotify desktop/mobile.
(function () {
    let isEnabled = true;
    let blockSpotify = true;
    let adsBlockedCount = 0;

    // Cac tu khoa nhan dien quang cao tren thanh phat (nhieu ngon ngu)
    const AD_LABELS = ["advertisement", "quảng cáo", "quang cao", "anuncio", "publicité", "werbung", "annuncio"];

    // Selector an cac o quang cao hien thi (leaderboard/billboard/upsell)
    const AD_UI_SELECTORS = [
        '[data-testid="ad-slot-container"]',
        '[data-testid="ad-container"]',
        '[data-testid="advertisement"]',
        '[aria-label="Advertisement"]',
        'div[data-ad-slot]',
        'iframe[src*="doubleclick"]',
        'iframe[src*="googlesyndication"]',
    ];

    let mutedByUs = false;
    let ratedByUs = false;

    function loadSettings(cb) {
        try {
            chrome.storage.local.get(["enabled", "settings"], (result) => {
                isEnabled = result.enabled !== undefined ? result.enabled : true;
                blockSpotify = result.settings?.blockSpotify !== false; // mac dinh bat
                adsBlockedCount = 0;
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
                if (changes.enabled) isEnabled = changes.enabled.newValue;
                if (changes.settings) blockSpotify = changes.settings.newValue?.blockSpotify !== false;
            });
        } catch { /* ignore */ }
    }

    function nowPlayingText() {
        const widget = document.querySelector('[data-testid="now-playing-widget"]');
        if (widget) {
            const label = (widget.getAttribute("aria-label") || "").toLowerCase();
            if (label) return label;
        }
        const title = document.querySelector('[data-testid="context-item-info-title"], [data-testid="nowplaying-track-link"]');
        return (title?.textContent || "").toLowerCase();
    }

    function isAdPlaying() {
        const text = nowPlayingText();
        if (text && AD_LABELS.some((k) => text.includes(k))) return true;

        // Dau hieu phu: link bai hat tro toi quang cao
        const link = document.querySelector('a[data-testid="context-item-link"]');
        if (link) {
            const href = (link.getAttribute("href") || "").toLowerCase();
            if (href.includes("/ad") || href.includes("advertis")) return true;
        }
        return false;
    }

    function mediaElements() {
        return Array.from(document.querySelectorAll("video, audio"));
    }

    function handleAd() {
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
        incrementBlockCount();
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

    let adActive = false;

    function tick() {
        if (!isEnabled || !blockSpotify) {
            if (adActive) { restorePlayback(); adActive = false; }
            return;
        }
        const ad = isAdPlaying();
        if (ad) {
            adActive = true;
            handleAd();
        } else if (adActive) {
            adActive = false;
            restorePlayback();
        }
    }

    // Neu Spotify tu chinh lai toc do khi dang quang cao thi ep lai
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
        // Kiem tra dinh ky (SPA thay doi lien tuc); nhe, 700ms/lan
        setInterval(tick, 700);
        // Theo doi DOM de phan ung nhanh khi doi bai/quang cao
        const observer = new MutationObserver(() => tick());
        const root = document.querySelector('[data-testid="now-playing-bar"]') || document.body;
        observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "href"] });
    }

    loadSettings(start);
})();
