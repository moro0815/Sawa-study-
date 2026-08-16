/* =========================================================================
   memory.js — 記憶モデルと弱点診断エンジン

   1) FSRS-lite : 概念ごとに 難易度D / 安定度S / 想起可能性R を持ち、
                  忘れかけたタイミングで復習を出す (分散学習)
   2) 確信度キャリブレーション : 確信度×正誤の4象限を追跡
                  「自信あり×不正解」= ハイパーコレクションの最重要ターゲット
   3) 前提遡行診断 : つまずいた概念の前提をさかのぼり、本当の原因を特定
   ========================================================================= */

const DAY = 86400000;
const TARGET_RETENTION = 0.9;  // 想起可能性がこれを下回ったら復習

/* 確信度 */
const CONFIDENCE = {
  3: { label: "自信ある",   short: "◎" },
  2: { label: "たぶん",     short: "○" },
  1: { label: "わからない", short: "△" },
};

/* 4象限 — 研究(Metcalfe & Finn 2011)に基づく優先度づけ */
const QUADRANTS = {
  "hi-wrong": { name: "わかったつもり", prio: 100, emoji: "🚨",
    desc: "自信があったのに間違えた。実は最も直りやすく、最も伸びる場所(ハイパーコレクション効果)。ただし放置すると1週間で元に戻るので、すぐ再テストする。" },
  "lo-wrong": { name: "未習得", prio: 60, emoji: "📘",
    desc: "自信もなく間違えた。基礎から順に組み立て直す場所。" },
  "lo-right": { name: "自信不足", prio: 40, emoji: "🌱",
    desc: "できているのに自信がない。まぐれか、確認不足。もう一度出して確かめる。" },
  "hi-right": { name: "定着", prio: 10, emoji: "✅",
    desc: "自信あり・正解。間隔をあけて忘れないように保つだけでよい。" },
};

function quadrantOf(confidence, correct) {
  const hi = confidence >= 3;
  return hi ? (correct ? "hi-right" : "hi-wrong") : (correct ? "lo-right" : "lo-wrong");
}

/* ---------- 概念ごとの記憶状態 ---------- */
function newMemState(conceptId) {
  return {
    id: conceptId,
    D: 5,            // 難易度 1〜10
    S: 0,            // 安定度(日)。0 = 未学習
    last: null,      // 最終復習日時
    due: null,       // 次回復習日時
    reps: 0,
    lapses: 0,
    history: [],     // [{t, correct, confidence, q}]
    mastery: 0,      // 0〜1 の習得度
  };
}

/** 想起可能性 R — FSRSのべき関数近似 */
function retrievability(state, now = Date.now()) {
  if (!state.S || !state.last) return 0;
  const t = (now - state.last) / DAY;
  return Math.pow(1 + (19 / 81) * (t / state.S), -0.5);
}

/**
 * 復習結果を反映して記憶状態を更新する。
 * grade: 1=わからなかった 2=あやしい 3=できた 4=余裕
 */
