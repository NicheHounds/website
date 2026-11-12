// Render the mark's hound + moon path, white on black, at 3200 px.
// Usage: node tools/hound-rig/render.js   (needs Playwright with Chromium)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const svg = fs.readFileSync(path.join(root, 'assets/img/niche-hounds-mark-v4-white-on-navy.svg'), 'utf8');
const hound = svg.match(/<path id="hound-moon"[^>]*\/>/s)[0].replace('id="hound-moon"', 'fill="#fff"');
const page = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="425.6 425.6 1712.9 1712.9" width="3200" height="3200"><rect x="0" y="0" width="3000" height="3000" fill="#000"/>${hound}</svg>`;

(async () => {
  const browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 3200, height: 3200 } });
  await tab.setContent(`<body style="margin:0">${page}</body>`);
  await tab.screenshot({ path: path.join(__dirname, 'hound.png') });
  await browser.close();
})();
