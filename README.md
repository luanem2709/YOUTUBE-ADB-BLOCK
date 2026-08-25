# YOUTUBE-ADB-BLOCK v2.1

Extension chặn quảng cáo **YouTube & Spotify** — **FUNNYGAME** · **LuanEm2709**

Giao diện tiếng Việt · Chrome (Manifest V3)

## Tính năng

### Chặn quảng cáo YouTube (3 lớp)
1. **Lọc InnerTube** — gỡ `adPlacements` / `playerAds` trước khi player đọc
2. **DNR** — chặn request tới domain quảng cáo (doubleclick, pagead...)
3. **DOM fallback** — tua nhanh, skip, ẩn banner/overlay

- YouTube thường, **Shorts**, **Music**, mobile web
- Chống popup **anti-adblock**
- Whitelist kênh (không chặn trên kênh chỉ định)

### Chặn quảng cáo Spotify Web Player
- Nhận diện quảng cáo trên `open.spotify.com`
- **Tắt tiếng & tua nhanh** khi gặp quảng cáo, khôi phục lại sau khi hết
- Ẩn các thành phần giao diện quảng cáo
- Chặn domain quảng cáo/telemetry của Spotify qua DNR

### Giao diện
- Popup 3 tab (dock menu), tự nhận diện tab đang mở (YouTube / Spotify)
- Thống kê chi tiết theo loại quảng cáo (Video, Banner, Overlay, Anti-adblock, Spotify)
- Trang **Cài đặt nâng cao** (export/import JSON)

## Cài đặt

### Dành cho người dùng
Chạy trình cài đặt `FUNNYGAME-CaiDat.exe` — tự phát hiện Chrome và cài extension.
Extension sẽ **tự động nâng cấp** khi có phiên bản mới.

### Dành cho lập trình viên (load unpacked)
1. Tải mã nguồn về máy
2. Mở `chrome://extensions/` → bật **Developer mode** → **Load unpacked** → chọn thư mục dự án

## Cấu trúc

```
├── manifest.json / background.js
├── content-main.js     # MAIN world: lọc InnerTube, skip, anti-adblock
├── content.js          # Isolated: observer, whitelist, thống kê
├── content-spotify.js  # Chặn quảng cáo Spotify Web Player
├── popup.* / options.*
├── rules/dnr_rules.json
├── _locales/vi/
├── installer/          # Trình cài đặt Windows (.exe)
└── PRIVACY.md
```

## License

MIT — LuanEm2709