function reviewConcept(state, grade, confidence, now = Date.now()) {
  const correct = grade >= 3;
  const R = retrievability(state, now);
  const q = quadrantOf(confidence, correct);

  // 難易度Dの更新(できなかったほど難しくなる)
  state.D = clamp(state.D - 0.9 * (grade - 3), 1, 10);

  if (!state.S) {
    // 初回学習
    state.S = [0.4, 1.0, 2.5, 5.0][grade - 1] ?? 1.0;
  } else if (correct) {
    // 成功 — 安定度が伸びる。忘れかけ(R低)ほど伸びが大きい = 望ましい困難
    const gain = 1 + (11 - state.D) * Math.pow(state.S, -0.28) * (Math.exp(1 - R) - 1) * (grade === 4 ? 1.3 : 1.0);
    state.S = state.S * Math.max(1.05, gain);
  } else {
    // 失敗 — 安定度がリセットに近い形で下がる
    state.lapses++;
    state.S = Math.max(0.3, 2.2 * Math.pow(state.D, -0.4) * Math.pow(state.S, 0.15));
  }
  state.S = clamp(state.S, 0.2, 365 * 3);

  state.reps++;
  state.last = now;
  state.history.push({ t: now, correct, confidence, q });
  state.history = memHistory(state);
  if (state.history.length > 40) state.history.shift();

  // 次回復習日 — 想起可能性がTARGET_RETENTIONまで落ちる日
  const interval = (state.S * 81 / 19) * (Math.pow(TARGET_RETENTION, -2) - 1);
  state.due = now + Math.max(0.5, interval) * DAY;

  // ★ハイパーコレクション対策:自信あり×不正解 は必ず短間隔で再テスト
  //  (Metcalfe & Finn 2011 / Butler et al. 2014 — 訂正直後の再テストで誤りの復活を防ぐ)
  if (q === "hi-wrong") {
    state.due = now + 0.5 * DAY;  // 半日後に必ずもう一度
    state.flagged = true;
  } else if (correct && state.flagged && state.reps > 1) {
    state.flagged = false;
  }

  // 習得度 — 直近の正答率と安定度の合成
  const recent = memHistory(state).slice(-6);
  const acc = recent.filter((h) => h.correct).length / recent.length;
  const stab = Math.min(1, Math.log10(state.S + 1) / Math.log10(60));
  state.mastery = clamp(acc * 0.6 + stab * 0.4, 0, 1);

  return { quadrant: q, R, nextDue: state.due, interval: (state.due - now) / DAY };
}

/* ---------- 今日やるべきことの選定 ---------- */

/**
 * 復習キューを作る。研究に基づく優先順位:
 *  1. 自信あり×不正解のフラグ付き(最優先)
 *  2. 期限切れ(想起可能性が落ちている)
 *  3. 未学習だが前提が揃っている概念(学習可能フロンティア)
 */
