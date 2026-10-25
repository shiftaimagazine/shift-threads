// SHIFT AI 유튜브 쇼츠 예약 업로드 (GitHub Actions, PC·크롬·Claude 불필요)
//   드라이브 SHIFT-autopilot/<날짜>/ 폴더의 youtube.json(없으면 manifest.json)과 영상을 읽어
//   YouTube Data API 로 '예약 공개'(비공개 → publishAt 에 공개) 업로드합니다.
//   비밀값: YT_CLIENT_ID · YT_CLIENT_SECRET · YT_REFRESH_TOKEN (유튜브 OAuth, scripts/youtube-auth.mjs 로 한 번 발급)
//           DRIVE_API_KEY (드라이브 공개 폴더 읽기용 API 키)
//   MODE=check : 채널·드라이브 연결 확인만 / DRY_RUN=1 : 올리지 않고 미리보기
//   기록: youtube/posted.json (올린 것), youtube/status.json (관제실용 현황)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODE = process.env.MODE || 'post';
const DRY = /^(1|true)$/.test(process.env.DRY_RUN || '');
const FOLDER = process.env.DRIVE_FOLDER || '1WnuEK-eqTYdfi5BItoWKRqlO81oMxVaQ';   // SHIFT-autopilot
const KEY = process.env.DRIVE_API_KEY;
const MAX_PER_RUN = +(process.env.MAX_PER_RUN || 4);
const FOOTER = '\n\n🔔 매일 AI 화제작·꼭 알아야 할 AI를 30초로 정리해요. 구독해 두세요!\n#Shorts #AI #SHIFTAI';
const postedFile = path.join(ROOT, 'youtube', 'posted.json');
const statusFile = path.join(ROOT, 'youtube', 'status.json');
fs.mkdirSync(path.join(ROOT, 'youtube'), { recursive: true });
const posted = fs.existsSync(postedFile) ? JSON.parse(fs.readFileSync(postedFile, 'utf8')) : {};
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const kstIso = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().replace(/\.\d{3}Z$/, '+09:00');
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const k of ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN', 'DRIVE_API_KEY']) if (!process.env[k]) { console.error(`${k} 비밀값이 없습니다.`); process.exit(1); }

// ── 드라이브 (공개 폴더는 API 키만으로 읽힘) ──
async function driveList(parent) {
  const q = encodeURIComponent(`'${parent}' in parents and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=200&key=${KEY}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`드라이브 목록 실패 ${r.status}: ${j.error?.message || ''}`);
  return j.files || [];
}
async function driveGet(id, asJson) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${KEY}`);
  if (!r.ok) throw new Error(`드라이브 내려받기 실패 ${r.status}`);
  return asJson ? r.json() : Buffer.from(await r.arrayBuffer());
}

