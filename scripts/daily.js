// Daily Instagram auto-poster for 2050 Connect apps.
// Usage: node scripts/daily.js [--date YYYY-MM-DD] [--dry] [--only app1,app2] [--no-git]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { renderAll } = require('./render');
const BRANDS = require('./brands');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes('--dry');
const NO_GIT = args.includes('--no-git');
const ONLY = arg('--only') ? arg('--only').split(',') : null;

const START = '2026-11-01'; // day 0 of the content calendar
const APPS = ['connect', 'easybuy', 'vamos', 'worksmart', 'findme', 'findit'];
const REPO = process.env.GITHUB_REPOSITORY || 'rw2050connect-eng/instagram-autopost';
const BRANCH = process.env.GITHUB_REF_NAME || 'main';
const GRAPH = 'https://graph.facebook.com/v26.0';

const kigaliToday = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);
const DATE = arg('--date') || kigaliToday();
const DAY = Math.round((Date.parse(DATE) - Date.parse(START)) / 864e5);
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return d; } };
const writeJSON = (f, v) => { fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true }); fs.writeFileSync(path.join(ROOT, f), JSON.stringify(v, null, 2) + '\n'); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pick = (arr, n) => { n = Math.floor(n); return arr[((n % arr.length) + arr.length) % arr.length]; };

