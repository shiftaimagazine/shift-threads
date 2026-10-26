// 인스타 캐러셀 자동 게시 (2026-10-26) — 쓰레드용으로 만든 비교 카드를 인스타 캐러셀로도 올립니다. PC 꺼져 있어도 됨.
//   queue/YYYY-MM-DD.json 에서 "instagram" 필드가 있는 글(월·수·금 21:40 compare 글)을 instagram.at(기본 그날 12:40 KST)에 올림.
//   이미지는 render.mjs 가 같이 만든 media/<글id>/NN.jpg (인스타는 JPEG 만 받음). 기록: ig/posted.json
//   instagram: {"caption":"인스타 캡션 전문","at":"2026-10-28T12:40:00+09:00"(선택)} — caption 이 없으면 쓰레드 본문으로 만듦
//   MODE=post (기본) | check = 계정 확인 + 게시 준비(컨테이너)까지만 시험하고 게시하지 않음 (TEST_ID: 시험할 글 id 또는 _igtest)
//   올릴 게 없으면 API 를 부르지 않습니다.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REPO = process.env.GITHUB_REPOSITORY || 'shiftaimagazine/shift-threads';
const IG = process.env.IG_TOKEN, MODE = process.env.MODE || 'post', DRY = /^(1|true)$/.test(process.env.DRY_RUN || '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dir = path.join(ROOT, 'ig'); fs.mkdirSync(dir, { recursive: true });
const postedFile = path.join(dir, 'posted.json');
const posted = fs.existsSync(postedFile) ? JSON.parse(fs.readFileSync(postedFile, 'utf8')) : {};
const save = () => fs.writeFileSync(postedFile, JSON.stringify(posted, null, 1) + '\n');
const jpgs = id => { const d = path.join(ROOT, 'media', id); return fs.existsSync(d) ? fs.readdirSync(d).filter(f => /^\d{2}\.jpg$/.test(f)).sort() : []; };
const imgUrl = (id, f) => `https://raw.githubusercontent.com/${REPO}/main/media/${id}/${f}`;

async function ig(method, url, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: IG });
  const res = method === 'GET' ? await fetch(`https://graph.instagram.com/v23.0${url}?${body}`) : await fetch(`https://graph.instagram.com/v23.0${url}`, { method: 'POST', body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`${method} ${url}: ${j.error?.error_user_msg || j.error?.message || res.status}`);
  return j;
}
async function ready(id, label) {
  for (let i = 0; i < 30; i++) {
    const s = await ig('GET', `/${id}`, { fields: 'status_code,status' }).catch(e => ({ status: e.message }));
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`${label} 준비 실패: ${s.status || s.status_code}`);
    await sleep(4000);
  }
  throw new Error(`${label} 준비 시간 초과`);
}

// 쓰레드 본문 → 인스타 캡션 (캡션이 따로 없을 때)
function captionOf(it) {
  if (it.instagram?.caption) return String(it.instagram.caption).slice(0, 2200);
  const body = String(it.parts?.[0] || '').trim();
  const src = String(it.parts?.[1] || '').replace(/https?:\/\/\S+/g, '').replace(/\s*·\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  return [body, '저장해 두고 필요할 때 비교해 보세요 🔖', src, '#SHIFTAI #AI #AI툴 #챗GPT #클로드'].filter(Boolean).join('\n\n').slice(0, 2200);
}

const items = [];
for (const f of fs.readdirSync(path.join(ROOT, 'queue')).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
  try { items.push(...JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', f), 'utf8'))); } catch (e) { console.error(`${f}: ${e.message}`); }
}
const done = it => ['ok', 'failed', 'expired'].includes(posted[it.id]?.status);
const atOf = it => Date.parse(it.instagram?.at || `${it.id.slice(0, 10)}T12:40:00+09:00`);
const now = Date.now();
let todo = items.filter(it => it.instagram && !done(it) && atOf(it) <= now && now - atOf(it) < 20 * 3600e3);
for (const it of items.filter(it => it.instagram && !done(it) && now - atOf(it) >= 20 * 3600e3)) { posted[it.id] = { status: 'expired', at: new Date().toISOString() }; console.log(`시간이 지나 건너뜀: ${it.id}`); }
if (MODE === 'post' && !todo.length) { save(); console.log('올릴 인스타 캐러셀 없음 · API 호출 생략'); process.exit(0); }
if (!IG) { console.log('IG_TOKEN 없음'); process.exit(1); }

const me = await ig('GET', '/me', { fields: 'user_id,username' });
console.log(`인스타 계정: @${me.username}`);

async function buildCarousel(id, caption) {
  const files = jpgs(id).slice(0, 10);
  if (files.length < 2) throw new Error(`JPEG 카드가 ${files.length}장뿐 (render.mjs 가 instagram 글에 NN.jpg 를 만들어야 함)`);
  const kids = [];
  for (const f of files) kids.push((await ig('POST', `/${me.user_id}/media`, { image_url: imgUrl(id, f), is_carousel_item: 'true' })).id);
  for (const [k, c] of kids.entries()) await ready(c, `${k + 1}장`);
  const c = await ig('POST', `/${me.user_id}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption });
  await ready(c.id, '캐러셀');
  return { container: c.id, n: files.length };
}

if (MODE === 'check') {
  const id = process.env.TEST_ID || '_igtest';
  const r = await buildCarousel(id, '게시 시험(게시하지 않음)');
  console.log(`게시 준비 시험 성공: ${id} ${r.n}장 → 컨테이너 ${r.container} (게시하지 않음, 24시간 뒤 자동 만료)`);
  process.exit(0);
}

for (const it of todo.slice(0, 2)) {
  const caption = captionOf(it);
  console.log(`\n── ${it.id} (${new Date(atOf(it)).toISOString()})\n${caption.slice(0, 200)}…`);
  if (DRY) continue;
  try {
    const { container, n } = await buildCarousel(it.id, caption);
    const pid = (await ig('POST', `/${me.user_id}/media_publish`, { creation_id: container })).id;
    const link = (await ig('GET', `/${pid}`, { fields: 'permalink' }).catch(() => ({}))).permalink || pid;
    posted[it.id] = { status: 'ok', at: new Date().toISOString(), id: pid, link, cards: n };
    console.log(`올림: ${link}`);
  } catch (e) {
    const tries = (posted[it.id]?.tries || 0) + 1;   // 3번까지 다음 실행 때 다시
    posted[it.id] = { status: tries >= 3 ? 'failed' : 'retry', tries, error: e.message, at: new Date().toISOString() };
    console.log(`실패(${tries}/3): ${it.id} — ${e.message}`);
  }
  save();
}
save();
