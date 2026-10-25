// queue/*.json 의 carousel·image 글 카드 이미지를 만듦 (1080×1350)
// 디자인: 피그마 '클로드 카드뉴스 자동화' 템플릿 (#카드1_표지 · #카드2~4 사진+본문 · 엔드카드)
//  - photoFrom(원문 기사 URL)의 대표 이미지(og:image) 또는 photo(이미지 URL)를 사진으로 씀. 없으면 브랜드 그래픽
//  - 이미 만든 이미지는 건너뜀. 결과: media/<글id>/01.png ... (원본 사진 파일은 저장소에 올리지 않음)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const b64 = (f, t) => `data:${t};base64,` + fs.readFileSync(f).toString('base64');
const fontUrl = b64(path.join(ROOT, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2'), 'font/woff2');
const logo = b64(path.join(ROOT, 'assets/logo-pill.png'), 'image/png');
const badge = b64(path.join(ROOT, 'assets/logo-badge.png'), 'image/png');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rich = s => esc(s).replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/==(.+?)==/g, '<mark>$1</mark>');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// ── 사진 가져오기 (기사 사진만, 출처 표기) ──
//  photoFrom: 같은 소식을 다룬 기사 URL 2~3개(배열). 각 기사의 대표 이미지(og:image)와 본문 속 큰 사진을 모아
//  표지에는 첫 사진, 내용 장에는 다른 사진을 차례로 씀. 카드 아래 "사진: 매체" 표기. 다 실패하면 표지 사진 재사용
const why = (id, m) => console.log(`  사진 실패(${id}): ${m}`);
const H = { 'User-Agent': 'Mozilla/5.0 (compatible; SHIFT-AI-cards/1.0; +https://github.com/shiftaimagazine/shift-threads)', 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8' };
async function download(url, referer, id) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': H['User-Agent'], Referer: referer || '', Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const type = (r.headers.get('content-type') || '').split(';')[0];
    if (!r.ok) return why(id, `${r.status} ${url}`), null;
    if (!type.startsWith('image/') || type.includes('svg') || type.includes('gif')) return why(id, `이미지 아님(${type}) ${url}`), null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 30000) return null;                              // 아이콘·로고·썸네일 제외
    return `data:${type};base64,` + buf.toString('base64');
  } catch (e) { return why(id, `${e.message} ${url}`), null; }
}
const BAD = /(logo|icon|avatar|sprite|favicon|badge|emoji|placeholder|blank|pixel|tracking|ads?[\/_-]|banner-ad|author|profile|gravatar|1x1|spacer)/i;
async function articleImages(page, id) {
  try {
    const r = await fetch(page, { headers: { ...H, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) return why(id, `기사 ${r.status} ${page}`), [];
    const html = await r.text();
    const abs = u => { try { return new URL(u.replace(/&amp;/g, '&').replace(/\\\//g, '/'), r.url || page).href; } catch { return null; } };
    const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(m => m[0]);
    const attr = (tag, n) => (tag.match(new RegExp(`\\b${n}\\s*=\\s*["']([^"']+)["']`, 'i')) || [])[1];
    const out = [];
    for (const key of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
      const t = metas.find(m => (attr(m, 'property') || attr(m, 'name') || '').toLowerCase() === key);
      if (t && attr(t, 'content')) { out.push(abs(attr(t, 'content'))); break; }
    }
    // 본문 속 사진만 (사이드바·관련 기사 목록 사진 제외): <article> 또는 본문 영역 안의 <img>
    const pick = re => { const m = html.match(re); return m ? m[1] : null; };
    let body = pick(/<article\b[^>]*>([\s\S]*?)<\/article>/i)
      || pick(/<div[^>]+(?:itemprop=["']articleBody["']|class=["'][^"']*(?:entry-content|article-body|article__body|articleBody|post-content|story-body|news_body|article_body|article-content|content-body)[^"']*["'])[^>]*>([\s\S]*?)<\/(?:div|section)>\s*<(?:footer|aside|section|div[^>]+(?:related|comment|share))/i) || '';
    body = body.split(/<(?:aside|footer)\b|class=["'][^"']*(?:related|recommend|popular|more-stories|trending)[^"']*["']/i)[0];
    for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0], w = +(attr(tag, 'width') || 0);
      if (w && w < 500) continue;
      let u = null;
      const ss = attr(tag, 'srcset') || attr(tag, 'data-srcset');
      if (ss) u = ss.split(',').map(x => x.trim().split(/\s+/)).sort((a, b) => parseInt(b[1] || 0) - parseInt(a[1] || 0))[0]?.[0];
      u = u || attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'src');
      if (!u || u.startsWith('data:') || BAD.test(u) || BAD.test(attr(tag, 'alt') || '') || /\.(svg|gif)(\?|$)/i.test(u)) continue;
      out.push(abs(u));
    }
    const credit = new URL(page).hostname.replace(/^www\./, '');
    return [...new Set(out.filter(Boolean))].slice(0, 8).map(url => ({ url, page, credit }));
  } catch (e) { return why(id, `${e.message} ${page}`), []; }
}
async function getPhotos(it) {
  if (it.photoFile && fs.existsSync(it.photoFile)) return [{ src: b64(it.photoFile, 'image/png'), credit: it.photoCredit || 'SHIFT AI' }];   // 로컬 시험용
  const cands = [];
  if (it.photo) cands.push({ url: it.photo, page: [].concat(it.photoFrom || [])[0] || '', credit: it.photoCredit || new URL(it.photo).hostname.replace(/^www\./, '') });
  const pages = [].concat(it.photoFrom || []);
  const lists = await Promise.all(pages.map(pg => articleImages(pg, it.id)));
  // 기사별 대표 이미지를 먼저, 그다음 본문 사진을 번갈아 (한 기사 사진만 몰리지 않게)
  for (let k = 0; k < 8; k++) for (const l of lists) if (l[k]) cands.push(l[k]);
  const photos = [], seen = new Set();
  for (const c of cands) {
    if (photos.length >= 6 || seen.has(c.url)) continue; seen.add(c.url);
    const src = await download(c.url, c.page, it.id);
    if (src) photos.push({ src, credit: it.photoCredit || c.credit });
  }
  if (!photos.length) why(it.id, '기사 사진을 하나도 못 받음(사이트가 막았거나 사진 없음) → 브랜드 그래픽. photoFrom 에 다른 언론 기사를 넣어 주세요');
  return photos;
}

// 템플릿 값 (피그마에서 읽은 그대로)
const C = { cream: '#eff0e8', creamEnd: '#efefe5', ink: '#10110f', line: '#caccc1', circle: '#e4e4d8' };
const css = `@font-face{font-family:P;src:url(${fontUrl}) format('woff2');font-weight:100 900}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1350px;font-family:P;letter-spacing:-0.02em;word-break:keep-all;overflow:hidden;position:relative;background:${C.cream};color:${C.ink}}
mark{background:none;color:#E0663A}
.brand{background:radial-gradient(60% 50% at 25% 30%,#F7C94866,transparent 70%),radial-gradient(60% 55% at 80% 70%,#E0663A66,transparent 70%),linear-gradient(160deg,#2b2620,#121212)}
/* 표지 */
.cv-photo{position:absolute;inset:0;background-size:cover;background-position:center}
.cv-grad{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,.1) 55%,rgba(0,0,0,.92) 100%)}
.cv-logo{position:absolute;top:28px;left:50%;transform:translateX(-50%);height:62px}
.cv-text{position:absolute;left:42px;right:48px;bottom:172px;color:#fff}
.cat{position:relative;display:inline-block;margin:0 0 6px 19px;padding:3px 34px 3px 15px;font-size:60px;font-weight:700;line-height:72px;letter-spacing:.01em}
.cat:before{content:'';position:absolute;left:0;top:0;width:230px;max-width:calc(100% - 38px);height:31px;border-top:1px solid #fff;border-left:1px solid #fff}
.cat:after{content:'';position:absolute;right:0;bottom:0;width:230px;max-width:calc(100% - 38px);height:31px;border-bottom:1px solid #fff;border-right:1px solid #fff}
.cat i{position:absolute;width:38px;height:1px;background:#fff}
.cv-t1{font-size:85px;font-weight:800;line-height:90px;letter-spacing:-0.03em}
.cv-t2{font-size:48px;font-weight:700;line-height:90px}
.foot{position:absolute;bottom:23px;left:32px;right:30px;display:flex;justify-content:space-between;font-size:24px;line-height:42px;color:#fff;letter-spacing:-0.75px}
/* 본문 카드 */
.card{display:flex;flex-direction:column;height:1350px}
.ph{flex:1 1 auto;min-height:470px;position:relative;background:#f2eeee center/cover no-repeat}
.ph .cr{position:absolute;right:20px;bottom:14px;font-size:18px;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.6);opacity:.9}
.ph .lg{position:absolute;top:28px;left:32px;height:50px}
.gap{flex:none;height:24px}
.tx{flex:none;background:${C.cream};border-radius:64px 64px 0 0;padding:28px 72px 40px;display:flex;flex-direction:column;gap:16px}
.lab{display:flex;align-items:center;gap:16px;font-size:20px;font-weight:700;white-space:nowrap}.lab:after{content:'';flex:1;height:2px;background:${C.line}}
.h{font-size:45px;font-weight:700;line-height:1.3}
.bd{font-size:30px;font-weight:300;line-height:1.3;margin-top:39px}
.bd b{font-weight:600}
.bd p{margin:0}
.it{display:flex;gap:14px}.it:before{content:'·';font-weight:700}
.row{display:grid;grid-template-columns:200px 190px 1fr;gap:0 20px;padding:8px 0;border-bottom:1px solid ${C.line}}
.row div:first-child{font-weight:700}.row div:nth-child(2){font-weight:600}
.num{font-size:120px;font-weight:800;line-height:1;margin-top:20px}.num mark{color:#E0663A}
/* 엔드카드 */
.end{background:${C.creamEnd}}
.circ{position:absolute;border-radius:50%;background:${C.circle}}
.end-badge{position:absolute;top:340px;left:50%;transform:translateX(-50%);width:360px;filter:drop-shadow(0 18px 24px rgba(0,0,0,.18))}
.end-msg{position:absolute;top:771px;left:72px;right:72px;text-align:center;font-size:44px;font-weight:800;line-height:1.2;color:#111}
.end-cta{position:absolute;top:950px;left:50%;transform:translateX(-50%);background:#111;color:${C.creamEnd};border-radius:999px;padding:24px 56px;font-size:24px;font-weight:700;white-space:nowrap;box-shadow:0 8px 12px rgba(0,0,0,.1)}`;

function slide(s, ph) {
  const k = s.kind || 'text';
  const bg = ph ? `style="background-image:url(${ph.src})"` : `style="background:radial-gradient(60% 50% at 25% 30%,#F7C94866,transparent 70%),radial-gradient(60% 55% at 80% 70%,#E0663A66,transparent 70%),linear-gradient(160deg,#2b2620,#121212)"`;
  if (k === 'cover') {
    const lines = String(s.title || '').split('\n');
    const t1 = s.sub ? lines.join('\n') : lines[0], sub = s.sub || lines.slice(1).join(' ');
    const longest = Math.max(...t1.split('\n').map(l => [...l.replace(/==/g, '')].length));
    const fs1 = longest > 15 ? Math.max(64, Math.floor(85 * 15 / longest)) : 85;
    return `<div class="cv-photo ${ph ? '' : 'brand'}" ${bg}></div><div class=cv-grad></div>
<img class=cv-logo src="${logo}">
<div class=cv-text id=w><div class=cat>${esc(s.tag || 'AI Issue')}</div>
<div class=cv-t1 style="font-size:${fs1}px">${rich(t1)}</div>${sub ? `<div class=cv-t2>${rich(sub)}</div>` : ''}</div>
<div class=foot><span>@shift_ai_magazine</span><span>Don't search. Just Shift.</span></div>`;
  }
  if (k === 'cta') {
    return `<div class="end" style="position:absolute;inset:0"><div class=circ style="left:-120px;top:-120px;width:480px;height:480px"></div><div class=circ style="left:780px;top:964px;width:320px;height:320px"></div>
<img class=end-badge src="${badge}"><div class=end-msg>${rich(s.title || 'AI 인사이트,\n가장 먼저 받아보세요')}</div>
<div class=end-cta>${esc(s.button || '팔로우하고 계속 보기')}</div></div>`;
  }
  let inner = '';
  if (k === 'list') inner = (s.items || []).slice(0, 5).map(x => `<p class=it><span>${x.d ? `<b>${rich(x.h)}</b> ${rich(x.d)}` : rich(x.h)}</span></p>`).join('');
  else if (k === 'table') inner = (s.rows || []).slice(0, 5).map(r => `<div class=row><div>${rich(r[0])}</div><div>${rich(r[1])}</div><div>${rich(r[2])}</div></div>`).join('') + (s.note ? `<p style="font-size:20px;margin-top:10px;color:#6b6c64">※ ${esc(s.note)}</p>` : '');
  else if (k === 'big') inner = `<div class=num>${rich(s.num)}</div><p style="margin-top:16px">${rich(s.d)}</p>`;
  else inner = String(s.body || '').split('\n').map(l => `<p>${rich(l)}</p>`).join('');
  return `<div class=card><div class="ph ${ph ? '' : 'brand'}" ${bg}>${ph ? `<div class=cr>사진: ${esc(ph.credit)}</div>` : `<img class=lg src="${logo}">`}</div><div class=gap></div>
<div class=tx id=w><div class=lab>${esc(s.label ? `SHIFT AI · ${s.label}` : 'SHIFT AI Issue')}</div><div class=h>${rich(s.title)}</div><div class=bd style="${k === 'big' ? 'margin-top:0' : ''}">${inner}</div></div></div>`;
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
  const photos = await getPhotos(it), ph = photos[0] || null;
  const slides = it.type === 'carousel' && it.slides.at(-1)?.kind !== 'cta' ? [...it.slides, { kind: 'cta' }] : it.slides.slice(0, it.type === 'image' ? 1 : 20);
  const dir = path.join(ROOT, 'media', it.id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  for (const [j, s] of slides.entries()) {
    const sp = j > 0 && photos.length > 1 ? photos[1 + (j - 1) % (photos.length - 1)] : ph;   // 내용 장은 표지와 다른 사진부터
    await p.setContent(`<!doctype html><html><head><meta charset=utf-8><style>${css}</style></head><body>${slide(s, sp)}</body></html>`);
    await p.evaluate(() => document.fonts.ready);
    const bad = await p.evaluate(() => { const ph = document.querySelector('.ph'); const w = document.getElementById('w'); return (ph && ph.getBoundingClientRect().height < 471) || (w && w.getBoundingClientRect().top < 100); });
    if (bad) console.log(`  ! ${it.id} ${j + 1}장 글이 많아 사진이 너무 작음 — 글을 줄이세요`);
    await p.screenshot({ path: path.join(dir, String(j + 1).padStart(2, '0') + '.png') });
  }
  console.log(`  ${it.id}: ${slides.length}장 · 사진 ${photos.length}장 (${[...new Set(photos.map(x => x.credit))].join(', ') || '없음'})`);
}
await b.close();
