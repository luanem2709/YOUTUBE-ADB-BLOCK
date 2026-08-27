/**
 * FUNNY GAME - xác thực key authentic.
 * Dán vào Apps Script gắn đúng Google Sheet license, rồi Deploy > Web app.
 *
 * Cột: Key, Status, Days, Created, Expires, User, HWID, Note, Last Check, Used Count
 * gid: 1159168714
 *
 * Thêm key: menu FUNNYGAME > Thêm key (1 / 3 / 6 / 12 tháng)
 * Form tự tạo key; chọn gói tháng + ghi chú, rồi copy key đưa khách.
 * Quá ngày Expires (timezone Việt Nam) thì key hết hạn.
 */

var SHEET_GID = 1159168714;
var SPREADSHEET_ID = "1ITw6jYqtuIwDaXvx_GLPl4CUMCNDC7C-pTwJVmNXC8E";
var TZ = "Asia/Ho_Chi_Minh";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("FUNNYGAME")
    .addItem("Thêm key (1 / 3 / 6 / 12 tháng)", "showAddKeyDialog")
    .addItem("Định dạng cột ngày (hiện lịch)", "setupDateColumns")
    .addToUi();
  try {
    setupDateColumns_();
  } catch (err) { /* lần mở đầu có thể chưa đủ quyền */ }
}

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  if (String(p.action || "").toLowerCase() === "seed") {
    return handle_(p);
  }
  if (!p.key) {
    return json_({
      ok: false,
      message: "Máy chủ key đang chạy. App tự gửi key — không cần mở link này trên trình duyệt."
    });
  }
  return handle_(p);
}

function doPost(e) {
  var p = {};
  if (e && e.parameter) p = e.parameter;
  if (e && e.postData && e.postData.contents) {
    try {
      var body = JSON.parse(e.postData.contents);
      p = Object.assign(p, body);
    } catch (err) { /* form-urlencoded đã nằm trong parameter */ }
  }
  return handle_(p);
}

function handle_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var action = String(p.action || "activate").toLowerCase();
    if (action === "seed") {
      return seedKeys_();
    }

    var key = normalizeKey_(p.key || "");
    var hwid = String(p.hwid || "").trim();
    var user = String(p.user || "").trim();

    if (key.length < 8) {
      return json_({ ok: false, message: "Key authentic quá ngắn." });
    }

    var sheet = getLicenseSheet_();
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return json_({ ok: false, message: "Danh sách key trống." });
    }

    var col = mapHeaders_(data[0]);
    if (col.key < 0) {
      return json_({ ok: false, message: "Sheet thiếu cột Key." });
    }

    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (normalizeKey_(data[i][col.key]) === key) {
        rowIndex = i;
        break;
      }
    }
    if (rowIndex < 0) {
      return json_({ ok: false, message: "Key authentic không đúng." });
    }

    var row = data[rowIndex];
    var sheetRow = rowIndex + 1;
    var status = String(col.status >= 0 ? row[col.status] : "").trim();
    if (isDisabled_(status)) {
      return json_({ ok: false, message: "Key đã bị khóa hoặc hết lượt." });
    }

    var today = todayVn_();
    var created = dateOnlyVn_(col.created >= 0 ? row[col.created] : "");
    if (created && created > today) {
      return json_({
        ok: false,
        message: "Key chưa tới ngày bắt đầu (" + formatDate_(created) + ")."
      });
    }

    var expires = dateOnlyVn_(col.expires >= 0 ? row[col.expires] : "");
    if (!expires && col.days >= 0) {
      var days = parseInt(row[col.days], 10);
      if (days > 0) {
        var start = created || today;
        expires = new Date(start.getTime());
        expires.setDate(expires.getDate() + days);
        if (col.expires >= 0) {
          sheet.getRange(sheetRow, col.expires + 1).setValue(expires);
          sheet.getRange(sheetRow, col.expires + 1).setNumberFormat("dd/MM/yyyy");
        }
      }
    }
    if (expires) {
      if (expires < today) {
        if (col.status >= 0) sheet.getRange(sheetRow, col.status + 1).setValue("Expired");
        return json_({
          ok: false,
          message: "Key đã hết hạn (" + formatDate_(expires) + ")."
        });
      }
    }

    var bound = String(col.hwid >= 0 ? row[col.hwid] : "").trim();
    if (hwid) {
      if (!bound) {
        if (col.hwid >= 0) sheet.getRange(sheetRow, col.hwid + 1).setValue(hwid);
      } else if (bound !== hwid) {
        return json_({ ok: false, message: "Key đã gắn máy khác." });
      }
    }

    if (user && col.user >= 0 && !String(row[col.user] || "").trim()) {
      sheet.getRange(sheetRow, col.user + 1).setValue(user);
    }

    if (col.created >= 0 && !created) {
      sheet.getRange(sheetRow, col.created + 1).setValue(today);
      sheet.getRange(sheetRow, col.created + 1).setNumberFormat("dd/MM/yyyy");
    }

    if (col.days >= 0 && created && expires) {
      var computedDays = Math.round((expires.getTime() - created.getTime()) / 86400000);
      var currentDays = parseInt(row[col.days], 10);
      if (isNaN(currentDays) || currentDays !== computedDays) {
        sheet.getRange(sheetRow, col.days + 1).setValue(computedDays);
      }
    }

    if (col.lastCheck >= 0) {
      sheet.getRange(sheetRow, col.lastCheck + 1).setValue(new Date());
    }

    if (action !== "check" && col.used >= 0) {
      var used = parseInt(row[col.used], 10);
      if (isNaN(used)) used = 0;
      sheet.getRange(sheetRow, col.used + 1).setValue(used + 1);
    }

    if (col.status >= 0 && !status) {
      sheet.getRange(sheetRow, col.status + 1).setValue("Active");
    }

    return json_({
      ok: true,
      message: "OK",
      expires: expires ? formatDate_(expires) : "",
      expiresIso: expires ? formatIso_(expires) : ""
    });
  } catch (err) {
    return json_({ ok: false, message: "Lỗi máy chủ key: " + err });
  } finally {
    lock.releaseLock();
  }
}

function getLicenseSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  try {
    ss.setSpreadsheetTimeZone(TZ);
  } catch (err) { /* ignore */ }
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === SHEET_GID) return sheets[i];
  }
  return ss.getSheets()[0];
}

function showAddKeyDialog() {
  setupDateColumns_();
  var html = HtmlService.createHtmlOutput(addKeyHtml_())
    .setWidth(420)
    .setHeight(460);
  SpreadsheetApp.getUi().showModalDialog(html, "Thêm key authentic");
}

/** Gọi từ hộp thoại: tự tạo key theo gói 1/3/6/12 tháng. */
function addKeyFromForm(form) {
  var months = parseInt(form && form.months, 10);
  if ([1, 3, 6, 12].indexOf(months) < 0) {
    throw new Error("Chọn gói 1, 3, 6 hoặc 12 tháng.");
  }
  var created = todayVn_();
  var expires = addMonths_(created, months);

  var sheet = getLicenseSheet_();
  var data = sheet.getDataRange().getValues();
  var col = mapHeaders_(data[0]);
  if (col.key < 0) {
    throw new Error("Sheet thiếu cột Key.");
  }

  var existing = {};
  for (var i = 1; i < data.length; i++) {
    existing[normalizeKey_(data[i][col.key])] = true;
  }
  var display = generateUniqueKey_(existing);

  var days = Math.round((expires.getTime() - created.getTime()) / 86400000);
  var note = String((form && form.note) || "").trim();

  var row = [];
  var n = Math.max(10, data[0].length);
  for (var c = 0; c < n; c++) row.push("");
  row[col.key] = display;
  if (col.status >= 0) row[col.status] = "Active";
  if (col.days >= 0) row[col.days] = days;
  if (col.created >= 0) row[col.created] = created;
  if (col.expires >= 0) row[col.expires] = expires;
  if (col.note >= 0) row[col.note] = note;
  if (col.used >= 0) row[col.used] = 0;

  sheet.appendRow(row);
  var last = sheet.getLastRow();
  if (col.created >= 0) sheet.getRange(last, col.created + 1).setNumberFormat("dd/MM/yyyy");
  if (col.expires >= 0) sheet.getRange(last, col.expires + 1).setNumberFormat("dd/MM/yyyy");
  return {
    ok: true,
    key: display,
    months: months,
    expires: formatDate_(expires),
    message: "Đã tạo key gói " + months + " tháng. Copy rồi đưa cho khách."
  };
}

