# shift-threads

SHIFT AI(@shift_ai_magazine) 쓰레드 완전 자동화. PC 없이 동작합니다.

| 시각 (KST) | 하는 일 | 어디서 |
|---|---|---|
| 05:35 | 어제까지 글 성과·팔로워 수 수집 → `stats/` | GitHub Actions `insights.yml` |
| 06:10 | 오늘 올릴 글 8개 작성 → `queue/YYYY-MM-DD.json` | Claude 예약 작업 (CONTENT_GUIDE.md 따름) |
| 글이 들어오면 | 카드 이미지 생성 → `media/<id>/` | `render.yml` |
| 매시간 7분 | 예약 시각이 지난 글 업로드 → `posted.json` | `post.yml` |
| 월요일 09:20 | 쓰레드 키 기간 연장 | `refresh.yml` |
| 22:35 · 07:35 | 드라이브 날짜 폴더의 쇼츠를 유튜브에 예약 업로드 → `youtube/` | `youtube.yml` (설정: `YOUTUBE_SETUP.md`) |

- 운영 규칙·편성표·글 형식: `CONTENT_GUIDE.md`
- 비밀값: `THREADS_TOKEN`(필수), `GH_PAT`(키 갱신 시 새 키 저장용)
- 수동 실행: Actions → 쓰레드 올리기 → Run workflow (`check` = 키 확인만)
