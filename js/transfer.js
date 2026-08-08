/* ═══════════════════════════════════════════════════════════════════
   transfer.js — 「わかった」ではなく「転移できた」で習得を判定する

   ★これまでの問題
   同じ形の問題を3問正解しても、理解したとは限りません。
   y = 3x が解けても「120kmを2時間で走った車の速さ」で止まる子はいます。
   前者で通してしまうと、システムは「比例は習得済み」と記録します。
   **記録が嘘になる**のが、いちばん困ることです。

   ★5段階に分ける
     Lv1 同型     数だけ変えた同じ形
     Lv2 表現替え 数値・形式・言い方を変える(式↔表↔グラフ)
     Lv3 文章題   文脈の中に埋める
     Lv4 複合     別の単元と組み合わせる
     Lv5 説明     Luke に、小学生でもわかるように説明する

   ★なぜ最後が「説明」なのか
   説明は、手順の暗記では絶対に通りません。因果(なぜそうなるか)と
   具体例が要るからです。しかも このアプリには すでに
   「Lukeに教える」= プロテジェ効果 の枠があるので、
   本人からは **新しい機能に見えません。** そこが良いところです。

   ★採点はAIにさせるが、合否はコードが決める
   AIに「よくできました」と言わせて終わりにはしません。
   AIは観察した事実(因果があったか・例があったか・誤解はあったか)を
   埋めるだけで、通すかどうかは下の passExplanation() が決めます。

   ★全210概念にLv5を課しません
   それは現実的でないうえ、勉強が作業になります。
   **ほかの2つ以上の概念の土台になっている概念(59個)** と、
   自信ありで間違えた概念だけに課します。土台が抜けると後で全部崩れるからです。
   ═══════════════════════════════════════════════════════════════════ */

const TRANSFER_LEVELS = [
  { lv: 1, key: "same",    label: "同じ形",   icon: "1️⃣",
    what: "数だけ変えた、同じ形の問題",
    ask: "さっきと同じ形で、数だけ変えた問題を1問出してください。" },
  { lv: 2, key: "reword",  label: "言い方を変える", icon: "2️⃣",
    what: "数値・形式・言い方を変える(式 ↔ 表 ↔ グラフ、順序を逆に)",
    ask: "同じ内容を、別の形(表・グラフ・逆向きの問い)で聞いてください。手順をなぞるだけでは解けない形にします。" },
  { lv: 3, key: "word",    label: "文章題",   icon: "3️⃣",
    what: "現実の文脈の中に埋める",
    ask: "文章題にしてください。式は書いてありません。何を求めるかを自分で決めさせます。可能なら動物・獣医の文脈で。" },
  { lv: 4, key: "mixed",   label: "組み合わせ", icon: "4️⃣",
    what: "別の単元と組み合わせる",
    ask: "この概念と、別の単元を組み合わせた問題にしてください。どの道具を使うかの判断から始まる形にします。" },
  { lv: 5, key: "explain", label: "Lukeに説明", icon: "🐾",
    what: "小学生(Luke)にわかるように、自分の言葉で説明する",
    ask: "Luke に説明してもらってください。『小学生にもわかるように』と伝えます。説明のあと grade_explanation を必ず呼びます。" },
];

const TL_MAP = Object.fromEntries(TRANSFER_LEVELS.map((t) => [t.lv, t]));

/** 各段を通すのに必要な正解数 */
const CLEAR_NEEDED = 2;

/* ── どの概念に深いところまで求めるか ───────────────────── */

let _loadBearing = null;

/** ほかの2つ以上の概念の前提になっている概念(= 抜けると後で崩れる) */
function loadBearingIds() {
  if (_loadBearing) return _loadBearing;
  const out = {};
  for (const c of CONCEPTS) for (const p of c.pre || []) out[p] = (out[p] || 0) + 1;
  _loadBearing = new Set(Object.entries(out).filter(([, n]) => n >= 2).map(([id]) => id));
  return _loadBearing;
}