function buildQueue(memStates, opts = {}) {
  const now = Date.now();
  const limit = opts.limit || 20;
  const subjects = opts.subjects || null;
  /* テスト範囲など、優先したい概念(testprep.js の testTargetIds が渡す)。
     ★足す点は「自信あり×不正解」の1000より必ず小さくする。
     テスト前でも、いちばん伸びる場所の順位は崩さない。 */
  const boost = opts.boostIds || null;
  const scored = [];

  for (const c of CONCEPTS) {
    if (subjects && !subjects.includes(c.s)) continue;
    const st = memStates[c.id];
    const boosted = boost ? boost.has(c.id) : false;

    if (st && st.S > 0) {
      const R = retrievability(st, now);
      const overdue = st.due ? (now - st.due) / DAY : 0;
      let score = 0;
      const lastQ = lastQuadrant(st);
      if (st.flagged || lastQ === "hi-wrong") score += 1000;      // 最優先
      if (overdue >= 0) score += 400 + Math.min(200, overdue * 20);
      score += (1 - R) * 300;
      if (lastQ === "lo-right") score += 60;
      if (boosted) score += 300;
      if (score > 100) scored.push({ concept: c, state: st, score, kind: "review", R, boosted });
    } else {
      // 未学習 — 前提がすべて習得済みなら「今学べる」
      const pres = c.pre.map((p) => memStates[p]);
      const ready = c.pre.length === 0 || pres.every((p) => p && p.mastery >= 0.6);
      if (ready) scored.push({ concept: c, state: st || null, score: boosted ? 320 : 120, kind: "new", R: 0, boosted });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return interleave(scored.slice(0, limit * 2)).slice(0, limit);
}

/**
 * ★交互練習(インターリービング) — Rohrer et al. 2020
 * 同じ単元が連続しないよう並べ替える。練習中の正答率は下がるが、
 * あとのテストの成績は大きく改善する(38%→77% など。課題によって幅は違う)。
 * この体感の悪さは本人に必ず説明すること。
 */
function interleave(items) {
  const byUnit = {};
  for (const it of items) {
    const k = it.concept.s + "/" + it.concept.u;
    (byUnit[k] ||= []).push(it);
  }
  const buckets = Object.values(byUnit);
  const out = [];
  let guard = 0;
  while (buckets.some((b) => b.length) && guard++ < 500) {
    buckets.sort((a, b) => b.length - a.length);
    for (const b of buckets) {
      if (!b.length) continue;
      const last = out.at(-1);
      const cand = b[0];
      if (last && last.concept.u === cand.concept.u && buckets.filter((x) => x.length).length > 1) continue;
      out.push(b.shift());
    }
  }
  for (const b of buckets) out.push(...b);
  return out;
}

/* ---------- ★前提遡行診断 (このシステムの中核) ---------- */

/**
 * つまずいた概念から前提をさかのぼり、「本当に壊れている場所」の候補を返す。
 * 習得度が低い or 未学習の前提を、根に近い順(=直すべき順)に並べる。
 */
function diagnoseRootCause(conceptId, memStates) {
  const layers = prereqChain(conceptId);
  const suspects = [];
  layers.forEach((layer, depth) => {
    for (const c of layer) {
      const st = memStates[c.id];
      const m = st ? st.mastery : 0;
      const unknown = !st || st.S === 0;
      if (m < 0.6) {
        suspects.push({
          concept: c,
          depth: depth + 1,
          mastery: m,
          unknown,
          // 深いほど(=根に近いほど)真の原因である可能性が高い
          suspicion: (1 - m) * (1 + depth * 0.5),
        });
      }
    }
  });
  suspects.sort((a, b) => b.suspicion - a.suspicion);
  return suspects;
}

/**
 * 記憶モデルの履歴を、安全に取り出す。
 * ★古い版のバックアップや、途中まで書かれた記録を復元すると、
 *   history を持たない状態が混ざる。そのまま `.at(-1)` を読むと
 *   例外になり、【画面全体が描けなくなる】(実際にそうなった)。
 *   記録が欠けていても、アプリは動きつづけるほうがよい。
 */
function memHistory(st) { return Array.isArray(st?.history) ? st.history : []; }

/** 直近の象限(hi-wrong など)。無ければ "" */
function lastQuadrant(st) { return memHistory(st).at(-1)?.q || ""; }

/** 「自信あり×不正解」で、いちばん優先すべきものか */
function isHotState(st) { return !!(st && (st.flagged || lastQuadrant(st) === "hi-wrong")); }

/** 弱点サマリー(4象限別の集計) */
function weaknessSummary(memStates) {
  const counts = { "hi-wrong": 0, "lo-wrong": 0, "lo-right": 0, "hi-right": 0 };
  const items = { "hi-wrong": [], "lo-wrong": [], "lo-right": [], "hi-right": [] };
  let totalAnswers = 0, hiWrong = 0, hiTotal = 0;

  for (const id in memStates) {
    const st = memStates[id];
    const hist = memHistory(st);
    const last = hist.at(-1);
    if (!last || !(last.q in counts)) continue;      // 知らない象限も弾く
    counts[last.q]++;
    if (items[last.q].length < 12) items[last.q].push(CONCEPT_MAP[id]);
    for (const h of hist) {
      totalAnswers++;
      if (h.confidence >= 3) { hiTotal++; if (!h.correct) hiWrong++; }
    }
  }
  return {
    counts, items, totalAnswers,
    // 「わかったつもり率」: 自信ありと言った中で実際は間違えた割合
    overconfidence: hiTotal ? hiWrong / hiTotal : 0,
    hiTotal,
  };
}

/** 教科別の習得度 */
function subjectMastery(memStates) {
  const out = {};
  for (const sid in SUBJECTS) {
    const cs = conceptsBySubject(sid);
    let sum = 0, learned = 0;
    for (const c of cs) {
      const st = memStates[c.id];
      if (st && st.S > 0) { sum += st.mastery; learned++; }
    }
    out[sid] = {
      learned, total: cs.length,
      avgMastery: learned ? sum / learned : 0,
      coverage: cs.length ? learned / cs.length : 0,
    };
  }
  return out;
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
