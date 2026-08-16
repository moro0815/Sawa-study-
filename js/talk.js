/* ═══════════════════════════════════════════════════════════
   talk.js — 英会話モード(Lukeと英語でおしゃべり)
   ─────────────────────────────────────────────────────────
   ★なにを作ったか
   声で英語をやりとりする「場」。話す → 聞こえた文字が出る →
   Lukeが英語で返して声でも読む → また話す。終わると振り返り。

   ★会話中は直さない。直すのは終わったあとに最大2つ
   話している最中に文法を直されると、次の一言が出なくなる。
   会話の中では、正しい形でさりげなく言い直して返すだけ(リキャスト)。
   明示的に直すのは会話が終わったあと(Norris & Ortega 2000 のメタ分析で
   明示的指導 d≈0.96 > 暗示的 d≈0.54。ただし比較対象は指導方法であって
   「会話中に割り込むか」ではないので、割り込まない理由は
   別:不安が上がると話さなくなる、という運用上の判断)。

   ★相手をLukeにした理由
   相手が「先生」だと、間違い=評価される、になる。
   犬相手なら間違えても平気。沙和さんは聞くのが少し苦手なので、
   ここがいちばん効く。

   ★日本語で言ってもいい
   言えないとき、詰まって終わりにしない。日本語で言えば
   Lukeが「英語ではこう言うよ」と教えて、言ってみる流れに変わる。

   ★市販アプリに勝てる場所と勝てない場所(正直に)
   勝てない:音声認識の素の性能(専用アプリは専用エンジンを持つ)
   勝てる:このアプリは沙和さんを知っている。弱い音・弱い文法・
   覚えかけの単語・獣医の夢。会話にそれを織り込める。
   ═══════════════════════════════════════════════════════════ */

/* この画面が使うAIは「英語用」。勉強用とは別のキー・別の会社にできる */
const TALK_USE = "talk";

const TALK = {
  open: false, busy: false, speaking: false,
  msgs: [],            // API用 [{role, content:string}]
  turns: 0,            // 沙和さんが英語で言えた回数
  topic: null,
  abort: null,
  fixes: [],           // 振り返りで出す直し
};

/* ── レベルと話題 ──────────────────────────────────────── */

function talkLevel(S) {
  return Math.min(3, englishLayer(S).n);   // 会話はまず3段階まで
}

/** 話題を順番に回す(同じ話題ばかりにしない)。夢の話題は少し出やすく */
function talkPickTopic(S) {
  const lv = talkLevel(S);
  const pool = CONV_TOPICS.filter((t) => t.lv <= lv);
  const last = engState(S).lastTalkTopic;
  const cands = pool.filter((t) => t.id !== last);
  const vet = cands.find((t) => t.id === "pet" || t.id === "vet");
  const t = (vet && Math.random() < 0.4) ? vet : cands[Math.floor(Math.random() * cands.length)] || pool[0];
  engState(S).lastTalkTopic = t.id;
  return t;
}

/* ── プロンプト ────────────────────────────────────────── */

