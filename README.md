# FUNNYGAME — Chặn Quảng Cáo YouTube & Spotify

**v2.4.0** · Extension Chrome / Mobile / Safari (Manifest V3) · Giao diện tiếng Việt · **LuanEm2709**

Chặn quảng cáo trên **YouTube** (thường, Shorts, Music, mobile web) và **Spotify Web Player**. Cần **Key authentic** để kích hoạt.

## Yêu cầu kích hoạt

Nhập **Key authentic** trong popup (hoặc khi chạy trình cài đặt). Không có key hợp lệ thì chặn quảng cáo (YouTube & Spotify) và DNR sẽ **không** chạy.

## Tính năng

### Chặn quảng cáo YouTube (3 lớp tối ưu hiệu năng)

1. **Lọc InnerTube in-place** — gỡ `adPlacements`, `playerAds`, `adSlots`, `adSlotRenderer`, `bkaEnforcementMessageViewModel` và tham số ad-break trước khi player đọc (hook `fetch` / XHR / `JSON.parse` trên endpoint `youtubei`, lọc trực tiếp không clone cây JSON)
2. **DNR** — chặn request tới domain quảng cáo (`doubleclick`, `pagead`, `googleadservices`, `/pagead/`, `ptracking`…)
3. **DOM fallback thông minh** — skip nút bỏ qua, tua nhanh, mute, ẩn banner/overlay, đóng popup chỉ khi phát hiện quảng cáo thực sự

Hỗ trợ thêm:

- YouTube thường, **Shorts**, **YouTube Music**, **m.youtube.com**
- Chống popup **anti-adblock** và hộp thoại "Video đã tạm dừng"
- Bật/tắt từng loại: video, banner, overlay, anti-adblock, mute ads, fast skip
- **Whitelist kênh** (UC ID hoặc `@handle`) — không chặn trên kênh chỉ định

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
3. Chọn hàm `testSign` → **Run** để kiểm tra (log ra `token` và `sig`)
4. **Deploy → Manage deployments → Edit → Version: New version → Deploy** (giữ nguyên URL)

## Cấu hình từ xa

Khi YouTube/Spotify đổi giao diện, thêm selector vào [`release/remote-config.json`](release/remote-config.json), tăng `version`, rồi push — mọi máy nhận trong ≤6 giờ.

## Test

```bash
npm test
```

Chạy 87 test (Chrome headless + Node). GitHub Actions tự chạy mỗi lần push.

## Cài đặt & Đóng gói

### 1. Người dùng máy tính (Windows)

1. Chạy `FUNNYGAME-CaiDat.exe`
2. Nhập **Key authentic**
3. Installer ghi Chrome policy **force-install** và cài extension

Extension tự nâng cấp khi có bản mới (qua `release/update.xml` + CRX).

### 2. Trình duyệt Android hỗ trợ Extension (Lemur, Quetta, Yandex)

Chạy lệnh đóng gói bản điện thoại (`dist/funnygame-mobile-v2.4.0.zip`):
```bash
node scripts/build-mobile.js
```

### 3. Bộ nguồn Safari iOS (Xcode / Web Extension)

Chạy lệnh tạo bộ nguồn Safari (`dist/funnygame-safari-source-v2.4.0.zip`):
```bash
node scripts/build-safari-source.js
```

### 4. Lập trình viên (load unpacked)

1. Clone / tải mã nguồn
2. Mở `chrome://extensions/` → bật **Developer mode**
3. **Load unpacked** → chọn thư mục dự án
4. Mở popup → nhập **Key authentic**

## Cấu trúc

```
├── manifest.json / background.js
├── license.js              # Key authentic
├── content-main.js         # MAIN world: lọc InnerTube YouTube
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
