/* ═══════════════════════════════════════════════════════════════════
   today.js — 「今日これだけやればOK」と、休んだ日からの戻り方

   ★このファイルが直したいこと
   これまでのホームは、情報は正しいのに **決めることが多すぎました。**
   教科を選び、単元を選び、問題を選ぶ。元気な日はいいですが、
   部活のあと、旅行中、やる気ゼロの日には、それだけで閉じてしまいます。

   継続で効くのは、**いちばん良い日を伸ばすことではなく、
   いちばん悪い日を救うこと**です。だからここでは、

     ・開いた瞬間に「今日やること」を1枚だけ出す(選ばせない)
     ・「5分だけ」を正式な機能にする。5分でも“ちゃんとやった日”にする
     ・休んでも赤い警告を出さない。戻ってきたら勝手に軽くする
     ・終わりを、正答率ではなく「できるようになったこと」で締める

   ★連続日数を主役にしない理由
   ストリークは強力ですが、**一度切れると「もういいや」になります。**
   このアプリは間違いを罰しない設計なので、休みも罰しません。
   数えるのは連続日数ではなく、**戻ってきた回数**のほうです。
   ═══════════════════════════════════════════════════════════════════ */

/** モード。mini = 5分だけ */
const PLAN_MODES = {
  mini:   { id: "mini",   label: "5分だけ",   minutes: 5,  reviews: 2, news: 0, win: 1 },
  normal: { id: "normal", label: "いつもの",  minutes: 15, reviews: 3, news: 1, win: 1 },
  full:   { id: "full",   label: "しっかり",  minutes: 30, reviews: 5, news: 2, win: 1 },
};

/* ── 休んだ日数と、戻ってきたこと ─────────────────────── */

/** 最後に机に向かった日から何日たったか。1度もなければ null */
function daysAway(S) {
  const days = (S.sessions || []).filter((s) => s.answered > 0).map((s) => s.date).sort();
  if (!days.length) return null;
  const last = new Date(days.at(-1) + "T00:00:00").getTime();
  const today = new Date(todayISO() + "T00:00:00").getTime();
  return Math.max(0, Math.round((today - last) / 864e5));
}

/** 2日以上あいてから戻ってきた日か */
function isComeback(S) {
  const a = daysAway(S);
  return a != null && a >= 2 && !todayAnswered(S);
}

function todayAnswered(S) {
  return ((S.sessions || []).find((s) => s.date === todayISO())?.answered || 0) > 0;
}

/**
 * 戻ってきた回数。★ここを数えます。
 * 続いた日数ではなく「何回、戻ってこられたか」。
 * 途切れることが前提の数え方なので、途切れても意味を失いません。
 */
function comebackCount(S) {
  const days = [...new Set((S.sessions || []).filter((s) => s.answered > 0).map((s) => s.date))].sort();
  let n = 0;
  for (let i = 1; i < days.length; i++) {
    const gap = (new Date(days[i]) - new Date(days[i - 1])) / 864e5;
    if (gap >= 2) n++;
  }
  return n;
}

/* ── 今日の分 ─────────────────────────────────────────── */

/** 今日はもう「ちゃんとやった」と言えるか(5分モードでも満たせる基準) */
const ENOUGH_ANSWERS = 3;
const ENOUGH_MINUTES = 5;

function dayEnough(S, date = todayISO()) {
  const s = (S.sessions || []).find((x) => x.date === date);
  if (!s) return false;
  return (s.answered || 0) >= ENOUGH_ANSWERS || (s.minutes || 0) >= ENOUGH_MINUTES;
}

/**
 * 今日やることを、こちらで決める。
 * ★選ばせません。選択肢を出すのは「5分だけ / 科目を選ぶ / 自由に質問」の3つだけ。
 * ★戻ってきた日は、頼まれなくても軽くします。
 */
