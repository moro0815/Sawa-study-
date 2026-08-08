/* =========================================================================
   app.js — 画面制御とアプリ本体
   ========================================================================= */

const KEY = "sawa-navi-v2";
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

const defaults = () => ({
  apiKey: "", name: "沙和", grade: "中1",
  persona: "sensei",
  mem: {},               // conceptId -> memState
  chat: [],              // 表示用ログ [{who, text, persona, img}]
  apiMessages: [],       // API用の生履歴
  grades: [],            // [{subject, name, score, avg, date, eval}]
  naishin: {},           // subjectId -> 1..5
  hensa: null,
  goals: [],             // [{text, deadline, at}]
  sessions: [],          // [{date, answered, correct}]
  pendingConf: null,     // 確信度の申告待ち
  lastConf: null,
});

let S = load();
let pendingImage = null;
let busy = false;
let mapFilter = "math";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch (_) {}
  return defaults();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (_) {
    S.chat = S.chat.slice(-30); S.apiMessages = S.apiMessages.slice(-20);
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {}
  }
}
function mem(id) { return (S.mem[id] ||= newMemState(id)); }
const today = () => new Date().toISOString().slice(0, 10);

function toast(msg, ms = 2400) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}

/* ═══════════════ ツール実行(AI ⇄ 学習エンジン) ═══════════════ */

async function runTool(name, input) {
  switch (name) {
    case "record_answer": {
      const c = CONCEPT_MAP[input.concept_id];
      if (!c) return { error: "unknown concept_id", hint: "curriculum の概念IDを使ってください" };
      const st = mem(c.id);
      const r = reviewConcept(st, input.grade, input.confidence, Date.now());
      // セッション記録
      const d = today();
      let sess = S.sessions.find((x) => x.date === d);
      if (!sess) { sess = { date: d, answered: 0, correct: 0 }; S.sessions.push(sess); }
      sess.answered++; if (input.correct) sess.correct++;
      save(); renderAll();

      const q = QUADRANTS[r.quadrant];
      if (r.quadrant === "hi-wrong") toast("🚨 わかったつもり発見 — ここが一番伸びる場所です");
      return {
        recorded: c.n, quadrant: r.quadrant, quadrant_name: q.name,
        mastery: Math.round(st.mastery * 100) / 100,
        next_review_in_days: Math.round(r.interval * 10) / 10,
        instruction: r.quadrant === "hi-wrong"
          ? "【重要】自信ありで間違えました。ハイパーコレクション効果が働く最大の学び所です。訂正したあと、必ず同じ型の問題をもう1問すぐに出してください。これをやらないと1週間後に誤りが戻ります。"
          : r.quadrant === "lo-right"
          ? "正解しましたが自信がありませんでした。なぜ合っていたのかを本人に説明させ、確信に変えてください。"
          : r.quadrant === "lo-wrong"
          ? "自信なし・不正解。diagnose_prerequisite で前提を確認することを検討してください。"
          : "定着しています。間隔をあけて維持するだけで十分です。",
      };
    }

    case "diagnose_prerequisite": {
      const c = CONCEPT_MAP[input.concept_id];
      if (!c) return { error: "unknown concept_id" };
      const sus = diagnoseRootCause(c.id, S.mem);
      lastDiagnosis = { target: c.id, suspects: sus };
      renderDiag(c.id);
      if (!sus.length) {
        return { target: c.n, suspects: [], instruction: "前提はすべて習得済みです。この単元そのものの理解に集中してください。" };
      }
      return {
        target: c.n,
        suspects: sus.slice(0, 5).map((x) => ({
          concept_id: x.concept.id, name: x.concept.n, grade: x.concept.g,
          unit: x.concept.u, depth: x.depth,
          mastery: Math.round(x.mastery * 100) / 100, never_studied: x.unknown,
        })),
        instruction: "depth が大きいものほど根に近く、真の原因である可能性が高いです。最も深い候補から短い確認問題を1問ずつ出して、どこが壊れているか特定してください。特定できたらそこを直し、そのあと元の単元に戻ります。",
      };
    }

    case "get_study_queue": {
      const q = buildQueue(S.mem, { limit: input.limit || 8, subjects: input.subject ? [input.subject] : null });
      return {
        interleaved: true,
        note: "単元が連続しないよう並べ替えてあります(交互練習)。本人には『わざと混ぜている』と伝えてください。",
        items: q.map((x) => ({
          concept_id: x.concept.id, name: x.concept.n, subject: SUBJECTS[x.concept.s].name,
          grade: x.concept.g, unit: x.concept.u, kind: x.kind,
          mastery: x.state ? Math.round(x.state.mastery * 100) / 100 : 0,
          retrievability: Math.round(x.R * 100) / 100,
          vet_link: x.concept.vet || null,
        })),
      };
    }

    case "get_status": {
      const sm = subjectMastery(S.mem);
      const w = weaknessSummary(S.mem);
      const dist = S.hensa ? VET_SCHOOLS.map((s) => ({ name: s.name, hensa: s.hensa, ...distanceToSchool(s, S.hensa) })) : null;
      return {
        name: S.name, grade: S.grade,
        subject_mastery: Object.fromEntries(Object.entries(sm).map(([k, v]) =>
          [SUBJECTS[k].name, { 習得済み概念: v.learned, 全概念: v.total, 平均習得度: Math.round(v.avgMastery * 100) + "%" }])),
        weakness: {
          わかったつもり: w.counts["hi-wrong"], 未習得: w.counts["lo-wrong"],
          自信不足: w.counts["lo-right"], 定着: w.counts["hi-right"],
          わかったつもり率: Math.round(w.overconfidence * 100) + "%",
        },
        recent_tests: S.grades.slice(-5).map((g) => ({ 教科: SUBJECTS[g.subject]?.name, テスト: g.name, 点数: g.score, 平均: g.avg, 評価: g.eval.band })),
        naishin: calcNaishin(S.naishin),
        偏差値: S.hensa,
        志望校距離: dist ? dist.slice(0, 5) : "偏差値が未入力です",
        goals: S.goals.slice(-5),
      };
    }

    case "set_goal": {
      S.goals.push({ text: input.text, deadline: input.deadline || null, at: Date.now() });
      save(); renderPlan();
      toast("目標を記録しました");
      return { ok: true, total_goals: S.goals.length };
    }

    default:
      return { error: "unknown tool: " + name };
  }
}

