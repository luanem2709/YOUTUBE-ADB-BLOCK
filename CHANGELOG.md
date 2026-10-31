# Changelog

## [2.4.15] — 2026-10-31

### Sửa — Rò rỉ bộ nhớ + giảm tải CPU (vòng quét thích ứng)
Bản 2.4.14 chạy ổn nhưng audit sâu phát hiện **3 vấn đề thật** về bộ nhớ/CPU khi xem YouTube lâu (vài giờ) hoặc mở nhiều tab.

- **Rò rỉ bộ nhớ — `MutationObserver` không bao giờ được ngắt (`content-main.js`):**
  Mỗi player YouTube được gắn 1 `MutationObserver` theo dõi class. Closure của observer giữ tham chiếu **mạnh** tới player (và toàn bộ cây con của nó). Nhưng code cũ chỉ là `knownPlayers.delete(p)` — **không gọi `disconnect()`** → mỗi lần YouTube thay player (SPA điều hướng) giữ lại player cũ vĩnh viễn.
  → Thêm `releasePlayer()`: `disconnect()` observer + `unobserve()` vùng UI QC + xoá khỏi `knownPlayers` / `playerObservers` / `adUiZones`. Được gọi tự động khi phát hiện player đã bị gỡ khỏi DOM.

- **Giảm tải CPU — vòng quét thích ứng (`content-main.js` + `content.js`):**
  Vòng quét chính chạy cứng **300ms** và quét banner mỗi **450ms**, kể cả khi:
  - tab đang ẩn (người dùng xem video ở tab khác) → đốt CPU vô ích
  - extension đã tắt / kênh bị whitelist
  → **Tab ẩn hoặc extension không hoạt động → nhịp quét giảm còn 1500ms (`content-main.js`) / 2000ms (`content.js`)**, tự quay lại nhịp nhanh ngay khi tab hiện lại (qua `visibilitychange`) hoặc khi bật/tắt extension (`applyConfig` → `refreshLoopRate()`).

- **Dọn hiệu ứng ngay khi tắt bảo vệ (`content-main.js`):**
  Vì vòng quét có thể chậm tới 1.5s, khi tắt extension hiệu ứng ánh sáng nền (ambient), class `fg-ad-active`, nút PiP và nút tua đều bị giữ lại thêm tới 1.5s. → Gọi `teardownAmbient()` / `setAdActive(false)` / `stopFastAdLoop()` / `ensurePipButton()` / `ensureJumpButton()` **ngay lập tức** trong handler `FG_LICENSE`.

- **An toàn license — TTL cho ảnh chụp trạng thái (`content-yt-net.js`):**
  Ảnh chụp `localStorage["__fg_state_v1"]` (cờ kích hoạt + whitelist) tồn tại vô thời hạn. Nếu người dùng gỡ extension (hoặc license hết hạn) mà trang vẫn còn snapshot `lic:1` → lớp chặn tầng mạng vẫn tưởng được phép gỡ quảng cáo.
  → Thêm **TTL 6 giờ**: snapshot cũ hơn 6 giờ bị coi là không hợp lệ **và bị xoá khỏi `localStorage`**.

### Sửa — Bộ test build báo FAIL giả do gói cũ sót lại
- **`tests/package.test.js`**: trước đây quét **mọi** file `.zip` trong `dist/`, nên gói build của phiên bản cũ còn sót lại (vd `v2.4.13` khi đã lên `v2.4.14`) báo FAIL vì manifest không khớp phiên bản hiện tại. → Chỉ kiểm tra gói đúng phiên bản hiện tại, thêm assertion `B1b` báo rõ gói nào cần xoá.
- **`scripts/build.js`**: tự **xoá gói build cũ** khỏi `dist/` mỗi lần build → `dist/` luôn chỉ có gói của phiên bản hiện tại.
- **`tests/package.test.js`**: thêm `content-yt-net.js` vào danh sách file bắt buộc trong gói (trước đó thiếu → file lớp mạng có thể bị rơi khi đóng gói).

### Sửa — CI bỏ sót file mới
- **`.github/workflows/test.yml`**: thêm `content-yt-net.js` vào bước kiểm tra cú pháp (file mới chưa từng được kiểm tra trong CI).

### Kiểm thử
- Trang test mới `tests/netfast.html` (5 assertion): snapshot quá hạn → không được gỡ QC, snapshot cũ bị xoá, cấu hình hợp lệ vẫn hoạt động
- `tests/main.html` thêm 4 assertion (53–53d): hook theo dõi player tồn tại, player giả được theo dõi, **player bị gỡ khỏi DOM → observer được giải phóng hoàn toàn**
- Bộ test: **322 PASS / 0 FAIL** + smoke test sạch console (13 trang)

### Ghi chú quyền riêng tư
- Không thay đổi phạm vi dữ liệu. Ảnh chụp `localStorage["__fg_state_v1"]` nay tự xoá sau 6 giờ.

## [2.4.14] — 2026-10-31

### Mới — "Bỏ qua hẳn": gỡ quảng cáo ngay trong dữ liệu YouTube (0 giây)
Người dùng hỏi: *"có cách nào để bỏ qua hẳn luôn không"* — tức là **không phát quảng cáo**, không đen màn hình, không phải đợi.

