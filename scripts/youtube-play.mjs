// SHIFT PLAY 유튜브 쇼츠 예약 업로드 (GitHub Actions — PC·크롬·Claude 크레딧 불필요) — 2026-11-24 새로
//   사용자 11/24: "유튜브 업로드 네가 자동으로 하게 만들어". 예전 크롬 예약 작업(trig_01PEr1E9…)은 11/10 뒤로 한 편도 못 올려서 끔.
//   드라이브 SHIFT-autopilot/SHIFT PLAY/<날짜>/ 의 '<HHMM> <제목> 유튜브.mp4' 를 YouTube Data API 로 '예약 공개' 업로드.
//   제목 = 캡션 첫 줄, 설명 = 캡션(긴 판이 있으면 긴 판) — '팔로우하면' 줄 빼고 + 끝 두 줄 + 해시태그 5개, 썸네일 = '… 썸네일.jpg',
//   재생목록 = 제목으로 코너를 골라 기존 재생목록에(없으면 넣지 않음).
//   비밀값: YT_CLIENT_ID · YT_CLIENT_SECRET (SHIFT AI 와 같은 OAuth 클라이언트) · YT_PLAY_REFRESH_TOKEN ('시프트 플레이' 채널로 발급,
//           PC reels-auto-maker 의 'PLAY 유튜브 연결 (한 번만).cmd') · DRIVE_API_KEY
//   안전장치: 키의 채널이 '시프트 플레이'(UCjZ398yiclS8zPeJ-kbEWYg)가 아니면 아무것도 올리지 않음. 같은 제목이 채널에 있으면 건너뜀.
//   올리지 않기: 날짜 폴더에 이름이 '보류'·'hold' 로 시작하는 파일 → 그날 전부, '보류 1800' 처럼 시각을 붙이면 그 편만.
//              youtube/play-hold.json 의 keys 에 '<날짜>/<HHMM>' 을 넣어도 같음.
//   범위: 공개 시각이 지금 -48시간 ~ +24시간인 편 + youtube/play-extra.json 의 keys(밀린 편 한 번 올리기).
//   늦은 편: 원래 시각이 지났거나 40분 안이면 12:00 자리 중 다른 편(드라이브에 있는 편 포함)과 겹치지 않는 가장 가까운 미래 자리로.
//   MODE=check : 채널·재생목록·올릴 목록만 확인 / DRY_RUN=1 : 미리보기
//   기록: youtube/posted-play.json, youtube/status-play.json
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODE = process.env.MODE || 'post';
const DRY = /^(1|true)$/.test(process.env.DRY_RUN || '');
const PLAY_FOLDER = process.env.PLAY_FOLDER || '1Bm9II_OKifrc2aCfTL6CrGUoQ6Gh9-it';   // SHIFT-autopilot/SHIFT PLAY
const PLAY_CHANNEL = 'UCjZ398yiclS8zPeJ-kbEWYg';                                     // 시프트 플레이
const KEY = process.env.DRIVE_API_KEY;
const MAX_PER_RUN = +(process.env.MAX_PER_RUN || 3);
const LATE_SLOTS = ['12:00'];   // 늦은 편은 12:00 자리에만(18:00 은 그날 새 편 자리, 12:00 신작은 11/24부터 쉼)
const LATE_H = 48, AHEAD_H = 24;
const FOOT = ['게임 속 숫자를 현실로 계산하는 SHIFT PLAY — 매일 저녁 6시에 올라와요.', '📸 인스타그램 @shift_play_magazine'];
const PLAYLISTS = [   // 제목·캡션에서 코너 고르기 (기존 재생목록 이름의 앞부분과 맞춤)
  { name: '게임 가계부', re: /(만 ?원|억|월급|알바|가격|요금|가스비|전기료|월세|집값|아파트|공사비|상금|대출|벨|원어치|\d원)/ },
  { name: '게임 물리 검증', re: /(속도|km\/h|높이|힘|kW|볼트|충전|칼로리|kcal|하중|무게|톤|에너지|온도|℃|난방|MJ|낮잠|바닥)/ },
  { name: '현실에 나타난다면', re: /(현실에 (오|나타)|나타나면|출근하면|에 앉으면|에 오면)/ },
];