function generateUniqueKey_(existing) {
  for (var n = 0; n < 40; n++) {
    var key = "FG-" + randBlock_() + "-" + randBlock_() + "-" + randBlock_();
    if (!existing[normalizeKey_(key)]) return key;
  }
  throw new Error("Không tạo được key mới. Thử lại.");
}

function randBlock_() {
  var chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  var out = "";
  for (var i = 0; i < 4; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function setupDateColumns() {
  setupDateColumns_();
  SpreadsheetApp.getActive().toast("Cột Created / Expires đã hiện lịch chọn ngày.", "FUNNYGAME", 5);
}

function setupDateColumns_() {
  var sheet = getLicenseSheet_();
  var lastCol = Math.max(10, sheet.getLastColumn());
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var col = mapHeaders_(header);
  var rows = Math.max(200, sheet.getLastRow() + 50);

  if (col.created >= 0) {
    sheet.getRange(2, col.created + 1, rows - 1, 1).setNumberFormat("dd/MM/yyyy");
    applyDatePicker_(sheet, col.created + 1, rows);
    sheet.getRange(1, col.created + 1).setNote("Ngày bắt đầu. Bấm ô → chọn ngày trên lịch.");
  }
  if (col.expires >= 0) {
    sheet.getRange(2, col.expires + 1, rows - 1, 1).setNumberFormat("dd/MM/yyyy");
    applyDatePicker_(sheet, col.expires + 1, rows);
    sheet.getRange(1, col.expires + 1).setNote("Ngày hết hạn. Qua ngày này key tự khóa.");
  }
}

function applyDatePicker_(sheet, column, rows) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireDate()
    .setAllowInvalid(false)
    .setHelpText("Chọn ngày trên lịch")
    .build();
  sheet.getRange(2, column, Math.max(1, rows - 1), 1).setDataValidation(rule);
}

function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getSheetId() !== SHEET_GID) return;
  if (e.range.getRow() < 2) return;

  var header = sheet.getRange(1, 1, 1, Math.max(10, sheet.getLastColumn())).getValues()[0];
  var col = mapHeaders_(header);
  var edited = e.range.getColumn();
  if (edited !== col.created + 1 && edited !== col.expires + 1) return;
  if (col.days < 0 || col.created < 0 || col.expires < 0) return;

  var row = e.range.getRow();
  var created = dateOnlyVn_(sheet.getRange(row, col.created + 1).getValue());
  var expires = dateOnlyVn_(sheet.getRange(row, col.expires + 1).getValue());
  if (created && expires) {
    var days = Math.round((expires.getTime() - created.getTime()) / 86400000);
    sheet.getRange(row, col.days + 1).setValue(days);
  }
}

function seedKeys_() {
  setupDateColumns_();
  var sheet = getLicenseSheet_();
  var data = sheet.getDataRange().getValues();
  var existing = {};
  for (var i = 1; i < data.length; i++) {
    existing[normalizeKey_(data[i][0])] = true;
  }
  var today = todayVn_();
  var keys = [
    ["FG-MAIN-2709-LUAN", 3650, "master"],
    ["FG-TEST-2709-AUTH", 365, "test"],
    ["FG-USER-0001-KEYA", 365, "user 1"],
    ["FG-USER-0002-KEYB", 365, "user 2"],
    ["FG-USER-0003-KEYC", 365, "user 3"]
  ];
  var added = 0;
  for (var k = 0; k < keys.length; k++) {
    if (existing[normalizeKey_(keys[k][0])]) continue;
    var expires = new Date(today.getTime());
    expires.setDate(expires.getDate() + keys[k][1]);
    sheet.appendRow([
      keys[k][0], "Active", keys[k][1], today, expires, "", "", keys[k][2], "", 0
    ]);
    added++;
  }
  return json_({ ok: true, message: "Đã ghi " + added + " key vào sheet.", added: added });
}