**Vấn đề của cách cũ (chỉ dựa vào DOM):** YouTube 2025+ không còn gắn `ad-showing` khi phát QC (chỉ có `ad-created` + `ytp-branding-shown`), nên nhận biết bằng DOM không ổn định. Tệ hơn: **QC chèn phía server (SSAI) nằm chung luồng video chính** → tua tới cuối sẽ tua mất luôn video thật. Và QC đã tải về = tốn băng thông + người dùng vẫn thấy khung hình QC.

**Cách mới — can thiệp ở tầng mạng (MAIN world, `document_start`):** file mới `content-yt-net.js` chạy **trước** mã của YouTube, chặn phản hồi API `/youtubei/v1/player` và **xoá `adPlacements` / `playerAds` / `adSlots`** khỏi `playerResponse`.

> YouTube không bao giờ nhận được danh sách quảng cáo → không tạo slot QC → **không tải video QC, không hiện UI QC, không đen màn hình**. Người dùng xem thẳng nội dung.

- **`content-yt-net.js` (file mới):**
  - Hook `window.fetch` — đọc lại body của phản hồi player, gỡ slot QC, trả về `Response` mới (giữ nguyên `status`/`headers`/`url`)
  - Hook `XMLHttpRequest.prototype.responseText` / `.response` — cho các luồng cũ còn dùng XHR
  - Dò `ytInitialPlayerResponse`, `ytcfg` (`set`/`set_`/`data_`) và `ytplayer.config.args.player_response` — gỡ QC trước khi player đọc
  - Chỉ can thiệp khi: **đã kích hoạt + không whitelist + cài đặt "Bỏ qua hẳn" đang bật**
  - **Cầu chì an toàn:** nếu gỡ slot QC làm YouTube lỗi phát video → tự ngắt lớp chặn mạng (`trip()`) và tải lại video bình thường
- **`content-main.js` — bỏ qua tức thì qua API player:**
  - `enterAd()` gọi `player.skipAd()` sau 120ms → YouTube chuyển thẳng sang video chính, **không cần đợi nút "Bỏ qua" xuất hiện**
  - Thay cờ "gọi 1 lần" bằng bộ giới hạn tần suất (`SKIP_API_GAP` 700ms / `SKIP_API_MAX` 4 lần) — giữ được lợi ích "gọi sớm" mà vẫn không spam (tránh treo trình duyệt như bản 2.4.12)
- **Cài đặt mới `blockManifest`** ("Bỏ qua hẳn quảng cáo") trong popup — bật mặc định, tắt được nếu video nào lỗi
- **`content.js`** gửi thêm message `FG_NET_CONFIG` (license + whitelist + cài đặt) cho lớp mạng; lưu whitelist vào `sessionStorage` để lần tải trang sau khỏi phải chờ
- **`content-main.js` — `collectDiagnostics()`** bổ sung nhóm `net` (số phản hồi đã gỡ QC, trạng thái cầu chì)

### Kiểm thử
- Trang test mới `tests/net.html` (25 assertion): gỡ `adPlacements`/`playerAds`/`adSlots`, giữ nguyên `streamingData`/`playabilityStatus`, xử lý playerResponse lồng, nhận diện đúng endpoint, tôn trọng license/whitelist/cài đặt, cầu chì `trip()`, gỡ QC từ `ytInitialPlayerResponse`
- `tests/main.html` thêm 5 assertion (50–52): `skipAd()` được gọi khi vào QC, có giới hạn tần suất, diagnostics có nhóm `net`
- Bộ test: **313 PASS / 0 FAIL** + smoke test sạch console (13 trang)

### Ghi chú quyền riêng tư
- Lớp chặn tầng mạng lưu 1 ảnh chụp trạng thái nhỏ trong `localStorage` (`__fg_state_v1`): cờ kích hoạt + danh sách whitelist + cờ cài đặt. Dùng để lớp mạng biết ngay từ khi khởi động mà không phải chờ tin nhắn cấu hình. **Không chứa dữ liệu nhạy cảm**, không gửi ra ngoài.

## [2.4.13] — 2026-10-31

### Sửa — QC vẫn hiện (nguyên nhân gốc tìm được từ báo cáo lỗi thật)
Người dùng gửi báo cáo chẩn đoán từ trang YouTube thật (video `j8U06veqxdU`) cho thấy QC vẫn hiện. Dữ liệu chỉ ra **nguyên nhân gốc**:

```
playerClass: "... ytp-transparent ... ad-created ytp-branding-shown
               playing-mode buffering-mode unstarted-mode"
adShowing: false      confirmedAd: false
ytAdState: -1         ytPlayerState: -1
```

**YouTube KHÔNG LUÔN gắn `ad-showing`/`ad-interrupting` khi đang phát QC.** Trong trường hợp này player chỉ có:
- `ad-created` — YouTube đã tạo player QC
- `ytp-branding-shown` — nhãn "Quảng cáo" đang hiện
- `ytp-transparent` — player trong suốt (kiểu overlay QC mới)

Hệ quả trước đây: `hasAdClass()` = `false` → `isConfirmedAd()` = `false` → extension **không hề xử lý QC** → `exitAd()` reset `video.style.opacity = ""` → **QC hiện ra cho người dùng**.

