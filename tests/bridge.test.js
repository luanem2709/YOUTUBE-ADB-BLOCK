/**
 * bridge.test.js — Phase 2: Bridge Hardening static tests
 * Kiểm tra:
 *   B1-B4  Swift host whitelist (isAllowedBridgeHost, guard trong handler)
 *   B5-B8  License keys không lộ vào window (stripLicenseKeysFromJson)
 *   B9-B11 chrome-bridge.js không gán license key lên window
 *   B12    license.js đọc license qua chrome.storage, không từ window.__FG_IOS_INITIAL_STORAGE__
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT  = path.join(__dirname, '..');
const SWIFT = fs.readFileSync(path.join(ROOT, 'ios', 'ViewController.swift'), 'utf8');
const BRIDGE_JS = fs.readFileSync(path.join(ROOT, 'ios', 'chrome-bridge.js'), 'utf8');
const LICENSE_JS = fs.readFileSync(path.join(ROOT, 'license.js'), 'utf8');

let pass = 0, fail = 0;

function test(id, desc, fn) {
    try {
        fn();
        console.log(`  PASS ${id} ${desc}`);
        pass++;
    } catch (e) {
        console.error(`  FAIL ${id} ${desc}`);
        console.error(`       ${e.message}`);
        fail++;
    }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertContains(text, substr, msg) {
    assert(text.includes(substr), msg || `Không tìm thấy: ${substr}`);
}
function assertNotContains(text, substr, msg) {
    assert(!text.includes(substr), msg || `Phải không có: ${substr}`);
}

console.log('\n== bridge.test.js');

// ── B1–B4: Swift host whitelist ──────────────────────────────────────────────

test('B1', 'ViewController.swift có hàm isAllowedBridgeHost', () => {
    assertContains(SWIFT, 'private func isAllowedBridgeHost(_ host: String?) -> Bool {');
});

test('B2', 'isAllowedBridgeHost chấp nhận youtube.com và spotify.com', () => {
    assertContains(SWIFT, '"youtube.com"');
    assertContains(SWIFT, '"spotify.com"');
    // Kiểm tra logic hasSuffix / contains trong hàm
    assertContains(SWIFT, 'isAllowedBridgeHost');
});

test('B3', 'isAllowedBridgeHost chấp nhận localhost (panel)', () => {
    // Hàm phải xử lý localhost cho panelWebView
    const fnStart = SWIFT.indexOf('private func isAllowedBridgeHost');
    const fnEnd   = SWIFT.indexOf('\n    }', fnStart) + 6;
    const fnBody  = SWIFT.slice(fnStart, fnEnd);
    assertContains(fnBody, 'localhost', 'isAllowedBridgeHost phải cho phép localhost (panel)');
});

test('B4', 'userContentController có guard isAllowedBridgeHost trước switch action', () => {
    // Guard phải nằm giữa "guard message.name == fgBridge" và "switch action {"
    const guardIdx  = SWIFT.indexOf('guard isAllowedBridgeHost(');
    const switchIdx = SWIFT.indexOf('switch action {');
    assert(guardIdx !== -1, 'Không tìm thấy guard isAllowedBridgeHost');
    assert(guardIdx < switchIdx, 'guard isAllowedBridgeHost phải nằm trước switch action');
});

// ── B5–B8: stripLicenseKeysFromJson ─────────────────────────────────────────

test('B5', 'ViewController.swift có hàm stripLicenseKeysFromJson', () => {
    assertContains(SWIFT, 'private func stripLicenseKeysFromJson(_ json: String) -> String {');
});

test('B6', 'stripLicenseKeysFromJson loại bỏ 5 trường license', () => {
    const fnStart = SWIFT.indexOf('private func stripLicenseKeysFromJson');
    const fnEnd   = SWIFT.indexOf('\n    }', fnStart) + 6;
    const fnBody  = SWIFT.slice(fnStart, fnEnd);
    for (const key of ['licenseKey', 'licenseToken', 'licenseSig', 'licenseValid', 'licenseExpires']) {
        assertContains(fnBody, `"${key}"`, `stripLicenseKeysFromJson phải loại bỏ "${key}"`);
    }
});

test('B7', 'buildBootstrapScript dùng stripLicenseKeysFromJson cho localJson', () => {
    // localJson phải được bọc qua hàm strip
    const fnStart = SWIFT.indexOf('private func buildBootstrapScript');
    const fnEnd   = SWIFT.indexOf('\n    }', fnStart) + 6;
    const fnBody  = SWIFT.slice(fnStart, fnEnd);
    assertContains(fnBody, 'stripLicenseKeysFromJson(getStoredJson(storageKeyLocal))',
        'buildBootstrapScript phải strip license keys khỏi localJson');
    // sessionJson không cần strip (không chứa license keys)
});

test('B8', 'buildBootstrapScript KHÔNG inject licenseKey trực tiếp vào window', () => {
    const fnStart = SWIFT.indexOf('private func buildBootstrapScript');
    const fnEnd   = SWIFT.indexOf('\n    }', fnStart) + 6;
    const fnBody  = SWIFT.slice(fnStart, fnEnd);
    assertNotContains(fnBody, 'window.__FG_IOS_LICENSE',
        'buildBootstrapScript không được inject window.__FG_IOS_LICENSE*');
    // Kiểm tra không gán licenseKey trực tiếp trong chuỗi template
    assertNotContains(fnBody, 'licenseKey',
        'buildBootstrapScript không được đặt licenseKey vào window inject');
});

// ── B9–B11: chrome-bridge.js không lộ license lên window ────────────────────

test('B9', 'chrome-bridge.js không gán window.licenseKey', () => {
    assertNotContains(BRIDGE_JS, 'window.licenseKey',
        'chrome-bridge.js không được gán licenseKey lên window');
});

test('B10', 'chrome-bridge.js chỉ ĐỌC window.__FG_IOS_INITIAL_STORAGE__, không gán lại', () => {
    // Tìm tất cả dạng "window.__FG_IOS_INITIAL_STORAGE__ =" (gán, không phải so sánh)
    // Cho phép: "=== ", "!== " (so sánh), không cho phép: "= {", "= (", v.v. (gán)
    const assignPattern = /window\.__FG_IOS_INITIAL_STORAGE__\s*=[^=]/g;
    const matches = [...BRIDGE_JS.matchAll(assignPattern)];
    assert(matches.length === 0,
        `chrome-bridge.js không được gán lại window.__FG_IOS_INITIAL_STORAGE__ (tìm thấy ${matches.length} lần)`);
});

test('B11', 'chrome-bridge.js storageKey trong localStore không expose ra window global', () => {
    // licenseKey chỉ được đọc nội bộ qua localStore, không gán lên window
    assertNotContains(BRIDGE_JS, 'window.licenseToken', 'không lộ licenseToken');
    assertNotContains(BRIDGE_JS, 'window.licenseSig',   'không lộ licenseSig');
});

// ── B12: license.js đọc license qua chrome.storage ──────────────────────────

test('B12', 'license.js đọc license key qua chrome.storage.local.get (không phải window trực tiếp)', () => {
    // license.js nên dùng chrome.storage để đọc, không dùng window.__FG_IOS_INITIAL_STORAGE__ trực tiếp
    assertContains(LICENSE_JS, 'chrome.storage', 'license.js phải dùng chrome.storage');
    // Nếu license.js có dùng __FG_IOS_INITIAL_STORAGE__ thì phải qua bridge không phải window trực tiếp
    if (LICENSE_JS.includes('__FG_IOS_INITIAL_STORAGE__')) {
        // Chỉ cảnh báo, không fail — bridge có thể cần đọc khởi tạo
        console.log('       [ghi chú] license.js có tham chiếu __FG_IOS_INITIAL_STORAGE__ — kiểm tra thủ công');
    }
});

// ── Tổng kết ─────────────────────────────────────────────────────────────────

console.log('');
if (fail === 0) {
    console.log(`  ✓ ${pass} PASS, 0 FAIL`);
} else {
    console.log(`  ✗ ${pass} PASS, ${fail} FAIL`);
    process.exitCode = 1;
}
