"""
Gemini TTS (구글 Gemini 음성, 무료 한도 하루 10번) — 2026-10-26

  python scripts/tts_gemini.py job.json
  job.json: {"voice": "Aoede", "model": "gemini-3.8-flash-tts", "style": "...", "pause_tag": "<long pause>",
             "items": [{"text": "...", "wav": "out.raw.wav", "json": "out.json"}, ...]}

- 릴스 한 편의 모든 장면 문장을 한 번의 요청으로 만든 뒤, 장면 사이 쉼에서 잘라 장면별 wav 로 나눕니다
  (무료 한도가 하루 10번이라 장면마다 따로 요청하지 않음). 목소리 톤도 장면끼리 같아집니다.
- 키: 환경변수 GEMINI_API_KEY, 없으면 프로젝트 .env 의 GEMINI_API_KEY=...
- 키 없음·한도 초과·나누기 실패면 오류로 끝나고, build.mjs 가 다음 엔진(Qwen)으로 자동 전환합니다.
- 단어 시각: 실제 쉼 위치 기반(tts_qwen.word_bounds) → build.mjs 의 tighten_voice.py 가 Whisper 로 한 번 더 맞춥니다.
"""
import base64
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

API = "https://generativelanguage.googleapis.com/v1beta/interactions"
DEFAULT_STYLE = ("bright, warm, natural and quick, like a Korean woman in her twenties telling a close friend "
                 "exciting tech news; not like an announcer; end sentences crisply")


def log(*a):
    print(*a, flush=True)


def api_key():
    k = os.environ.get("GEMINI_API_KEY", "").strip()
    if k:
        return k
    env = os.path.join(ROOT, ".env")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8-sig"):
            m = re.match(r"\s*GEMINI_API_KEY\s*=\s*(.*)\s*$", line)
            if m:
                return m.group(1).strip().strip("'\"")
    return ""


def find_audio(o):
    if isinstance(o, dict):
        if isinstance(o.get("data"), str) and len(o["data"]) > 1000:
            return o["data"]
        if isinstance(o.get("inlineData"), dict) and o["inlineData"].get("data"):
            return o["inlineData"]["data"]
        for v in o.values():
            r = find_audio(v)
            if r:
                return r
    elif isinstance(o, list):
        for v in o:
            r = find_audio(v)
            if r:
                return r
    return None


def decode(b):
    if b[:4] == b"RIFF":
        with wave.open(io.BytesIO(b)) as w:
            sr, ch = w.getframerate(), w.getnchannels()
            a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768.0
            if ch > 1:
                a = a.reshape(-1, ch).mean(axis=1)
            return a, sr
    return np.frombuffer(b, np.int16).astype(np.float32) / 32768.0, 24000   # 헤더 없는 PCM (24kHz 16bit 모노)


