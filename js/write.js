/* ═══════════════════════════════════════════════════════════════════
   write.js — 書く学習(漢字・英単語のつづり)

   ★なぜ「書く」を別に作るのか
   このアプリの学習はすべて会話です。会話は強い方法ですが、
   **漢字とつづりだけは、見て分かることと書けることが別**です。
   選択肢から選べる漢字も、白紙からは出てきません。
   だから「思い出して、手を動かして、出す」形が要ります(検索練習そのもの)。

   ★iPad と iPhone のどちらでも動くこと
   Apple Pencil でも指でも書けるように Pointer Events で受けます。
   筆圧(pressure)が取れる端末では線の太さが変わります。取れなければ一定。
   iPhone の狭い画面でも、マス目は正方形を保ちます。

   ★採点を2本立てにした理由
   1) 自分で見る(既定)…書く → 答えを出す → 自分で ○/× を押す。
      無料・すぐ・通信なし。漢字練習は本来この形ですし、
      このアプリの「確信度を先に言う」流れとも合います。
   2) AI先生に見てもらう…書いた画像をそのまま送って見てもらう。
      1文字ごとに通信するので、迷ったものだけに使います。

   ★書いた絵は保存しません。残すのは結果だけです(容量のため)。
   ═══════════════════════════════════════════════════════════════════ */

/* ── 練習する項目 ─────────────────────────────────────
   ★中1でつまずきやすい漢字を種として持っておきます。
     これだけで足りるとは考えていません。実際に読んだ文で出てきたものを
     AI が add_write_item で足していく形が本体です。 */

const KANJI_SEED = [
  /* 形が似ていて取りちがえるもの */
  { a: "険", r: "けん", ex: "山道は危◯だ",     w: "検・験と混同しやすい(こざとへん)" },
  { a: "検", r: "けん", ex: "◯査を受ける",     w: "険・験と混同しやすい(きへん)" },
  { a: "験", r: "けん", ex: "実◯をする",       w: "険・検と混同しやすい(うまへん)" },
  { a: "複", r: "ふく", ex: "◯雑な問題",       w: "復と混同しやすい(ころもへん)" },
  { a: "復", r: "ふく", ex: "◯習する",         w: "複と混同しやすい(ぎょうにんべん)" },
  { a: "招", r: "しょう", ex: "友だちを◯く",   w: "紹と混同しやすい" },
  { a: "紹", r: "しょう", ex: "◯介する",       w: "招と混同しやすい" },
  /* 獣医の道でよく出るもの */
  { a: "獣", r: "じゅう", ex: "◯医になりたい", w: "画数が多い。いちばん書けるようにしたい字" },
  { a: "護", r: "ご",   ex: "動物を保◯する",   w: "" },
  { a: "療", r: "りょう", ex: "治◯を受ける",   w: "" },
  { a: "菌", r: "きん", ex: "細◯を調べる",     w: "くさかんむり" },
  { a: "臓", r: "ぞう", ex: "心◯の音を聞く",   w: "にくづき" },
  { a: "脈", r: "みゃく", ex: "◯拍をはかる",   w: "にくづき" },
  { a: "染", r: "せん", ex: "感◯を防ぐ",       w: "上は「九」ではない" },
  { a: "疫", r: "えき", ex: "免◯がつく",       w: "やまいだれ" },
  { a: "繁", r: "はん", ex: "◯殖のしくみ",     w: "" },
  { a: "餌", r: "えさ", ex: "◯をあげる",       w: "" },
  /* ふだんよく書きまちがえるもの */
  { a: "衛", r: "えい", ex: "◯生に気をつける", w: "" },
  { a: "簡", r: "かん", ex: "◯単な計算",       w: "" },
  { a: "潔", r: "けつ", ex: "清◯にする",       w: "" },
  { a: "縮", r: "しゅく", ex: "短◯する",       w: "" },
  { a: "承", r: "しょう", ex: "◯知しました",   w: "書き順を間違えやすい" },
  { a: "厳", r: "げん", ex: "◯しい規則",       w: "画数が多い" },
  { a: "誕", r: "たん", ex: "◯生日を祝う",     w: "" },
  { a: "築", r: "ちく", ex: "建◯を学ぶ",       w: "" },
  { a: "貿", r: "ぼう", ex: "◯易がさかん",     w: "社会で使う" },
  /* 数学・理科の文章題で出るもの */
  { a: "垂", r: "すい", ex: "◯直に交わる",     w: "数学で使う" },
  { a: "率", r: "りつ / そつ", ex: "確◯を求める", w: "読みが2つある(確率・引率)" },
  { a: "沸", r: "ふっ", ex: "水が◯騰する",     w: "理科で使う" },
  { a: "溶", r: "よう", ex: "食塩が◯ける",     w: "理科で使う。融・熔と別" },
  { a: "蒸", r: "じょう", ex: "水が◯発する",   w: "理科で使う" },
];

