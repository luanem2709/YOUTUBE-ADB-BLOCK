# YOUTUBE-ADB-BLOCK

Extension chặn quảng cáo YouTube — **FUNNYGAME** · **LuanEm2709**

Giao diện **100% tiếng Việt**, hỗ trợ Chrome & Firefox (Manifest V3).

Repo: https://github.com/Xiata279/YOUTUBE-ADB-BLOCK

## Tính năng

### Chặn quảng cáo
- Bỏ qua quảng cáo video (preroll, midroll, skip / tua nhanh 16x)
- Ẩn banner, masthead, quảng cáo trong bảng tin
- Xóa overlay trên trình phát video
- Tắt tiếng quảng cáo tự động

### Giao diện & cài đặt
- 3 tab: **Tổng quan** · **Cài đặt** · **Hỗ trợ**
- Bật/tắt từng loại quảng cáo riêng
- Thống kê tổng, phiên hiện tại, thời gian tiết kiệm
- Thanh tiến độ mục tiêu hàng ngày
- Đặt lại thống kê, tải lại tab, mở YouTube

## Cài đặt Chrome

1. Clone repo
2. Mở `chrome://extensions/`
3. Bật **Chế độ nhà phát triển**
4. **Tải extension đã giải nén** → chọn thư mục chứa `manifest.json`

## Cài đặt Firefox

1. Mở `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on...**
3. Chọn `manifest.json`

## Cấu trúc

```
├── manifest.json
├── popup.html / popup.css / popup.js
├── content.js / content-main.js / content.css
├── _locales/vi/messages.json
└── images/
    ├── logo.gif
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## License

MIT — LuanEm2709
