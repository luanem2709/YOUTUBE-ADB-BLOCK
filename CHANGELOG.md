# Changelog

## [Chưa phát hành] — Giai đoạn 2: Gia cố cầu nối JS-Native (Bridge Hardening)

### Bảo mật
- **Host whitelist cho gBridge** (ViewController.swift): thêm isAllowedBridgeHost() và guard ở đầu userContentController(_:didReceive:) — từ chối mọi tin nhắn không từ *.youtube.com, *.spotify.com hoặc localhost (panel). Trước đây bất kỳ trang nào trong WebView cũng có thể gọi storageSet, shareUrl, copyClipboard, 
owPlaying, v.v. (privilege escalation / UXSS).<br>- **Strip license keys khỏi window.__FG_IOS_INITIAL_STORAGE__** (stripLicenseKeysFromJson): 5 trường nhạy cảm (licenseKey, licenseToken, licenseSig, licenseValid, licenseExpires) bị loại bỏ trước khi inject vào page world. license.js vẫn đọc được chúng qua chrome.storage.local.get() (native handler tra UserDefaults trực tiếp, không qua page world).<br>

### Test
- 	ests/bridge.test.js (12 kiểm tra static): B1–B4 kiểm tra Swift host whitelist, B5–B8 kiểm tra stripLicenseKeysFromJson, B9–B12 kiểm tra chrome-bridge.js / license.js không lộ license key. Tổng: **403 PASS, 0 FAIL**.<br>


## [ChÆ°a phÃ¡t hÃ nh] â€” Giai Ä‘oáº¡n 1: nháº­t kÃ½ cháº©n Ä‘oÃ¡n cá»¥c bá»™ + tÆ°Æ¡ng thÃ­ch iOS 15

### ThÃªm â€” Nháº­t kÃ½ cháº©n Ä‘oÃ¡n (iOS), khÃ´ng dá»¯ liá»‡u nháº­n dáº¡ng
- **`ios/diag-schema.json`** lÃ  nguá»“n sá»± tháº­t duy nháº¥t; Swift (`DiagLog`) vÃ  JS (`ios/diag.js`) cÃ¹ng Ä‘á»c. Schema **khÃ´ng cÃ³ trÆ°á»ng vÄƒn báº£n tá»± do** (chá»‰ enum, sá»‘ nguyÃªn cÃ³ khoáº£ng, boolean, chuá»—i khá»›p máº«u cháº·t) â‡’ khÃ´ng thá»ƒ ghi Ä‘á»‹a chá»‰ trang, mÃ£ video, key, IP hay mÃ£ thiáº¿t bá»‹. Sá»± kiá»‡n/trÆ°á»ng ngoÃ i schema bá»‹ bá».
- **Chá»‰ lÆ°u trÃªn mÃ¡y** (Application Support, loáº¡i khá»i sao lÆ°u), tá»‘i Ä‘a 200 sá»± kiá»‡n / 64 KB, â‰¤ 6 sá»± kiá»‡n má»—i loáº¡i má»—i phÃºt; khÃ´ng cÃ³ mÃ£ máº¡ng nÃ o. Máº·c Ä‘á»‹nh **báº­t**; CÃ i Ä‘áº·t â†’ "Cháº©n Ä‘oÃ¡n (iPhone)" cÃ³ cÃ´ng táº¯c, nÃºt **Xuáº¥t cháº©n Ä‘oÃ¡n** (báº£ng chia sáº» iOS, ngÆ°á»i dÃ¹ng tá»± chá»n nÆ¡i gá»­i) vÃ  **XoÃ¡ nháº­t kÃ½**.
- **Sá»± kiá»‡n native:** má»Ÿ app, mÃ´i trÆ°á»ng (phiÃªn báº£n iOS chÃ­nh.phá»¥, iPhone/iPad, báº£n app), cáº£nh bÃ¡o bá»™ nhá»›, tiáº¿n trÃ¬nh WebContent bá»‹ iOS kill, lá»—i Ä‘iá»u hÆ°á»›ng, giÃ¡n Ä‘oáº¡n Ã¢m thanh.
- **Tá»± cháº©n Ä‘oÃ¡n JS:** káº¹t quáº£ng cÃ¡o (20s/60s/180s), tua nhanh bá»‹ káº¹t (â‰¥8x khi khÃ´ng cÃ³ QC), lá»—i trÃ¬nh phÃ¡t, nghi ngá» nháº­n diá»‡n nháº§m QC (video chÃ­nh bá»‹ áº©n/mute rá»“i nháº£y sÃ¡t cuá»‘i), vÃ  thÄƒm dÃ² tÆ°Æ¡ng thÃ­ch (cá» boolean: `:has()`, `dvh`, PiP, `AudioContext`, MSE, VP9/AV1/AVC/Opus/HLSâ€¦).
- **Cháº·n nguá»“n:** sá»± kiá»‡n tá»« trang chá»‰ nháº­n tá»« khung chÃ­nh cá»§a tab YouTube/Spotify; lá»‡nh xuáº¥t/xoÃ¡/báº­t-táº¯t chá»‰ nháº­n tá»« báº£ng Ä‘iá»u khiá»ƒn native.

### Sá»­a â€” Tiáº¿n trÃ¬nh WebContent bá»‹ iOS kill
- TrÆ°á»›c Ä‘Ã¢y app khÃ´ng cÃ³ `webViewWebContentProcessDidTerminate` nÃªn trang tráº¯ng/Ä‘Æ¡ khÃ´ng tá»± phá»¥c há»“i. Nay tá»± náº¡p láº¡i (cháº·n vÃ²ng láº·p: tá»‘i Ä‘a 2 láº§n / 30 giÃ¢y) vÃ  ghi sá»± kiá»‡n cháº©n Ä‘oÃ¡n.

### Sá»­a â€” TÆ°Æ¡ng thÃ­ch iOS 15.0â€“15.3 (sÃ n há»— trá»£: iOS 15.0)
- **`:has()` tÃ¡ch khá»i nhÃ³m selector** (`content.css` Ã—2 rule, CSS nhÃºng trong `chrome-bridge.js` Ã—1 rule): trÃ¬nh duyá»‡t chÆ°a há»— trá»£ (iOS < 15.4) bá» **cáº£ rule** náº¿u selector nÃ y náº±m chung nhÃ³m, kÃ©o theo ~40 selector cháº·n banner/upsell (gá»“m cáº£ YT Music vÃ  `m.youtube.com`).
- `100dvh` cÃ³ dá»± phÃ²ng `100vh`; `-webkit-backdrop-filter` cho `popup.css`.

### Test / CI
- `tests/diag.html` (25 kiá»ƒm tra), `tests/diag.test.js` (17: schema, tá»« chá»‘i URL/mÃ£ video/key/IP/UUID, khá»›p Swiftâ†”JSâ†”schema, kiá»ƒm soÃ¡t nguá»“n tin nháº¯n), `tests/compat.test.js` (7; cá»•ng tÆ°Æ¡ng thÃ­ch iOS 15.0 â€” Ä‘Ã£ kiá»ƒm chá»©ng **FAIL Ä‘Ãºng 3 lá»—i tháº­t** trÆ°á»›c khi sá»­a), `tests/mkpopup.js` thÃªm Q1â€“Q6. ChÆ°a Ä‘o chi phÃ­ cháº¡y cá»§a cháº©n Ä‘oÃ¡n (runner dÃ¹ng thá»i gian áº£o); cáº§n Ä‘o trÃªn thiáº¿t bá»‹.
- CI: `node --check` thÃªm `ios/chrome-bridge.js`, `ios/diag.js`, `mobile/mobile-ui.js` (trÆ°á»›c Ä‘Ã¢y khÃ´ng Ä‘Æ°á»£c kiá»ƒm tra) vÃ  kiá»ƒm tra JSON schema.
- **Giá»›i háº¡n:** pháº§n Swift khÃ´ng cháº¡y Ä‘Æ°á»£c test trÃªn Windows; chá»‰ kiá»ƒm báº±ng bá»™ test tÄ©nh á»Ÿ trÃªn + build trÃªn macOS (GitHub Actions) + mÃ¡y tháº­t.

## [ChÆ°a phÃ¡t hÃ nh] â€” Giai Ä‘oáº¡n 0: vÃ¡ báº£o máº­t mÃ¡y chá»§ key & installer

### Báº£o máº­t
- **Cháº·n formula injection vÃ o Google Sheet (`server/Code.gs`):** `hwid` vÃ  `user` tá»« internet Ä‘Æ°á»£c lÃ m sáº¡ch (`sanitizeHwid_`: chá»‰ `[A-Za-z0-9._-]`, â‰¤64 kÃ½ tá»±; `sanitizeUser_`: chá»¯ Latin/Viá»‡t, sá»‘, dáº¥u cÃ¡ch `._-`, â‰¤40 kÃ½ tá»±; khÃ´ng báº¯t Ä‘áº§u báº±ng `= + - @`) vÃ  luÃ´n ghi dÆ°á»›i dáº¡ng **vÄƒn báº£n thuáº§n** (Ä‘á»‹nh dáº¡ng Ã´ `@`). Hai hÃ m nÃ y idempotent nÃªn mÃ£ mÃ¡y Ä‘Ã£ lÆ°u tá»« trÆ°á»›c váº«n khá»›p.
- **KhÃ´ng tráº£ lá»—i ná»™i bá»™ cho client:** chi tiáº¿t lá»—i chá»‰ ghi log; `waitLock` quÃ¡ háº¡n tráº£ JSON "mÃ¡y chá»§ báº­n" thay vÃ¬ trang lá»—i.
- **Key sinh ngáº«u nhiÃªn báº±ng `Utilities.getUuid()`** (loáº¡i Ä‘á»™ lá»‡ch) thay cho bá»™ sinh sá»‘ giáº£ ngáº«u nhiÃªn thÆ°á»ng.
- **Gá»¡ key máº«u plaintext:** xoÃ¡ `seedKeys_`/`seedKeys`; `keys.csv` khÃ´ng cÃ²n Ä‘Æ°á»£c theo dÃµi (thÃªm vÃ o `.gitignore`, thay báº±ng `keys.example.csv` toÃ n dá»¯ liá»‡u giáº£).
- **Installer:** bá» báº£ng hash key cá»©ng `LocalHashes` (má»Ÿ khoÃ¡ offline, khÃ´ng thu há»“i Ä‘Æ°á»£c) vÃ  Ä‘Æ°á»ng Ä‘á»c CSV cÃ´ng khai cá»§a Google Sheet; thiáº¿u mÃ¡y chá»§ key thÃ¬ khÃ´ng má»Ÿ khoÃ¡ (fail closed). **Pháº£i phÃ¡t hÃ nh installer má»›i vÃ  ngá»«ng phÃ¢n phá»‘i báº£n cÅ©** â€” báº£n cÅ© váº«n cháº¥p nháº­n cÃ¡c hash cÅ©.
- **Viá»‡c cáº§n lÃ m phÃ­a Google (khÃ´ng náº±m trong mÃ£):** Ä‘áº·t Sheet vá» "Restricted", vÃ´ hiá»‡u hoÃ¡ cÃ¡c dÃ²ng key máº«u, deploy láº¡i `Code.gs` má»›i (runtime V8).

