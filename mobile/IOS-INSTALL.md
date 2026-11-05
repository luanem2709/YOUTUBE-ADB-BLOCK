# Cài FUNNYGAME trên iPhone / iPad (iOS & iPadOS)

Bộ cài iOS của **FUNNYGAME** gồm 2 định dạng:
1. **`release/funnygame-ios.ipa`** — File ứng dụng iOS độc lập (2-trong-1: vừa là **App xem YouTube / YT Music / Spotify chặn quảng cáo toàn màn hình + phát nền khi tắt màn hình + PiP + khoá Key bản quyền FUNNYGAME**, vừa đính kèm **Safari Web Extension**).
2. **`dist/funnygame-safari-source-*.zip`** — Bộ nguồn Safari Web Extension dành cho người tự ký bằng Xcode hoặc cài qua trình duyệt **Orion Browser**.

---

## Cách 1: Cài trực tiếp file `funnygame-ios.ipa` (Không cần máy Mac)

Bạn có thể tải file **`release/funnygame-ios.ipa`** trực tiếp từ thư mục `release/` trên GitHub (hoặc mục **Actions → Build iOS IPA → Artifacts**) và cài vào iPhone/iPad bằng một trong các công cụ quen thuộc:

- **Sideloadly** (trên Windows / macOS):
  1. Cắm iPhone vào máy tính, mở **Sideloadly**.
  2. Kéo thả file `funnygame-ios.ipa` vào Sideloadly, nhập Apple ID của bạn và bấm **Start**.
  3. Trên iPhone, vào **Cài đặt > Cài đặt chung > Quản lý VPN & Thiết bị** → Tin cậy (Trust) tài khoản của bạn.
- **AltStore / SideStore / Feather / ESign / Scarlet / TrollStore**:
  - Mở file `funnygame-ios.ipa` trực tiếp trong ứng dụng ký IPA trên iPhone và bấm **Install**.

### Cách sử dụng sau khi cài `FUNNYGAME.ipa`:
1. **Dùng trực tiếp trong App FUNNYGAME**:
   - Mở ứng dụng **FUNNYGAME** ngoài màn hình chính.
   - Bấm tab **🛡️ Chặn QC** ở thanh dưới cùng để mở bảng điều khiển, nhập **Key kích hoạt FUNNYGAME** của bạn.
   - Chuyển qua lại giữa **▶ YouTube**, **🎵 YT Music**, **🎧 Spotify** ngay trên thanh điều hướng dưới cùng. Hỗ trợ sẵn **Phát nhạc nền khi khoá màn hình** và **Hình trong hình (PiP)**.
2. **Dùng trong trình duyệt Safari gốc (tùy chọn)**:
   - Vào **Cài đặt > Ứng dụng > Safari > Phần mở rộng (Extensions)** → Bật **FUNNYGAME** và cấp quyền **"Luôn cho phép" (Always Allow)** trên `youtube.com` và `spotify.com`.

---

## Cách 2: Cài trên trình duyệt Orion (Không cần máy tính, không cần ký IPA)

1. Cài **Orion Browser by Kagi** từ App Store trên iPhone/iPad.
2. Tải file `dist/funnygame-mobile-v2.4.15.zip` về iPhone.
3. Mở **Orion** → bấm `⋯` → **Extensions** → **`+`** → **Install from file** → chọn file `.zip`.
4. Mở `m.youtube.com` và bấm nút **Chặn QC** ở góc màn hình để kích hoạt Key.

---

## Cách 3: Tự biên dịch từ bộ nguồn Safari bằng máy Mac & Xcode

1. Giải nén file `funnygame-safari-source-*.zip` hoặc chạy trực tiếp script:
   ```sh
   ./ios/build-ipa.sh
   ```
2. Hoặc tạo project Xcode thủ công:
   ```sh
   xcrun safari-web-extension-converter /duong-dan/funnygame-safari-source --ios-only --swift
   ```
3. Mở project trong Xcode, chọn **Signing & Capabilities** (Team Apple ID của bạn), chọn iPhone và bấm **Run**.