const dir = path.join(ROOT, 'youtube');
fs.mkdirSync(dir, { recursive: true });
const postedFile = path.join(dir, 'posted-play.json'), statusFile = path.join(dir, 'status-play.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const posted = readJson(postedFile, {});
const holdKeys = new Set(readJson(path.join(dir, 'play-hold.json'), {}).keys || []);
const extraKeys = new Set(readJson(path.join(dir, 'play-extra.json'), {}).keys || []);
const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const kstIso = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().replace(/\.\d{3}Z$/, '+09:00');
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const k of ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_PLAY_REFRESH_TOKEN', 'DRIVE_API_KEY']) if (!process.env[k]) {
  console.error(`${k} 비밀값이 없습니다.${k === 'YT_PLAY_REFRESH_TOKEN' ? " PC reels-auto-maker 폴더의 'PLAY 유튜브 연결 (한 번만).cmd' 로 발급해 GitHub 비밀값에 넣어 주세요." : ''}`);
  fs.writeFileSync(statusFile, JSON.stringify({ updated: kstIso(), message: `${k} 없음 — 아직 연결 전`, items: [] }, null, 1) + '\n');
  process.exit(0);   // 연결 전에는 실패로 표시하지 않음
}

// ── 드라이브 (공개 폴더는 API 키만으로 읽힘) ──
async function driveList(parent) {
  const q = encodeURIComponent(`'${parent}' in parents and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=300&key=${KEY}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`드라이브 목록 실패 ${r.status}: ${j.error?.message || ''}`);
  return j.files || [];
}
async function driveGet(id, asText) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${KEY}`);
  if (!r.ok) throw new Error(`드라이브 내려받기 실패 ${r.status}`);
  return asText ? r.text() : Buffer.from(await r.arrayBuffer());
}

// ── 유튜브 ──
async function accessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
    client_id: process.env.YT_CLIENT_ID, client_secret: process.env.YT_CLIENT_SECRET, refresh_token: process.env.YT_PLAY_REFRESH_TOKEN, grant_type: 'refresh_token' }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`유튜브 키 갱신 실패: ${j.error_description || j.error || r.status} (만료됐으면 'PLAY 유튜브 연결 (한 번만).cmd' 로 다시 발급)`);
  return j.access_token;
}
const yt = (token, p, opt = {}) => fetch(`https://www.googleapis.com/youtube/v3/${p}`, { ...opt, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', ...(opt.headers || {}) } })
  .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`${p.split('?')[0]} ${r.status}: ${j.error?.message || ''}`); return j; });
