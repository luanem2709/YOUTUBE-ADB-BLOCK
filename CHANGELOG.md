# Changelog

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
