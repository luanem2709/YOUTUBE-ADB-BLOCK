# FUNNYGAME — Chặn Quảng Cáo YouTube & Spotify

**v2.4.15** · Extension Chrome / Mobile / Safari (Manifest V3) · Giao diện tiếng Việt · **LuanEm2709**

Chặn quảng cáo trên **YouTube** (thường, Shorts, Music, mobile web) và **Spotify Web Player**. Cần **Key authentic** để kích hoạt.

## Yêu cầu kích hoạt

Nhập **Key authentic** trong popup (hoặc khi chạy trình cài đặt). Không có key hợp lệ thì chặn quảng cáo (YouTube & Spotify) và DNR sẽ **không** chạy.

## Tính năng

### Chặn quảng cáo YouTube (3 lớp tối ưu hiệu năng)

1. **Lọc InnerTube ở tầng mạng (thử nghiệm, có cầu chì)** — `content-yt-net.js` chạy trong MAIN world ở `document_start` (trước mã của YouTube): móc `fetch` / `XMLHttpRequest` trên `/youtubei/v1/player` và dò `ytInitialPlayerResponse` để gỡ `adPlacements`, `playerAds`, `adSlots`. **Cầu chì tự ngắt:** nếu trình phát báo lỗi sau khi đã gỡ, lớp này tự tắt 24 giờ và tải lại trang đúng 1 lần. Giới hạn đã đo trên YouTube thật: khi **đổi clip** (điều hướng SPA) YouTube dùng `/youtubei/v1/get_watch` — đường này **không** được gỡ vì thử gỡ chỉ làm video treo ~5 giây ở màn hình đen; quảng cáo ở đó do lớp 3 xử lý
2. **DNR** — chặn request tới domain quảng cáo (`doubleclick`, `pagead`, `googleadservices`, `/pagead/`, `ptracking`…)
3. **DOM fallback thông minh** — gọi `player.skipAd()` ngay khi vào QC, bấm nút "Bỏ qua" nếu có, tua 16x và seek thẳng tới cuối QC sau ~200ms (đo thật: QC 15–76 giây chỉ còn hiện ≈0,5 giây), mute, ẩn banner/overlay, đóng popup chỉ khi phát hiện quảng cáo thực sự

Hỗ trợ thêm:

- YouTube thường, **Shorts**, **YouTube Music**, **m.youtube.com**
- Chống popup **anti-adblock** và hộp thoại "Video đã tạm dừng"
- **Chặn quảng cáo mua sắm** — ẩn thẻ sản phẩm có giá (ví dụ "… 125.000₫ · Cửa hàng trình liên kết Shopee"), bảng "Sản phẩm" bên cạnh video, kệ merch và sticker sản phẩm trên Shorts
- Bật/tắt từng loại: video, banner, overlay, anti-adblock, **mua sắm**, mute ads, fast skip, **bỏ qua hẳn** (gỡ QC ở tầng mạng)
- **Whitelist kênh** (UC ID hoặc `@handle`) — không chặn trên kênh chỉ định

### Hiệu năng (v2.4.15)

- **Không rò rỉ bộ nhớ khi xem lâu:** mọi `MutationObserver` gắn vào player của YouTube đều được `disconnect()` khi player bị gỡ khỏi DOM → không giữ lại cây DOM cũ sau nhiều lần điều hướng trong cùng một phiên
- **Vòng quét thích ứng:** quét 300ms khi tab đang xem; tự giảm còn 1.5–2s khi tab ẩn hoặc extension không hoạt động; tự tăng tốc lại ngay khi tab hiện lại
- **Dọn dẹp tức thì:** tắt extension → xoá ngay hiệu ứng ánh sáng nền, lớp phủ QC và các nút phụ, không chờ vòng quét kế tiếp

### Tính năng kiểu YouTube Premium

| Tính năng | Trạng thái |
|---|---|
| Không quảng cáo (video, Shorts, Music, banner) | ✅ |
| Phát nền (chuyển tab / tắt màn hình) | ✅ |
| Hình trong hình — nút trên player, `Alt+P` | ✅ |
| Không hỏi "Bạn còn xem / nghe không?" | ✅ |
| Ẩn lời mời mua Premium | ✅ |
| Chất lượng ưu tiên (tới 4K) | ✅ |
| Nhảy tới đoạn hay nhất — nút trên player, `Alt+J` | ✅ |
| Bỏ qua đoạn tài trợ (SponsorBlock) | ✅ Thêm, Premium không có |
| 1080p Premium (bitrate cao) | ❌ Server YouTube khoá theo tài khoản |
| Tải video xem offline | ❌ Không hỗ trợ (điều khoản YouTube / bản quyền) |

### Chặn quảng cáo Spotify Web Player

Chỉ trên `open.spotify.com` / `play.spotify.com` (không phải app desktop/mobile):

- Nhận diện quảng cáo nhẹ nhàng (nhãn đa ngôn ngữ, UI, MediaSession, WebSocket payload)
- **Tắt tiếng tab**, tua nhanh / skip khi gặp QC, khôi phục sau khi hết
- Ẩn thành phần giao diện quảng cáo
- Chặn domain quảng cáo / telemetry Spotify qua DNR + hook player state

### Giao diện & thống kê

- Popup nhiều tab (dock menu), tự nhận diện tab đang mở (YouTube / Spotify)
- Thống kê theo loại: Video, Banner, Overlay, Anti-adblock, Spotify
- Trang **Cài đặt nâng cao**: whitelist, mục tiêu ngày, export/import JSON
- Trang **Bảng xếp hạng** cục bộ theo tài khoản YouTube trên máy (không gửi server)