def synth(text, voice, model, style, key):
    body = {"model": model,
            "input": [{"type": "user_input", "content": [{"type": "text", "text": text, "annotations": [{"type": "speech_metadata", "style": style}]}]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": voice}]}}
    req = urllib.request.Request(API, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", "x-goog-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            j = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", "replace")[:300]
        if e.code == 429:
            raise SystemExit(f"Gemini 무료 한도 초과(429) — 오늘은 다른 음성으로 만듭니다: {msg}")
        raise SystemExit(f"Gemini 요청 실패 {e.code}: {msg}")
    data = find_audio(j)
    if not data:
        raise SystemExit("Gemini 응답에 오디오가 없습니다: " + json.dumps(j, ensure_ascii=False)[:300])
    return decode(base64.b64decode(data))


norm = lambda s: re.sub(r"[\s.,!?…\"'“”‘’·()\[\]{}:;~\-–—/%<>]", "", s)


def frames_db(a, sr, hop=0.01):
    h = int(hop * sr)
    n = len(a) // h
    rms = np.sqrt(np.mean(a[: n * h].reshape(n, h) ** 2, axis=1) + 1e-12)
    return 20 * np.log10(rms), h


def silences(a, sr, min_len=0.16):
    db, h = frames_db(a, sr)
    thr = max(np.percentile(db, 95) - 32, -60)
    quiet = db < thr
    out, s = [], None
    for i, q in enumerate(quiet):
        if q and s is None:
            s = i
        elif not q and s is not None:
            if (i - s) * h / sr >= min_len:
                out.append((s * h / sr, i * h / sr))
            s = None
    if s is not None:
        out.append((s * h / sr, len(quiet) * h / sr))
    return out


def trim(a, sr, pad=0.05):
    db, h = frames_db(a, sr)
    thr = max(np.percentile(db, 95) - 35, -62)
    idx = np.where(db > thr)[0]
    if not len(idx):
        return a
    return a[max(0, idx[0] * h - int(pad * sr)): min(len(a), (idx[-1] + 1) * h + int(pad * sr))]


def expected_dur(text):
    return len(norm(text)) / 7.0 + 0.3


def split(a, sr, texts):
    """장면 경계 = 글자 수 비율로 예상한 위치 근처의 쉼. 긴 쉼일수록, 예상 위치에 가까울수록 우선 (순서 유지)"""
    a = trim(a, sr)
    n = len(texts)
    if n == 1:
        return [a]
    total = len(a) / sr
    w = np.array([len(norm(t)) + 2.0 for t in texts], dtype=float)
    exp = np.cumsum(w)[:-1] / w.sum() * total
    sil = [s for s in silences(a, sr) if 0.3 < s[0] and s[1] < total - 0.3]
    if len(sil) < n - 1:
        raise SystemExit(f"장면 경계 쉼을 찾지 못함 (쉼 {len(sil)}개, 필요 {n - 1}개)")
    mids = np.array([(s0 + s1) / 2 for s0, s1 in sil])
    lens = np.array([s1 - s0 for s0, s1 in sil])
    K, M = n - 1, len(sil)
    INF = 1e9
    cost = np.full((K, M), INF)
    back = np.zeros((K, M), dtype=int)
    def c(k, m):
        return abs(mids[m] - exp[k]) / max(total, 1) * 10 - min(lens[m], 1.2) * 2.0
    for m in range(M):
        cost[0, m] = c(0, m)
    for k in range(1, K):
        best, bi = INF, -1
        for m in range(M):
            if m - 1 >= 0 and cost[k - 1, m - 1] < best:
                best, bi = cost[k - 1, m - 1], m - 1
            if bi >= 0:
                cost[k, m] = best + c(k, m)
                back[k, m] = bi
    m = int(np.argmin(cost[K - 1]))
    if cost[K - 1, m] >= INF:
        raise SystemExit("장면 경계 계산 실패")
    picks = [m]
    for k in range(K - 1, 0, -1):
        m = back[k, m]
        picks.append(int(m))
    picks = picks[::-1]
    cuts = [0] + [int(mids[p] * sr) for p in picks] + [len(a)]
    segs = [trim(a[cuts[i]:cuts[i + 1]], sr) for i in range(n)]
    for t, s in zip(texts, segs):
        d, e = len(s) / sr, expected_dur(t)
        if not (0.45 * e <= d <= 2.0 * e + 0.6):
            raise SystemExit(f"장면 나누기 결과가 이상함 ({d:.1f}초, 예상 {e:.1f}초): {t[:20]}…")
    return segs


def save_wav(path, a, sr):
    a = np.clip(a, -1, 1)
    with wave.open(path, "wb") as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr)
        f.writeframes((a * 32767).astype(np.int16).tobytes())


def bounds(text, a, sr):
    try:
        from tts_qwen import word_bounds   # 실제 쉼 위치 기반 (PC)
        return word_bounds(text, a, sr)
    except Exception:
        ws = text.split()
        d = len(a) / sr
        tot = sum(max(1, len(norm(x))) for x in ws) or 1
        t, out = 0.0, []
        for x in ws:
            l = max(1, len(norm(x))) / tot * d
            out.append({"text": x, "start": round(t, 3), "end": round(t + l, 3)})
            t += l
        return out


def main(path):
    if sys.platform.startswith("win"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    job = json.load(open(path, encoding="utf-8"))
    key = api_key()
    if not key:
        raise SystemExit("GEMINI_API_KEY 가 없습니다 (.env 에 GEMINI_API_KEY=키 한 줄을 넣어 주세요)")
    items = job["items"]
    texts = [re.sub(r"\s+", " ", it["text"]).strip() for it in items]
    texts = [t if re.search(r"[.?!…]$", t) else t + "." for t in texts]
    tag = job.get("pause_tag", "")
    full = (f"\n{tag}\n" if tag else "\n\n").join(texts)
    voice, model, style = job.get("voice", "Aoede"), job.get("model", "gemini-3.8-flash-tts"), job.get("style") or DEFAULT_STYLE
    log(f"  Gemini {model} · {voice} · 장면 {len(texts)}개를 한 번에 생성")
    a, sr = synth(full, voice, model, style, key)
    log(f"  받은 음성 {len(a) / sr:.1f}초")
    if job.get("debug_full"):
        save_wav(job["debug_full"], a, sr)
    segs = split(a, sr, texts)
    for it, t, s in zip(items, texts, segs):
        s = s / (float(np.max(np.abs(s))) or 1.0) * 0.9
        save_wav(it["wav"], s, sr)
        with open(it["json"], "w", encoding="utf-8") as f:
            json.dump(bounds(it["text"], s, sr), f, ensure_ascii=False)
        log(f"  ✓ ({len(s) / sr:.1f}s) {t[:28]}…")


if __name__ == "__main__":
    main(sys.argv[1])