### Test
- `tests/server.test.js` thÃªm S12â€“S21 (cÃ´ng thá»©c `=IMPORTXML`, `+cmd`, `@SUM`, `-2+3`, chuá»—i dÃ i, mÃ£ mÃ¡y cÅ©, tÃªn tiáº¿ng Viá»‡t/emoji, lá»—i khoÃ¡ há»ng, háº¿t thá»i gian chá» khoÃ¡, phÃ¢n bá»‘ key, Ä‘á»“ng bá»™ hai báº£n `Code.gs`, fuzz 1500 chuá»—i). Cháº¡y trÃªn `Code.gs` cÅ© thÃ¬ S12, S13, S15, S16, S17, S19, S20, S21 **FAIL** (Ä‘Ã£ kiá»ƒm chá»©ng).
- `tests/secrets.test.js` (má»›i, cháº¡y trong `npm test`/CI): khÃ´ng khoÃ¡ riÃªng, token, key cáº¥p phÃ©p tháº­t, hash key cá»©ng, link xuáº¥t CSV Sheet cÃ´ng khai, `keys.csv` trong file Ä‘Æ°á»£c git theo dÃµi.

## [2.4.15] â€” 2026-10-31

### Sá»­a â€” RÃ² rá»‰ bá»™ nhá»› + giáº£m táº£i CPU (vÃ²ng quÃ©t thÃ­ch á»©ng)
Báº£n 2.4.14 cháº¡y á»•n nhÆ°ng audit sÃ¢u phÃ¡t hiá»‡n **3 váº¥n Ä‘á» tháº­t** vá» bá»™ nhá»›/CPU khi xem YouTube lÃ¢u (vÃ i giá») hoáº·c má»Ÿ nhiá»u tab.

- **RÃ² rá»‰ bá»™ nhá»› â€” `MutationObserver` khÃ´ng bao giá» Ä‘Æ°á»£c ngáº¯t (`content-main.js`):**
  Má»—i player YouTube Ä‘Æ°á»£c gáº¯n 1 `MutationObserver` theo dÃµi class. Closure cá»§a observer giá»¯ tham chiáº¿u **máº¡nh** tá»›i player (vÃ  toÃ n bá»™ cÃ¢y con cá»§a nÃ³). NhÆ°ng code cÅ© chá»‰ lÃ  `knownPlayers.delete(p)` â€” **khÃ´ng gá»i `disconnect()`** â†’ má»—i láº§n YouTube thay player (SPA Ä‘iá»u hÆ°á»›ng) giá»¯ láº¡i player cÅ© vÄ©nh viá»…n.
  â†’ ThÃªm `releasePlayer()`: `disconnect()` observer + `unobserve()` vÃ¹ng UI QC + xoÃ¡ khá»i `knownPlayers` / `playerObservers` / `adUiZones`. ÄÆ°á»£c gá»i tá»± Ä‘á»™ng khi phÃ¡t hiá»‡n player Ä‘Ã£ bá»‹ gá»¡ khá»i DOM.

- **Giáº£m táº£i CPU â€” vÃ²ng quÃ©t thÃ­ch á»©ng (`content-main.js` + `content.js`):**
  VÃ²ng quÃ©t chÃ­nh cháº¡y cá»©ng **300ms** vÃ  quÃ©t banner má»—i **450ms**, ká»ƒ cáº£ khi:
  - tab Ä‘ang áº©n (ngÆ°á»i dÃ¹ng xem video á»Ÿ tab khÃ¡c) â†’ Ä‘á»‘t CPU vÃ´ Ã­ch
  - extension Ä‘Ã£ táº¯t / kÃªnh bá»‹ whitelist
  â†’ **Tab áº©n hoáº·c extension khÃ´ng hoáº¡t Ä‘á»™ng â†’ nhá»‹p quÃ©t giáº£m cÃ²n 1500ms (`content-main.js`) / 2000ms (`content.js`)**, tá»± quay láº¡i nhá»‹p nhanh ngay khi tab hiá»‡n láº¡i (qua `visibilitychange`) hoáº·c khi báº­t/táº¯t extension (`applyConfig` â†’ `refreshLoopRate()`).

- **Dá»n hiá»‡u á»©ng ngay khi táº¯t báº£o vá»‡ (`content-main.js`):**
  VÃ¬ vÃ²ng quÃ©t cÃ³ thá»ƒ cháº­m tá»›i 1.5s, khi táº¯t extension hiá»‡u á»©ng Ã¡nh sÃ¡ng ná»n (ambient), class `fg-ad-active`, nÃºt PiP vÃ  nÃºt tua Ä‘á»u bá»‹ giá»¯ láº¡i thÃªm tá»›i 1.5s. â†’ Gá»i `teardownAmbient()` / `setAdActive(false)` / `stopFastAdLoop()` / `ensurePipButton()` / `ensureJumpButton()` **ngay láº­p tá»©c** trong handler `FG_LICENSE`.

- **An toÃ n license â€” TTL cho áº£nh chá»¥p tráº¡ng thÃ¡i (`content-yt-net.js`):**
  áº¢nh chá»¥p `localStorage["__fg_state_v1"]` (cá» kÃ­ch hoáº¡t + whitelist) tá»“n táº¡i vÃ´ thá»i háº¡n. Náº¿u ngÆ°á»i dÃ¹ng gá»¡ extension (hoáº·c license háº¿t háº¡n) mÃ  trang váº«n cÃ²n snapshot `lic:1` â†’ lá»›p cháº·n táº§ng máº¡ng váº«n tÆ°á»Ÿng Ä‘Æ°á»£c phÃ©p gá»¡ quáº£ng cÃ¡o.
  â†’ ThÃªm **TTL 6 giá»**: snapshot cÅ© hÆ¡n 6 giá» bá»‹ coi lÃ  khÃ´ng há»£p lá»‡ **vÃ  bá»‹ xoÃ¡ khá»i `localStorage`**.

### Sá»­a â€” Bá»™ test build bÃ¡o FAIL giáº£ do gÃ³i cÅ© sÃ³t láº¡i
- **`tests/package.test.js`**: trÆ°á»›c Ä‘Ã¢y quÃ©t **má»i** file `.zip` trong `dist/`, nÃªn gÃ³i build cá»§a phiÃªn báº£n cÅ© cÃ²n sÃ³t láº¡i (vd `v2.4.13` khi Ä‘Ã£ lÃªn `v2.4.14`) bÃ¡o FAIL vÃ¬ manifest khÃ´ng khá»›p phiÃªn báº£n hiá»‡n táº¡i. â†’ Chá»‰ kiá»ƒm tra gÃ³i Ä‘Ãºng phiÃªn báº£n hiá»‡n táº¡i, thÃªm assertion `B1b` bÃ¡o rÃµ gÃ³i nÃ o cáº§n xoÃ¡.
- **`scripts/build.js`**: tá»± **xoÃ¡ gÃ³i build cÅ©** khá»i `dist/` má»—i láº§n build â†’ `dist/` luÃ´n chá»‰ cÃ³ gÃ³i cá»§a phiÃªn báº£n hiá»‡n táº¡i.
- **`tests/package.test.js`**: thÃªm `content-yt-net.js` vÃ o danh sÃ¡ch file báº¯t buá»™c trong gÃ³i (trÆ°á»›c Ä‘Ã³ thiáº¿u â†’ file lá»›p máº¡ng cÃ³ thá»ƒ bá»‹ rÆ¡i khi Ä‘Ã³ng gÃ³i).

### Sá»­a â€” CI bá» sÃ³t file má»›i
- **`.github/workflows/test.yml`**: thÃªm `content-yt-net.js` vÃ o bÆ°á»›c kiá»ƒm tra cÃº phÃ¡p (file má»›i chÆ°a tá»«ng Ä‘Æ°á»£c kiá»ƒm tra trong CI).

### Kiá»ƒm thá»­
- Trang test má»›i `tests/netfast.html` (5 assertion): snapshot quÃ¡ háº¡n â†’ khÃ´ng Ä‘Æ°á»£c gá»¡ QC, snapshot cÅ© bá»‹ xoÃ¡, cáº¥u hÃ¬nh há»£p lá»‡ váº«n hoáº¡t Ä‘á»™ng
- `tests/main.html` thÃªm 4 assertion (53â€“53d): hook theo dÃµi player tá»“n táº¡i, player giáº£ Ä‘Æ°á»£c theo dÃµi, **player bá»‹ gá»¡ khá»i DOM â†’ observer Ä‘Æ°á»£c giáº£i phÃ³ng hoÃ n toÃ n**
- Bá»™ test: **322 PASS / 0 FAIL** + smoke test sáº¡ch console (13 trang)

### Ghi chÃº quyá»n riÃªng tÆ°
- KhÃ´ng thay Ä‘á»•i pháº¡m vi dá»¯ liá»‡u. áº¢nh chá»¥p `localStorage["__fg_state_v1"]` nay tá»± xoÃ¡ sau 6 giá».

## [2.4.14] â€” 2026-10-31

