// queue/*.json 의 carousel·image 글 카드 이미지를 만듦 (1080×1350, 피그마 '카드뉴스_레이어분리' 디자인)
//  - photoFrom(원문 기사 URL)의 대표 이미지(og:image) 또는 photo(이미지 URL)를 위쪽 사진으로 씀. 없으면 브랜드 그래픽
//  - 이미 만든 이미지는 건너뜀. 결과: media/<글id>/01.png ... (원본 사진 파일은 저장소에 올리지 않음)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const b64 = (f, t) => `data:${t};base64,` + fs.readFileSync(f).toString('base64');
const fontUrl = b64(path.join(ROOT, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'), 'font/woff2');
const logo = b64(path.join(ROOT, 'assets/logo-pill.png'), 'image/png');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rich = s => esc(s).replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/==(.+?)==/g, '<mark>$1</mark>');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// 원문 기사에서 대표 이미지 받기
async function getPhoto(it) {
  let url = it.photo;
  if (it.photoFile && fs.existsSync(it.photoFile)) return { src: b64(it.photoFile, 'image/png'), credit: it.photoCredit || 'SHIFT AI' };   // 로컬 시험용
  try {
    if (!url && it.photoFrom) {
      const html = await (await fetch(it.photoFrom, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(20000) })).text();
      const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
      if (m) url = new URL(m[1].replace(/&amp;/g, '&'), it.photoFrom).href;
    }
    if (!url) return null;
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: it.photoFrom || '' }, signal: AbortSignal.timeout(20000) });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 15000) return null;                       // 아이콘·로고 같은 작은 이미지는 제외
    const f = path.join(os.tmpdir(), 'photo-' + it.id); fs.writeFileSync(f, buf);
    return { src: `data:${type.split(';')[0]};base64,` + buf.toString('base64'), credit: it.photoCredit || new URL(it.photoFrom || url).hostname.replace(/^www\./, '') };
  } catch (e) { console.log(`  사진 못 받음(${it.id}): ${e.message}`); return null; }
}

const css = `@font-face{font-family:P;src:url(${fontUrl}) format('woff2');font-weight:100 900}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1350px;font-family:P;background:#0d0d0d;color:#fff;letter-spacing:-0.025em;word-break:keep-all;overflow:hidden;position:relative}
mark{background:none;color:#F7C948}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}
.brand{background:radial-gradient(70% 55% at 20% 20%,#F7C94840,transparent 65%),radial-gradient(70% 60% at 85% 75%,#E0663A45,transparent 65%),linear-gradient(160deg,#2a2722,#0d0d0d)}
.top{position:absolute;top:44px;left:56px;right:56px;display:flex;justify-content:space-between;font-size:24px;font-weight:600;color:rgba(255,255,255,.82)}
.tag{display:inline-block;font-size:26px;font-weight:700;color:#fff;border-left:5px solid #fff;background:rgba(255,255,255,.14);padding:6px 16px 6px 14px;margin-bottom:24px}
.logo{position:absolute;top:44px;left:56px;height:56px}
.pg{position:absolute;bottom:40px;right:56px;font-size:22px;color:#8a8a8a;font-weight:600}
.cr{position:absolute;bottom:40px;left:56px;font-size:20px;color:#7a7a7a;font-weight:500}
.photo{position:absolute;left:0;right:0;top:0;background-size:cover;background-position:center}
.photo:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,13,13,.15) 0%,rgba(13,13,13,0) 35%,rgba(13,13,13,.75) 82%,#0d0d0d 100%)}
.body{position:absolute;left:64px;right:64px}
h2{font-size:76px;font-weight:800;line-height:1.2;margin-bottom:30px}
.hr{height:1px;background:#3a3a3a;margin:0 0 30px}
.li{display:flex;gap:18px;margin-bottom:24px}.li i{flex:none;width:10px;height:10px;border-radius:50%;background:#bdbdbd;margin-top:19px}
.li h3{font-size:36px;font-weight:700;line-height:1.38;color:#fff}.li p{font-size:29px;line-height:1.45;color:#a9a9a9;margin-top:4px;font-weight:500}
.li.plain h3{font-weight:500;color:#dcdcdc;font-size:34px}
.tr{display:grid;grid-template-columns:230px 210px 1fr;gap:0 22px;padding:20px 0;border-bottom:1px solid #2e2e2e}
.tr .a{font-size:33px;font-weight:800}.tr .b{font-size:31px;font-weight:800;color:#F7C948}.tr .c{font-size:27px;line-height:1.42;color:#cfcfcf}
.big{font-size:170px;font-weight:900;line-height:1;margin:6px 0 26px}.big mark{color:#F7C948}
.txt{font-size:35px;line-height:1.6;color:#dcdcdc;font-weight:500}.txt b{color:#fff}
.btn{display:inline-flex;align-items:center;gap:10px;font-size:28px;font-weight:700;background:#fff;color:#111;border-radius:12px;padding:16px 30px;margin-right:16px}`;

