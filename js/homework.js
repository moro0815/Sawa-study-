/* =========================================================================
   homework.js — 宿題(学校ぶん＋AIが出すぶん)

   このアプリの宿題は2系統ある。
     source:"school" … 学校から出たもの。写真/スキャンで取り込む。最優先。
     source:"ai"     … AI家庭教師が出すもの。学校ぶんの残り時間に合わせて量を決める。

   AIが出す問題の難易度は「85%ルール」に合わせる。
   Wilson, Shenhav, Straccia & Cohen (2019) Nature Communications
   "The Eighty Five Percent Rule for optimal learning" — 学習が最も速く進むのは
   正答率が約85%(誤り率 約15.9%)のとき。易しすぎても難しすぎても伸びが鈍る。
   ========================================================================= */

const TARGET_ACCURACY = 0.85;      // ねらう正答率
const DEFAULT_MINUTES = 30;        // 1日の学習時間が未設定のときの既定値
const MIN_AI_MINUTES  = 5;         // これ未満ならAIの宿題は出さない
const MAX_AI_ITEMS    = 8;         // 1回に出す問題数の上限

/* ── 生成・集計 ─────────────────────────────────────────── */

function newAssignment(o) {
  return {
    id: `hw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    source: o.source || "ai",              // "ai" | "school"
    title: o.title || "宿題",
    subject: o.subject || null,
    conceptIds: o.conceptIds || [],
    items: (o.items || []).map((it, i) => ({
      n: i + 1,
      q: it.q || "",
      hint: it.hint || "",
      conceptId: it.conceptId || null,
      status: "todo",                      // todo | done | stuck
      correct: null,
      confidence: null,
    })),
    minutes: o.minutes || null,            // 想定所要時間
    due: o.due || todayISO(),              // YYYY-MM-DD
    reason: o.reason || "",                // なぜこれを出したか(本人に見せる)
    note: o.note || "",                    // 学校ぶんの場合、写真から読み取った内容
    assignedAt: Date.now(),
    doneAt: null,
  };
}

function todayISO(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function addDaysISO(days) {
  const d = new Date(); d.setDate(d.getDate() + days); return todayISO(d);
}

/**
 * まだ終わっていない宿題すべて。期限が近い順。
 * 期限が先でも隠さない — 出ている宿題が見えないと、直前に慌てることになる。
 */
function openAssignments(list) {
  return (list || []).filter((a) => !a.doneAt)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.assignedAt - b.assignedAt));
}

/** そのうち今日やるぶん(期限が今日以前) */
function dueTodayAssignments(list) {
  const t = todayISO();
  return openAssignments(list).filter((a) => a.due <= t);
}

/** 今日ぶんの残り時間(分)。学校ぶんを先に引く */
function remainingMinutes(list, dailyMinutes) {
  const budget = dailyMinutes || DEFAULT_MINUTES;
  const used = dueTodayAssignments(list)
    .reduce((s, a) => s + (a.minutes || estimateMinutes(a)), 0);
  return Math.max(0, budget - used);
}

/** 所要時間の推定。1問あたり中学生で約2.5分 */
function estimateMinutes(a) {
  const per = a.source === "school" ? 3 : 2.5;
  return Math.round((a.items?.length || 1) * per);
}

function assignmentProgress(a) {
  const n = a.items.length || 1;
  // 「わからない(stuck)」は終わっていない。片づけずに残す
  const done = a.items.filter((i) => i.status === "done").length;
  const right = a.items.filter((i) => i.correct === true).length;
  const answered = a.items.filter((i) => i.correct != null).length;
  return {
    done, total: n,
    pct: Math.round((done / n) * 100),
    accuracy: answered ? right / answered : null,
    stuck: a.items.filter((i) => i.status === "stuck").length,
    todo: a.items.filter((i) => i.status === "todo").length,
  };
}

/**
 * 直近の正答率から、次に出す問題の難易度をどちらへ動かすかを返す。
 * 85%ルール — 高すぎれば易しすぎ、低すぎれば難しすぎ。
 */
function difficultyAdvice(list, lookback = 5) {
  const recent = (list || []).filter((a) => a.source === "ai" && a.doneAt).slice(-lookback);
  const items = recent.flatMap((a) => a.items).filter((i) => i.correct != null);
  if (items.length < 6) return { accuracy: null, move: "keep", say: "まだ判断できるだけの記録がありません。標準の難しさで出してください。" };

  const acc = items.filter((i) => i.correct).length / items.length;
  if (acc > TARGET_ACCURACY + 0.08)
    return { accuracy: acc, move: "harder", say: `直近の正答率が${Math.round(acc * 100)}%で、ねらいの85%より高すぎます。易しすぎるので、次はもう一段難しくしてください。` };
  if (acc < TARGET_ACCURACY - 0.15)
    return { accuracy: acc, move: "easier", say: `直近の正答率が${Math.round(acc * 100)}%で、ねらいの85%より低すぎます。難しすぎるので、次は一段易しくするか、前提の確認から入ってください。` };
  return { accuracy: acc, move: "keep", say: `直近の正答率は${Math.round(acc * 100)}%。ねらいの85%付近です。この難しさを保ってください。` };
}

/**
 * AIが宿題を組むときの下ごしらえ。
 * 復習(期限が来た概念)を2/3、新規を1/3の割合で候補を返す。
 */
function homeworkCandidates(memStates, opts = {}) {
  const limit = Math.min(opts.limit || 6, MAX_AI_ITEMS);
  const queue = buildQueue(memStates, {
    limit: limit * 3,
    subjects: opts.subject ? [opts.subject] : null,
  });
  const review = queue.filter((q) => q.kind !== "new");
  const fresh  = queue.filter((q) => q.kind === "new");
  const nReview = Math.max(1, Math.round(limit * 2 / 3));
  const picked = [...review.slice(0, nReview), ...fresh.slice(0, limit - nReview)];
  return interleave(picked.length ? picked : queue.slice(0, limit))
    .slice(0, limit)
    .map((x) => ({
      concept_id: x.concept.id,
      name: x.concept.n,
      subject: SUBJECTS[x.concept.s]?.name || x.concept.s,
      grade: x.concept.g,
      unit: x.concept.u,
      kind: x.kind,                                   // review | new
      mastery: x.state ? Math.round(x.state.mastery * 100) : 0,
      flagged: !!x.state?.flagged,                    // 自信ありで間違えた場所
      vet_link: x.concept.vet || null,
    }));
}

/** 保護者レポート・AIの状況把握に使うまとめ */
function homeworkSummary(list, dailyMinutes) {
  const open = openAssignments(list);
  const today = dueTodayAssignments(list);
  const school = open.filter((a) => a.source === "school");
  const ai = open.filter((a) => a.source === "ai");
  const done7 = (list || []).filter((a) => a.doneAt && Date.now() - a.doneAt < 7 * 864e5);
  const items7 = done7.flatMap((a) => a.items).filter((i) => i.correct != null);
  return {
    openCount: open.length,
    todayCount: today.length,
    schoolOpen: school.length,
    aiOpen: ai.length,
    stuckCount: open.reduce((s, a) => s + assignmentProgress(a).stuck, 0),
    remainingMinutes: remainingMinutes(list, dailyMinutes),
    done7: done7.length,
    accuracy7: items7.length ? Math.round((items7.filter((i) => i.correct).length / items7.length) * 100) : null,
  };
}

/** AI向けのテキスト要約 */
function homeworkStatusText(list, dailyMinutes) {
  const s = homeworkSummary(list, dailyMinutes);
  const adv = difficultyAdvice(list);
  const open = openAssignments(list);
  const lines = [
    `- 未提出の宿題:${s.openCount}件(学校${s.schoolOpen} / AI${s.aiOpen})。うち今日ぶん ${s.todayCount}件`,
    `- 今日まだ使える時間:約${s.remainingMinutes}分(1日の目安 ${dailyMinutes || DEFAULT_MINUTES}分から、出ている宿題の想定時間を引いた残り)`,
    `- 直近7日で終えた宿題:${s.done7}件、正答率 ${s.accuracy7 == null ? "—" : s.accuracy7 + "%"}`,
    `- 難易度の調整:${adv.say}`,
  ];
  if (s.stuckCount) lines.push(`- 「わからない」と本人が印をつけた問題:${s.stuckCount}問(最優先で説明すること)`);
  for (const a of open.slice(0, 4)) {
    const p = assignmentProgress(a);
    lines.push(`  ・[${a.source === "school" ? "学校" : "AI"}] ${a.title} — ${p.done}/${p.total}問(期限 ${a.due})`);
  }
  return lines.join("\n");
}

/* ── 出題ルール(プロンプトに差し込む) ───────────────────── */

const HOMEWORK_RULES = `
【宿題と出題のきまり】
A. 量を決める順番
   1. 学校の宿題が先。AIの宿題は「1日の目安時間 − 学校ぶんの想定時間」の残りにだけ入れる。
   2. 残りが${MIN_AI_MINUTES}分未満なら、AIの宿題は出さない。「今日は学校のぶんで十分」と伝える。
   3. 1回に出すのは最大${MAX_AI_ITEMS}問。中学生なら1問あたり約2.5分で見積もる。
B. 難易度は「85%ルール」に合わせる
   - ねらう正答率は約85%。全問正解が続くなら易しすぎ、半分を切るなら難しすぎ。
   - get_homework が返す「難易度の調整」に必ず従って、次の一手を決める。
   - 全部を同じ難しさにしない。易しめ2割・ちょうど6割・挑戦2割で混ぜる。
C. 中身の組み立て
   - 復習(期限が来た概念)を約2/3、新しい概念を約1/3。
   - 単元は必ず混ぜる(交互練習)。同じ単元を続けて2問以上並べない。
   - 新しい概念の1問目は「解き方の例つき(解答例を見せて、途中の1ステップだけ埋めさせる)」から入る。
     慣れてきたら例を減らしていく(ワークトエグザンプルのフェーディング)。
D. 出すときに必ず伝えること
   - なぜこの問題なのか(reason)。「前にここでつまずいたから」「明日の復習の期限が来たから」など。
   - どのくらいで終わるか(minutes)。見通しが立たないと手がつかない。
E. 答え合わせ
   - 1問ごとに確信度を聞いてから正誤を確認し、record_answer と record_homework_result の両方を呼ぶ。
   - 間違えた問題は、その場で解き直させて終わりにしない。訂正直後に「同じ型の別問題」をもう1問出す。
F. 「わからない」と言われたら
   - まず diagnose_prerequisite で前提を疑う。前提が崩れていれば、そちらを先に直す。
   - 前提が問題なければ、答えではなく「次の一歩」だけを渡す。3回試して進まないときは、考え方ごと丁寧に教える。
   - 教えたあと、必ず同じ型の問題をもう1問出して、できるようになったことを本人に確認させる。
`;