### Má»›i â€” "Bá» qua háº³n": gá»¡ quáº£ng cÃ¡o ngay trong dá»¯ liá»‡u YouTube (0 giÃ¢y)
NgÆ°á»i dÃ¹ng há»i: *"cÃ³ cÃ¡ch nÃ o Ä‘á»ƒ bá» qua háº³n luÃ´n khÃ´ng"* â€” tá»©c lÃ  **khÃ´ng phÃ¡t quáº£ng cÃ¡o**, khÃ´ng Ä‘en mÃ n hÃ¬nh, khÃ´ng pháº£i Ä‘á»£i.

**Váº¥n Ä‘á» cá»§a cÃ¡ch cÅ© (chá»‰ dá»±a vÃ o DOM):** YouTube 2025+ khÃ´ng cÃ²n gáº¯n `ad-showing` khi phÃ¡t QC (chá»‰ cÃ³ `ad-created` + `ytp-branding-shown`), nÃªn nháº­n biáº¿t báº±ng DOM khÃ´ng á»•n Ä‘á»‹nh. Tá»‡ hÆ¡n: **QC chÃ¨n phÃ­a server (SSAI) náº±m chung luá»“ng video chÃ­nh** â†’ tua tá»›i cuá»‘i sáº½ tua máº¥t luÃ´n video tháº­t. VÃ  QC Ä‘Ã£ táº£i vá» = tá»‘n bÄƒng thÃ´ng + ngÆ°á»i dÃ¹ng váº«n tháº¥y khung hÃ¬nh QC.

**CÃ¡ch má»›i â€” can thiá»‡p á»Ÿ táº§ng máº¡ng (MAIN world, `document_start`):** file má»›i `content-yt-net.js` cháº¡y **trÆ°á»›c** mÃ£ cá»§a YouTube, cháº·n pháº£n há»“i API `/youtubei/v1/player` vÃ  **xoÃ¡ `adPlacements` / `playerAds` / `adSlots`** khá»i `playerResponse`.

> YouTube khÃ´ng bao giá» nháº­n Ä‘Æ°á»£c danh sÃ¡ch quáº£ng cÃ¡o â†’ khÃ´ng táº¡o slot QC â†’ **khÃ´ng táº£i video QC, khÃ´ng hiá»‡n UI QC, khÃ´ng Ä‘en mÃ n hÃ¬nh**. NgÆ°á»i dÃ¹ng xem tháº³ng ná»™i dung.

- **`content-yt-net.js` (file má»›i):**
  - Hook `window.fetch` â€” Ä‘á»c láº¡i body cá»§a pháº£n há»“i player, gá»¡ slot QC, tráº£ vá» `Response` má»›i (giá»¯ nguyÃªn `status`/`headers`/`url`)
  - Hook `XMLHttpRequest.prototype.responseText` / `.response` â€” cho cÃ¡c luá»“ng cÅ© cÃ²n dÃ¹ng XHR
  - DÃ² `ytInitialPlayerResponse`, `ytcfg` (`set`/`set_`/`data_`) vÃ  `ytplayer.config.args.player_response` â€” gá»¡ QC trÆ°á»›c khi player Ä‘á»c
  - Chá»‰ can thiá»‡p khi: **Ä‘Ã£ kÃ­ch hoáº¡t + khÃ´ng whitelist + cÃ i Ä‘áº·t "Bá» qua háº³n" Ä‘ang báº­t**
  - **Cáº§u chÃ¬ an toÃ n:** náº¿u gá»¡ slot QC lÃ m YouTube lá»—i phÃ¡t video â†’ tá»± ngáº¯t lá»›p cháº·n máº¡ng (`trip()`) vÃ  táº£i láº¡i video bÃ¬nh thÆ°á»ng
- **`content-main.js` â€” bá» qua tá»©c thÃ¬ qua API player:**
  - `enterAd()` gá»i `player.skipAd()` sau 120ms â†’ YouTube chuyá»ƒn tháº³ng sang video chÃ­nh, **khÃ´ng cáº§n Ä‘á»£i nÃºt "Bá» qua" xuáº¥t hiá»‡n**
  - Thay cá» "gá»i 1 láº§n" báº±ng bá»™ giá»›i háº¡n táº§n suáº¥t (`SKIP_API_GAP` 700ms / `SKIP_API_MAX` 4 láº§n) â€” giá»¯ Ä‘Æ°á»£c lá»£i Ã­ch "gá»i sá»›m" mÃ  váº«n khÃ´ng spam (trÃ¡nh treo trÃ¬nh duyá»‡t nhÆ° báº£n 2.4.12)
- **CÃ i Ä‘áº·t má»›i `blockManifest`** ("Bá» qua háº³n quáº£ng cÃ¡o") trong popup â€” báº­t máº·c Ä‘á»‹nh, táº¯t Ä‘Æ°á»£c náº¿u video nÃ o lá»—i
- **`content.js`** gá»­i thÃªm message `FG_NET_CONFIG` (license + whitelist + cÃ i Ä‘áº·t) cho lá»›p máº¡ng; lÆ°u whitelist vÃ o `sessionStorage` Ä‘á»ƒ láº§n táº£i trang sau khá»i pháº£i chá»
- **`content-main.js` â€” `collectDiagnostics()`** bá»• sung nhÃ³m `net` (sá»‘ pháº£n há»“i Ä‘Ã£ gá»¡ QC, tráº¡ng thÃ¡i cáº§u chÃ¬)

### Kiá»ƒm thá»­
- Trang test má»›i `tests/net.html` (25 assertion): gá»¡ `adPlacements`/`playerAds`/`adSlots`, giá»¯ nguyÃªn `streamingData`/`playabilityStatus`, xá»­ lÃ½ playerResponse lá»“ng, nháº­n diá»‡n Ä‘Ãºng endpoint, tÃ´n trá»ng license/whitelist/cÃ i Ä‘áº·t, cáº§u chÃ¬ `trip()`, gá»¡ QC tá»« `ytInitialPlayerResponse`
- `tests/main.html` thÃªm 5 assertion (50â€“52): `skipAd()` Ä‘Æ°á»£c gá»i khi vÃ o QC, cÃ³ giá»›i háº¡n táº§n suáº¥t, diagnostics cÃ³ nhÃ³m `net`
- Bá»™ test: **313 PASS / 0 FAIL** + smoke test sáº¡ch console (13 trang)

### Ghi chÃº quyá»n riÃªng tÆ°
- Lá»›p cháº·n táº§ng máº¡ng lÆ°u 1 áº£nh chá»¥p tráº¡ng thÃ¡i nhá» trong `localStorage` (`__fg_state_v1`): cá» kÃ­ch hoáº¡t + danh sÃ¡ch whitelist + cá» cÃ i Ä‘áº·t. DÃ¹ng Ä‘á»ƒ lá»›p máº¡ng biáº¿t ngay tá»« khi khá»Ÿi Ä‘á»™ng mÃ  khÃ´ng pháº£i chá» tin nháº¯n cáº¥u hÃ¬nh. **KhÃ´ng chá»©a dá»¯ liá»‡u nháº¡y cáº£m**, khÃ´ng gá»­i ra ngoÃ i.

## [2.4.13] â€” 2026-10-31

### Sá»­a â€” QC váº«n hiá»‡n (nguyÃªn nhÃ¢n gá»‘c tÃ¬m Ä‘Æ°á»£c tá»« bÃ¡o cÃ¡o lá»—i tháº­t)
NgÆ°á»i dÃ¹ng gá»­i bÃ¡o cÃ¡o cháº©n Ä‘oÃ¡n tá»« trang YouTube tháº­t (video `j8U06veqxdU`) cho tháº¥y QC váº«n hiá»‡n. Dá»¯ liá»‡u chá»‰ ra **nguyÃªn nhÃ¢n gá»‘c**:

```
playerClass: "... ytp-transparent ... ad-created ytp-branding-shown
               playing-mode buffering-mode unstarted-mode"
adShowing: false      confirmedAd: false
ytAdState: -1         ytPlayerState: -1
```

**YouTube KHÃ”NG LUÃ”N gáº¯n `ad-showing`/`ad-interrupting` khi Ä‘ang phÃ¡t QC.** Trong trÆ°á»ng há»£p nÃ y player chá»‰ cÃ³:
- `ad-created` â€” YouTube Ä‘Ã£ táº¡o player QC
- `ytp-branding-shown` â€” nhÃ£n "Quáº£ng cÃ¡o" Ä‘ang hiá»‡n
- `ytp-transparent` â€” player trong suá»‘t (kiá»ƒu overlay QC má»›i)

Há»‡ quáº£ trÆ°á»›c Ä‘Ã¢y: `hasAdClass()` = `false` â†’ `isConfirmedAd()` = `false` â†’ extension **khÃ´ng há» xá»­ lÃ½ QC** â†’ `exitAd()` reset `video.style.opacity = ""` â†’ **QC hiá»‡n ra cho ngÆ°á»i dÃ¹ng**.

- **`content-main.js` â€” nháº­n biáº¿t QC má»›i (3 Ä‘Æ°á»ng):**
    1. `ad-created` + **UI QC hiá»ƒn thá»‹ tháº­t** (nÃºt "Bá» qua" / badge QC trong `.video-ads` / khung `skip-button-slot` / interstitial / `overlay-container`)
    2. `ad-created` + `ytp-branding-shown` + overlay QC trong `.video-ads`
    3. ÄÆ°á»ng cÅ© (`ad-showing`/`ad-interrupting` + UI QC) vÃ  QC bumper (overlay + badge) â€” giá»¯ nguyÃªn
