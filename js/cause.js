/* ═══════════════════════════════════════════════════════════════════
   cause.js — 誤答原因の分類と、条件パターンの発見

   ★何が足りなかったか
   これまで分かったのは「どの概念が弱いか」まででした。
   でも 3(x+2)=12 を間違えたとき、原因は少なくとも3通りあります。

     ・一次方程式そのものが分かっていない   → 前提までさかのぼる
     ・分配法則を間違えた                   → 手順を1つ直す
     ・両辺を3で割るところで計算を落とした   → 教え直さない。途中式を増やす

   同じ「×」でも、**次に出すべき問題がまったく違います。**
   ここを分けないと、計算ミスに対して概念の授業をしてしまいます。

   ★もうひとつ。「いつ・どうやったか」も一緒に残します。
   何時だったか、始めてから何分たっていたか、図を書いたか。
   これがたまると「夜は計算ミスが増える」「文章題は図を書くと通る」が
   **推測ではなく実測で**言えるようになります。

   ★ただし、少ないデータでパターンを名乗らせません。
   ここが荒れやすい機能なので、下限件数と差の大きさで二重に止めます。
   ═══════════════════════════════════════════════════════════════════ */

/* ── 誤答の原因 ───────────────────────────────────────────
   分類そのものは研究で確立したものではありません。
   誤答分析の実務でよく使う区分を、このアプリの「手当て」に
   対応づけて決めたものです。★1原因につき1手当てを必ず対にすること。 */

const ERROR_CAUSES = {
  knowledge: {
    label: "知識不足", icon: "📘", deep: true,
    what: "そもそも習っていない・覚えていない",
    move: "教えるところから。前提が壊れていないかも確認します",
  },
  recall: {
    label: "思い出せない", icon: "🗝", deep: false,
    what: "知ってはいるが、必要なときに出てこない",
    move: "覚え直しではなく、思い出す回数を増やします(復習間隔の調整)",
  },
  procedure: {
    label: "手順のまちがい", icon: "🔀", deep: true,
    what: "やり方の順序や適用を取りちがえた(分配法則、移項など)",
    move: "その手順だけを取り出して、正しい形と並べて見せます",
  },
  calc: {
    label: "計算ミス", icon: "🔢", deep: false,
    what: "方針は合っているのに、途中の計算や符号で落とした",
    move: "**教え直さない。** 途中式を書く量を増やし、検算の型を1つ決めます",
  },
  reading: {
    label: "読みちがい", icon: "📖", deep: false,
    what: "問題文が何を聞いているかを取りちがえた",
    move: "解かせる前に「何を聞かれてる?」を言わせます。図や表に直させます",
  },
  overlook: {
    label: "条件の見落とし", icon: "🔍", deep: false,
    what: "条件・単位・範囲・ただし書きを落とした",
    move: "解き始める前に、条件に線を引かせます。答えの単位を必ず書かせます",
  },
  concept: {
    label: "概念の誤解", icon: "💡", deep: true,
    what: "意味を取りちがえたまま手順だけ動かしている。いちばん重い",
    move: "具体例から入り直します。**Lukeに説明させて**、どこがずれているか出します",
  },
  assumption: {
    label: "思い込み", icon: "🧭", deep: true,
    what: "別の規則をあてはめた。自信があるまま間違えやすい",
    move: "似た規則を並べて、使い分けの境目を本人に言わせます",
  },
  careless: {
    label: "ケアレスミス", icon: "⏱", deep: false,
    what: "写し間違い、書き忘れ、最後のひと手間を省いた",
    move: "問題数を減らして、1問ずつ最後まで書かせます。速さは後です",
  },
  time: {
    label: "時間切れ", icon: "⌛", deep: false,
    what: "最後までたどりつけなかった",
    move: "解けるかどうかとは別の問題です。手数を減らす型を先に教えます",
  },
  prereq: {
    label: "前提の欠け", icon: "🧱", deep: true,
    what: "今の単元ではなく、土台の単元が壊れている",
    move: "今の単元を教え直さず、さかのぼって直します",
  },
  phonics: {
    label: "英語:音と文字", icon: "🔤", deep: false,
    what: "聞けば分かるのに綴れない、または綴れるのに音と結びつかない",
    move: "音から入り直します。聞き分け → 声に出す → 綴る の順を守ります",
  },
};

/** 画面用。move の中の ** はAIへの指示で使う強調なので、表示では外す */
function plainMove(id) { return String(ERROR_CAUSES[id]?.move || "").replace(/\*\*/g, ""); }

/** 「深い原因」= 概念そのものに手を入れる必要があるもの */
function isDeepCause(id) { return !!ERROR_CAUSES[id]?.deep; }

/* ── 解くときに使った手 ────────────────────────────────── */

const TACTICS = {
  diagram:  { label: "図・表にした",       icon: "📐" },
  steps:    { label: "途中式を書いた",     icon: "✏️" },
  restate:  { label: "問題文を言い直した", icon: "🗣" },
  aloud:    { label: "声に出した",         icon: "🔊" },
  estimate: { label: "見当をつけた",       icon: "🎯" },
  none:     { label: "そのまま解いた",     icon: "—"  },
};

