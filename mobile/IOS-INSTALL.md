# Cài FUNNYGAME trên iPhone/iPad

`funnygame-safari-source-*.zip` là **bộ nguồn Safari Web Extension**, không phải
file IPA và không thể mở trực tiếp trên iPhone. Apple yêu cầu extension Safari
được đóng trong một app iOS có chữ ký.

## Cách 1: Dùng máy Mac và Xcode

1. Giải nén file `funnygame-safari-source-*.zip`.
2. Cài Xcode mới nhất và Command Line Tools.
3. Trong Terminal chạy:

   ```sh
   xcrun safari-web-extension-packager --copy-resources --ios-only /duong-dan/funnygame-safari-source
   ```

4. Mở project vừa tạo trong Xcode, chọn Apple ID/Team và Bundle Identifier riêng.
5. Kết nối iPhone, chọn iPhone làm thiết bị chạy rồi bấm **Run**.
6. Trên iPhone mở **Cài đặt > Ứng dụng > Safari > Phần mở rộng**, bật FUNNYGAME
   và cho phép truy cập `youtube.com`, `googlevideo.com` và `spotify.com`.
7. Dùng `youtube.com` hoặc `open.spotify.com` trong Safari. Extension không hoạt
   động bên trong app YouTube hoặc app Spotify.

## Cách 2: TestFlight/App Store Connect

Apple Developer Program cho phép đóng gói Safari Web Extension bằng công cụ web
trong App Store Connect, sau đó phân phối bản thử nghiệm qua TestFlight. Cách này
cần tài khoản Apple Developer và cấu hình app/bundle ID trên App Store Connect.

## Phạm vi hỗ trợ

- Khuyến nghị iOS/iPadOS 17 trở lên vì extension dùng content script `MAIN`.
- YouTube Web, YouTube Music Web và Spotify Web.
- Không can thiệp được vào ứng dụng YouTube/Spotify cài từ App Store.
