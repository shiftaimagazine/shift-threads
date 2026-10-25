// 내 글(최근 48시간)에 달린 댓글을 모아 inbox/pending.json 에 저장 → 클라우드 '댓글 답하기' 작업이 답글을 씀
// 그리고 replies/*.json 에 써 둔 답글 중 아직 안 올린 것을 올림
//   replies/YYYY-MM-DD.json: [{"reply_to":"댓글 id","text":"답글 (500자 이내)"}]
import fs from 'node:fs';
import path from 'node:path';
//   MODE=reply   : 써 둔 답글만 올림 (답글 파일 push 때) — 올릴 게 없으면 API를 부르지 않음
//   MODE=collect : 새 댓글만 모음 (하루 2번, 클라우드 답글 작업 직전)
//   MODE=all     : 둘 다 (수동 실행 기본)
const API = 'https://graph.threads.net/v1.0', T = process.env.THREADS_TOKEN;
const MODE = process.env.MODE || 'all';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MAX_REPLIES_PER_RUN = 15;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(method, u, p = {}) {
  const body = new URLSearchParams({ ...p, access_token: T });
  const r = method === 'GET' ? await fetch(API + u + '?' + body) : await fetch(API + u, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${method} ${u}: ${j.error?.error_user_msg || j.error?.message || r.status}`);
  return j;
}
fs.mkdirSync(path.join(ROOT, 'replies'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'inbox'), { recursive: true });
const doneFile = path.join(ROOT, 'replies/done.json');
const done = fs.existsSync(doneFile) ? JSON.parse(fs.readFileSync(doneFile, 'utf8')) : {};

// 올릴 답글을 먼저 API 없이 추림
const queued = [];
if (MODE !== 'collect') for (const f of fs.readdirSync(path.join(ROOT, 'replies')).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort()) {
  let list = []; try { list = JSON.parse(fs.readFileSync(path.join(ROOT, 'replies', f), 'utf8')); } catch (e) { console.error(f, e.message); continue; }
  for (const r of list) {
    if (!r.reply_to || !r.text || done[r.reply_to]) continue;
    if ([...r.text].length > 500) { done[r.reply_to] = { status: 'invalid' }; continue; }
    queued.push(r);
  }
}
if (MODE === 'reply' && !queued.length) {
  fs.writeFileSync(doneFile, JSON.stringify(done, null, 1) + '\n');
  console.log('올릴 답글 없음 · API 호출 생략'); process.exit(0);
}
const me = await call('GET', '/me', { fields: 'id,username' });

// 1) 써 둔 답글 올리기
let sent = 0;
{
  for (const r of queued) {
    if (sent >= MAX_REPLIES_PER_RUN) break;
    try {
      const c = await call('POST', `/${me.id}/threads`, { media_type: 'TEXT', text: r.text, reply_to_id: r.reply_to });
      await sleep(4000);
      const p = await call('POST', `/${me.id}/threads_publish`, { creation_id: c.id });
      done[r.reply_to] = { status: 'ok', id: p.id, at: new Date().toISOString() }; sent++;
      console.log(`답글 올림 → ${r.reply_to}`);
      await sleep(8000);                       // 몰아서 올리지 않도록 간격
    } catch (e) { console.error(`답글 실패 ${r.reply_to}: ${e.message}`); if (/not found|does not exist|deleted/i.test(e.message)) done[r.reply_to] = { status: 'gone' }; }
  }
}

// 2) 새 댓글 모으기 (최근 48시간 내 글) — collect·all 모드에서만 (글마다 API 1회라 하루 2번만 돈다)
if (MODE === 'reply') { fs.writeFileSync(doneFile, JSON.stringify(done, null, 1) + '\n'); console.log(`답글 ${sent}개 올림`); process.exit(0); }
const since = Date.now() - 48 * 3600e3;
const posts = (await call('GET', `/${me.id}/threads`, { fields: 'id,timestamp,text,permalink,is_reply', limit: 25 })).data || [];
const pending = [];
for (const p of posts.filter(p => !p.is_reply && Date.parse(p.timestamp) > since)) {
  let rs = [];
  try { rs = (await call('GET', `/${p.id}/conversation`, { fields: 'id,text,username,timestamp,replied_to,hide_status', reverse: 'false' })).data || []; }
  catch (e) { console.error(`댓글 읽기 실패: ${e.message}`); if (/permission|scope/i.test(e.message)) break; continue; }
  const answered = new Set(rs.filter(r => r.username === me.username).map(r => r.replied_to?.id));
  for (const r of rs) {
    if (r.username === me.username || done[r.id] || answered.has(r.id) || r.hide_status === 'HIDDEN') continue;
    pending.push({ id: r.id, user: r.username, text: r.text || '', at: r.timestamp, to: r.replied_to?.id === p.id ? 'post' : 'thread',
      post: { id: p.id, hook: (p.text || '').split('\n').slice(0, 3).join(' ').slice(0, 200), link: p.permalink } });
  }
}
fs.writeFileSync(path.join(ROOT, 'inbox/pending.json'), JSON.stringify({ updated: new Date().toISOString(), count: pending.length, items: pending }, null, 1) + '\n');
fs.writeFileSync(doneFile, JSON.stringify(done, null, 1) + '\n');
console.log(`답글 ${sent}개 올림 · 새 댓글 ${pending.length}개 대기`);
