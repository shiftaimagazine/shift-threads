# shift-threads

SHIFT AI(@shift_ai_magazine) 쓰레드 자동 업로드. PC 없이 GitHub Actions 가 하루 세 번(10:10 · 15:10 · 20:10 KST) `queue/` 의 글 중 시간이 된 것을 올립니다.

- 글 넣기: `queue/YYYY-MM-DD.json` (형식은 `scripts/post.mjs` 맨 위 주석). 매일 아침 SHIFT AI 예약 작업이 채웁니다.
- 올린 기록: `posted.json` (같은 글이 두 번 올라가지 않게 함)
- 비밀값 (Settings → Secrets and variables → Actions)
  - `THREADS_TOKEN` 쓰레드 접근 키 (필수)
  - `GH_PAT` 키 자동 갱신용 GitHub 토큰 (권장, 이 저장소의 Secrets 쓰기 권한)
- 수동 실행: Actions → 쓰레드 올리기 → Run workflow (`check` = 키 확인만, dry_run `1` = 미리보기)
