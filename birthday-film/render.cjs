// Renders frames of film.html in headless Chromium (software WebGL) to PNGs.
// usage: node render.cjs <outDir> [first=0] [last=191] [step=1]
const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const [outDir, a = '0', b = '191', st = '1'] = process.argv.slice(2);
if (!outDir) { console.error('usage: node render.cjs <outDir> [first] [last] [step]'); process.exit(1); }
mkdirSync(outDir, { recursive: true });
const here = __dirname;

(async () => {
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => { console.error('[pageerror]', e.message); process.exit(2); });
await page.goto('file://' + join(here, 'film.html') + '?render=1');

for (let f = +a; f <= +b; f += +st) {
  const t0 = Date.now();
  await page.evaluate(n => window.renderFrame(n), f);
  const png = await page.screenshot({ type: 'png' });
  writeFileSync(join(outDir, `f${String(f).padStart(4, '0')}.png`), png);
  console.log(`frame ${f} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
await browser.close();
})();
