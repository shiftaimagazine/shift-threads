// SHIFT 쓰레드 카드 → 구글 드라이브 자동 복사 (Google Apps Script, 비밀값 필요 없음)
// 10분마다 공개 저장소의 drive-index.json 을 읽어, 새로 만들어졌거나 바뀐 카드·글을
// 드라이브 SHIFT-autopilot/쓰레드/<날짜>/<시각-형식>/ 에 저장합니다. 처음 한 번 setup 을 실행하면 됩니다.
const ROOT_ID = '1WnuEK-eqTYdfi5BItoWKRqlO81oMxVaQ';   // SHIFT-autopilot
const RAW = 'https://raw.githubusercontent.com/shiftaimagazine/shift-threads/main/';

function sub_(parent, name) { const it = parent.getFoldersByName(name); return it.hasNext() ? it.next() : parent.createFolder(name); }
function put_(dir, blob) { const old = dir.getFilesByName(blob.getName()); while (old.hasNext()) old.next().setTrashed(true); dir.createFile(blob); }

function sync() {
  const idx = JSON.parse(UrlFetchApp.fetch(RAW + 'drive-index.json?t=' + Date.now()).getContentText());
  const props = PropertiesService.getScriptProperties();
  const base = sub_(DriveApp.getFolderById(ROOT_ID), '쓰레드');
  for (const it of idx.items || []) {
    if (props.getProperty(it.id) === it.sig) continue;
    const dir = sub_(sub_(base, it.date), it.folder);
    put_(dir, Utilities.newBlob(it.text, 'text/plain', '글.txt'));
    for (const n of it.files) put_(dir, UrlFetchApp.fetch(RAW + 'media/' + it.id + '/' + n + '?v=' + it.sig).getBlob().setName(n));
    props.setProperty(it.id, it.sig);
  }
}

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(10).create();
  sync();
}