- **`content-main.js` — nhận biết QC mới (3 đường):**
    1. `ad-created` + **UI QC hiển thị thật** (nút "Bỏ qua" / badge QC trong `.video-ads` / khung `skip-button-slot` / interstitial / `overlay-container`)
    2. `ad-created` + `ytp-branding-shown` + overlay QC trong `.video-ads`
    3. Đường cũ (`ad-showing`/`ad-interrupting` + UI QC) và QC bumper (overlay + badge) — giữ nguyên
- **`content-main.js` — hàm `hasVisibleAdUi()`:** tập trung tín hiệu UI QC, **loại bỏ** các tín hiệu dễ gây nhận nhầm (overlay trần không badge, badge nằm ngoài `.video-ads`, `.ytp-ad-progress-list` — luôn có trong thanh tiến trình kể cả video chính)
- **`content.css` — thêm `.ad-created` vào nhóm ẩn overlay QC:** trước đó không có class nào được ẩn nên QC hiện ra dù extension có xử lý
- **`content-main.js` — `MutationObserver` theo dõi vùng UI QC:** phát hiện nút "Bỏ qua" **xuất hiện** → bấm ngay lập tức, không phải chờ lượt quét 300ms
- **`content-main.js` — `exitAd()` reset `skipClickedAt`/`skipApiCalled`:** trước đó mốc "đã bấm nút Bỏ qua" không được reset → `fallbackActive` bị bật sai ở QC kế tiếp (tua thẳng về cuối ngay lập tức)
- **`content-main.js` — chờ khôi phục 700ms chỉ khi còn dấu hiệu QC:** nếu mất hết dấu hiệu → khôi phục ngay, tránh video chính bị kẹt 16x
- **`collectDiagnostics()`** bổ sung `adClass` / `adCreated` / `adBranding` / `visibleAdUi` để chẩn đoán chính xác hơn

### Sửa — Test bị "rò rỉ trạng thái" làm hỏng 29 test
`tests/main.html` test 38 tạo interstitial chứa nút "Bỏ qua" nhưng **quên xóa** → nút vẫn còn trong DOM → mọi test phía sau bị coi là đang có QC → kẹt 16x. Đã sửa và bổ sung comment giải thích.

### Kiểm thử
- Thêm 9 assertion hồi quy trong `tests/main.html` (45–49): QC kiểu mới chỉ có `ad-created`, `ad-created` không có UI QC (phải **không** tua nhầm video chính), QC có nút "Bỏ qua" kiểu mới, nút "Bỏ qua" xuất hiện muộn, `ad-created` + branding + overlay không badge
- Bộ test: **283 PASS / 0 FAIL** + smoke test sạch console

## [2.4.12] — 2026-10-31

### Sửa — QC bị "chậm" / phải đợi tới hết thời lượng mới tự mất
Báo cáo từ người dùng: *"khi hiện quảng cáo nó có tự động bỏ qua liền không… tôi thấy khi hiện quảng cáo tua nhanh có bỏ qua có nhưng bị chậm và đôi lúc không hiện nút bỏ qua để bấm, phải đợi tua nhanh tới hết time mới tự mất quảng cáo"*.

Rà soát lại toàn bộ chuỗi xử lý QC và tìm ra **4 nguyên nhân** khiến việc bỏ quảng cáo chậm:

- **`content-main.js` — thời gian chờ giữa 2 lần bấm nút "Bỏ qua" quá dài (3s):** nếu lần bấm đầu không ăn (YouTube mới render nút, handler chưa sẵn sàng), phải chờ **3 giây** mới thử lại → cảm giác "chậm". Đổi `SKIP_RETRY_MS` 3000 → **1200ms**, nâng trần `SKIP_MAX_PER_BTN` 6 → 8
- **`content-main.js` — QC dài (>20s) CÓ nút "Bỏ qua" bị cố tình giữ tốc độ 1x:** logic cũ (`holdFastSkip`) chủ động **không tua** khi thấy nút "Bỏ qua", vì sợ tua trước khi nút ăn sẽ làm YouTube hủy QC rồi hiện QC kế tiếp. Hệ quả: nếu click không ăn, người dùng phải đứng yên nhìn QC chạy tới hết. Nay **luôn tua 16x** (tua 16x không làm mất nút "Bỏ qua") + chỉ giới hạn việc *seek*
- **`content-main.js` — seek tới cuối bị điều kiện buffer chặn:** `isBufferedAt()` yêu cầu QC phải buffer sẵn tới cuối mới cho seek. Với mạng yếu / QC dài, điều kiện này không bao giờ đúng → **không seek được → chỉ còn chạy 16x tới hết QC** (đúng triệu chứng người dùng mô tả). Nay seek tới cuối **không cần buffer** (Chrome tự tải phần còn lại, vài KB)
- **`content-main.js` — thiếu phương án dự phòng khi bấm nút không ăn:** thêm `SKIP_FALLBACK_MS` (1.2s) — sau khi đã bấm nút "Bỏ qua" mà QC vẫn còn, tự chuyển sang chế độ dự phòng seek thẳng tới cuối QC

