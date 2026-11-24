// SHIFT AI 쓰레드 자동 업로드 (GitHub Actions, PC 불필요)
//   MODE=check : 키 확인만 / MODE=post : 올릴 시간이 된 글을 올림 (기본) / DRY_RUN=1 : 미리보기만
// 글 형식은 CONTENT_GUIDE.md 참고. type: text | thread | image | carousel
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://graph.threads.net/v1.0';
// 주제 태그는 전부 'AI Threads' 커뮤니티(약 151만 명) 하나로 통일 (2026-10-26 사용자 결정). 항목별 topic 은 무시.
const TOPIC = process.env.THREADS_TOPIC ?? 'AI Threads';
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

async function call(method, url, params = {}, host = API) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const res = method === 'GET' ? await fetch(host + url + '?' + body) : await fetch(host + url, { method: 'POST', body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`${method} ${url} 실패: ${j.error?.error_user_msg || j.error?.message || res.status}`);
  return j;
}

async function waitReady(id, label = '') {      // 미디어 처리 완료까지 대기 (최대 2분). 2026-11-24: 상태를 기록에 남김
  let last = '';
  for (let i = 0; i < 12; i++) {
    const s = await call('GET', `/${id}`, { fields: 'status,error_message' }).catch(e => ({ status: 'GET 실패', error_message: e.message }));
    const now = `${s.status || '?'}${s.error_message ? ' ' + s.error_message : ''}`;
    if (now !== last) { console.log(`   컨테이너 ${label || id}: ${now}`); last = now; }
    if (s.status === 'FINISHED') return;
    if (s.status === 'ERROR' || s.status === 'EXPIRED') throw new Error(`미디어 처리 실패(${label || id}): ${s.error_message || s.status}`);
    await sleep(10000);
  }
  throw new Error(`미디어 처리가 2분 안에 안 끝남(${label || id}): ${last}`);
}
// 2026-11-24: 11/24 캐러셀이 'The media with id … cannot be found' 로 두 번 실패 → 공식 안내대로 처리 끝난 뒤 조금 기다렸다 올리고,
//   같은 오류면 20초 뒤 다시 · 그래도 안 되면 graph.threads.com 주소로 한 번 더 (공식 문서가 이 주소로 바뀜)
const ALT_API = 'https://graph.threads.com/v1.0';
async function publishId(cid) {
  const tries = [[API, 0], [API, 20000], [ALT_API, 20000]];
  let err;
  for (const [host, wait] of tries) {
    if (wait) await sleep(wait);
    try { return (await call('POST', `/${me.id}/threads_publish`, { creation_id: cid }, host)).id; }
    catch (e) { err = e; console.log(`   올리기 다시 시도(${host.includes('.com') ? 'graph.threads.com' : 'graph.threads.net'}): ${e.message}`); if (!/cannot be found|not found|nonexistent|expired|not ready|try again/i.test(e.message)) break; }
  }
  throw err;
}
async function publish(params, label = '') {
  let c;
  try { c = await call('POST', `/${me.id}/threads`, params); }
  catch (e) { if (!params.topic_tag || !/topic/i.test(e.message)) throw e; console.log(`주제 태그 거부(${e.message}) → 태그 없이 다시`); const { topic_tag, ...rest } = params; params = rest; c = await call('POST', `/${me.id}/threads`, params); }
  if (params.media_type === 'TEXT') await sleep(4000); else { await waitReady(c.id, label || params.media_type); await sleep(5000); }
  return publishId(c.id);
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
// 시간이 너무 지난 글은 API 없이 바로 정리
for (const it of due) if (now - Date.parse(it.at) > STALE_HOURS * 3600e3) { posted[it.id] = { status: 'expired', at: new Date().toISOString() }; console.log(`건너뜀(시간 지남): ${it.id}`); }
const todo = due.filter(it => !posted[it.id]);
// 올릴 글이 없으면 API를 한 번도 부르지 않음 (쓸데없는 호출이 계정 차단 사유가 될 수 있음)
if (MODE !== 'check' && !todo.length) {
  if (!DRY) fs.writeFileSync(postedFile, JSON.stringify(posted, null, 1) + '\n');
  console.log('올릴 글 없음 · API 호출 생략'); process.exit(0);
}
const me = await call('GET', '/me', { fields: 'id,username' });
console.log(`계정 확인: @${me.username}`);
if (MODE === 'check') process.exit(0);

let count = 0, failed = 0;
for (const it of todo) {
  const mark = (status, extra = {}) => { posted[it.id] = { status, at: new Date().toISOString(), ...extra }; };
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
    const first = { text: parts[0], ...(TOPIC ? { topic_tag: TOPIC } : {}) };
    if (type === 'carousel') {
      // 2026-11-24: 캐러셀이 Threads 쪽 오류로 안 되면 첫 카드 한 장(IMAGE) → 그래도 안 되면 글만(TEXT)으로 올려 그날 글이 빠지지 않게
      try {
        const kids = [];
        for (let k = 1; k <= Math.min(n, 20); k++) kids.push((await call('POST', `/${me.id}/threads`, { media_type: 'IMAGE', image_url: imgUrl(it.id, k), is_carousel_item: 'true' })).id);
        for (const [k, kid] of kids.entries()) await waitReady(kid, `카드 ${k + 1}`);
        ids.push(await publish({ media_type: 'CAROUSEL', children: kids.join(','), ...first }, '캐러셀'));
      } catch (e) {
        if (ids.length) throw e;
        console.log(`   캐러셀 실패 → 첫 카드 한 장으로: ${e.message}`);
        try { ids.push(await publish({ media_type: 'IMAGE', image_url: imgUrl(it.id, 1), ...first }, '카드 1장')); it._fallback = 'image'; }
        catch (e2) { if (ids.length) throw e2; console.log(`   이미지도 실패 → 글만: ${e2.message}`); ids.push(await publish({ media_type: 'TEXT', ...first })); it._fallback = 'text'; }
      }
    } else if (type === 'image') {
      ids.push(await publish({ media_type: 'IMAGE', image_url: imgUrl(it.id, 1), ...first }));
    } else {
      ids.push(await publish({ media_type: 'TEXT', ...first }));
    }
    // 이어지는 글(타래) — 첫 글 아래 답글로
    for (const p of parts.slice(1)) { await sleep(3000); ids.push(await publish({ media_type: 'TEXT', text: p, reply_to_id: ids.at(-1) })); }
    const info = await call('GET', `/${ids[0]}`, { fields: 'permalink,topic_tag' }).catch(() => ({}));
    const link = info.permalink || '';
    mark('ok', { ids, link, type: it._fallback || type, topic: info.topic_tag || null, ...(it._fallback ? { fallbackFrom: type } : {}) });
    console.log(`올림: ${link || ids[0]} · 주제 태그: ${info.topic_tag || '없음'}`);
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