/**
 * この概念は Lv5(説明)まで要るか。
 * ・土台になっている概念 → 要る
 * ・自信ありで間違えた概念 → 要る(思い込みは説明させないと出てこない)
 * ・それ以外 → Lv4 で「できた」にする
 */
function needsExplain(conceptId, memState) {
  if (loadBearingIds().has(conceptId)) return true;
  const h = memState?.history || [];
  return memState?.flagged === true || h.some((x) => x.q === "hi-wrong");
}

function topLevelFor(conceptId, memState) {
  return needsExplain(conceptId, memState) ? 5 : 4;
}

/* ── 状態 ─────────────────────────────────────────────── */

function newTransferState(conceptId) {
  return { id: conceptId, lv: 1, hits: {}, exp: null, masteredAt: null };
}

function transferState(S, conceptId) {
  S.tr ||= {};
  return (S.tr[conceptId] ||= newTransferState(conceptId));
}

/**
 * 1問ぶんの結果を段位に反映する。
 * ★間違えても段位は下げません。その段の積み上げを0に戻すだけです。
 *   下げると「せっかく上がったのに戻された」になり、
 *   難しい段に挑む理由がなくなります(このアプリは間違いを罰しません)。
 */
function noteTransfer(S, conceptId, level, correct) {
  const t = transferState(S, conceptId);
  const lv = Math.max(1, Math.min(5, Number(level) || 1));
  if (!correct) { t.hits[lv] = 0; return { ...t, advanced: false }; }

  t.hits[lv] = (t.hits[lv] || 0) + 1;
  let advanced = false;
  // 今いる段(以下)を通したら、次の段へ
  if (lv >= t.lv && t.hits[lv] >= CLEAR_NEEDED && t.lv < 5) { t.lv = lv + 1; advanced = true; }
  return { ...t, advanced };
}

/** いま何を出すべきか */
function nextChallenge(S, conceptId) {
  const t = transferState(S, conceptId);
  const st = S.mem?.[conceptId];
  const top = topLevelFor(conceptId, st);
  const lv = Math.min(t.lv, 5);
  const done = masteredLevel(S, conceptId) >= top;
  return {
    conceptId,
    level: lv,
    top,
    done,
    need: Math.max(0, CLEAR_NEEDED - (t.hits[lv] || 0)),
    ...TL_MAP[lv],
    explainRequired: top === 5,
    reason: loadBearingIds().has(conceptId)
      ? "ほかの単元の土台になっている概念なので、説明まで求めます"
      : needsExplain(conceptId, st)
      ? "自信ありで間違えた概念なので、説明まで求めます"
      : "土台ではないので、組み合わせ問題まで通れば十分です",
  };
}

/** どこまで本当に通ったか(説明が要る概念は、説明に受かるまで5にしない) */
function masteredLevel(S, conceptId) {
  const t = S.tr?.[conceptId];
  if (!t) return 0;
  if (t.lv >= 5) return t.exp?.passed ? 5 : 4;
  return t.lv - 1;
}

/** 「マスター」と言えるか */
function isMastered(S, conceptId) {
  const st = S.mem?.[conceptId];
  return masteredLevel(S, conceptId) >= topLevelFor(conceptId, st);
}

/* ── Lv5:説明の採点 ──────────────────────────────────
   AIは「見たこと」を埋めるだけ。通すかどうかはここで決める。 */

function passExplanation(r) {
  const need = Math.max(1, Math.ceil((r.expected || 0) * 0.6));
  const missing = [];
  if (!r.causal) missing.push("「なぜそうなるか」が入っていない");
  if (!r.example) missing.push("具体例が入っていない");
  if (r.misconception) missing.push("誤解が残っている:" + r.misconception);
  if (!r.ownWords) missing.push("教科書の言い回しをなぞっている(自分の言葉になっていない)");
  if ((r.used || 0) < need) missing.push(`外せない言葉が足りない(${r.used || 0}/${r.expected || 0})`);
  return { passed: missing.length === 0, missing };
}