function talkSystemPrompt(S) {
  const lv = talkLevel(S);
  const due = dueWords(S, 5).map((d) => d.word);
  const traps = weakGrammarTraps(S, 3);
  const caps = {
    1: "1〜2文だけ。1文は8語まで。中1の一学期の文法(be動詞・一般動詞の現在形)だけで話す",
    2: "2〜3文まで。1文は10語まで。過去形・助動詞canは使ってよい",
    3: "3文まで。意見を聞く質問もしてよい。ただし難しい語は避ける",
  }[lv];

  /* ★人格の説明は先頭と末尾の両方に置く(別人格の事故の再発防止) */
  return `あなたはLuke(ルーク)。マルプーの男の子の犬で、1歳。${S.name || "沙和"}さん(12歳・日本の中学1年生)の相棒。
いまは「英語でおしゃべりする時間」です。あなたは英語で話します。

# 話し方
- ${caps}
- 質問は1回に1つだけ。答えやすい質問(Yes/Noか、一語で答えられるもの)から
- 相手の言った【内容】に先に反応する。文法より内容。"Oh, a cat! Nice!" のように
- 犬らしく、明るく、短く。むずかしい言い回しをしない

# ぜったいに守ること
- **会話中に間違いを指摘しない。** 「It's wrong」「You should say...」を言わない
- 間違いがあったら、**正しい形でさりげなく言い直して返す**だけ(例:相手 "I go park yesterday" → あなた "Oh, you went to the park! Fun!")
- 相手が日本語で言ってきたら、責めずに「英語ではこう言うよ」と短い英文を教えて、"Your turn!" と言ってみるよう誘う
- 聞き取りの文字が変(意味不明)なときは、1回だけ "Sorry? One more time?" と聞き返す。2回続いたら話題を少し変える
- 沈黙や短い返事("Yes." だけ等)も、そのまま受けとめて次の易しい質問へ。急かさない

# 織り込むと良いもの(無理には使わない)
${due.length ? `- 覚えかけの単語:${due.join(", ")} — 自然に会話に混ぜて使ってみせる` : ""}
${traps.length ? `- 苦手な文法:${traps.map((t) => t.name).join(" / ")} — あなたが正しい形を多めに使ってみせる(説明はしない)` : ""}
- ${S.name || "沙和"}さんの夢は獣医。動物の話題は喜ぶ

# 返事の形式(毎回)
英語の返事を書いたあと、最後の行に必ず「JP: 」に続けて日本語訳を1行で書く。
(訳は画面で隠しておき、本人が押したときだけ見せます。読み上げには使いません)
${talkAudioMode() ? `
# 音声が送られてきたとき
相手の発話は【録音された声】で届きます。返事の【最初の行】に「HEARD: 」に続けて、
聞こえた英語をそのまま書いてください(本人の確認用。直さずそのまま)。
まったく聞き取れなかったときだけ「HEARD: ???」と書き、返事の中で "Sorry? One more time?" と聞き返してください。
その次の行から英語の返事、最後に JP: の行です。` : ""}

あなたはLuke。犬です。英語の先生ではなく、いっしょにおしゃべりする相棒です。`;
}

/** 振り返りをAIに書かせるための道具 */
const TALK_FEEDBACK_TOOL = {
  name: "talk_feedback",
  description: "英会話セッションの振り返り。会話が終わったら必ず1回だけ呼ぶ。",
  input_schema: {
    type: "object",
    properties: {
      said_well: {
        type: "array", items: { type: "string" },
        description: "今日【言えたこと】を日本語で2〜3個。内容をほめる(『ネコの話ができた』など)。文法の話はここに入れない",
      },
      fixes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            you_said: { type: "string", description: "本人が実際に言った英語" },
            better: { type: "string", description: "自然な言い方(短く)" },
            why_jp: { type: "string", description: "日本語での一言説明(やさしく、20字程度)" },
          },
          required: ["you_said", "better"],
        },
        description: "直すと良いところ。【最大2個】。細かい冠詞などより、意味が変わるものを優先。無ければ空でよい",
      },
      cheer: { type: "string", description: "Lukeからの一言(日本語、20字程度)" },
    },
    required: ["said_well", "fixes"],
  },
};

/* ── 音声入力 ──────────────────────────────────────────────
   2系統ある。使えるほうを自動で選ぶ。

   A. 声をそのまま Gemini に送る(こちらが本命)
      ブラウザの文字起こしを介さず、録音した音声を AI が直接聞く。
      日本語なまりの英語に対して、文脈ごと理解するぶん取りこぼしが少ない。
      Gemini は画像と同じ inlineData で音声を受けるので、
      通信先も APIキーも追加しなくてよい(Whisper 等の導入を見送った理由)。
      ★他社(Claude など)は音声入力に対応していないため、Gemini のときだけ。

   B. ブラウザの音声認識(Web Speech)
      Gemini 以外のプロバイダのときの代替。文字起こし→文字を送る。 */

/** 声をそのまま送れるか(Gemini + 録音できる端末) */
function talkAudioMode() {
  return useProviderId(S, "talk") === "google" && typeof canRecord === "function" && canRecord();
}

const TALK_REC_MAX_MS = 30000;   // 録りっぱなし防止。30秒で自動で止める

