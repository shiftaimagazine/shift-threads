# 유튜브 쇼츠 자동 예약 (API 방식) — 한 번만 하면 되는 설정

크롬·PC·Claude 없이 GitHub Actions 가 매일 22:35·07:35(한국)에 드라이브 `SHIFT-autopilot/<날짜>/` 의 쇼츠를 YouTube 에 '예약 공개'로 올립니다. 비용 0, 하루 100편까지.

## 1. 구글 클라우드 프로젝트 (10분)
1. https://console.cloud.google.com → 새 프로젝트 (이름 예: `shift-ai-youtube`). **유튜브 채널을 가진 구글 계정**으로 하세요.
2. 왼쪽 메뉴 **API 및 서비스 → 라이브러리** 에서 두 개를 '사용 설정':
   - **YouTube Data API v3**
   - **Google Drive API**
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키** → 만들어진 키를 복사해 둡니다. (드라이브 공개 폴더를 읽는 용도. "키 제한"에서 Google Drive API 만 허용으로 두면 안전)
4. **OAuth 동의 화면**(또는 "대상"): 외부(External) → 앱 이름 `SHIFT AI`, 지원 이메일 입력 → 저장. 범위는 비워 둬도 됩니다. 만든 뒤 **"앱 게시"(프로덕션으로 전환)** 를 눌러 두세요. 테스트 상태로 두면 키가 7일마다 만료됩니다. (검증 안 된 앱 경고가 떠도 본인 계정만 쓰는 거라 괜찮습니다.)
5. **사용자 인증 정보 만들기 → OAuth 클라이언트 ID** → 애플리케이션 유형 **데스크톱 앱** → 만들기 → **클라이언트 ID** 와 **클라이언트 보안 비밀번호** 복사.

## 2. 유튜브 허용 키 발급 (PC 에서 1분)
```
cd C:\Users\Admin\development\news-reels
node "C:\Users\Admin\development\news-reels\autopilot\youtube-auth.mjs" <클라이언트ID> <클라이언트비밀번호>
```
(이 파일은 저장소의 `scripts/youtube-auth.mjs` 와 같습니다.) 브라우저가 열리면 **유튜브 채널 계정**으로 로그인 → "확인되지 않은 앱" 경고가 나오면 **고급 → SHIFT AI(으)로 이동** → 허용. 명령 창에 `refresh token` 이 표시됩니다.

## 3. GitHub 비밀값 4개 넣기
https://github.com/shiftaimagazine/shift-threads/settings/secrets/actions → **New repository secret**
| 이름 | 값 |
|---|---|
| `YT_CLIENT_ID` | 1-5 의 클라이언트 ID |
| `YT_CLIENT_SECRET` | 1-5 의 클라이언트 보안 비밀번호 |
| `YT_REFRESH_TOKEN` | 2 에서 받은 refresh token |
| `DRIVE_API_KEY` | 1-3 의 API 키 |

## 4. 확인
Actions → **유튜브 쇼츠 예약 업로드** → Run workflow → mode `check` → 로그에 채널 이름이 나오면 끝. 그다음 mode `post`, dry_run `1` 로 한 번 돌려 올릴 목록을 미리 봅니다.

## 그 뒤에
- 밤에 "1. 오늘 밤 릴스 2편 만들기" 가 끝나면 드라이브 날짜 폴더에 `1-yt.mp4 · 2-yt.mp4 · youtube.json` 이 같이 저장되고, 22:35 에 GitHub 가 올립니다. PC 는 꺼도 됩니다.
- 올라간 기록: 저장소 `youtube/posted.json`, 현황: `youtube/status.json`.
- 잘 돌면 Claude 예약 작업 "SHIFT AI 유튜브 쇼츠 예약 업로드 (밤)" 은 꺼도 됩니다 (Claude 토큰 0).
- 키가 만료되면(Actions 로그에 "유튜브 키 갱신 실패") 2단계만 다시 하고 `YT_REFRESH_TOKEN` 을 바꿔 넣으면 됩니다.