- **`content-main.js` â€” hÃ m `hasVisibleAdUi()`:** táº­p trung tÃ­n hiá»‡u UI QC, **loáº¡i bá»** cÃ¡c tÃ­n hiá»‡u dá»… gÃ¢y nháº­n nháº§m (overlay tráº§n khÃ´ng badge, badge náº±m ngoÃ i `.video-ads`, `.ytp-ad-progress-list` â€” luÃ´n cÃ³ trong thanh tiáº¿n trÃ¬nh ká»ƒ cáº£ video chÃ­nh)
- **`content.css` â€” thÃªm `.ad-created` vÃ o nhÃ³m áº©n overlay QC:** trÆ°á»›c Ä‘Ã³ khÃ´ng cÃ³ class nÃ o Ä‘Æ°á»£c áº©n nÃªn QC hiá»‡n ra dÃ¹ extension cÃ³ xá»­ lÃ½
- **`content-main.js` â€” `MutationObserver` theo dÃµi vÃ¹ng UI QC:** phÃ¡t hiá»‡n nÃºt "Bá» qua" **xuáº¥t hiá»‡n** â†’ báº¥m ngay láº­p tá»©c, khÃ´ng pháº£i chá» lÆ°á»£t quÃ©t 300ms
- **`content-main.js` â€” `exitAd()` reset `skipClickedAt`/`skipApiCalled`:** trÆ°á»›c Ä‘Ã³ má»‘c "Ä‘Ã£ báº¥m nÃºt Bá» qua" khÃ´ng Ä‘Æ°á»£c reset â†’ `fallbackActive` bá»‹ báº­t sai á»Ÿ QC káº¿ tiáº¿p (tua tháº³ng vá» cuá»‘i ngay láº­p tá»©c)
- **`content-main.js` â€” chá» khÃ´i phá»¥c 700ms chá»‰ khi cÃ²n dáº¥u hiá»‡u QC:** náº¿u máº¥t háº¿t dáº¥u hiá»‡u â†’ khÃ´i phá»¥c ngay, trÃ¡nh video chÃ­nh bá»‹ káº¹t 16x
- **`collectDiagnostics()`** bá»• sung `adClass` / `adCreated` / `adBranding` / `visibleAdUi` Ä‘á»ƒ cháº©n Ä‘oÃ¡n chÃ­nh xÃ¡c hÆ¡n

### Sá»­a â€” Test bá»‹ "rÃ² rá»‰ tráº¡ng thÃ¡i" lÃ m há»ng 29 test
`tests/main.html` test 38 táº¡o interstitial chá»©a nÃºt "Bá» qua" nhÆ°ng **quÃªn xÃ³a** â†’ nÃºt váº«n cÃ²n trong DOM â†’ má»i test phÃ­a sau bá»‹ coi lÃ  Ä‘ang cÃ³ QC â†’ káº¹t 16x. ÄÃ£ sá»­a vÃ  bá»• sung comment giáº£i thÃ­ch.

### Kiá»ƒm thá»­
- ThÃªm 9 assertion há»“i quy trong `tests/main.html` (45â€“49): QC kiá»ƒu má»›i chá»‰ cÃ³ `ad-created`, `ad-created` khÃ´ng cÃ³ UI QC (pháº£i **khÃ´ng** tua nháº§m video chÃ­nh), QC cÃ³ nÃºt "Bá» qua" kiá»ƒu má»›i, nÃºt "Bá» qua" xuáº¥t hiá»‡n muá»™n, `ad-created` + branding + overlay khÃ´ng badge
- Bá»™ test: **283 PASS / 0 FAIL** + smoke test sáº¡ch console

## [2.4.12] â€” 2026-10-31

### Sá»­a â€” QC bá»‹ "cháº­m" / pháº£i Ä‘á»£i tá»›i háº¿t thá»i lÆ°á»£ng má»›i tá»± máº¥t
BÃ¡o cÃ¡o tá»« ngÆ°á»i dÃ¹ng: *"khi hiá»‡n quáº£ng cÃ¡o nÃ³ cÃ³ tá»± Ä‘á»™ng bá» qua liá»n khÃ´ngâ€¦ tÃ´i tháº¥y khi hiá»‡n quáº£ng cÃ¡o tua nhanh cÃ³ bá» qua cÃ³ nhÆ°ng bá»‹ cháº­m vÃ  Ä‘Ã´i lÃºc khÃ´ng hiá»‡n nÃºt bá» qua Ä‘á»ƒ báº¥m, pháº£i Ä‘á»£i tua nhanh tá»›i háº¿t time má»›i tá»± máº¥t quáº£ng cÃ¡o"*.

RÃ  soÃ¡t láº¡i toÃ n bá»™ chuá»—i xá»­ lÃ½ QC vÃ  tÃ¬m ra **4 nguyÃªn nhÃ¢n** khiáº¿n viá»‡c bá» quáº£ng cÃ¡o cháº­m:

- **`content-main.js` â€” thá»i gian chá» giá»¯a 2 láº§n báº¥m nÃºt "Bá» qua" quÃ¡ dÃ i (3s):** náº¿u láº§n báº¥m Ä‘áº§u khÃ´ng Äƒn (YouTube má»›i render nÃºt, handler chÆ°a sáºµn sÃ ng), pháº£i chá» **3 giÃ¢y** má»›i thá»­ láº¡i â†’ cáº£m giÃ¡c "cháº­m". Äá»•i `SKIP_RETRY_MS` 3000 â†’ **1200ms**, nÃ¢ng tráº§n `SKIP_MAX_PER_BTN` 6 â†’ 8
- **`content-main.js` â€” QC dÃ i (>20s) CÃ“ nÃºt "Bá» qua" bá»‹ cá»‘ tÃ¬nh giá»¯ tá»‘c Ä‘á»™ 1x:** logic cÅ© (`holdFastSkip`) chá»§ Ä‘á»™ng **khÃ´ng tua** khi tháº¥y nÃºt "Bá» qua", vÃ¬ sá»£ tua trÆ°á»›c khi nÃºt Äƒn sáº½ lÃ m YouTube há»§y QC rá»“i hiá»‡n QC káº¿ tiáº¿p. Há»‡ quáº£: náº¿u click khÃ´ng Äƒn, ngÆ°á»i dÃ¹ng pháº£i Ä‘á»©ng yÃªn nhÃ¬n QC cháº¡y tá»›i háº¿t. Nay **luÃ´n tua 16x** (tua 16x khÃ´ng lÃ m máº¥t nÃºt "Bá» qua") + chá»‰ giá»›i háº¡n viá»‡c *seek*
- **`content-main.js` â€” seek tá»›i cuá»‘i bá»‹ Ä‘iá»u kiá»‡n buffer cháº·n:** `isBufferedAt()` yÃªu cáº§u QC pháº£i buffer sáºµn tá»›i cuá»‘i má»›i cho seek. Vá»›i máº¡ng yáº¿u / QC dÃ i, Ä‘iá»u kiá»‡n nÃ y khÃ´ng bao giá» Ä‘Ãºng â†’ **khÃ´ng seek Ä‘Æ°á»£c â†’ chá»‰ cÃ²n cháº¡y 16x tá»›i háº¿t QC** (Ä‘Ãºng triá»‡u chá»©ng ngÆ°á»i dÃ¹ng mÃ´ táº£). Nay seek tá»›i cuá»‘i **khÃ´ng cáº§n buffer** (Chrome tá»± táº£i pháº§n cÃ²n láº¡i, vÃ i KB)
- **`content-main.js` â€” thiáº¿u phÆ°Æ¡ng Ã¡n dá»± phÃ²ng khi báº¥m nÃºt khÃ´ng Äƒn:** thÃªm `SKIP_FALLBACK_MS` (1.2s) â€” sau khi Ä‘Ã£ báº¥m nÃºt "Bá» qua" mÃ  QC váº«n cÃ²n, tá»± chuyá»ƒn sang cháº¿ Ä‘á»™ dá»± phÃ²ng seek tháº³ng tá»›i cuá»‘i QC

### Sá»­a â€” TÃ¬m nÃºt "Bá» qua" bá» sÃ³t nhiá»u trÆ°á»ng há»£p
- ThÃªm **Pass 3**: quÃ©t **má»i vÃ¹ng QC** (`.ytp-ad-player-overlay`, `.ytp-ad-overlay-container`, `.ytp-ad-skip-button-slot`, `.ytp-ad-action-interstitial`, `.ytp-video-interstitial-buttoned-centered-layout`, â€¦) tÃ¬m nÃºt theo **chá»¯** "Bá» qua / Skip" â†’ báº¯t Ä‘Æ°á»£c nÃºt YouTube Ä‘áº·t **ngoÃ i `.video-ads`** hoáº·c khi YouTube Ä‘á»•i tÃªn class
- Bá»• sung selector cho nÃºt dáº¡ng `<div>` / class láº¡: `.ytp-ad-skip-button-modern`, `[class*='skip-ad-button']`, `[id^='skip-button']`
- Gom hÃ m `collectSkipButtons()` dÃ¹ng chung cho cáº£ "báº¥m" vÃ  "kiá»ƒm tra cÃ³ nÃºt" â†’ trÆ°á»›c Ä‘Ã¢y 2 hÃ m cÃ³ thá»ƒ tháº¥y 2 nÃºt khÃ¡c nhau, gÃ¢y mÃ¢u thuáº«n
- `player.skipAd()` giá» chá»‰ gá»i **1 láº§n cho má»—i QC** (trÆ°á»›c gá»i má»—i láº§n báº¥m â†’ player re-init liÃªn tá»¥c, cÃ³ thá»ƒ lÃ m treo trÃ¬nh duyá»‡t)

### Má»›i â€” Nháº­n biáº¿t QC qua API ná»™i bá»™ YouTube
- DÃ¹ng `player.getAdState()` (1 = Ä‘ang phÃ¡t QC, 2 = Ä‘Ã£ xong) vÃ  `player.getPlayerState()` thay vÃ¬ chá»‰ tin class DOM â†’ xÃ¡c nháº­n QC chÃ­nh xÃ¡c hÆ¡n khi UI QC render cháº­m
- `collectDiagnostics()` bá»• sung nhÃ³m `ad` + `skipStats` + `handleStats` â†’ phá»¥c vá»¥ cháº©n Ä‘oÃ¡n báº±ng `FG_DIAG_REQ`

### Kiá»ƒm thá»­
- ThÃªm `tests/watch_yt.js` â€” cÃ´ng cá»¥ **theo dÃµi trá»±c tiáº¿p** hÃ nh vi bá» QC trÃªn trang YouTube tháº­t (Chrome headless + DevTools Protocol), in timeline QC xuáº¥t hiá»‡n â†’ báº¥m nÃºt â†’ QC káº¿t thÃºc
- Bá»• sung 6 assertion há»“i quy vÃ o `tests/main.html`: nÃºt skip báº¥m khÃ´ng Äƒn â†’ pháº£i tá»± tua tá»›i cuá»‘i (khÃ´ng Ä‘á»©ng yÃªn), nÃºt skip Äƒn ngay â†’ QC káº¿t thÃºc, nÃºt skip class láº¡ â†’ váº«n báº¥m Ä‘Æ°á»£c, nÃºt skip ngoÃ i `.video-ads` â†’ váº«n báº¥m Ä‘Æ°á»£c, QC khÃ´ng cÃ³ nÃºt + khÃ´ng buffer â†’ váº«n seek tá»›i cuá»‘i
- Bá»™ test: **273 PASS / 0 FAIL**

