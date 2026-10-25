// 유튜브 업로드용 OAuth 키(refresh token) 한 번 발급 — 내 PC에서 실행 (비밀값은 화면에만 표시, 어디에도 저장하지 않음)
//   사용법:  node scripts/youtube-auth.mjs <클라이언트 ID> <클라이언트 비밀번호>
//   → 브라우저가 열리면 유튜브 채널 계정으로 로그인·허용 → 창에 refresh token 이 표시됨 → GitHub 비밀값 YT_REFRESH_TOKEN 에 붙여 넣기
import http from 'node:http';
import { exec } from 'node:child_process';
const [id, secret] = process.argv.slice(2);
if (!id || !secret) { console.error('사용법: node scripts/youtube-auth.mjs <클라이언트 ID> <클라이언트 비밀번호>'); process.exit(1); }
const PORT = 8765, REDIRECT = `http://127.0.0.1:${PORT}/`;
const SCOPE = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: id, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent' });
const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, REDIRECT).searchParams.get('code');
  if (!code) { res.end('code 없음'); return; }
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: REDIRECT, grant_type: 'authorization_code' }) });
  const j = await r.json();
  if (!j.refresh_token) { res.end('실패: ' + JSON.stringify(j)); console.error('실패:', j); server.close(); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<h2>발급 완료 — 이 창을 닫고 명령 창을 보세요</h2>');
  console.log('\n===== GitHub 비밀값 YT_REFRESH_TOKEN 에 아래 값을 넣으세요 (다른 곳에 저장하지 마세요) =====\n');
  console.log(j.refresh_token);
  console.log('\n(앱이 "테스트" 상태면 7일 뒤 만료됩니다. OAuth 동의 화면에서 "앱 게시"를 눌러 프로덕션으로 바꿔 두세요.)');
  server.close();
});
server.listen(PORT, () => {
  console.log('브라우저에서 유튜브 채널 계정으로 로그인하고 허용을 누르세요. 창이 안 열리면 이 주소를 여세요:\n' + url);
  exec((process.platform === 'win32' ? 'start "" ' : 'open ') + JSON.stringify(url));
});