### Sửa — Tìm nút "Bỏ qua" bỏ sót nhiều trường hợp
- Thêm **Pass 3**: quét **mọi vùng QC** (`.ytp-ad-player-overlay`, `.ytp-ad-overlay-container`, `.ytp-ad-skip-button-slot`, `.ytp-ad-action-interstitial`, `.ytp-video-interstitial-buttoned-centered-layout`, …) tìm nút theo **chữ** "Bỏ qua / Skip" → bắt được nút YouTube đặt **ngoài `.video-ads`** hoặc khi YouTube đổi tên class
- Bổ sung selector cho nút dạng `<div>` / class lạ: `.ytp-ad-skip-button-modern`, `[class*='skip-ad-button']`, `[id^='skip-button']`
- Gom hàm `collectSkipButtons()` dùng chung cho cả "bấm" và "kiểm tra có nút" → trước đây 2 hàm có thể thấy 2 nút khác nhau, gây mâu thuẫn
- `player.skipAd()` giờ chỉ gọi **1 lần cho mỗi QC** (trước gọi mỗi lần bấm → player re-init liên tục, có thể làm treo trình duyệt)

### Mới — Nhận biết QC qua API nội bộ YouTube
- Dùng `player.getAdState()` (1 = đang phát QC, 2 = đã xong) và `player.getPlayerState()` thay vì chỉ tin class DOM → xác nhận QC chính xác hơn khi UI QC render chậm
- `collectDiagnostics()` bổ sung nhóm `ad` + `skipStats` + `handleStats` → phục vụ chẩn đoán bằng `FG_DIAG_REQ`

### Kiểm thử
- Thêm `tests/watch_yt.js` — công cụ **theo dõi trực tiếp** hành vi bỏ QC trên trang YouTube thật (Chrome headless + DevTools Protocol), in timeline QC xuất hiện → bấm nút → QC kết thúc
- Bổ sung 6 assertion hồi quy vào `tests/main.html`: nút skip bấm không ăn → phải tự tua tới cuối (không đứng yên), nút skip ăn ngay → QC kết thúc, nút skip class lạ → vẫn bấm được, nút skip ngoài `.video-ads` → vẫn bấm được, QC không có nút + không buffer → vẫn seek tới cuối
- Bộ test: **273 PASS / 0 FAIL**

## [2.4.11] — 2026-10-31

### Mới — Chặn quảng cáo MUA SẮM (shopping ads)
Bổ sung chặn dạng quảng cáo hiển thị **thẻ sản phẩm có giá** (ví dụ "Thẻm tập Yoga cao cấp TP… 125.000₫ · Cửa hàng trình liên kết Shopee"). Đây là dạng quảng cáo của YouTube Shopping / kênh bán hàng liên kết, **không** thuộc nhóm banner quảng cáo chuẩn nên trước đây không bị chặn.

- **`content.css`:** ẩn (theo class `html.fg-no-shopping`) bảng "Sản phẩm" bên cạnh video, dải sản phẩm dưới video, kệ merch, sticker sản phẩm dán đè trên Shorts, nút "Mua sắm"/"Sản phẩm nổi bật" và các panel `shopping_panel*`
- **`content.js`:** thêm lớp bảo vệ thứ hai bằng JS (`hideShoppingAds()`) — bắt được phần tử render muộn (YouTube chèn sau khi CSS áp dụng) và **đếm vào thống kê** ở mục mới "Mua sắm"
- **Hoàn tác đúng:** thêm `restoreShoppingAds()` gỡ inline style khi người dùng tắt setting hoặc tắt bảo vệ — trước đó các node đã ẩn sẽ **ẩn vĩnh viễn** không thể hiện lại
- **Cấu hình từ xa:** `release/remote-config.json` có thêm danh sách `yt.shopping` (version 3 → 4) để sửa selector khi YouTube đổi tên class mà không cần phát hành bản mới
- **DNR:** thêm 3 rule chặn request tracking của shopping ads (`/api/stats/shopping`, `/pagead/shopping`, `/ptracking/shopping`)
- **Giao diện:** thêm công tắc "Quảng cáo mua sắm" trong popup + mục "Mua sắm" trong bảng thống kê (popup & stats)

### Kiểm thử
- Thêm `tests/shopping.html` — 13 assertion: class `fg-no-shopping` bật/tắt đúng, mọi thành phần shopping bị ẩn, **không** ẩn nhầm tiêu đề video/bình luận, phần tử render muộn vẫn bị ẩn, đếm vào thống kê, và bật/tắt setting hoàn tác đúng
- Bộ test: **261 PASS / 0 FAIL**

## [2.4.10] — 2026-10-31

### Sửa — Lỗi "vacuous test" + race condition ghi thống kê
Vòng rà soát tự động lần 2 (syntax, JSON, DNR rules, remote-config, đóng gói, smoke test console) phát hiện thêm:

- **`content.js` vẫn đặt `display:none` cho `.ytp-ad-overlay-container`:** `hideOverlayAds()` gọi nhầm `hideElements()` thay vì `hideElementsSoft()` → nút "Bỏ qua" mất kích thước (`offsetWidth = 0`) → **auto-skip không bấm được nút**. Sửa lại dùng `hideElementsSoft()` (chỉ `opacity: 0`, giữ nguyên kích thước nút con)
- **Race condition ghi `chrome.storage.local`:** `flushStats()` và `detectAndStoreUser()` cùng đọc→sửa→ghi `userStats` song song → mỗi bên giữ một bản sao cũ, bản ghi sau **đè mất** phần của bản ghi trước (mất số quảng cáo đã chặn). Thêm hàng đợi `enqueueStorageWrite()` để serialize mọi lần ghi
- **`tests/css.html` là test "vacuous":** nạp `license.js` thật (token giả → `verifyStored` fail) khiến `isEnabled = false` → `hideOverlayAds()` **không bao giờ chạy** → test luôn PASS dù code sai. Nay mock license đúng cách, mock `chrome.storage` hỗ trợ cả callback lẫn Promise API
- **`release/update.xml` còn version `2.4.8`** (stale) → đồng bộ `2.4.10`
- **`package.json` version `2.4.0`** (stale) → đồng bộ `2.4.10`
- **`one.js` nằm sai chỗ ở thư mục gốc** → chuyển vào `tests/`
- **`popup.js` / `stats.js` cũng dính race condition ghi `userStats`** (`touchCurrentUser()` vs `confirmResetBtn`, `patchCurrentUser()` vs `confirmResetBtn`) → áp dụng cùng cơ chế `enqueueStorageWrite()`