## [2.4.11] â€” 2026-10-31

### Má»›i â€” Cháº·n quáº£ng cÃ¡o MUA Sáº®M (shopping ads)
Bá»• sung cháº·n dáº¡ng quáº£ng cÃ¡o hiá»ƒn thá»‹ **tháº» sáº£n pháº©m cÃ³ giÃ¡** (vÃ­ dá»¥ "Tháº»m táº­p Yoga cao cáº¥p TPâ€¦ 125.000â‚« Â· Cá»­a hÃ ng trÃ¬nh liÃªn káº¿t Shopee"). ÄÃ¢y lÃ  dáº¡ng quáº£ng cÃ¡o cá»§a YouTube Shopping / kÃªnh bÃ¡n hÃ ng liÃªn káº¿t, **khÃ´ng** thuá»™c nhÃ³m banner quáº£ng cÃ¡o chuáº©n nÃªn trÆ°á»›c Ä‘Ã¢y khÃ´ng bá»‹ cháº·n.

- **`content.css`:** áº©n (theo class `html.fg-no-shopping`) báº£ng "Sáº£n pháº©m" bÃªn cáº¡nh video, dáº£i sáº£n pháº©m dÆ°á»›i video, ká»‡ merch, sticker sáº£n pháº©m dÃ¡n Ä‘Ã¨ trÃªn Shorts, nÃºt "Mua sáº¯m"/"Sáº£n pháº©m ná»•i báº­t" vÃ  cÃ¡c panel `shopping_panel*`
- **`content.js`:** thÃªm lá»›p báº£o vá»‡ thá»© hai báº±ng JS (`hideShoppingAds()`) â€” báº¯t Ä‘Æ°á»£c pháº§n tá»­ render muá»™n (YouTube chÃ¨n sau khi CSS Ã¡p dá»¥ng) vÃ  **Ä‘áº¿m vÃ o thá»‘ng kÃª** á»Ÿ má»¥c má»›i "Mua sáº¯m"
- **HoÃ n tÃ¡c Ä‘Ãºng:** thÃªm `restoreShoppingAds()` gá»¡ inline style khi ngÆ°á»i dÃ¹ng táº¯t setting hoáº·c táº¯t báº£o vá»‡ â€” trÆ°á»›c Ä‘Ã³ cÃ¡c node Ä‘Ã£ áº©n sáº½ **áº©n vÄ©nh viá»…n** khÃ´ng thá»ƒ hiá»‡n láº¡i
- **Cáº¥u hÃ¬nh tá»« xa:** `release/remote-config.json` cÃ³ thÃªm danh sÃ¡ch `yt.shopping` (version 3 â†’ 4) Ä‘á»ƒ sá»­a selector khi YouTube Ä‘á»•i tÃªn class mÃ  khÃ´ng cáº§n phÃ¡t hÃ nh báº£n má»›i
- **DNR:** thÃªm 3 rule cháº·n request tracking cá»§a shopping ads (`/api/stats/shopping`, `/pagead/shopping`, `/ptracking/shopping`)
- **Giao diá»‡n:** thÃªm cÃ´ng táº¯c "Quáº£ng cÃ¡o mua sáº¯m" trong popup + má»¥c "Mua sáº¯m" trong báº£ng thá»‘ng kÃª (popup & stats)

### Kiá»ƒm thá»­
- ThÃªm `tests/shopping.html` â€” 13 assertion: class `fg-no-shopping` báº­t/táº¯t Ä‘Ãºng, má»i thÃ nh pháº§n shopping bá»‹ áº©n, **khÃ´ng** áº©n nháº§m tiÃªu Ä‘á» video/bÃ¬nh luáº­n, pháº§n tá»­ render muá»™n váº«n bá»‹ áº©n, Ä‘áº¿m vÃ o thá»‘ng kÃª, vÃ  báº­t/táº¯t setting hoÃ n tÃ¡c Ä‘Ãºng
- Bá»™ test: **261 PASS / 0 FAIL**

## [2.4.10] â€” 2026-10-31

### Sá»­a â€” Lá»—i "vacuous test" + race condition ghi thá»‘ng kÃª
VÃ²ng rÃ  soÃ¡t tá»± Ä‘á»™ng láº§n 2 (syntax, JSON, DNR rules, remote-config, Ä‘Ã³ng gÃ³i, smoke test console) phÃ¡t hiá»‡n thÃªm:

- **`content.js` váº«n Ä‘áº·t `display:none` cho `.ytp-ad-overlay-container`:** `hideOverlayAds()` gá»i nháº§m `hideElements()` thay vÃ¬ `hideElementsSoft()` â†’ nÃºt "Bá» qua" máº¥t kÃ­ch thÆ°á»›c (`offsetWidth = 0`) â†’ **auto-skip khÃ´ng báº¥m Ä‘Æ°á»£c nÃºt**. Sá»­a láº¡i dÃ¹ng `hideElementsSoft()` (chá»‰ `opacity: 0`, giá»¯ nguyÃªn kÃ­ch thÆ°á»›c nÃºt con)
- **Race condition ghi `chrome.storage.local`:** `flushStats()` vÃ  `detectAndStoreUser()` cÃ¹ng Ä‘á»câ†’sá»­aâ†’ghi `userStats` song song â†’ má»—i bÃªn giá»¯ má»™t báº£n sao cÅ©, báº£n ghi sau **Ä‘Ã¨ máº¥t** pháº§n cá»§a báº£n ghi trÆ°á»›c (máº¥t sá»‘ quáº£ng cÃ¡o Ä‘Ã£ cháº·n). ThÃªm hÃ ng Ä‘á»£i `enqueueStorageWrite()` Ä‘á»ƒ serialize má»i láº§n ghi
- **`tests/css.html` lÃ  test "vacuous":** náº¡p `license.js` tháº­t (token giáº£ â†’ `verifyStored` fail) khiáº¿n `isEnabled = false` â†’ `hideOverlayAds()` **khÃ´ng bao giá» cháº¡y** â†’ test luÃ´n PASS dÃ¹ code sai. Nay mock license Ä‘Ãºng cÃ¡ch, mock `chrome.storage` há»— trá»£ cáº£ callback láº«n Promise API
- **`release/update.xml` cÃ²n version `2.4.8`** (stale) â†’ Ä‘á»“ng bá»™ `2.4.10`
- **`package.json` version `2.4.0`** (stale) â†’ Ä‘á»“ng bá»™ `2.4.10`
- **`one.js` náº±m sai chá»— á»Ÿ thÆ° má»¥c gá»‘c** â†’ chuyá»ƒn vÃ o `tests/`
- **`popup.js` / `stats.js` cÅ©ng dÃ­nh race condition ghi `userStats`** (`touchCurrentUser()` vs `confirmResetBtn`, `patchCurrentUser()` vs `confirmResetBtn`) â†’ Ã¡p dá»¥ng cÃ¹ng cÆ¡ cháº¿ `enqueueStorageWrite()`

### Kiá»ƒm thá»­
- ThÃªm `tests/smoke.js` â€” cháº¡y 12 trang test báº±ng Chrome headless, thu console error vÃ  phÃ¡t hiá»‡n trang khÃ´ng cháº¡y xong
- ThÃªm `tests/storage.test.js` â€” chá»©ng minh race condition lÃ  tháº­t (khi khÃ´ng serialize thÃ¬ máº¥t dá»¯ liá»‡u) vÃ  fix hoáº¡t Ä‘á»™ng
- ThÃªm `tests/package.test.js` â€” kiá»ƒm tra 3 gÃ³i build: Ä‘á»§ file báº¯t buá»™c, khÃ´ng lá»™ khÃ³a riÃªng, manifest há»£p lá»‡, dá»¯ liá»‡u demo chá»‰ á»Ÿ cháº¿ Ä‘á»™ `?preview`
- ÄÄƒng kÃ½ `npm run smoke` + `npm run build` + `tests/package.test.js` vÃ o CI (`.github/workflows/test.yml`)
- ThÃªm `tests/mkpopup.js` + `tests/mkpages.js` â€” sinh tá»± Ä‘á»™ng trang test cho `popup.html` / `stats.html` / `options.html` tá»« HTML gá»‘c (mock `chrome.*` + script kiá»ƒm tra), báº£o Ä‘áº£m test luÃ´n khá»›p vá»›i giao diá»‡n tháº­t vÃ  khÃ´ng bá»‹ "vacuous"
- ThÃªm `tests/one.js` â€” cháº¡y riÃªng 1 trang test vÃ  in lá»—i console (debug nhanh)
- Bá»™ test: **248 PASS / 0 FAIL** + 12/12 trang smoke sáº¡ch console + 19/19 kiá»ƒm tra gÃ³i build


## [2.4.9] â€” 2026-10-31

### Sá»­a â€” Äá»“ng bá»™ hoÃ n toÃ n vá»›i bá»™ test + loáº¡i bá» lá»—i "treo"/"QC hiá»‡n liÃªn tá»¥c"
RÃ  soÃ¡t toÃ n bá»™ dá»± Ã¡n vÃ  cháº¡y láº¡i bá»™ test (`npm test`) Ä‘Ã£ phÃ¡t hiá»‡n vÃ  sá»­a cÃ¡c lá»—i sau:

