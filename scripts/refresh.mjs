// 쓰레드 키(60일짜리)를 매주 갱신해서 GitHub 비밀값 THREADS_TOKEN 을 새 키로 바꿈
import { execFileSync } from 'node:child_process';
const t = process.env.THREADS_TOKEN;
if (!t) { console.error('THREADS_TOKEN 없음'); process.exit(1); }
const r = await fetch('https://graph.threads.net/refresh_access_token?' + new URLSearchParams({ grant_type: 'th_refresh_token', access_token: t }));
const j = await r.json().catch(() => ({}));
if (!r.ok || !j.access_token) { console.error('갱신 실패: ' + (j.error?.message || r.status)); process.exit(1); }
console.log(`갱신 완료: 앞으로 ${Math.round((j.expires_in || 0) / 86400)}일 유효`);
if (j.access_token !== t) {
  if (!process.env.GH_TOKEN) { console.error('새 키를 저장하려면 GH_PAT 비밀값이 필요합니다.'); process.exit(1); }
  execFileSync('gh', ['secret', 'set', 'THREADS_TOKEN', '--repo', process.env.GITHUB_REPOSITORY], { input: j.access_token, stdio: ['pipe', 'inherit', 'inherit'] });
  console.log('THREADS_TOKEN 을 새 키로 바꿨습니다.');
} else console.log('같은 키의 기간만 늘어났습니다.');