function talkBlobToB64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** 途中経過を画面に出しながら聞く。listenOnce(発音ドリル用)とは別物 */
function talkListen({ onInterim, timeout = 12000 } = {}) {
  return new Promise((resolve) => {
    const Ctor = recognizerCtor();
    if (!Ctor) return resolve({ ok: false, error: "unsupported" });
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = true;
    r.maxAlternatives = 1;
    let final = "", settled = false;
    const done = (v) => { if (!settled) { settled = true; try { r.stop(); } catch {} resolve(v); } };
    const timer = setTimeout(() => done(final ? { ok: true, text: final } : { ok: false, error: "timeout" }), timeout);
    r.onresult = (e) => {
      let interim = "";
      for (const res of e.results) {
        if (res.isFinal) final += res[0].transcript;
        else interim += res[0].transcript;
      }
      onInterim?.(final + interim);
    };
    r.onerror = (e) => { clearTimeout(timer); done({ ok: false, error: e.error || "error" }); };
    r.onend = () => { clearTimeout(timer); done(final ? { ok: true, text: final.trim() } : { ok: false, error: "no-speech" }); };
    try { r.start(); } catch { clearTimeout(timer); done({ ok: false, error: "start-failed" }); }
    TALK.rec = r;
  });
}

/* ── 画面 ──────────────────────────────────────────────── */

function talkBubble(who, en, jp) {
  const box = document.getElementById("tkChat");
  const el = document.createElement("div");
  el.className = "tk-b " + (who === "me" ? "tk-me" : "tk-luke");
  el.innerHTML = who === "me"
    ? `<div class="tk-t">${esc(en)}</div>`
    : `<div class="tk-t">${esc(en)}</div>
       <div class="tk-tools">
         <button class="tk-s" data-say="${esc(en)}" title="もういちど聞く">🔊</button>
         <button class="tk-s tk-slow" data-say="${esc(en)}" title="ゆっくり聞く">🐢</button>
         ${jp ? `<button class="tk-s tk-jp" title="日本語を見る">🇯🇵</button><span class="tk-hint" hidden>${esc(jp)}</span>` : ""}
       </div>`;
  box.appendChild(el);
  el.querySelectorAll("[data-say]").forEach((b) => b.onclick = () =>
    talkSpeak(b.dataset.say, { rate: b.classList.contains("tk-slow") ? 0.7 : 0.92 }));
  const jpBtn = el.querySelector(".tk-jp");
  if (jpBtn) jpBtn.onclick = () => { const h = el.querySelector(".tk-hint"); h.hidden = !h.hidden; };
  box.scrollTop = box.scrollHeight;
  return el;
}

function talkStatus(text) {
  const s = document.getElementById("tkStatus");
  if (s) s.textContent = text || "";
}

async function talkSpeak(en, opts = {}) {
  TALK.speaking = true;
  talkMicEnable(false);                       // 読み上げ中はマイクを止める(自分の声を拾わないように)
  /* ★Lukeの声は毎回おなじ。相棒なので声が変わるとおかしい。
     選ばれた声(なければいちばん自然と判定したもの)を明示して渡す。
     以前は声を指定せず、macOSではジョーク音声が選ばれていた。 */
  await speak(en, {
    voice: opts.voice || (typeof lukeVoice === "function" ? lukeVoice() : null),
    varied: false,
    rate: opts.rate ?? 0.95,
  });
  TALK.speaking = false;
  talkMicEnable(true);
}

function talkMicEnable(on) {
  const b = document.getElementById("tkMic");
  if (b) b.disabled = !on || TALK.busy;
}

/** Lukeの返事を HEARD行 / 英語 / JP行 に分ける */
function talkParse(text) {
  let rest = String(text).trim();
  let heard = "";
  const hm = rest.match(/^HEARD: ?(.*)$/m);
  if (hm) { heard = hm[1].trim(); rest = rest.replace(/^HEARD: ?.*$\n?/m, ""); }
  const m = rest.split(/\nJP: ?/);
  return { heard, en: (m[0] || "").trim(), jp: (m[1] || "").trim() };
}
/* 旧名。呼び出しが残っていても壊れないように */
function talkSplitJp(text) { const p = talkParse(text); return { en: p.en, jp: p.jp }; }

/* ── 会話の流れ ────────────────────────────────────────── */

function talkGreeting(S) {
  const t = TALK.topic;
  const q = t.q[Math.floor(Math.random() * t.q.length)];
  const en = `Hi ${S.name || "Sawa"}! Let's talk! ${q}`;
  return { en, jp: `やあ!おしゃべりしよう!(話題:${t.name})` };
}

