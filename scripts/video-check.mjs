// 영상 주소를 쓰레드가 가져갈 수 있는지 확인만 함 (게시하지 않음: 컨테이너만 만들고 상태 확인)
const API = 'https://graph.threads.net/v1.0', TOKEN = process.env.THREADS_TOKEN;
const urls = (process.env.URLS || '').split(/\s+/).filter(Boolean);
const call = async (m, u, p = {}) => { const b = new URLSearchParams({ ...p, access_token: TOKEN }); const r = await fetch(m === 'GET' ? API + u + '?' + b : API + u, m === 'GET' ? {} : { method: 'POST', body: b }); return r.json(); };
const me = await call('GET', '/me', { fields: 'id' });
for (const url of urls) {
  const c = await call('POST', `/${me.id}/threads`, { media_type: 'VIDEO', video_url: url, text: 'check' });
  if (!c.id) { console.log(`✗ ${url}\n   만들기 실패: ${JSON.stringify(c.error?.message || c)}`); continue; }
  let s = {};
  for (let i = 0; i < 18; i++) { await new Promise(r => setTimeout(r, 10000)); s = await call('GET', `/${c.id}`, { fields: 'status,error_message' }); if (s.status !== 'IN_PROGRESS') break; }
  console.log(`${s.status === 'FINISHED' ? '✓' : '✗'} ${url}\n   상태: ${s.status} ${s.error_message || ''}`);
}