/* ── つづりの種 ────────────────────────────────────────
   ★ここが空だった。英語タブでAIが登録した語からしか出ないので、
     使い始めた日は1問も出ませんでした。設計漏れです。

   選び方は「よく出る語」ではなく **「聞けば分かるのに、書けない語」** です。
   中学生が実際に落とすのは次の5種類なので、そこに絞っています。
     ・音にならない字がある(know の k、write の w)
     ・ie / ei の並び(believe と receive)
     ・子音を重ねる(beginning、stopped)
     ・-tion / -sion / -ous の語尾
     ・不規則動詞の過去形(bought、taught) */

const SPELL_SEED = [
  /* 音にならない字がある */
  { a: "know",      m: "知っている",   ex: "I know his name.",            w: "先頭の k は読まない" },
  { a: "write",     m: "書く",         ex: "Write your name here.",       w: "先頭の w は読まない" },
  { a: "listen",    m: "聞く",         ex: "Listen to me.",               w: "t は読まない" },
  { a: "answer",    m: "答え・答える", ex: "Answer the question.",        w: "w は読まない" },
  { a: "island",    m: "島",           ex: "Japan is an island country.", w: "s は読まない" },
  { a: "science",   m: "科学・理科",   ex: "I like science.",             w: "c は読まない。獣医に必須" },
  { a: "night",     m: "夜",           ex: "Good night.",                 w: "gh は読まない" },
  { a: "eight",     m: "8",            ex: "I have eight pens.",          w: "gh は読まない" },
  { a: "daughter",  m: "娘",           ex: "She is my daughter.",         w: "gh は読まない" },
  { a: "half",      m: "半分",         ex: "Half of them are dogs.",      w: "l は読まない" },
  { a: "hour",      m: "時間",         ex: "one hour",                    w: "h は読まない" },
  { a: "climb",     m: "登る",         ex: "climb a mountain",            w: "最後の b は読まない" },

  /* ie / ei の並び */
  { a: "believe",   m: "信じる",       ex: "I believe you.",              w: "ie の順。receive と逆" },
  { a: "receive",   m: "受け取る",     ex: "I receive a letter.",         w: "ei の順。believe と逆" },
  { a: "friend",    m: "友だち",       ex: "She is my friend.",           w: "ie の順。frend ではない" },
  { a: "piece",     m: "1つ・かけら",  ex: "a piece of paper",            w: "ie の順" },
  { a: "field",     m: "野原・分野",   ex: "in the field of medicine",    w: "ie の順" },

  /* 子音を重ねる */
  { a: "beginning", m: "はじまり",     ex: "at the beginning",            w: "n を2つ重ねる" },
  { a: "stopped",   m: "止まった",     ex: "The bus stopped.",            w: "p を2つ重ねる" },
  { a: "running",   m: "走っている",   ex: "The dog is running.",         w: "n を2つ重ねる" },
  { a: "planned",   m: "計画した",     ex: "We planned a trip.",          w: "n を2つ重ねる" },
  { a: "different", m: "ちがう",       ex: "They are different.",         w: "f を2つ重ねる" },
  { a: "necessary", m: "必要な",       ex: "Sleep is necessary.",         w: "c は1つ、s は2つ" },
  { a: "tomorrow",  m: "明日",         ex: "See you tomorrow.",           w: "m は1つ、r は2つ" },
  { a: "beautiful", m: "美しい",       ex: "a beautiful cat",             w: "eau の並び" },

  /* 語尾でつまずく */
  { a: "question",  m: "質問",         ex: "Answer the question.",        w: "-tion" },
  { a: "station",   m: "駅",           ex: "at the station",              w: "-tion" },
  { a: "information", m: "情報",       ex: "useful information",          w: "-tion。数えられない" },
  { a: "education", m: "教育",         ex: "school education",            w: "-tion" },
  { a: "decision",  m: "決定",         ex: "make a decision",             w: "-sion" },
  { a: "famous",    m: "有名な",       ex: "a famous doctor",             w: "-ous" },
  { a: "dangerous", m: "危険な",       ex: "a dangerous animal",          w: "-ous" },
  { a: "delicious", m: "おいしい",     ex: "This is delicious.",          w: "-ous" },

  /* 不規則動詞の過去形 */
  { a: "bought",    m: "買った",       ex: "I bought a book.",            w: "buy の過去。ough の並び" },
  { a: "brought",   m: "持ってきた",   ex: "She brought her dog.",        w: "bring の過去" },
  { a: "caught",    m: "つかまえた",   ex: "I caught a fish.",            w: "catch の過去。augh の並び" },
  { a: "taught",    m: "教えた",       ex: "He taught me English.",       w: "teach の過去" },
  { a: "thought",   m: "思った",       ex: "I thought so.",               w: "think の過去" },
  { a: "wrote",     m: "書いた",       ex: "I wrote a letter.",           w: "write の過去。w は読まない" },
  { a: "began",     m: "はじめた",     ex: "The class began.",            w: "begin の過去" },

  /* 中学でよく落とす基本語 */
  { a: "favorite",  m: "いちばん好きな", ex: "my favorite animal",        w: "" },
  { a: "restaurant", m: "レストラン",  ex: "a good restaurant",           w: "au の並び" },
  { a: "February",  m: "2月",          ex: "in February",                 w: "r を落としやすい" },
  { a: "Wednesday", m: "水曜日",       ex: "on Wednesday",                w: "d は読まない" },
  { a: "language",  m: "言語",         ex: "the English language",        w: "gu の並び" },
  { a: "because",   m: "なぜなら",     ex: "because I like it",           w: "au の並び" },
  { a: "interesting", m: "おもしろい", ex: "an interesting book",         w: "e が3つ" },
  { a: "remember",  m: "思い出す",     ex: "I remember it.",              w: "" },
  { a: "important", m: "大切な",       ex: "This is important.",          w: "" },
  { a: "difficult", m: "むずかしい",   ex: "a difficult question",        w: "f を2つ" },
  { a: "through",   m: "〜を通って",   ex: "through the door",            w: "though と別。ough の並び" },
  { a: "enough",    m: "十分な",       ex: "enough water",                w: "ough の並び" },
  { a: "foreign",   m: "外国の",       ex: "a foreign country",           w: "g は読まない。ei の順" },

  /* 獣医の道でよく使う語 */
  { a: "animal",    m: "動物",         ex: "I love animals.",             w: "" },
  { a: "hospital",  m: "病院",         ex: "an animal hospital",          w: "" },
  { a: "medicine",  m: "薬・医学",     ex: "give the dog medicine",       w: "" },
  { a: "health",    m: "健康",         ex: "the health of animals",       w: "" },
  { a: "disease",   m: "病気",         ex: "a serious disease",           w: "ea の並び" },
  { a: "surgery",   m: "手術",         ex: "The dog had surgery.",        w: "" },
  { a: "treatment", m: "治療",         ex: "the right treatment",         w: "" },
  { a: "veterinarian", m: "獣医",      ex: "I want to be a veterinarian.", w: "長い。vet と略す" },
];

