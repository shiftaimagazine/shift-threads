// SHIFT AI 쓰레드 자동 업로드 (GitHub Actions, PC 불필요)
//   MODE=check : 키 확인만 / MODE=post : 올릴 시간이 된 글을 올림 (기본) / DRY_RUN=1 : 미리보기만
// 글 형식은 CONTENT_GUIDE.md 참고. type: text | thread | image | carousel
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://graph.threads.net/v1.0';
const TOKEN = process.env.THREADS_TOKEN;
const MODE = process.env.MODE || 'post';
const DRY = /^(1|true)$/.test(process.env.DRY_RUN || '');
const REPO = process.env.GITHUB_REPOSITORY || 'shiftaimagazine/shift-threads';
const MAX_PER_RUN = 2;          // 한 번 실행(1시간)에 최대 2개 — 몰아서 올리지 않기
const STALE_HOURS = 6;          // 예정 시각보다 6시간 넘게 밀린 글은 건너뜀
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const postedFile = path.join(ROOT, 'posted.json');
if (!TOKEN) { console.error('THREADS_TOKEN 비밀값이 없습니다.'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(method, url, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const res = method === 'GET' ? await fetch(API + url + '?' + body) : await fetch(API + url, { method: 'POST', body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`${method} ${url} 실패: ${j.error?.error_user_msg || j.error?.message || res.status}`);
  return j;
}
const me = await call('GET', '/me', { fields: 'id,username' });
console.log(`계정 확인: @${me.username}`);
if (MODE === 'check') process.exit(0);

async function waitReady(id) {      // 미디어 처리 완료까지 대기 (최대 2분)
  for (let i = 0; i < 12; i++) {
    const s = await call('GET', `/${id}`, { fields: 'status,error_message' }).catch(() => ({}));
    if (s.status === 'FINISHED') return;
    if (s.status === 'ERROR') throw new Error('미디어 처리 실패: ' + (s.error_message || ''));
    await sleep(10000);
  }
}
async function publish(params) {
  const c = await call('POST', `/${me.id}/threads`, params);
  if (params.media_type === 'TEXT') await sleep(4000); else await waitReady(c.id);
  return (await call('POST', `/${me.id}/threads_publish`, { creation_id: c.id })).id;
}
const imgUrl = (id, n) => `https://raw.githubusercontent.com/${REPO}/main/media/${id}/${String(n).padStart(2, '0')}.png`;
const mediaCount = id => { const d = path.join(ROOT, 'media', id); return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith('.png')).length : 0; };

const posted = fs.existsSync(postedFile) ? JSON.parse(fs.readFileSync(postedFile, 'utf8')) : {};
const items = [];
for (const f of fs.readdirSync(path.join(ROOT, 'queue')).filter(f => f.endsWith('.json')).sort()) {
  try { for (const it of JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', f), 'utf8'))) items.push(it); } catch (e) { console.error(`${f} 읽기 실패: ${e.message}`); }
}
const now = Date.now();
const due = items.filter(it => it.id && !posted[it.id] && Date.parse(it.at) <= now).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
console.log(`남은 예약 ${items.filter(it => it.id && !posted[it.id]).length}개 · 지금 올릴 글 ${due.length}개`);

let count = 0, failed = 0;
for (const it of due) {
  const mark = (status, extra = {}) => { posted[it.id] = { status, at: new Date().toISOString(), ...extra }; };
  if (now - Date.parse(it.at) > STALE_HOURS * 3600e3) { mark('expired'); console.log(`건너뜀(시간 지남): ${it.id}`); continue; }
  if (count >= MAX_PER_RUN) break;
  const type = it.type || (it.parts?.length > 1 ? 'thread' : 'text');
  const parts = (it.parts || []).map(s => String(s).trim()).filter(Boolean);
  const bad = parts.find(p => Buffer.byteLength(p.replace(/[\x00-\x7F]|[가-힣]/g, ''), 'utf8') + [...p].length > 500 && [...p].length > 500);
  if (!parts.length || [...parts[0]].length > 500 || bad) { mark('invalid', { reason: '내용 없음 또는 500자 초과' }); console.log(`건너뜀(형식 오류): ${it.id}`); continue; }
  const n = mediaCount(it.id);
  if ((type === 'carousel' && n < 2) || (type === 'image' && n < 1)) { console.log(`이미지 준비 전이라 다음에 올림: ${it.id}`); continue; }
  console.log(`\n── ${it.id} [${type}${n ? ` 이미지 ${n}장` : ''}] ${it.at}\n${parts.join('\n  ↳ ')}`);
  if (DRY) { count++; continue; }
  const ids = [];
  try {
    const first = { text: parts[0], ...(it.topic ? { topic_tag: it.topic } : {}) };
    if (type === 'carousel') {
      const kids = [];
      for (let k = 1; k <= Math.min(n, 20); k++) kids.push((await call('POST', `/${me.id}/threads`, { media_type: 'IMAGE', image_url: imgUrl(it.id, k), is_carousel_item: 'true' })).id);
      for (const k of kids) await waitReady(k);
      ids.push(await publish({ media_type: 'CAROUSEL', children: kids.join(','), ...first }));
    } else if (type === 'image') {
      ids.push(await publish({ media_type: 'IMAGE', image_url: imgUrl(it.id, 1), ...first }));
    } else {
      ids.push(await publish({ media_type: 'TEXT', ...first }));
    }
    // 이어지는 글(타래) — 첫 글 아래 답글로
    for (const p of parts.slice(1)) { await sleep(3000); ids.push(await publish({ media_type: 'TEXT', text: p, reply_to_id: ids.at(-1) })); }
    const link = await call('GET', `/${ids[0]}`, { fields: 'permalink' }).then(j => j.permalink).catch(() => '');
    mark('ok', { ids, link, type });
    console.log(`올림: ${link || ids[0]}`);
    count++;
  } catch (e) {
    failed++;
    console.error(`실패: ${it.id} — ${e.message}`);
    if (ids.length) mark('partial', { ids, error: e.message });     // 첫 글이 올라갔으면 중복 방지
    else if ((it.tries = (posted[`_tries_${it.id}`] || 0) + 1) >= 3) mark('failed', { error: e.message });
    else posted[`_tries_${it.id}`] = it.tries;
  }
}
if (!DRY) fs.writeFileSync(postedFile, JSON.stringify(posted, null, 1) + '\n');
console.log(`\n완료: ${count}개${DRY ? ' (미리보기)' : ''}${failed ? ` · 실패 ${failed}개` : ''}`);
