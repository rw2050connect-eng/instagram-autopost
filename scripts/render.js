// Turns a post idea into a 1080x1350 Instagram image (JPEG)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const BRANDS = require('./brands');

const ROOT = path.join(__dirname, '..');
const W = 1080, H = 1350;

function dataUri(file) {
  const p = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' }[ext] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
}

async function remoteDataUri(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`image ${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const type = r.headers.get('content-type') || 'image/jpeg';
  return `data:${type};base64,${buf.toString('base64')}`;
}

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// [word] in text → highlighted in the accent colour
const hl = (s = '') => esc(s).replace(/\[([^\]]+)\]/g, '<span class="hl">$1</span>');

function fontFaces() {
  return [400, 500, 600, 700, 800].map(w =>
    `@font-face{font-family:P;font-weight:${w};src:url(${dataUri(`fonts/poppins-latin-${w}-normal.woff2`)}) format('woff2')}`).join('');
}

function motif(b, kind) {
  const a = b.accent, c2 = b.accent2;
  if (kind === 'hills') return `<div style="position:absolute;right:70px;top:70px;width:120px;height:120px;border-radius:50%;background:${a};opacity:.95"></div><svg class="motif" viewBox="0 0 1080 420" preserveAspectRatio="none" style="position:absolute;left:0;bottom:0;width:100%;height:430px">
      
      <path d="M0 260 C180 150 320 170 470 240 C610 300 760 160 1080 210 L1080 420 L0 420Z" fill="${c2}" opacity=".55"/>
      <path d="M0 320 C200 230 380 300 560 290 C760 280 880 230 1080 290 L1080 420 L0 420Z" fill="${c2}" opacity=".85"/>
      <path d="M0 380 C260 330 520 390 780 350 C900 332 1000 345 1080 360 L1080 420 L0 420Z" fill="${b.dark}"/></svg>`;
  if (kind === 'circuit') {
    let s = '';
    for (let i = 0; i < 14; i++) {
      const y = 60 + i * 95, x = (i * 173) % 900 + 60;
      s += `<path d="M${x} ${y} h120 v40 h90" stroke="${a}" stroke-width="3" fill="none" opacity=".18"/><circle cx="${x + 210}" cy="${y + 40}" r="7" fill="${a}" opacity=".35"/>`;
    }
    return `<svg class="motif" viewBox="0 0 1080 1350" style="position:absolute;inset:0;width:100%;height:100%">${s}</svg>`;
  }
  if (kind === 'search') return `<svg class="motif" viewBox="0 0 1080 1350" style="position:absolute;inset:0;width:100%;height:100%">
      <circle cx="900" cy="230" r="190" fill="none" stroke="#fff" stroke-width="46" opacity=".08"/>
      <path d="M1035 365 l120 120" stroke="${a}" stroke-width="56" stroke-linecap="round" opacity=".25"/></svg>`;
  if (kind === 'bag') return `<svg class="motif" viewBox="0 0 1080 1350" style="position:absolute;inset:0;width:100%;height:100%">
      <circle cx="980" cy="120" r="260" fill="${a}" opacity=".16"/><circle cx="60" cy="1280" r="200" fill="${c2}" opacity=".14"/></svg>`;
  return '';
}

function css(b) {
  return `${fontFaces()}
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${W}px;height:${H}px;font-family:P,sans-serif;overflow:hidden}
  .card{position:relative;width:${W}px;height:${H}px;overflow:hidden}
  .hl{color:${b.accent}}
  .logo{display:flex;align-items:center;gap:18px}
  .logo img{width:96px;height:96px;border-radius:24px;object-fit:contain;background:${b.logoBg};box-shadow:0 6px 20px rgba(0,0,0,.18)}
  .logo b{font-size:34px;font-weight:700;letter-spacing:-.5px}
  .kicker{display:inline-block;padding:12px 26px;border-radius:999px;font-size:26px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase}
  .cta{position:absolute;left:64px;right:64px;bottom:56px;height:104px;border-radius:30px;display:flex;align-items:center;justify-content:space-between;padding:0 40px;font-size:34px;font-weight:700}
  .cta small{font-size:28px;font-weight:600;opacity:.9}
  .mid{position:absolute;left:64px;right:64px;top:190px;bottom:200px;display:flex;flex-direction:column;justify-content:center}
  .pt{display:flex;align-items:center;gap:24px;padding:24px 30px;border-radius:24px;font-size:36px;font-weight:500;line-height:1.25}
  .tick{flex:none;width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800}
  `;
}

function logoBlock(b, color) {
  return `<div class="logo"><img src="${dataUri(b.logo)}"><b style="color:${color}">${esc(b.name)}</b></div>`;
}

function ctaBar(b, p, dark) {
  const bg = dark ? b.accent : b.primary, fg = dark ? b.dark : '#fff';
  return `<div class="cta" style="background:${bg};color:${fg}"><span>${esc(p.cta || 'Link in bio')}</span><small>${esc(b.site)}</small></div>`;
}

function points(b, p, onDark) {
  if (!p.points || !p.points.length) return '';
  const bg = onDark ? 'rgba(255,255,255,.1)' : '#fff';
  const fg = onDark ? '#fff' : b.dark;
  return `<div style="display:flex;flex-direction:column;gap:18px;margin-top:44px">${p.points.map(t =>
    `<div class="pt" style="background:${bg};color:${fg};${onDark ? '' : 'box-shadow:0 4px 18px rgba(0,0,0,.06)'}"><span class="tick" style="background:${b.accent};color:${b.dark}">✓</span><span>${hl(t)}</span></div>`).join('')}</div>`;
}

// Layout: bold coloured card with headline + 3 points
function feature(b, p) {
  return `<div class="card" style="background:linear-gradient(160deg,${b.primary} 0%,${b.dark} 100%);color:#fff">
    ${motif(b, b.motif === 'photo' ? '' : b.motif)}
    <div style="position:absolute;left:64px;top:56px">${logoBlock(b, '#fff')}</div>
    <div class="mid">
      <div><span class="kicker" style="background:${b.accent};color:${b.dark}">${esc(p.kicker)}</span></div>
      <h1 style="margin-top:34px;font-size:${p.headline.length > 42 ? 84 : 98}px;line-height:1.06;font-weight:800;letter-spacing:-2px">${hl(p.headline)}</h1>
      ${p.sub ? `<p style="margin-top:28px;font-size:38px;line-height:1.4;opacity:.88;max-width:920px">${hl(p.sub)}</p>` : ''}
      ${points(b, p, true)}
    </div>
    ${ctaBar(b, p, true)}
  </div>`;
}

// Layout: light card, big statement
function statement(b, p) {
  return `<div class="card" style="background:${b.light};color:${b.dark}">
    <div style="position:absolute;right:-160px;top:-160px;width:560px;height:560px;border-radius:50%;background:${b.accent};opacity:.22"></div>
    <div style="position:absolute;left:-120px;bottom:120px;width:340px;height:340px;border-radius:50%;background:${b.primary};opacity:.08"></div>
    <div style="position:absolute;left:64px;top:56px">${logoBlock(b, b.dark)}</div>
    <div class="mid">
      <div><span class="kicker" style="background:${b.primary};color:#fff">${esc(p.kicker)}</span></div>
      <h1 style="margin-top:36px;font-size:${p.headline.length > 48 ? 88 : 104}px;line-height:1.04;font-weight:800;letter-spacing:-2.5px">${hl(p.headline).replace(/class="hl"/g, `class="hl" style="color:${b.primary};background:linear-gradient(transparent 62%,${b.accent}66 62%)"`)}</h1>
      ${p.sub ? `<p style="margin-top:38px;font-size:40px;line-height:1.42;opacity:.8;max-width:940px">${hl(p.sub)}</p>` : ''}
      ${points(b, p, false)}
    </div>
    ${ctaBar(b, p, false)}
  </div>`;
}

// Layout: numbered steps
function steps(b, p) {
  const list = (p.points || []).map((t, i) => `<div style="display:flex;gap:28px;align-items:flex-start;margin-top:30px">
      <div style="flex:none;width:76px;height:76px;border-radius:22px;background:${b.accent};color:${b.dark};font-size:40px;font-weight:800;display:flex;align-items:center;justify-content:center">${i + 1}</div>
      <div style="font-size:40px;line-height:1.3;font-weight:500;padding-top:10px">${hl(t)}</div></div>`).join('');
  return `<div class="card" style="background:linear-gradient(160deg,${b.primary} 0%,${b.dark} 100%);color:#fff">
    ${motif(b, b.motif === 'photo' ? '' : b.motif)}
    <div style="position:absolute;left:64px;top:56px">${logoBlock(b, '#fff')}</div>
    <div class="mid">
      <div><span class="kicker" style="background:#fff;color:${b.dark}">${esc(p.kicker)}</span></div>
      <h1 style="margin-top:30px;font-size:88px;line-height:1.06;font-weight:800;letter-spacing:-2px">${hl(p.headline)}</h1>
      <div style="margin-top:20px">${list}</div>
    </div>
    ${ctaBar(b, p, true)}
  </div>`;
}

// Layout: photo on top, text below (Find me)
function photo(b, p, img) {
  return `<div class="card" style="background:${b.light};color:${b.dark}">
    <div style="position:absolute;left:0;top:0;width:${W}px;height:720px;background:url(${img}) center/cover"></div>
    <div style="position:absolute;left:0;top:520px;width:${W}px;height:200px;background:linear-gradient(transparent,rgba(0,0,0,.35))"></div>
    <div style="position:absolute;left:48px;top:48px;background:rgba(255,255,255,.94);padding:12px 26px 12px 12px;border-radius:30px">${logoBlock({ ...b, logoBg: '#fff' }, b.dark).replace('width:96px', 'width:72px')}</div>
    <div style="position:absolute;left:64px;top:650px"><span class="kicker" style="background:${b.accent};color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.2)">${esc(p.kicker)}</span></div>
    <div style="position:absolute;left:64px;right:64px;top:770px">
      <h1 style="font-size:${p.headline.length > 40 ? 64 : 74}px;line-height:1.08;font-weight:800;letter-spacing:-1.8px">${hl(p.headline).replace(/class="hl"/g, `class="hl" style="color:${b.accent}"`)}</h1>
      ${p.sub ? `<p style="margin-top:20px;font-size:32px;line-height:1.38;opacity:.8">${hl(p.sub)}</p>` : ''}
    </div>
    ${ctaBar(b, p, false)}
  </div>`;
}

// Layout: live product spotlight (EasyBuy)
function product(b, p, img) {
  const price = Number(p.price).toLocaleString('en-US');
  return `<div class="card" style="background:linear-gradient(170deg,${b.light} 0%,#fff 60%);color:${b.dark}">
    ${motif(b, 'bag')}
    <div style="position:relative;padding:56px 64px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        ${logoBlock(b, b.primary)}
        <span class="kicker" style="background:${b.accent};color:${b.dark}">${esc(p.kicker)}</span>
      </div>
      <div style="margin-top:40px;height:680px;border-radius:40px;background:#fff;box-shadow:0 14px 40px rgba(8,48,106,.12);display:flex;align-items:center;justify-content:center;position:relative">
        <img src="${img}" style="width:88%;height:88%;object-fit:contain">
        <div style="position:absolute;right:-14px;bottom:-30px;background:${b.primary};color:#fff;padding:20px 34px;border-radius:26px;font-size:50px;font-weight:800;box-shadow:0 10px 30px rgba(8,48,106,.3)">${price} <span style="font-size:30px;font-weight:600">RWF</span></div>
      </div>
      <h1 style="margin-top:56px;font-size:46px;line-height:1.2;font-weight:700;letter-spacing:-.8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.headline)}</h1>
      <div style="margin-top:22px;display:flex;gap:14px;flex-wrap:wrap">${(p.chips || []).map(c =>
        `<span style="padding:12px 22px;border-radius:999px;background:${b.light};border:2px solid ${b.primary}22;font-size:26px;font-weight:600;color:${b.primary}">${esc(c)}</span>`).join('')}</div>
    </div>
    ${ctaBar(b, p, false)}
  </div>`;
}

async function buildHTML(post) {
  const b = BRANDS[post.app];
  let body;
  if (post.layout === 'photo') {
    // Find me photos come from joinfindme.com (kept in brand/findme/ when available)
    const local = path.join(ROOT, post.photo);
    const img = fs.existsSync(local) ? dataUri(post.photo)
      : await remoteDataUri(`https://joinfindme.com/gallery/${path.basename(post.photo, '.jpg')}-800.jpg`);
    body = photo(b, post, img);
  }
  else if (post.layout === 'product') body = product(b, post, await remoteDataUri(post.image));
  else if (post.layout === 'steps') body = steps(b, post);
  else if (post.layout === 'statement') body = statement(b, post);
  else body = feature(b, post);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css(b)}</style></head><body>${body}</body></html>`;
}

async function renderAll(posts, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const out = [];
  for (const post of posts) {
    await page.setContent(await buildHTML(post), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const file = path.join(outDir, `${post.app}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    out.push(file);
  }
  await browser.close();
  return out;
}

module.exports = { renderAll, buildHTML };