/* ═══════════════ チャット ═══════════════ */

function statusSummary() {
  const sm = subjectMastery(S.mem);
  const w = weaknessSummary(S.mem);
  const lines = [];
  lines.push(`学年:${S.grade} / 記録済みの回答:${w.totalAnswers}回`);
  const parts = Object.entries(sm).filter(([, v]) => v.learned > 0)
    .map(([k, v]) => `${SUBJECTS[k].name} ${Math.round(v.avgMastery * 100)}%(${v.learned}/${v.total})`);
  lines.push(parts.length ? "教科別習得度: " + parts.join(" / ") : "まだ学習記録がありません。まずは軽い診断から始めてください。");
  if (w.hiTotal > 3) lines.push(`わかったつもり率: ${Math.round(w.overconfidence * 100)}%(自信ありと答えた中で実際は不正解だった割合)`);
  if (w.counts["hi-wrong"]) lines.push(`⚠ 最優先の弱点(自信あり×不正解): ${w.items["hi-wrong"].map((c) => c && c.n).filter(Boolean).join("、")}`);
  const q = buildQueue(S.mem, { limit: 5 });
  if (q.length) lines.push("今日の推奨: " + q.map((x) => `${x.concept.n}(${x.kind === "new" ? "新規" : "復習"})`).join(" / "));
  if (S.grades.length) { const g = S.grades.at(-1); lines.push(`直近テスト: ${SUBJECTS[g.subject]?.name} ${g.score}点(平均${g.avg}) → ${g.eval.band}`); }
  if (S.hensa) lines.push(`模試偏差値: ${S.hensa}`);
  if (S.goals.length) lines.push("本人が決めた目標: " + S.goals.slice(-3).map((g) => g.text).join(" / "));
  return lines.join("\n");
}

function addMsg(who, text, opts = {}) {
  const el = document.createElement("div");
  el.className = who === "user" ? "msg user" : who === "err" ? "msg err" : `msg ai ${opts.persona || S.persona}`;
  if (opts.img) { const i = document.createElement("img"); i.src = opts.img; el.appendChild(i); }
  const sp = document.createElement("span"); sp.textContent = text; el.appendChild(sp);
  $("#chat").appendChild(el);
  $("#chat").scrollTop = $("#chat").scrollHeight;
  return sp;
}

function toolLog(name) {
  const map = {
    record_answer: "📝 結果を記録中…",
    diagnose_prerequisite: "🔍 前提をさかのぼって診断中…",
    get_study_queue: "📚 出題候補を選定中(交互練習)…",
    get_status: "📊 学習状況を確認中…",
    set_goal: "🎯 目標を記録中…",
  };
  const el = document.createElement("div");
  el.className = "tool-log"; el.textContent = map[name] || name;
  $("#chat").appendChild(el); $("#chat").scrollTop = $("#chat").scrollHeight;
}