/* ── 1問ごとの記録 ────────────────────────────────────── */

/** 生ログの保持件数。集計は別に持つので、あふれても傾向は消えない */
const ANSLOG_MAX = 1200;

/**
 * 1問ぶんを残す。キーは短く(6年ぶんを端末に置くため)。
 * t=時刻 c=概念 s=教科 ok=正誤 cf=確信度 ca=原因 tl=転移レベル
 * tc=使った手 hr=時刻(時) mi=学習開始からの分
 */
function logAnswer(S, o) {
  S.ansLog ||= [];
  S.ansAgg ||= { n: 0, ok: 0, causes: {}, tactics: {}, hours: {}, first: null };

  const now = o.t || Date.now();
  const rec = {
    t: now,
    c: String(o.conceptId || "").slice(0, 40),
    s: String(o.subject || "").slice(0, 12),
    ok: o.correct ? 1 : 0,
    cf: [1, 2, 3].includes(o.confidence) ? o.confidence : 0,
    ca: ERROR_CAUSES[o.cause] ? o.cause : "",
    tl: Number.isFinite(o.level) ? Math.max(1, Math.min(5, o.level)) : 1,
    tc: TACTICS[o.tactic] ? o.tactic : "",
    hr: new Date(now).getHours(),
    mi: Number.isFinite(o.minsIn) ? Math.max(0, Math.min(600, Math.round(o.minsIn))) : null,
  };
  S.ansLog.push(rec);

  const a = S.ansAgg;
  a.n++; a.ok += rec.ok; a.first ||= now;
  if (rec.ca) a.causes[rec.ca] = (a.causes[rec.ca] || 0) + 1;
  if (rec.tc) {
    (a.tactics[rec.tc] ||= { n: 0, ok: 0 });
    a.tactics[rec.tc].n++; a.tactics[rec.tc].ok += rec.ok;
  }
  (a.hours[rec.hr] ||= { n: 0, ok: 0 });
  a.hours[rec.hr].n++; a.hours[rec.hr].ok += rec.ok;

  if (S.ansLog.length > ANSLOG_MAX) S.ansLog.splice(0, S.ansLog.length - ANSLOG_MAX);
  return rec;
}

/* ── 原因の集計 ───────────────────────────────────────── */

function causeStats(S, days = 0) {
  const rows = days > 0
    ? (S.ansLog || []).filter((r) => r.t >= Date.now() - days * 864e5)
    : (S.ansLog || []);
  const wrong = rows.filter((r) => !r.ok);
  const by = {};
  for (const r of wrong) if (r.ca) by[r.ca] = (by[r.ca] || 0) + 1;
  const typed = Object.values(by).reduce((a, b) => a + b, 0);
  return {
    answered: rows.length,
    wrong: wrong.length,
    typed,
    ranked: Object.entries(by)
      .map(([id, n]) => ({ id, n, share: typed ? n / typed : 0, ...ERROR_CAUSES[id] }))
      .filter((x) => x.label)
      .sort((a, b) => b.n - a.n),
    /** 概念の作り直しが要る割合。ここが低いなら、教え方より解き方の問題 */
    deepShare: typed ? wrong.filter((r) => isDeepCause(r.ca)).length / typed : 0,
  };
}

/* ── 条件パターンの発見 ────────────────────────────────
   ★ここは荒れやすい。少ないデータで「夜は弱い」と言い出すのが
     いちばんまずいので、次の3つで止める。
       1) 全体で MIN_TOTAL 問以上
       2) 比べる両側がそれぞれ MIN_BUCKET 問以上
       3) 差が MIN_GAP ポイント以上
     仮説は下の固定リストだけ。思いつく限り切って探すと、
     偶然の差がいくらでも見つかってしまう。 */

const PAT_MIN_TOTAL = 40;
const PAT_MIN_BUCKET = 12;
const PAT_MIN_GAP = 0.15;

function rate(rows) { return rows.length ? rows.filter((r) => r.ok).length / rows.length : 0; }

function comparePattern(label, a, b, aName, bName, advice) {
  if (a.length < PAT_MIN_BUCKET || b.length < PAT_MIN_BUCKET) return null;
  const ra = rate(a), rb = rate(b), gap = ra - rb;
  if (Math.abs(gap) < PAT_MIN_GAP) return null;
  const better = gap > 0 ? aName : bName;
  const worse = gap > 0 ? bName : aName;
  return {
    label, better, worse,
    gap: Math.abs(gap),
    text: `${label}:${better}のほうが正答率が ${Math.round(Math.abs(gap) * 100)} ポイント高い`
      + `(${better} ${Math.round((gap > 0 ? ra : rb) * 100)}% / ${worse} ${Math.round((gap > 0 ? rb : ra) * 100)}%`
      + `・${a.length + b.length}問)`,
    // ★助言は「悪かったほう」に対して出す。良かった側を渡すと逆の助言になる
    advice: typeof advice === "function" ? advice(worse) : advice,
  };
}