function todayPlan(S, modeId) {
  const back = isComeback(S);
  // 何も指定がなければ、ふだんの時間から決める。戻ってきた日は自動で mini
  const auto = back ? "mini" : (S.dailyMinutes || 0) >= 25 ? "full" : "normal";
  const m = PLAN_MODES[modeId] || PLAN_MODES[auto];

  /* テストが近ければ範囲(と、その土台の穴)を優先する。無ければ空集合 */
  const boost = typeof testTargetIds === "function" ? testTargetIds(S) : new Set();
  const q = buildQueue(S.mem, { limit: 24, boostIds: boost.size ? boost : null });
  const reviews = q.filter((x) => x.kind === "review");
  const news = q.filter((x) => x.kind === "new");

  // 最優先(自信ありで間違えた)を先頭に
  const hot = reviews.filter((x) => isHotState(x.state));
  const rest = reviews.filter((x) => !hot.includes(x));

  /* ★「1つだけ成功体験」— 確実にできるものを必ず1つ混ぜる。
     疲れている日に、いきなり最難関だけを出さないため。 */
  const win = reviews.filter((x) => (x.state?.mastery || 0) >= 0.75).slice(-1)[0]
    || rest.slice(-1)[0] || null;

  const picked = [];
  const push = (x, why) => { if (x && !picked.some((p) => p.concept.id === x.concept.id)) picked.push({ ...x, why }); };

  hot.slice(0, back ? 1 : 2).forEach((x) => push(x, x.boosted ? "自信あり×不正解、しかもテスト範囲。最優先" : "自信あり×不正解。ここが一番のびる"));
  rest.slice(0, m.reviews).forEach((x) => push(x, x.boosted ? "テスト範囲" : "そろそろ忘れるころ"));
  if (m.news) news.slice(0, m.news).forEach((x) => push(x, x.boosted ? "テスト範囲で、まだやっていない" : "前提がそろったので、今なら学べる"));
  push(win, "確実にできるはず。1つ通しておく");

  const items = picked.slice(0, m.reviews + m.news + 1);
  return {
    mode: m.id,
    modeLabel: m.label,
    minutes: Math.max(3, Math.min(m.minutes, 3 + items.length * 2)),
    items,
    comeback: back,
    daysAway: daysAway(S),
    counts: {
      review: items.filter((x) => x.kind === "review").length,
      new: items.filter((x) => x.kind === "new").length,
      hot: items.filter((x) => x.why?.startsWith("自信あり")).length,
    },
    done: dayEnough(S),
  };
}

/* ── Luke の「昨日から続いている感」──────────────────────
   ★天気は取りません。CSPで外部通信を絞っているのと、
     位置情報を持たせたくないためです。
     代わりに、時間帯・久しぶり・昨日の続きの3つで作ります。 */

/** 昨日いちばん触った概念(「昨日の比例、もう一回だけ確認しよう」用) */
function yesterdayThread(S) {
  /* ★日付は必ず todayISO()(現地時間)。toISOString() 直書きはUTCになり、
     日本の朝0〜9時に1日ずれる(CLAUDE.md 参照。実際にここでずれていた) */
  const y = todayISO(new Date(Date.now() - 864e5));
  const rows = (S.ansLog || []).filter((r) => todayISO(new Date(r.t)) === y);
  if (!rows.length) return null;
  const by = {};
  for (const r of rows) if (r.c) (by[r.c] ||= { n: 0, ng: 0 }), by[r.c].n++, by[r.c].ng += r.ok ? 0 : 1;
  const [id, v] = Object.entries(by).sort((a, b) => b[1].n - a[1].n)[0];
  const c = CONCEPT_MAP[id];
  return c ? { concept: c, ...v } : null;
}

function timeBand() {
  const h = new Date().getHours();
  if (h < 9) return "morning";
  if (h < 15) return "day";
  if (h < 19) return "evening";
  if (h < 22) return "night";
  return "late";
}

/** ホームで Luke がひとこと言う。毎日ちょっと違う */
function lukeHomeLine(S) {
  const away = daysAway(S);
  const th = yesterdayThread(S);
  const band = timeBand();

  // ★休み明けは、まずこれ。責める言葉は1つも入れない
  if (isComeback(S)) {
    return away >= 7
      ? "おかえり!ずっと待ってたよ。今日は軽くいこ、ほんとに軽く。"
      : "おかえり!今日は軽めにしよ。ちょっとだけでいいよ。";
  }
  if (todayAnswered(S) && dayEnough(S)) {
    return ["今日のぶん、もう終わってるよ。えらい。", "今日はもうバッチリ。あとは自由時間!",
            "もう十分やったと思う。むりしないでね。"][new Date().getDate() % 3];
  }
  if (th) {
    return th.ng
      ? `昨日の「${th.concept.n}」、今日もう一回だけ確認しよ?`
      : `昨日は「${th.concept.n}」やったね。続きいこ!`;
  }
  return {
    morning: ["まだねむい…けど、いっしょにやるよ。", "おはよ。朝のほうが頭は動くらしいよ。"],
    day:     ["いつでもいいよ、待ってる。", "今日はなにからいく?"],
    evening: ["学校おつかれ!ちょっとだけやろ?", "部活のあとでしょ。5分だけにしとく?"],
    night:   ["夜だね。むずかしいのは明日にしよ。", "今日はかるく流すだけでいいと思う。"],
    late:    ["おそいよ…寝たほうがいいと思う。", "今日はもう休も?オレも眠い。"],
  }[band][new Date().getDate() % 2];
}