function gradeExplanation(S, conceptId, raw) {
  const t = transferState(S, conceptId);
  const r = {
    expected: Array.isArray(raw.keywords_expected) ? raw.keywords_expected.length : 0,
    used: Array.isArray(raw.keywords_used) ? raw.keywords_used.length : 0,
    causal: !!raw.has_causal,
    example: !!raw.has_example,
    ownWords: raw.own_words !== false,
    misconception: String(raw.misconception || "").trim().slice(0, 200),
  };
  const v = passExplanation(r);
  t.exp = { ...r, ...v, at: Date.now(), attempts: (t.exp?.attempts || 0) + 1 };
  if (v.passed) { t.lv = 5; t.masteredAt = Date.now(); }
  return { ...v, attempts: t.exp.attempts };
}

/* ── 表示・プロンプト用 ────────────────────────────────── */

/** 段位のはしご(画面用) */
function transferLadder(S, conceptId) {
  const t = transferState(S, conceptId);
  const st = S.mem?.[conceptId];
  const top = topLevelFor(conceptId, st);
  const reached = masteredLevel(S, conceptId);
  return TRANSFER_LEVELS.filter((l) => l.lv <= top).map((l) => ({
    ...l,
    state: reached >= l.lv ? "done" : t.lv === l.lv ? "now" : "todo",
    hits: t.hits[l.lv] || 0,
    needed: CLEAR_NEEDED,
  }));
}

/** いま説明にちょうどよい概念(あれば1つ) */
function explainReady(S) {
  for (const id in S.tr || {}) {
    const t = S.tr[id];
    if (t.lv >= 5 && !t.exp?.passed && CONCEPT_MAP[id]) return CONCEPT_MAP[id];
  }
  return null;
}

/** マスターまで到達した概念の数 */
function masteredCount(S) {
  let n = 0;
  for (const id in S.tr || {}) if (isMastered(S, id)) n++;
  return n;
}

function transferPromptBlock(S) {
  const ids = Object.keys(S.tr || {});
  if (!ids.length) return "";

  const inProgress = ids
    .map((id) => ({ id, c: CONCEPT_MAP[id], ch: nextChallenge(S, id) }))
    .filter((x) => x.c && !x.ch.done)
    .sort((a, b) => b.ch.level - a.ch.level)
    .slice(0, 5);

  const ready = explainReady(S);

  let s = "\n# 習得の判定は「解けた」ではなく「転移できた」で行います\n";
  s += "同じ形の問題を何問解けても、それは同じ形が解けるという意味しかありません。\n";
  s += "record_answer には、その問題が何段目だったかを transfer_level で必ず入れてください。\n\n";
  s += TRANSFER_LEVELS.map((l) => `- Lv${l.lv} ${l.label}:${l.what}`).join("\n") + "\n";
  s += `\n各段は正解 ${CLEAR_NEEDED} 問で次へ進みます。**間違えても段は下がりません**(その段の積み上げが0に戻るだけ)。\n`;
  s += "土台になっている概念と、自信ありで間違えた概念だけ Lv5(説明)まで求めます。それ以外は Lv4 までで十分です。\n";

  if (inProgress.length) {
    s += "\n【いま途中の概念】\n";
    s += inProgress.map((x) =>
      `- ${x.c.n}(${x.id}): 次は Lv${x.ch.level} ${x.ch.label} — ${x.ch.ask}`).join("\n") + "\n";
  }
  if (ready) {
    s += `\n【★いま Luke への説明にちょうどよい概念】${ready.n}(${ready.id})\n`;
    s += "「Luke に、小学生でもわかるように説明してあげて」と頼んでください。\n";
    s += "説明を聞いたら、**必ず grade_explanation を呼んで**ください。合否はこちらで判定します。\n";
    s += "採点はあなたの感想ではありません。見たままを埋めてください。おだてて通さないでください。\n";
  }
  return s;
}
