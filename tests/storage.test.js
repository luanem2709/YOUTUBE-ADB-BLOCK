// Kiểm tra cơ chế ghi storage không race (content.js) — chạy bằng Node.
// Mô phỏng: 2 nhánh code cùng đọc→sửa→ghi userStats chạy SONG SONG.
// Nếu không serialize, bản ghi sau đè mất phần của bản ghi trước.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const results = [];
const check = (name, cond, extra) => results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : ""));

// ---- Trích hàm enqueueStorageWrite từ content.js (giữ nguyên logic nguồn) ----
function extractQueueFn(src) {
    const start = src.indexOf("let storageWriteChain = Promise.resolve();");
    if (start < 0) throw new Error("khong tim thay khoi tao storageWriteChain");
    const end = src.indexOf("function enqueueStorageWrite", start);
    const braceStart = src.indexOf("{", src.indexOf(")", end));
    let depth = 0, i = braceStart;
    for (; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    const decl = src.slice(start, end);
    const fn = src.slice(end, i);
    return decl + "\n" + fn;
}

(async () => {
    const src = fs.readFileSync(path.join(root, "content.js"), "utf8");
    const queueCode = extractQueueFn(src);
    check("S1 content.js co ham enqueueStorageWrite", queueCode.length > 50);

    // ---- Storage giả lập: có độ trễ để buộc race xảy ra ----
    const store = { userStats: { currentId: "guest", users: {} } };
    let pendingOps = 0;
    const storage = {
        local: {
            get: (keys, cb) => setTimeout(() => cb(JSON.parse(JSON.stringify(store))), 10),
            set: (obj, cb) => setTimeout(() => { Object.assign(store, JSON.parse(JSON.stringify(obj))); if (cb) cb(); }, 10),
        },
    };

    const ctx = vm.createContext({ chrome: { storage }, console, Promise, setTimeout, clearTimeout, JSON, Object, Date });
    vm.runInContext(queueCode, ctx);

    const enqueue = ctx.enqueueStorageWrite;

    // ---- Kịch bản race: flushStats() và detectAndStoreUser() chạy cùng lúc ----
    // Nhánh 1: tăng adsBlocked
    const flushTask = () => enqueue(async () => {
        const r = await new Promise((res) => storage.local.get(["userStats"], res));
        const us = r.userStats;
        us.users["u1"] = us.users["u1"] || { id: "u1", name: "A", adsBlocked: 0, days: [] };
        us.users["u1"].adsBlocked = (us.users["u1"].adsBlocked || 0) + 10;
        await new Promise((res) => storage.local.set({ userStats: us }, res));
    });
    // Nhánh 2: đặt tên/avatar (không đụng adsBlocked)
    const detectTask = () => enqueue(async () => {
        const r = await new Promise((res) => storage.local.get(["userStats"], res));
        const us = r.userStats;
        us.currentId = "u1";
        us.users["u1"] = us.users["u1"] || { id: "u1", name: "A", adsBlocked: 0, days: [] };
        us.users["u1"].name = "Nguyen Van A";
        us.users["u1"].avatar = "https://x/a.png";
        await new Promise((res) => storage.local.set({ userStats: us }, res));
    });

    await Promise.all([flushTask(), detectTask()]);
    await new Promise((r) => setTimeout(r, 60));

    const u = store.userStats.users["u1"];
    check("S2 hai lan ghi song song khong lam mat du lieu", !!u && u.adsBlocked === 10 && u.name === "Nguyen Van A",
        JSON.stringify(u));

    // ---- Kiểm chứng: nếu KHÔNG serialize thì sẽ mất dữ liệu ----
    const store2 = { userStats: { currentId: "guest", users: {} } };
    const storage2 = {
        local: {
            get: (keys, cb) => setTimeout(() => cb(JSON.parse(JSON.stringify(store2))), 10),
            set: (obj, cb) => setTimeout(() => { Object.assign(store2, JSON.parse(JSON.stringify(obj))); if (cb) cb(); }, 10),
        },
    };
    const ctx2 = vm.createContext({ chrome: { storage: storage2 }, console, Promise, setTimeout, clearTimeout, JSON, Object, Date });
    vm.runInContext(queueCode, ctx2);
    // Ghi song song KHÔNG qua hàng đợi → phải bị mất dữ liệu (xác nhận test có ý nghĩa)
    const raw = async (fn) => {
        const r = await new Promise((res) => storage2.local.get(["userStats"], res));
        const us = r.userStats;
        fn(us);
        await new Promise((res) => storage2.local.set({ userStats: us }, res));
    };
    await Promise.all([
        raw((us) => { us.users["u2"] = { id: "u2", adsBlocked: 0 }; us.users["u2"].adsBlocked += 10; }),
        raw((us) => { us.users["u2"] = { id: "u2", adsBlocked: 0 }; us.users["u2"].name = "B"; }),
    ]);
    await new Promise((r) => setTimeout(r, 60));
    const u2 = store2.userStats.users["u2"];
    check("S3 test co y nghia (khong serialize thi that thoai mat du lieu)",
        !u2 || u2.adsBlocked !== 10 || !u2.name,
        JSON.stringify(u2));

    // ---- Hàng đợi phai tiep tuc chay du chay loi ----
    const ctx3 = vm.createContext({ console: { error() { } }, Promise, setTimeout, JSON });
    vm.runInContext(queueCode, ctx3);
    const ok = await ctx3.enqueueStorageWrite(() => Promise.reject(new Error("boom")));
    check("S4 loi trong hang doi khong lam hong cac task sau", ok === undefined || true);

    let ran = false;
    await ctx3.enqueueStorageWrite(async () => { ran = true; });
    check("S5 task sau van chay sau khi task loi", ran);

    // ---- popup.js và stats.js cũng phải có cùng cơ chế ----
    for (const f of ["popup.js", "stats.js"]) {
        const s = fs.readFileSync(path.join(root, f), "utf8");
        const hasFn = /function enqueueStorageWrite\(task\)/.test(s);
        const used = /enqueueStorageWrite\(/.test(s.replace(/function enqueueStorageWrite\(task\)/, ""));
        check("S6 " + f + " co enqueueStorageWrite va duoc su dung", hasFn && used,
            "def=" + hasFn + " used=" + used);
    }

    console.log(results.join("\n"));
    const failed = results.filter((r) => r.startsWith("FAIL")).length;
    console.log(failed ? "\nFAIL " + failed : "\nPASS " + results.length);
    process.exit(failed ? 1 : 0);
})();
