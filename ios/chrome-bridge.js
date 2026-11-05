// FUNNYGAME — Cầu nối WebExtension API (chrome.*) cho ứng dụng iOS độc lập (WKWebView)
// Đồng bộ trực tiếp với UserDefaults trên iOS thông qua window.webkit.messageHandlers.fgBridge.
(function () {
    if (window.__fgIosBridgeReady) return;
    window.__fgIosBridgeReady = true;

    const DEFAULTS = {
        enabled: true,
        licenseValid: false,
        licenseExpires: "",
        licenseKey: "",
        adsBlocked: 0,
        dailyGoal: 50,
        whitelistChannels: [],
        statsBreakdown: { video: 0, banner: 0, overlay: 0, antiAdblock: 0, shopping: 0, spotify: 0 },
        statsHistory: [],
        userStats: { currentId: "guest", users: {} },
        settings: {
            blockVideo: true,
            blockBanner: true,
            blockOverlay: true,
            blockAntiAdblock: true,
            blockShopping: true,
            muteAds: true,
            fastSkip: true,
            blockManifest: true,
            blockSpotify: true,
            backgroundPlay: true,
            pipButton: true,
            hideUpsell: true,
            videoQuality: "auto",
            sponsorBlock: true,
            jumpAhead: true,
            ambientGlow: true,
            customLogo: true,
        },
    };

    const initialLocal = (window.__FG_IOS_INITIAL_STORAGE__ && typeof window.__FG_IOS_INITIAL_STORAGE__ === "object")
        ? window.__FG_IOS_INITIAL_STORAGE__
        : {};
    const localStore = {
        ...DEFAULTS,
        ...initialLocal,
        settings: { ...DEFAULTS.settings, ...(initialLocal.settings || {}) },
        statsBreakdown: { ...DEFAULTS.statsBreakdown, ...(initialLocal.statsBreakdown || {}) },
    };
    const sessionStore = (window.__FG_IOS_INITIAL_SESSION__ && typeof window.__FG_IOS_INITIAL_SESSION__ === "object")
        ? { ...window.__FG_IOS_INITIAL_SESSION__ }
        : {};

    const storageListeners = new Set();
    const messageListeners = new Set();

    function postNative(payload) {
        try {
            if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fgBridge) {
                window.webkit.messageHandlers.fgBridge.postMessage(payload);
            }
        } catch { /* ignore */ }
    }

    function clone(val) {
        try { return JSON.parse(JSON.stringify(val)); } catch { return val; }
    }

    function pickKeys(store, keys) {
        if (keys == null) return clone(store);
        if (typeof keys === "string") {
            return { [keys]: clone(store[keys]) };
        }
        if (Array.isArray(keys)) {
            const out = {};
            for (const k of keys) {
                if (k in store) out[k] = clone(store[k]);
            }
            return out;
        }
        if (typeof keys === "object") {
            const out = {};
            for (const k of Object.keys(keys)) {
                out[k] = (k in store && store[k] !== undefined) ? clone(store[k]) : clone(keys[k]);
            }
            return out;
        }
        return {};
    }

    function notifyStorageChange(changes, area) {
        if (!changes || !Object.keys(changes).length) return;
        for (const fn of storageListeners) {
            try { fn(clone(changes), area); } catch { /* ignore */ }
        }
    }

    // Được gọi từ Swift khi WKWebView khác (ví dụ popup.html) cập nhật dữ liệu
    window.__fgOnExternalStorageChange = function (patch, area) {
        if (!patch || typeof patch !== "object") return;
        const target = area === "session" ? sessionStore : localStore;
        const changes = {};
        for (const k of Object.keys(patch)) {
            const oldValue = clone(target[k]);
            const newValue = clone(patch[k]);
            target[k] = newValue;
            changes[k] = { oldValue, newValue };
        }
        notifyStorageChange(changes, area || "local");
    };

    // Được gọi từ Swift để chuyển tiếp message từ popup sang tab chính (ví dụ FG_COLLECT_DIAG)
    window.__fgDispatchRuntimeMessage = function (msg, reqId) {
        let responded = false;
        const sendResponse = (res) => {
            if (responded) return;
            responded = true;
            if (reqId) postNative({ action: "tabMessageResponse", reqId, response: res || null });
        };
        for (const fn of messageListeners) {
            try {
                const asyncFlag = fn(msg, { id: "funnygame-ios", tab: { id: 1, url: location.href } }, sendResponse);
                if (asyncFlag === true) return;
            } catch { /* ignore */ }
        }
        if (!responded && reqId) sendResponse(null);
    };

    const pendingTabCallbacks = new Map();
    window.__fgResolveTabMessage = function (reqId, response) {
        const cb = pendingTabCallbacks.get(reqId);
        if (cb) {
            pendingTabCallbacks.delete(reqId);
            try { cb(response); } catch { /* ignore */ }
        }
    };

    function makeStorageArea(store, areaName) {
        return {
            get(keys, cb) {
                const res = pickKeys(store, keys);
                if (typeof cb === "function") {
                    setTimeout(() => { try { cb(res); } catch { /* ignore */ } }, 0);
                }
                return Promise.resolve(res);
            },
            set(patch, cb) {
                const changes = {};
                if (patch && typeof patch === "object") {
                    for (const k of Object.keys(patch)) {
                        const oldValue = clone(store[k]);
                        const newValue = clone(patch[k]);
                        store[k] = newValue;
                        changes[k] = { oldValue, newValue };
                    }
                    postNative({ action: "storageSet", area: areaName, patch: clone(patch) });
                    notifyStorageChange(changes, areaName);
                }
                if (typeof cb === "function") {
                    setTimeout(() => { try { cb(); } catch { /* ignore */ } }, 0);
                }
                return Promise.resolve();
            },
            remove(keys, cb) {
                const list = Array.isArray(keys) ? keys : [keys];
                const changes = {};
                for (const k of list) {
                    if (k in store) {
                        changes[k] = { oldValue: clone(store[k]) };
                        delete store[k];
                    }
                }
                postNative({ action: "storageRemove", area: areaName, keys: list });
                notifyStorageChange(changes, areaName);
                if (typeof cb === "function") {
                    setTimeout(() => { try { cb(); } catch { /* ignore */ } }, 0);
                }
                return Promise.resolve();
            },
            setAccessLevel() { return Promise.resolve(); },
        };
    }

    const SB_CATEGORIES = ["sponsor", "selfpromo", "interaction"];
    const sbCache = new Map();

    async function sha256Hex(text) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    async function fetchSponsorSegments(videoId) {
        if (!/^[\w-]{6,20}$/.test(String(videoId || ""))) return [];
        if (sbCache.has(videoId)) return sbCache.get(videoId);
        let segments = [];
        try {
            const prefix = (await sha256Hex(videoId)).slice(0, 4);
            const url = "https://sponsor.ajay.app/api/skipSegments/" + prefix +
                "?categories=" + encodeURIComponent(JSON.stringify(SB_CATEGORIES)) +
                "&actionTypes=" + encodeURIComponent(JSON.stringify(["skip"]));
            const res = await fetch(url);
            if (res.ok) {
                const list = await res.json();
                const hit = Array.isArray(list) ? list.find((v) => v && v.videoID === videoId) : null;
                segments = ((hit && hit.segments) || [])
                    .filter((x) => x && Array.isArray(x.segment) && SB_CATEGORIES.includes(x.category) && (x.actionType || "skip") === "skip")
                    .map((x) => ({ start: Number(x.segment[0]), end: Number(x.segment[1]), category: x.category, uuid: String(x.UUID || "") }))
                    .filter((x) => isFinite(x.start) && isFinite(x.end) && x.end - x.start >= 1);
            }
        } catch { /* ignore */ }
        sbCache.set(videoId, segments);
        return segments;
    }

    function handleRuntimeMessage(msg, cb) {
        const reply = (val) => {
            if (typeof cb === "function") {
                setTimeout(() => { try { cb(val); } catch { /* ignore */ } }, 0);
            }
            return Promise.resolve(val);
        };
        if (!msg || typeof msg !== "object") return reply({ ok: false });

        if (msg.type === "FG_OPEN_PANEL") {
            postNative({ action: "openPanel", page: "popup.html" });
            return reply({ ok: true });
        }
        if (msg.type === "LICENSE_SYNC") {
            postNative({ action: "licenseSync" });
            return reply({ ok: true });
        }
        if (msg.type === "FG_MUTE_TAB") {
            try {
                document.querySelectorAll("video, audio").forEach((m) => { m.muted = !!msg.muted; });
            } catch { /* ignore */ }
            return reply({ ok: true });
        }
        if (msg.type === "FG_SB_SEGMENTS") {
            if (localStore.settings && localStore.settings.sponsorBlock === false) {
                return reply({ segments: [] });
            }
            return fetchSponsorSegments(msg.videoId).then((segments) => {
                if (typeof cb === "function") {
                    try { cb({ segments }); } catch { /* ignore */ }
                }
                return { segments };
            });
        }
        return reply({ ok: true });
    }

    const I18N_MAP = {
        extName: "FUNNYGAME Chặn Quảng Cáo YouTube & Spotify",
        extDescription: "Chặn quảng cáo YouTube 3 lớp và Spotify Web Player.",
    };

    window.chrome = window.chrome || {};
    window.chrome.storage = {
        local: makeStorageArea(localStore, "local"),
        session: makeStorageArea(sessionStore, "session"),
        onChanged: {
            addListener(fn) { if (typeof fn === "function") storageListeners.add(fn); },
            removeListener(fn) { storageListeners.delete(fn); },
        },
    };

    window.chrome.runtime = {
        id: "funnygame-ios-app",
        lastError: null,
        getManifest() {
            return {
                name: I18N_MAP.extName,
                description: I18N_MAP.extDescription,
                version: window.__FG_IOS_VERSION__ || "2.4.15",
                manifest_version: 3,
            };
        },
        getURL(path) {
            const clean = String(path || "").replace(/^\//, "");
            if (clean === "images/fg-logo-yt.png" && window.__FG_IOS_LOGO_DATA_URL__) {
                return window.__FG_IOS_LOGO_DATA_URL__;
            }
            if (clean === "images/icon48.png" && window.__FG_IOS_ICON_DATA_URL__) {
                return window.__FG_IOS_ICON_DATA_URL__;
            }
            return clean;
        },
        sendMessage(msg, cb) {
            return handleRuntimeMessage(msg, cb);
        },
        onMessage: {
            addListener(fn) { if (typeof fn === "function") messageListeners.add(fn); },
            removeListener(fn) { messageListeners.delete(fn); },
        },
    };

    window.chrome.tabs = {
        query(_queryInfo, cb) {
            const tabs = [{ id: 1, active: true, url: window.__FG_IOS_MAIN_URL__ || location.href }];
            if (typeof cb === "function") {
                setTimeout(() => { try { cb(tabs); } catch { /* ignore */ } }, 0);
            }
            return Promise.resolve(tabs);
        },
        sendMessage(_tabId, msg, cb) {
            const reqId = "req_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
            return new Promise((resolve) => {
                const timer = setTimeout(() => {
                    pendingTabCallbacks.delete(reqId);
                    if (typeof cb === "function") { try { cb(null); } catch { /* ignore */ } }
                    resolve(null);
                }, 2500);
                pendingTabCallbacks.set(reqId, (res) => {
                    clearTimeout(timer);
                    if (typeof cb === "function") { try { cb(res); } catch { /* ignore */ } }
                    resolve(res);
                });
                postNative({ action: "sendMessageToMainTab", reqId, msg });
            });
        },
        create(createProperties, cb) {
            const url = (createProperties && createProperties.url) || "";
            if (/stats\.html|options\.html|popup\.html/i.test(url)) {
                const page = url.split("/").pop();
                postNative({ action: "openPanel", page });
            } else if (url) {
                postNative({ action: "openUrl", url });
            }
            if (typeof cb === "function") {
                setTimeout(() => { try { cb({ id: 2, url }); } catch { /* ignore */ } }, 0);
            }
            return Promise.resolve({ id: 2, url });
        },
        update(_tabId, _updateProps, cb) {
            if (typeof cb === "function") setTimeout(() => { try { cb({}); } catch { /* ignore */ } }, 0);
            return Promise.resolve({});
        },
    };

    window.chrome.i18n = {
        getMessage(key) {
            return I18N_MAP[key] || "";
        },
    };
})();
