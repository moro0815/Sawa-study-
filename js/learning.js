/* =========================================================================
   learning.js — 「勉強が好きになる」「勉強のやり方がわかる」ための仕組み

   ここは、教科の中身ではなく【学び方そのもの】を扱う。
   考え方は3本柱。

   ① 好きになるには段階がある(Hidi & Renninger 2006 の興味発達4段階)
      いきなり「好き」にはならない。外からのきっかけ → 意味を感じる →
      自分から戻ってくる → 困難があっても続く、と順に育つ。
      段階を飛ばして「自分でやりなさい」と言うと、そこで止まる。
      そこで、教科ごとに今どの段階かを推定し、AIの関わり方を変える。

   ② やり方がわかるには、自分のデータで確かめるのが一番早い
      Dunlosky (2013):生徒の多くは「読み返し」「線を引く」を使うが、
      これらは効果が低い。それでも使われるのは【やった感じがする】から。
      だから「この方法がいい」と言うだけでは変わらない。
      沙和さん自身の記録から、方法ごとの差を数字で見せる。

   ③ 好奇心は「知らないことに気づいたとき」に生まれる
      Loewenstein (1994) の情報ギャップ理論。知識ゼロでも満腹でも
      好奇心は起きず、「あと少しでわかりそう」なときに最大になる。
      Kang et al. (2009):好奇心が高い状態で得た答えは、記憶に残りやすい。
      だから教える前に、まず問いで穴を開ける。

   飽きない工夫は「ごほうび」ではなく【型を変えること】で作る。
   ごほうびは、なくなった瞬間にやる気を下げる(過正当化効果)。
   ========================================================================= */

/* ── ① 興味の発達段階 ───────────────────────────────────── */

const INTEREST_PHASES = [
  {
    n: 1, id: "trigger", name: "きっかけ期", emoji: "✨",
    what: "外からの刺激で、一瞬おもしろいと思う段階。まだ自分からは向かわない。",
    doThis: "驚き・意外性・実物・具体例で入る。短く区切る。できたことをその場で返す。",
    dont: "「自分で計画を立てて」と任せる。長い説明。",
  },
  {
    n: 2, id: "maintain", name: "つながり期", emoji: "🔗",
    what: "自分に関係あると感じ始める段階。まだ支えが要る。",
    doThis: "自分の生活・将来の夢とつなぐ。「なぜこれを学ぶのか」を毎回ひとこと添える。",
    dont: "意味を説明せずに反復させる。",
  },
  {
    n: 3, id: "emerging", name: "自分から期", emoji: "🌱",
    what: "言われなくても戻ってくる段階。自分から疑問が出る。",
    doThis: "問いを本人に出させる。選ばせる。少し難しいものを混ぜる。",
    dont: "手取り足取り教える。先回りして答える。",
  },
  {
    n: 4, id: "individual", name: "自分のもの期", emoji: "🔥",
    what: "つまずいても続く段階。難しさ自体が面白くなっている。",
    doThis: "深い問い、応用、人に説明させる。伴走に徹する。",
    dont: "簡単な確認を繰り返す。ほめすぎる。",
  },
];

/**
 * 教科ごとの興味の段階を推定する。
 * 「点数」ではなく「関わり方を変えるための目印」として使う。
 *   自分から始めたか / 自分から質問したか / つまずいた後に戻ってきたか
 *   / 続いている日数 — の4つで見る。
 */
function interestPhase(S, subjectId) {
  const sig = interestSignals(S, subjectId);
  let n = 1;
  if (sig.sessions >= 3) n = 2;
  if (sig.selfStarted >= 3 && sig.questions >= 2) n = 3;
  if (n >= 3 && sig.returnedAfterFail >= 2 && sig.days >= 14) n = 4;
  return { ...INTEREST_PHASES[n - 1], signals: sig };
}

function interestSignals(S, subjectId) {
  const ids = new Set(CONCEPTS.filter((c) => c.s === subjectId).map((c) => c.id));
  let sessions = 0, returnedAfterFail = 0;
  for (const [id, st] of Object.entries(S.mem || {})) {
    if (!ids.has(id)) continue;
    const h = st.history || [];
    if (h.length) sessions++;
    for (let i = 1; i < h.length; i++) if (!h[i - 1].correct && h[i].correct) returnedAfterFail++;
  }
  const log = (S.engage || {})[subjectId] || { selfStarted: 0, questions: 0 };
  const days = S.startedAt ? Math.floor((Date.now() - S.startedAt) / 864e5) : 0;
  return { sessions, returnedAfterFail, selfStarted: log.selfStarted, questions: log.questions, days };
}