- **`content.css` áº©n `.ytp-ad-overlay-container` báº±ng `display: none`:** nÃºt "Bá» qua" cá»§a YouTube náº±m BÃŠN TRONG khung nÃ y â†’ `display:none` lÃ m nÃºt máº¥t kÃ­ch thÆ°á»›c (`offsetWidth = 0`) nÃªn bá»™ auto-skip **khÃ´ng bao giá» báº¥m Ä‘Æ°á»£c nÃºt "Bá» qua"** trong báº£n tháº­t. Äá»•i sang `opacity: 0` (giá»¯ nguyÃªn kÃ­ch thÆ°á»›c) vÃ  thÃªm lá»›p `html.fg-ad-active` Ä‘á»ƒ áº©n phá»§ QC cÃ²n sÃ³t
- **`content.js` cÅ©ng Ä‘áº·t `display:none` cho `.ytp-ad-overlay-container`:** tÃ¡ch thÃ nh `hideElementsSoft()` (dÃ¹ng `opacity`) Ä‘á»ƒ khÃ´ng phÃ¡ vá»¡ nÃºt "Bá» qua"; cÃ¡c lá»›p phá»§ thuáº§n hÃ¬nh áº£nh (`.ytp-ad-text-overlay`, `.ytp-ad-image-overlay`) váº«n áº©n hoÃ n toÃ n
- **`fireClick()` báº¯n click 2 láº§n** (`el.click()` + `dispatchEvent`) â†’ má»—i lÆ°á»£t báº¥m kÃ­ch hoáº¡t handler 2â€“4 láº§n do event ná»•i lÃªn nÃºt cha â†’ spam click, treo trÃ¬nh duyá»‡t. Bá» `el.click()`, giá»¯ láº¡i 1 sá»± kiá»‡n `click`
- **Chá»‘ng spam nÃºt "Bá» qua":** má»—i nÃºt chá»‰ báº¥m láº¡i sau 3s vÃ  tá»‘i Ä‘a 6 láº§n/nÃºt (thay vÃ¬ cooldown 150ms khÃ´ng giá»›i háº¡n)
- **QC bumper (YouTube 2025+)** khÃ´ng gáº¯n class `ad-showing` (chá»‰ cÃ³ overlay + badge) â†’ trÆ°á»›c Ä‘Ã¢y khÃ´ng há» bá»‹ nháº­n diá»‡n. Bá»• sung `hasBumperAd()`; vÃ²ng quÃ©t nhanh 35ms cÅ©ng giá»¯ cháº¡y cho loáº¡i QC nÃ y
- **Thiáº¿u class `fg-ad-active` trÃªn `<html>`** (Ä‘Æ°á»£c CSS dÃ¹ng Ä‘á»ƒ áº©n phá»§ QC) â†’ bá»• sung `setAdActive()` báº­t/táº¯t theo vÃ²ng Ä‘á»i QC
- **Thiáº¿u nav guard:** báº¥m nÃºt "Bá» qua" náº±m trong tháº» `<a>` cÃ³ thá»ƒ nháº£y trÃ¬nh duyá»‡t sang trang quáº£ng cÃ¡o. Bá»• sung Navigation API `navigate` + cháº·n click `<a>` ra ngoÃ i trong capture phase, chá»‰ kÃ­ch hoáº¡t Ä‘Ãºng khoáº£nh kháº¯c báº¥m nÃºt
- **QC dÃ i (>20s) bá»‹ tua 16x ngay khi cÃ²n nÃºt "Bá» qua":** tua trÆ°á»›c khi nÃºt "Äƒn" click khiáº¿n YouTube há»§y QC rá»“i hiá»‡n QC káº¿ tiáº¿p â†’ QC hiá»‡n liÃªn tá»¥c. Nay: QC ngáº¯n â‰¤20s váº«n tua 16x; QC dÃ i chá»‰ báº¥m nÃºt, vÃ  chá»‰ tua sau thá»i gian chá» 1,5s náº¿u nÃºt chÆ°a xuáº¥t hiá»‡n
- **YouTube reset QC vá» Ä‘áº§u sau khi Ä‘Ã£ tua:** `st.seekedEnd` cÃ²n giá»¯ `true` nÃªn khÃ´ng tua láº¡i. Nay phÃ¡t hiá»‡n `currentTime` quay vá» gáº§n Ä‘áº§u vÃ  tua láº¡i tá»›i cuá»‘i (cÃ³ giá»›i háº¡n 700ms Ä‘á»ƒ trÃ¡nh vÃ²ng láº·p)
- **`rules/dnr_rules.json` chÆ°a cÃ³ rule nÃ o cho YouTube** (chá»‰ cÃ³ Spotify) â†’ bá»• sung 9 rule cháº·n tÃ i nguyÃªn quáº£ng cÃ¡o Google (doubleclick, googlesyndication, googleadservices, pagead, ptrackingâ€¦) â€” **khÃ´ng** cháº·n `media`/`googlevideo` nÃªn khÃ´ng áº£nh hÆ°á»Ÿng táº£i video
- **`release/remote-config.json` cÃ³ `adSignals`/`skipButtons` rá»—ng** â†’ Ä‘iá»n selector dá»± phÃ²ng cho giao diá»‡n QC má»›i, tÄƒng `version` 2 â†’ 3

### Sá»­a â€” Spotify
- **Nháº­n nháº§m bÃ i hÃ¡t tháº­t lÃ  quáº£ng cÃ¡o:** `mediaSessionLooksLikeAd()` vÃ  `isAdPlaying()` dÃ¹ng `includes("advertisement")` trÃªn tiÃªu Ä‘á»/nghá»‡ sÄ© â†’ bÃ i hÃ¡t tÃªn "Advertisement" bá»‹ tua/mute nháº§m. Nay so khá»›p **chÃ­nh xÃ¡c** tá»«ng trÆ°á»ng
- **Máº¥t tá»‘c Ä‘á»™ phÃ¡t cá»§a ngÆ°á»i dÃ¹ng:** sau QC luÃ´n tráº£ vá» `1x` â†’ nay nhá»› vÃ  khÃ´i phá»¥c Ä‘Ãºng tá»‘c Ä‘á»™ gá»‘c (vÃ­ dá»¥ 1.5x)

### Báº£o máº­t
- **XSS trong `stats.js`:** tÃªn hiá»ƒn thá»‹ do ngÆ°á»i dÃ¹ng tá»± Ä‘áº·t Ä‘Æ°á»£c chÃ¨n tháº³ng vÃ o `innerHTML` â†’ cháº¡y Ä‘Æ°á»£c script trong trang extension (Ä‘á»c Ä‘Æ°á»£c `chrome.storage` chá»©a token key). Nay chuyá»ƒn sang `textContent`
- **`installer/google-apps-script/Code.gs` lÃ  báº£n cÅ¨ cÃ²n lá»— há»•ng `?action=seed`** (báº¥t ká»³ ai cÃ³ link cÅ©ng táº¡o Ä‘Æ°á»£c key máº«u, khÃ´ng cáº§n chá»¯ kÃ½ sá»‘) â†’ Ä‘á»“ng bá»™ láº¡i Ä‘Ãºng báº£n `server/Code.gs` Ä‘Ã£ khÃ³a

### Kiá»ƒm thá»­
- ThÃªm `tests/css.html` â€” test há»“i quy náº¡p `content.css` + `content.js` tháº­t, chá»‘ng tÃ¡i phÃ¡t lá»—i "áº©n khung chá»©a nÃºt Bá» qua"
- ThÃªm `tests/rules.test.js` â€” kiá»ƒm tra `rules/dnr_rules.json` + `release/remote-config.json`
- Bá»• sung test cho QC bumper, `fg-ad-active`, nav guard, tua láº¡i sau khi QC bá»‹ reset, tua 16x QC khÃ´ng cÃ³ nÃºt skip
- Bá»™ test: **217 PASS / 0 FAIL**

## [2.4.8] â€” 2026-10-29

### Sá»­a â€” Quáº£ng cÃ¡o hiá»‡n liÃªn tá»¥c / nháº£y sang trang quáº£ng cÃ¡o
NguyÃªn nhÃ¢n gá»‘c tÃ¬m ra tá»« bÃ¡o lá»—i "BÃ¡o lá»—i QC" (v2.4.7): trong layout interstitial cá»§a YouTube, **nÃºt CTA cá»§a nhÃ  quáº£ng cÃ¡o** (`button#ad-button:t.ytp-ad-button-vm`, náº±m trong `.ytp-ad-button-container`) **Ä‘á»©ng trÆ°á»›c** nÃºt "Bá» qua" (`button#skip-button:y.ytp-skip-ad-button`) trong thá»© tá»± DOM. VÃ¬ `querySelectorAll` tráº£ vá» theo thá»© tá»± DOM nÃªn extension báº¥m nháº§m CTA â†’ trÃ¬nh duyá»‡t nháº£y sang trang quáº£ng cÃ¡o, Ä‘á»“ng thá»i `clickSkip()` tráº£ `true` khiáº¿n **nÃºt "Bá» qua" khÃ´ng bao giá» Ä‘Æ°á»£c báº¥m** â†’ QC cá»© hiá»‡n láº¡i liÃªn tá»¥c.

