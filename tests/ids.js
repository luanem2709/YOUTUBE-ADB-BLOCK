// Liệt kê id có trong HTML
const fs = require("fs");
const h = fs.readFileSync(process.argv[2], "utf8");
const ids = Array.from(h.matchAll(/id="([^"]+)"/g)).map((m) => m[1]);
console.log(ids.join("\n"));
