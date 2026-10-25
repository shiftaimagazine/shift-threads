// queue/*.json 의 carousel·image 글에 들어갈 카드 이미지를 만듦 (1080×1350, SHIFT 카드뉴스 디자인)
// 이미 만든 이미지는 건너뜀. 결과: media/<글id>/01.png ...
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const font = path.join(ROOT, 'node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'assets/logo-pill.png')).toString('base64');
const fontUrl = 'data:font/woff2;base64,' + fs.readFileSync(font).toString('base64');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const br = s => esc(s).replace(/\n/g, '<br>');
// **굵게** 와 ==노란 강조== 지원
const rich = s => br(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/==(.+?)==/g, '<mark>$1</mark>');

const css = `@font-face{font-family:P;src:url(${fontUrl}) format('woff2');font-weight:100 900}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1350px;font-family:P;color:#161514;background:#EDECE6;letter-spacing:-0.02em;word-break:keep-all;overflow:hidden;position:relative}
.dark{background:#121212;color:#fff}
.hd{position:absolute;top:56px;left:72px;right:72px;display:flex;justify-content:space-between;align-items:center}
.hd img{height:54px}.pg{font-size:24px;font-weight:600;color:#8a8984}
.lab{font-size:28px;font-weight:700;padding-bottom:16px;border-bottom:2px solid #c9c8c2;margin-bottom:30px}
.wrap{position:absolute;top:160px;left:72px;right:72px}
h2{font-size:66px;font-weight:800;line-height:1.22;margin-bottom:40px}
mark{background:linear-gradient(transparent 58%,#F7C948 58%);color:inherit}
.dark mark{background:none;color:#F7C948}
.ft{position:absolute;bottom:48px;left:72px;right:72px;display:flex;justify-content:space-between;font-size:22px;color:#8a8984;font-weight:600}
.li{display:flex;gap:26px;padding:28px 0;border-bottom:1px solid #d3d2cc}
.li .n{flex:none;width:58px;height:58px;border-radius:50%;background:#161514;color:#F7C948;font-size:30px;font-weight:800;display:flex;align-items:center;justify-content:center}
.li h3{font-size:38px;font-weight:800;line-height:1.3}.li p{font-size:29px;line-height:1.45;color:#3b3a36;margin-top:8px;font-weight:500}
.tr{display:grid;grid-template-columns:240px 230px 1fr;gap:0 24px;padding:28px 0;border-bottom:1px solid #d3d2cc;align-items:start}
.tr .a{font-size:36px;font-weight:800}.tr .b{font-size:34px;font-weight:800}.tr .c{font-size:28px;line-height:1.42;font-weight:500;color:#2b2a27}
.big{font-size:200px;font-weight:900;line-height:1;color:#161514;margin:20px 0 30px}
.big mark{background:none}
.body{font-size:36px;line-height:1.6;font-weight:500;color:#2b2a27}
.box{background:#fff;border-radius:24px;padding:40px;margin-top:10px}`;
const head = (i, n, dark) => `<div class=hd><img src="${logo}"><div class=pg ${dark ? 'style="color:#aaa"' : ''}>${n > 1 ? `${i} / ${n}` : 'SHIFT AI'}</div></div>`;
const foot = dark => `<div class=ft ${dark ? 'style="color:#9a9a9a"' : ''}><span>@shift_ai_magazine</span><span>Don't search. Just Shift.</span></div>`;

function slideHtml(s, i, n) {
  const k = s.kind || 'text';
  if (k === 'cover') return { dark: true, html: `<div style="position:absolute;inset:0;background:radial-gradient(90% 55% at 15% 25%,#F7C94826,transparent 60%),radial-gradient(80% 60% at 90% 90%,#E0663A30,transparent 60%),#121212"></div>${head(i, n, 1)}
<div style="position:absolute;left:72px;right:72px;top:250px">${s.tag ? `<div style="display:inline-block;font-size:28px;font-weight:800;color:#121212;background:#F7C948;border-radius:999px;padding:8px 22px;margin-bottom:40px">${esc(s.tag)}</div>` : ''}
<div style="font-size:${s.title && s.title.length > 30 ? 82 : 98}px;font-weight:900;line-height:1.17">${rich(s.title)}</div>
${s.sub ? `<div style="font-size:36px;font-weight:500;color:#cfcfcf;margin-top:44px;line-height:1.5">${rich(s.sub)}</div>` : ''}
${n > 1 ? `<div style="font-size:30px;font-weight:700;color:#F7C948;margin-top:56px">넘겨서 보기 →</div>` : ''}</div>${foot(1)}` };
  if (k === 'cta') return { dark: true, html: `<div style="position:absolute;inset:0;background:radial-gradient(80% 50% at 50% 30%,#F7C94833,transparent 70%),#121212"></div>${head(i, n, 1)}
<div style="position:absolute;left:72px;right:72px;top:300px"><div style="font-size:32px;font-weight:700;color:#F7C948">SHIFT AI 매거진</div>
<div style="font-size:84px;font-weight:900;line-height:1.2;margin-top:20px">AI 소식,<br>검색하지 말고<br><span style="color:#F7C948">SHIFT</span> 하세요</div>
<div style="font-size:36px;font-weight:600;color:#ddd;margin-top:60px;line-height:1.6">매일 꼭 알아야 할 AI만 골라 드려요.<br>${esc(s.ask || '도움 됐다면 저장하고 팔로우 →')}</div></div>${foot(1)}` };
  const lab = `<div class=lab>SHIFT AI · ${esc(s.label || 'AI Issue')}</div>`;
  let inner = '';
  if (k === 'list') inner = (s.items || []).slice(0, 5).map((x, j) => `<div class=li><div class=n>${j + 1}</div><div><h3>${rich(x.h)}</h3>${x.d ? `<p>${rich(x.d)}</p>` : ''}</div></div>`).join('');
  else if (k === 'table') inner = (s.rows || []).slice(0, 6).map(r => `<div class=tr><div class=a>${rich(r[0])}</div><div class=b>${rich(r[1])}</div><div class=c>${rich(r[2])}</div></div>`).join('');
  else if (k === 'big') inner = `<div class=big>${rich(s.num)}</div><div class=body>${rich(s.d)}</div>`;
  else inner = `<div class=body>${rich(s.body)}</div>`;
  return { dark: false, html: `${head(i, n)}<div class=wrap>${lab}<h2>${rich(s.title)}</h2>${inner}${s.note ? `<div style="font-size:23px;color:#8a8984;margin-top:26px;line-height:1.45">※ ${esc(s.note)}</div>` : ''}</div>${foot()}` };
}

const items = [];
for (const f of fs.readdirSync(path.join(ROOT, 'queue')).filter(f => f.endsWith('.json'))) {
  try { items.push(...JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', f), 'utf8'))); } catch (e) { console.error(f, e.message); }
}
const todo = items.filter(it => (it.type === 'carousel' || it.type === 'image') && it.slides?.length && Date.parse(it.at) > Date.now() - 864e5
  && !fs.existsSync(path.join(ROOT, 'media', it.id, '01.png')));
console.log(`이미지 만들 글 ${todo.length}개`);
if (!todo.length) process.exit(0);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
for (const it of todo) {
  const slides = it.type === 'carousel' && it.slides.at(-1)?.kind !== 'cta' ? [...it.slides, { kind: 'cta' }] : it.slides.slice(0, it.type === 'image' ? 1 : 20);
  const dir = path.join(ROOT, 'media', it.id); fs.mkdirSync(dir, { recursive: true });
  for (const [j, s] of slides.entries()) {
    const { dark, html } = slideHtml(s, j + 1, slides.length);
    await p.setContent(`<!doctype html><html><head><meta charset=utf-8><style>${css}</style></head><body class="${dark ? 'dark' : ''}">${html}</body></html>`);
    await p.evaluate(() => document.fonts.ready);
    const over = await p.evaluate(() => { const w = document.querySelector('.wrap'); return w ? w.getBoundingClientRect().bottom : 0; });
    if (over > 1275) console.log(`  ! ${it.id} ${j + 1}장 내용이 넘침 (${Math.round(over)}px)`);
    await p.screenshot({ path: path.join(dir, String(j + 1).padStart(2, '0') + '.png') });
  }
  console.log(`  ${it.id}: ${slides.length}장`);
}
await b.close();