/**
 * 例文の中の答えを伏せる。
 * ★これが無いと、つづりの問題で **例文に答えがそのまま出て**しまいます
 *   (漢字は例文側を ◯ にしてありますが、英語は元の文をそのまま持つため)。
 * 語尾の変化(-s / -ed / -ing)も一緒に伏せます。
 */
function maskAnswer(example, answer) {
  const a = String(answer || "").trim();
  if (!a || !example) return example || "";
  const esc = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(example).replace(new RegExp(esc + "(s|es|ed|ing|d)?", "gi"), "______");
}

/** 練習項目の入れもの */
function writeState(S) {
  const w = (S.write ||= {});
  w.items ||= {};        // id -> {id, kind, a(答え), r(読み), ex(例文), w(注意), mem}
  w.log ||= [];          // 直近の結果(集計用。生データは rawlog 側)
  if (!w.seeded) {
    for (const k of KANJI_SEED) addWriteItem(S, { kind: "kanji", answer: k.a, reading: k.r, example: k.ex, note: k.w });
    w.seeded = true;
  }
  // ★つづりの種は後から足したので、seeded 済みの端末にも入るように別で見る
  if (!w.seededSpell) {
    for (const k of SPELL_SEED) addWriteItem(S, { kind: "spell", answer: k.a, reading: k.m, example: k.ex, note: k.w });
    w.seededSpell = true;
  }
  return w;
}

function writeItemId(kind, answer) { return kind + ":" + answer; }