### Kiểm thử
- Thêm `tests/smoke.js` — chạy 12 trang test bằng Chrome headless, thu console error và phát hiện trang không chạy xong
- Thêm `tests/storage.test.js` — chứng minh race condition là thật (khi không serialize thì mất dữ liệu) và fix hoạt động
- Thêm `tests/package.test.js` — kiểm tra 3 gói build: đủ file bắt buộc, không lộ khóa riêng, manifest hợp lệ, dữ liệu demo chỉ ở chế độ `?preview`
- Đăng ký `npm run smoke` + `npm run build` + `tests/package.test.js` vào CI (`.github/workflows/test.yml`)
- Thêm `tests/mkpopup.js` + `tests/mkpages.js` — sinh tự động trang test cho `popup.html` / `stats.html` / `options.html` từ HTML gốc (mock `chrome.*` + script kiểm tra), bảo đảm test luôn khớp với giao diện thật và không bị "vacuous"
- Thêm `tests/one.js` — chạy riêng 1 trang test và in lỗi console (debug nhanh)
- Bộ test: **248 PASS / 0 FAIL** + 12/12 trang smoke sạch console + 19/19 kiểm tra gói build


## [2.4.9] — 2026-10-31

### Sửa — Đồng bộ hoàn toàn với bộ test + loại bỏ lỗi "treo"/"QC hiện liên tục"
Rà soát toàn bộ dự án và chạy lại bộ test (`npm test`) đã phát hiện và sửa các lỗi sau:

- **`content.css` ẩn `.ytp-ad-overlay-container` bằng `display: none`:** nút "Bỏ qua" của YouTube nằm BÊN TRONG khung này → `display:none` làm nút mất kích thước (`offsetWidth = 0`) nên bộ auto-skip **không bao giờ bấm được nút "Bỏ qua"** trong bản thật. Đổi sang `opacity: 0` (giữ nguyên kích thước) và thêm lớp `html.fg-ad-active` để ẩn phủ QC còn sót
- **`content.js` cũng đặt `display:none` cho `.ytp-ad-overlay-container`:** tách thành `hideElementsSoft()` (dùng `opacity`) để không phá vỡ nút "Bỏ qua"; các lớp phủ thuần hình ảnh (`.ytp-ad-text-overlay`, `.ytp-ad-image-overlay`) vẫn ẩn hoàn toàn
- **`fireClick()` bắn click 2 lần** (`el.click()` + `dispatchEvent`) → mỗi lượt bấm kích hoạt handler 2–4 lần do event nổi lên nút cha → spam click, treo trình duyệt. Bỏ `el.click()`, giữ lại 1 sự kiện `click`
- **Chống spam nút "Bỏ qua":** mỗi nút chỉ bấm lại sau 3s và tối đa 6 lần/nút (thay vì cooldown 150ms không giới hạn)
- **QC bumper (YouTube 2025+)** không gắn class `ad-showing` (chỉ có overlay + badge) → trước đây không hề bị nhận diện. Bổ sung `hasBumperAd()`; vòng quét nhanh 35ms cũng giữ chạy cho loại QC này
- **Thiếu class `fg-ad-active` trên `<html>`** (được CSS dùng để ẩn phủ QC) → bổ sung `setAdActive()` bật/tắt theo vòng đời QC
- **Thiếu nav guard:** bấm nút "Bỏ qua" nằm trong thẻ `<a>` có thể nhảy trình duyệt sang trang quảng cáo. Bổ sung Navigation API `navigate` + chặn click `<a>` ra ngoài trong capture phase, chỉ kích hoạt đúng khoảnh khắc bấm nút
- **QC dài (>20s) bị tua 16x ngay khi còn nút "Bỏ qua":** tua trước khi nút "ăn" click khiến YouTube hủy QC rồi hiện QC kế tiếp → QC hiện liên tục. Nay: QC ngắn ≤20s vẫn tua 16x; QC dài chỉ bấm nút, và chỉ tua sau thời gian chờ 1,5s nếu nút chưa xuất hiện
- **YouTube reset QC về đầu sau khi đã tua:** `st.seekedEnd` còn giữ `true` nên không tua lại. Nay phát hiện `currentTime` quay về gần đầu và tua lại tới cuối (có giới hạn 700ms để tránh vòng lặp)
- **`rules/dnr_rules.json` chưa có rule nào cho YouTube** (chỉ có Spotify) → bổ sung 9 rule chặn tài nguyên quảng cáo Google (doubleclick, googlesyndication, googleadservices, pagead, ptracking…) — **không** chặn `media`/`googlevideo` nên không ảnh hưởng tải video
- **`release/remote-config.json` có `adSignals`/`skipButtons` rỗng** → điền selector dự phòng cho giao diện QC mới, tăng `version` 2 → 3

