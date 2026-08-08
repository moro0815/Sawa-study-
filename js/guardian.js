/* =========================================================================
   guardian.js — 保護者機能

   設計方針(自己決定理論):
     このモジュールは「監視」ではなく「支援」のためにある。
     数字を並べて叱る材料にするのではなく、
     何が起きているかを正しく解釈し、どう声をかければよいかまで届ける。
   ========================================================================= */

const DAYMS = 86400000;

/* ---------------------------------------------------------------
   アラート検出
   ネガティブだけでなくポジティブも必ず検出する(そちらを先に出す)
   --------------------------------------------------------------- */
function detectAlerts(S) {
  const now = Date.now();
  const out = [];
  const sessions = S.sessions || [];
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1);

  /* ── ポジティブ ── */
  // 連続学習
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(now - i * DAYMS).toISOString().slice(0, 10);
    if (sessions.find((s) => s.date === d && s.answered > 0)) streak++;
    else if (i > 0) break;
  }
  if (streak >= 3) out.push({ level:"good", icon:"🔥", title:`${streak}日連続で学習しています`,
    body:"続けられていること自体が成果です。結果ではなく「続けたこと」を言葉にして認めてあげてください。",
    say:"「毎日ちゃんと続いてるね」" });

  // 新規習得
  const weekAgo = now - 7 * DAYMS;
  const newly = Object.values(S.mem || {}).filter((m) => m.last >= weekAgo && m.mastery >= 0.7).length;
  if (newly >= 3) out.push({ level:"good", icon:"🌱", title:`今週 ${newly} 個の概念を習得しました`,
    body:"確実に積み上がっています。正答率ではなくこの数字を見てあげてください。",
    say:"「先週わからなかったところ、できるようになったんだね」" });

  // 成績の上昇
  const bySubject = {};
  for (const g of S.grades || []) (bySubject[g.subject] ||= []).push(g);
  for (const sid in bySubject) {
    const gs = bySubject[sid];
    if (gs.length < 2) continue;
    const d = gs.at(-1).eval.estHensa - gs.at(-2).eval.estHensa;
    if (d >= 4) out.push({ level:"good", icon:"📈", title:`${SUBJECTS[sid]?.name} が伸びています(推定偏差値 +${Math.round(d * 10) / 10})`,
      body:"平均点との差で見た相対的な位置が上がっています。点数だけ見ると見逃す変化です。",
      say:"「あの教科、やり方が合ってきたんじゃない?」" });
    else if (d <= -4) out.push({ level:"warn", icon:"📉", title:`${SUBJECTS[sid]?.name} が下がっています(推定偏差値 ${Math.round(d * 10) / 10})`,
      body:"点数ではなく平均との差で下がっています。前提のどこかに穴ができた可能性が高いです。「弱点」タブの原因診断を一緒に見てみてください。",
      say:"「難しくなってきた?どのへんから怪しい?」(責めずに事実だけ聞く)" });
  }

  /* ── 注意 ── */
  // 学習の中断
  if (last) {
    const gap = Math.floor((now - new Date(last.date).getTime()) / DAYMS);
    if (gap >= 7) out.push({ level:"alert", icon:"⏸", title:`${gap}日間、学習記録がありません`,
      body:"理由は成績とは限りません。疲れ・人間関係・別の悩みのこともあります。まず事実だけを聞いてください。理由が語られたら、それを否定しないことが最も大切です。",
      say:"「最近やってないみたいだけど、何かあった?」" });
    else if (gap >= 3) out.push({ level:"warn", icon:"💤", title:`${gap}日、学習が空いています`,
      body:"数日空くのはよくあることです。ここで叱ると再開のハードルが上がります。",
      say:"「今日、10分だけやってみる?」(小さく戻す提案)" });
  } else if ((S.grades || []).length || Object.keys(S.mem || {}).length) {
    out.push({ level:"warn", icon:"📭", title:"学習セッションの記録がまだありません",
      body:"アプリでの問題演習が始まっていない状態です。「学習」タブから話しかけるところから始めてください。", say:"" });
  }

  // わかったつもり率
  const w = weaknessSummary(S.mem || {});
  if (w.hiTotal >= 5 && w.overconfidence >= 0.3) out.push({ level:"alert", icon:"🚨",
    title:`「わかったつもり」率が ${Math.round(w.overconfidence * 100)}% と高い状態です`,
    body:"自信があると答えた問題の3割以上を間違えています。本番で崩れやすい状態ですが、研究上ここは最も直りやすい場所でもあります。アプリが自動で再テストを組んでいます。",
    say:"「わかったつもりが見つかるのって、実はいちばん得なんだって」" });

  // 積み残し
  const due = buildQueue(S.mem || {}, { limit: 200 }).filter((x) => x.kind === "review").length;
  if (due >= 30) out.push({ level:"warn", icon:"📚", title:`復習待ちが ${due} 件たまっています`,
    body:"一度に片づけようとすると挫折します。1日5〜8問に絞って構いません。全部やる必要はないと伝えてあげてください。",
    say:"「全部やらなくていいよ。今日は5問だけにしたら?」" });

  // 高確信度の誤りが残っている
  if (w.counts["hi-wrong"] >= 5) out.push({ level:"warn", icon:"🎯",
    title:`最優先の弱点が ${w.counts["hi-wrong"]} 件あります`,
    body:"ここを潰すのが最短の伸びしろです。学習タブでミミ先生に「最優先の弱点をやりたい」と伝えるだけで始まります。", say:"" });

  const rank = { alert: 0, warn: 1, good: 2 };
  return out.sort((a, b) => (a.level === "good" ? -1 : b.level === "good" ? 1 : rank[a.level] - rank[b.level]));
}

