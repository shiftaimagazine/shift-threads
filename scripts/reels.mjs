// SHIFT AI 릴스 영상 올리기 (GitHub Actions, PC 불필요)
//   reels/YYYY-MM-DD.json 의 영상을 시간이 되면 쓰레드(영상 글)와, IG_TOKEN 이 있으면 인스타 릴스로 올립니다.
//   영상은 구글 드라이브 'SHIFT-autopilot' 폴더 파일(링크 공개)을 바로 가져갑니다.
//   MODE=check : 키 확인만 (게시 안 함) / DRY_RUN=1 : 미리보기만
// 항목 형식 (매일 08:40 클라우드 예약 작업이 씀):
//   {"id":"2026-10-26-1000","at":"2026-10-26T10:20:00+09:00","video":"<드라이브 파일 ID>","cover":"<드라이브 파일 ID>",
//    "threads":{"text":"쓰레드 본문","reply":"출처: …","topic":"AI Threads"(코드가 고정)}, "instagram":{"caption":"인스타 캡션 전문"} }
//   instagram 이 없거나 IG_TOKEN 이 없으면 인스타는 건너뜁니다(그때는 Metricool·직접 업로드가 맡음).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODE = process.env.MODE || 'post';
const DRY = /^(1|true)$/.test(process.env.DRY_RUN || '');
const TH = process.env.THREADS_TOKEN, IG = process.env.IG_TOKEN;
const STALE_HOURS = 8;
// 주제 태그는 전부 'AI Threads' 커뮤니티(약 151만 명) 하나로 통일 (2026-10-26). 항목별 topic 은 무시.
const TOPIC = process.env.THREADS_TOPIC ?? 'AI Threads';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const driveUrl = id => /^https?:/.test(id) ? id : `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
const postedFile = path.join(ROOT, 'reels', 'posted.json');
const statusFile = path.join(ROOT, 'reels', 'status.json');
fs.mkdirSync(path.join(ROOT, 'reels'), { recursive: true });

async function api(base, token, method, url, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = method === 'GET' ? await fetch(base + url + '?' + body) : await fetch(base + url, { method: 'POST', body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`${method} ${url}: ${j.error?.error_user_msg || j.error?.message || res.status}`);
  return j;
}
const thApi = (m, u, p) => api('https://graph.threads.net/v1.0', TH, m, u, p);
const igApi = (m, u, p) => api('https://graph.instagram.com/v23.0', IG, m, u, p);

// ── 올릴 항목을 먼저 읽어, 할 일이 없으면 API 를 부르지 않음 (계정 확인은 하루 1번만) ──
const posted = fs.existsSync(postedFile) ? JSON.parse(fs.readFileSync(postedFile, 'utf8')) : {};
const items = [];
for (const f of fs.readdirSync(path.join(ROOT, 'reels')).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
  try { for (const it of JSON.parse(fs.readFileSync(path.join(ROOT, 'reels', f), 'utf8'))) items.push(it); } catch (e) { console.error(`${f} 읽기 실패: ${e.message}`); }
}
const now = Date.now();
const due = items.filter(it => it.id && it.video && Date.parse(it.at) <= now).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
const pendingWork = due.filter(it => (it.threads && TH && !posted[it.id]?.threads) || (it.instagram && IG && !posted[it.id]?.instagram));
const prevStatus = fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, 'utf8')) : {};
const checkStale = !prevStatus.checkedAt || now - Date.parse(prevStatus.checkedAt) > 20 * 3600e3;
if (MODE === 'post' && !pendingWork.length && !checkStale) { console.log('올릴 영상 없음 · API 호출 생략'); process.exit(0); }

// ── 계정 확인 + 상태 기록 (08:40 작업이 status.json 의 igReady 를 보고 인스타를 Metricool 로 보낼지 정함) ──
const status = { checkedAt: new Date().toISOString(), threads: null, instagram: null, igReady: false };
let thMe = null, igMe = null;
if (TH) { try { thMe = await thApi('GET', '/me', { fields: 'id,username' }); status.threads = '@' + thMe.username; } catch (e) { status.threads = '오류: ' + e.message; } }
if (IG) { try { igMe = await igApi('GET', '/me', { fields: 'user_id,username' }); status.instagram = '@' + igMe.username; status.igReady = true; } catch (e) { status.instagram = '오류: ' + e.message; } }
else status.instagram = 'IG_TOKEN 없음 (인스타는 Metricool·직접 업로드)';
console.log(`쓰레드: ${status.threads || '키 없음'} · 인스타: ${status.instagram}`);
fs.writeFileSync(statusFile, JSON.stringify(status, null, 1) + '\n');
if (MODE === 'check') process.exit(0);
if (MODE === 'igtest') {   // 인스타 게시 준비만 시험 (컨테이너만 만들고 게시하지 않음)
  if (!igMe) { console.log('인스타 키 없음'); process.exit(1); }
  const vid = process.env.TEST_VIDEO;
  const c = await igApi('POST', `/${igMe.user_id}/media`, { media_type: 'REELS', video_url: driveUrl(vid), caption: 'test', share_to_feed: 'true' });
  let st = {};
  for (let i = 0; i < 30; i++) { await sleep(10000); st = await igApi('GET', `/${c.id}`, { fields: 'status_code,status' }).catch(e => ({ status: e.message })); if (st.status_code === 'FINISHED' || st.status_code === 'ERROR') break; }
  console.log(`인스타 게시 준비 시험: ${st.status_code || '?'} ${st.status || ''} (게시하지 않음)`);
  status.igPublishTest = { at: new Date().toISOString(), result: st.status_code || st.status || '?' };
  fs.writeFileSync(statusFile, JSON.stringify(status, null, 1) + '\n');
  process.exit(st.status_code === 'FINISHED' ? 0 : 1);
}

// ── 올릴 항목 (위에서 읽음) ──

async function threadsVideo(it) {
  const t = it.threads; const text = String(t.text || '').trim().slice(0, 500);
  const c = await thApi('POST', `/${thMe.id}/threads`, { media_type: 'VIDEO', video_url: driveUrl(it.video), text, ...(TOPIC ? { topic_tag: TOPIC } : {}) });
  for (let i = 0; i < 30; i++) { await sleep(10000); const s = await thApi('GET', `/${c.id}`, { fields: 'status,error_message' }).catch(() => ({})); if (s.status === 'FINISHED') break; if (s.status === 'ERROR') throw new Error('쓰레드 영상 처리 실패: ' + (s.error_message || '')); }
  const id = (await thApi('POST', `/${thMe.id}/threads_publish`, { creation_id: c.id })).id;
  if (t.reply) { await sleep(4000); const r = await thApi('POST', `/${thMe.id}/threads`, { media_type: 'TEXT', text: String(t.reply).slice(0, 500), reply_to_id: id }); await sleep(4000); await thApi('POST', `/${thMe.id}/threads_publish`, { creation_id: r.id }); }
  return (await thApi('GET', `/${id}`, { fields: 'permalink' }).catch(() => ({}))).permalink || id;
}
async function instagramReel(it) {
  const p = { media_type: 'REELS', video_url: driveUrl(it.video), caption: String(it.instagram.caption || '').slice(0, 2200), share_to_feed: 'true' };
  if (it.cover) p.cover_url = driveUrl(it.cover);
  const c = await igApi('POST', `/${igMe.user_id}/media`, p);
  let s = {};
  for (let i = 0; i < 36; i++) { await sleep(10000); s = await igApi('GET', `/${c.id}`, { fields: 'status_code,status' }).catch(() => ({})); if (s.status_code === 'FINISHED' || s.status_code === 'ERROR') break; }
  if (s.status_code !== 'FINISHED') throw new Error('인스타 영상 처리 실패: ' + (s.status || s.status_code || '시간 초과'));
  const id = (await igApi('POST', `/${igMe.user_id}/media_publish`, { creation_id: c.id })).id;
  return (await igApi('GET', `/${id}`, { fields: 'permalink' }).catch(() => ({}))).permalink || id;
}

let done = 0;
for (const it of due) {
  const rec = posted[it.id] = posted[it.id] || {};
  const late = now - Date.parse(it.at) > STALE_HOURS * 3600e3;
  const jobs = [];
  if (it.threads && thMe && !rec.threads) jobs.push(['threads', threadsVideo]);
  if (it.instagram && igMe && !rec.instagram) jobs.push(['instagram', instagramReel]);
  if (!jobs.length) continue;
  if (late) { for (const [k] of jobs) rec[k] = { status: 'expired', at: new Date().toISOString() }; console.log(`건너뜀(시간 지남): ${it.id}`); continue; }
  for (const [k, fn] of jobs) {
    console.log(`── ${it.id} → ${k}`);
    if (DRY) continue;
    const tries = (rec[`_${k}_tries`] || 0) + 1;
    try { const link = await fn(it); rec[k] = { status: 'ok', link, at: new Date().toISOString() }; delete rec[`_${k}_tries`]; console.log(`   올림: ${link}`); done++; }
    catch (e) { console.error(`   실패(${tries}번째): ${e.message}`); if (tries >= 3) rec[k] = { status: 'failed', error: e.message, at: new Date().toISOString() }; else rec[`_${k}_tries`] = tries; }
  }
}
if (!DRY) fs.writeFileSync(postedFile, JSON.stringify(posted, null, 1) + '\n');
console.log(`완료: ${done}건${DRY ? ' (미리보기)' : ''}`);
