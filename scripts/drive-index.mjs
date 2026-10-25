// 드라이브 동기화용 목록 drive-index.json: 최근·앞으로 3일 글 중 카드가 있는 것 (구글 Apps Script 가 10분마다 읽어 드라이브에 복사)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const kst = iso => new Date(Date.parse(iso) + 9 * 3600e3).toISOString();
const items = [];
for (const f of fs.readdirSync(path.join(ROOT, 'queue')).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f))) {
  let list = []; try { list = JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', f), 'utf8')); } catch { continue; }
  for (const it of list) {
    if (Math.abs(Date.parse(it.at) - Date.now()) > 3 * 864e5) continue;
    const dir = path.join(ROOT, 'media', it.id);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.endsWith('.png')).sort() : [];
    if (!files.length) continue;
    const t = kst(it.at);
    const text = `게시 예정: ${t.slice(0, 10)} ${t.slice(11, 16)} (쓰레드)\n주제 태그: ${it.topic || '-'}\n\n${(it.parts || []).map((p, i) => (i ? `── 이어지는 답글 ${i} ──\n` : '') + p).join('\n\n')}\n`;
    const h = crypto.createHash('sha1').update(text); for (const n of files) h.update(fs.readFileSync(path.join(dir, n)));
    items.push({ id: it.id, date: t.slice(0, 10), folder: `${t.slice(11, 13)}${t.slice(14, 16)}-${it.format || 'post'}`, files, text, sig: h.digest('hex').slice(0, 16) });
  }
}
fs.writeFileSync(path.join(ROOT, 'drive-index.json'), JSON.stringify({ updated: new Date().toISOString(), items }, null, 1) + '\n');
console.log(`drive-index.json: ${items.length}개`);