async function send(override) {
  if (busy) return;
  const inp = $("#input");
  const text = (override ?? inp.value).trim();
  if (!text && !pendingImage) return;
  if (!S.apiKey) { addMsg("err", "APIキーが未設定です。「保護者」タブで設定してください。"); go("parent"); return; }

  busy = true; $("#send").disabled = true;

  // 人格の自動提案(押しつけない)
  const suggested = suggestPersona(text);
  if (suggested !== S.persona && !override) {
    const p = PERSONAS[suggested];
    toast(`${p.emoji} ${p.name}(${p.role})に切り替えました`);
    S.persona = suggested; renderPersona();
  }

  let content, imgUrl = null;
  if (pendingImage) {
    content = [
      { type: "image", source: { type: "base64", media_type: pendingImage.mediaType, data: pendingImage.data } },
      { type: "text", text: text || "この問題を一緒に解きたいです。" },
    ];
    imgUrl = pendingImage.previewUrl;
  } else content = text;

  // 確信度が申告済みなら文脈に混ぜる
  let sendText = content;
  if (S.lastConf && typeof content === "string") {
    sendText = `【申告した確信度:${CONFIDENCE[S.lastConf].label}】\n${content}`;
  }

  S.chat.push({ who: "user", text: text || "(画像を送信)", img: imgUrl });
  S.apiMessages.push({ role: "user", content: sendText });
  addMsg("user", text || "(画像を送信)", { img: imgUrl });
  inp.value = ""; inp.style.height = "auto";
  clearPhoto(); S.lastConf = null; $("#confPanel").hidden = true;
  save();

  const thinking = addMsg("ai", `${PERSONAS[S.persona].name}が考えています…`);
  thinking.parentElement.classList.add("think");
  let span = null;

  try {
    const res = await chatWithTools({
      apiKey: S.apiKey,
      system: buildSystemPrompt(S.persona, { name: S.name, grade: S.grade }, statusSummary()),
      messages: S.apiMessages,
      tools: TOOLS,
      onDelta: (t) => {
        if (!span) { thinking.parentElement.remove(); span = addMsg("ai", ""); }
        span.textContent += t; $("#chat").scrollTop = $("#chat").scrollHeight;
      },
      onToolUse: (n) => { if (!span) { thinking.parentElement.remove(); span = null; } toolLog(n); },
      runTool,
    });

    if (!span && res.text) { thinking.parentElement?.remove(); addMsg("ai", res.text); }
    else if (!span) thinking.parentElement?.remove();

    S.apiMessages = res.messages;
    S.chat.push({ who: "ai", text: res.text, persona: S.persona });

    // AIが問題を出したら確信度パネルを開く
    if (/自信|確信|どのくらい/.test(res.text) && /[?？]/.test(res.text)) $("#confPanel").hidden = false;
    save(); renderAll();
  } catch (e) {
    thinking.parentElement?.remove();
    addMsg("err", "⚠ " + (e instanceof ApiError ? e.friendly() : "通信エラーです。接続を確認してください。"));
    S.apiMessages.pop(); S.chat.pop(); save();
  } finally {
    busy = false; $("#send").disabled = false;
  }
}

function clearPhoto() { pendingImage = null; $("#preview").hidden = true; $("#photoIn").value = ""; }

/* ═══════════════ 描画 ═══════════════ */

function renderAll() { renderTop(); renderHome(); renderWeak(); renderGrade(); renderPlan(); renderParent(); }

function renderTop() {
  const sm = subjectMastery(S.mem);
  let learned = 0, total = 0, sum = 0;
  for (const k in sm) { learned += sm[k].learned; total += sm[k].total; sum += sm[k].avgMastery * sm[k].learned; }
  $("#statMastery").textContent = learned ? Math.round((sum / learned) * 100) + "%" : "—";
  const q = buildQueue(S.mem, { limit: 99 }).filter((x) => x.kind === "review");
  $("#statDue").textContent = q.length;
  const w = weaknessSummary(S.mem);
  $("#statAlert").textContent = w.counts["hi-wrong"];
  $("#tbSub").textContent = `${S.name}さん・${S.grade}`;
}