/* ---------------------------------------------------------------
   夢が変わったときの保護者向けガイド

   ここは、保護者が最も反射的に反応してしまう場面。
   「あんなに獣医って言ってたのに」の一言が、探索そのものを止めてしまう。
   --------------------------------------------------------------- */
const DREAM_CHANGE_GUIDE = {
  facts: [
    "縦断研究では、思春期の約3分の1が志望を大きく変えます。約20%は『決まっていない』状態にあります。変わることも、決まらないことも標準です。",
    "探索を経ずに早く決めた状態(アイデンティティの早期完了)は、周囲が肯定し続けている間は安定して見えても、その支えが崩れたときにもろくなることが知られています。",
    "キャリア研究では、進路の大半は予期しない出来事で決まるとされ、『迷っていること自体が望ましく理にかなっている』とまで言われます(計画された偶発性理論)。",
    "子どもは9〜13歳にかけて、社会的な評価をもとに職業の選択肢を次々に『消して』いきます。内面的な自己で選び直せるのは14歳以降です。今はまだ消している途中の年齢です。",
  ],
  avoid: [
    { say: "「あんなに獣医って言ってたのに」", why: "過去の発言で縛ると、次から本音を言わなくなります" },
    { say: "「本当にそれでいいの?」", why: "疑いを差し込むと、自分の判断を信じられなくなります" },
    { say: "「今までの勉強、無駄になっちゃうよ」", why: "事実として誤りです。主要教科の土台はほとんどの進路で共通します" },
    { say: "「ちゃんと考えて決めたの?」", why: "12〜15歳に完全な熟慮を求めるのは発達段階に合いません" },
    { say: "「そっちのほうが楽だからでしょ」", why: "動機を勝手に決めつけると、対話が終わります" },
    { say: "「まだ決まってないの?」", why: "迷いを欠点として扱うことになります。迷いは探索です" },
  ],
  good: [
    { say: "「そう思ったきっかけ、聞かせて」", why: "評価せずに中身を聞く。ここから対話が始まります" },
    { say: "「そう思えるようになったんだね」", why: "変化そのものを成長として認める" },
    { say: "「その仕事の、どこが面白そう?」", why: "興味の中身を言語化させると、本人の理解が進みます" },
    { say: "「今までの勉強はほとんどそのまま使えるよ」", why: "事実です。不安を具体的に打ち消せます" },
    { say: "「決まってなくても大丈夫だよ」", why: "迷える時間を保証することが、最良の支援になります" },
    { say: "「一緒に調べてみようか」", why: "指示ではなく並走。自律性を守りながら関われます" },
  ],
  note:
    "親が特定の職業を望んでいると子どもが感じると、本音の探索が止まります。応援と期待は紙一重です。" +
    "「どの道でも応援する」と実際に言葉にして伝えてください。それが探索を可能にします。",
};

