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
        "tp-yt-paper-dialog ytd-enforcement-message-view-model",
    ];

    const DISMISS_SELECTORS = [
        "button.ytp-ad-overlay-close-button",
        ".ytp-ad-feedback-dialog-close-button",
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

    // Các event tần suất cao — KHÔNG wrap để tránh gây lag/đứng khi lăn chuột
    const SKIP_WRAP_TYPES = new Set([
        "wheel", "mousewheel", "DOMMouseScroll", "scroll",
        "mousemove", "pointermove", "touchmove",
        "mouseenter", "mouseleave", "mouseover", "mouseout",
        "pointerover", "pointerout", "pointerenter", "pointerleave",
        "dragover", "drag",
    ]);

    function hookEventTrust() {
        EventTarget.prototype.addEventListener = function (type, listener, options) {
            if (!listener) {
                return originalAddEventListener.call(this, type, listener, options);
            }

            // Bỏ qua wrap với event tần suất cao
            if (SKIP_WRAP_TYPES.has(type)) {
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
            // Nếu là event bị skip wrap, dùng listener gốc luôn
            if (SKIP_WRAP_TYPES.has(type)) {
                return originalRemoveEventListener.call(this, type, listener, options);
            }
            const wrapped = listenerMap.get(listener) || listener;
            return originalRemoveEventListener.call(this, type, wrapped, options);
        };
    }

    function isVisibleEl(el) {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        if (rect.bottom < 0 || rect.top > (window.innerHeight || 0)) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        return true;
    }

    function isAdPlaying() {
        const player = document.getElementById("movie_player");
        return !!(player && (
            player.classList.contains("ad-showing") ||
            player.classList.contains("ad-interrupting")
        ));
    }

    function resumeMainPlayer() {
        if (isAdPlaying()) return;
        const player = document.getElementById("movie_player");
        const video = document.querySelector("#movie_player video.html5-main-video, video.html5-main-video");
        if (video && video.paused) {
            const p = video.play();
            if (p && typeof p.catch === "function") p.catch(() => {});
        }
        if (player && typeof player.playVideo === "function") {
            try { player.playVideo(); } catch { /* ignore */ }
        }
    }

    function confirmContinueWatching() {
        const pauseRe = /video paused|continue watching|tạm dừng|tam dung|tiếp tục xem|tiep tuc xem|đã tạm dừng|se ha pausado|vidéo en pause/i;
        const dialogs = document.querySelectorAll("yt-confirm-dialog-renderer, tp-yt-paper-dialog");
        for (const dialog of dialogs) {
            const text = (dialog.innerText || "").trim();
            if (!text || !pauseRe.test(text)) continue;
            const btn = dialog.querySelector(
                "#confirm-button button, #confirm-button, button[aria-label='Yes'], button[aria-label='Có'], button[aria-label='OK']"
            );
            if (btn && isVisibleEl(btn)) {
                simulateTrustedClick(btn);
                setTimeout(resumeMainPlayer, 80);
                return true;
            }
        }
        return false;
    }

    function skipViaPlayerAPI() {
        const player = document.getElementById("movie_player");
        if (!isAdPlaying()) return false;
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

    // Thử skip tối đa MAX_RETRY lần, mỗi lần cách nhau RETRY_DELAY ms
    const MAX_RETRY = 3;
    const RETRY_DELAY = 200;

    function skipWithRetry(selectors, attempt) {
        if (!isAdPlaying()) return;

        for (const selector of selectors) {
            const btn = document.querySelector(selector);
            if (btn && isVisibleEl(btn) && simulateTrustedClick(btn)) {
                postCount("video");
                return;
            }
        }

        const surveySkip = document.querySelector(
            ".ytp-ad-skip-ad-slot button, .ytp-ad-survey-player-overlay-skip-or-preview button"
        );
        if (surveySkip && isVisibleEl(surveySkip) && simulateTrustedClick(surveySkip)) {
            postCount("video");
            return;
        }

        if (skipViaPlayerAPI()) {
            postCount("video");
            return;
        }

        if (attempt < MAX_RETRY) {
            setTimeout(() => skipWithRetry(selectors, attempt + 1), RETRY_DELAY);
        }
    }

    function simulateTrustedClick(element) {
        if (!isVisibleEl(element)) return false;

        const rect = element.getBoundingClientRect();

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

    function unlockPageScroll() {
        const html = document.documentElement;
        const body = document.body;
        const lockClasses = [
            "iron-overlay-scroll-block",
            "hidenscroll",
            "no-scroll",
            "disable-scroll",
            "yt-dialog-scroll-disable",
        ];
        [html, body].forEach((el) => {
            if (!el) return;
            lockClasses.forEach((c) => el.classList.remove(c));
            if (el.style.overflow === "hidden" || el.style.overflowY === "hidden") {
                el.style.removeProperty("overflow");
                el.style.removeProperty("overflow-y");
            }
        });
        if (body && body.style.position === "fixed") {
            const y = Math.abs(parseInt(body.style.top || "0", 10)) || 0;
            body.style.removeProperty("position");
            body.style.removeProperty("top");
            body.style.removeProperty("left");
            body.style.removeProperty("width");
            if (y) window.scrollTo(0, y);
        }
        document.querySelectorAll("tp-yt-iron-overlay-backdrop").forEach((backdrop) => {
            const enforcement = document.querySelector("ytd-enforcement-message-view-model");
            if (!enforcement) backdrop.remove();
        });
    }

    function removeAntiAdblock() {
        let removed = false;

        const enforcementContainer = document.querySelector(
            "ytd-enforcement-message-view-model, tp-yt-paper-dialog ytd-enforcement-message-view-model"
        );
        if (enforcementContainer) {
            const dismissBtn = enforcementContainer.querySelector(
                "#dismiss-button, button[aria-label*='Dismiss' i], button[aria-label*='Close' i], button[aria-label*='Đóng' i]"
            ) || enforcementContainer.querySelector("button");
            // Nút có thể bị ẩn bằng CSS — vẫn click để YouTube gỡ khóa scroll
            if (dismissBtn) {
                try { dismissBtn.click(); } catch { /* ignore */ }
                simulateTrustedClick(dismissBtn);
                removed = true;
            }
        }

        for (const selector of ANTI_ADBLOCK_SELECTORS) {
            document.querySelectorAll(selector).forEach((el) => {
                const dialog = el.closest("tp-yt-paper-dialog");
                const target = dialog && dialog.querySelector("ytd-enforcement-message-view-model") ? dialog : el;
                if (target && target !== document.body) {
                    target.remove();
                    removed = true;
                }
            });
        }

        unlockPageScroll();

        if (removed) {
            postCount("antiAdblock");
            setTimeout(() => {
                unlockPageScroll();
                resumeMainPlayer();
            }, 80);
        }

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

        // An toàn: chỉ xử lý nếu video có vẻ giống quảng cáo (ngắn)
        if (video.duration && isFinite(video.duration) && video.duration < 120) {
            if (video.playbackRate !== 16) video.playbackRate = 16;
            video.muted = true;
            if (video.currentTime < video.duration - 0.1) {
                video.currentTime = video.duration;
            }
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
            skipWithRetry(msg.selectors || [], 0);
        }

        if (msg.type === "FG_DISMISS") {
            dismissDialogs();
        }

        if (msg.type === "FG_ANTI_ADBLOCK") {
            confirmContinueWatching();
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
    setInterval(() => {
        confirmContinueWatching();
        removeAntiAdblock();
        unlockPageScroll();
    }, 1500);
})();