/** 本人の行動を記録する。AIが呼ぶ */
function noteEngagement(S, subjectId, kind) {
  const e = (S.engage ||= {});
  const x = (e[subjectId] ||= { selfStarted: 0, questions: 0 });
  if (kind === "self_started") x.selfStarted++;
  if (kind === "asked_why") x.questions++;
  return x;
}

/* ── ② 学び方カード:自分のデータで確かめる ───────────────── */

const STUDY_METHODS = [
  {
    id: "retrieval",
    name: "思い出してから見る",
    bad: "ノートを読み返す",
    good: "何も見ずに思い出してから、答え合わせをする",
    why: "読み返すと「知っている感じ」がするだけで、記憶は強くなりません。思い出そうとする苦労そのものが記憶を作ります。",
    source: "Roediger & Karpicke (2006) ほか多数",
    strength: "非常に強い",
    /** 自分のデータでの裏づけ */
    evidence(S) {
      const all = Object.values(S.mem || {});
      const many = all.filter((m) => (m.history || []).length >= 3);
      const few = all.filter((m) => (m.history || []).length === 1);
      if (many.length < 3 || few.length < 3) return null;
      const a = avg(many.map((m) => m.mastery)), b = avg(few.map((m) => m.mastery));
      return { text: `思い出す練習を3回以上した単元の定着は ${pct(a)}、1回だけの単元は ${pct(b)}。`,
               gap: Math.round((a - b) * 100) };
    },
  },
  {
    id: "spacing",
    name: "日をあけてもう一度",
    bad: "一度に何時間もやる",
    good: "少しずつ、日をあけて何回もやる",
    why: "忘れかけたころにもう一度やると、記憶が一番強くなります。同じ合計時間でも、分けたほうが後で残ります。",
    source: "Cepeda et al. (2006) の統合分析",
    strength: "非常に強い",
    evidence(S) {
      const spread = Object.values(S.mem || {}).filter((m) => (m.history || []).length >= 2)
        .map((m) => ({ span: (m.history.at(-1).t - m.history[0].t) / 864e5, mastery: m.mastery }));
      const wide = spread.filter((x) => x.span >= 3), narrow = spread.filter((x) => x.span < 1);
      if (wide.length < 3 || narrow.length < 3) return null;
      return { text: `3日以上かけて復習した単元は ${pct(avg(wide.map((x) => x.mastery)))}、同じ日に固めた単元は ${pct(avg(narrow.map((x) => x.mastery)))}。`,
               gap: Math.round((avg(wide.map((x) => x.mastery)) - avg(narrow.map((x) => x.mastery))) * 100) };
    },
  },
  {
    id: "confidence",
    name: "答える前に自信を言う",
    bad: "とりあえず答える",
    good: "「◎自信ある / ○たぶん / △わからない」を先に言ってから答える",
    why: "自信があるのに間違えた場所は、最も強く直ります。でも自信を言わないと、その場所が見つかりません。",
    source: "Metcalfe & Finn (2011) ハイパーコレクション効果",
    strength: "強い",
    evidence(S) {
      const q = countQuadrants(S);
      if (q.total < 6) return null;
      return { text: `自信ありで間違えたのは ${q.hiWrong}件。ここが一番伸びる場所です。自信なしで正解が ${q.loRight}件 — 実力より自信が低いだけかもしれません。`,
               gap: null };
    },
  },
  {
    id: "interleave",
    name: "わざと混ぜる",
    bad: "同じ種類の問題を続けて解く",
    good: "ちがう単元をまぜこぜにして解く",
    why: "混ぜるとその日はできなくなります。でも本番で思い出せる力は約2倍になります。「できない感じ」は設計どおりです。",
    source: "Rohrer et al. (2020) d=1.21",
    strength: "強い",
    evidence(S) {
      const days = (S.sessions || []).filter((s) => s.answered >= 4);
      if (days.length < 3) return null;
      const acc = avg(days.map((s) => s.correct / s.answered));
      return { text: `練習中の正答率は ${pct(acc)}。研究では混ぜると 89%→60% に下がります。下がっているのは正常です。`,
               gap: null };
    },
  },
  {
    id: "explain",
    name: "人に説明してみる",
    bad: "わかったつもりで次に進む",
    good: "Lukeに説明してみる",
    why: "説明しようとすると、わかっていない場所が自分で見つかります。教える相手がいると準備の質も上がります(プロテジェ効果)。",
    source: "Chase et al. (2009) / Fiorella & Mayer (2013)",
    strength: "中〜強い",
    evidence: () => null,
  },
  {
    id: "why",
    name: "「なぜ?」を1つ足す",
    bad: "やり方だけ覚える",
    good: "「なぜそうなるの?」を自分に1回聞く",
    why: "理由を考えると、バラバラの知識がつながって忘れにくくなります。丸暗記よりずっと少ない回数で定着します。",
    source: "精緻化質問(elaborative interrogation)",
    strength: "中程度",
    evidence: () => null,
  },
];

