/* ═══════════════════════════════════════════════════════════════════
   karte.js — 学習カルテ(AI家庭教師の自己評価ログ)

   ★何のためのものか
   点数は「結果」しか残しません。このアプリが本当に持てるのは、
   **沙和さんがどうつまずき、どう直ったか**という過程のほうです。
   人間の家庭教師なら頭の中にためていく情報を、6年分ためます。

   毎回の指導のおわりに、AI自身に次を書かせます。
     ・最初のつまずき      stumble
     ・診断した根本原因    root_cause / root_concept
     ・使った前提概念      prereq_used[]
     ・本人の確信度        confidence
     ・訂正できたこと      corrected
     ・次回確認すべきこと  next_check

   ★書きっぱなしにしないこと。
   ためた記録は kartePromptBlock() で次回のプロンプトに戻します。
   AIが読まない記録は日記であってカルテではありません。
   「前回の"次回確認すべきこと"がまだ残っている」ことを、次のAIが知ります。

   ★数字ではなく「型」を見ます。
   同じ60点でも、計算ミスで落としたのか、問題文を読み違えたのか、
   自信満々で間違えたのかで、打つ手はまったく違います。
   ═══════════════════════════════════════════════════════════════════ */

/** 保持する件数。週2回×6年 ≒ 620件。超えたら古い順に落とす(集計は残す) */
const KARTE_MAX = 600;

/** つまずきの型。AIにはこの中から選ばせる */
const LEARNER_TYPES = {
  calc: {
    label: "計算ミス型", icon: "🔢",
    what: "やり方はわかっているのに、途中の計算や符号で落とす",
    move: "解き方の説明より、途中式を書く量を増やすほうが効きます。検算の型を1つ決めます。",
  },
  reading: {
    label: "読み取り型", icon: "📖",
    what: "問題文が何を聞いているかを取りちがえる。式にする前で止まる",
    move: "解かせる前に「何を聞かれてる?」を言わせます。図や表に直させます。",
  },
  recall: {
    label: "引き出し型", icon: "🗝",
    what: "知ってはいるが、必要なときに出てこない",
    move: "覚え直しではなく、思い出す回数を増やします(復習間隔の調整)。",
  },
  overconf: {
    label: "高確信誤答型", icon: "🚨",
    what: "自信があるのに間違える。いちばん見つけにくく、いちばん伸びる",
    move: "訂正した直後の再出題と、12時間後の再テストを必ず入れます。",
  },
  prereq: {
    label: "前提の欠け型", icon: "🧱",
    what: "今の単元ではなく、土台の単元が壊れている",
    move: "今の単元を教え直さず、さかのぼって直します。",
  },
  procedure: {
    label: "手順の取りちがえ型", icon: "🔀",
    what: "似た手順どうしを混同する(移項と約分、be動詞と一般動詞など)",
    move: "似たものを並べて違いを言わせます。混ぜて出します。",
  },
  phonics: {
    label: "英語:音と文字型", icon: "🔤",
    what: "聞けば分かるのに綴れない、または綴りは書けるのに音と結びつかない",
    move: "音から入り直します。聞き分け→声に出す→綴る の順を守ります。",
  },
  careless: {
    label: "急ぎ・見落とし型", icon: "⏱",
    what: "読み飛ばし、単位の書き忘れ、最後のひと手間を省く",
    move: "問題数を減らして、1問ずつ最後まで書かせます。速さは後です。",
  },
  concept: {
    label: "考え方そのもの型", icon: "💡",
    what: "概念の意味が入っていない。手順だけ覚えている状態",
    move: "具体例から入り直します。「なぜそうなるか」を本人に説明させます。",
  },
};

/* ── 1件を作る ─────────────────────────────────────────── */

function newKarte(raw = {}) {
  const clean = (v, n = 240) => String(v ?? "").trim().slice(0, n);
  const ids = (a) => (Array.isArray(a) ? a : []).map((x) => clean(x, 40)).filter(Boolean).slice(0, 12);
  const t = Date.now();
  return {
    id: "k" + t.toString(36) + Math.floor(t % 997).toString(36),
    t,
    date: new Date(t).toISOString().slice(0, 10),
    subject: clean(raw.subject, 20) || "",
    conceptIds: ids(raw.concept_ids),
    stumble: clean(raw.stumble),
    rootCause: clean(raw.root_cause),
    rootConceptId: clean(raw.root_concept_id, 40),
    prereqUsed: ids(raw.prereq_used),
    confidence: [1, 2, 3].includes(raw.confidence) ? raw.confidence : null,
    errorType: LEARNER_TYPES[raw.error_type] ? raw.error_type : "",
    corrected: clean(raw.corrected),
    nextCheck: clean(raw.next_check),
    // 次回、この「確認すべきこと」が済んだかどうか
    checked: false,
    minutes: Number.isFinite(raw.minutes) ? Math.max(0, Math.min(300, raw.minutes)) : null,
  };
}

/* ── ためる ────────────────────────────────────────────── */

/** 古い記録を落としても「型の傾向」だけは消えないように、合計を別に持つ */
function karteBumpAgg(S, k) {
  S.karteAgg ||= { total: 0, types: {}, subjects: {}, first: k.date };
  S.karteAgg.total++;
  if (k.errorType) S.karteAgg.types[k.errorType] = (S.karteAgg.types[k.errorType] || 0) + 1;
  if (k.subject) S.karteAgg.subjects[k.subject] = (S.karteAgg.subjects[k.subject] || 0) + 1;
  S.karteAgg.first ||= k.date;
}