function findPatterns(S) {
  const rows = S.ansLog || [];
  if (rows.length < PAT_MIN_TOTAL) {
    return { enough: false, need: PAT_MIN_TOTAL - rows.length, list: [] };
  }
  const out = [];

  /* 1. 時間帯 — 夜おそくなると崩れるか */
  out.push(comparePattern("時間帯",
    rows.filter((r) => r.hr < 20), rows.filter((r) => r.hr >= 20),
    "20時より前", "20時以降",
    (w) => w === "20時以降"
      ? "むずかしい単元は早い時間に。夜は復習だけにすると崩れにくくなります。"
      : "夜のほうが集中できているようです。無理に前倒ししなくて大丈夫です。"));

  /* 2. 続けた時間 — 何分あたりで精度が落ちるか */
  const timed = rows.filter((r) => r.mi != null);
  out.push(comparePattern("続けた時間",
    timed.filter((r) => r.mi < 15), timed.filter((r) => r.mi >= 15),
    "15分まで", "15分を超えてから",
    (w) => w === "15分を超えてから"
      ? "15分くらいで一度区切ると精度が保てます。長さより回数を増やしてください。"
      : "後半のほうが伸びる型です。始めの数問は助走と考えて大丈夫です。"));

  /* 3. 使った手 — 図を書くと本当に通るのか */
  for (const [id, t] of Object.entries(TACTICS)) {
    if (id === "none") continue;
    const used = rows.filter((r) => r.tc === id);
    const not = rows.filter((r) => r.tc && r.tc !== id);
    const p = comparePattern("解き方", used, not, t.label + "とき", "そうでないとき",
      `${t.label}やり方が効いています。文章題では先にこれをやらせてください。`);
    if (p && p.better.startsWith(t.label)) out.push(p);
  }

  /* 4. 自信ありで間違えたとき、いちばん多い原因は何か */
  const hiWrong = rows.filter((r) => r.cf === 3 && !r.ok && r.ca);
  if (hiWrong.length >= PAT_MIN_BUCKET) {
    const by = {};
    for (const r of hiWrong) by[r.ca] = (by[r.ca] || 0) + 1;
    const [id, n] = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    if (n / hiWrong.length >= 0.4) {
      out.push({
        label: "自信ありで間違えるとき",
        text: `自信ありで間違えた ${hiWrong.length} 問のうち ${n} 問が「${ERROR_CAUSES[id].label}」です`,
        advice: plainMove(id),
        gap: n / hiWrong.length,
      });
    }
  }

  /* 5. 教科ごとに多い原因 */
  const bySubj = {};
  for (const r of rows) if (!r.ok && r.ca && r.s) ((bySubj[r.s] ||= {})[r.ca] ??= 0, bySubj[r.s][r.ca]++);
  for (const [s, by] of Object.entries(bySubj)) {
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    if (total < PAT_MIN_BUCKET) continue;
    const [id, n] = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    if (n / total >= 0.45) {
      out.push({
        label: `${s}のつまずき`,
        text: `${s}で間違えた ${total} 問のうち ${n} 問が「${ERROR_CAUSES[id].label}」です`,
        advice: plainMove(id),
        gap: n / total,
      });
    }
  }

  return {
    enough: true,
    total: rows.length,
    list: out.filter(Boolean).sort((a, b) => b.gap - a.gap).slice(0, 6),
  };
}

/* ── AIに返す ─────────────────────────────────────────── */

/**
 * 見つかったパターンを、次回のプロンプトに戻す。
 * ★これがあるから「今日は文章題だから、先に図を書こう」と
 *   AIのほうから言えるようになる。数字を本人に見せる必要はない。
 */
function causePromptBlock(S) {
  const pat = findPatterns(S);
  const cs = causeStats(S, 90);
  if (!pat.enough && cs.wrong < 10) return "";

  let s = "\n# 沙和さんの学び方(実際の記録から)\n";

  if (pat.enough && pat.list.length) {
    s += "\n【実測でわかっていること】※本人に数字を見せる必要はありません。指導の仕方を変えるために使ってください\n";
    s += pat.list.map((p) => `- ${p.text}\n  → ${p.advice}`).join("\n") + "\n";
  }

  if (cs.typed >= 8) {
    s += `\n【間違いの原因の内訳(直近90日・${cs.wrong}問)】\n`;
    s += cs.ranked.slice(0, 3).map((r) =>
      `- ${r.icon} ${r.label} ${r.n}回(${Math.round(r.share * 100)}%):${r.move}`).join("\n") + "\n";
    s += cs.deepShare < 0.35
      ? "※ 概念の理解より**解き方の詰め**の問題が多い状態です。教え直しを増やさないでください。\n"
      : "※ 概念そのものに手を入れる必要のある誤りが多い状態です。前提までさかのぼってください。\n";
  }
  return s;
}