function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function pct(x) { return Math.round(x * 100) + "%"; }

function countQuadrants(S) {
  let hiWrong = 0, loRight = 0, total = 0;
  for (const m of Object.values(S.mem || {})) {
    for (const h of m.history || []) {
      total++;
      const hi = h.confidence >= 3;
      if (hi && !h.correct) hiWrong++;
      if (!hi && h.correct) loRight++;
    }
  }
  return { hiWrong, loRight, total };
}

/* ── 勉強法クイズ:先に予想させてから答えを見せる ───────────
   自分の思い込みとのズレを体験させると、方法が定着しやすい。 */

const METHOD_QUIZ = [
  {
    q: "テスト前日。同じ1時間なら、どっちが後まで残る?",
    a: ["教科書を1時間読み返す", "何も見ずに思い出す練習を1時間"],
    right: 1,
    why: "思い出す練習のほうが、あとのテストで大きく上回ります。読み返しは「知っている感じ」がするだけで、記憶はあまり強くなりません。",
  },
  {
    q: "計算問題20問。どっちが本番で解けるようになる?",
    a: ["同じ種類を20問続けて", "ちがう種類をまぜこぜに20問"],
    right: 1,
    why: "混ぜたほうが本番の成績はおよそ2倍。ただし練習中の正答率は下がるので「できてない」と感じます。それは設計どおりです。",
  },
  {
    q: "自信満々で間違えた問題。どう扱うのが正解?",
    a: ["恥ずかしいので早く忘れる", "一番おいしい場所として、すぐやり直す"],
    right: 1,
    why: "自信があるのに間違えた場所は、最も強く直ります。ただし1週間ほどで戻るので、直した直後にもう1問やるのが大事です。",
  },
  {
    q: "覚えたいことがある。いつ復習する?",
    a: ["忘れないうちに、すぐ何回も", "少し忘れかけたころに"],
    right: 1,
    why: "忘れかけたころが一番効きます。すぐ繰り返すのは楽ですが、記憶はあまり強くなりません。",
  },
  {
    q: "「頭がいいね」と「その粘り方がいいね」。どっちが伸びる?",
    a: ["頭がいいね", "その粘り方がいいね"],
    right: 1,
    why: "能力をほめられると、失敗しそうな難しい問題を避けるようになります。取り組み方をほめられた子は難しい問題に向かいます。",
  },
];

/* ── ③ 飽きないための「活動の型」 ───────────────────────── */

const ACTIVITIES = [
  { id: "quiz",     name: "ふつうに解く",       emoji: "✏️", what: "問題を出して答える。確信度を先に聞く。" },
  { id: "predict",  name: "予想してから確かめる", emoji: "🔮", what: "答えを出す前に「たぶんこうなる」を言わせ、その後で確かめる。ズレたところが強く残る。" },
  { id: "spoterr",  name: "まちがい探し",       emoji: "🔍", what: "わざと間違えた解答を見せ、どこが違うか探させる。採点する側に回ると視点が変わる。" },
  { id: "teach",    name: "説明してもらう",     emoji: "🗣", what: "Lukeに教える側になってもらう。説明できない場所が本当の弱点。" },
  { id: "why",      name: "なぜ?を掘る",       emoji: "❓", what: "答えではなく理由を3回追いかける。丸暗記を崩す。" },
  { id: "real",     name: "生活の中で探す",     emoji: "🌏", what: "身のまわりや動物病院の場面と結びつける。意味が見えると続く。" },
  { id: "speed",    name: "10問スプリント",     emoji: "⚡️", what: "できる問題だけを短時間で。手が動く感覚を取り戻したい日に。" },
  { id: "connect",  name: "つなげてみる",       emoji: "🧩", what: "今日の単元と前に学んだ単元の関係を自分で言わせる。" },
];