// ---------- Instagram accounts ----------
// Which Instagram username belongs to which app (add new ones here).
const IG_USERNAMES = {
  easybuy: 'easybuy_rwanda',
  vamos: 'vamos_travel_ltd',
  worksmart: '',
  findme: '',
  findit: '',
  connect: '',
};
// The GitHub secret IG_ACCOUNTS holds a long-lived Facebook user token (from Graph API Explorer).
// From it we get each Page's token (Page tokens made from a long-lived user token never expire)
// and keep them encrypted in state/tokens.enc, locked with the secret itself.
const RAW = (process.env.IG_ACCOUNTS || '').trim().replace(/^user\s*[=:]\s*/i, '');
function keyBuf() { return crypto.createHash('sha256').update('ig-autopost:' + RAW).digest(); }
function loadSaved() {
  const f = path.join(ROOT, 'state/tokens.enc');
  if (!RAW || !fs.existsSync(f)) return {};
  try {
    const [iv, tag, data] = fs.readFileSync(f, 'utf8').trim().split('.').map(s => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', keyBuf(), iv); d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
  } catch { console.log('ℹ️  secret changed — fetching Page tokens again'); return {}; }
}
function saveAccounts(acc) {
  if (!RAW) return;
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', keyBuf(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(acc), 'utf8'), c.final()]);
  fs.mkdirSync(path.join(ROOT, 'state'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'state/tokens.enc'), [iv, c.getAuthTag(), data].map(b => b.toString('base64')).join('.') + '\n');
}
async function loadAccounts() {
  const acc = loadSaved();
  const wanted = Object.entries(IG_USERNAMES).filter(([, u]) => u);
  if (RAW && wanted.some(([app]) => !acc[app])) {
    let url = `${GRAPH}/me/accounts?fields=name,access_token,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(RAW)}`;
    const pages = [];
    while (url) { const j = await (await fetch(url)).json(); if (j.error) { console.warn('⚠️ Facebook login problem:', j.error.message); break; } pages.push(...(j.data || [])); url = j.paging && j.paging.next; }
    for (const [app, user] of wanted) {
      const p = pages.find(p => p.instagram_business_account && p.instagram_business_account.username.toLowerCase() === user.toLowerCase());
      if (p) { acc[app] = { user_id: p.instagram_business_account.id, username: user, token: p.access_token, page: p.name }; console.log(`🔗 ${app} → @${user} (Page: ${p.name})`); }
      else if (!acc[app]) console.warn(`⚠️ ${app}: @${user} is not linked to any of your Facebook Pages yet`);
    }
  }
  for (const app of Object.keys(acc)) if (!IG_USERNAMES[app]) delete acc[app];
  return acc;
}
// ---------- EasyBuy live product ----------
async function easybuyProduct(cfg, history) {
  const SB = 'https://iwulhmrfgrxdsfucrhud.supabase.co/rest/v1';
  const KEY = process.env.EASYBUY_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dWxobXJmZ3J4ZHNmdWNyaHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1ODE1MDEsImV4cCI6MjEwNzE1NzUwMX0.9Qp78pACAYqd1mVY7ZBW2kajbPO-Mw1UUt4B_zem8Qs'; // public website key
  const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const sizeOf = require('image-size');
  const bad = (t) => cfg.excludeWords.some(w => (t || '').toLowerCase().includes(w));
  const kws = cfg.productKeywords;
  for (let attempt = 0; attempt < kws.length; attempt++) {
    const kw = pick(kws, DAY / 2 + attempt * 7);
    const url = `${SB}/products?select=id,title,price_rwf,category,product_type,origin,ship_eta_min_days,ship_eta_max_days,product_images(url,position)` +
      `&status=eq.active&in_stock=eq.true&market=eq.RW&price_rwf=gte.2000&or=(title.ilike.*${kw}*,category.ilike.*${kw}*)&limit=300`;
    const r = await fetch(url, { headers });
    if (!r.ok) { console.warn('EasyBuy query failed', r.status, await r.text()); continue; }
    const list = (await r.json()).filter(p => p.product_images && p.product_images.length && !bad(p.title) && !bad(p.category) && !bad(p.product_type) && !history.includes(p.id));
    if (!list.length) continue;
    const seed = crypto.createHash('md5').update(DATE + kw).digest().readUInt32BE(0);
    for (let k = 0; k < Math.min(list.length, 8); k++) {
      const p = list[(seed + k) % list.length];
      const img = p.product_images.sort((a, b) => (a.position || 0) - (b.position || 0))[0].url;
      try { // only use sharp photos
        const buf = Buffer.from(await (await fetch(img)).arrayBuffer());
        const dim = sizeOf(buf); if (Math.min(dim.width, dim.height) < 450) continue;
      } catch { continue; }
      const title = p.title.replace(/,\s*(\d+[\w/]*|[SMLX]{1,4})(,\s*[\w/]+)*$/, '').trim(); // drop size lists
      const delivery = p.origin === 'china'
        ? `🌏 Ships from China in about ${p.ship_eta_min_days || 17}–${p.ship_eta_max_days || 24} days.`
        : '🛵 Delivered in Kigali — same day or tomorrow.';
      return { product: p, img, title, delivery, chips: p.origin === 'china' ? ['Ship from China', 'Pay with Mobile Money'] : ['Delivered in Kigali', 'MoMo · Airtel · Cash'] };
    }
  }
  return null;
}

// ---------- build today's posts ----------
async function buildPosts(state) {
  const posts = [];
  for (const app of APPS) {
    if (ONLY && !ONLY.includes(app)) continue;
    if (!DRY && !IG_USERNAMES[app]) continue; // not connected to Instagram yet
    const b = BRANDS[app];
    let post;
    if (app === 'easybuy') {
      const cfg = readJSON('content/easybuy.json');
      let live = null;
      if (DAY % 2 === 0) live = await easybuyProduct(cfg, state.easybuyHistory || []);
      if (live) {
        const cap = pick(cfg.productCaptions, DAY / 2).replace('{title}', live.title).replace('{price}', Number(live.product.price_rwf).toLocaleString('en-US')).replace('{delivery}', live.delivery);
        post = { app, layout: 'product', image: live.img, kicker: pick(cfg.productKickers, DAY / 2), headline: live.title, price: live.product.price_rwf, chips: live.chips, cta: 'Order on EasyBuy', caption: cap, tags: ['#DealOfTheDay'], productId: live.product.id };
      } else {
        post = { app, ...pick(cfg.posts, Math.floor(DAY / 2)) };
      }
    } else {
      post = { app, ...pick(readJSON(`content/${app}.json`), DAY) };
    }
    const tags = [...new Set([...(post.tags || []), ...b.baseTags])].join(' ');
    post.fullCaption = `${post.caption}\n\n${tags}`;
    posts.push(post);
  }
  return posts;
}

async function igPublish(acc, imageUrl, caption) {
  const q = (o) => new URLSearchParams({ ...o, access_token: acc.token });
  let r = await fetch(`${GRAPH}/${acc.user_id}/media`, { method: 'POST', body: q({ image_url: imageUrl, caption }) });
  let j = await r.json();
  if (!j.id) throw new Error('create media: ' + JSON.stringify(j));
  const creation = j.id;
  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    j = await (await fetch(`${GRAPH}/${creation}?fields=status_code,status&access_token=${encodeURIComponent(acc.token)}`)).json();
    if (j.status_code === 'FINISHED') break;
    if (j.status_code === 'ERROR') throw new Error('media processing: ' + JSON.stringify(j));
  }
  r = await fetch(`${GRAPH}/${acc.user_id}/media_publish`, { method: 'POST', body: q({ creation_id: creation }) });
  j = await r.json();
  if (!j.id) throw new Error('publish: ' + JSON.stringify(j));
  const p = await (await fetch(`${GRAPH}/${j.id}?fields=permalink&access_token=${encodeURIComponent(acc.token)}`)).json();
  return { id: j.id, permalink: p.permalink };
}