async function talkUser(text) {
  if (TALK.busy || !text.trim()) return;
  TALK.busy = true; talkMicEnable(false);
  talkBubble("me", text.trim());
  TALK.msgs.push({ role: "user", content: text.trim() });
  /* 英語で言えた回数。日本語だけの発話は数えない(あとで英語で言えたら数える) */
  if (/[a-zA-Z]{2,}/.test(text)) TALK.turns++;
  document.getElementById("tkTurns").textContent = TALK.turns ? `🗨 ${TALK.turns}` : "";
  talkStatus("Lukeが考えています…");

  try {
    TALK.abort = new AbortController();
    const res = await chatWithTools({
      provider: useProviderId(S, TALK_USE), model: curModel(TALK_USE),
      apiKey: curKey(TALK_USE), baseUrl: curBaseUrl(TALK_USE),
      system: talkSystemPrompt(S),
      messages: TALK.msgs, tools: [],
      runTool: async () => ({}),
      signal: TALK.abort.signal,
    });
    TALK.msgs = res.messages;
    const { en, jp } = talkParse(res.text);
    talkStatus("");
    talkBubble("luke", en || res.text, jp);
    await talkSpeak(en || res.text);
  } catch (e) {
    talkStatus("");
    if (e?.kind !== "abort") {
      console.warn("talk:", scrubSecrets(String(e?.message || e), S));
      /* キーが拒否されたら、ふだんの会話と同じ仕組みに印をつける(保護者タブに出る) */
      if (e?.status === 401 || e?.status === 403) { markKeyInvalid(S, TALK_USE); save(); }
      talkBubble("luke", "(うまくつながらなかったみたい。もういちど話してみて。何度もだめなら、おうちの人に伝えてね)", "");
    }
  }
  TALK.busy = false; talkMicEnable(true);
}

/** 声をそのままGeminiに送る(A系統) */
async function talkUserAudio(blob) {
  if (TALK.busy) return;
  TALK.busy = true; talkMicEnable(false);
  const meEl = talkBubble("me", "🎤 …");
  talkStatus("Lukeが聞いています…");
  try {
    const b64 = await talkBlobToB64(blob);
    const mime = (blob.type || "audio/webm").split(";")[0];
    TALK.msgs.push({ role: "user", content: [
      { type: "audio", source: { type: "base64", media_type: mime, data: b64 } },
      { type: "text", text: "(声で話しました)" },
    ] });
    TALK.abort = new AbortController();
    const res = await chatWithTools({
      provider: useProviderId(S, TALK_USE), model: curModel(TALK_USE),
      apiKey: curKey(TALK_USE), baseUrl: curBaseUrl(TALK_USE),
      system: talkSystemPrompt(S),
      messages: TALK.msgs, tools: [],
      runTool: async () => ({}),
      signal: TALK.abort.signal,
    });
    TALK.msgs = res.messages;
    const p = talkParse(res.text);
    /* 自分の吹き出しを「AIにどう聞こえたか」で置きかえる(確認用) */
    if (p.heard && p.heard !== "???") {
      meEl.querySelector(".tk-t").textContent = p.heard;
      if (/[a-zA-Z]{2,}/.test(p.heard)) {
        TALK.turns++;
        document.getElementById("tkTurns").textContent = `🗨 ${TALK.turns}`;
      }
    } else {
      meEl.querySelector(".tk-t").textContent = "🎤(うまく聞こえなかったみたい)";
    }
    talkStatus("");
    talkBubble("luke", p.en || res.text, p.jp);
    await talkSpeak(p.en || res.text);
  } catch (e) {
    talkStatus("");
    meEl.querySelector(".tk-t").textContent = "🎤(とどかなかった)";
    if (e?.kind !== "abort") {
      console.warn("talk-audio:", scrubSecrets(String(e?.message || e), S));
      if (e?.status === 401 || e?.status === 403) { markKeyInvalid(S, TALK_USE); save(); }
      talkBubble("luke", "(うまくつながらなかったみたい。もういちど話してみて。何度もだめなら、おうちの人に伝えてね)", "");
    }
  }
  TALK.busy = false; talkMicEnable(true);
}