/** Chạy 1 lần trong editor: tự ghi 5 key vào sheet. */
function seedKeys() {
  var out = seedKeys_();
  Logger.log(out.getContent());
}

function testAuth() {
  var sheet = getLicenseSheet_();
  var data = sheet.getDataRange().getValues();
  Logger.log("Số hàng (gồm tiêu đề): " + data.length);
  Logger.log("Hàng 1: " + JSON.stringify(data[0]));
  if (data.length < 2) {
    Logger.log("LỖI: Sheet chưa có key. Chạy seedKeys() hoặc menu FUNNYGAME > Thêm key.");
    return;
  }
  var sample = String(data[1][0] || "");
  var out = handle_({ action: "check", key: sample, hwid: "test-hwid", user: "test" });
  Logger.log(out.getContent());
}

/** Thêm 1 key mẫu: bắt đầu hôm nay, hết hạn sau 365 ngày. */
function addDemoKey() {
  addKeyFromForm({ months: 12, note: "demo" });
  Logger.log("Đã thêm 1 key gói 12 tháng");
}

function mapHeaders_(headerRow) {
  var map = {
    key: -1, status: -1, days: -1, created: -1, expires: -1,
    user: -1, hwid: -1, note: -1, lastCheck: -1, used: -1
  };
  for (var i = 0; i < headerRow.length; i++) {
    var h = String(headerRow[i] || "").trim().toLowerCase();
    if (h === "key" || h === "mã" || h === "ma") map.key = i;
    else if (h === "status" || h.indexOf("trạng") === 0 || h.indexOf("trang") === 0) map.status = i;
    else if (h === "days" || h === "ngày" || h === "ngay") map.days = i;
    else if (h === "created" || h.indexOf("bắt đầu") >= 0 || h.indexOf("bat dau") >= 0) map.created = i;
    else if (h === "expires" || h === "expire" || h.indexOf("hết hạn") >= 0 || h.indexOf("het han") >= 0) map.expires = i;
    else if (h === "user") map.user = i;
    else if (h === "hwid") map.hwid = i;
    else if (h === "note" || h === "ghi chú" || h === "ghi chu") map.note = i;
    else if (h === "last check" || h === "lastcheck") map.lastCheck = i;
    else if (h === "used count" || h === "used") map.used = i;
  }
  return map;
}

