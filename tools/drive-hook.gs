// SHIFT 쓰레드 → 구글 드라이브 저장용 (Google Apps Script 웹 앱)
// GitHub 가 카드 이미지를 만들면 이 웹 앱으로 보내고, 여기서 드라이브 SHIFT-autopilot/쓰레드/<날짜>/<시각-형식>/ 에 저장합니다.
// 설치: script.google.com → 새 프로젝트 → 이 코드 붙여넣기 → 배포 → 새 배포 → 유형 "웹 앱"
//       실행: 나 / 액세스 권한: 모든 사용자 → 배포 → 권한 허용 → 나온 "웹 앱 URL"을 GitHub 비밀값 DRIVE_HOOK_URL 에 넣기
// 웹 앱 URL 자체가 비밀번호 역할을 하니 다른 곳에 공유하지 마세요.
const ROOT_ID = '1WnuEK-eqTYdfi5BItoWKRqlO81oMxVaQ';   // SHIFT-autopilot

function sub_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function doPost(e) {
  try {
    const b = JSON.parse(e.postData.contents);
    if (!b.date || !b.folder || !Array.isArray(b.files)) throw new Error('형식 오류');
    const dir = sub_(sub_(sub_(DriveApp.getFolderById(ROOT_ID), '쓰레드'), String(b.date)), String(b.folder));
    for (const f of b.files) {
      const old = dir.getFilesByName(f.name);
      while (old.hasNext()) old.next().setTrashed(true);          // 같은 이름은 새 파일로 교체
      const bytes = f.text != null ? Utilities.newBlob(f.text, 'text/plain', f.name) : Utilities.newBlob(Utilities.base64Decode(f.data), f.mime || 'image/png', f.name);
      dir.createFile(bytes);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, folder: dir.getUrl() })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}
