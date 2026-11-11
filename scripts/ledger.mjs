// 채널 성과 장부(ledger/). 하루 한 번, 로그인·크롬 없이 숫자를 한곳에 모은다. (2026-11-11 추가)
//   · 유튜브 두 채널(시프트 AI · 시프트 플레이)의 공개 수치: 구독자, 영상별 조회·좋아요·댓글
//   · 스레드: stats/latest.json(성과 수집이 만든 것)에서 팔로워, 최근 7일 조회, 조회 상위 실용 팁
//   · 글이나 영상을 올리지 않는다. 읽기만 한다.
// 비밀값: YT_CLIENT_ID · YT_CLIENT_SECRET · YT_REFRESH_TOKEN (유튜브 업로드와 같은 것. 다른 채널의 공개 수치도 이 키로 읽힌다)
// 결과: ledger/youtube.json(최신) · ledger/videos.csv(최근 14일 영상의 날짜별 조회, 쌓임) · ledger/history.csv(채널 합계, 쌓임)
//       ledger/top-tips.json(스레드 조회 상위 팁 → 릴스·쇼츠 주제 후보) · ledger/README.md(사람이 읽는 요약)
import fs from 'node:fs';

const CHANNELS = [
  { key: 'ai', name: '시프트 AI', id: 'UCWzwTQoe0q2IdwZV6BuopVw' },
  { key: 'play', name: '시프트 플레이', id: 'UCjZ398yiclS8zPeJ-kbEWYg' },
];
const KST = 9 * 3600 * 1000;
const kdate = (t) => new Date(new Date(t).getTime() + KST).toISOString().slice(0, 10);
const today = kdate(Date.now());
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const csv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const dur = (iso) => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || ''); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : null; };

async function accessToken() {
  for (const k of ['YT_CLIENT_ID', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN']) if (!process.env[k]) throw new Error(`${k} 비밀값이 없습니다.`);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
    client_id: process.env.YT_CLIENT_ID, client_secret: process.env.YT_CLIENT_SECRET, refresh_token: process.env.YT_REFRESH_TOKEN, grant_type: 'refresh_token' }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`유튜브 키 갱신 실패: ${j.error_description || j.error || r.status}`);
  return j.access_token;
}
async function yt(token, path, params) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}?` + new URLSearchParams(params), { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status} ${j.error?.message || ''}`);
  return j;
}
async function channel(token, c) {
  const ch = (await yt(token, 'channels', { part: 'statistics,contentDetails', id: c.id })).items?.[0];
  if (!ch) throw new Error(`${c.name} 채널을 찾지 못했습니다.`);
  const pl = ch.contentDetails?.relatedPlaylists?.uploads;
  const ids = [];
  let page = '';
  for (let i = 0; i < 4 && pl; i++) {   // 최근 200편까지
    const it = await yt(token, 'playlistItems', { part: 'contentDetails', maxResults: '50', playlistId: pl, ...(page ? { pageToken: page } : {}) });
    for (const x of it.items || []) if (x.contentDetails?.videoId) ids.push(x.contentDetails.videoId);
    page = it.nextPageToken || '';
    if (!page) break;
  }
  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const v = await yt(token, 'videos', { part: 'snippet,statistics,contentDetails,status', id: ids.slice(i, i + 50).join(',') });
    for (const x of v.items || []) {
      if (x.status?.privacyStatus !== 'public') continue;   // 예약·비공개는 세지 않는다
      videos.push({ id: x.id, title: x.snippet?.title || '', at: x.snippet?.publishedAt, date: kdate(x.snippet?.publishedAt), sec: dur(x.contentDetails?.duration),
        views: num(x.statistics?.viewCount) ?? 0, likes: num(x.statistics?.likeCount) ?? 0, comments: num(x.statistics?.commentCount) ?? 0 });
    }
  }
  videos.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { key: c.key, name: c.name, id: c.id, subs: ch.statistics?.hiddenSubscriberCount ? null : num(ch.statistics?.subscriberCount), totalViews: num(ch.statistics?.viewCount), videoCount: num(ch.statistics?.videoCount), videos };
}

function daysAgo(d) { return Math.round((new Date(today) - new Date(d)) / 86400000); }
function summarize(c) {
  const settled = c.videos.filter((v) => { const n = daysAgo(v.date); return n >= 2 && n <= 8; });   // 올린 지 2~8일: 조회가 대체로 쌓인 편
  const before = c.videos.filter((v) => { const n = daysAgo(v.date); return n >= 9 && n <= 15; });
  const last = c.videos[0];
  return { settledN: settled.length, settledMedian: median(settled.map((v) => v.views)), beforeN: before.length, beforeMedian: median(before.map((v) => v.views)),
    uploads7: c.videos.filter((v) => daysAgo(v.date) <= 6).length, lastDate: last?.date || null, quietDays: last ? daysAgo(last.date) : null };
}

function threads() {
  try {
    const s = JSON.parse(fs.readFileSync('stats/latest.json', 'utf8'));
    const posts = (s.posts || []).filter((p) => p.at);
    const within = (p, n) => (Date.now() - new Date(p.at).getTime()) / 86400000 <= n;
    const tips = posts.filter((p) => p.format === 'howto' && within(p, 14)).sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5)
      .map((p) => ({ id: p.id, date: kdate(p.at), hook: p.hook, views: p.views || 0, likes: p.likes || 0, link: p.link }));
    const byFmt = {};
    for (const p of posts.filter((p) => within(p, 14))) (byFmt[p.format || '기타'] ||= []).push(p.views || 0);
    return { followers: s.followers ?? null, updated: s.updated, views7: posts.filter((p) => within(p, 7)).reduce((a, p) => a + (p.views || 0), 0), posts7: posts.filter((p) => within(p, 7)).length,
      medianByFormat14: Object.fromEntries(Object.entries(byFmt).map(([k, v]) => [k, { n: v.length, median: median(v) }])), tips };
  } catch (e) { return { error: String(e.message || e) }; }
}