- **TÃ¡ch nÃºt CTA khá»i nhÃ³m nÃºt "Bá» qua":** `.ytp-ad-button-vm` bá»‹ loáº¡i khá»i `SKIP_STR` vÃ  chuyá»ƒn sang nhÃ³m `CONTINUE_STR` (chá»‰ dÃ¹ng khi chá»¯ nÃºt khá»›p "Tiáº¿p tá»¥c / Continue", lÃ  phÆ°Æ¡ng Ã¡n cuá»‘i cÃ¹ng)
- **ThÃªm `isCtaButton()`:** cháº·n má»i nÃºt CTA cá»§a nhÃ  quáº£ng cÃ¡o (`.ytp-ad-button-vm`, `.ytp-ad-button`, `.ytp-ad-clickable`, `.ytp-ad-call-to-action`, `.ytp-ad-button-container`, `.ytp-ad-hover-text-button`) vÃ  cáº£ nÃºt cÃ³ lá»i kÃªu gá»i hÃ nh Ä‘á»™ng (Mua ngay, Há»c thÃªm, ÄÄƒng kÃ½, Learn, Shop, Buyâ€¦)
- **DÃ² nÃºt skip theo THá»¨ Tá»° Æ¯U TIÃŠN** (`SKIP_PRIORITY`) thay vÃ¬ selector gá»™p â€” nÃºt `skip-button` / `.ytp-skip-ad-button` Ä‘Æ°á»£c báº¥m trÆ°á»›c má»i thá»© khÃ¡c
- **Nav guard khÃ´ng cÃ²n `stopPropagation()`:** trÆ°á»›c Ä‘Ã¢y cháº·n event á»Ÿ capture phase trÃªn `document` khiáº¿n handler cá»§a YouTube khÃ´ng bao giá» nháº­n Ä‘Æ°á»£c click â†’ nÃºt "Bá» qua" khÃ´ng Äƒn. Giá» chá»‰ `preventDefault()` (váº«n cháº·n Ä‘Æ°á»£c Ä‘iá»u hÆ°á»›ng cá»§a tháº» `<a>`)
- **Bá» kiá»ƒm tra `ancestorsVisible` á»Ÿ Ä‘Æ°á»ng báº¥m nhanh:** nÃºt skip trong layout interstitial cÃ³ thá»ƒ náº±m trong vÃ¹ng bá»‹ CSS cá»§a extension áº©n (`offsetWidth = 0`) nhÆ°ng synthetic click váº«n Äƒn
- **ThÃªm observer bao trá»n player** (`attachInterstitialWatcher`): layout `.ytp-video-interstitial-buttoned-centered-layout` náº±m ngoÃ i `.video-ads` / `.ytp-ad-module` / `.ytp-ad-player-overlay` nÃªn observer cÅ© khÃ´ng báº¯t Ä‘Æ°á»£c nÃºt skip vá»«a xuáº¥t hiá»‡n
- **Tráº§n báº¥m chuyá»ƒn sang theo tá»«ng nÃºt** (tá»‘i Ä‘a 6 láº§n/nÃºt) thay vÃ¬ tráº§n toÃ n cá»¥c 8 láº§n â€” tráº§n cÅ© bá»‹ CTA/nÃºt khÃ¡c "Äƒn" máº¥t nÃªn háº¿t lÆ°á»£t báº¥m nÃºt "Bá» qua"
- **`fireClick` bá»• sung `pointerdown` / `pointerup`:** nÃºt skip interstitial cá»§a YouTube dÃ¹ng PointerEvent Ä‘á»ƒ quyáº¿t Ä‘á»‹nh cÃ³ "Äƒn" click hay khÃ´ng
- ThÃªm 5 test há»“i quy mÃ´ phá»ng Ä‘Ãºng DOM tá»« bÃ¡o lá»—i (CTA Ä‘á»©ng trÆ°á»›c nÃºt skip, nÃºt skip trong vÃ¹ng interstitial ngoÃ i `.video-ads`)

## [2.4.0] â€” 2026-10-25

> [!IMPORTANT]
> **Pháº£i cáº­p nháº­t mÃ¡y chá»§ key (`server/Code.gs`) TRÆ¯á»šC khi phÃ¡t hÃ nh báº£n nÃ y** â€” xem má»¥c "MÃ¡y chá»§ key" trong README.

### Báº£o máº­t
- **Key cÃ³ chá»¯ kÃ½ sá»‘ RSA-2048:** mÃ¡y chá»§ kÃ½ háº¡n dÃ¹ng, extension kiá»ƒm tra báº±ng khÃ³a cÃ´ng khai. Sá»­a `licenseValid`/`licenseExpires` trong storage báº±ng DevTools khÃ´ng cÃ²n má»Ÿ khÃ³a Ä‘Æ°á»£c; token gáº¯n vá»›i Ä‘Ãºng key (khÃ´ng dÃ¹ng chÃ©o), sá»­a háº¡n trong token lÃ m há»ng chá»¯ kÃ½
- NgÆ°á»i dÃ¹ng báº£n cÅ© Ä‘Æ°á»£c tá»± nÃ¢ng cáº¥p token khi khá»Ÿi Ä‘á»™ng / má»Ÿ popup, khÃ´ng pháº£i nháº­p láº¡i key

### ThÃªm
- **Ãnh sÃ¡ng ná»n (Ambient glow):** mÃ u video toáº£ má» phÃ­a dÆ°á»›i trÃ¬nh phÃ¡t, sau tiÃªu Ä‘á»/mÃ´ táº£ (kÃ¨m pháº£n chiáº¿u láº­t ngÆ°á»£c nhÆ° Ä‘Ã¨n háº¯t). Chá»‰ báº­t á»Ÿ giao diá»‡n tá»‘i, tá»± táº¯t khi YouTube Ä‘Ã£ báº­t "Cháº¿ Ä‘á»™ mÃ´i trÆ°á»ng" gá»‘c, khi toÃ n mÃ n hÃ¬nh. Nháº¹: canvas 48Ã—44, 10 khung/giÃ¢y, dá»«ng háº³n khi video táº¡m dá»«ng / tab áº©n; khÃ´ng trÃ n sang cá»™t Ä‘á» xuáº¥t hay thanh trÃªn cÃ¹ng
- **Nháº£y tá»›i Ä‘oáº¡n hay nháº¥t** (giá»‘ng Jump ahead cá»§a Premium): nÃºt trÃªn trÃ¬nh phÃ¡t + `Alt+J`, dÃ¹ng dá»¯ liá»‡u "Ä‘Æ°á»£c xem láº¡i nhiá»u nháº¥t" cá»§a YouTube (2 Ä‘á»‹nh dáº¡ng + dá»± phÃ²ng Ä‘á»c Ä‘á»“ thá»‹ trÃªn thanh tiáº¿n trÃ¬nh), bá» qua Ä‘á»‰nh giáº£ á»Ÿ mÃ n hÃ¬nh káº¿t thÃºc
- **SponsorBlock:** tá»± bá» qua Ä‘oáº¡n tÃ i trá»£ / tá»± quáº£ng bÃ¡ / nháº¯c Ä‘Äƒng kÃ½. DÃ¹ng API bÄƒm tiá»n tá»‘ (chá»‰ gá»­i 4 kÃ½ tá»± SHA-256 cá»§a ID video â€” mÃ¡y chá»§ khÃ´ng biáº¿t báº¡n xem gÃ¬). Má»—i Ä‘oáº¡n chá»‰ bá» qua 1 láº§n, tua ngÆ°á»£c láº¡i thÃ¬ Ä‘á»ƒ yÃªn; tÃ´n trá»ng kÃªnh trong whitelist
- **Cáº¥u hÃ¬nh tá»« xa:** `release/remote-config.json` â€” thÃªm selector khi YouTube/Spotify Ä‘á»•i giao diá»‡n, push lÃªn GitHub lÃ  má»i mÃ¡y nháº­n sau â‰¤6 giá», khÃ´ng cáº§n phÃ¡t hÃ nh báº£n má»›i. Chá»‰ lÃ  dá»¯ liá»‡u, Ä‘Æ°á»£c lÃ m sáº¡ch vÃ  kiá»ƒm tra cÃº phÃ¡p
- **Bá»™ test trong repo:** `npm test` (87 test: Chrome headless + Node) vÃ  GitHub Actions tá»± cháº¡y má»—i láº§n push

## [2.3.0] â€” 2026-10-24

### ThÃªm â€” TÃ­nh nÄƒng kiá»ƒu YouTube Premium
- **PhÃ¡t ná»n:** chuyá»ƒn tab / táº¯t mÃ n hÃ¬nh Ä‘iá»‡n thoáº¡i váº«n phÃ¡t (YouTube, Music, m.youtube). Chá»‰ tá»± phÃ¡t láº¡i khi YouTube dá»«ng ngay lÃºc áº©n tab (â‰¤3s); khÃ´ng tranh vá»›i cuá»™c gá»i hay thao tÃ¡c cá»§a ngÆ°á»i dÃ¹ng
- **HÃ¬nh trong hÃ¬nh:** nÃºt PiP trÃªn thanh Ä‘iá»u khiá»ƒn + phÃ­m táº¯t `Alt+P`
- **áº¨n lá»i má»i Premium:** mealbar / banner / popup "DÃ¹ng thá»­ YouTube Premium" trÃªn YouTube, Music, mobile
- **Cháº¥t lÆ°á»£ng Æ°u tiÃªn:** Tá»± Ä‘á»™ng / Cao nháº¥t / 4K / 1440p / 1080p / 720p / 480p â€” Ã¡p 1 láº§n cho má»—i video, ngÆ°á»i dÃ¹ng tá»± Ä‘á»•i giá»¯a chá»«ng váº«n Ä‘Æ°á»£c giá»¯
- Tá»± báº¥m "Báº¡n váº«n Ä‘ang nghe chá»©?" trÃªn YouTube Music
- Tháº» "TÃ­nh nÄƒng Premium" trong popup, báº­t/táº¯t tá»«ng tÃ­nh nÄƒng

### Sá»­a
- Äá»•i clip bá»‹ pause: tá»± phÃ¡t láº¡i trong 8s Ä‘áº§u náº¿u ngÆ°á»i dÃ¹ng khÃ´ng báº¥m dá»«ng; phÃ­m media pháº§n cá»©ng (MediaSession) vÃ  PiP Ä‘Æ°á»£c tÃ­nh lÃ  thao tÃ¡c ngÆ°á»i dÃ¹ng; giá»›i háº¡n tá»‘i Ä‘a 4 láº§n / 10s Ä‘á»ƒ khÃ´ng giáº±ng co vá»›i YouTube
- Whitelist so khá»›p chÃ­nh xÃ¡c vÃ  Ä‘á»“ng bá»™ khi tÃªn kÃªnh render cháº­m
- Spotify: banner QC tÄ©nh khÃ´ng cÃ²n lÃ m bÃ i hÃ¡t bá»‹ tua/skip
- Bá»™ Ä‘áº¿m "PhiÃªn nÃ y" hoáº¡t Ä‘á»™ng (cáº¥p quyá»n `chrome.storage.session` cho content script)

## [2.2.6] â€” 2026-10-24

