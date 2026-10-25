// 릴스 업로드 기록을 저장소 최신본과 합쳐서 push (동시에 돈 실행끼리 충돌해도 기록이 사라지지 않게)
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const sh = c => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } };
const mine = read('reels/posted.json'), status = fs.existsSync('reels/status.json') ? fs.readFileSync('reels/status.json', 'utf8') : null;
const rank = r => !r ? 0 : r.status === 'ok' ? 3 : r.status === 'failed' || r.status === 'expired' ? 2 : 1;
for (let i = 1; i <= 4; i++) {
  sh('git fetch -q origin main'); sh('git reset -q --hard origin/main');
  const theirs = read('reels/posted.json'), out = { ...theirs };
  for (const [id, rec] of Object.entries(mine)) {
    const t = out[id] || {}; const m = { ...t };
    for (const [k, v] of Object.entries(rec)) {
      if (k.startsWith('_')) m[k] = Math.max(t[k] || 0, v || 0);
      else if (rank(v) >= rank(t[k])) m[k] = v;
    }
    out[id] = m;
  }
  fs.writeFileSync('reels/posted.json', JSON.stringify(out, null, 1) + '\n');
  if (status) fs.writeFileSync('reels/status.json', status);
  sh('git add reels/posted.json reels/status.json');
  if (!sh('git status --porcelain reels').trim()) { console.log('바뀐 기록 없음'); process.exit(0); }
  sh('git commit -q -m "릴스 업로드 기록"');
  try { sh('git push -q origin HEAD:main'); console.log('기록 저장 완료'); process.exit(0); }
  catch (e) { console.log(`push 재시도 ${i}`); await new Promise(r => setTimeout(r, 3000 * i)); }
}
console.error('기록 저장 실패'); process.exit(1);