/** 志望の変更履歴から、保護者向けの状況説明を作る */
function dreamStatus(S) {
  const hist = S.dreamHistory || [];
  const cur = CAREER_MAP[S.career || DEFAULT_CAREER];
  if (!cur) return null;
  const changes = hist.length > 1 ? hist.length - 1 : 0;
  const last = hist.at(-1);
  const daysSince = last ? Math.floor((Date.now() - last.at) / DAYMS) : null;

  let read;
  if (cur.isNeutral) {
    read = "現在は「決めていない」状態です。これは欠点ではなく、健全な探索期(モラトリアム)です。急がせないことが最良の支援になります。";
  } else if (changes === 0) {
    read = `一貫して「${cur.name}」を志望しています。応援しつつ、他の道も自由に見られる空気を保ってあげてください。早く決めすぎることにもリスクがあります。`;
  } else if (changes >= 3) {
    read = `これまでに ${changes} 回、志望が変わっています。移り気に見えるかもしれませんが、これは選択肢を試している探索行動です。研究上、この過程を経たほうが最終的に安定します。`;
  } else {
    read = `これまでに ${changes} 回、志望が変わっています。変化は思春期の標準的な姿です(縦断研究では約3分の1が変化)。`;
  }
  return { current: cur, changes, daysSince, history: hist, read, interests: S.careerInterests || [] };
}

/* ---------------------------------------------------------------
   期間サマリー
   --------------------------------------------------------------- */
function periodSummary(S, days = 7) {
  const from = Date.now() - days * DAYMS;
  const sessions = (S.sessions || []).filter((s) => new Date(s.date).getTime() >= from);
  const answered = sessions.reduce((a, s) => a + s.answered, 0);
  const correct = sessions.reduce((a, s) => a + s.correct, 0);
  const minutes = sessions.reduce((a, s) => a + (s.minutes || 0), 0);
  const mem = S.mem || {};
  const newly = Object.values(mem).filter((m) => m.last >= from && m.mastery >= 0.7).length;
  const touched = Object.values(mem).filter((m) => m.last >= from).length;

  // 教科別の内訳
  const bySubject = {};
  for (const id in mem) {
    if (mem[id].last < from) continue;
    const s = CONCEPT_MAP[id]?.s; if (!s) continue;
    (bySubject[s] ||= { touched: 0, mastered: 0 });
    bySubject[s].touched++;
    if (mem[id].mastery >= 0.7) bySubject[s].mastered++;
  }

  return {
    days, activeDays: sessions.filter((s) => s.answered > 0).length,
    answered, correct, minutes,
    accuracy: answered ? correct / answered : null,
    newly, touched, bySubject,
    avgMinutes: sessions.length ? Math.round(minutes / sessions.length) : 0,
  };
}

/* ---------------------------------------------------------------
   面談・共有用のテキストレポート生成
   三者面談や、離れて暮らす家族への共有にそのまま使える形にする
   --------------------------------------------------------------- */