function git(cmd) { return execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim(); }

(async () => {
  console.log(`📅 ${DATE} (day ${DAY})${DRY ? ' — DRY RUN' : ''}`);
  const state = readJSON('state/state.json', { easybuyHistory: [], log: [] });
  const done = new Set((state.log || []).filter(l => l.date === DATE && l.ok).map(l => l.app));
  const posts = (await buildPosts(state)).filter(p => !done.has(p.app));
  if (!posts.length) { console.log('Everything for today is already posted.'); return; }

  const outDir = path.join(ROOT, 'posts', DATE);
  for (const p of posts) { try { await renderAll([p], outDir); } catch (e) { console.error(`❌ render ${p.app}:`, e.message); p.renderFailed = true; } }
  for (const p of posts) if (!p.renderFailed) fs.writeFileSync(path.join(outDir, `${p.app}.txt`), p.fullCaption);
  console.log(`🎨 rendered ${posts.filter(p => !p.renderFailed).length} images → posts/${DATE}/`);
  if (DRY) return;

  // images must be online before Instagram can fetch them
  if (!NO_GIT) {
    git('git config user.name "2050 Connect autopost" && git config user.email "rw2050connect@gmail.com"');
    git(`git add posts/${DATE} && git commit -m "Posts for ${DATE}" || true`);
    git(`git push origin HEAD:${BRANCH}`);
    await sleep(8000);
  }

  const accounts = await loadAccounts();
  let failures = 0;
  for (const p of posts) {
    if (p.renderFailed) { failures++; continue; }
    const acc = accounts[p.app];
    if (!acc) {
      if (IG_USERNAMES[p.app]) { failures++; console.error(`❌ ${p.app}: could not get a login for @${IG_USERNAMES[p.app]}`); }
      else console.log(`⏭️  ${p.app}: no Instagram account connected yet`);
      continue;
    }
    const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/posts/${DATE}/${p.app}.jpg`;
    try {
      const res = await igPublish(acc, url, p.fullCaption);
      console.log(`✅ ${p.app}: ${res.permalink}`);
      state.log.push({ date: DATE, app: p.app, ok: true, permalink: res.permalink });
      if (p.productId) state.easybuyHistory = [...(state.easybuyHistory || []), p.productId].slice(-120);
    } catch (e) {
      failures++;
      console.error(`❌ ${p.app}: ${e.message}`);
      state.log.push({ date: DATE, app: p.app, ok: false, error: e.message.slice(0, 300) });
    }
  }
  state.log = state.log.slice(-400);
  writeJSON('state/state.json', state);
  saveAccounts(accounts);
  if (!NO_GIT) {
    git('git add state && git commit -m "Update post log" || true');
    git(`git pull --rebase origin ${BRANCH} || true`);
    git(`git push origin HEAD:${BRANCH}`);
  }
  if (failures) { console.error(`${failures} post(s) failed`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
