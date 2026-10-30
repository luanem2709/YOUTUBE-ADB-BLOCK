# Changelog

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
