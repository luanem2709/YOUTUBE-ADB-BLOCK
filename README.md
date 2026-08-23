# YOUTUBE-ADB-BLOCK v2.0

Extension chặn quảng cáo YouTube — **FUNNYGAME** · **LuanEm2709**

Giao diện tiếng Việt · Chrome & Firefox (Manifest V3)

Repo: https://github.com/Xiata279/YOUTUBE-ADB-BLOCK

## Tính năng v2.0

### Chặn quảng cáo (3 lớp)
1. **Lọc InnerTube** — gỡ `adPlacements` / `playerAds` trước khi player đọc
2. **DNR** — chặn request domain quảng cáo (doubleclick, pagead...)
3. **DOM fallback** — tua nhanh, skip, ẩn banner/overlay

### Nền tảng
- YouTube thường, **Shorts**, **Music**, mobile web
- Chống popup **anti-adblock**
- Whitelist kênh (không chặn trên kênh chỉ định)

### Giao diện
- Popup 3 tab (dock menu 2026)
- Thống kê chi tiết + lịch sử 7 ngày
- Trang **Cài đặt nâng cao** (export/import JSON)

## Cài đặt

### Chrome
1. Clone repo → `chrome://extensions/` → Developer mode → Load unpacked

### Firefox
1. `about:debugging` → Load Temporary Add-on → chọn `manifest.json`

### Build zip
```bash
node scripts/build.js
```
File output: `dist/funnygame-adblock-v2.0.0.zip`

## Cấu trúc

```
├── manifest.json / background.js
├── content-main.js   # MAIN world: lọc InnerTube, skip, anti-adblock
├── content.js        # Isolated: observer, whitelist, thống kê
├── popup.* / options.*
├── rules/dnr_rules.json
├── _locales/vi/
└── PRIVACY.md
```

## License

MIT — LuanEm2709
