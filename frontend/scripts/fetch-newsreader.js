// Regenerate the self-hosted Newsreader variable fonts in app/fonts/.
//
// We self-host Newsreader instead of using next/font/google because Newsreader
// is missing from Next's bundled Capsize metrics DB and, more importantly,
// next/font/google resolves the font-file list from Google's CSS at build time
// — a response Google varies per environment, which crashed CI. Checking the
// woff2 in makes the build deterministic. Run from the frontend/ directory:
//
//   node scripts/fetch-newsreader.js
//
// Latin subset only (matches the previous `subsets: ["latin"]`), full optical
// size + weight range, roman + italic.
const path = require("path");
const fs = require("fs");

const CSS_URL =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&display=swap";
// Chrome UA so Google serves woff2.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function main() {
  const css = await (await fetch(CSS_URL, { headers: { "user-agent": UA } })).text();

  // Each @font-face block carries its own font-style + unicode-range; pick the
  // latin block (U+0000-00FF) for each style.
  const want = { normal: null, italic: null };
  for (const block of css.split("@font-face")) {
    if (!/unicode-range:\s*U\+0000-00FF/.test(block)) continue;
    const style = /font-style:\s*(normal|italic)/.exec(block);
    const src = /src:\s*url\((https:\/\/[^)]+\.woff2)\)/.exec(block);
    if (style && src) want[style[1]] = src[1];
  }
  if (!want.normal || !want.italic) throw new Error("could not locate latin variable files in Google CSS");

  const outDir = path.resolve(__dirname, "..", "app", "fonts");
  fs.mkdirSync(outDir, { recursive: true });
  for (const [style, url] of Object.entries(want)) {
    const buf = Buffer.from(await (await fetch(url, { headers: { "user-agent": UA } })).arrayBuffer());
    const file = path.join(outDir, `newsreader-latin-${style}.woff2`);
    fs.writeFileSync(file, buf);
    console.log(`wrote ${path.relative(process.cwd(), file)} (${buf.length} bytes)`);
  }
}

main().catch((e) => {
  console.error("fetch-newsreader failed:", e && e.message);
  process.exit(1);
});
