import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<!doctype html><style>
  #p{position:absolute;visibility:hidden;white-space:pre;font-size:0.75rem;font-weight:600;
     font-family:system-ui,sans-serif;letter-spacing:-0.02em}</style><span id=p></span>`);
const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,/()%-Δ";
const out = await page.evaluate((chars) => {
  const p = document.getElementById('p');
  const w = (s) => { p.textContent = s; return p.getBoundingClientRect().width; };
  const base = w('n'.repeat(40)) / 40;
  const t = {};
  for (const c of chars) t[c] = Math.round((w(c.repeat(40)) / 40) * 100) / 100;
  // sanity: measure some real labels both ways
  const check = ['durability','softness','Breathability','Removable','Forefoot','Midsole','thickness'];
  const sums = check.map((s) => [s, Math.round(w(s) * 10) / 10,
    Math.round([...s].reduce((a, c) => a + (t[c] ?? base), 0) * 10) / 10]);
  return { t, sums };
}, chars);
console.log(JSON.stringify(out.t));
console.log('\nword           measured  summed');
for (const [s, m, sum] of out.sums) console.log(s.padEnd(15), String(m).padStart(6), String(sum).padStart(7));
await browser.close();
