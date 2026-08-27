// FUNNYGAME — MAIN world: chặn QC Spotify trước khi player đọc
(function () {
    let allowLicense = false;
    let adActive = false;
    let authHeader = "";
    let skipLock = 0;
    let didSkipCmd = false;
    const mediaEls = new Set();
    const audioCtxs = new Set();

    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "FG_SPOTIFY_LICENSE") {
            allowLicense = !!msg.ok;
            if (!allowLicense) setAdActive(false);
            return;
        }
        if (msg.type === "FG_SPOTIFY_AD") {
            setAdActive(!!msg.ok && allowLicense);
            if (msg.ok && allowLicense) skipCurrentAd();
        }
    });

    function setAdActive(on) {
        if (on !== adActive) didSkipCmd = false;
        adActive = on;
        window.__fgSpotifyAd = on;
        for (const m of [...mediaEls]) {
            if (!m) continue;
            applyMedia(m);
        }
        for (const ctx of [...audioCtxs]) {
            try {
                for (const src of ctx.__fgSources || []) {
                    if (src && src.playbackRate) src.playbackRate.value = on ? 16 : 1;
                }
            } catch { /* ignore */ }
        }
    }

    function headerVal(headers, name) {
        if (!headers) return "";
        try {
            if (typeof headers.get === "function") return headers.get(name) || "";
            const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
            return key ? String(headers[key]) : "";
        } catch {
            return "";
        }
    }

    function captureAuth(init) {
        const h = init && init.headers;
        const auth = headerVal(h, "authorization");
        if (auth && auth.toLowerCase().startsWith("bearer ")) authHeader = auth;
    }

    function isAdUrl(url) {
        if (!url) return false;
        const u = String(url);
        if (/adeventtracker\.spotify\.com|pixel\.spotify\.com/i.test(u)) return true;
        if (/\/audio\/advertisement/i.test(u)) return true;
        if (/audio-fa(?:b|c)?\.(?:scdn\.co|spotifycdn\.com|spotify\.com)/i.test(u)) return true;
        if (/spotify\.com\/(?:[^/?#]+\/)*(?:ads|ad-logic|ads-event|gabo-receiver-service|sponsoredplaylist)\//i.test(u)) return true;
        if (/doubleclick\.net|googlesyndication\.com|googleadservices\.com/i.test(u)) return true;
        return false;
    }

    function isAdTrack(track) {
        if (!track || typeof track !== "object") return false;
        const meta = track.metadata && typeof track.metadata === "object" ? track.metadata : {};
        const uri = String(track.uri || track.uid || meta.uri || "");
        const provider = String(track.provider || meta.provider || "");
        const name = String(meta.name || meta.title || track.name || "");
        const content = String(track.contentType || meta.content_type || meta["content-type"] || "");
        if (/spotify:ad:|spotify:interruption:/i.test(uri)) return true;
        if (meta.is_advertisement === "true" || meta.is_advertisement === true) return true;
        if (/ads\//i.test(provider)) return true;
        if (/^ad$/i.test(content)) return true;
        if (/^(advertisement|quảng cáo)$/i.test(name.trim())) return true;
        return false;
    }

    function shortenAdStates(data) {
        if (!data || typeof data !== "object") return data;
        const sm = data.state_machine;
        if (sm && Array.isArray(sm.states) && Array.isArray(sm.tracks)) {
            for (const state of sm.states) {
                if (!state || typeof state !== "object") continue;
                const track = sm.tracks[state.track];
                if (!isAdTrack(track)) continue;
                state.duration = 0;
                state.disallow_seeking = false;
                state.restrictions = {};
                if (track.metadata) {
                    track.metadata.duration = "0";
                }
            }
        }
        const cluster = data.cluster || data;
        const ps = cluster && cluster.player_state;
        if (ps && isAdTrack(ps.track)) {
            ps.position = ps.duration || 1;
            if (ps.restrictions) ps.restrictions = {};
        }
        return data;
    }

    function emptyAds() {
        return new Response("{\"ads\":[]}", {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    }

    function jsonResponse(data, response) {
        return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers: { "content-type": "application/json" },
        });
    }

    const origFetch = window.fetch;
    window.fetch = function (input, init) {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        captureAuth(init);
        if (allowLicense && isAdUrl(url)) return Promise.resolve(emptyAds());

        const req = origFetch.apply(this, arguments);
        if (!allowLicense) return req;

        const u = String(url);
        const shouldRewrite = /\/state(?:_conflict)?(?:\?|$)|connect-state|track-playback|\/melody\//i.test(u);
        if (!shouldRewrite) return req;

        return req.then((response) => {
            const copy = response.clone();
            return copy.json().then((data) => jsonResponse(shortenAdStates(data), response)).catch(() => response);
        });
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.__fgSpotifyAd = isAdUrl(url);
        this.__fgSpotifyUrl = url;
        return origOpen.apply(this, arguments);
    };

    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
        if (allowLicense && this.__fgSpotifyAd) {
            Object.defineProperty(this, "readyState", { configurable: true, get: () => 4 });
            Object.defineProperty(this, "status", { configurable: true, get: () => 200 });
            Object.defineProperty(this, "responseText", { configurable: true, get: () => "{\"ads\":[]}" });
            Object.defineProperty(this, "response", { configurable: true, get: () => "{\"ads\":[]}" });
            try {
                this.dispatchEvent(new Event("readystatechange"));
                this.dispatchEvent(new Event("load"));
                this.dispatchEvent(new Event("loadend"));
            } catch { /* ignore */ }
            return;
        }
        return origSend.apply(this, arguments);
    };

    function applyMedia(m) {
        if (!adActive || !m) return;
        try { m.muted = true; } catch { /* ignore */ }
        try { m.volume = 0; } catch { /* ignore */ }
        try { m.playbackRate = 16; } catch { /* ignore */ }
        try {
            if (isFinite(m.duration) && m.duration > 0 && m.currentTime < m.duration - 0.05) {
                m.currentTime = m.duration;
            }
        } catch { /* ignore */ }
    }

    function registerMedia(m) {
        if (!m || mediaEls.has(m)) return;
        mediaEls.add(m);
        applyMedia(m);
    }

    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
        registerMedia(this);
        applyMedia(this);
        return origPlay.apply(this, arguments);
    };

    const origLoad = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function () {
        registerMedia(this);
        return origLoad.apply(this, arguments);
    };

    const origAC = window.AudioContext || window.webkitAudioContext;
    if (origAC) {
        const Wrapped = function (...args) {
            const ctx = new origAC(...args);
            audioCtxs.add(ctx);
            ctx.__fgSources = [];
            try {
                const origBuf = ctx.createBufferSource.bind(ctx);
                ctx.createBufferSource = function () {
                    const src = origBuf();
                    ctx.__fgSources.push(src);
                    if (adActive && src.playbackRate) {
                        try { src.playbackRate.value = 16; } catch { /* ignore */ }
                    }
                    return src;
                };
            } catch { /* ignore */ }
            return ctx;
        };
        Wrapped.prototype = origAC.prototype;
        window.AudioContext = Wrapped;
        if (window.webkitAudioContext) window.webkitAudioContext = Wrapped;
    }

    function findPlayer() {
        const named = [window._listPlayer, window.SpotifyPlayer, window.__fgSpotifyPlayer];
        for (const p of named) {
            if (p && typeof p.next === "function") return p;
        }
        return null;
    }

    async function skipViaApi() {
        if (!authHeader) return false;
        try {
            const res = await origFetch.call(window, "https://api.spotify.com/v1/me/player/next", {
                method: "POST",
                headers: { Authorization: authHeader },
            });
            return res.ok || res.status === 204;
        } catch {
            return false;
        }
    }

    function skipCurrentAd() {
        if (!allowLicense || !adActive) return;
        for (const m of [...mediaEls]) applyMedia(m);
        if (didSkipCmd) return;
        const now = Date.now();
        if (now - skipLock < 1200) return;
        skipLock = now;
        didSkipCmd = true;

        const player = findPlayer();
        if (player && typeof player.next === "function") {
            try {
                const result = player.next("trackdone");
                if (result && typeof result.catch === "function") result.catch(() => {});
                return;
            } catch { /* ignore */ }
        }

        skipViaApi();
    }

    function patchWsData(raw) {
        if (typeof raw !== "string" || raw[0] !== "{") return raw;
        let data;
        try { data = JSON.parse(raw); } catch { return raw; }
        if (!data || typeof data !== "object") return raw;
        const payloads = data.payloads;
        if (!Array.isArray(payloads)) return raw;
        let changed = false;
        for (let i = 0; i < payloads.length; i++) {
            const payload = payloads[i];
            const track = payload && payload.cluster && payload.cluster.player_state && payload.cluster.player_state.track;
            if (isAdTrack(track)) {
                try {
                    payload.cluster.player_state.position = payload.cluster.player_state.duration || 1;
                    payload.cluster.player_state.restrictions = {};
                    changed = true;
                } catch { /* ignore */ }
            }
        }
        return changed ? JSON.stringify(data) : raw;
    }

    const origWsAdd = WebSocket.prototype.addEventListener;
    function wrapWsHandler(fn) {
        if (typeof fn !== "function") return fn;
        return function (event) {
            if (!allowLicense) return fn.call(this, event);
            const next = patchWsData(event.data);
            if (next === event.data) return fn.call(this, event);
            return fn.call(this, new MessageEvent("message", { data: next, origin: event.origin }));
        };
    }
    WebSocket.prototype.addEventListener = function (type, fn, opt) {
        if (type === "message") return origWsAdd.call(this, "message", wrapWsHandler(fn), opt);
        return origWsAdd.call(this, type, fn, opt);
    };
    Object.defineProperty(WebSocket.prototype, "onmessage", {
        configurable: true,
        enumerable: true,
        get() { return this.__fgOnMsg || null; },
        set(fn) {
            this.__fgOnMsg = fn;
            origWsAdd.call(this, "message", wrapWsHandler(fn));
        },
    });
})();
