/* Nút trên trang, chỉ có trong gói điện thoại. Toolbar extension trên Android thường bị khuất. */
(function () {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const narrow = window.matchMedia("(max-width: 900px)").matches;
    const mobileHost = location.hostname === "m.youtube.com";
    if (!coarse && !narrow && !mobileHost) return;
    if (document.getElementById("fg-mobile-open")) return;

    function mount() {
        if (document.getElementById("fg-mobile-open")) return;
        const btn = document.createElement("button");
        btn.id = "fg-mobile-open";
        btn.type = "button";
        btn.textContent = "Chặn QC";
        btn.setAttribute("aria-label", "Mở bảng điều khiển chặn quảng cáo");
        btn.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            try {
                chrome.runtime.sendMessage({ type: "FG_OPEN_PANEL" });
            } catch { /* trang đã đóng extension */ }
        });
        (document.body || document.documentElement).appendChild(btn);

        let settleTimer = null;
        window.addEventListener("scroll", () => {
            btn.classList.add("fg-mobile-scrolling");
            clearTimeout(settleTimer);
            settleTimer = setTimeout(() => btn.classList.remove("fg-mobile-scrolling"), 450);
        }, { passive: true });
    }

    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount, { once: true });
})();