### Sửa — Spotify
- **Nhận nhầm bài hát thật là quảng cáo:** `mediaSessionLooksLikeAd()` và `isAdPlaying()` dùng `includes("advertisement")` trên tiêu đề/nghệ sĩ → bài hát tên "Advertisement" bị tua/mute nhầm. Nay so khớp **chính xác** từng trường
- **Mất tốc độ phát của người dùng:** sau QC luôn trả về `1x` → nay nhớ và khôi phục đúng tốc độ gốc (ví dụ 1.5x)

### Bảo mật
- **XSS trong `stats.js`:** tên hiển thị do người dùng tự đặt được chèn thẳng vào `innerHTML` → chạy được script trong trang extension (đọc được `chrome.storage` chứa token key). Nay chuyển sang `textContent`
- **`installer/google-apps-script/Code.gs` là bản cŨ còn lỗ hổng `?action=seed`** (bất kỳ ai có link cũng tạo được key mẫu, không cần chữ ký số) → đồng bộ lại đúng bản `server/Code.gs` đã khóa

### Kiểm thử
- Thêm `tests/css.html` — test hồi quy nạp `content.css` + `content.js` thật, chống tái phát lỗi "ẩn khung chứa nút Bỏ qua"
- Thêm `tests/rules.test.js` — kiểm tra `rules/dnr_rules.json` + `release/remote-config.json`
- Bổ sung test cho QC bumper, `fg-ad-active`, nav guard, tua lại sau khi QC bị reset, tua 16x QC không có nút skip
- Bộ test: **217 PASS / 0 FAIL**

## [2.4.8] — 2026-10-29

### Sửa — Quảng cáo hiện liên tục / nhảy sang trang quảng cáo
Nguyên nhân gốc tìm ra từ báo lỗi "Báo lỗi QC" (v2.4.7): trong layout interstitial của YouTube, **nút CTA của nhà quảng cáo** (`button#ad-button:t.ytp-ad-button-vm`, nằm trong `.ytp-ad-button-container`) **đứng trước** nút "Bỏ qua" (`button#skip-button:y.ytp-skip-ad-button`) trong thứ tự DOM. Vì `querySelectorAll` trả về theo thứ tự DOM nên extension bấm nhầm CTA → trình duyệt nhảy sang trang quảng cáo, đồng thời `clickSkip()` trả `true` khiến **nút "Bỏ qua" không bao giờ được bấm** → QC cứ hiện lại liên tục.

- **Tách nút CTA khỏi nhóm nút "Bỏ qua":** `.ytp-ad-button-vm` bị loại khỏi `SKIP_STR` và chuyển sang nhóm `CONTINUE_STR` (chỉ dùng khi chữ nút khớp "Tiếp tục / Continue", là phương án cuối cùng)
- **Thêm `isCtaButton()`:** chặn mọi nút CTA của nhà quảng cáo (`.ytp-ad-button-vm`, `.ytp-ad-button`, `.ytp-ad-clickable`, `.ytp-ad-call-to-action`, `.ytp-ad-button-container`, `.ytp-ad-hover-text-button`) và cả nút có lời kêu gọi hành động (Mua ngay, Học thêm, Đăng ký, Learn, Shop, Buy…)
- **Dò nút skip theo THỨ TỰ ƯU TIÊN** (`SKIP_PRIORITY`) thay vì selector gộp — nút `skip-button` / `.ytp-skip-ad-button` được bấm trước mọi thứ khác
- **Nav guard không còn `stopPropagation()`:** trước đây chặn event ở capture phase trên `document` khiến handler của YouTube không bao giờ nhận được click → nút "Bỏ qua" không ăn. Giờ chỉ `preventDefault()` (vẫn chặn được điều hướng của thẻ `<a>`)
- **Bỏ kiểm tra `ancestorsVisible` ở đường bấm nhanh:** nút skip trong layout interstitial có thể nằm trong vùng bị CSS của extension ẩn (`offsetWidth = 0`) nhưng synthetic click vẫn ăn
- **Thêm observer bao trọn player** (`attachInterstitialWatcher`): layout `.ytp-video-interstitial-buttoned-centered-layout` nằm ngoài `.video-ads` / `.ytp-ad-module` / `.ytp-ad-player-overlay` nên observer cũ không bắt được nút skip vừa xuất hiện
- **Trần bấm chuyển sang theo từng nút** (tối đa 6 lần/nút) thay vì trần toàn cục 8 lần — trần cũ bị CTA/nút khác "ăn" mất nên hết lượt bấm nút "Bỏ qua"
- **`fireClick` bổ sung `pointerdown` / `pointerup`:** nút skip interstitial của YouTube dùng PointerEvent để quyết định có "ăn" click hay không
- Thêm 5 test hồi quy mô phỏng đúng DOM từ báo lỗi (CTA đứng trước nút skip, nút skip trong vùng interstitial ngoài `.video-ads`)

## [2.4.0] — 2026-10-25

> [!IMPORTANT]
> **Phải cập nhật máy chủ key (`server/Code.gs`) TRƯỚC khi phát hành bản này** — xem mục "Máy chủ key" trong README.