### ThÃªm
- GÃ³i Ä‘iá»‡n thoáº¡i `funnygame-mobile`: cÃ¹ng cÃ¡ch cháº·n quáº£ng cÃ¡o, nÃºt Cháº·n QC trÃªn trang, popup full mÃ n. CÃ i báº±ng zip trÃªn trÃ¬nh duyá»‡t Android cÃ³ extension (Lemur, Quetta, Yandex). KhÃ´ng cháº¡y trong app YouTube/Spotify vÃ  khÃ´ng cÃ i Ä‘Æ°á»£c trÃªn iOS
- Bá»™ nguá»“n Safari iOS riÃªng Ä‘á»ƒ Ä‘Ã³ng gÃ³i báº±ng Xcode/App Store Connect; giao diá»‡n cáº£m á»©ng responsive, há»— trá»£ safe area, xoay ngang vÃ  nÃºt ná»•i tá»± thu gá»n khi cuá»™n
- Há»— trá»£ lá»c endpoint `/youtubei/v1/search` vÃ  cháº·n popup `bka-enforcement-message-view-model` má»›i cá»§a YouTube
- Bá»• sung thá»‘ng kÃª Spotify trong trang Báº£ng xáº¿p háº¡ng (`stats.html`)

### Tá»‘i Æ°u hiá»‡u nÄƒng
- Lá»c InnerTube (`stripAdsDeep`) trá»±c tiáº¿p in-place thay vÃ¬ clone toÃ n bá»™ cÃ¢y JSON lá»›n vÃ  bá» lá»c trÃ¹ng 2 láº§n qua `JSON.parse` + `fetch`/`XHR`
- Cache tham chiáº¿u DOM (`#movie_player`, `video`, `now-playing-bar`), gá»™p CSS selector vÃ  chá»‰ quÃ©t sÃ¢u nÃºt Skip / Anti-adblock khi thá»±c sá»± cÃ³ dáº¥u hiá»‡u quáº£ng cÃ¡o hoáº·c há»™p thoáº¡i
- Spotify Web Player: dÃ¹ng `textContent` trÃªn `now-playing-bar` kÃ¨m debounce `MutationObserver` thay vÃ¬ Ä‘á»c `innerText` toÃ n trang `#main` (trÃ¡nh giáº­t lag khi cuá»™n danh sÃ¡ch nháº¡c), tá»± dá»n dáº¹p `AudioBufferSourceNode` Ä‘Ã£ phÃ¡t xong
- Service Worker: lÆ°u danh sÃ¡ch tab Spotify Ä‘ang mute vÃ o `chrome.storage.session`, bá» keepalive alarm 1 phÃºt gÃ¢y tá»‘n tÃ i nguyÃªn ná»n

### Sá»­a
- **Háº¿t auto tua / 16x nháº§m video chÃ­nh:** chá»‰ coi lÃ  QC khi player cÃ³ class `ad-showing` **vÃ ** cÃ³ UI quáº£ng cÃ¡o Ä‘ang hiá»ƒn thá»‹ (badge, thá»i lÆ°á»£ng QC, nÃºt Skipâ€¦); bá» cÃ¡c Ä‘iá»u kiá»‡n dá»… nháº§m (`getAdState`, Ä‘á»™ dÃ i video â‰¤ 70â€“120s, class sÃ³t, `.ytp-ad-module` cÃ³ node con, regex "ad" khá»›p nháº§m chá»¯ "ahead")
- Gá»™p toÃ n bá»™ xá»­ lÃ½ QC video vá» má»™t mÃ¡y tráº¡ng thÃ¡i duy nháº¥t trong MAIN world (trÆ°á»›c Ä‘Ã¢y `content.js` vÃ  `content-main.js` cÃ¹ng tua/mute vÃ  tranh nhau)
- Ghi nhá»› vÃ  khÃ´i phá»¥c chÃ­nh xÃ¡c tá»‘c Ä‘á»™ (ká»ƒ cáº£ 1.25x/1.5x/2x) vÃ  tráº¡ng thÃ¡i mute cá»§a ngÆ°á»i dÃ¹ng sau QC; watchdog tá»± gá»¡ video chÃ­nh bá»‹ káº¹t >4x
- Há»— trá»£ Shorts qua cÃ¹ng cÆ¡ cháº¿ (má»i `.html5-video-player`), khÃ´ng cÃ²n tua Shorts thÆ°á»ng
- KhÃ´ng sá»­a `playerResponse` / khÃ´ng cháº·n máº¡ng trÃªn YouTube ná»¯a â†’ háº¿t mÃ n hÃ¬nh "ÄÃ£ xáº£y ra lá»—i. Vui lÃ²ng thá»­ láº¡i sau"
- Tá»± cháº·n QC láº¡i: theo class ad-showing, khÃ´ng che overlay chá»©a nÃºt Skip
- KhÃ´ng nháº­n nháº§m class/badge/getAdState sÃ³t thÃ nh QC (trÃ¡nh tua 16x hoáº·c báº¥m Skip trÃªn video chÃ­nh)
- Äá»“ng bá»™ cÃ i Ä‘áº·t (`muteAds`, `fastSkip`, `blockVideo`, `whitelistChannels`) sang MAIN world vÃ  táº¯t DNR khi táº¯t cÃ´ng táº¯c tá»•ng
- Sá»­a lá»—i ghi Ä‘Ã¨ máº¥t thá»‘ng kÃª khi má»Ÿ nhiá»u tab hoáº·c sau khi Ä‘áº·t láº¡i thá»‘ng kÃª; thanh "Má»¥c tiÃªu hÃ´m nay" tÃ­nh Ä‘Ãºng theo sá»‘ lÆ°á»£ng cháº·n trong ngÃ y (giá» Ä‘á»‹a phÆ°Æ¡ng)
- Bá»• sung Ä‘áº§y Ä‘á»§ cÃ¡c file thiáº¿u trong `scripts/build.js`

## [2.2.5] â€” 2026-09-17

### Sá»­a
- Auto-pause sau khi má»Ÿ láº¡i mÃ¡y: báº¥m Play rá»“i YouTube pause thÃ¬ tá»± phÃ¡t láº¡i; tab khÃ´i phá»¥c/ná»n Ä‘Æ°á»£c resume khi má»Ÿ láº¡i; khÃ´ng xÃ³a key lÃºc khá»Ÿi Ä‘á»™ng náº¿u háº¡n cÃ²n hiá»‡u lá»±c

## [2.2.4] â€” 2026-09-17

### Sá»­a
- Háº¿t auto-pause khi Ä‘á»•i clip: khÃ´ng tua currentTime lÃºc chuyá»ƒn bÃ i, giá»¯ field QC rá»—ng thay vÃ¬ xÃ³a (YouTube bá»›t phÃ¡t hiá»‡n adblock), bá» cháº·n watchtime/log_event

## [2.2.3] â€” 2026-09-15

### Sá»­a
- Háº¿t tá»± pause khi Ä‘á»•i clip: khÃ´ng cÃ²n coi class ad-showing sÃ³t lÃ  QC; tá»± phÃ¡t láº¡i náº¿u YouTube pause khÃ´ng do ngÆ°á»i dÃ¹ng

## [2.2.2] â€” 2026-09-15

### Sá»­a
- LÄƒn chuá»™t bá»‹ cá»©ng trÃªn YouTube: gá»¡ khÃ³a scroll khi dialog chá»‘ng QC bá»‹ áº©n nhÆ°ng váº«n giá»¯ overflow:hidden

## [2.2.1] â€” 2026-09-15

### Sá»­a
- Video khÃ´ng cÃ²n tá»± pause khi Ä‘á»•i clip/chÆ°Æ¡ng: chá»‰ skip/tua khi player thá»±c sá»± Ä‘ang QC, khÃ´ng Ä‘Ã³ng menu YouTube nháº§m
- Tá»± báº¥m tiáº¿p tá»¥c khi YouTube hiá»‡n há»™p thoáº¡i "Video Ä‘Ã£ táº¡m dá»«ng"

## [2.2.0] â€” 2026-09-09

### ThÃªm
- Há»— trá»£ YouTube Shorts: tá»± Ä‘á»™ng skip/mute quáº£ng cÃ¡o interstitial trong Shorts player
- Skip retry: thá»­ láº¡i tá»‘i Ä‘a 3 láº§n Ã— 200ms khi skip button chÆ°a ká»‹p render
- DNR rules bá»• sung: block `securepubads.g.doubleclick.net`, `imasdk.googleapis.com/ima3.js`, `tpc.googlesyndication.com`, YouTube `log_event` vÃ  `watchtime`
- Service Worker keepalive alarm (má»—i 1 phÃºt) Ä‘á»ƒ trÃ¡nh bá»‹ trÃ¬nh duyá»‡t kill giá»¯a chá»«ng

### Sá»­a
- Observer scope: dÃ¹ng `#page-manager` thay vÃ¬ `document.body` lÃ m fallback â€” giáº£m CPU overhead
- Video khÃ´ng bá»‹ pause sau khi seek tá»›i cuá»‘i quáº£ng cÃ¡o (`play()` sau `currentTime = duration`)

## [2.0.0] â€” 2026-08-23

### ThÃªm
- Lá»c InnerTube (hook fetch, XHR, JSON.parse) â€” cháº·n quáº£ng cÃ¡o trÆ°á»›c khi player load
- DeclarativeNetRequest cháº·n domain quáº£ng cÃ¡o
- Trang CÃ i Ä‘áº·t nÃ¢ng cao (options.html): whitelist kÃªnh, má»¥c tiÃªu ngÃ y, export/import
- Thá»‘ng kÃª chi tiáº¿t: video, banner, overlay, anti-adblock
- Lá»‹ch sá»­ 7 ngÃ y (biá»ƒu Ä‘á»“ trong CÃ i Ä‘áº·t)
- Há»— trá»£ YouTube Shorts, Music, mobile web
- Chá»‘ng thÃ´ng bÃ¡o anti-adblock cá»§a YouTube
- postMessage báº£o máº­t báº±ng token ná»™i bá»™
- Tráº¡ng thÃ¡i tab hiá»‡n táº¡i trong popup

### Sá»­a
- Content script cháº¡y `document_start`
- Dialog/overlay dismiss chuyá»ƒn sang MAIN world
- Äáº¿m banner ads khi áº©n element
- Reset thá»‘ng kÃª xÃ³a cáº£ breakdown vÃ  history

## [1.3.0] â€” 2026-08-23
- UI dock menu bo gÃ³c phong cÃ¡ch 2026

## [1.2.0] â€” 2026-08-23
- Giao diá»‡n tiáº¿ng Viá»‡t 3 tab, logo FUNNYGAME

## [1.0.0] â€” 2026-08-23
- PhiÃªn báº£n khá»Ÿi táº¡o â€” LuanEm2709

