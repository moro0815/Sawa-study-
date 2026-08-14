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

/**
 * つまずきの型は cause.js の ERROR_CAUSES と**同じもの**を使います。
 * ★ここに別の分類を持つと、1問ごとの記録(cause.js)と
 *   セッションの振り返り(ここ)で言葉が食い違い、どちらも信用できなくなります。
 * ★以前あった「高確信誤答型」は外しました。あれは原因ではなく
 *   確信度×正誤の象限であって、別の軸です(#わかったつもり)。
 */
const LEARNER_TYPES = ERROR_CAUSES;

/* ── 1件を作る ─────────────────────────────────────────── */

function newKarte(raw = {}) {
  const clean = (v, n = 240) => String(v ?? "").trim().slice(0, n);
  const ids = (a) => (Array.isArray(a) ? a : []).map((x) => clean(x, 40)).filter(Boolean).slice(0, 12);
  const t = Date.now();
  return {
    id: "k" + t.toString(36) + Math.floor(t % 997).toString(36),
    t,
    date: todayISO(new Date(t)),   // ★UTC直書きだと朝0〜9時のカルテが前日扱いになる
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