async function upload(token, buf, meta) {
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(buf.length), 'X-Upload-Content-Type': 'video/mp4' },
    body: JSON.stringify(meta) });
  if (!init.ok) throw new Error(`업로드 시작 실패 ${init.status}: ${(await init.text()).slice(0, 300)}`);
  const put = await fetch(init.headers.get('location'), { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4', 'Content-Length': String(buf.length) }, body: buf });
  const j = await put.json().catch(() => ({}));
  if (!put.ok || !j.id) throw new Error(`업로드 실패 ${put.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}
async function setThumbnail(token, videoId, buf) {
  const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg', 'Content-Length': String(buf.length) }, body: buf });
  if (!r.ok) throw new Error(`썸네일 실패 ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// ── 캡션 → 제목·설명 ──
const unesc = s => String(s || '').replace(/\r/g, '').replace(/\\([#~*_\-\[\]()>!])/g, '$1').replace(/[ \t]+$/gm, '');
function fromCaption(raw, fallbackTitle) {
  const lines = unesc(raw).split('\n');
  const first = lines.find(l => l.trim()) || fallbackTitle;
  const title = first.replace(/[<>]/g, '').trim().slice(0, 100);
  const tags = [];
  const body = [];
  for (const l of lines) {
    const hs = l.match(/#[^\s#]+/g);
    if (hs && l.replace(/#[^\s#]*/g, '').trim() === '') { for (const h of hs) if (!tags.includes(h)) tags.push(h); continue; }   // 해시태그만 있는 줄
    if (/^#\s*$/.test(l.trim())) continue;
    if (/팔로우하면/.test(l)) continue;
    body.push(l);
  }
  if (!tags.includes('#SHIFTPLAY')) tags.push('#SHIFTPLAY');
  while (tags.length > 5) tags.splice(tags.length - 2, 1);   // #SHIFTPLAY 는 남기고 5개로
  const description = [...body.join('\n').replace(/\n{3,}/g, '\n\n').trim().split('\n'), '', ...FOOT, '', tags.join(' ')].join('\n').replace(/[<>]/g, '').slice(0, 4900);
  return { title, description, tags: tags.map(t => t.slice(1)) };
}
function playlistFor(title, caption, hhmm) {
  if (hhmm === '1200' && !/계산/.test(caption)) return '희한한 신작';
  for (const src of [title, caption]) for (const p of PLAYLISTS) if (p.re.test(src)) return p.name;
  return null;
}

// ── 올릴 항목 모으기 ──
const now = Date.now();
const folders = (await driveList(PLAY_FOLDER)).filter(f => f.mimeType === 'application/vnd.google-apps.folder' && /^\d{4}-\d{2}-\d{2}$/.test(f.name));
const extraDates = new Set([...extraKeys].map(k => k.split('/')[0]));
const lo = kstDate(new Date(now - LATE_H * 3600e3)), hi = kstDate(new Date(now + AHEAD_H * 3600e3));
const items = [];
for (const f of folders) {
  if (!((f.name >= lo && f.name <= hi) || extraDates.has(f.name))) continue;
  const files = await driveList(f.id);
  const byName = Object.fromEntries(files.map(x => [x.name, x]));
  const holdAll = files.some(x => /^(보류|hold)(?!\s*\d{4})/i.test(x.name));
  for (const v of files) {
    const m = v.name.match(/^(\d{4}) (.+) 유튜브\.mp4$/);
    if (!m) continue;
    const [, hhmm, name] = m, key = `${f.name}/${hhmm}`;
    const publishAt = Date.parse(`${f.name}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00+09:00`);
    const inWindow = publishAt > now - LATE_H * 3600e3 && publishAt <= now + AHEAD_H * 3600e3;
    if (!inWindow && !extraKeys.has(key)) continue;
    const held = holdAll || holdKeys.has(key) || files.some(x => new RegExp(`^(보류|hold)\\s*${hhmm}`, 'i').test(x.name));
    const cap = byName[`${hhmm} ${name} 캡션(긴 판).txt`] || byName[`${hhmm} ${name} 캡션.txt`];
    const thumb = byName[`${hhmm} ${name} 썸네일.jpg`] || byName[`${hhmm} ${name} 표지.jpg`];
    items.push({ key, date: f.name, hhmm, name, publishAt, held, fileId: v.id, size: +v.size || 0, capId: cap?.id || null, thumbId: thumb?.id || null });
  }
}
items.sort((a, b) => a.publishAt - b.publishAt);
const todo = items.filter(it => !posted[it.key]?.videoId && !it.held && !posted[it.key]?.skip);
console.log(`날짜 폴더 ${lo}~${hi}${extraKeys.size ? ` + 밀린 편 ${extraKeys.size}` : ''} · 항목 ${items.length}개 · 올릴 것 ${todo.length}개${items.some(i => i.held) ? ` · 보류 ${items.filter(i => i.held).length}` : ''}`);

function writeStatus(message) {
  const all = items.map(it => { const p = posted[it.key] || {}; return { key: it.key, title: p.title || it.name, at: p.publishAt || kstIso(new Date(it.publishAt)),
    status: it.held ? 'hold' : p.videoId ? 'scheduled' : p.error ? 'failed' : 'pending', videoId: p.videoId || null, playlist: p.playlist || null, note: p.error || p.note || null }; });
  fs.writeFileSync(statusFile, JSON.stringify({ updated: kstIso(), message, via: 'youtube-api', channel: PLAY_CHANNEL, items: all }, null, 1) + '\n');
}

const token = await accessToken();
const ch = await yt(token, 'channels?part=id,snippet&mine=true');
const me = ch.items?.[0];
if (!me || me.id !== PLAY_CHANNEL) {
  const msg = `키의 채널이 '시프트 플레이'가 아님 (${me?.snippet?.title || '없음'} ${me?.id || ''}) — 아무것도 올리지 않음. 연결할 때 '시프트 플레이' 채널을 골라 다시 발급해 주세요.`;
  console.error(msg); writeStatus(msg); process.exit(1);
}
console.log(`유튜브 채널: ${me.snippet.title}`);
const lists = (await yt(token, 'playlists?part=snippet&mine=true&maxResults=50')).items || [];
const listId = name => lists.find(p => String(p.snippet?.title || '').startsWith(name))?.id || null;
if (MODE === 'check') {
  console.log(`재생목록: ${lists.map(p => p.snippet.title).join(' / ') || '없음'}`);
  for (const it of todo) console.log(`올릴 예정: ${it.key} ${it.name} (${(it.size / 1e6).toFixed(1)}MB)`);
  writeStatus(`연결 확인 ${kstIso()} · 올릴 것 ${todo.length}편`); process.exit(0);
}
if (!todo.length) { writeStatus('올릴 PLAY 쇼츠 없음'); console.log('올릴 PLAY 쇼츠 없음'); process.exit(0); }

// 채널에 이미 있는 제목
const up = me && (await yt(token, 'channels?part=contentDetails&mine=true')).items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
const have = new Map(up ? ((await yt(token, `playlistItems?part=snippet&maxResults=50&playlistId=${up}`)).items || []).map(x => [String(x.snippet?.title || '').trim(), x.snippet?.resourceId?.videoId]) : []);

// 자리 잡기: 제시간 편 먼저, 늦은 편은 12:00·18:00 중 비는 가장 가까운 미래 자리
const taken = [...Object.values(posted).map(p => Date.parse(p.publishAt || '')), ...items.filter(i => !i.held).map(i => i.publishAt)].filter(t => t > now);
const free = t => !taken.some(x => Math.abs(x - t) < 3600e3);
const onTime = todo.filter(it => it.publishAt - now >= 40 * 60e3), late = todo.filter(it => it.publishAt - now < 40 * 60e3);
for (const it of onTime) it.at = it.publishAt;
for (const it of late) {
  for (let d = 0; d < 8 && !it.at; d++) for (const s of LATE_SLOTS) {
    const t = Date.parse(`${kstDate(new Date(now + d * 864e5))}T${s}:00+09:00`);
    if (t - now >= 40 * 60e3 && free(t)) { it.at = t; taken.push(t); break; }
  }
}

let n = 0, failed = 0;
for (const it of [...onTime, ...late].filter(i => i.at).sort((a, b) => a.at - b.at)) {
  if (n >= MAX_PER_RUN) break;
  try {
    const cap = it.capId ? await driveGet(it.capId, true) : '';
    const c = fromCaption(cap, it.name);
    const dup = have.get(c.title);
    if (dup) { posted[it.key] = { videoId: dup, title: c.title, at: kstIso(), note: '같은 제목이 이미 채널에 있어 올리지 않음' }; console.log(`건너뜀(이미 있음): ${it.key} → ${dup}`); continue; }
    const pl = playlistFor(c.title, unesc(cap), it.hhmm);
    const meta = { snippet: { title: c.title, description: c.description, categoryId: '20', defaultLanguage: 'ko', defaultAudioLanguage: 'ko', tags: ['SHIFT PLAY', '게임', 'Shorts', ...c.tags].slice(0, 12) },
      status: { privacyStatus: 'private', publishAt: new Date(it.at).toISOString(), selfDeclaredMadeForKids: false, containsSyntheticMedia: false } };
    console.log(`── ${it.key} → ${kstIso(new Date(it.at))}${it.at !== it.publishAt ? ' (자리 옮김)' : ''} "${c.title}" · 재생목록 ${pl || '없음'}`);
    if (DRY) { n++; continue; }
    const buf = await driveGet(it.fileId);
    if (buf.length < 50e3) throw new Error(`영상 파일이 너무 작음 (${buf.length} bytes) — 드라이브 동기화 전일 수 있음`);
    const v = await upload(token, buf, meta);
    posted[it.key] = { videoId: v.id, publishAt: kstIso(new Date(it.at)), title: c.title, at: kstIso() };
    have.set(c.title, v.id);
    console.log(`   예약됨: https://youtube.com/shorts/${v.id}`); n++;
    if (it.thumbId) { try { await setThumbnail(token, v.id, await driveGet(it.thumbId)); console.log('   썸네일 설정'); } catch (e) { posted[it.key].note = e.message; console.error(`   ${e.message}`); } }
    const pid = pl && listId(pl);
    if (pid) { try { await yt(token, 'playlistItems?part=snippet', { method: 'POST', body: JSON.stringify({ snippet: { playlistId: pid, resourceId: { kind: 'youtube#video', videoId: v.id } } }) }); posted[it.key].playlist = pl; console.log(`   재생목록: ${pl}`); } catch (e) { console.error(`   재생목록 실패: ${e.message}`); } }
    await sleep(3000);
  } catch (e) {
    failed++; console.error(`   실패: ${it.key} — ${e.message}`);
    const tries = (posted[it.key]?.tries || 0) + 1;
    posted[it.key] = { ...(posted[it.key] || {}), tries, lastError: e.message, error: tries >= 3 ? e.message : undefined, skip: tries >= 3 || undefined, at: kstIso() };
    if (/quota|403/i.test(e.message)) break;
  }
}
if (!DRY) fs.writeFileSync(postedFile, JSON.stringify(posted, null, 1) + '\n');
writeStatus(`${kstIso().slice(5, 16)} PLAY 쇼츠 ${n}편 예약${failed ? ` · 실패 ${failed}편` : ''}${DRY ? ' (미리보기)' : ''}`);
console.log(`완료: ${n}편${failed ? ` · 실패 ${failed}편` : ''}`);
