# FUNNYGAME — Chặn Quảng Cáo YouTube & Spotify

**v2.1.8** · Extension Chrome (Manifest V3) · Giao diện tiếng Việt · **LuanEm2709**

Chặn quảng cáo trên **YouTube** (thường, Shorts, Music, mobile web) và **Spotify Web Player**. Cần **Key authentic** để kích hoạt.

## Yêu cầu kích hoạt

Nhập **Key authentic** trong popup (hoặc khi chạy trình cài đặt). Không có key hợp lệ thì chặn quảng cáo (YouTube & Spotify) và DNR sẽ **không** chạy.

## Tính năng

### Chặn quảng cáo YouTube (3 lớp)

1. **Lọc InnerTube** — gỡ `adPlacements`, `playerAds`, `adSlots` và tham số ad-break trước khi player đọc (hook `fetch` / XHR / `JSON.parse` trên endpoint `youtubei`)
2. **DNR** — chặn request tới domain quảng cáo (`doubleclick`, `pagead`, `googleadservices`, `/pagead/`, `ptracking`…)
3. **DOM fallback** — skip nút bỏ qua, tua nhanh, mute, ẩn banner/overlay, đóng popup

Hỗ trợ thêm:

- YouTube thường, **Shorts**, **YouTube Music**, **m.youtube.com**
- Chống popup **anti-adblock**
- Bật/tắt từng loại: video, banner, overlay, anti-adblock, mute ads, fast skip
- **Whitelist kênh** (UC ID hoặc `@handle`) — không chặn trên kênh chỉ định

### Chặn quảng cáo Spotify Web Player

Chỉ trên `open.spotify.com` / `play.spotify.com` (không phải app desktop/mobile):

- Nhận diện quảng cáo (nhãn đa ngôn ngữ, UI, MediaSession)
- **Tắt tiếng tab**, tua nhanh / skip khi gặp QC, khôi phục sau khi hết
- Ẩn thành phần giao diện quảng cáo
- Chặn domain quảng cáo / telemetry Spotify qua DNR + hook player state

### Giao diện & thống kê

- Popup nhiều tab (dock menu), tự nhận diện tab đang mở (YouTube / Spotify)
- Thống kê theo loại: Video, Banner, Overlay, Anti-adblock, Spotify
- Trang **Cài đặt nâng cao**: whitelist, mục tiêu ngày, export/import JSON
- Trang thống kê cục bộ theo tài khoản YouTube trên máy (không gửi server)

## Cài đặt

### Người dùng (Windows)

1. Chạy `FUNNYGAME-CaiDat.exe`
2. Nhập **Key authentic**
3. Installer ghi Chrome policy **force-install** và cài extension

Extension tự nâng cấp khi có bản mới (qua `release/update.xml` + CRX).

### Lập trình viên (load unpacked)

1. Clone / tải mã nguồn
2. Mở `chrome://extensions/` → bật **Developer mode**
3. **Load unpacked** → chọn thư mục dự án
4. Mở popup → nhập **Key authentic**

> Không phân phối qua Chrome Web Store. Artifact phát hành nằm trong `release/` (`funnygame.crx`, `update.xml`).

## Cấu trúc

```
├── manifest.json / background.js
├── license.js              # Key authentic
├── content-main.js         # MAIN world: lọc InnerTube YouTube
├── content.js / content.css
├── content-spotify-main.js # MAIN world: hook Spotify player
├── content-spotify.js
├── popup.* / options.* / stats.*
├── rules/dnr_rules.json
├── release/                # CRX + update.xml
├── installer/              # Source trình cài Windows → FUNNYGAME-CaiDat.exe
├── _locales/vi/
└── PRIVACY.md
```

## License

MIT — LuanEm2709