function normalizeKey_(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isDisabled_(status) {
  var s = String(status || "").trim().toLowerCase();
  if (!s) return false;
  return ["banned", "disabled", "revoked", "used", "expired", "expire", "khóa", "khoa", "lock", "inactive", "0", "false"].indexOf(s) >= 0;
}

function parseDate_(value) {
  if (!value && value !== 0) return null;
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) return value;
  var s = String(value).trim();
  if (!s) return null;
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  var dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseInputDate_(value) {
  return dateOnlyVn_(parseDate_(value));
}

function dateOnlyVn_(value) {
  var d = parseDate_(value);
  if (!d) return null;
  var s = Utilities.formatDate(d, TZ, "yyyy-MM-dd");
  var p = s.split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function todayVn_() {
  var s = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
  var p = s.split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function addDays_(date, days) {
  var d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths_(date, months) {
  var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  var day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0);
  return d;
}

function formatDate_(date) {
  return Utilities.formatDate(date, TZ, "dd/MM/yyyy");
}

function formatIso_(date) {
  return Utilities.formatDate(date, TZ, "yyyy-MM-dd");
}

function json_(obj) {
  Logger.log(JSON.stringify(obj));
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function addKeyHtml_() {
  return ""
    + "<!DOCTYPE html><html><head><base target='_top'>"
    + "<style>"
    + "body{font:14px/1.45 Arial,sans-serif;margin:18px;color:#111;}"
    + "label{display:block;margin:12px 0 6px;font-weight:bold;}"
    + "input{width:100%;box-sizing:border-box;padding:8px;border:1px solid #ccc;border-radius:6px;}"
    + ".hint{color:#666;font-size:12px;margin:4px 0 0;}"
    + ".picks{display:flex;gap:8px;margin:4px 0 8px;}"
    + ".pick{flex:1;padding:10px 4px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#111;font-weight:bold;cursor:pointer;margin:0;}"
    + ".pick.on{background:#111;color:#fff;border-color:#111;}"
    + "button.go,button.sec{margin-top:16px;width:100%;padding:10px;border:0;border-radius:8px;font-weight:bold;cursor:pointer;}"
    + "button.go{background:#111;color:#fff;}"
    + "button.sec{background:#eee;color:#111;margin-top:8px;}"
    + "#msg{margin-top:12px;min-height:20px;}"
    + ".ok{color:#0a7;}.err{color:#c00;}"
    + "#newkey{font:18px/1.4 Consolas,monospace;letter-spacing:1px;padding:12px;border:1px dashed #999;border-radius:8px;text-align:center;user-select:all;}"
    + "</style></head><body>"
    + "<div id='formbox'>"
    + "<p class='hint'>Key tự tạo. Chọn gói tháng rồi ghi chú.</p>"
    + "<label>Thời hạn</label>"
    + "<div class='picks'>"
    + "<button type='button' class='pick on' data-m='1' onclick='pick(this)'>1 tháng</button>"
    + "<button type='button' class='pick' data-m='3' onclick='pick(this)'>3 tháng</button>"
    + "<button type='button' class='pick' data-m='6' onclick='pick(this)'>6 tháng</button>"
    + "<button type='button' class='pick' data-m='12' onclick='pick(this)'>12 tháng</button>"
    + "</div>"
    + "<p class='hint'>Hết hạn đúng ngày tương ứng. Sang ngày hôm sau key tự khóa.</p>"
    + "<label>Ghi chú</label>"
    + "<input id='note' type='text' placeholder='khách A'>"
    + "<button type='button' class='go' onclick='submit()'>Tạo key</button>"
    + "</div>"
    + "<div id='donebox' style='display:none'>"
    + "<p class='hint'>Đưa key này cho khách:</p>"
    + "<div id='newkey'></div>"
    + "<p id='expHint' class='hint'></p>"
    + "<button type='button' class='go' onclick='copyKey()'>Copy key</button>"
    + "<button type='button' class='sec' onclick='resetForm()'>Tạo key khác</button>"
    + "</div>"
    + "<div id='msg'></div>"
    + "<scr" + "ipt>"
    + "var months=1;"
    + "function pick(el){"
    + "  months=parseInt(el.getAttribute('data-m'),10);"
    + "  var all=document.querySelectorAll('.pick');"
    + "  for(var i=0;i<all.length;i++) all[i].className='pick';"
    + "  el.className='pick on';"
    + "}"
    + "function submit(){"
    + "  var msg=document.getElementById('msg');"
    + "  msg.className=''; msg.textContent='Đang tạo...';"
    + "  google.script.run"
    + "    .withSuccessHandler(function(r){"
    + "      document.getElementById('formbox').style.display='none';"
    + "      document.getElementById('donebox').style.display='block';"
    + "      document.getElementById('newkey').textContent=r.key;"
    + "      document.getElementById('expHint').textContent='Gói '+r.months+' tháng · dùng đến hết ngày '+r.expires+'.';"
    + "      msg.className='ok';"
    + "      msg.textContent=r.message||'';"
    + "    })"
    + "    .withFailureHandler(function(err){"
    + "      msg.className='err';"
    + "      msg.textContent=err && err.message ? err.message : String(err);"
    + "    })"
    + "    .addKeyFromForm({"
    + "      months: months,"
    + "      note: document.getElementById('note').value"
    + "    });"
    + "}"
    + "function copyKey(){"
    + "  var t=document.getElementById('newkey').textContent;"
    + "  var i=document.createElement('textarea'); i.value=t;"
    + "  document.body.appendChild(i); i.select(); document.execCommand('copy');"
    + "  document.body.removeChild(i);"
    + "  var msg=document.getElementById('msg'); msg.className='ok'; msg.textContent='Đã copy key.';"
    + "}"
    + "function resetForm(){"
    + "  document.getElementById('donebox').style.display='none';"
    + "  document.getElementById('formbox').style.display='block';"
    + "  document.getElementById('note').value='';"
    + "  document.getElementById('msg').textContent='';"
    + "}"
    + "</scr" + "ipt></body></html>";
}
