/* =========================================================================
   speech.js — 音声の土台(読み上げ・聞き取り・録音)

   英語は「文字」より先に【音】がある。ここはその配線だけを担当する。

   3つの機能を、使える端末では使い、使えない端末では黙って下がる。
     1. 読み上げ(TTS)     … iPhone/Android/PC すべてで使える。これが本体
     2. 録音(MediaRecorder)… iOS 14.3以降で使える。お手本と聞き比べる
     3. 聞き取り(音声認識)  … 使えない端末がある。使えたら判定に使う「おまけ」

   ★設計の判断
   発音練習の中心は「聞き分け」と「聞き比べ」に置いた。音声認識に頼ると、
   認識できない端末では発音練習そのものが成立しなくなるため。
   聞き分けの訓練は、発音そのものも改善することが確認されている
   (Bradlow et al. 1997 — 知覚訓練が産出にも転移する)。
   ========================================================================= */

const SPEECH = { voices: [], unlocked: false, lastVoice: null };

function ttsSupported() {
  return typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";
}

function loadVoices() {
  if (!ttsSupported()) return [];
  SPEECH.voices = Array.from(speechSynthesis.getVoices() || []);
  return SPEECH.voices;
}

if (ttsSupported()) {
  loadVoices();
  // iOS/Chrome は音声リストを非同期で読み込む。届いたら画面に知らせる
  speechSynthesis.addEventListener?.("voiceschanged", () => {
    loadVoices();
    document.dispatchEvent(new CustomEvent("voices-ready"));
  });
}

/* ── どの声を使うか ────────────────────────────────────────
   ★ここは実際に「声がおかしい」と言われて直した場所。

   macOS には英語の声として【ジョーク用の音声】が標準で入っている。
   Albert / Bad News / Bubbles / Zarvox / Trinoids など。
   `en` で絞っただけだとこれらが混ざり、しかも
     ・発音ドリル → 全部からランダムに選ぶ
     ・英会話   → リストの1番目を無条件に使う
   という作りだったので、先頭に来やすい Albert がLukeの声になっていた。

   なので「名前で除外 → 点数をつけて良い順に並べる」ようにする。 */

/** 英語の声として出てくるが、人の声として使ってはいけないもの */
const VOICE_NOVELTY = new RegExp([
  // 効果音のような声
  "bad ?news", "bahh", "bells", "boing", "bubbles", "cellos", "deranged",
  "good ?news", "jester", "organ", "superstar", "trinoids", "whisper", "wobble",
  "zarvox", "hysterical", "novelty",
  // 古くて機械的な声
  "albert", "fred", "junior", "kathy", "princess", "ralph", "agnes", "bruce", "victoria",
  // macOS の「キャラクター」音声。ちゃんと喋るが、くせが強い
  "eddy", "flo", "grandma", "grandpa", "reed", "rocko", "sandy", "shelley",
].map((x) => "\\b" + x + "\\b").join("|"), "i");

/** よくできた声(macOS / iOS / Chrome)。前に置くほど優先 */
const VOICE_PREFERRED = [
  // アメリカ英語
  "Google US English", "Samantha", "Ava", "Allison", "Susan", "Nicky", "Alex", "Tom",
  // イギリス英語
  "Google UK English Female", "Google UK English Male", "Daniel", "Kate", "Serena", "Oliver",
];

/** 英語の声(ぜんぶ) */
function enVoices() {
  return SPEECH.voices.filter((v) => /^en([-_]|$)/i.test(v.lang || ""));
}

/** 声の良さを点数にする。大きいほど自然 */
function voiceScore(v) {
  const n = v.name || "", lang = (v.lang || "").replace("_", "-");
  let s = 0;
  const pref = VOICE_PREFERRED.findIndex((p) => n.toLowerCase().startsWith(p.toLowerCase()));
  if (pref >= 0) s += 1000 - pref * 10;                       // 名指しのものを最優先
  if (/google|natural|neural|premium|enhanced/i.test(n)) s += 300;
  if (v.localService === false) s += 120;                     // ネットワーク音声は自然なことが多い
  if (/^en-(US|GB)$/i.test(lang)) s += 80;                    // まずは米・英
  else if (/^en-(AU|CA|IE|NZ)$/i.test(lang)) s += 30;
  if (/compact|eloquence/i.test(n)) s -= 200;                 // 機械的な軽量版
  return s;
}