### Bảo mật
- **Key có chữ ký số RSA-2048:** máy chủ ký hạn dùng, extension kiểm tra bằng khóa công khai. Sửa `licenseValid`/`licenseExpires` trong storage bằng DevTools không còn mở khóa được; token gắn với đúng key (không dùng chéo), sửa hạn trong token làm hỏng chữ ký
- Người dùng bản cũ được tự nâng cấp token khi khởi động / mở popup, không phải nhập lại key

### Thêm
- **Ánh sáng nền (Ambient glow):** màu video toả mờ phía dưới trình phát, sau tiêu đề/mô tả (kèm phản chiếu lật ngược như đèn hắt). Chỉ bật ở giao diện tối, tự tắt khi YouTube đã bật "Chế độ môi trường" gốc, khi toàn màn hình. Nhẹ: canvas 48×44, 10 khung/giây, dừng hẳn khi video tạm dừng / tab ẩn; không tràn sang cột đề xuất hay thanh trên cùng
- **Nhảy tới đoạn hay nhất** (giống Jump ahead của Premium): nút trên trình phát + `Alt+J`, dùng dữ liệu "được xem lại nhiều nhất" của YouTube (2 định dạng + dự phòng đọc đồ thị trên thanh tiến trình), bỏ qua đỉnh giả ở màn hình kết thúc
- **SponsorBlock:** tự bỏ qua đoạn tài trợ / tự quảng bá / nhắc đăng ký. Dùng API băm tiền tố (chỉ gửi 4 ký tự SHA-256 của ID video — máy chủ không biết bạn xem gì). Mỗi đoạn chỉ bỏ qua 1 lần, tua ngược lại thì để yên; tôn trọng kênh trong whitelist
- **Cấu hình từ xa:** `release/remote-config.json` — thêm selector khi YouTube/Spotify đổi giao diện, push lên GitHub là mọi máy nhận sau ≤6 giờ, không cần phát hành bản mới. Chỉ là dữ liệu, được làm sạch và kiểm tra cú pháp
- **Bộ test trong repo:** `npm test` (87 test: Chrome headless + Node) và GitHub Actions tự chạy mỗi lần push

## [2.3.0] — 2026-10-24

### Thêm — Tính năng kiểu YouTube Premium
- **Phát nền:** chuyển tab / tắt màn hình điện thoại vẫn phát (YouTube, Music, m.youtube). Chỉ tự phát lại khi YouTube dừng ngay lúc ẩn tab (≤3s); không tranh với cuộc gọi hay thao tác của người dùng
- **Hình trong hình:** nút PiP trên thanh điều khiển + phím tắt `Alt+P`
- **Ẩn lời mời Premium:** mealbar / banner / popup "Dùng thử YouTube Premium" trên YouTube, Music, mobile
- **Chất lượng ưu tiên:** Tự động / Cao nhất / 4K / 1440p / 1080p / 720p / 480p — áp 1 lần cho mỗi video, người dùng tự đổi giữa chừng vẫn được giữ
- Tự bấm "Bạn vẫn đang nghe chứ?" trên YouTube Music
- Thẻ "Tính năng Premium" trong popup, bật/tắt từng tính năng

### Sửa
- Đổi clip bị pause: tự phát lại trong 8s đầu nếu người dùng không bấm dừng; phím media phần cứng (MediaSession) và PiP được tính là thao tác người dùng; giới hạn tối đa 4 lần / 10s để không giằng co với YouTube
- Whitelist so khớp chính xác và đồng bộ khi tên kênh render chậm
- Spotify: banner QC tĩnh không còn làm bài hát bị tua/skip
- Bộ đếm "Phiên này" hoạt động (cấp quyền `chrome.storage.session` cho content script)

## [2.2.6] — 2026-10-24

### Thêm
- Gói điện thoại `funnygame-mobile`: cùng cách chặn quảng cáo, nút Chặn QC trên trang, popup full màn. Cài bằng zip trên trình duyệt Android có extension (Lemur, Quetta, Yandex). Không chạy trong app YouTube/Spotify và không cài được trên iOS
- Bộ nguồn Safari iOS riêng để đóng gói bằng Xcode/App Store Connect; giao diện cảm ứng responsive, hỗ trợ safe area, xoay ngang và nút nổi tự thu gọn khi cuộn
- Hỗ trợ lọc endpoint `/youtubei/v1/search` và chặn popup `bka-enforcement-message-view-model` mới của YouTube
- Bổ sung thống kê Spotify trong trang Bảng xếp hạng (`stats.html`)

### Tối ưu hiệu năng
- Lọc InnerTube (`stripAdsDeep`) trực tiếp in-place thay vì clone toàn bộ cây JSON lớn và bỏ lọc trùng 2 lần qua `JSON.parse` + `fetch`/`XHR`
- Cache tham chiếu DOM (`#movie_player`, `video`, `now-playing-bar`), gộp CSS selector và chỉ quét sâu nút Skip / Anti-adblock khi thực sự có dấu hiệu quảng cáo hoặc hộp thoại
- Spotify Web Player: dùng `textContent` trên `now-playing-bar` kèm debounce `MutationObserver` thay vì đọc `innerText` toàn trang `#main` (tránh giật lag khi cuộn danh sách nhạc), tự dọn dẹp `AudioBufferSourceNode` đã phát xong
- Service Worker: lưu danh sách tab Spotify đang mute vào `chrome.storage.session`, bỏ keepalive alarm 1 phút gây tốn tài nguyên nền