async function talkMicTap() {
  if (TALK.busy || TALK.speaking) return;
  const mic = document.getElementById("tkMic");

  /* A. Gemini なら、声をそのまま送る(押して話す→もう一度押して送る) */
  if (talkAudioMode()) {
    if (typeof recBusy === "function" && recBusy()) {
      clearTimeout(TALK.recTimer);
      mic.classList.remove("on"); mic.textContent = "🎤";
      const r = await recStop();
      talkStatus("");
      /* 2KB未満は「押してすぐ離した」— 音がほぼ入っていない */
      if (r.ok && r.bytes > 2000) talkUserAudio(r.blob);
      else talkStatus("みじかすぎたみたい。もういちど、押してから話してね");
      return;
    }
    const st = await recStart();
    if (!st.ok) {
      if (st.error === "denied") talkStatus("マイクが「だめ」になってるみたい。おうちの人に伝えてね");
      else talkStatus("マイクが使えないみたい。下の欄に書いてね");
      return;
    }
    mic.classList.add("on"); mic.textContent = "⏹";
    talkStatus("きいています… 話しおわったら、もういちど押してね");
    TALK.recTimer = setTimeout(() => { if (typeof recBusy === "function" && recBusy()) talkMicTap(); }, TALK_REC_MAX_MS);
    return;
  }

  /* B. それ以外は、ブラウザの音声認識で文字にして送る */
  mic.classList.add("on");
  talkStatus("きいています… 英語で話してみて");
  const live = document.getElementById("tkLive");
  live.textContent = ""; live.hidden = false;
  const r = await talkListen({ onInterim: (t) => { live.textContent = t; } });
  mic.classList.remove("on");
  live.hidden = true;
  if (r.ok) { talkStatus(""); talkUser(r.text); }
  else if (r.error === "unsupported") talkStatus("この端末では声が使えないみたい。下の欄に書いてね");
  else if (r.error === "not-allowed" || r.error === "service-not-allowed") talkStatus("マイクが「だめ」になってるみたい。おうちの人に伝えてね");
  else talkStatus("聞き取れなかった…もういちど、ゆっくりどうぞ");
}

/* ── 振り返り ──────────────────────────────────────────── */

async function talkEnd() {
  try { TALK.rec?.stop(); } catch {}
  clearTimeout(TALK.recTimer);
  if (typeof recBusy === "function" && recBusy()) await recStop();
  stopSpeaking();
  if (!TALK.turns) { closeTalk(); return; }    // 一言も話していなければ、静かに閉じるだけ

  TALK.busy = true;
  talkStatus("きょうの ふりかえりを作っています…");
  let fb = null;
  try {
    TALK.abort = new AbortController();
    let captured = null;
    await chatWithTools({
      provider: useProviderId(S, TALK_USE), model: curModel(TALK_USE),
      apiKey: curKey(TALK_USE), baseUrl: curBaseUrl(TALK_USE),
      system: talkSystemPrompt(S) +
        "\n\n# いまから会話は終わりです\ntalk_feedback を必ず1回だけ呼んでください。呼んだら 'Bye! See you!' とだけ言ってください。",
      messages: [...TALK.msgs, { role: "user", content: "(おしゃべりを終わります。振り返りをお願いします)" }],
      tools: [TALK_FEEDBACK_TOOL],
      runTool: async (name, input) => { if (name === "talk_feedback") captured = input; return { ok: true }; },
      signal: TALK.abort.signal,
    });
    fb = captured;
  } catch (e) {
    console.warn("talk-fb:", scrubSecrets(String(e?.message || e), S));
  }

  /* AIが振り返りを返せなくても、会話の事実だけで締める(数字は出さない方針のまま) */
  const saidWell = fb?.said_well?.length ? fb.said_well : [`英語で ${TALK.turns} 回 やりとりできた`];
  const fixes = (fb?.fixes || []).slice(0, 2);
  TALK.fixes = fixes;

  const box = document.getElementById("tkChat");
  const el = document.createElement("div");
  el.className = "tk-wrap";
  el.innerHTML = `
    <div class="tk-wrap-h">🐾 きょうの おしゃべり</div>
    <div class="tk-wrap-s">できたこと</div>
    <ul class="tk-wl">${saidWell.slice(0, 3).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
    ${fixes.length ? `
      <div class="tk-wrap-s">ここだけ、こう言うともっと伝わる</div>
      ${fixes.map((f, i) => `
        <div class="tk-fix">
          <div class="tk-fx-you">${esc(f.you_said)}</div>
          <div class="tk-fx-arrow">↓</div>
          <div class="tk-fx-better">${esc(f.better)} <button class="tk-s" data-say="${esc(f.better)}">🔊</button></div>
          ${f.why_jp ? `<div class="tk-fx-why">${esc(f.why_jp)}</div>` : ""}
          <button class="tk-fx-try" data-i="${i}">🎤 言ってみる</button>
          <span class="tk-fx-ok" hidden>✓ いえた!</span>
        </div>`).join("")}` : ""}
    ${fb?.cheer ? `<div class="tk-cheer">🐕「${esc(fb.cheer)}」</div>` : ""}
    <button class="btn btn-primary tk-close2" id="tkDone">おしまい</button>`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;

  el.querySelectorAll("[data-say]").forEach((b) => b.onclick = () => talkSpeak(b.dataset.say, { rate: 0.85 }));
  /* 直しは「聞く→言ってみる→合った語が6割」で ✓。判定は甘くてよい(ここは練習であって試験ではない) */
  el.querySelectorAll(".tk-fx-try").forEach((b) => b.onclick = async () => {
    const f = fixes[Number(b.dataset.i)];
    b.disabled = true; talkStatus("きいています…");
    const r = await talkListen({ timeout: 8000 });
    talkStatus(""); b.disabled = false;
    if (r.ok && compareSpoken(f.better, r.text).score >= 0.6) {
      b.hidden = true;
      b.parentElement.querySelector(".tk-fx-ok").hidden = false;
    } else if (r.ok) {
      talkStatus("おしい!もういちど 🔊 を聞いてから どうぞ");
    }
  });
  el.querySelector("#tkDone").onclick = closeTalk;

  /* 記録:会話の回数(英語レベル判定に使う)+ 生データに1行 */
  noteConversation(S, TALK.topic?.id, TALK.turns, talkLevel(S));
  rawPush({ kind: "conv", qid: "talk:" + (TALK.topic?.id || ""), subject: "english",
    answer: `turns:${TALK.turns}`, expect: "", correct: null });
  save();
  TALK.busy = false;
  document.getElementById("tkEnd").hidden = true;
  document.getElementById("tkMicRow").hidden = true;
}

