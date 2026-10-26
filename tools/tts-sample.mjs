// Gemini TTS 목소리 비교 샘플 (2026-10-26) — 릴스 내레이션 후보 목소리를 GitHub Actions 에서 만들어 samples/tts/ 에 저장
//   env: GEMINI_API_KEY, VOICES(쉼표), MODEL, TEXT, STYLE
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const KEY = process.env.GEMINI_API_KEY;
const OUT = path.join(ROOT, 'samples', 'tts'); fs.mkdirSync(OUT, { recursive: true });
const VOICES = (process.env.VOICES || 'Leda,Zephyr,Aoede,Kore,Autonoe,Laomedeia').split(',').map(s => s.trim()).filter(Boolean);
const MODELS = (process.env.MODEL || 'gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts').split(',');
const TEXT = process.env.TEXT || '직접 물어봤더니, 답이 완전히 달랐어요. 에이아이 요금이 몇 달 만에 최대 팔십 퍼센트나 내려갔거든요. 그럼 우리는 뭘 쓰면 될까요? 끝까지 보시면 바로 알 수 있어요.';
const STYLE = process.env.STYLE || 'bright, warm, natural and quick, like a Korean woman in her twenties telling a close friend exciting tech news; not like an announcer';
const log = []; const H = { 'Content-Type': 'application/json', 'x-goog-api-key': KEY };
const wavFromPcm = (pcm, sr = 24000) => { const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]); };
function findAudio(o) {   // 응답 어디에 있든 base64 오디오 찾기
  if (!o || typeof o !== 'object') return null;
  if (typeof o.data === 'string' && o.data.length > 1000) return { data: o.data, mime: o.mime_type || o.mimeType || '' };
  if (o.inlineData?.data) return { data: o.inlineData.data, mime: o.inlineData.mimeType || '' };
  for (const v of Object.values(o)) { const r = findAudio(v); if (r) return r; }
  return null;
}
async function tryInteractions(model, voice) {
  const body = { model, input: [{ type: 'user_input', content: [{ type: 'text', text: TEXT, annotations: [{ type: 'speech_metadata', style: STYLE }] }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice }] } };
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`interactions ${r.status}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
  const a = findAudio(j); if (!a) throw new Error('interactions: 오디오 없음 ' + JSON.stringify(j).slice(0, 300));
  const buf = Buffer.from(a.data, 'base64');
  return buf.slice(0, 4).toString() === 'RIFF' ? buf : wavFromPcm(buf);
}
async function tryGenerate(model, voice) {
  const body = { contents: [{ parts: [{ text: `${STYLE}\n\n다음 문장을 읽어 줘: ${TEXT}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`generateContent ${r.status}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
  const a = findAudio(j); if (!a) throw new Error('generateContent: 오디오 없음');
  const buf = Buffer.from(a.data, 'base64');
  return buf.slice(0, 4).toString() === 'RIFF' ? buf : wavFromPcm(buf);
}
if (!KEY) { console.log('GEMINI_API_KEY 없음'); process.exit(1); }
let okModel = null;
for (const voice of VOICES) {
  let done = false;
  for (const model of okModel ? [okModel] : MODELS) {
    for (const [name, fn] of [['interactions', tryInteractions]]) {
      try {
        const wav = await fn(model, voice);
        fs.writeFileSync(path.join(OUT, `g-${voice}.wav`), wav);
        log.push({ voice, model, api: name, ok: true, bytes: wav.length }); okModel = model; done = true; console.log(`✓ ${voice} (${model} · ${name})`); break;
      } catch (e) { log.push({ voice, model, api: name, ok: false, error: String(e.message).replace(KEY, '***') }); }
      await new Promise(r => setTimeout(r, 22000));
    }
    if (done) break;
  }
  if (!done) console.log(`✗ ${voice}`);
}
fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ at: new Date().toISOString(), text: TEXT, style: STYLE, log }, null, 1) + '\n');
