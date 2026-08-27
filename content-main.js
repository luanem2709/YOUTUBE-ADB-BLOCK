(function () {
    const FG_TOKEN = "fg_" + Math.random().toString(36).slice(2) + Date.now().toString(36);

    const AD_KEYS = new Set([
        "adPlacements",
        "playerAds",
        "adSlots",
        "adBreakHeartbeatParams",
        "adBreakParams",
        "adSafetyReason",
    ]);

    const ANTI_ADBLOCK_SELECTORS = [
        "ytd-enforcement-message-view-model",
        ".ytd-enforcement-message-view-model",
        "ytd-popup-container ytd-enforcement-message-view-model",
        "#dialog.ytd-popup-container",
        "tp-yt-paper-dialog ytd-enforcement-message-view-model",
    ];

    const DISMISS_SELECTORS = [
        "button.ytp-ad-overlay-close-button",
        ".ytp-ad-feedback-dialog-close-button",
        "tp-yt-paper-dialog #dismiss-button",
        ".ytp-ad-survey-player-overlay-close-button",
        ".ytp-ad-action-interstitial-close-button",
    ];

    function isValidToken(msg) {
        return msg && msg.token === FG_TOKEN;
    }

    function postCount(category) {
        window.postMessage({ type: "FG_COUNT", category, token: FG_TOKEN }, "*");
    }

    function postIdentity() {
        let loggedIn = false;
        let userKey = "";
        try {
            if (window.ytcfg && typeof window.ytcfg.get === "function") {
                loggedIn = !!window.ytcfg.get("LOGGED_IN");
                userKey = window.ytcfg.get("DELEGATED_SESSION_ID") || "";
            }
        } catch {
            /* ignore */
        }
        window.postMessage({ type: "FG_IDENTITY", token: FG_TOKEN, loggedIn, userKey }, "*");
    }

    function stripAdsDeep(value) {
        if (!value || typeof value !== "object") return value;

        if (Array.isArray(value)) {
            return value.map(stripAdsDeep);
        }

        const out = {};
        for (const [key, val] of Object.entries(value)) {
            if (AD_KEYS.has(key)) continue;
            out[key] = stripAdsDeep(val);
        }
        return out;
    }

    function shouldSanitize(text) {
        return typeof text === "string" &&
            (text.includes("adPlacements") || text.includes("playerAds") || text.includes("adSlots"));
    }

    let allowLicense = false;

    function hookJsonParse() {
        const original = JSON.parse;
        JSON.parse = function (text, reviver) {
            const parsed = original.call(this, text, reviver);
            if (!allowLicense) return parsed;
            if (shouldSanitize(text)) {
                return stripAdsDeep(parsed);
            }
            return parsed;
        };
    }

    function hookFetch() {
        const original = window.fetch;
        window.fetch = async function (...args) {
            const response = await original.apply(this, args);
            const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";

            if (!url.includes("youtube.com/youtubei/") && !url.includes("youtubei/v1/")) {
                return response;
            }

            if (!url.includes("/player") && !url.includes("/browse") && !url.includes("/next") && !url.includes("/reel")) {
                return response;
            }

            try {
                const clone = response.clone();
                const data = await clone.json();
                const cleaned = stripAdsDeep(data);
                return new Response(JSON.stringify(cleaned), {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers,
                });
            } catch {
                return response;
            }
        };
    }

    function hookXhr() {
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this.__fgUrl = url;
            return originalOpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.send = function (...args) {
            this.addEventListener("load", function () {
                const url = this.__fgUrl || "";
                if (!url.includes("youtube.com/youtubei/") && !url.includes("youtubei/v1/")) return;

                try {
                    const text = this.responseText;
                    if (!shouldSanitize(text)) return;
                    const cleaned = JSON.stringify(stripAdsDeep(JSON.parse(text)));
                    Object.defineProperty(this, "responseText", { value: cleaned });
                    Object.defineProperty(this, "response", { value: cleaned });
                } catch {
                    /* ignore */
                }
            });
            return originalSend.apply(this, args);
        };
    }

    const listenerMap = new WeakMap();
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

    function hookEventTrust() {
        EventTarget.prototype.addEventListener = function (type, listener, options) {
            if (!listener) {
                return originalAddEventListener.call(this, type, listener, options);
            }

            let wrapped = listener;

            if (typeof listener === "function") {
                wrapped = function (event) {
                    if (event && event.__simulatedTrusted === true) {
                        const proxy = new Proxy(event, {
                            get(target, prop) {
                                if (prop === "isTrusted") return true;
                                const val = Reflect.get(target, prop);
                                return typeof val === "function" ? val.bind(target) : val;
                            },
                        });
                        return listener.call(this, proxy);
                    }
                    return listener.call(this, event);
                };
                listenerMap.set(listener, wrapped);
            } else if (listener && typeof listener.handleEvent === "function") {
                wrapped = {
                    handleEvent(event) {
                        if (event && event.__simulatedTrusted === true) {
                            const proxy = new Proxy(event, {
                                get(target, prop) {
                                    if (prop === "isTrusted") return true;
                                    const val = Reflect.get(target, prop);
                                    return typeof val === "function" ? val.bind(target) : val;
                                },
                            });
                            return listener.handleEvent(proxy);
                        }
                        return listener.handleEvent(event);
                    },
                };
                listenerMap.set(listener, wrapped);
            }

            return originalAddEventListener.call(this, type, wrapped, options);
        };

        EventTarget.prototype.removeEventListener = function (type, listener, options) {
            const wrapped = listenerMap.get(listener) || listener;
            return originalRemoveEventListener.call(this, type, wrapped, options);
        };
    }

    function skipViaPlayerAPI() {
        const player = document.getElementById("movie_player");
        if (player && typeof player.skipAd === "function") {
            try {
                player.skipAd();
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }

    function simulateTrustedClick(element) {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;

        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const opts = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button: 0,
            buttons: 1,
        };

        [
            { type: "pointerdown", cls: PointerEvent },
            { type: "mousedown", cls: MouseEvent },
            { type: "pointerup", cls: PointerEvent },
            { type: "mouseup", cls: MouseEvent },
            { type: "click", cls: MouseEvent },
        ].forEach(({ type, cls }) => {
            const evt = new cls(type, opts);
            Object.defineProperty(evt, "__simulatedTrusted", { value: true, writable: false });
            element.dispatchEvent(evt);
        });

        try { element.click(); } catch { /* ignore */ }
        return true;
    }

    function dismissDialogs() {
        let dismissed = false;
        for (const selector of DISMISS_SELECTORS) {
            const btn = document.querySelector(selector);
            if (btn && simulateTrustedClick(btn)) dismissed = true;
        }
        return dismissed;
    }

    function removeAntiAdblock() {
        let removed = false;
        for (const selector of ANTI_ADBLOCK_SELECTORS) {
            document.querySelectorAll(selector).forEach((el) => {
                const dialog = el.closest("tp-yt-paper-dialog, ytd-popup-container, #dialog");
                (dialog || el).remove();
                removed = true;
            });
        }

        const dismissBtn = document.querySelector(
            "ytd-enforcement-message-view-model button, ytd-button-renderer.style-primary button"
        );
        if (dismissBtn && simulateTrustedClick(dismissBtn)) removed = true;

        if (removed) postCount("antiAdblock");
        return removed;
    }

    document.addEventListener("ratechange", (e) => {
        const video = e.target;
        if (!video || video.tagName !== "VIDEO") return;

        const player = document.getElementById("movie_player");
        const isAd = player && (
            player.classList.contains("ad-showing") ||
            player.classList.contains("ad-interrupting")
        );

        if (!isAd || !allowLicense) return;

        if (video.playbackRate !== 16) video.playbackRate = 16;
        video.muted = true;
        if (video.duration && isFinite(video.duration) && video.currentTime < video.duration - 0.1) {
            video.currentTime = video.duration;
        }
    }, true);

    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        if (event.data?.type === "FG_LICENSE") {
            allowLicense = !!event.data.ok;
            return;
        }
        if (!isValidToken(event.data)) return;
        if (!allowLicense) return;
        const msg = event.data;

        if (msg.type === "FG_SKIP") {
            if (skipViaPlayerAPI()) {
                postCount("video");
                return;
            }

            const selectors = msg.selectors || [];
            for (const selector of selectors) {
                const btn = document.querySelector(selector);
                if (btn && simulateTrustedClick(btn)) {
                    postCount("video");
                    return;
                }
            }

            const surveySkip = document.querySelector(
                ".ytp-ad-skip-ad-slot button, .ytp-ad-survey-player-overlay-skip-or-preview button"
            );
            if (surveySkip && simulateTrustedClick(surveySkip)) {
                postCount("video");
            }
        }

        if (msg.type === "FG_DISMISS") {
            dismissDialogs();
        }

        if (msg.type === "FG_ANTI_ADBLOCK") {
            removeAntiAdblock();
        }
    });

    hookJsonParse();
    hookFetch();
    hookXhr();
    hookEventTrust();

    window.postMessage({ type: "FG_TOKEN_READY", token: FG_TOKEN }, "*");

    postIdentity();
    setInterval(postIdentity, 5000);
    setInterval(removeAntiAdblock, 3000);
})();
