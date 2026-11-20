// Kiểm tra phiên bản đồng nhất giữa package.json, manifest.json, iOS (Swift/JS) và README.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const results = [];
const check = (name, cond, extra) => results.push((cond ? "PASS " : "FAIL ") + name + (extra ? "  [" + extra + "]" : ""));

const v = JSON.parse(read("package.json")).version;
check("V1 manifest.json khop package.json", JSON.parse(read("manifest.json")).version === v, v);
check("V2 README ghi dung phien ban", read("README.md").includes("**v" + v + "**"), v);
const swift = read("ios/ViewController.swift");
check("V3 ViewController.swift: moi so phien ban deu = " + v, swift.includes('__FG_IOS_VERSION__ = "' + v + '"') &&
    (swift.match(/(?<=app[=": ]+)\d+\.\d+\.\d+/g) || []).every((x) => x === v));
check("V4 chrome-bridge.js khop phien ban", read("ios/chrome-bridge.js").includes('|| "' + v + '"'));
check("V5 IOS-INSTALL.md khop phien ban", read("mobile/IOS-INSTALL.md").includes("v" + v));

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