/* ── 終わり方 ─────────────────────────────────────────
   ★正答率で締めない。「72% / 10問中7問」は、
     できなかった3問のほうが目に残ります。
     言葉で「今日できるようになったこと」を出して、はっきり閉じます。 */

function wrapUp(S) {
  const d = todayISO();
  const sess = (S.sessions || []).find((x) => x.date === d);
  const rows = (S.ansLog || []).filter((r) => todayISO(new Date(r.t)) === d);
  const got = [];

  // 1. Lukeに説明できた概念
  for (const id in S.tr || {}) {
    const t = S.tr[id];
    if (t.exp?.passed && todayISO(new Date(t.exp.at)) === d && CONCEPT_MAP[id]) {
      got.push(`「${CONCEPT_MAP[id].n}」を Luke に説明できた`);
    }
  }
  // 2. 段が上がった概念(説明で通したものは 1. と重複するので出さない)
  const explained = new Set(got.map((g) => g.split("」")[0].slice(1)));
  for (const r of rows) {
    const t = S.tr?.[r.c];
    const nm = CONCEPT_MAP[r.c]?.n;
    if (t && nm && r.ok && t.lv > r.tl && !explained.has(nm)) {
      const line = `「${nm}」が Lv${t.lv} に上がった`;
      if (!got.includes(line)) got.push(line);
    }
  }
  // 3. 「わかったつもり」を見つけた
  const hi = rows.filter((r) => r.cf === 3 && !r.ok).length;
  if (hi) got.push(`自信あり で間違えた問題を ${hi}個 見つけた(いちばんのびる場所)`);

  // 4. 前に間違えたものが、今日は正解できた
  const before = {};
  for (const r of (S.ansLog || [])) {
    const rd = todayISO(new Date(r.t));
    if (rd < d && !r.ok) before[r.c] = true;
  }
  const fixed = [...new Set(rows.filter((r) => r.ok && before[r.c]).map((r) => r.c))]
    .map((id) => CONCEPT_MAP[id]?.n).filter(Boolean);
  if (fixed.length) got.push(`前に間違えた「${fixed.slice(0, 3).join("」「")}」が今日は解けた`);

  // 5. カルテに残った「直ったこと」
  for (const k of (S.karte || [])) {
    if (k.date === d && k.corrected) got.push(k.corrected);
  }
  // 6. 何も無ければ、机に向かったこと自体を出す
  if (!got.length) {
    if (sess?.answered) got.push(`${sess.answered}問といた。今日は それで十分`);
    else got.push("アプリを開いた。今日はそれでいい日もある");
  }

  return {
    date: d,
    answered: sess?.answered || 0,
    minutes: sess?.minutes || 0,
    enough: dayEnough(S),
    got: got.slice(0, 5),
    lukeLine: dayEnough(S)
      ? ["今日はここでおしまい!よくやった。", "もう十分。あとは好きなことしよ。",
         "おわり!また明日いっしょにやろ。"][new Date().getDate() % 3]
      : "今日はここまで。ちょっとでもやったの、えらいと思う。",
  };
}

/* ── AIに渡す ─────────────────────────────────────────── */

function todayPromptBlock(S) {
  const p = todayPlan(S);
  const th = yesterdayThread(S);
  let s = "\n# 今日の分(こちらで決めてあります)\n";

  if (p.comeback) {
    s += `\n**★${p.daysAway}日ぶりです。** 次のことを必ず守ってください。\n`;
    s += "- **休んでいたことに一切ふれないでください。** 「久しぶりだね」も不要です。ふつうに始めてください\n";
    s += "- 理由を聞かないでください。疲れ・部活・旅行・気分、どれでも本人の自由です\n";
    s += "- **今日は量を半分以下にしてください。** 2〜3問で終わりにして構いません\n";
    s += "- 最初の1問は、**確実にできるもの**から出してください\n";
  }
  if (th) {
    s += `\n【昨日の続き】昨日は「${th.concept.n}」をやりました`;
    s += th.ng ? "(間違えたところがあります)。今日その確認から入ると自然です。\n" : "。続きから入れます。\n";
  }
  s += `\n【今日そろえた分 — ${p.modeLabel}・約${p.minutes}分】\n`;
  s += p.items.map((x) => `- ${x.concept.n}(${x.concept.id}) … ${x.why}`).join("\n") + "\n";
  s += "\n- **この順に出してください。**「何をやりたい?」と聞き返さないでください。決めるのがいちばん重い作業です\n";
  s += `- ${ENOUGH_ANSWERS}問こたえるか5分たったら、それで「今日はできた」です。**続きを勧めないでください**\n`;
  s += "- 終わるときは正答率を言わず、**今日できるようになったことを言葉で**伝えてください。そしてはっきり終わらせてください\n";
  return s;
}