function renderHome() {
  const h = new Date().getHours();
  $("#heroGreet").textContent = h < 10 ? "おはようございます" : h < 18 ? "こんにちは" : "こんばんは";
  const w = weaknessSummary(S.mem);
  const q = buildQueue(S.mem, { limit: 8 });
  $("#heroLine").textContent = w.counts["hi-wrong"]
    ? `最優先の弱点が ${w.counts["hi-wrong"]} 件あります。ここが一番伸びます。`
    : q.length ? `今日の候補を ${q.length} 件そろえました。` : "まずは軽く診断から始めましょう。";

  // 夢との距離
  const gi = Math.max(0, GRADES.indexOf(S.grade));
  const sm = subjectMastery(S.mem);
  let cov = 0, n = 0;
  for (const k in sm) { if (SUBJECTS[k].vetWeight >= 0.7) { cov += sm[k].coverage; n++; } }
  const progress = ((gi / 6) * 0.5 + (n ? cov / n : 0) * 0.5) * 100;
  $("#dreamFill").style.width = Math.min(100, progress) + "%";
  $("#dreamNow").textContent = S.grade;
  const rm = ROADMAP[gi];
  $("#dreamNote").textContent = rm ? `${S.grade}のテーマ:${rm.theme}` : "";

  // 今日やること
  const tl = $("#todayList");
  if (!q.length) tl.innerHTML = `<p class="empty">学習記録がまだありません。学習タブでミミ先生に「診断して」と伝えてください。</p>`;
  else tl.innerHTML = q.slice(0, 6).map((x) => {
    const st = x.state; const flagged = st?.flagged || st?.history.at(-1)?.q === "hi-wrong";
    const badge = flagged ? '<span class="tl-badge alert">要注意</span>'
      : x.kind === "new" ? '<span class="tl-badge new">新規</span>' : '<span class="tl-badge rev">復習</span>';
    const why = flagged ? "自信ありで間違えた場所 — 今なら直りやすい"
      : x.kind === "new" ? "前提が揃ったので学べる"
      : `記憶に残っている割合 ${Math.round(x.R * 100)}%`;
    return `<div class="tl-item">${badge}<div class="tl-name">${esc(x.concept.n)}
      <div class="tl-sub">${SUBJECTS[x.concept.s].emoji} ${esc(x.concept.g)}・${esc(x.concept.u)} — ${why}</div></div></div>`;
  }).join("");

  const units = new Set(q.slice(0, 6).map((x) => x.concept.u));
  $("#interleaveBanner").hidden = units.size < 2;
  $("#todayNote").textContent = q.length ? `${units.size}単元を混ぜています` : "";

  // 人格
  $("#personaPicker").innerHTML = Object.values(PERSONAS).map((p) =>
    `<button class="pp ${S.persona === p.id ? "on" : ""}" data-persona="${p.id}">
      <span class="pp-e">${p.emoji}</span><span class="pp-n">${p.name}</span>
      <span class="pp-r">${p.role}</span><span class="pp-need">${p.need}を支える</span></button>`).join("");
  $$("[data-persona]").forEach((b) => b.onclick = () => {
    S.persona = b.dataset.persona; save(); renderHome(); renderPersona(); go("study");
    if (!S.chat.length) addMsg("ai", PERSONAS[S.persona].intro);
  });

  // 教科別
  $("#subjectBars").innerHTML = Object.entries(sm).map(([k, v]) => {
    const S_ = SUBJECTS[k];
    return `<div class="sbar"><div class="sbar-top"><span>${S_.emoji} ${S_.name}</span>
      <span class="sbar-meta">${v.learned}/${v.total}概念 ・ 習得 ${Math.round(v.avgMastery * 100)}%</span></div>
      <div class="sbar-track"><div class="sbar-cov" style="width:${v.coverage * 100}%"></div>
      <div class="sbar-fill" style="width:${v.coverage * v.avgMastery * 100}%;background:${S_.color}"></div></div></div>`;
  }).join("");
}

function renderPersona() {
  $("#personaBar").innerHTML = Object.values(PERSONAS).map((p) =>
    `<button class="${S.persona === p.id ? "on" : ""}" data-pb="${p.id}" style="${S.persona === p.id ? `color:${p.color}` : ""}">${p.emoji} ${p.name}</button>`).join("");
  $$("[data-pb]").forEach((b) => b.onclick = () => {
    S.persona = b.dataset.pb; save(); renderPersona(); renderHome();
    addMsg("ai", PERSONAS[S.persona].intro);
  });
  const qa = {
    sensei: ["今日の分をやりたい", "この前の復習して", "わからないところを診断して", "テストの準備をしたい"],
    aibou: ["ちょっと聞いてよ", "今日つかれた", "オレに教えて(説明したい)", "学校でこんなことがあった"],
    bansousha: ["今週の計画を立てたい", "テストが不安", "この成績どう思う?", "目標を決めたい"],
  }[S.persona];
  $("#quickRow").innerHTML = qa.map((t) => `<button class="qa">${esc(t)}</button>`).join("");
  $$("#quickRow .qa").forEach((b) => b.onclick = () => send(b.textContent));
}