function appendCsv(file, header, rows, keyCols) {   // 같은 날 다시 돌려도 줄이 겹치지 않게 (keyCols 가 같은 줄은 새 값으로 바꿈)
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
  const body = old.length ? old.slice(1) : [];
  const keyOf = (line) => line.split(',').slice(0, keyCols).join(',');
  const fresh = new Map(rows.map((r) => [r.slice(0, keyCols).map(csv).join(','), r.map(csv).join(',')]));
  const kept = body.filter((l) => !fresh.has(keyOf(l)));
  fs.writeFileSync(file, [header.join(','), ...kept, ...fresh.values()].join('\n') + '\n');
}

const out = { updated: new Date().toISOString(), date: today, channels: {}, errors: [] };
fs.mkdirSync('ledger', { recursive: true });
try {
  const token = await accessToken();
  for (const c of CHANNELS) {
    try { const d = await channel(token, c); out.channels[c.key] = { ...d, summary: summarize(d) }; }
    catch (e) { out.errors.push(`${c.name}: ${e.message}`); }
  }
} catch (e) { out.errors.push(String(e.message || e)); }
out.threads = threads();

const chs = Object.values(out.channels);
if (chs.length) {
  fs.writeFileSync('ledger/youtube.json', JSON.stringify(out, null, 1) + '\n');
  appendCsv('ledger/history.csv', ['date', 'channel', 'subs', 'totalViews', 'videoCount', 'uploads7', 'settledMedian', 'settledN'],
    chs.map((c) => [today, c.key, c.subs ?? '', c.totalViews ?? '', c.videoCount ?? '', c.summary.uploads7, c.summary.settledMedian ?? '', c.summary.settledN]), 2);
  appendCsv('ledger/videos.csv', ['date', 'channel', 'videoId', 'published', 'views', 'likes', 'comments', 'sec', 'title'],
    chs.flatMap((c) => c.videos.filter((v) => daysAgo(v.date) <= 14).map((v) => [today, c.key, v.id, v.date, v.views, v.likes, v.comments, v.sec ?? '', v.title])), 3);
}
if (out.threads?.tips) fs.writeFileSync('ledger/top-tips.json', JSON.stringify({ updated: out.updated, note: '스레드 최근 14일 실용 팁 조회 상위 5개 — 릴스·쇼츠(T 형식) 주제 후보', tips: out.threads.tips }, null, 1) + '\n');

const L = [`# 채널 성과 장부 (${today})`, '', '매일 05:50쯤 자동으로 다시 써져요. 유튜브는 공개 수치, 스레드는 성과 수집 값이에요. 인스타그램은 아직 여기에 없어요.', ''];
for (const c of chs) {
  const s = c.summary;
  L.push(`## 유튜브 ${c.name}`, '', `- 구독자 ${c.subs ?? '숨김'} · 채널 누적 조회 ${c.totalViews?.toLocaleString() ?? '?'} · 공개 영상 ${c.videos.length}편`,
    `- 올린 지 2~8일 된 편: ${s.settledN}편, 조회 중앙값 ${s.settledMedian ?? '-'} (그 전 주 9~15일: ${s.beforeN}편, 중앙값 ${s.beforeMedian ?? '-'})`,
    `- 최근 7일 업로드 ${s.uploads7}편 · 마지막 업로드 ${s.lastDate ?? '-'}${s.quietDays >= 2 ? ` (**${s.quietDays}일째 새 편 없음**)` : ''}`, '',
    '| 올린 날 | 조회 | 좋아요 | 댓글 | 길이(초) | 제목 |', '| --- | ---: | ---: | ---: | ---: | --- |',
    ...c.videos.slice(0, 15).map((v) => `| ${v.date} | ${v.views.toLocaleString()} | ${v.likes} | ${v.comments} | ${v.sec ?? ''} | [${v.title.replace(/\|/g, '/')}](https://youtube.com/shorts/${v.id}) |`), '');
}
const t = out.threads || {};
if (!t.error) {
  L.push('## 스레드', '', `- 팔로워 ${t.followers ?? '?'} · 최근 7일 글 ${t.posts7}개, 조회 ${t.views7?.toLocaleString()}`,
    `- 최근 14일 형식별 조회 중앙값: ${Object.entries(t.medianByFormat14 || {}).map(([k, v]) => `${k} ${v.median}(${v.n}개)`).join(' · ') || '-'}`, '',
    '조회 상위 실용 팁(릴스·쇼츠 주제 후보):', '', ...(t.tips || []).map((p, i) => `${i + 1}. ${p.views}회 · ${p.date} · [${p.hook}](${p.link})`), '');
}
if (out.errors.length) L.push('## 읽지 못한 것', '', ...out.errors.map((e) => `- ${e}`), '');
fs.writeFileSync('ledger/README.md', L.join('\n'));
console.log(L.join('\n'));
if (!chs.length) process.exitCode = 1;   // 유튜브를 하나도 못 읽었으면 실패로 표시