/* ── 開閉 ──────────────────────────────────────────────── */

function openTalk() {
  /* AIが使えない状態なら、子ども向けの案内だけ出して開かない */
  if (typeof keyUsable === "function" && !keyUsable(S, TALK_USE)) {
    toast("いまはAIとお話しできません。ホームの案内を見てね");
    return;
  }
  const pad = document.getElementById("talkPad");
  TALK.open = true; TALK.msgs = []; TALK.turns = 0; TALK.busy = false; TALK.fixes = [];
  TALK.topic = talkPickTopic(S);
  pad.hidden = false;
  document.getElementById("tkChat").innerHTML = "";
  document.getElementById("tkTurns").textContent = "";
  document.getElementById("tkEnd").hidden = false;
  document.getElementById("tkMicRow").hidden = false;
  document.getElementById("tkTopic").textContent = `${TALK.topic.emoji} ${TALK.topic.name}`;
  /* 声の道が1つでもあればマイクを出す(Gemini直送 or ブラウザの音声認識) */
  const canMic = talkAudioMode() || canRecognize();
  const mic = document.getElementById("tkMic");
  mic.hidden = !canMic;
  mic.textContent = "🎤"; mic.classList.remove("on");
  document.getElementById("tkNoMic").hidden = canMic;

  const g = talkGreeting(S);
  /* ★履歴は必ず user から始める。
     repairPairs() は先頭の assistant を落とすので、あいさつだけを入れると
     Lukeが自分の最初の質問を覚えていない状態になり、同じことをもう一度聞く。 */
  TALK.msgs.push({ role: "user", content: `(英語のおしゃべりを始めます。話題は「${TALK.topic.name}」です)` });
  TALK.msgs.push({ role: "assistant", content: g.en + "\nJP: " + g.jp });
  talkBubble("luke", g.en, g.jp);
  talkSpeak(g.en);
  save();
}

function closeTalk() {
  try { TALK.abort?.abort(); } catch {}
  try { TALK.rec?.stop(); } catch {}
  clearTimeout(TALK.recTimer);
  if (typeof recBusy === "function" && recBusy()) recStop();   // 録音しっぱなしにしない
  stopSpeaking();
  TALK.open = false;
  document.getElementById("talkPad").hidden = true;
}
