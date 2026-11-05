// Takes the small pictures for «Se Narvik i bilder» on the front page: one screenshot of each visualisation on its
// own page, in light and dark mode, cut to 4:3 from the top. Run by hand when a visualisation changes:
//
//   npm install playwright   (or use one that is already installed)
//   node scripts/build_galleri.js
//
// It serves site/ on a local port, so the pages read the same data files as on narviktall.no, and writes
// site/img/galleri/<name>-lys.jpg and <name>-mork.jpg. The list must match the «Se Narvik i bilder» section in
// site/index.html.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SITE = path.join(__dirname, '..', 'site');
const OUT = path.join(SITE, 'img', 'galleri');
// [file name, page, element to photograph]
const SHOTS = [
  ['pendlerkart', 'arbeid', '#pk-map'],
  ['ledighetskalender', 'arbeid', '#kalender'],
  ['befolkningens-regnskap', 'befolkning', '.ledger-chart'],
  ['befolkningspyramide', 'befolkning', '#pyramide .pyr'],
  ['omrade-for-omrade', 'okonomi', '#multiples'],
  ['sammenligning', 'okonomi', '#cmp-list'],
];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  let f = path.join(SITE, p);
  if (!f.startsWith(SITE)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  fs.readFile(f, (err, body) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(body);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [scheme, suffix] of [['light', 'lys'], ['dark', 'mork']]) {
    // A narrow window gives the compact phone layout of each chart, which reads better as a small picture.
    const page = await browser.newPage({ viewport: { width: 640, height: 1000 }, deviceScaleFactor: 1, colorScheme: scheme });
    for (const [name, url, sel] of SHOTS) {
      await page.goto(base + url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      const el = await page.$(sel);
      if (!el) throw new Error(`${sel} finnes ikke på ${url}`);
      const b = await el.boundingBox();
      const clip = { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, b.width * 0.75) };
      await page.screenshot({ path: path.join(OUT, `${name}-${suffix}.jpg`), type: 'jpeg', quality: 72, fullPage: true, clip });
      console.log(`${name}-${suffix}.jpg`, Math.round(clip.width), '×', Math.round(clip.height));
    }
    await page.close();
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
