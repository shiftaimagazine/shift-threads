// 관제실용 요약 파일 status.json 을 만듦 (queue · posted · inbox · replies · stats 를 한 파일로)
// 클라우드 예약 작업이 이 파일을 구글 드라이브 SHIFT-autopilot/threads-status.json 으로 복사 → 관제실 페이지가 읽음
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return d; } };
const REPO = process.env.GITHUB_REPOSITORY || 'shiftaimagazine/shift-threads';
const kst = d => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const today = kst(new Date()), tomorrow = kst(new Date(Date.now() + 864e5));
const posted = read('posted.json', {});
const stats = read('stats/latest.json', {});
const views = Object.fromEntries((stats.posts || []).filter(p => p.id).map(p => [p.id, p]));
const card = (id, n) => `https://raw.githubusercontent.com/${REPO}/main/media/${id}/${String(n).padStart(2, '0')}.png`;
function day(d) {
  return read(`queue/${d}.json`, []).map(it => {
    const n = fs.existsSync(path.join(ROOT, 'media', it.id)) ? fs.readdirSync(path.join(ROOT, 'media', it.id)).filter(f => f.endsWith('.png')).length : 0;
    const p = posted[it.id] || {}, v = views[it.id] || {};
    return { id: it.id, at: it.at, format: it.format || null, type: it.type || 'text', hook: String(it.parts?.[0] || '').split('\n').filter(Boolean).slice(0, 2).join(' '),
      status: p.status || (Date.parse(it.at) <= Date.now() ? 'waiting' : 'scheduled'), link: p.link || null, cards: [...Array(n)].map((_, k) => card(it.id, k + 1)),
      views: v.views ?? null, likes: v.likes ?? null, replies: v.replies ?? null, sources: it.sources || [],
      topic: it.topic || null, parts: it.parts || [], slides: it.slides || [], photoFrom: it.photoFrom || it.photo || null };
  }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
// 릴스 영상 글 (reels/<날짜>.json → GitHub Actions 가 10:20·18:20 에 올림, 결과는 reels/posted.json)
const reelPosted = read('reels/posted.json', {});
function reelDay(d) {
  const arr = read(`reels/${d}.json`, []);
  return (Array.isArray(arr) ? arr : []).map(it => {
    const p = reelPosted[it.id]?.threads || {};
    return { id: it.id, at: it.at, format: 'reel', type: 'video', hook: String(it.threads?.text || '').split('\n')[0],
      status: p.status || (Date.parse(it.at) <= Date.now() ? 'waiting' : 'scheduled'), link: p.link || null };
  }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
const inbox = read('inbox/pending.json', { items: [] });
const done = read('replies/done.json', {});
const sent = [];
for (const f of fs.existsSync(path.join(ROOT, 'replies')) ? fs.readdirSync(path.join(ROOT, 'replies')).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).sort().slice(-3) : [])
  for (const r of read(`replies/${f}`, [])) if (done[r.reply_to]?.status === 'ok') sent.push({ text: r.text, at: done[r.reply_to].at });
const hist = fs.existsSync(path.join(ROOT, 'stats/followers.csv')) ? fs.readFileSync(path.join(ROOT, 'stats/followers.csv'), 'utf8').trim().split('\n').slice(1).map(l => { const [date, f] = l.split(','); return { date, followers: +f }; }).slice(-45) : [];
const top = (stats.posts || []).filter(p => p.views != null && Date.parse(p.at) > Date.now() - 7 * 864e5).sort((a, b) => b.views - a.views).slice(0, 5)
  .map(p => ({ hook: p.hook, views: p.views, likes: p.likes, replies: p.replies, reposts: p.reposts, link: p.link, at: p.at }));
// 날짜별 진행 현황 (지난 6일 + 앞으로 준비된 모든 날): 관제실 '예약 달력'용
const qdates = fs.existsSync(path.join(ROOT, 'queue')) ? fs.readdirSync(path.join(ROOT, 'queue')).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).map(f => f.slice(0, 10)) : [];
const rdates = fs.existsSync(path.join(ROOT, 'reels')) ? fs.readdirSync(path.join(ROOT, 'reels')).filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f)).map(f => f.slice(0, 10)) : [];
const since = kst(new Date(Date.now() - 6 * 864e5));
const days = [...new Set([...qdates, ...rdates, today, tomorrow])].filter(d => d >= since).sort().map(d => {
  const ps = day(d), c = s => ps.filter(p => p.status === s).length;
  const needCards = ps.filter(p => p.slides.length), cardsReady = needCards.filter(p => p.cards.length).length;
  return { date: d, total: ps.length, ok: c('ok'), failed: ps.filter(p => ['failed', 'partial', 'invalid'].includes(p.status)).length,
    expired: c('expired'), waiting: c('waiting'), scheduled: c('scheduled'), needCards: needCards.length, cardsReady,
    times: ps.map(p => ({ at: p.at, format: p.format, status: p.status, cards: p.cards.length })),
    reels: reelDay(d).map(r => ({ at: r.at, status: r.status })) };
});
const out = { updated: new Date().toISOString(), repo: REPO, followers: stats.followers ?? null, followersHistory: hist,
  today: { date: today, posts: day(today), reels: reelDay(today) }, tomorrow: { date: tomorrow, posts: day(tomorrow), reels: reelDay(tomorrow) },
  comments: { pending: inbox.items?.length || 0, items: (inbox.items || []).slice(0, 10).map(c => ({ user: c.user, text: c.text, at: c.at, post: c.post?.link })), updated: inbox.updated || null },
  replies: { sent: sent.slice(-10).reverse(), total: Object.values(done).filter(d => d.status === 'ok').length },
  days, top };
fs.writeFileSync(path.join(ROOT, 'status.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`status.json: 오늘 ${out.today.posts.length}개 · 내일 ${out.tomorrow.posts.length}개 · 대기 댓글 ${out.comments.pending}`);