function addWriteItem(S, o) {
  const w = (S.write ||= {}); w.items ||= {};
  const kind = o.kind === "spell" ? "spell" : "kanji";
  const a = String(o.answer || "").trim();
  if (!a) return null;
  const id = writeItemId(kind, a);
  if (w.items[id]) return w.items[id];
  w.items[id] = {
    id, kind, a,
    r: String(o.reading || "").slice(0, 40),
    ex: String(o.example || "").slice(0, 80),
    w: String(o.note || "").slice(0, 80),
    mem: newMemState(id),
  };
  return w.items[id];
}

/** 英語タブに登録済みの単語を、つづり練習に引き込む */
function syncSpellItems(S) {
  const words = S.eng?.words || {};
  let n = 0;
  for (const key in words) {
    const wd = words[key];
    if (!wd || !/^[a-z][a-z'-]{2,}$/i.test(key)) continue;
    if (addWriteItem(S, { kind: "spell", answer: key, reading: wd.meaning || "", example: wd.example || "" })) n++;
  }
  return n;
}

/** 今日やるぶん。忘れかけているものから */
function writeQueue(S, kind, limit = 8) {
  const w = writeState(S);
  syncSpellItems(S);
  const now = Date.now();
  return Object.values(w.items)
    .filter((it) => !kind || it.kind === kind)
    .map((it) => {
      const st = it.mem;
      const due = !st.S ? 1 : (st.due || 0) <= now ? 2 : 0;
      const score = due * 1000 + (1 - retrievability(st, now)) * 300 + (st.flagged ? 500 : 0);
      return { it, score, fresh: !st.S };
    })
    .filter((x) => x.score > 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.it);
}

/**
 * 1問ぶんの結果。
 * ★正誤だけでなく、確信度と回答時間も一緒に残します。
 *   「自信あり × 書けない」は漢字でも最重要の弱点だからです。
 */
function recordWrite(S, itemId, correct, confidence, ms, how) {
  const w = writeState(S);
  const it = w.items[itemId];
  if (!it) return null;
  const grade = correct ? (confidence === 3 ? 4 : 3) : (confidence === 3 ? 1 : 2);
  const r = reviewConcept(it.mem, grade, confidence || 2, Date.now());
  it.mem.flagged = !correct && confidence === 3;

  w.log.push({ t: Date.now(), id: itemId, ok: correct ? 1 : 0, cf: confidence || 0, ms: ms || null });
  if (w.log.length > 500) w.log.shift();

  // ★生データへ。ここが将来の作り直しの素になる
  rawPush({
    kind: "write", qid: itemId, subject: it.kind === "kanji" ? "国語" : "英語",
    answer: how === "ai" ? "(手書き・AI採点)" : "(手書き・自己採点)",
    expect: it.a, correct: !!correct, conf: confidence || null, ms: ms || null,
    grade, cause: correct ? "" : confidence === 3 ? "assumption" : "recall",
    level: 1, tactic: "none",
  });
  return { quadrant: r.quadrant, nextDays: Math.round(r.interval * 10) / 10, flagged: it.mem.flagged };
}

function writeStats(S) {
  const w = writeState(S);
  const all = Object.values(w.items);
  const kanji = all.filter((x) => x.kind === "kanji");
  const spell = all.filter((x) => x.kind === "spell");
  const learned = (a) => a.filter((x) => x.mem.S > 0).length;
  const solid = (a) => a.filter((x) => x.mem.mastery >= 0.7).length;
  const hot = all.filter((x) => x.mem.flagged);
  return {
    kanji: { total: kanji.length, learned: learned(kanji), solid: solid(kanji) },
    spell: { total: spell.length, learned: learned(spell), solid: solid(spell) },
    hot: hot.map((x) => x.a).slice(0, 8),
    due: writeQueue(S, null, 99).length,
  };
}

function writePromptBlock(S) {
  const st = writeStats(S);
  if (!st.kanji.total && !st.spell.total) return "";
  let s = "\n# 書く練習(漢字・つづり)\n";
  s += `- 漢字 ${st.kanji.solid}/${st.kanji.total} ・ つづり ${st.spell.solid}/${st.spell.total} ・ 今日ぶん ${st.due}件\n`;
  if (st.hot.length) s += `- **自信ありで書けなかったもの:** ${st.hot.join(" ")} … ここを優先してください\n`;
  s += "- 会話で新しい漢字や英単語が出たら add_write_item で登録してください。例文つきで登録します\n";
  s += "- 書いた画像が送られてきたら、**形・とめはね・部首**を見て、違うところを1つだけ指摘してください。\n";
  s += "  すべて直そうとしないでください。1文字につき1点だけです\n";
  s += "- ★書き順は画像から判断できません。**書き順について断定しないでください**\n";
  return s;
}

/* ═══════════════ 書く画面(キャンバス) ═══════════════
   ★Pointer Events で受けます。Apple Pencil・指・マウスが同じ道を通ります。
     筆圧が取れる端末では線の太さが変わります(iPad + Pencil)。
     touch-action:none を付けないと、書こうとしてページが動きます。 */

let padCtx = null, padStrokes = [], padCur = null, padMode = "kanji";

/**
 * @param {"kanji"|"spell"} mode
 * ★漢字は正方形のマス目、英語は横長の罫線に分けます。
 *   veterinarian のような長い語を正方形に押しこむと、
 *   iPhone では字が小さくなりすぎて、書けたかどうか自分で判定できません。
 */
function padInit(canvas, mode) {
  padMode = mode === "spell" ? "spell" : "kanji";
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  padCtx = canvas.getContext("2d");
  padCtx.scale(dpr, dpr);
  padCtx.lineCap = "round";
  padCtx.lineJoin = "round";
  padCtx.strokeStyle = "#1c2333";
  padStrokes = [];
  padRedraw(canvas);

  const pos = (e) => {
    const b = canvas.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top,
             // 筆圧。取れない端末は 0.5 が来るので、そのときは一定の太さ
             p: e.pressure > 0 && e.pressure !== 0.5 ? e.pressure : 0.5 };
  };
  canvas.onpointerdown = (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    padCur = { pts: [pos(e)], pen: e.pointerType === "pen" };
  };
  canvas.onpointermove = (e) => {
    if (!padCur) return;
    e.preventDefault();
    // 途中の点も拾う(速く書いたときカクカクしないように)
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) padCur.pts.push(pos(ev));
    padRedraw(canvas);
  };
  const up = (e) => {
    if (!padCur) return;
    if (padCur.pts.length > 1) padStrokes.push(padCur);
    padCur = null; padRedraw(canvas); renderPadBtns();
  };
  canvas.onpointerup = up;
  canvas.onpointercancel = up;
  canvas.onpointerleave = up;
}