/**
 * 人の声として使ってよい英語の声を、良い順に。
 * ★全部はじかれる端末があるかもしれないので、そのときは
 *   絞らずに返す。読み上げが丸ごと止まるほうが困る。
 */
function goodEnVoices() {
  const all = enVoices();
  const ok = all.filter((v) => !VOICE_NOVELTY.test(v.name || ""));
  return (ok.length ? ok : all).slice().sort((a, b) => voiceScore(b) - voiceScore(a));
}

/** 名前から声を探す(保護者が選んだものを覚えておくため) */
function voiceByName(name) {
  if (!name) return null;
  return SPEECH.voices.find((v) => v.name === name) || null;
}

/**
 * ★高変動音声訓練(HVPT)
 * 同じ音でも話者が変わると、聞き分けの力は「その声だけ」でなく
 * 一般化して伸びることが分かっている。だから毎回わざと声を変える。
 * Bradlow, Pisoni, Akahane-Yamada & Tohkura (1997) — 日本語話者のR/L訓練
 */
function pickEnVoice(varied = true) {
  const list = goodEnVoices();
  if (!list.length) return null;
  /* ★varied=false は「毎回おなじ声」。Luke がこれを使う。
     以前は list[0](= 並び順の先頭)だったので、
     macOS ではジョーク音声の Albert が選ばれていた。
     いまは点数が最も高いものが先頭に来る。 */
  if (!varied) return list[0];
  /* 声を変えるのは聞き分けの訓練(HVPT)のため。
     ただし変えてよいのは【まともな声の中でだけ】。
     上位6つに絞る。ここを絞らないと、
     訓練の名のもとに変な声を聞かせることになる。 */
  const pool0 = list.slice(0, 6);
  const pool = pool0.length > 1 ? pool0.filter((v) => v.name !== SPEECH.lastVoice) : pool0;
  const v = pool[Math.floor(Math.random() * pool.length)] || list[0];
  SPEECH.lastVoice = v.name;
  return v;
}

/**
 * 読み上げる。終わったら解決する Promise を返す。
 * iOS は end イベントが来ないことがあるので、必ず保険の時間を置く。
 */
function speak(text, opts = {}) {
  return new Promise((resolve) => {
    if (!ttsSupported() || !text) return resolve(false);
    try { speechSynthesis.cancel(); } catch {}
    const u = new SpeechSynthesisUtterance(String(text));
    const v = opts.voice || pickEnVoice(opts.varied !== false);
    /* ★声の指定に失敗しても、読み上げ自体は続ける。
       端末の更新で声が消えていることがあり、そこで例外を投げると
       英会話が丸ごと無音になる。既定の声で喋るほうがまし。 */
    if (v) { try { u.voice = v; } catch (_) { } }
    u.lang = opts.lang || v?.lang || "en-US";
    u.rate = opts.rate ?? 1;
    u.pitch = opts.pitch ?? 1;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(true); } };
    u.onend = finish;
    u.onerror = finish;
    // 保険:1語あたり約0.4秒 + 1.5秒。iOS で end が来なくても止まらないように
    const ms = 1500 + String(text).split(/\s+/).length * 500 / (u.rate || 1);
    setTimeout(finish, ms);
    SPEECH.unlocked = true;
    speechSynthesis.speak(u);
  });
}

function stopSpeaking() { try { speechSynthesis.cancel(); } catch {} }

/* ── 聞き取り(音声認識)──────────────────────────────────
   Safari では webkitSpeechRecognition。使えない端末もあるので必ず確認する。 */