function renderWeak() {
  const w = weaknessSummary(S.mem);
  const pct = Math.round(w.overconfidence * 100);
  $("#overconfNum").textContent = w.hiTotal >= 3 ? pct + "%" : "—";
  $("#overconfNum").style.color = pct >= 30 ? "var(--red)" : pct >= 15 ? "var(--amber)" : "var(--green)";
  $("#overconfMsg").textContent = w.hiTotal < 3 ? "まだデータが足りません(自信ありの回答が3回以上必要)"
    : pct >= 30 ? "高めです。「わかったつもり」が多い状態。ここを潰すのが最短の伸びしろです。"
    : pct >= 15 ? "標準的です。自信ありの誤りは出たらすぐ再テストしましょう。"
    : "よく自分を把握できています。この状態は本番に強い。";

  $("#quadGrid").innerHTML = ["hi-wrong", "lo-wrong", "lo-right", "hi-right"].map((k) => {
    const q = QUADRANTS[k];
    const items = w.items[k].filter(Boolean).slice(0, 4).map((c) => c.n).join("、");
    return `<div class="qc ${k === "hi-wrong" ? "top" : ""}">
      <div class="qc-h"><span>${q.emoji}</span><span class="qc-n">${q.name}</span><span class="qc-c">${w.counts[k]}</span></div>
      <p class="qc-d">${q.desc}</p>${items ? `<p class="qc-items">${esc(items)}</p>` : ""}</div>`;
  }).join("");

  // 診断セレクト
  const sel = $("#diagSelect");
  if (!sel.dataset.filled) {
    sel.innerHTML = `<option value="">つまずいた単元を選ぶ…</option>` +
      Object.keys(SUBJECTS).map((sid) => `<optgroup label="${SUBJECTS[sid].name}">` +
        conceptsBySubject(sid).map((c) => `<option value="${c.id}">${c.g}・${c.n}</option>`).join("") + `</optgroup>`).join("");
    sel.dataset.filled = "1";
    sel.onchange = () => sel.value && renderDiag(sel.value);
  }

  // 知識マップ
  if (!$("#mapFilter").dataset.filled) {
    $("#mapFilter").innerHTML = Object.entries(SUBJECTS).map(([k, v]) =>
      `<button class="mf ${k === mapFilter ? "on" : ""}" data-mf="${k}">${v.emoji} ${v.name}</button>`).join("");
    $("#mapFilter").dataset.filled = "1";
    $$("[data-mf]").forEach((b) => b.onclick = () => {
      mapFilter = b.dataset.mf;
      $$("[data-mf]").forEach((x) => x.classList.toggle("on", x.dataset.mf === mapFilter));
      renderMap();
    });
  }
  renderMap();
}