function padRedraw(canvas) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  padCtx.clearRect(0, 0, w, h);
  padCtx.save();
  padCtx.strokeStyle = "#dfe3ea"; padCtx.lineWidth = 1;
  padCtx.strokeRect(.5, .5, w - 1, h - 1);
  padCtx.strokeStyle = "#e9ecf2";
  padCtx.beginPath();
  if (padMode === "spell") {
    /* 英語のノートと同じ4本線。上から
       上線 / 中央の点線(小文字の高さ) / 基準線 / 下線(g や y の下がる部分) */
    const top = h * 0.22, mid = h * 0.45, base = h * 0.68, low = h * 0.88;
    padCtx.setLineDash([]);
    padCtx.moveTo(0, top);  padCtx.lineTo(w, top);
    padCtx.moveTo(0, base); padCtx.lineTo(w, base);
    padCtx.stroke();
    padCtx.beginPath();
    padCtx.setLineDash([5, 5]);
    padCtx.moveTo(0, mid); padCtx.lineTo(w, mid);
    padCtx.moveTo(0, low); padCtx.lineTo(w, low);
  } else {
    // 漢字練習帳のマス目
    padCtx.setLineDash([5, 5]);
    padCtx.moveTo(w / 2, 0); padCtx.lineTo(w / 2, h);
    padCtx.moveTo(0, h / 2); padCtx.lineTo(w, h / 2);
  }
  padCtx.stroke();
  padCtx.restore();

  padCtx.strokeStyle = "#1c2333";
  for (const st of [...padStrokes, padCur].filter(Boolean)) {
    for (let i = 1; i < st.pts.length; i++) {
      const a = st.pts[i - 1], b = st.pts[i];
      padCtx.lineWidth = 2 + (st.pen ? b.p * 7 : 2.6);
      padCtx.beginPath(); padCtx.moveTo(a.x, a.y); padCtx.lineTo(b.x, b.y); padCtx.stroke();
    }
  }
}

function padUndo(canvas) { padStrokes.pop(); padRedraw(canvas); renderPadBtns(); }
function padClear(canvas) { padStrokes = []; padRedraw(canvas); renderPadBtns(); }
function padEmpty() { return padStrokes.length === 0; }

/** 書いたものを画像にする(AIに見てもらうとき用)。白地に描き直す */
function padImage(canvas) {
  const out = document.createElement("canvas");
  out.width = canvas.width; out.height = canvas.height;
  const c = out.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, out.width, out.height);
  c.drawImage(canvas, 0, 0);
  return out.toDataURL("image/jpeg", 0.9);
}
