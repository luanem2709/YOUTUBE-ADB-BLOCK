// Kiểm tra tĩnh bảng điều khiển iOS 2 mức (nửa màn hình / toàn màn hình). Swift không chạy được trên Windows,
// nên test này chỉ đảm bảo các thành phần bắt buộc còn đủ; hành vi thật phải thử trên iPhone / macOS CI.
const fs = require("fs");
const path = require("path");
const swift = fs.readFileSync(path.join(__dirname, "..", "ios", "ViewController.swift"), "utf8").replace(/\r\n/g, "\n");
const results = [];
const check = (name, cond) => results.push((cond ? "PASS " : "FAIL ") + name);

check("H1 co 2 muc PanelDetent medium/large", /enum PanelDetent\s*\{\s*case medium, large\s*\}/.test(swift));
check("H2 dinh bang >= safe area (khong co dinh cung de che het man hinh)",
    /container\.topAnchor\.constraint\(greaterThanOrEqualTo: view\.safeAreaLayoutGuide\.topAnchor/.test(swift) &&
    !/container\.topAnchor\.constraint\(equalTo: view\.safeAreaLayoutGuide\.topAnchor, constant: 6\)/.test(swift));
check("H3 chieu cao uu tien thap hon rang buoc dinh (.defaultHigh)", /heightC\.priority = \.defaultHigh/.test(swift));
check("H4 muc medium cao ~52% man hinh", /view\.bounds\.height \* 0\.52/.test(swift));
check("H5 keo len nang medium -> large", /wantsUp && panelDetent == \.medium[\s\S]{0,80}setPanelDetent\(\.large\)/.test(swift));
check("H6 keo xuong large -> medium, medium -> dong", /wantsDown && panelDetent == \.large[\s\S]{0,80}setPanelDetent\(\.medium\)/.test(swift) && /else if wantsDown \{\s*onClosePanelTapped\(\)/.test(swift));
check("H7 cham header doi muc", /onSheetHeaderTap[\s\S]{0,200}setPanelDetent\(panelDetent == \.medium \? \.large : \.medium\)/.test(swift));
check("H8 luon mo o muc nua man hinh", /if isNewSheet \|\| wasHidden \{ setPanelDetent\(\.medium, animated: false\) \}/.test(swift));
check("H9 tinh lai chieu cao khi xoay man hinh", /completion: \{ _ in\s*self\.panelHeightConstraint\?\.constant = self\.panelHeight\(for: self\.panelDetent\)/.test(swift));
check("H10 ngang man hinh dung toan bo (thanh duoi bi an)", /view\.bounds\.width > view\.bounds\.height \{ return 10000 \}/.test(swift));

check("H11 thanh duoi chi con 4 nut: khong con YT Music rieng", !/"YT Music", #selector/.test(swift) && /"YouTube", #selector\(onTapYouTube\)/.test(swift));
check("H12 nut YouTube nho tab gan nhat (0/1) + nhan giu de chon", /youTubeFamilyTab = index/.test(swift) && /switchToTab\(youTubeFamilyTab\)/.test(swift) && /onLongPressYouTube/.test(swift));
check("H13 anh xa tab -> nut dock: 0,1->0; 2->1; 4->3", /case 0, 1: return 0[\s\S]{0,40}case 2: return 1[\s\S]{0,40}case 4: return 3/.test(swift) && /if idx == 3 \{/.test(swift));

check("H14 nut dau doi nhan/bieu tuong YouTube <-> YT Music theo tab", /updateYouTubeDockLabel\(\)/.test(swift) && /isMusic \? "YT Music" : "YouTube"/.test(swift) && /waveform\.circle\.fill" : "play\.rectangle\.fill"/.test(swift));
check("H15 khoi Thong ke gon tren iPhone (an muc tieu ngay)", /\.fg-ios \.progress-wrap\s*\{\s*display:\s*none/.test(require("fs").readFileSync(path.join(__dirname, "..", "mobile", "popup-mobile.css"), "utf8")));

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