function renderMap() {
  const cs = conceptsBySubject(mapFilter);
  const byGrade = {};
  for (const c of cs) (byGrade[c.g] ||= []).push(c);
  $("#knowledgeMap").innerHTML = GRADES.filter((g) => byGrade[g]).map((g) =>
    `<div class="kmap-grade"><div class="kmap-glabel">${g}</div><div class="kmap-cells">` +
    byGrade[g].map((c) => {
      const st = S.mem[c.id];
      let cls = "m0";
      if (st && st.S > 0) {
        if (st.flagged || st.history.at(-1)?.q === "hi-wrong") cls = "m3";
        else cls = st.mastery >= 0.7 ? "m2" : "m1";
      }
      return `<span class="kc ${cls}" data-kc="${c.id}" title="${esc(c.u)}">${esc(c.n)}</span>`;
    }).join("") + `</div></div>`).join("");
  $$("[data-kc]").forEach((el) => el.onclick = () => {
    $("#diagSelect").value = el.dataset.kc; renderDiag(el.dataset.kc);
    $("#diagResult").scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

let lastDiagnosis = null;

function renderDiag(conceptId) {
  const c = CONCEPT_MAP[conceptId];
  if (!c) return;
  const sus = diagnoseRootCause(conceptId, S.mem);
  const st = S.mem[conceptId];
  let html = "";

  if (!sus.length) {
    html = `<div class="diag-verdict">✅ <b>${esc(c.n)}</b> の前提はすべて習得できています。<br>
      つまずいているなら、この単元そのものの理解に集中して大丈夫です。</div>`;
  } else {
    const root = sus[0];
    html = `<div class="diag-verdict">🔍 <b>${esc(c.n)}</b> ができない本当の原因は、<br>
      <b>${esc(root.concept.g)}「${esc(root.concept.n)}」</b>の可能性が高いです(${root.depth}段階さかのぼった位置)。<br>
      ${root.unknown ? "この概念はまだ学習記録がありません。" : `習得度 ${Math.round(root.mastery * 100)}%。`}
      ここを直してから戻ると、上の単元も一気に通ります。</div>`;
    html += `<div class="diag-chain">`;
    html += `<div class="diag-node"><span class="diag-depth">今</span><b>${esc(c.n)}</b>
      <span style="margin-left:auto;font-size:11px;color:var(--ink3)">${st ? Math.round(st.mastery * 100) + "%" : "未学習"}</span></div>`;
    for (const s of sus.slice(0, 5)) {
      html += `<div class="diag-arrow">↑ が土台</div>`;
      html += `<div class="diag-node ${s === root ? "root" : ""}">
        <span class="diag-depth">${s.concept.g}</span>${esc(s.concept.n)}
        <span style="margin-left:auto;font-size:11px;color:var(--ink3)">${s.unknown ? "未学習" : Math.round(s.mastery * 100) + "%"}</span></div>`;
    }
    html += `</div>`;
    html += `<button class="btn btn-primary" id="askDiag">この診断をミミ先生に相談する</button>`;
  }
  $("#diagResult").innerHTML = html;
  const btn = $("#askDiag");
  if (btn) btn.onclick = () => {
    S.persona = "sensei"; renderPersona(); go("study");
    send(`「${c.n}」がわかりません。診断だと「${sus[0].concept.n}」(${sus[0].concept.g})が原因かもしれないそうです。そこから確認したいです。`);
  };
}

function renderGrade() {
  // 教科セレクト
  const gs = $("#gSubject");
  if (!gs.dataset.filled) {
    gs.innerHTML = Object.entries(SUBJECTS).filter(([k]) => k !== "info")
      .map(([k, v]) => `<option value="${k}">${v.emoji} ${v.name}</option>`).join("");
    gs.dataset.filled = "1";
  }

  // 履歴
  const gh = $("#gradeHistory");
  if (!S.grades.length) gh.innerHTML = `<p class="empty">まだ記録がありません。</p>`;
  else gh.innerHTML = S.grades.slice().reverse().slice(0, 12).map((g, i, arr) => {
    const prev = S.grades.filter((x) => x.subject === g.subject);
    const idx = prev.indexOf(g);
    const before = idx > 0 ? prev[idx - 1] : null;
    const d = before ? (g.score - before.avg) - (before.score - before.avg) : null;
    const dz = before ? Math.round((g.eval.estHensa - before.eval.estHensa) * 10) / 10 : null;
    return `<div class="gh-item"><span class="gh-sub">${SUBJECTS[g.subject]?.emoji || ""}</span>
      <div class="gh-main"><div>${esc(SUBJECTS[g.subject]?.name || "")} ${esc(g.name)}</div>
      <div class="gh-meta">${g.date} ・ 平均${g.avg}点 ・ 推定偏差値 ${g.eval.estHensa}</div></div>
      <div class="gh-right"><span class="gh-score">${g.score}点</span>
      ${dz != null ? `<span class="gh-delta ${dz > 0.5 ? "up" : dz < -0.5 ? "down" : "flat"}">偏差値 ${dz > 0 ? "+" : ""}${dz}</span>`
        : `<span class="gh-delta flat">初回</span>`}</div></div>`;
  }).join("");

  // 内申
  $("#naishinGrid").innerHTML = NAISHIN_SUBJECTS.map((s) =>
    `<div class="ng"><div class="ng-n">${s.name}</div>
      <select class="ng-sel" data-naishin="${s.id}">
      <option value="">—</option>${[1,2,3,4,5].map((v) => `<option value="${v}" ${S.naishin[s.id] == v ? "selected" : ""}>${v}</option>`).join("")}
      </select></div>`).join("");
  $$("[data-naishin]").forEach((el) => el.onchange = () => {
    const v = el.value ? Number(el.value) : undefined;
    if (v) S.naishin[el.dataset.naishin] = v; else delete S.naishin[el.dataset.naishin];
    save(); renderGrade();
  });
  const n = calcNaishin(S.naishin);
  $("#naishinTotal").textContent = n.filled ? n.total : "—";

  $("#hensaNow").textContent = S.hensa ? `現在の登録:偏差値 ${S.hensa}` : "偏差値を入れると、志望校との距離が計算されます。";
  if ($("#hensaIn") && S.hensa && !$("#hensaIn").value) $("#hensaIn").value = S.hensa;

  // 限界効用
  const testScores = {};
  for (const g of S.grades) testScores[g.subject] = g.score;
  const mr = marginalReturn(S.mem, testScores);
  const max = mr[0]?.score || 1;
  $("#marginalList").innerHTML = mr.map((m, i) =>
    `<div class="mr-item"><span class="mr-rank">${i + 1}</span>
      <div class="mr-body"><div class="mr-name">${m.emoji} ${m.name}</div><div class="mr-reason">${m.reason}</div></div>
      <div class="mr-bar"><i style="width:${(m.score / max) * 100}%"></i></div></div>`).join("");

  // 志望校
  $("#schoolList").innerHTML = VET_SCHOOLS.map((s) => {
    const d = distanceToSchool(s, S.hensa);
    return `<div class="school"><div class="sc-body">
      <div class="sc-name">${esc(s.name)} <span class="sc-type">${s.type}</span></div>
      <div class="sc-fac">${esc(s.faculty)} ・ ${s.pref}${s.kyotsu ? ` ・ 共テ${s.kyotsu}%` : ""}</div>
      <div class="sc-fac">${esc(s.note)}</div></div>
      <div style="text-align:right"><div class="sc-h">${s.hensa}</div>
      ${d ? `<span class="sc-status" style="background:${d.color}">${d.status} ${d.gap > 0 ? "+" + d.gap : d.gap}</span>` : ""}</div></div>`;
  }).join("");
}

function renderPlan() {
  const gi = Math.max(0, GRADES.indexOf(S.grade));
  $("#roadmap").innerHTML = ROADMAP.map((r, i) =>
    `<div class="rm ${i === gi ? "now open" : ""}" data-rm="${i}">
      <div class="rm-h"><span class="rm-g">${r.grade}</span><span class="rm-t">${esc(r.theme)}</span></div>
      <div class="rm-body"><ul>${r.goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
      <div class="rm-why">なぜ:${esc(r.why)}</div></div></div>`).join("");
  $$("[data-rm]").forEach((el) => el.querySelector(".rm-h").onclick = () => el.classList.toggle("open"));

  $("#goalList").innerHTML = S.goals.length
    ? S.goals.slice().reverse().map((g) => `<div class="goal">🎯 <div><div>${esc(g.text)}</div>
        ${g.deadline ? `<div style="font-size:10.5px;color:var(--ink3)">期限 ${esc(g.deadline)}</div>` : ""}</div></div>`).join("")
    : `<p class="empty">まだありません。ナギ(伴走者)と話しながら決めてみてください。</p>`;
}

function renderKyotsu() {
  const rate = Number($("#targetRate").value) || 78;
  const k = kyotsuTargets(rate);
  $("#kyotsuTable").innerHTML = `<table class="kt"><thead><tr><th>科目</th><th>配点</th><th>目標</th></tr></thead><tbody>` +
    k.perSubject.map((s) => `<tr><td>${esc(s.name)}${s.note ? `<div class="kt-note">${esc(s.note)}</div>` : ""}</td>
      <td>${s.score}</td><td>${s.target}</td></tr>`).join("") +
    `<tr><td><b>合計</b></td><td><b>${k.total}</b></td><td><b>${k.needed}</b></td></tr></tbody></table>`;
}

function renderParent() {
  // 週次レポート
  const wk = Date.now() - 7 * 86400000;
  const sess = S.sessions.filter((s) => new Date(s.date).getTime() >= wk);
  const answered = sess.reduce((a, s) => a + s.answered, 0);
  const correct = sess.reduce((a, s) => a + s.correct, 0);
  const days = sess.length;
  const w = weaknessSummary(S.mem);
  const newly = Object.values(S.mem).filter((m) => m.last && m.last >= wk && m.mastery >= 0.7).length;

  $("#weeklyReport").innerHTML = `
    <div class="wr-row"><span>学習した日数</span><b>${days} 日 / 7日</b></div>
    <div class="wr-row"><span>答えた問題数</span><b>${answered} 問</b></div>
    <div class="wr-row"><span>練習中の正答率</span><b>${answered ? Math.round((correct / answered) * 100) : "—"}%</b></div>
    <div class="wr-row"><span>新しく習得した概念</span><b>${newly} 個</b></div>
    <div class="wr-row"><span>最優先の弱点</span><b>${w.counts["hi-wrong"]} 件</b></div>
    <div class="wr-msg">
      <b>この数字の読み方</b><br>
      練習中の正答率は<b>低くて構いません</b>。このアプリは単元をわざと混ぜて出題しており(交互練習)、
      研究では練習中の正答率が 89%→60% に下がる一方、本番のテスト成績は約2倍になることが確認されています。
      正答率ではなく<b>「学習した日数」と「新しく習得した概念」</b>を見てあげてください。<br><br>
      ${days >= 4 ? "今週はよく続けられています。継続そのものを言葉にして認めてあげてください。"
        : days >= 1 ? "少しでも机に向かえた日があります。まずそこを認めるところから始めてください。"
        : "今週は記録がありません。責めずに「何かあった?」と事実を聞くところから。理由が語られたら、それを否定しないでください。"}
    </div>`;

  // 根拠一覧
  $("#evidenceList").innerHTML = EVIDENCE.map((e, i) => {
    const cls = /非常に強い|強い/.test(e.strength) && !/否定/.test(e.strength) ? "strong"
      : /否定/.test(e.strength) ? "weak" : "mid";
    return `<div class="ev" data-ev="${i}">
      <div class="ev-h"><span class="ev-t">${esc(e.title)}</span><span class="ev-s ${cls}">${esc(e.strength)}</span></div>
      <div class="ev-body"><div class="ev-en">${esc(e.en)}</div>
        <p style="margin-top:5px">${esc(e.finding)}</p>
        <div class="ev-rule"><b>→ このアプリでの実装:</b> ${esc(e.rule)}</div>
        <div class="ev-src">出典:${esc(e.source)}</div></div></div>`;
  }).join("");
  $$("[data-ev]").forEach((el) => el.querySelector(".ev-h").onclick = () => el.classList.toggle("open"));
}

/* ═══════════════ ナビゲーション ═══════════════ */
function go(screen) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $("#s-" + screen).classList.add("active");
  $$(".nb").forEach((b) => b.classList.toggle("active", b.dataset.go === screen));
  if (screen === "study") setTimeout(() => ($("#chat").scrollTop = $("#chat").scrollHeight), 60);
  window.scrollTo(0, 0);
}

/* ═══════════════ 初期化 ═══════════════ */
function init() {
  // 設定
  $("#apiKey").value = S.apiKey;
  $("#pName").value = S.name;
  $("#pGrade").innerHTML = GRADES.map((g) => `<option ${S.grade === g ? "selected" : ""}>${g}</option>`).join("");

  // ナビ
  $$(".nb").forEach((b) => b.onclick = () => go(b.dataset.go));
  $("#startStudy").onclick = () => { S.persona = "sensei"; renderPersona(); go("study"); send("今日の分をやりたいです。まず何から?"); };

  // チャット
  $("#send").onclick = () => send();
  $("#input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  $("#input").addEventListener("input", (e) => {
    e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 110) + "px";
  });
  $$(".conf-btn").forEach((b) => b.onclick = () => {
    S.lastConf = Number(b.dataset.conf);
    $("#confPanel").hidden = true;
    toast(`確信度「${CONFIDENCE[S.lastConf].label}」を記録。答えをどうぞ`);
    $("#input").focus();
  });

  // 写真
  $("#photoIn").onchange = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      pendingImage = await processImage(f);
      $("#previewImg").src = pendingImage.previewUrl; $("#preview").hidden = false; go("study");
    } catch (_) { toast("画像を読み込めませんでした"); }
  };
  $("#rmPhoto").onclick = clearPhoto;

  // 成績
  $("#addGrade").onclick = () => {
    const score = Number($("#gScore").value), avg = Number($("#gAvg").value);
    if (!score && score !== 0) return toast("点数を入れてください");
    if (!avg) return toast("平均点を入れてください");
    const ev = evaluateTest(score, avg);
    const g = { subject: $("#gSubject").value, name: $("#gName").value || "テスト", score, avg, date: today(), eval: ev };
    S.grades.push(g); save();
    $("#gradeResult").innerHTML = `<div class="gr-box"><div class="gr-band">${ev.band}(推定偏差値 ${ev.estHensa})</div>
      <div class="gr-line">平均との差 ${ev.diff > 0 ? "+" : ""}${ev.diff}点 — ${esc(ev.comment)}</div></div>`;
    $("#gScore").value = ""; $("#gAvg").value = ""; $("#gName").value = "";
    renderGrade(); toast("記録しました");
  };
  $("#saveHensa").onclick = () => {
    const v = Number($("#hensaIn").value);
    if (!v) return toast("偏差値を入れてください");
    S.hensa = v; save(); renderGrade(); toast("記録しました");
  };
  $("#calcTarget").onclick = renderKyotsu;

  // 設定保存
  $("#saveSettings").onclick = () => {
    S.apiKey = $("#apiKey").value.trim();
    S.name = $("#pName").value.trim() || "沙和";
    S.grade = $("#pGrade").value;
    save(); renderAll();
    $("#settingsMsg").textContent = "保存しました";
    setTimeout(() => ($("#settingsMsg").textContent = ""), 2500);
  };

  // データ
  $("#exportData").onclick = () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sawa-navi-${today()}.json`; a.click();
    URL.revokeObjectURL(a.href);
  };
  $("#importData").onchange = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { S = { ...defaults(), ...JSON.parse(r.result) }; save(); location.reload(); }
      catch (_) { toast("読み込めませんでした"); }
    };
    r.readAsText(f);
  };
  $("#resetChat").onclick = () => {
    if (!confirm("会話履歴だけを消します。学習データ・成績は残ります。")) return;
    S.chat = []; S.apiMessages = []; save(); location.reload();
  };
  $("#resetAll").onclick = () => {
    if (!confirm("すべてのデータ(学習記録・成績・会話)を消します。取り消せません。")) return;
    localStorage.removeItem(KEY); location.reload();
  };

  // 復元
  for (const m of S.chat.slice(-40)) addMsg(m.who, m.text, { img: m.img, persona: m.persona });
  if (!S.chat.length) {
    $("#chat").innerHTML = `<div class="hint">話す相手を選んで、話しかけてみてください。<br>
      宿題や問題集は <b>📷</b> から写真で送れます。<br><br>
      ミミ先生🐰 = 教える人 / コタロー🐕 = 友だち / ナギ🦉 = 伴走者</div>`;
  }

  renderPersona(); renderKyotsu(); renderAll();

  if (!S.apiKey) {
    go("parent");
    $("#settingsMsg").textContent = "はじめに、おうちの方がAPIキーを設定してください";
  }
}

init();
