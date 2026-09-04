const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const destDir = path.join(__dirname, "..", "public");
const dest = path.join(destDir, "sql-wasm.wasm");

if (!fs.existsSync(src)) {
  console.warn("sql.js wasm not found yet:", src);
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("copied sql-wasm.wasm -> public/");
