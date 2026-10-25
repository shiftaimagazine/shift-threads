// SHIFT AI 쓰레드 자동 업로드 (GitHub Actions 에서 실행, PC 불필요)
//   MODE=check  : 키가 정상인지만 확인 (계정 이름 출력, 글은 올리지 않음)
//   MODE=post   : queue/*.json 에서 올릴 시간이 된 글을 올림 (기본)
//   DRY_RUN=1   : 올릴 글만 보여 주고 실제로 올리지 않음
// 큐 파일 형식 (queue/2026-10-25.json):
//   [{"id":"2026-10-25-am","at":"2026-10-25T10:10:00+09:00","topic":"AI","parts":["첫 글 (500자 이내)","이어지는 글(선택)"]}]
//   parts 가 여러 개면 첫 글 아래 답글로 이어 붙여 타래로 올립니다.
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://graph.threads.net/v1.0';
const TOKEN = process.env.THREADS_TOKEN;
const MODE = process.env.MODE || 'post';
const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const MAX_PER_RUN = 4;              // 한 번 실행에 최대 4개 글(타래는 1개로 셈)
const STALE_HOURS = 12;             // 예정 시각보다 12시간 넘게 지난 글은 올리지 않고 건너뜀
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const postedFile = path.join(ROOT, 'posted.json');

if (!TOKEN) { console.error('THREADS_TOKEN 비밀값이 없습니다. 저장소 Settings → Secrets and variables → Actions 에 넣어 주세요.'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(method, url, params = {}) {
  const u = new URL(API + url);
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const res = method === 'GET'
    ? await fetch(u + '?' + body)
    : await fetch(u, { method: 'POST', body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`${method} ${url} 실패: ${j.error?.message || res.status}`);
  return j;
}

const me = await call('GET', '/me', { fields: 'id,username' });
console.log(`계정 확인: @${me.username}`);
if (MODE === 'check') process.exit(0);

const posted = fs.existsSync(postedFile) ? JSON.parse(fs.readFileSync(postedFile, 'utf8')) : {};
const items = [];
for (const f of fs.readdirSync(path.join(ROOT, 'queue')).filter(f => f.endsWith('.json')).sort()) {
  try { for (const it of JSON.parse(fs.readFileSync(path.join(ROOT, 'queue', f), 'utf8'))) items.push({ ...it, file: f }); }
  catch (e) { console.error(`${f} 를 읽지 못함: ${e.message}`); }
}
const now = Date.now();
const due = items.filter(it => it.id && !posted[it.id] && Date.parse(it.at) <= now).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
console.log(`대기 중 ${items.filter(it => !posted[it.id]).length}개 · 지금 올릴 글 ${due.length}개`);

let count = 0, failed = 0;
for (const it of due) {
  if (now - Date.parse(it.at) > STALE_HOURS * 3600e3) { posted[it.id] = { status: 'expired', at: new Date().toISOString() }; console.log(`건너뜀(시간 지남): ${it.id}`); continue; }
  if (count >= MAX_PER_RUN) break;
  const parts = (it.parts || []).map(s => String(s).trim()).filter(Boolean);
  const bad = parts.find(p => [...p].length > 500);
  if (!parts.length || bad) { posted[it.id] = { status: 'invalid', reason: bad ? '500자 초과' : '내용 없음', at: new Date().toISOString() }; console.log(`건너뜀(형식 오류): ${it.id}`); continue; }
  console.log(`\n── ${it.id} (${it.at}) ${parts.length > 1 ? `타래 ${parts.length}개` : ''}\n${parts.join('\n  ↳ ')}`);
  if (DRY) { count++; continue; }
  const ids = [];
  try {
    for (let i = 0; i < parts.length; i++) {
      const params = { media_type: 'TEXT', text: parts[i] };
      if (i === 0 && it.topic) params.topic_tag = it.topic;
      if (i > 0) params.reply_to_id = ids[i - 1];
      const c = await call('POST', `/${me.id}/threads`, params);
      await sleep(5000);
      const p = await call('POST', `/${me.id}/threads_publish`, { creation_id: c.id });
      ids.push(p.id);
      await sleep(3000);
    }
    const link = await call('GET', `/${ids[0]}`, { fields: 'permalink' }).then(j => j.permalink).catch(() => '');
    posted[it.id] = { status: 'ok', at: new Date().toISOString(), ids, link };
    console.log(`올림: ${link || ids[0]}`);
    count++;
  } catch (e) {
    failed++;
    console.error(`실패: ${it.id} — ${e.message}`);
    if (ids.length) posted[it.id] = { status: 'partial', at: new Date().toISOString(), ids };
    // 첫 글이 이미 올라간 뒤 실패하면 중복을 막기 위해 기록하고, 아무것도 안 올라갔으면 다음 실행에서 다시 시도
  }
}
if (!DRY) fs.writeFileSync(postedFile, JSON.stringify(posted, null, 1) + '\n');
console.log(`\n완료: ${count}개${DRY ? ' (미리보기, 실제로 올리지 않음)' : ''}${failed ? ` · 실패 ${failed}개` : ''}`);
if (failed) process.exit(1);
