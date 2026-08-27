// FUNNYGAME — MAIN world: chan request quang cao Spotify truoc khi player doc
(function () {
    let allowLicense = false;

    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.type !== "FG_SPOTIFY_LICENSE") return;
        allowLicense = !!msg.ok;
    });

    function isAdUrl(url) {
        if (!url) return false;
        const u = String(url);
        if (/adeventtracker\.spotify\.com|pixel\.spotify\.com/i.test(u)) return true;
        if (/\/audio\/advertisement/i.test(u)) return true;
        if (/spotify\.com\/(?:[^/?#]+\/)*(?:ads|ad-logic|gabo-receiver-service)\//i.test(u)) return true;
        if (/doubleclick\.net|googlesyndication\.com|googleadservices\.com/i.test(u) && /spotify/i.test(u)) return true;
        return false;
    }

    function emptyAds() {
        return new Response("{\"ads\":[]}", {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    }

    const origFetch = window.fetch;
    window.fetch = function (input, init) {
        const url = typeof input === "string" ? input : input && input.url;
        if (allowLicense && isAdUrl(url)) return Promise.resolve(emptyAds());
        return origFetch.apply(this, arguments);
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.__fgSpotifyAd = isAdUrl(url);
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
})();
