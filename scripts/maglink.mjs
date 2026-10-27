// 쓰레드 글 → SHIFT AI 매거진 연결 (2026-10-27 사용자 요청).
// 올리기 직전(post.yml)에 돌아서, 아직 안 올라간 글의 마지막 답글(출처 답글)에 매거진 주소 한 줄을 붙인다.
//  - 아침 브리핑(briefing): 그날 매거진 데일리 이슈가 있으면 → /daily/<날짜>/
//  - 그 밖의 글: sources 의 원문 주소가 매거진 기사의 원문과 같으면 → /news/<기사 id>/
// 본문(parts[0])에는 링크를 넣지 않는다. 날짜(큐 파일)마다 최대 2개. 이미 매거진 주소가 있으면 건너뜀.
// 매거진 데이터는 공개 사이트의 /assets/data.js 를 읽는다(토큰 필요 없음). 실패하면 아무것도 바꾸지 않는다.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const SITE = 'https://shiftaimagazine.com';
const TAG = '?utm_source=threads';
const MAX_PER_DAY = 2, LIMIT = 480;

const norm = u => { try { const x = new URL(u); x.hash = ''; return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search).toLowerCase(); } catch { return ''; } };
const kstDate = d => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

let js;
try {
  if (process.env.MAG_DATA) js = fs.readFileSync(process.env.MAG_DATA, 'utf8'); else {
  const r = await fetch(`${SITE}/assets/data.js?t=${Date.now()}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  js = await r.text(); }
} catch (e) { console.log(`매거진 데이터 못 읽음 — 건너뜀 (${e.message})`); process.exit(0); }
const data = {};
for (const line of js.split('\n')) { const m = line.match(/^const (\w+) = (.*);$/); if (m) { try { data[m[1]] = JSON.parse(m[2]); } catch {} } }
const ARTICLES = data.ARTICLES || [], DAILY = data.DAILY || [];
if (!ARTICLES.length) { console.log('매거진 기사 없음 — 건너뜀'); process.exit(0); }

const bySource = new Map();
for (const a of ARTICLES) for (const [, u] of a.sources || []) { const k = norm(u); if (k && !bySource.has(k)) bySource.set(k, a.id); }
const dailyDates = new Set(DAILY.map(d => d.date));

const postedFile = path.join(ROOT, 'posted.json');
const posted = fs.existsSync(postedFile) ? JSON.parse(fs.readFileSync(postedFile, 'utf8')) : {};
const today = kstDate(new Date()), tomorrow = kstDate(new Date(Date.now() + 864e5));
// 이미 매거진 주소가 있는지: 옛 주소·새 주소 모두 (2026-10-28: 10/27 도메인을 바꾸면서 옛 주소만 찾아, 매시 실행마다 같은 줄이 또 붙던 문제)
const hasMag = p => /shiftaimagazine\.(com|github\.io)/.test(p);
// 이미 여러 번 붙은 같은 줄은 하나만 남김 (안 올라간 글만)
const dedupe = text => { const seen = new Set(); return text.split('\n').filter(l => !(hasMag(l) && l.includes(' → ')) || (!seen.has(l) && seen.add(l))).join('\n'); };

let changed = 0, cleaned = 0;
for (const day of [today, tomorrow]) {
  const f = path.join(ROOT, 'queue', `${day}.json`);
  if (!fs.existsSync(f)) continue;
  const q = JSON.parse(fs.readFileSync(f, 'utf8'));
  let used = q.filter(it => (it.parts || []).slice(1).some(hasMag)).length;
  let dirty = false;
  for (const it of q) {
    if (posted[it.id] || !Array.isArray(it.parts)) continue;
    for (let k = 1; k < it.parts.length; k++) { const d = dedupe(it.parts[k]); if (d !== it.parts[k]) { it.parts[k] = d; dirty = true; cleaned++; console.log(`겹친 매거진 줄 정리: ${it.id}`); } }
  }
  for (const it of q) {
    if (used >= MAX_PER_DAY) break;
    if (posted[it.id] || !Array.isArray(it.parts) || it.parts.length < 2) continue;
    const last = it.parts.length - 1;
    if (it.parts.slice(1).some(hasMag)) continue;
    let line = '';
    if (it.format === 'briefing' && dailyDates.has(day)) line = `오늘 AI 소식 전체 정리는 매거진에서 → ${SITE}/daily/${day}/${TAG}`;
    else {
      const id = (it.sources || []).map(norm).map(k => bySource.get(k)).find(Boolean);
      if (id) line = `매거진에서 자세히 읽기 → ${SITE}/news/${id}/${TAG}`;
    }
    if (!line) continue;
    const lines = it.parts[last].split('\n');
    const ig = lines.findIndex(l => l.startsWith('영상으로 30초'));
    if (ig >= 0) lines.splice(ig, 0, line); else lines.push(line);
    const text = lines.join('\n');
    if ([...text].length > LIMIT) { console.log(`길이 초과라 건너뜀: ${it.id}`); continue; }
    it.parts[last] = text; used++; dirty = true; changed++;
    console.log(`매거진 연결: ${it.id} → ${line.split(' → ')[1]}`);
  }
  if (dirty) fs.writeFileSync(f, JSON.stringify(q, null, 1) + '\n');
}
console.log(changed ? `매거진 링크 ${changed}개 붙임` : '붙일 매거진 링크 없음');
if (cleaned) console.log(`겹친 매거진 줄 ${cleaned}곳 정리`);
