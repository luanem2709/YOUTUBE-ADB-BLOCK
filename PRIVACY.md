# Chính sách quyền riêng tư — FUNNYGAME YouTube Ad Block

**Cập nhật:** 23/08/2026 · **Tác giả:** LuanEm2709

## Tóm tắt

Extension **không thu thập, không gửi, không bán** dữ liệu cá nhân của bạn lên server bên th thứ ba.

## Dữ liệu lưu trữ cục bộ

Extension chỉ lưu trên thiết bị của bạn qua `chrome.storage`:

- Trạng thái bật/tắt chặn quảng cáo
- Cài đặt từng loại quảng cáo
- Thống kê số quảng cáo đã chặn (tổng, theo loại, 7 ngày)
- Danh sách kênh whitelist (do bạn nhập)
- Mục tiêu hàng ngày

Dữ liệu **không rời khỏi trình duyệt** trừ khi bạn chủ động xuất file JSON từ trang Cài đặt.

## Quyền extension sử dụng

| Quyền | Mục đích |
|-------|----------|
| `storage` | Lưu cài đặt và thống kê cục bộ |
| `activeTab` | Tải lại tab YouTube đang mở |
| `declarativeNetRequest` | Chặn request quảng cáo đã biết |
| `host_permissions` (YouTube & ad domains) | Chặn quảng cáo và chạy script trên YouTube |

## Content scripts

Extension chạy script trên `youtube.com`, `music.youtube.com`, `m.youtube.com` để:

- Lọc dữ liệu quảng cáo trong player
- Ẩn/bỏ qua quảng cáo hiển thị
- Đóng thông báo anti-adblock

Không đọc mật khẩu, email, lịch sử duyệt web ngoài YouTube.

## Liên hệ

GitHub: https://github.com/luanem2709/YOUTUBE-ADB-BLOCK