function buildTextReport(S, days = 30) {
  const p = periodSummary(S, days);
  const w = weaknessSummary(S.mem || {});
  const sm = subjectMastery(S.mem || {});
  const cd = countdownToExam(S.grade);
  const L = [];

  L.push(`【${S.name}さんの学習レポート】`);
  L.push(`期間:直近${days}日間 / ${new Date().toISOString().slice(0, 10)} 時点`);
  const _c = CAREER_MAP[S.career || DEFAULT_CAREER];
  L.push(`学年:${S.grade}  現在の志望:${_c ? _c.name : "未設定"}`);
  const _hist = S.dreamHistory || [];
  if (_hist.length > 1) L.push(`※志望はこれまで ${_hist.length - 1} 回変わっています(思春期では標準的なことです)`);
  if (cd) L.push(`大学受験(共通テスト)まで:あと ${cd.days}日(${cd.examYearLabel})`);
  L.push("");

  L.push("■ 学習の状況");
  L.push(`・学習した日数:${p.activeDays} / ${days}日`);
  L.push(`・解いた問題数:${p.answered} 問`);
  if (p.minutes) L.push(`・学習時間:合計 ${Math.round(p.minutes / 60)} 時間(1日平均 ${p.avgMinutes} 分)`);
  L.push(`・新しく習得した概念:${p.newly} 個`);
  if (p.accuracy != null) {
    L.push(`・練習中の正答率:${Math.round(p.accuracy * 100)}%`);
    L.push(`  ※この数字は低くて構いません。単元を混ぜて出題する設計(交互練習)のため、`);
    L.push(`  　練習中の正答率は下がりますが本番のテスト成績は上がることが研究で確認されています。`);
  }
  L.push("");

  L.push("■ 教科別の習得度");
  for (const k in sm) {
    if (!sm[k].learned) continue;
    L.push(`・${SUBJECTS[k].name}:${Math.round(sm[k].avgMastery * 100)}%(${sm[k].learned}/${sm[k].total}概念)`);
  }
  L.push("");

  if (w.totalAnswers) {
    L.push("■ 理解の質");
    L.push(`・わかったつもり率:${Math.round(w.overconfidence * 100)}%`);
    L.push(`・最優先の弱点(自信あり×不正解):${w.counts["hi-wrong"]} 件`);
    L.push(`・定着している概念:${w.counts["hi-right"]} 件`);
    L.push("");
  }

  if ((S.grades || []).length) {
    L.push("■ 定期テスト");
    for (const g of S.grades.slice(-6)) {
      L.push(`・${SUBJECTS[g.subject]?.name} ${g.name}:${g.score}点(平均${g.avg}点) → ${g.eval.band} / 推定偏差値 ${g.eval.estHensa}`);
    }
    L.push("");
  }

  const n = calcNaishin(S.naishin || {});
  if (n.filled) { L.push(`■ 内申点:${n.total} / 45(${n.filled}教科入力済み)`); L.push(""); }

  if (S.hensa) {
    const k = toKawaiScale(S.hensa, S.moshiType || "zento");
    L.push("■ 模試");
    L.push(`・${MOSHI_TYPES[S.moshiType || "zento"].name}:偏差値 ${S.hensa}`);
    if (k) {
      L.push(`・大学偏差値表の基準(河合塾)に換算:約 ${k.center}(幅 ${Math.round(k.low)}〜${Math.round(k.high)})`);
      const st = buildStrategy(k.center);
      if (st) {
        if (st.target.length) L.push(`・射程圏の獣医学部:${st.target.slice(0, 4).map((s) => s.name).join("、")}`);
        if (st.safe.length)   L.push(`・安全圏:${st.safe.map((s) => s.name).join("、")}`);
        L.push(`・${st.advice}`);
      }
    }
    L.push("");
  }

  const alerts = detectAlerts(S);
  if (alerts.length) {
    L.push("■ 気づいたこと");
    for (const a of alerts.slice(0, 5)) L.push(`${a.icon} ${a.title}`);
    L.push("");
  }

  if ((S.goals || []).length) {
    L.push("■ 本人が決めた目標");
    for (const g of S.goals.slice(-4)) L.push(`・${g.text}${g.deadline ? `(期限 ${g.deadline})` : ""}`);
    L.push("");
  }

  L.push("― 沙和ナビ(研究にもとづくAI学習システム)で自動生成");
  return L.join("\n");
}

/* ---------------------------------------------------------------
   保護者向けの「今週の一言」— 何を言うべきかまで届ける
   --------------------------------------------------------------- */
function guardianAdvice(S) {
  const p = periodSummary(S, 7);
  const alerts = detectAlerts(S);
  const top = alerts.find((a) => a.level === "alert") || alerts.find((a) => a.level === "warn");
  const good = alerts.find((a) => a.level === "good");

  if (good && !top) return {
    tone: "good", featured: good.title,
    text: `今週は順調です。${good.title}\n\n成果よりも「続けていること」を認める言葉が、次の1週間を支えます。`,
    say: good.say,
  };
  if (top) return { tone: top.level, featured: top.title, text: `${top.title}。\n${top.body}`, say: top.say };
  if (!p.activeDays) return {
    tone: "warn",
    text: "今週はまだ学習の記録がありません。理由を問い詰めるより、事実だけを聞いてください。何かあったのかもしれません。",
    say: "「最近どう?」",
  };
  return {
    tone: "neutral",
    text: `今週は ${p.activeDays}日 学習し、${p.answered}問 解いています。特に問題は見当たりません。`,
    say: "「今日はどこまでやった?」(評価ではなく事実を聞く形で)",
  };
}
