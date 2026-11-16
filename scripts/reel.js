// Turns a post idea (or EasyBuy products) into a 15-second vertical Reel (MP4 with music)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const BRANDS = require('./brands');

const ROOT = path.join(__dirname, '..');
const W = 1080, H = 1920, FPS = 30, DUR = 15;

const uri = (file) => {
  const p = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' }[ext];
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
};
async function remote(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(`image ${r.status}`);
  return `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
}
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hl = (s = '', color) => esc(s).replace(/\[([^\]]+)\]/g, `<span style="color:${color}">$1</span>`);
const plain = (s = '') => String(s).replace(/[\[\]]/g, '');

function css(b) {
  const fonts = [500, 600, 700, 800].map(w => `@font-face{font-family:P;font-weight:${w};src:url(${uri(`fonts/poppins-latin-${w}-normal.woff2`)})}`).join('');
  return `${fonts}*{margin:0;padding:0;box-sizing:border-box}body{width:${W}px;height:${H}px;overflow:hidden;font-family:P,sans-serif;background:${b.dark}}
  .abs{position:absolute}.scene{position:absolute;inset:0}
  .logo{background:${b.logoBg};display:flex;align-items:center;justify-content:center;box-shadow:0 14px 40px rgba(0,0,0,.25)}
  .logo img{width:86%;height:86%;object-fit:contain}
  .pill{display:inline-block;padding:16px 34px;border-radius:999px;background:${b.accent};color:${b.dark};font-weight:700;font-size:38px;letter-spacing:1px;text-transform:uppercase}
  .chip{display:flex;align-items:center;gap:26px;background:rgba(255,255,255,.13);color:#fff;border-radius:34px;padding:30px 36px;font-size:44px;font-weight:600;margin-top:28px;line-height:1.25}
  .dot{flex:none;width:72px;height:72px;border-radius:50%;background:${b.accent};color:${b.dark};display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:800}
  .cta{background:${b.accent};color:${b.dark};border-radius:40px;padding:38px 20px;text-align:center;font-weight:800;font-size:56px;box-shadow:0 18px 50px rgba(0,0,0,.3)}
  .card{position:absolute;left:90px;right:90px;top:430px;height:900px;background:#fff;border-radius:60px;box-shadow:0 30px 80px rgba(0,0,0,.35);overflow:hidden;display:flex;align-items:center;justify-content:center}
  .card img{max-width:84%;max-height:84%;object-fit:contain}
  .price{position:absolute;right:70px;top:1250px;background:${b.accent};color:${b.dark};font-weight:800;font-size:84px;padding:22px 44px;border-radius:36px;box-shadow:0 16px 40px rgba(0,0,0,.3)}
  .price small{font-size:44px;font-weight:700}`;
}

const ANIM = `
const $=id=>document.getElementById(id);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=x=>1-Math.pow(1-clamp(x),3);
const back=x=>{x=clamp(x);const c=1.7;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const prog=(t,a,d)=>clamp((t-a)/d);
function set(el,o,tx=0,ty=0,s=1){if(!el)return;el.style.opacity=o;el.style.transform='translate('+tx+'px,'+ty+'px) scale('+s+')'}
function drift(t){const a=$('b1'),b=$('b2');if(a)a.style.transform='translate('+(-40*Math.sin(t/3))+'px,'+(30*Math.cos(t/4))+'px)';if(b)b.style.transform='translate('+(30*Math.cos(t/3))+'px,'+(-30*Math.sin(t/5))+'px)';}`;

function shell(b, inner, script, bgPhoto) {
  const bg = bgPhoto
    ? `<div id="photo" class="abs" style="inset:-60px;background:url(${bgPhoto}) center/cover"></div><div class="abs" style="inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,.35) 40%,rgba(0,0,0,.8) 100%)"></div>`
    : `<div class="abs" style="inset:0;background:linear-gradient(170deg,${b.primary} 0%,${b.dark} 100%)"></div>
       <div id="b1" class="abs" style="width:760px;height:760px;border-radius:50%;right:-260px;top:-200px;background:${b.accent};opacity:.18"></div>
       <div id="b2" class="abs" style="width:560px;height:560px;border-radius:50%;left:-200px;bottom:-160px;background:${b.accent2};opacity:.16"></div>`;
  const top = `<div id="top" class="abs" style="left:90px;top:110px;display:flex;align-items:center;gap:28px">
    <div class="logo" style="width:110px;height:110px;border-radius:30px"><img src="${uri(b.logo)}"></div>
    <div style="color:#fff;font-weight:700;font-size:46px">${esc(b.name)}</div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css(b)}</style></head><body>${bg}${top}${inner}<script>${ANIM}${script};render(0)</script></body></html>`;
}

function outro(b, cta, follow) {
  return `<div id="outro" class="scene">
    <div id="oLogo" class="abs logo" style="left:440px;top:560px;width:200px;height:200px;border-radius:52px"><img src="${uri(b.logo)}"></div>
    <div id="oName" class="abs" style="left:60px;right:60px;top:810px;text-align:center;color:#fff;font-weight:800;font-size:84px;letter-spacing:-2px">${esc(b.name)}</div>
    <div id="cta" class="abs cta" style="left:90px;right:90px;top:1000px">${esc(cta)}</div>
    <div id="oSub" class="abs" style="left:0;right:0;top:1180px;text-align:center;color:#fff;opacity:.85;font-size:42px;font-weight:600">${esc(follow)}</div></div>`;
}
const OUTRO_JS = (start) => `
  const o=t-${start}; $('outro').style.opacity=o>=0?1:0;
  set($('oLogo'),ease(prog(o,0,0.4)),0,0,back(prog(o,0,0.55)));
  set($('oName'),ease(prog(o,0.3,0.4)),0,40*(1-ease(prog(o,0.3,0.4))));
  set($('cta'),ease(prog(o,0.7,0.3)),0,0,back(prog(o,0.7,0.5))*(1+0.03*Math.sin(Math.max(0,o-1.3)*6)));
  set($('oSub'),ease(prog(o,1.1,0.4)));`;

// Generic reel: kicker + headline, then points (or sub), then outro
function ideaReel(b, p, photo) {
  let pts = (p.points && p.points.length ? p.points : []).slice(0, 4);
  if (pts.length < 2) { // use the key sentences of the caption
    const body = String(p.caption || '').split('\n\n')[0].replace(/[\u{1F300}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '').trim();
    const sents = body.split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(x => x.length > 12 && x.length < 110);
    const words = (x) => new Set(x.toLowerCase().match(/[a-z0-9]+/g) || []);
    pts = [];
    for (const x of [p.sub, ...sents].filter(Boolean)) { // skip sentences that repeat an earlier point
      const w = words(x); const same = pts.some(y => { const v = words(y); let n = 0; w.forEach(t => v.has(t) && n++); return n / Math.min(w.size, v.size) > 0.5; });
      if (!same) pts.push(x);
      if (pts.length === 3) break;
    }
  }
  const hlen = plain(p.headline).length;
  const hsize = hlen > 44 ? 92 : hlen > 30 ? 104 : 116;
  const follow = b.handle ? `Follow ${b.handle} for more` : `${b.site} · link in bio`;
  const inner = `
  <div id="s1" class="scene">
    <div id="kick" class="abs" style="left:90px;top:560px"><span class="pill">${esc(p.kicker)}</span></div>
    <div id="head" class="abs" style="left:90px;right:90px;top:680px;color:#fff;font-weight:800;font-size:${hsize}px;line-height:1.04;letter-spacing:-3px">${hl(p.headline, b.accent)}</div>
  </div>
  <div id="s2" class="scene">
    <div id="h2" class="abs" style="left:90px;right:90px;top:330px;color:#fff;font-weight:800;font-size:${Math.round(hsize * 0.66)}px;line-height:1.08;letter-spacing:-2px">${hl(p.headline, b.accent)}</div>
    <div class="abs" style="left:90px;right:90px;top:${hsize > 100 ? 720 : 760}px">${pts.map((t, i) => `<div id="pt${i}" class="chip"><span class="dot">${pts.length > 1 ? i + 1 : '✓'}</span><span>${hl(t, b.accent)}</span></div>`).join('')}</div>
  </div>${outro(b, p.cta || 'Learn more', follow)}`;
  const n = pts.length;
  const script = `window.render=function(t){drift(t);
    const ph=$('photo'); if(ph) ph.style.transform='scale('+(1+0.08*t/15)+')';
    $('top').style.opacity=ease(prog(t,0,0.4));
    const s1o=1-prog(t,3.6,0.35); $('s1').style.opacity=s1o;
    set($('kick'),ease(prog(t,0.2,0.4)),0,40*(1-ease(prog(t,0.2,0.4))));
    set($('head'),ease(prog(t,0.5,0.6)),0,80*(1-ease(prog(t,0.5,0.6))));
    const s2=t-3.8; $('s2').style.opacity=(s2>=0?1:0)*(1-prog(t,11.4,0.35));
    set($('h2'),ease(prog(s2,0,0.4)),0,40*(1-ease(prog(s2,0,0.4))));
    for(let i=0;i<${n};i++){const a=0.5+i*${n > 2 ? 1.6 : 2.2};set($('pt'+i),ease(prog(s2,a,0.45)),-90*(1-ease(prog(s2,a,0.45))));}
    ${OUTRO_JS(11.6)}
  }`;
  return shell(b, inner, script, photo);
}

// EasyBuy reel: 3 live products then delivery promise
function productReel(b, products, alt) {
  const inner = `
  <div id="intro" class="scene">
    <div id="iLogo" class="abs logo" style="left:465px;top:640px;width:150px;height:150px;border-radius:38px"><img src="${uri(b.logo)}"></div>
    <div id="iKick" class="abs" style="left:0;right:0;top:860px;text-align:center"><span class="pill">${alt ? 'Hot right now' : "Today's picks"}</span></div>
    <div id="iHead" class="abs" style="left:80px;right:80px;top:990px;text-align:center;color:#fff;font-weight:800;font-size:116px;line-height:1.02;letter-spacing:-3px">${alt ? 'Fresh deals.<br><span style="color:' + b.accent + '">Fast delivery.</span>' : 'Shop it.<br><span style="color:' + b.accent + '">Get it today.</span>'}</div>
    <div id="iSub" class="abs" style="left:80px;right:80px;top:1290px;text-align:center;color:#fff;opacity:.85;font-size:46px;font-weight:500">${products.length} deals delivered in Kigali</div>
  </div>
  <div id="prod" class="scene">
    <div id="count" class="abs" style="left:90px;top:300px;color:#fff;font-weight:600;font-size:40px;opacity:.85"></div>
    <div id="card" class="card"><img id="pimg"></div>
    <div id="price" class="price"></div>
    <div id="pname" class="abs" style="left:90px;right:90px;top:1440px;color:#fff;font-weight:700;font-size:58px;line-height:1.15;letter-spacing:-1px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden"></div>
  </div>
  <div id="outro" class="scene">
    <div id="oHead" class="abs" style="left:90px;right:90px;top:430px;color:#fff;font-weight:800;font-size:100px;line-height:1.04;letter-spacing:-3px">Ordered now.<br><span style="color:${b.accent}">At your door<br>in 90 minutes.</span></div>
    <div class="abs" style="left:90px;right:90px;top:900px">
      <div id="c1" class="chip"><span class="dot">✓</span>Same-day delivery in Kigali</div>
      <div id="c2" class="chip"><span class="dot">✓</span>Pay with MoMo, Airtel or cash</div>
      <div id="c3" class="chip"><span class="dot">✓</span>Thousands of products</div></div>
    <div id="cta" class="abs cta" style="left:90px;right:90px;top:1480px">Order on easybuyrw.com</div>
    <div id="oSub" class="abs" style="left:0;right:0;top:1660px;text-align:center;color:#fff;opacity:.8;font-size:40px;font-weight:500">Link in bio · EasyBuy Africa app</div>
  </div>`;
  const P = JSON.stringify(products.map(p => ({ img: p.img, price: Number(p.price).toLocaleString('en-US'), name: p.name })));
  const script = `const P=${P};window.render=function(t){drift(t);
    $('intro').style.opacity=1-prog(t,2.3,0.35);
    set($('iLogo'),ease(prog(t,0.1,0.4)),0,0,back(prog(t,0.1,0.55)));
    set($('iKick'),ease(prog(t,0.5,0.4)),0,40*(1-ease(prog(t,0.5,0.4))));
    set($('iHead'),ease(prog(t,0.75,0.5)),0,70*(1-ease(prog(t,0.75,0.5))));
    set($('iSub'),ease(prog(t,1.2,0.5)),0,40*(1-ease(prog(t,1.2,0.5))));
    $('top').style.opacity=ease(prog(t,2.4,0.4));
    const n=P.length, pStart=2.5, dur=9/n, k=Math.floor((t-pStart)/dur), inProd=t>=pStart&&t<pStart+n*dur;
    $('prod').style.opacity=inProd?1:0;
    if(inProd){const lt=t-pStart-k*dur,p=P[k];
      if($('pimg').getAttribute('src')!==p.img)$('pimg').setAttribute('src',p.img);
      $('price').innerHTML=p.price+' <small>RWF</small>';$('pname').textContent=p.name;$('count').textContent=(k+1)+' / '+n;
      const inn=ease(prog(lt,0,0.45)),out=prog(lt,dur-0.3,0.3);
      set($('card'),inn*(1-out),-220*out,160*(1-inn),0.92+0.08*inn);
      $('pimg').style.transform='scale('+(1+0.10*clamp(lt/dur))+')';
      set($('price'),ease(prog(lt,0.45,0.3))*(1-out),-220*out,0,back(prog(lt,0.45,0.45)));
      set($('pname'),ease(prog(lt,0.6,0.4))*(1-out),-220*out,40*(1-ease(prog(lt,0.6,0.4))));
      set($('count'),1-(k===n-1?out:0));}
    const o=t-11.5;$('outro').style.opacity=o>=0?1:0;
    set($('oHead'),ease(prog(o,0,0.5)),0,70*(1-ease(prog(o,0,0.5))));
    ['c1','c2','c3'].forEach((id,i)=>set($(id),ease(prog(o,0.5+i*0.25,0.4)),-80*(1-ease(prog(o,0.5+i*0.25,0.4)))));
    set($('cta'),ease(prog(o,1.4,0.3)),0,0,back(prog(o,1.4,0.5))*(1+0.03*Math.sin(Math.max(0,o-2)*6)));
    set($('oSub'),ease(prog(o,1.8,0.4)));}`;
  return shell(b, inner, script);
}

async function makeReel(post, outFile, musicFile) {
  const b = BRANDS[post.app];
  let html;
  if (post.reelProducts) {
    const prods = [];
    for (const p of post.reelProducts) prods.push({ ...p, img: await remote(p.image) });
    html = productReel(b, prods, post.app === 'easybuy2');
  } else {
    let photo = null;
    if (post.photo) {
      const local = path.join(ROOT, post.photo);
      photo = fs.existsSync(local) ? uri(post.photo) : await remote(`https://joinfindme.com/gallery/${path.basename(post.photo, '.jpg')}-800.jpg`);
    }
    html = ideaReel(b, post, photo);
  }
  const tmp = fs.mkdtempSync('/tmp/reel-');
  fs.writeFileSync(path.join(tmp, 'reel.html'), html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto('file://' + path.join(tmp, 'reel.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  for (let i = 0; i < DUR * FPS; i++) {
    await page.evaluate(t => window.render(t), i / FPS);
    await page.screenshot({ path: path.join(tmp, `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 88 });
  }
  await browser.close();
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(tmp, 'f%04d.jpg'), '-i', musicFile,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-shortest', '-movflags', '+faststart', outFile]);
  fs.rmSync(tmp, { recursive: true, force: true });
  return outFile;
}

module.exports = { makeReel };