## Máy chủ key (chữ ký số)

Từ v2.4.0 key được **ký số RSA**. Cách cập nhật máy chủ (làm 1 lần, **trước** khi phát hành extension):

1. Mở Google Sheet license → **Extensions → Apps Script**, thay toàn bộ mã bằng [`server/Code.gs`](server/Code.gs)
2. **Project Settings → Script Properties → Add property**
   - Tên: `LICENSE_PRIVATE_KEY`
   - Giá trị: toàn bộ nội dung file `build/license-private.pem` (chỉ có trên máy bạn, đã bị `.gitignore` — **sao lưu cẩn thận, mất là phải phát hành lại extension với khóa mới**)
   - **Sheet license phải ở chế độ Restricted** (Share → General access: Restricted). Web app Apps Script chạy dưới quyền chủ sở hữu nên vẫn đọc được. Runtime Apps Script phải là **V8**.
   - **Không commit danh sách key thật** (`keys.csv` đã bị `.gitignore`; xem `installer/google-apps-script/keys.example.csv`). `npm test` có `tests/secrets.test.js` kiểm tra điều này.
3. Chọn hàm `testSign` → **Run** để kiểm tra (log ra `token` và `sig`)
4. **Deploy → Manage deployments → Edit → Version: New version → Deploy** (giữ nguyên URL)

## Chẩn đoán trên iOS (cục bộ, không dữ liệu nhận dạng)

App iOS có nhật ký chẩn đoán **chỉ lưu trên máy**, không tự gửi đi. Bật/tắt, **Xuất chẩn đoán** và **Xoá nhật ký** nằm trong Cài đặt → "Chẩn đoán (iPhone)". Định dạng được khoá bởi [`ios/diag-schema.json`](ios/diag-schema.json): chỉ gồm sự kiện kỹ thuật (mở app, cảnh báo bộ nhớ, WebContent bị kill, lỗi tải trang, kẹt quảng cáo, lỗi trình phát), phiên bản iOS chính.phụ, iPhone/iPad và các cờ tương thích — **không** có địa chỉ trang, mã video, key, IP hay mã thiết bị. Sàn hỗ trợ: **iOS 15.0** (`tests/compat.test.js` chặn mã dùng tính năng mới hơn mà không có dự phòng).

## Cấu hình từ xa

Khi YouTube/Spotify đổi giao diện, thêm selector vào [`release/remote-config.json`](release/remote-config.json), tăng `version`, rồi push — mọi máy nhận trong ≤6 giờ.

## Test

```bash
npm test        # bộ test (Chrome headless + Node)
npm run smoke   # quét lỗi runtime/console trên 9 trang test
npm run build   # đóng gói + kiểm tra gói build
```

GitHub Actions tự chạy mỗi lần push (test + smoke + build).

## Cài đặt & Đóng gói

### 1. Người dùng máy tính (Windows)

1. Chạy `FUNNYGAME-CaiDat.exe`
2. Nhập **Key authentic**
3. Installer ghi Chrome policy **force-install** và cài extension

Extension tự nâng cấp khi có bản mới (qua `release/update.xml` + CRX).

### 2. Trình duyệt Android hỗ trợ Extension (Lemur, Quetta, Yandex)

Chạy lệnh đóng gói bản điện thoại (`dist/funnygame-mobile-v2.4.15.zip`):
```bash
node scripts/build-mobile.js
```

### 3. iPhone / iPad (app .ipa)

Tải `funnygame-ios.ipa` từ [GitHub Releases](https://github.com/luanem2709/YOUTUBE-ADB-BLOCK/releases/tag/ios-latest) (link cố định, GitHub Actions tự đăng khi có commit vào `main`) rồi cài bằng Sideloadly / AltStore — xem `mobile/IOS-INSTALL.md`. Thanh dưới có 4 nút: **YouTube** (gộp YouTube + YT Music — nhấn giữ để chọn), Spotify, PiP, Cài đặt. Bảng điều khiển mở ở nửa màn hình (kéo lên để toàn màn hình).

### 4. Bộ nguồn Safari iOS (Xcode / Web Extension)

Chạy lệnh tạo bộ nguồn Safari (`dist/funnygame-safari-source-v2.4.15.zip`):
```bash
node scripts/build-safari-source.js
```

### 5. Lập trình viên (load unpacked)

1. Clone / tải mã nguồn
2. Mở `chrome://extensions/` → bật **Developer mode**
3. **Load unpacked** → chọn thư mục dự án
4. Mở popup → nhập **Key authentic**

## Cấu trúc

```
├── manifest.json / background.js
├── license.js              # Key authentic
├── content-yt-net.js        # MAIN world: gỡ slot QC ở tầng mạng (bỏ qua hẳn)
├── content-main.js         # MAIN world: nhận biết QC + skip/tua/mute
├── content.js / content.css
├── content-spotify-main.js # MAIN world: hook Spotify player
├── content-spotify.js
├── popup.* / options.* / stats.*
├── mobile/                 # Giao diện & nút nổi cho bản Mobile / Safari
├── rules/dnr_rules.json
├── release/                # CRX + update.xml
├── installer/              # Source trình cài Windows → FUNNYGAME-CaiDat.exe
├── _locales/vi/
└── PRIVACY.md
```

## License

MIT — LuanEm2709