const ACT_MAP = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a]));

/** 直近で使った型。同じ型が続かないようにするために使う */
function recentActivities(S, n = 4) {
  return (S.actLog || []).slice(-n);
}
function noteActivity(S, id) {
  if (!ACT_MAP[id]) return false;
  (S.actLog ||= []).push({ id, at: Date.now() });
  if (S.actLog.length > 40) S.actLog.shift();
  return true;
}
function suggestActivities(S) {
  const recent = new Set(recentActivities(S, 3).map((x) => x.id));
  return ACTIVITIES.filter((a) => !recent.has(a.id));
}

/* ── 今週できるようになったこと(進歩を見せる) ─────────────
   進んでいる実感は、やる気のいちばん強い燃料。
   「◯%」ではなく「何ができるようになったか」を言葉で返す。 */

function recentWins(S, days = 7) {
  const since = Date.now() - days * 864e5;
  const wins = [];
  for (const [id, m] of Object.entries(S.mem || {})) {
    const c = CONCEPT_MAP[id];
    if (!c || !m.history?.length) continue;
    const inRange = m.history.filter((h) => h.t >= since);
    if (!inRange.length) continue;
    const before = m.history.filter((h) => h.t < since);
    const fixed = before.some((h) => !h.correct) && inRange.every((h) => h.correct);
    if (fixed) wins.push({ id, name: c.n, subject: SUBJECTS[c.s]?.name || c.s, kind: "直した" });
    else if (!before.length && m.mastery >= 0.7) wins.push({ id, name: c.n, subject: SUBJECTS[c.s]?.name || c.s, kind: "新しく覚えた" });
  }
  return wins;
}

/* ── AIに渡す指示 ───────────────────────────────────────── */

function learningPromptBlock(S) {
  const subj = ["math", "science", "english", "japanese", "social"];
  const phases = subj.map((id) => {
    const p = interestPhase(S, id);
    return `  ・${SUBJECTS[id]?.name || id}:${p.name}(${p.n}/4) → ${p.doThis}`;
  }).join("\n");
  const recent = recentActivities(S, 3).map((x) => ACT_MAP[x.id]?.name).filter(Boolean);
  const wins = recentWins(S).slice(0, 4).map((w) => `${w.name}(${w.kind})`);

  return `
【勉強を好きになってもらうための決まり】

1. 教える前に、まず「知りたい」を作る(情報ギャップ理論)
   - いきなり説明を始めない。先に問いを1つ置く。
     例:「犬に玉ねぎがダメなのは知ってる? なんでダメだと思う?」
   - 完全に知らないことでも、もう知っていることでも好奇心は起きない。
     「あと少しでわかりそう」の位置に問いを置くこと。
   - 答えを教えたあと、必ず「思ったとおりだった? ちがった?」と確かめる。
     予想とのズレを自覚した知識は、強く残る。

2. 教科ごとに、今の興味の段階に合わせて関わり方を変える
${phases}
   - 段階は飛ばせない。1〜2の教科に「自分で計画して」と言わないこと。
   - 3〜4の教科では、先回りして教えないこと。問いを本人に出させる。

3. 毎回、同じ型で進めない(飽きの防止)
   - 直近で使った型:${recent.length ? recent.join("、") : "まだなし"}
   - 今日は別の型を選ぶこと。型を選んだら note_activity で記録する。
   - 型の一覧:${ACTIVITIES.map((a) => `${a.name}(${a.id})`).join(" / ")}
   - ごほうびで釣らない。おもしろさは「やり方の変化」と「わかる瞬間」で作る。

4. 「やり方」そのものを教える
   - 沙和さんが「どう勉強したらいい?」と迷っていたら、教科の中身ではなく
     方法を教える。そのとき必ず【理由】と【本人のデータ】をセットで話す。
   - 「読み返す」「線を引く」をしていたら、やんわり止めて、
     思い出す練習に置き換える。ただし否定はしない。理由を言う。

5. 進んでいることを、具体的な言葉で返す
   - 直近1週間でできるようになったこと:${wins.length ? wins.join("、") : "まだ記録が少ない"}
   - 「◯%上がった」ではなく「先週できなかった◯◯ができるようになった」と言う。

6. 終わり方を大事にする
   - 最後は必ず「できた」で終わる。難問で終わらせない。
   - 終わりぎわに、次に向けた小さな問いを1つ残す。
     例:「次はなんで血液型が犬と猫でちがうのか、やってみようか」`;
}
