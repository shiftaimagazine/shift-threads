// 매일 성과 수집: 최근 글별 조회·좋아요·답글·리포스트·공유 + 팔로워 수 → stats/
import fs from 'node:fs';
import path from 'node:path';
const API = 'https://graph.threads.net/v1.0', T = process.env.THREADS_TOKEN;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const get = async (u, p = {}) => { const r = await fetch(API + u + '?' + new URLSearchParams({ ...p, access_token: T })); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j; };
const sum = d => Object.fromEntries((d.data || []).map(m => [m.name, m.total_value?.value ?? m.values?.at(-1)?.value ?? 0]));
const me = await get('/me', { fields: 'id,username' });
let followers = null;
try { followers = sum(await get(`/${me.id}/threads_insights`, { metric: 'followers_count' })).followers_count; } catch (e) { console.error('팔로워 수 실패:', e.message); }
const posted = fs.existsSync(path.join(ROOT, 'posted.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'posted.json'), 'utf8')) : {};
const byPostId = {}; for (const [k, v] of Object.entries(posted)) if (v.ids?.[0]) byPostId[v.ids[0]] = k;
const meta = {}; for (const f of fs.readdirSync(path.join(ROOT, 'queue')).filter(f => f.endsWith('.json'))) try { for (const it of JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', f), 'utf8'))) meta[it.id] = it; } catch {}
const list = await get(`/${me.id}/threads`, { fields: 'id,timestamp,text,permalink,media_type,is_reply', limit: 60 });
const posts = [];
for (const p of (list.data || []).filter(p => !p.is_reply)) {
  let m = {}; try { m = sum(await get(`/${p.id}/insights`, { metric: 'views,likes,replies,reposts,quotes,shares' })); } catch {}
  const qid = byPostId[p.id], q = meta[qid] || {};
  posts.push({ at: p.timestamp, id: qid || null, format: q.format || null, type: q.type || p.media_type, hook: (p.text || '').split('\n')[0].slice(0, 80), link: p.permalink, ...m,
    score: (m.views ? Math.round(((m.replies || 0) * 3 + (m.reposts || 0) * 4 + (m.quotes || 0) * 4 + (m.shares || 0) * 3 + (m.likes || 0)) / m.views * 1000) : null) });
}
fs.mkdirSync(path.join(ROOT, 'stats'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'stats/latest.json'), JSON.stringify({ updated: new Date().toISOString(), followers, posts }, null, 1) + '\n');
const csv = path.join(ROOT, 'stats/followers.csv');
if (!fs.existsSync(csv)) fs.writeFileSync(csv, 'date,followers\n');
if (followers != null) fs.appendFileSync(csv, `${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)},${followers}\n`);
console.log(`팔로워 ${followers} · 글 ${posts.length}개 수집`);
