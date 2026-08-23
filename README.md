# YOUTUBE-ADB-BLOCK

Extension chặn / bỏ qua quảng cáo trên YouTube (Chrome & Firefox, Manifest V3).

Tác giả: **LuanEm2709**

Repo: https://github.com/Xiata279/YOUTUBE-ADB-BLOCK

## Tính năng

- Bỏ qua quảng cáo video (tua nhanh, mute, seek, bấm Skip khi có)
- Ẩn banner, overlay, companion ads trên trang
- Popup bật/tắt và đếm số ads đã chặn

## Cài đặt Chrome

1. Clone repo này
2. Mở `chrome://extensions/`
3. Bật **Developer mode**
4. **Load unpacked** → chọn thư mục root của repo (chứa `manifest.json`)

## Cài đặt Firefox

1. Mở `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on...**
3. Chọn file `manifest.json`

## Cấu trúc

```
├── manifest.json
├── content-main.js
├── content.js
├── content.css
├── popup.html
├── popup.js
└── images/
```

## License

MIT — LuanEm2709