function recognizerCtor() {
  return (typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;
}
function canRecognize() { return !!recognizerCtor(); }

/**
 * 1回だけ聞き取る。{ ok, transcript, error } を返す。
 * 失敗しても例外を投げない — 発音練習を止めないため。
 */
function listenOnce({ lang = "en-US", timeout = 9000 } = {}) {
  return new Promise((resolve) => {
    const Ctor = recognizerCtor();
    if (!Ctor) return resolve({ ok: false, error: "unsupported" });
    let rec;
    try { rec = new Ctor(); } catch { return resolve({ ok: false, error: "unsupported" }); }
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.continuous = false;

    let done = false;
    const finish = (v) => { if (done) return; done = true; try { rec.stop(); } catch {} resolve(v); };

    rec.onresult = (e) => {
      const r = e.results?.[0];
      const alts = r ? Array.from(r).map((a) => String(a.transcript || "").trim()) : [];
      finish({ ok: true, transcript: alts[0] || "", alternatives: alts });
    };
    rec.onerror = (e) => finish({ ok: false, error: e.error || "error" });
    rec.onend = () => finish({ ok: false, error: "no-speech" });
    setTimeout(() => finish({ ok: false, error: "timeout" }), timeout);

    try { rec.start(); } catch { finish({ ok: false, error: "start-failed" }); }
  });
}

/* ── 録音(お手本と聞き比べる)────────────────────────────
   自分の声を聞くのは、発音を直す最も確実な方法のひとつ。
   認識が使えない端末でも、これは動く。 */

const REC = { stream: null, rec: null, chunks: [], url: null };

function canRecord() {
  return !!(navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined");
}

function recMimeType() {
  /* ★opus(webm)を先に。同じ長さで mp4 の 1/10 ほどの大きさになり、
     録った声をAIへ送るときの通信量が効いてくる。Safari は webm 非対応なので mp4 に落ちる */
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const t of cands) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return "";
}

async function recStart() {
  if (!canRecord()) return { ok: false, error: "unsupported" };
  try {
    REC.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    return { ok: false, error: e?.name === "NotAllowedError" ? "denied" : "mic-failed" };
  }
  const type = recMimeType();
  try {
    /* 声だけなので 32kbps で十分。上限を切っておかないと、環境によっては
       巨大なファイルになり、AIへ送るときに重くなる */
    const opts = { audioBitsPerSecond: 32000 };
    if (type) opts.mimeType = type;
    REC.rec = new MediaRecorder(REC.stream, opts);
  } catch {
    try { REC.rec = new MediaRecorder(REC.stream); } catch { return { ok: false, error: "mic-failed" }; }
  }
  REC.chunks = [];
  REC.rec.ondataavailable = (e) => { if (e.data?.size) REC.chunks.push(e.data); };
  REC.rec.start();
  return { ok: true };
}

function recStop() {
  return new Promise((resolve) => {
    const r = REC.rec;
    if (!r || r.state === "inactive") return resolve({ ok: false, error: "not-recording" });
    r.onstop = () => {
      const blob = new Blob(REC.chunks, { type: r.mimeType || "audio/mp4" });
      if (REC.url) URL.revokeObjectURL(REC.url);
      REC.url = URL.createObjectURL(blob);
      REC.stream?.getTracks().forEach((t) => t.stop());
      REC.stream = null; REC.rec = null;
      resolve({ ok: true, url: REC.url, blob, bytes: blob.size });
    };
    try { r.stop(); } catch { resolve({ ok: false, error: "stop-failed" }); }
  });
}

function recBusy() { return !!REC.rec && REC.rec.state === "recording"; }

/* ── 聞き取り結果の照合 ─────────────────────────────────── */

function normalizeEn(s) {
  return String(s || "").toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * 目標の文と、聞き取られた文を単語ごとに突き合わせる。
 * 「通じたか」を語単位で返す。認識できなかった語 = 相手に届かなかった語。
 */
function compareSpoken(target, heard) {
  const t = normalizeEn(target).split(" ").filter(Boolean);
  const h = normalizeEn(heard).split(" ").filter(Boolean);
  const pool = h.slice();
  const words = t.map((w) => {
    const i = pool.indexOf(w);
    if (i >= 0) { pool.splice(i, 1); return { word: w, ok: true, heardAs: w }; }
    return { word: w, ok: false, heardAs: null };
  });
  // 届かなかった語に、認識側の余りを順に当てて「こう聞こえた」を作る
  let k = 0;
  for (const w of words) if (!w.ok && k < pool.length) w.heardAs = pool[k++];
  const ok = words.filter((w) => w.ok).length;
  return { words, score: t.length ? ok / t.length : 0, matched: ok, total: t.length, heard: normalizeEn(heard) };
}
