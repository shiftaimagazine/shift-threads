// 인스타 키(60일짜리)를 매주 갱신 — IG_TOKEN 이 없으면 아무것도 안 함
import { execFileSync } from 'node:child_process';
const t = process.env.IG_TOKEN;
if (!t) { console.log('IG_TOKEN 없음 — 건너뜀'); process.exit(0); }
const r = await fetch('https://graph.instagram.com/refresh_access_token?' + new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: t }));
const j = await r.json().catch(() => ({}));
if (!r.ok || !j.access_token) { console.error('인스타 키 갱신 실패: ' + (j.error?.message || r.status)); process.exit(1); }
console.log(`인스타 키 갱신: 앞으로 ${Math.round((j.expires_in || 0) / 86400)}일 유효`);
if (j.access_token !== t) {
  if (!process.env.GH_TOKEN) { console.error('새 키를 저장하려면 GH_PAT 비밀값이 필요합니다.'); process.exit(1); }
  execFileSync('gh', ['secret', 'set', 'IG_TOKEN', '--repo', process.env.GITHUB_REPOSITORY], { input: j.access_token, stdio: ['pipe', 'inherit', 'inherit'] });
  console.log('IG_TOKEN 을 새 키로 바꿨습니다.');
}