function addKarte(S, raw) {
  S.karte ||= [];
  const k = newKarte(raw);
  // 前回の「次回確認すべきこと」に触れたなら、それを済みにする
  if (raw.resolves_id) {
    const prev = S.karte.find((x) => x.id === raw.resolves_id);
    if (prev) prev.checked = true;
  }
  S.karte.push(k);
  karteBumpAgg(S, k);
  if (S.karte.length > KARTE_MAX) S.karte.splice(0, S.karte.length - KARTE_MAX);
  return k;
}

/* ── 読む ──────────────────────────────────────────────── */

/** まだ確認していない「次回確認すべきこと」(新しい順・最大5件) */
function openNextChecks(S) {
  return (S.karte || []).filter((k) => k.nextCheck && !k.checked).slice(-5).reverse();
}

/**
 * つまずきの型の傾向。
 * ★件数が少ないうちは何も言いません。
 *   3件で「あなたは計算ミス型です」と言い切るのは、占いと同じです。
 */
const KARTE_MIN_FOR_PROFILE = 8;

function learnerProfile(S, days = 0) {
  const agg = S.karteAgg || { total: 0, types: {} };
  let types = agg.types, total = agg.total;

  if (days > 0) {                       // 期間を切るときは、残っている実データから数える
    const since = Date.now() - days * 864e5;
    const rows = (S.karte || []).filter((k) => k.t >= since);
    types = {}; total = rows.length;
    for (const k of rows) if (k.errorType) types[k.errorType] = (types[k.errorType] || 0) + 1;
  }

  const typed = Object.values(types).reduce((a, b) => a + b, 0);
  const ranked = Object.entries(types)
    .map(([id, n]) => ({ id, n, share: typed ? n / typed : 0, ...LEARNER_TYPES[id] }))
    .filter((x) => x.label)
    .sort((a, b) => b.n - a.n);

  return {
    total, typed, ranked,
    enough: total >= KARTE_MIN_FOR_PROFILE,
    need: Math.max(0, KARTE_MIN_FOR_PROFILE - total),
    top: ranked[0] || null,
  };
}

/** 半年ごとの推移。型が変わっていくこと自体が成長の記録になる */
function karteTrend(S) {
  const rows = S.karte || [];
  if (!rows.length) return [];
  const bucket = {};
  for (const k of rows) {
    const y = k.date.slice(0, 4), h = Number(k.date.slice(5, 7)) <= 6 ? "前半" : "後半";
    const key = `${y}年${h}`;
    (bucket[key] ||= { key, n: 0, types: {} });
    bucket[key].n++;
    if (k.errorType) bucket[key].types[k.errorType] = (bucket[key].types[k.errorType] || 0) + 1;
  }
  return Object.values(bucket).map((b) => {
    const top = Object.entries(b.types).sort((x, y) => y[1] - x[1])[0];
    return { ...b, topId: top ? top[0] : "", topN: top ? top[1] : 0 };
  });
}

/** 教科ごとに、いちばん多い型 */
function karteBySubject(S) {
  const out = {};
  for (const k of S.karte || []) {
    if (!k.subject || !k.errorType) continue;
    (out[k.subject] ||= {});
    out[k.subject][k.errorType] = (out[k.subject][k.errorType] || 0) + 1;
  }
  return Object.entries(out).map(([subject, types]) => {
    const [id, n] = Object.entries(types).sort((a, b) => b[1] - a[1])[0];
    return { subject, id, n, total: Object.values(types).reduce((a, b) => a + b, 0), ...LEARNER_TYPES[id] };
  }).sort((a, b) => b.total - a.total);
}

/* ── AIに返す ──────────────────────────────────────────── */

/**
 * ためたカルテを、次回のプロンプトに戻す。
 * ここが無いと、ただの書きっぱなしのログになる。
 */
function kartePromptBlock(S) {
  const open = openNextChecks(S);
  const prof = learnerProfile(S);
  if (!open.length && !prof.enough) return "";

  let s = "\n# 学習カルテ(過去の指導からの引き継ぎ)\n";

  if (open.length) {
    s += "\n【前回までに「次回確認すべき」と書かれたまま、まだ確認できていないこと】\n";
    s += open.map((k) => `- (${k.date}) ${k.nextCheck}${k.subject ? ` [${k.subject}]` : ""} …id: ${k.id}`).join("\n");
    s += "\n※ このどれかを今回確認できたら、record_session_review の resolves_id にその id を入れてください。\n";
  }

  if (prof.enough && prof.top) {
    s += `\n【これまで ${prof.total} 回の指導から見えている、つまずきの型】\n`;
    s += prof.ranked.slice(0, 3).map((r) =>
      `- ${r.icon} ${r.label}(${r.n}回 / ${Math.round(r.share * 100)}%):${r.what}\n  → ${r.move}`).join("\n");
    s += "\n※ これは傾向であって決めつけではありません。今回が当てはまらなければ、そう記録してください。\n";
    s += "※ 沙和さんに「あなたは◯◯型だ」とラベルを貼らないでください。人ではなく、そのときのつまずき方の話です。\n";
  }
  return s;
}

/** 画面に出す短い要約 */
function karteSummaryText(S) {
  const prof = learnerProfile(S);
  if (!prof.total) return "まだ記録がありません。AI先生と学習すると、1回ごとに残っていきます。";
  if (!prof.enough) {
    return `${prof.total}回ぶん記録できています。傾向を出すにはあと ${prof.need} 回ほど必要です。`
      + "(少ない回数で型を決めつけないようにしています)";
  }
  const t = prof.top;
  return `${prof.total}回ぶんの記録から、いちばん多いつまずき方は ${t.icon} ${t.label}(${Math.round(t.share * 100)}%)です。`;
}