// ── 유튜브 ──
async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
    client_id: process.env.YT_CLIENT_ID, client_secret: process.env.YT_CLIENT_SECRET, refresh_token: process.env.YT_REFRESH_TOKEN, grant_type: 'refresh_token' }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`유튜브 키 갱신 실패: ${j.error_description || j.error || r.status} (refresh token 이 만료됐으면 scripts/youtube-auth.mjs 로 다시 발급)`);
  return j.access_token;
}
async function upload(token, buf, meta) {
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(buf.length), 'X-Upload-Content-Type': 'video/mp4' },
    body: JSON.stringify(meta) });
  if (!init.ok) throw new Error(`업로드 시작 실패 ${init.status}: ${(await init.text()).slice(0, 300)}`);
  const loc = init.headers.get('location');
  const put = await fetch(loc, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4', 'Content-Length': String(buf.length) }, body: buf });
  const j = await put.json().catch(() => ({}));
  if (!put.ok || !j.id) throw new Error(`업로드 실패 ${put.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

// ── 올릴 항목 모으기: 오늘·내일 날짜 폴더 ──
const today = kstDate(), tomorrow = kstDate(new Date(Date.now() + 864e5));
const rootFiles = await driveList(FOLDER);
const items = [];
for (const d of [today, tomorrow]) {
  const dir = rootFiles.find(f => f.name === d && f.mimeType === 'application/vnd.google-apps.folder');
  if (!dir) continue;
  const files = await driveList(dir.id);
  const byName = Object.fromEntries(files.map(f => [f.name, f]));
  let list = [];
  if (byName['youtube.json']) {
    // PC 오토파일럿이 쓰는 형식: [{slot, publishAt, file:"1-yt.mp4", title, description, aiContent}]
    list = (await driveGet(byName['youtube.json'].id, true)).map(x => ({ ...x, date: d, key: `${d}/${x.file}`, fileId: byName[x.file]?.id, kind: 'new' }));
  } else if (byName['manifest.json']) {
    // 예비: manifest.json 만 있을 때 (손으로 옮긴 폴더 등). 유튜브 사본이 없으면 원본 mp4 를 올림
    const m = await driveGet(byName['manifest.json'].id, true);
    list = (m.items || []).filter(it => /^\d{2}:\d{2}$/.test(it.slot)).map((it, i) => {
      const yt = byName[`${i + 1}-yt.mp4`] || byName[it.video];
      return { slot: it.slot, publishAt: `${d}T${it.slot}:00+09:00`, file: yt?.name, fileId: yt?.id, title: it.ytTitle || it.title,
        description: `${String(it.caption || '').replace(/[<>]/g, '').trim()}${FOOTER}`.slice(0, 4900), aiContent: /화제작|퀴즈|대결/.test(it.format || ''), date: d, key: `${d}/${yt?.name}`, kind: 'new' };
    });
  }
  for (const it of list) if (it.fileId) items.push(it);
}
items.sort((a, b) => Date.parse(a.publishAt) - Date.parse(b.publishAt));
const todo = items.filter(it => !posted[it.key]?.videoId);
console.log(`날짜 폴더 ${[today, tomorrow].join('·')} · 항목 ${items.length}개 · 올릴 것 ${todo.length}개`);

function writeStatus(message, extra = {}) {
  const all = items.map(it => { const p = posted[it.key] || {}; return { date: it.date, at: p.publishAt || it.publishAt, slot: it.slot, kind: it.kind, title: it.title,
    status: p.videoId ? 'scheduled' : p.error ? 'failed' : 'pending', videoId: p.videoId || null, note: p.error || null }; });
  fs.writeFileSync(statusFile, JSON.stringify({ updated: kstIso(), message, limit: { hit: false, at: null, note: '' }, backlogLeft: 0, via: 'youtube-api', items: all, ...extra }, null, 1) + '\n');
}

if (MODE === 'check') {
  const token = await accessToken();
  const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  console.log(`유튜브 채널: ${j.items?.[0]?.snippet?.title || JSON.stringify(j).slice(0, 200)}`);
  writeStatus(`연결 확인 ${kstIso()}`); process.exit(0);
}
if (!todo.length) { writeStatus('올릴 쇼츠 없음'); console.log('올릴 쇼츠 없음 · 유튜브 API 호출 생략'); process.exit(0); }

// 밀린 예약 시각 다시 잡기: 40분 안이거나 지났으면, 지금+60분 이후 가장 가까운 :00/:30 중 다른 항목과 1시간 이상 떨어진 시각
const taken = items.map(it => Date.parse(posted[it.key]?.publishAt || it.publishAt));
function slotFor(it) {
  let t = Date.parse(it.publishAt);
  if (t - Date.now() >= 40 * 60e3) return t;
  if (Date.now() - t > 48 * 3600e3) return null;   // 이틀 넘게 밀린 건 올리지 않음
  t = Math.ceil((Date.now() + 60 * 60e3) / (30 * 60e3)) * 30 * 60e3;
  while (taken.some(x => Math.abs(x - t) < 3600e3)) t += 30 * 60e3;
  taken.push(t); return t;
}

const token = await accessToken();
let n = 0, failed = 0;
for (const it of todo) {
  if (n >= MAX_PER_RUN) break;
  const at = slotFor(it);
  if (!at) { posted[it.key] = { error: '48시간 넘게 밀려 건너뜀', at: kstIso() }; console.log(`건너뜀(너무 늦음): ${it.key}`); continue; }
  const publishAt = new Date(at).toISOString();
  const meta = { snippet: { title: String(it.title || '').replace(/[<>]/g, '').slice(0, 100), description: String(it.description || '').slice(0, 4900), categoryId: '28', defaultLanguage: 'ko', defaultAudioLanguage: 'ko', tags: ['AI', 'SHIFT AI', 'Shorts'] },
    status: { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false, containsSyntheticMedia: !!it.aiContent } };
  console.log(`── ${it.key} → ${kstIso(new Date(at))} "${meta.snippet.title}"${it.aiContent ? ' (AI 표시)' : ''}`);
  if (DRY) { n++; continue; }
  try {
    const buf = await driveGet(it.fileId);
    if (buf.length < 50e3) throw new Error(`영상 파일이 너무 작음 (${buf.length} bytes) — 드라이브 동기화 전일 수 있음`);
    const v = await upload(token, buf, meta);
    posted[it.key] = { videoId: v.id, publishAt: kstIso(new Date(at)), title: meta.snippet.title, at: kstIso() };
    console.log(`   예약됨: https://youtube.com/shorts/${v.id}`); n++;
    await sleep(3000);
  } catch (e) {
    failed++; console.error(`   실패: ${e.message}`);
    const tries = (posted[it.key]?.tries || 0) + 1;
    posted[it.key] = { ...(posted[it.key] || {}), tries, error: tries >= 3 ? e.message : undefined, lastError: e.message, at: kstIso() };
    if (/quota|403/i.test(e.message)) break;
  }
}
if (!DRY) fs.writeFileSync(postedFile, JSON.stringify(posted, null, 1) + '\n');
writeStatus(`${kstIso().slice(5, 16)} 쇼츠 ${n}편 예약${failed ? ` · 실패 ${failed}편` : ''}${DRY ? ' (미리보기)' : ''}`);
console.log(`완료: ${n}편${failed ? ` · 실패 ${failed}편` : ''}`);