function slide(s, i, n, ph) {
  const k = s.kind || 'text';
  const pg = n > 1 ? `<div class=pg>${i} / ${n}</div>` : '';
  const cr = ph ? `<div class=cr>사진: ${esc(ph.credit)}</div>` : '';
  if (k === 'cover') {
    const fs_ = (s.title || '').length > 22 ? 88 : 104;
    return `<div class="bg ${ph ? '' : 'brand'}" ${ph ? `style="background-image:url(${ph.src})"` : ''}></div>
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 42%,rgba(0,0,0,.82) 70%,rgba(0,0,0,.95) 100%)"></div>
<div class=top><span>shift ai magazine</span><span>Don't search. Just Shift.</span></div>
<div class=body style="bottom:200px"><div class=tag>${esc(s.tag || 'AI Issue')}</div>
<div style="font-size:${fs_}px;font-weight:900;line-height:1.14">${rich(s.title)}</div>
${s.sub ? `<div style="font-size:34px;font-weight:500;color:#d6d6d6;margin-top:26px;line-height:1.45">${rich(s.sub)}</div>` : ''}</div>
<img src="${logo}" style="position:absolute;bottom:72px;left:50%;transform:translateX(-50%);height:64px">${cr}`;
  }
  if (k === 'cta') {
    return `<div class="bg ${ph ? '' : 'brand'}" ${ph ? `style="background-image:url(${ph.src});filter:blur(18px) brightness(.45);transform:scale(1.1)"` : ''}></div>
<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(13,13,13,.3),rgba(13,13,13,.92) 70%)"></div>
<img class=logo src="${logo}">
<div class=body style="bottom:150px"><div class=tag>SHIFT AI</div>
<h2 style="font-size:92px;line-height:1.15">${rich(s.title || '오늘의 AI,\n여기까지 SHIFT')}</h2>
<div class=txt style="margin-bottom:44px">${rich(s.body || '매일 꼭 알아야 할 AI 소식과 바로 써먹는 팁을\n카드로 정리해 드려요.')}</div>
<span class=btn>＋ 팔로우</span><span class=btn>↻ 리포스트</span><span class=btn>🔖 저장</span></div>${pg}`;
  }
  const dense = k === 'list' && (s.items || []).some(x => x.d) || k === 'table';
  const ph_h = dense ? 430 : 560;
  let inner = '';
  if (k === 'list') inner = (s.items || []).slice(0, 5).map(x => `<div class="li ${x.d ? '' : 'plain'}"><i></i><div><h3>${rich(x.h)}</h3>${x.d ? `<p>${rich(x.d)}</p>` : ''}</div></div>`).join('');
  else if (k === 'table') inner = (s.rows || []).slice(0, 6).map(r => `<div class=tr><div class=a>${rich(r[0])}</div><div class=b>${rich(r[1])}</div><div class=c>${rich(r[2])}</div></div>`).join('');
  else if (k === 'big') inner = `<div class=big>${rich(s.num)}</div><div class=txt>${rich(s.d)}</div>`;
  else inner = `<div class=txt>${rich(s.body)}</div>`;
  return `<div class="photo ${ph ? '' : 'brand'}" style="height:${ph_h}px;${ph ? `background-image:url(${ph.src})` : ''}"></div>
<img class=logo src="${logo}">
<div class=body id=w style="top:${ph_h - 40}px"><div class=tag>${esc(s.label || 'AI Issue')}</div><h2>${rich(s.title)}</h2><div class=hr></div>${inner}
${s.note ? `<div style="font-size:22px;color:#8a8a8a;margin-top:18px">※ ${esc(s.note)}</div>` : ''}</div>${pg}${cr}`;
}

const items = [];
for (const f of fs.readdirSync(path.join(ROOT, 'queue')).filter(f => f.endsWith('.json'))) {
  try { items.push(...JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', f), 'utf8'))); } catch (e) { console.error(f, e.message); }
}
const only = process.env.ONLY;   // 특정 글만 다시 만들 때
const todo = items.filter(it => (it.type === 'carousel' || it.type === 'image') && it.slides?.length && (only ? it.id === only : Date.parse(it.at) > Date.now() - 864e5 && !fs.existsSync(path.join(ROOT, 'media', it.id, '01.png'))));
console.log(`이미지 만들 글 ${todo.length}개`);
if (!todo.length) process.exit(0);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
for (const it of todo) {
  const ph = await getPhoto(it);
  const slides = it.type === 'carousel' && it.slides.at(-1)?.kind !== 'cta' ? [...it.slides, { kind: 'cta' }] : it.slides.slice(0, it.type === 'image' ? 1 : 20);
  const dir = path.join(ROOT, 'media', it.id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (const [j, s] of slides.entries()) {
    await p.setContent(`<!doctype html><html><head><meta charset=utf-8><style>${css}</style></head><body>${slide(s, j + 1, slides.length, ph)}</body></html>`);
    await p.evaluate(() => document.fonts.ready);
    const over = await p.evaluate(() => { const w = document.getElementById('w'); return w ? w.getBoundingClientRect().bottom : 0; });
    if (over > 1290) console.log(`  ! ${it.id} ${j + 1}장 내용이 넘침 (${Math.round(over)}px) — 글을 줄이세요`);
    await p.screenshot({ path: path.join(dir, String(j + 1).padStart(2, '0') + '.png') });
  }
  console.log(`  ${it.id}: ${slides.length}장 · 사진 ${ph ? ph.credit : '없음(브랜드 그래픽)'}`);
}
await b.close();
