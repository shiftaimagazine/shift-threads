// 뉴스 후보 수집 (GitHub Actions, 매일 20:50 KST — 21:24 글쓰기 작업 직전)
//   news-sources.json 의 RSS/Atom 피드에서 최근 36시간 소식을 모아 trends/news-<KST 날짜>.json 과 trends/news-latest.json 에 저장.
//   글쓰기 작업은 웹 검색 대신 이 파일에서 글감을 고르고, 쓰기로 한 소식만 원문을 열어 사실을 확인한다 (토큰 1/3, 1차 출처 우선).
//   외부 패키지 없음. 피드가 죽어도 나머지는 계속 (결과는 trends/news-sources-status.json 에 기록).
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HOURS = +(process.env.NEWS_HOURS || 36);
const MAX = +(process.env.NEWS_MAX || 120);
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'news-sources.json'), 'utf8'));
const kst = d => new Date(d.getTime() + 9 * 3600e3).toISOString();
const since = Date.now() - HOURS * 3600e3;
const AI_RE = /\b(AI|A\.I\.|LLM|GPT|ChatGPT|OpenAI|Anthropic|Claude|Gemini|DeepMind|Copilot|Llama|Mistral|Sora|Veo|Midjourney|Stable Diffusion|diffusion|transformer|machine learning|deep learning|neural|agent|agentic|chatbot|robot)\b|인공지능|에이아이|생성형|챗GPT|챗봇|클로드|제미나이|오픈AI|딥마인드|엔비디아|로봇|에이전트/i;

const unesc = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/\s+/g, ' ').trim();
const tag = (x, names) => { for (const n of names) { const m = x.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, 'i')); if (m) return m[1]; } return ''; };
const attrLink = x => { const m = x.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || x.match(/<link[^>]*href=["']([^"']+)["']/i); return m ? m[1] : ''; };

function parse(xml) {
  const out = [];
  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = unesc(tag(b, ['title']));
    let link = unesc(tag(b, ['link'])); if (!link || !/^https?:/.test(link)) link = attrLink(b) || unesc(tag(b, ['guid', 'id']));
    const date = unesc(tag(b, ['pubDate', 'published', 'updated', 'dc:date']));
    const summary = unesc(tag(b, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 320);
    const t = Date.parse(date);
    if (!title || !/^https?:/.test(link)) continue;
    out.push({ title, link, published: Number.isFinite(t) ? new Date(t).toISOString() : null, summary });
  }
  return out;
}

const items = [], status = [];
await Promise.all(sources.map(async s => {
  const rec = { name: s.name, url: s.url, ok: false, items: 0, fresh: 0, note: '' };
  try {
    const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 20000);
    const r = await fetch(s.url, { signal: ac.signal, headers: { 'User-Agent': 'Mozilla/5.0 (SHIFT AI news collector)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } });
    clearTimeout(to);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const list = parse(await r.text());
    rec.ok = true; rec.items = list.length;
    for (const it of list) {
      if (it.published && Date.parse(it.published) < since) continue;
      if (s.filter && !AI_RE.test(`${it.title} ${it.summary}`)) continue;
      items.push({ source: s.name, kind: s.kind || 'media', lang: s.lang || 'en', official: !!s.official, ...it });
      rec.fresh++;
    }
  } catch (e) { rec.note = String(e.message || e).slice(0, 120); }
  status.push(rec);
}));

// 중복 제거(같은 링크·거의 같은 제목) → 공식 출처·최신 순
const seen = new Set();
const norm = t => t.toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ').trim().slice(0, 60);
const uniq = items.filter(it => { const k1 = it.link.replace(/[?#].*$/, ''), k2 = norm(it.title); if (seen.has(k1) || seen.has(k2)) return false; seen.add(k1); seen.add(k2); return true; })
  .sort((a, b) => (b.official - a.official) || (Date.parse(b.published || 0) - Date.parse(a.published || 0))).slice(0, MAX);

const today = kst(new Date()).slice(0, 10);
fs.mkdirSync(path.join(ROOT, 'trends'), { recursive: true });
const out = { updated: new Date().toISOString(), kstDate: today, windowHours: HOURS, note: '글쓰기 작업용 뉴스 후보. 쓰기로 한 소식은 반드시 link 원문을 열어 숫자·날짜를 확인할 것. summary 는 피드 요약이라 사실 확인 근거로 쓰지 않음.', items: uniq };
fs.writeFileSync(path.join(ROOT, 'trends', `news-${today}.json`), JSON.stringify(out, null, 1) + '\n');
fs.writeFileSync(path.join(ROOT, 'trends', 'news-latest.json'), JSON.stringify(out, null, 1) + '\n');
fs.writeFileSync(path.join(ROOT, 'trends', 'news-sources-status.json'), JSON.stringify({ updated: out.updated, sources: status.sort((a, b) => a.name.localeCompare(b.name)) }, null, 1) + '\n');
for (const f of fs.readdirSync(path.join(ROOT, 'trends'))) { const m = f.match(/^news-(\d{4}-\d\d-\d\d)\.json$/); if (m && Date.now() - Date.parse(m[1]) > 8 * 864e5) fs.unlinkSync(path.join(ROOT, 'trends', f)); }
const dead = status.filter(s => !s.ok);
console.log(`뉴스 후보 ${uniq.length}개 (피드 ${status.length}개 중 ${status.length - dead.length}개 정상${dead.length ? `, 실패: ${dead.map(s => `${s.name}(${s.note})`).join(', ')}` : ''})`);
