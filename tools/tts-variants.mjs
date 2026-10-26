// Gemini TTS 요청 방식 시험 (스타일 지시문이 소리로 읽히는지 길이로 확인) — 2026-10-26
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const KEY = process.env.GEMINI_API_KEY, MODEL = process.env.MODEL || 'gemini-3.8-flash-tts', VOICE = process.env.VOICES?.split(',')[0] || 'Leda';
const OUT = path.join(ROOT, 'samples', 'tts'); fs.mkdirSync(OUT, { recursive: true });
const TEXT = '직접 물어봤더니, 답이 완전히 달랐어요. 에이아이 요금이 몇 달 만에 최대 팔십 퍼센트나 내려갔거든요. 그럼 우리는 뭘 쓰면 될까요? 끝까지 보시면 바로 알 수 있어요.';
const STYLE = 'bright, warm, natural and quick, like a Korean woman in her twenties telling a close friend exciting tech news';
const H = { 'Content-Type': 'application/json', 'x-goog-api-key': KEY };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wavFromPcm = (pcm, sr = 24000) => { const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]); };
function findAudio(o) { if (!o || typeof o !== 'object') return null; if (typeof o.data === 'string' && o.data.length > 1000) return o.data; if (o.inlineData?.data) return o.inlineData.data; for (const v of Object.values(o)) { const r = findAudio(v); if (r) return r; } return null; }
const toWav = b64 => { const b = Buffer.from(b64, 'base64'); return b.slice(0, 4).toString() === 'RIFF' ? b : wavFromPcm(b); };
const dur = wav => (wav.length - 44) / 48000;
const variants = {
  plain: () => ['gc', { contents: [{ parts: [{ text: TEXT }] }] }],
  prefixKo: () => ['gc', { contents: [{ parts: [{ text: `밝고 빠르게, 친구한테 신나는 소식을 말하듯 읽어 줘: ${TEXT}` }] }] }],
  itemMeta: () => ['ia', { model: MODEL, input: [{ type: 'user_input', content: [{ type: 'text', text: TEXT }], speech_metadata: { style: STYLE } }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: VOICE }] } }],
  annot: () => ['ia', { model: MODEL, input: [{ type: 'user_input', content: [{ type: 'text', text: TEXT, annotations: [{ type: 'speech_metadata', style: STYLE }] }] }], response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice: VOICE }] } }],
  sysInstr: () => ['gc', { systemInstruction: { parts: [{ text: `Speak the user's text exactly as written in Korean. Delivery: ${STYLE}.` }] }, contents: [{ parts: [{ text: TEXT }] }] }],
};
const res = [];
for (const [name, mk] of Object.entries(variants)) {
  const [kind, body] = mk();
  try {
    let r, j;
    if (kind === 'gc') {
      body.generationConfig = { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } };
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    } else r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: H, body: JSON.stringify(body) });
    j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j.error || j).slice(0, 250)}`);
    const a = findAudio(j); if (!a) throw new Error('오디오 없음 ' + JSON.stringify(j).slice(0, 200));
    const wav = toWav(a); fs.writeFileSync(path.join(OUT, `v-${name}.wav`), wav);
    res.push({ name, ok: true, sec: +dur(wav).toFixed(1) }); console.log(`✓ ${name} ${dur(wav).toFixed(1)}s`);
  } catch (e) { res.push({ name, ok: false, error: String(e.message).replace(KEY || '@@', '***') }); console.log(`✗ ${name}`); }
  await sleep(25000);
}
fs.writeFileSync(path.join(OUT, 'variants.json'), JSON.stringify({ at: new Date().toISOString(), model: MODEL, voice: VOICE, res }, null, 1) + '\n');
