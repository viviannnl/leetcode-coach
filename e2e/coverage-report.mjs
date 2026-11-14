// Merge per-test V8 coverage of static/app.js (written by tests/fixtures.ts)
// into one report: % of functions and % of code bytes executed by the whole
// suite, plus every function no test ever ran.
//
//   npm test && npm run coverage
import fs from "node:fs";
import path from "node:path";

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), ".coverage");
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
if (!files.length) {
  console.error("No coverage found. Run `npm test` first.");
  process.exit(1);
}

let source = null;
const fnHits = new Map(); // "start-end" -> { name, start, hit }
let covered = null; // Uint8Array per byte

for (const f of files) {
  for (const entry of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))) {
    source ??= entry.source;
    covered ??= new Uint8Array(source.length);
    // Per run: apply ranges outer-to-inner (V8 order), so nested zero-count
    // blocks override their enclosing function's count.
    const counts = new Int32Array(source.length).fill(-1);
    for (const fn of entry.functions) {
      for (const r of fn.ranges) counts.fill(r.count, r.startOffset, r.endOffset);
      const top = fn.ranges[0];
      if (!fn.functionName && top.startOffset === 0) continue; // the script itself
      const key = `${top.startOffset}-${top.endOffset}`;
      const cur = fnHits.get(key) ?? { name: fn.functionName || "(anonymous)", start: top.startOffset, hit: false };
      cur.hit ||= top.count > 0;
      fnHits.set(key, cur);
    }
    for (let i = 0; i < counts.length; i++) if (counts[i] > 0) covered[i] = 1;
  }
}

const lineOf = (offset) => source.slice(0, offset).split("\n").length;
// Byte coverage ignores whitespace and comment-only lines so the % reflects code.
const codeMask = new Uint8Array(source.length);
let inComment = false;
source.split("\n").reduce((off, line) => {
  const t = line.trim();
  const isComment = t.startsWith("//") || t.startsWith("/*") || t.startsWith("*") || inComment;
  if (t.includes("/*")) inComment = !t.includes("*/");
  else if (t.includes("*/")) inComment = false;
  if (t && !isComment) for (let i = 0; i < line.length; i++) if (line[i] !== " ") codeMask[off + i] = 1;
  return off + line.length + 1;
}, 0);

let code = 0, hit = 0;
for (let i = 0; i < source.length; i++) if (codeMask[i]) { code++; if (covered[i]) hit++; }

const fns = [...fnHits.values()].sort((a, b) => a.start - b.start);
const missed = fns.filter((f) => !f.hit);

// Uncovered blocks inside covered functions: contiguous code runs never executed.
const gaps = [];
for (let i = 0; i < source.length; ) {
  if (codeMask[i] && !covered[i]) {
    let j = i;
    while (j < source.length && (!codeMask[j] || !covered[j])) j++;
    const text = source.slice(i, j).trim().replace(/\s+/g, " ");
    if (text.length > 12) gaps.push({ line: lineOf(i), text: text.slice(0, 90) });
    i = j;
  } else i++;
}

console.log(`\napp.js UI coverage across ${files.length} test runs`);
console.log(`  functions: ${fns.length - missed.length}/${fns.length}  (${((1 - missed.length / fns.length) * 100).toFixed(1)}%)`);
console.log(`  code:      ${((hit / code) * 100).toFixed(1)}% of non-comment bytes executed\n`);
if (missed.length) {
  console.log("Functions never run:");
  for (const f of missed) console.log(`  line ${String(lineOf(f.start)).padStart(4)}  ${f.name}`);
  console.log();
}
if (gaps.length) {
  console.log(`Unexecuted code (${gaps.length} spots):`);
  for (const g of gaps.slice(0, 40)) console.log(`  line ${String(g.line).padStart(4)}  ${g.text}`);
  if (gaps.length > 40) console.log(`  … ${gaps.length - 40} more`);
}