### Sửa
- **Hết auto tua / 16x nhầm video chính:** chỉ coi là QC khi player có class `ad-showing` **và** có UI quảng cáo đang hiển thị (badge, thời lượng QC, nút Skip…); bỏ các điều kiện dễ nhầm (`getAdState`, độ dài video ≤ 70–120s, class sót, `.ytp-ad-module` có node con, regex "ad" khớp nhầm chữ "ahead")
- Gộp toàn bộ xử lý QC video về một máy trạng thái duy nhất trong MAIN world (trước đây `content.js` và `content-main.js` cùng tua/mute và tranh nhau)
- Ghi nhớ và khôi phục chính xác tốc độ (kể cả 1.25x/1.5x/2x) và trạng thái mute của người dùng sau QC; watchdog tự gỡ video chính bị kẹt >4x
- Hỗ trợ Shorts qua cùng cơ chế (mọi `.html5-video-player`), không còn tua Shorts thường
- Không sửa `playerResponse` / không chặn mạng trên YouTube nữa → hết màn hình "Đã xảy ra lỗi. Vui lòng thử lại sau"
- Tự chặn QC lại: theo class ad-showing, không che overlay chứa nút Skip
- Không nhận nhầm class/badge/getAdState sót thành QC (tránh tua 16x hoặc bấm Skip trên video chính)
- Đồng bộ cài đặt (`muteAds`, `fastSkip`, `blockVideo`, `whitelistChannels`) sang MAIN world và tắt DNR khi tắt công tắc tổng
- Sửa lỗi ghi đè mất thống kê khi mở nhiều tab hoặc sau khi đặt lại thống kê; thanh "Mục tiêu hôm nay" tính đúng theo số lượng chặn trong ngày (giờ địa phương)
- Bổ sung đầy đủ các file thiếu trong `scripts/build.js`

## [2.2.5] — 2026-09-17

### Sửa
- Auto-pause sau khi mở lại máy: bấm Play rồi YouTube pause thì tự phát lại; tab khôi phục/nền được resume khi mở lại; không xóa key lúc khởi động nếu hạn còn hiệu lực

## [2.2.4] — 2026-09-17

### Sửa
- Hết auto-pause khi đổi clip: không tua currentTime lúc chuyển bài, giữ field QC rỗng thay vì xóa (YouTube bớt phát hiện adblock), bỏ chặn watchtime/log_event

## [2.2.3] — 2026-09-15

### Sửa
- Hết tự pause khi đổi clip: không còn coi class ad-showing sót là QC; tự phát lại nếu YouTube pause không do người dùng

## [2.2.2] — 2026-09-15

### Sửa
- Lăn chuột bị cứng trên YouTube: gỡ khóa scroll khi dialog chống QC bị ẩn nhưng vẫn giữ overflow:hidden

## [2.2.1] — 2026-09-15

### Sửa
- Video không còn tự pause khi đổi clip/chương: chỉ skip/tua khi player thực sự đang QC, không đóng menu YouTube nhầm
- Tự bấm tiếp tục khi YouTube hiện hộp thoại "Video đã tạm dừng"

## [2.2.0] — 2026-09-09

### Thêm
- Hỗ trợ YouTube Shorts: tự động skip/mute quảng cáo interstitial trong Shorts player
- Skip retry: thử lại tối đa 3 lần × 200ms khi skip button chưa kịp render
- DNR rules bổ sung: block `securepubads.g.doubleclick.net`, `imasdk.googleapis.com/ima3.js`, `tpc.googlesyndication.com`, YouTube `log_event` và `watchtime`
- Service Worker keepalive alarm (mỗi 1 phút) để tránh bị trình duyệt kill giữa chừng

### Sửa
- Observer scope: dùng `#page-manager` thay vì `document.body` làm fallback — giảm CPU overhead
- Video không bị pause sau khi seek tới cuối quảng cáo (`play()` sau `currentTime = duration`)

## [2.0.0] — 2026-08-23

### Thêm
- Lọc InnerTube (hook fetch, XHR, JSON.parse) — chặn quảng cáo trước khi player load
- DeclarativeNetRequest chặn domain quảng cáo
- Trang Cài đặt nâng cao (options.html): whitelist kênh, mục tiêu ngày, export/import
- Thống kê chi tiết: video, banner, overlay, anti-adblock
- Lịch sử 7 ngày (biểu đồ trong Cài đặt)
- Hỗ trợ YouTube Shorts, Music, mobile web
- Chống thông báo anti-adblock của YouTube
- postMessage bảo mật bằng token nội bộ
- Trạng thái tab hiện tại trong popup

### Sửa
- Content script chạy `document_start`
- Dialog/overlay dismiss chuyển sang MAIN world
- Đếm banner ads khi ẩn element
- Reset thống kê xóa cả breakdown và history

## [1.3.0] — 2026-08-23
- UI dock menu bo góc phong cách 2026

## [1.2.0] — 2026-08-23
- Giao diện tiếng Việt 3 tab, logo FUNNYGAME

## [1.0.0] — 2026-08-23
- Phiên bản khởi tạo — LuanEm2709
