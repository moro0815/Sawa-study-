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

/** 練習項目の入れもの */
function writeState(S) {
  const w = (S.write ||= {});
  w.items ||= {};        // id -> {id, kind, a(答え), r(読み), ex(例文), w(注意), mem}
  w.log ||= [];          // 直近の結果(集計用。生データは rawlog 側)
  if (!w.seeded) {
    for (const k of KANJI_SEED) addWriteItem(S, { kind: "kanji", answer: k.a, reading: k.r, example: k.ex, note: k.w });
    w.seeded = true;
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

let padCtx = null, padStrokes = [], padCur = null, padOpen = false;

function padInit(canvas) {
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
  // 漢字練習帳のマス目
  padCtx.save();
  padCtx.strokeStyle = "#dfe3ea"; padCtx.lineWidth = 1;
  padCtx.strokeRect(.5, .5, w - 1, h - 1);
  padCtx.setLineDash([5, 5]); padCtx.strokeStyle = "#e9ecf2";
  padCtx.beginPath();
  padCtx.moveTo(w / 2, 0); padCtx.lineTo(w / 2, h);
  padCtx.moveTo(0, h / 2); padCtx.lineTo(w, h / 2);
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
