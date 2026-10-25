// 이번에 만든 카드 이미지와 글을 구글 드라이브 SHIFT-autopilot/쓰레드/<날짜>/<시각-형식>/ 에 복사 (tools/drive-hook.gs 웹 앱 경유)
// GitHub 비밀값 DRIVE_HOOK_URL 이 없으면 아무것도 하지 않음
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const URL_ = process.env.DRIVE_HOOK_URL;
if (!URL_) { console.log('DRIVE_HOOK_URL 없음 → 드라이브 복사 건너뜀'); process.exit(0); }
const lastFile = path.join(ROOT, 'media/_last-rendered.json');
const ids = fs.existsSync(lastFile) ? JSON.parse(fs.readFileSync(lastFile, 'utf8')) : [];
const items = {};
for (const f of fs.readdirSync(path.join(ROOT, 'queue')).filter(f => f.endsWith('.json'))) try { for (const it of JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', f), 'utf8'))) items[it.id] = it; } catch {}
const kst = iso => new Date(Date.parse(iso) + 9 * 3600e3).toISOString();
let fail = 0;
for (const id of ids) {
  const it = items[id]; if (!it) continue;
  const dir = path.join(ROOT, 'media', id);
  const pngs = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort() : [];
  const t = kst(it.at), date = t.slice(0, 10), folder = `${t.slice(11, 13)}${t.slice(14, 16)}-${it.format || 'post'}`;
  const text = `게시 예정: ${date} ${t.slice(11, 16)} (쓰레드)\n주제 태그: ${it.topic || '-'}\n\n${(it.parts || []).map((p, i) => (i ? `── 이어지는 답글 ${i} ──\n` : '') + p).join('\n\n')}\n`;
  const body = { date, folder, files: [{ name: '글.txt', text }, ...pngs.map(n => ({ name: n, mime: 'image/png', data: fs.readFileSync(path.join(dir, n)).toString('base64') }))] };
  try {
    const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'follow' });
    const j = await r.json().catch(() => ({}));
    if (j.ok) console.log(`드라이브 저장: ${date}/${folder} (카드 ${pngs.length}장 + 글)`); else { fail++; console.log(`드라이브 저장 실패 ${id}: ${j.error || r.status}`); }
  } catch (e) { fail++; console.log(`드라이브 저장 실패 ${id}: ${e.message}`); }
}
if (fail) process.exitCode = 0;   // 드라이브 실패가 카드 저장을 막지 않게
