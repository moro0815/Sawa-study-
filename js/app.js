/* =========================================================================
   app.js — 画面制御とアプリ本体
   ========================================================================= */

/* HTTPSでないと、オフライン起動も共有シートも動かない。
   以前は .htaccess で転送していたが、更新のたびに上書きすると
   サーバー側のパスワード設定が消えるため、ここで行う。 */
if (location.protocol === "http:" && !/^(localhost|127\.|\[?::1)/.test(location.hostname)) {
  location.replace("https://" + location.host + location.pathname + location.search + location.hash);
}

const KEY = "sawa-navi-v2";
const BKEY = "sawa-navi-backups";      // 端末内の自動バックアップ
const MAX_BACKUPS = 12;
/* アップロードが反映されたか確認するための版数。sw.js の CACHE と揃えること */
const APP_VERSION = "v9";
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));

const defaults = () => ({
  provider: "anthropic",       // どのAIを使うか
  model: "",                   // 空ならプロバイダの既定モデル
  apiKeys: {},                 // provider -> APIキー(切り替えても消えない)
  baseUrl: "",                 // OpenAI互換のときだけ使う
  name: "沙和", grade: "中1",
  persona: "sensei",
  mem: {},               // conceptId -> memState
  chat: [],              // 表示用ログ [{who, text, persona, img}]
  apiMessages: [],       // API用の生履歴
  grades: [],            // [{subject, name, score, avg, date, eval}]
  naishin: {},           // subjectId -> 1..5
  hensa: null,           // 模試の偏差値(生の値)
  moshiType: "zento",    // どの模試か — 換算に必要
  hensaLog: [],          // [{value, type, kawai, date}]
  hyotei: {},            // 高校の評定平均 {ラベル: 値}
  dailyMinutes: null,    // 1日の学習時間(分)
  goals: [],             // [{text, deadline, at}]
  homework: [],          // [{id, source, title, items, due, ...}] 学校ぶん＋AIぶん
  sessions: [],          // [{date, answered, correct, minutes}]
  career: DEFAULT_CAREER,      // 今の志望(変数。固定しない)
  dreamHistory: [],            // [{career, at, note}] 過去の夢も消さずに残す
  careerInterests: [],         // 気になっている進路
  theme: null,                 // null なら学年に応じて自動
  startedAt: null,             // 使い始めた日
  seenMilestones: [],
  letters: [],                 // [{text, writtenAt, openAt, opened}]
  costSchool: "hokudai",
  parentPeriod: 7,
  lastBackupAt: null,        // 端末の外へ書き出した最後の日時
  srvToken: "",              // サーバー自動バックアップの合言葉
  srvLastAt: null,           // 最後にサーバーへ預けた日時
  srvLastError: "",
  pendingConf: null,
  lastConf: null,
});

let S = load();
let pendingFiles = [];   // 送信待ちの写真・スキャン(複数可)
let busy = false;
let mapFilter = "math";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = { ...defaults(), ...JSON.parse(raw) };
      // 旧バージョン(Claude固定・apiKey単体)からの引き継ぎ
      if (s.apiKey && !s.apiKeys.anthropic) s.apiKeys.anthropic = s.apiKey;
      delete s.apiKey;
      return s;
    }
  } catch (_) {}
  return defaults();
}

/* ── 現在のAI設定 ── */
function curProvider() { return providerOf(S.provider); }
function curModel() { return S.model || curProvider().defaultModel; }
function curKey() { return (S.apiKeys && S.apiKeys[S.provider]) || ""; }
function curBaseUrl() { return S.baseUrl || curProvider().defaultBaseUrl || ""; }
let lastAutoBackup = 0;
function save() {
  // 5分に1回、その日のひかえを最新の状態に更新する
  if (Date.now() - lastAutoBackup > 5 * 60000) {
    lastAutoBackup = Date.now();
    try { takeBackup(); } catch (_) {}
    try { scheduleServerBackup(); } catch (_) {}
  }
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (_) {
    S.chat = S.chat.slice(-30); S.apiMessages = S.apiMessages.slice(-20);
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {}
  }
}
/* ═══════════════ バックアップ ═══════════════
   沙和さんの記録が消えることは、このアプリで最も避けたい事故。
   3段構えで守る。
     1. 端末内に毎日1回、自動でひかえを取る(最大12件)
     2. 「すべて消す」の直前にも必ずひかえを取る
     3. iCloud等に保存できるファイルを書き出す(共有シート)
   会話履歴は容量を食うわりに失っても困らないので、ひかえには入れない。 */

/**
 * ひかえに入れる中身。
 * secrets:false のときは APIキーと合言葉を外す。
 * 端末の外(ファイル・サーバー)へ出すものに認証情報を混ぜないため。
 */
function backupPayload(secrets = true) {
  const { chat, apiMessages, ...rest } = S;
  if (secrets) return rest;
  const { apiKeys, srvToken, ...safe } = rest;
  return safe;
}

function loadBackups() {
  try { return JSON.parse(localStorage.getItem(BKEY)) || []; } catch (_) { return []; }
}

function writeBackups(list) {
  while (list.length) {
    try { localStorage.setItem(BKEY, JSON.stringify(list)); return true; }
    catch (_) { list.shift(); }             // 容量が足りなければ古いものから捨てる
  }
  try { localStorage.removeItem(BKEY); } catch (_) {}
  return false;
}

/**
 * ひかえを取る。1日1件だが、その日のぶんは【最新の状態で上書きする】。
 * 起動時の1回きりにすると、その日の勉強がまるごと失われるため。
 * label 付き(消す前など)は日付が同じでも別に残す。
 */
function takeBackup(label) {
  const list = loadBackups();
  const d = todayISO();
  if (!label) {
    const i = list.findIndex((b) => b.date === d && !b.label);
    if (i >= 0) list.splice(i, 1);          // 今日のぶんは作り直す
  }
  list.push({ date: d, at: Date.now(), label: label || "", data: backupPayload() });
  while (list.length > MAX_BACKUPS) {
    const i = list.findIndex((b) => !b.label);      // 手動のひかえは優先して残す
    list.splice(i >= 0 ? i : 0, 1);
  }
  return writeBackups(list);
}

/** ひかえから戻す。会話履歴は今のものを残す */
function restoreBackup(i) {
  const b = loadBackups()[i];
  if (!b) return false;
  takeBackup("戻す前");
  S = { ...defaults(), ...b.data, chat: S.chat, apiMessages: [] };
  save();
  return true;
}

/** 書き出すファイルの中身 */
function backupFile() {
  return JSON.stringify({
    app: "sawa-navi", version: APP_VERSION, savedAt: new Date().toISOString(),
    name: S.name, grade: S.grade, data: backupPayload(false),
  }, null, 2);
}

function backupFileName() { return `沙和ナビ-バックアップ-${todayISO()}.json`; }

/** 共有シート(iCloud/ファイルに保存)に出す。使えなければダウンロード */
async function shareBackup() {
  const text = backupFile();
  const file = new File([text], backupFileName(), { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "沙和ナビのバックアップ" });
      S.lastBackupAt = Date.now(); save(); renderBackup();
      return "shared";
    } catch (e) { if (e?.name === "AbortError") return "cancel"; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = backupFileName(); a.click();
  URL.revokeObjectURL(a.href);
  S.lastBackupAt = Date.now(); save(); renderBackup();
  return "downloaded";
}

/** 読み込み。新旧どちらの形式でも受け取る */
function applyBackupText(txt) {
  const j = JSON.parse(txt);
  const data = (j && j.app === "sawa-navi" && j.data) ? j.data : j;
  if (!data || typeof data !== "object" || !("mem" in data)) throw new Error("形式が違います");
  takeBackup("読み込み前");
  const keys = S.apiKeys, tok = S.srvToken;      // 認証情報は今のものを引き継ぐ
  S = { ...defaults(), ...data, chat: [], apiMessages: [] };
  if (!Object.keys(S.apiKeys || {}).length) S.apiKeys = keys;
  if (!S.srvToken) S.srvToken = tok;
  save();
}

/* ── サーバーへの自動バックアップ ────────────────────────
   エックスサーバーに api/backup.php を置いてあるときだけ動く。
   端末がこわれても機種変更しても記録が残るよう、静かに預ける。 */

function srvUrl() {
  return location.href.replace(/[^/]*$/, "") + "api/backup.php";
}

async function srvFetch(action, opts = {}) {
  const res = await fetch(`${srvUrl()}?a=${action}${opts.query || ""}`, {
    method: opts.body ? "POST" : "GET",
    headers: { ...(S.srvToken ? { "X-Sawa-Token": S.srvToken } : {}),
               ...(opts.body ? { "content-type": "application/json" } : {}) },
    body: opts.body,
    cache: "no-store",
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  if (!res.ok) throw new Error(json?.error || `サーバーが応答しません (${res.status})`);
  return opts.raw ? text : json;
}

/** 置いてあるかどうかの確認 */
async function srvPing() {
  try { const j = await srvFetch("ping"); return j?.version ? j : null; }
  catch (_) { return null; }
}

/** 初回設定。合言葉をサーバーに作ってもらって受け取る */
async function srvSetup() {
  const j = await srvFetch("init");
  S.srvToken = j.token; S.srvLastError = ""; save();
  return j.token;
}

/** 預ける。失敗しても画面の邪魔をしない */
async function srvBackup(silent = true) {
  if (!S.srvToken) return false;
  try {
    const body = JSON.stringify({
      app: "sawa-navi", version: APP_VERSION, savedAt: new Date().toISOString(),
      name: S.name, grade: S.grade, data: backupPayload(false),
    });
    await srvFetch("save", { body });
    S.srvLastAt = Date.now(); S.srvLastError = "";
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {}
    if (!silent) renderBackup();
    return true;
  } catch (e) {
    S.srvLastError = String(e.message || e);
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {}
    if (!silent) renderBackup();
    return false;
  }
}

let srvTimer = 0;
/** 変化があったら、間をおいて自動で預ける */
function scheduleServerBackup() {
  if (!S.srvToken) return;
  const since = Date.now() - (S.srvLastAt || 0);
  if (since < 30 * 60000) return;              // 30分に1回まで
  clearTimeout(srvTimer);
  srvTimer = setTimeout(() => srvBackup(true), 8000);   // 操作が落ち着いてから
}

function daysSinceBackup() {
  return S.lastBackupAt ? Math.floor((Date.now() - S.lastBackupAt) / 864e5) : null;
}

function mem(id) { return (S.mem[id] ||= newMemState(id)); }
const today = () => new Date().toISOString().slice(0, 10);

/** 今の学年の段階設定 */
function stage() { return stageOf(S.grade); }

/** テーマ(未設定なら学年に応じた既定) */
function themeId() { return S.theme || stage().theme; }

/** 段階に応じて、見せる/隠すを切り替える */
function applyStage() {
  const st = stage();
  const show = (id, on) => { const el = $(id); if (el) el.hidden = !on; };
  show("#cardCountdown", st.showExamCountdown);
  show("#cardStrategy",  st.showStrategy);
  show("#cardCost",      st.showCost);
  show("#cardCalendar",  st.showExamCountdown);
  show("#cardKyotsu",    st.showAdmissionTypes);
  show("#cardAdmission", st.showAdmissionTypes);
  show("#cardTime",      st.showExamCountdown);
  show("#cardHensa",     st.showHensa);
  show("#cardSchools",   st.showHensa);
  show("#cardHyotei",    st.showAdmissionTypes);
  // トップバーの「要注意」は中学生のうちは出さない(プレッシャーになる)
  const alertStat = $("#statAlert")?.parentElement;
  if (alertStat) alertStat.style.display = st.showExamCountdown ? "" : "none";
  const t = THEMES[themeId()];
  const logo = $("#tbLogo"); if (logo && t) logo.textContent = t.emoji;
  const sub = $("#tbSub"); if (sub) sub.textContent = `${S.name}さん・${S.grade}・${st.label}`;
}

/** 今の志望 */
function curCareer() { return CAREER_MAP[S.career] || CAREER_MAP[DEFAULT_CAREER]; }

/** 志望を変える。変更は「成長」として記録し、絶対に引き止めない */
function setCareer(id, note) {
  const to = CAREER_MAP[id]; if (!to) return null;
  const fromId = S.career;
  if (!S.dreamHistory.length) S.dreamHistory.push({ career: fromId, at: Date.now(), note: "最初の志望" });
  if (fromId === id) { save(); return null; }
  const msg = dreamChangeMessage(fromId, id, S.mem);
  S.career = id;
  S.dreamHistory.push({ career: id, at: Date.now(), note: note || "" });
  save(); renderAll();
  return msg;
}

/** 志望校との比較は必ず河合塾(全統)基準に換算した値で行う */
function kawaiHensa() {
  if (S.hensa == null) return null;
  const k = toKawaiScale(S.hensa, S.moshiType || "zento");
  return k ? k.center : null;
}

/* ── 学習時間の計測 ── */
let timer = { on: false, start: 0, elapsed: 0, tick: null };
function todaySession() {
  const d = today();
  let s = S.sessions.find((x) => x.date === d);
  if (!s) { s = { date: d, answered: 0, correct: 0, minutes: 0 }; S.sessions.push(s); }
  if (s.minutes == null) s.minutes = 0;
  return s;
}
function fmtTime(ms) {
  const t = Math.floor(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
function toggleTimer() {
  if (timer.on) {
    const add = Date.now() - timer.start;
    timer.elapsed += add;
    todaySession().minutes += Math.round(add / 60000);
    timer.on = false; clearInterval(timer.tick); save(); renderParent();
    $("#timerBtn").textContent = "▶ 計測開始";
    toast(`${Math.round(add / 60000)}分を記録しました`);
  } else {
    timer.on = true; timer.start = Date.now();
    $("#timerBtn").textContent = "⏸ 停止";
    timer.tick = setInterval(() => {
      $("#timerText").textContent = "学習時間 " + fmtTime(timer.elapsed + (Date.now() - timer.start));
    }, 1000);
  }
}

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

    case "get_homework": {
      const open = openAssignments(S.homework);
      return {
        summary: homeworkSummary(S.homework, S.dailyMinutes),
        difficulty: difficultyAdvice(S.homework),
        target_accuracy: TARGET_ACCURACY,
        remaining_minutes: remainingMinutes(S.homework, S.dailyMinutes),
        due_today: dueTodayAssignments(S.homework).map((a) => a.id),
        open: open.map((a) => ({
          homework_id: a.id, source: a.source, title: a.title, due: a.due,
          minutes: a.minutes || estimateMinutes(a),
          progress: assignmentProgress(a),
          items: a.items.map((i) => ({ n: i.n, q: i.q, status: i.status, correct: i.correct, concept_id: i.conceptId })),
        })),
        note: "残り時間が5分未満なら新しい宿題を出さないでください。stuck の問題があれば最優先で説明してください。",
      };
    }

    case "suggest_homework_items": {
      const cands = homeworkCandidates(S.mem, { limit: input.limit || 6, subject: input.subject });
      return {
        candidates: cands,
        difficulty: difficultyAdvice(S.homework),
        note: "復習を約2/3、新規を約1/3にし、単元が連続しないよう並べてあります。この順のまま出題してください。",
      };
    }

    case "assign_homework": {
      const rest = remainingMinutes(S.homework, S.dailyMinutes);
      if (rest < MIN_AI_MINUTES) {
        return { assigned: false, reason: "no_time",
          message: `今日の残り時間が${rest}分しかありません。宿題は出さず、「今日は学校のぶんで十分」と伝えてください。` };
      }
      const items = (input.items || []).slice(0, MAX_AI_ITEMS);
      if (!items.length) return { assigned: false, reason: "no_items", message: "items が空です。" };
      const a = newAssignment({
        source: "ai", title: input.title, subject: input.subject,
        minutes: Math.min(input.minutes || Math.round(items.length * 2.5), rest),
        due: addDaysISO(input.due_in_days ?? 0),
        reason: input.reason,
        conceptIds: items.map((i) => i.concept_id).filter(Boolean),
        items: items.map((i) => ({ q: i.q, hint: i.hint, conceptId: i.concept_id })),
      });
      S.homework.push(a); save(); renderAll();
      toast("📝 宿題が届きました");
      return { assigned: true, homework_id: a.id, count: a.items.length, due: a.due, minutes: a.minutes };
    }

    case "record_school_homework": {
      const items = (input.items || []).slice(0, 30);
      if (!items.length) return { recorded: false, message: "items が空です。読み取れた問題を入れてください。" };
      const a = newAssignment({
        source: "school", title: input.title, subject: input.subject,
        due: addDaysISO(input.due_in_days ?? 0), note: input.note,
        conceptIds: items.map((i) => i.concept_id).filter(Boolean),
        items: items.map((i) => ({ q: i.q, conceptId: i.concept_id })),
      });
      S.homework.push(a); save(); renderAll();
      toast("📚 学校の宿題を登録しました");
      return {
        recorded: true, homework_id: a.id, count: a.items.length, due: a.due,
        remaining_minutes_after: remainingMinutes(S.homework, S.dailyMinutes),
        note: "登録しました。いきなり答えを教えず、1問目から一緒に進めてください。",
      };
    }

    case "record_homework_result": {
      const a = S.homework.find((x) => x.id === input.homework_id);
      if (!a) return { error: "unknown homework_id", hint: "get_homework で今の宿題IDを確認してください" };
      const it = a.items.find((x) => x.n === input.item_n);
      if (!it) return { error: "unknown item_n", total: a.items.length };
      it.status = input.status;
      if (input.correct != null) it.correct = input.correct;
      if (input.confidence != null) it.confidence = input.confidence;
      const p = assignmentProgress(a);
      // stuck が残っているうちは終わりにしない
      if (p.done === p.total && !a.doneAt) { a.doneAt = Date.now(); toast("✅ 宿題おわり!"); }
      save(); renderAll();
      return {
        ok: true, progress: p, finished: !!a.doneAt,
        next_difficulty: a.doneAt ? difficultyAdvice(S.homework) : null,
      };
    }

    case "get_status": {
      const sm = subjectMastery(S.mem);
      const w = weaknessSummary(S.mem);
      const kh = kawaiHensa();
      const dist = kh ? VET_SCHOOLS.map((s) => ({ name: s.name, hensa: s.hensa, ...distanceToSchool(s, kh) })) : null;
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
        模試: S.hensa ? `${MOSHI_TYPES[S.moshiType]?.name} 偏差値${S.hensa}(河合塾換算 約${kh})` : "未入力",
        高校の評定平均: calcHyoteiHeikin(S.hyotei),
        受験まで: countdownToExam(S.grade),
        志望校距離: dist ? dist.slice(0, 5) : "偏差値が未入力です",
        goals: S.goals.slice(-5),
      };
    }

    case "change_career": {
      const c = CAREER_MAP[input.career_id];
      if (!c) return { error: "unknown career_id", available: CAREERS.map((x) => x.id) };
      if (input.interest_only) {
        if (!S.careerInterests.includes(c.id)) S.careerInterests.push(c.id);
        save(); renderAll();
        return { added_to_interests: c.name,
          instruction: "「気になるリスト」に入れました。まだ決めなくていいと伝えてください。迷っている状態は健全です。" };
      }
      const msg = setCareer(c.id, input.note);
      toast(`志望を「${c.name}」に変えました`);
      return msg ? {
        changed: msg.headline,
        transfer_rate: Math.round((msg.rate ?? 0) * 100) + "%",
        subjects_to_add: msg.up.map((x) => x.name),
        subjects_less_needed: msg.down.map((x) => x.name),
        instruction:
          "【重要】引き止めない、疑わない、理由を問い詰めない。まず『そう思えるようになったんだね』と変化そのものを認めてください。" +
          `そのうえで、これまでの学習の約${Math.round((msg.rate ?? 0) * 100)}%が新しい進路にも活きることを具体的に伝え、無駄になっていないと安心させてください。` +
          "前の夢を否定したり、蒸し返したりしないこと。",
      } : { changed: c.name };
    }

    case "explore_careers": {
      const tm = transferMap(S.mem, S.career);
      return {
        current: curCareer().name,
        note: "迷っている状態は健全な探索です。決めさせようとしないでください。",
        careers: CAREERS.filter((c) => !input.field || c.field.includes(input.field)).map((c) => ({
          id: c.id, name: c.name, field: c.field, faculty: c.faculty,
          key_subjects: c.key, desc: c.desc, high_school: c.hs,
          transfer_rate: c.id === S.career ? "現在の志望"
            : Math.round((tm.find((t) => t.career.id === c.id)?.rate ?? 0) * 100) + "%",
        })),
        exploration_questions: EXPLORATION_PROMPTS,
        instruction: "転用率(transfer_rate)は、今まで積み上げた学習がその進路にどれだけ活きるかです。ほとんどが高い数字になります。『変えても無駄にならない』ことを伝える材料に使ってください。",
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
  if (!text && !pendingFiles.length) return;
  if (!curKey()) { addMsg("err", "APIキーが未設定です。「保護者」タブで設定してください。"); go("parent"); return; }

  busy = true; $("#send").disabled = true;

  // 人格の自動提案(押しつけない)
  const suggested = suggestPersona(text);
  if (suggested !== S.persona && !override) {
    const p = PERSONAS[suggested];
    toast(`${p.emoji} ${p.name}(${p.role})に切り替えました`);
    S.persona = suggested; renderPersona();
  }

  let content, imgUrl = null;
  if (pendingFiles.length) {
    content = pendingFiles.map((f) => f.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } }
      : { type: "image", source: { type: "base64", media_type: f.mediaType, data: f.data } });
    const n = pendingFiles.length;
    content.push({ type: "text", text: text || (n > 1 ? `${n}枚ぶんの宿題です。一緒に解きたいです。` : "この問題を一緒に解きたいです。") });
    imgUrl = pendingFiles.find((f) => f.previewUrl)?.previewUrl || null;
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
      provider: S.provider, model: curModel(), apiKey: curKey(), baseUrl: curBaseUrl(),
      system: buildSystemPrompt(S.persona, {
        name: S.name, grade: S.grade, career: curCareer(),
        pastDreams: (S.dreamHistory || []).map((d) => CAREER_MAP[d.career]?.name).filter(Boolean),
        homeworkStatus: homeworkStatusText(S.homework, S.dailyMinutes),
      }, statusSummary()),
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
    S.apiMessages.pop(); S.chat.pop();

    // 履歴の tool_use / tool_result の対応が崩れていたら、その場で直す。
    // 直さないと以後ずっと同じエラーが出続けてしまう。
    const broken = e instanceof ApiError && e.status === 400 && /tool_result|tool_use|tool_call/i.test(e.message);
    if (broken || historyLooksBroken(S.apiMessages)) {
      S.apiMessages = repairPairs(S.apiMessages);
    }

    addMsg("err", "⚠ " + (e instanceof ApiError ? e.friendly() : "通信エラーです。接続を確認してください。"));
    if (broken) {
      // 送った内容(写真を含む)は消えていないので、押し直せばそのまま送れる
      const el = $("#chat").lastElementChild;
      const btn = document.createElement("button");
      btn.className = "btn btn-sm err-fix";
      btn.textContent = "会話をすべて整理してやり直す";
      btn.onclick = () => {
        S.apiMessages = []; save(); el.remove();
        toast("会話を整理しました。もう一度送ってください");
      };
      el.appendChild(btn);
    }
    save();
  } finally {
    busy = false; $("#send").disabled = false;
  }
}

function clearPhoto() {
  pendingFiles = [];
  $("#preview").hidden = true; $("#preview").innerHTML = "";
  $("#cameraIn").value = ""; $("#scanIn").value = "";
}

/** 取り込んだファイルをプレビューに並べる */
function renderPreview() {
  const box = $("#preview");
  if (!pendingFiles.length) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = pendingFiles.map((f, i) => f.kind === "pdf"
    ? `<div class="pv-item pv-pdf" data-i="${i}"><span>📄</span><b>${esc(f.name)}</b><button class="pv-x" data-i="${i}">✕</button></div>`
    : `<div class="pv-item" data-i="${i}"><img src="${f.previewUrl}" alt="取り込んだ画像 ${i + 1}"><button class="pv-x" data-i="${i}">✕</button></div>`
  ).join("") + `<button class="pv-clear" id="pvClear">すべて取り消す</button>`;
  box.querySelectorAll(".pv-x").forEach((b) => b.onclick = () => {
    pendingFiles.splice(Number(b.dataset.i), 1); renderPreview();
  });
  $("#pvClear").onclick = clearPhoto;
}

/** カメラ/スキャンから受け取ったファイルを取り込む */
async function intakeFiles(fileList, how) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  if (pendingFiles.length + files.length > 6) { toast("いちどに送れるのは6枚までです"); return; }
  for (const f of files) {
    try {
      if (f.type === "application/pdf") {
        if (S.provider === "openai") { toast("このAIではPDFを送れません。画像で取り込んでください"); continue; }
        if (f.size > 4.5 * 1024 * 1024) { toast("PDFが大きすぎます(4.5MBまで)"); continue; }
        pendingFiles.push({ kind: "pdf", name: f.name, data: await fileToBase64(f) });
      } else {
        const img = await processImage(f);
        pendingFiles.push({ kind: "image", name: f.name, ...img });
      }
    } catch (e) { toast(String(e.message || e)); }
  }
  renderPreview();
  if (pendingFiles.length) {
    go("study");
    if (!$("#input").value) {
      $("#input").value = how === "camera"
        ? "学校の宿題を撮りました。一緒に解きたいです。"
        : "学校の宿題をスキャンしました。一緒に解きたいです。";
    }
  }
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = () => rej(new Error("ファイルを読み込めませんでした"));
    r.readAsDataURL(file);
  });
}

/* ═══════════════ 描画 ═══════════════ */

function renderAll() {
  renderHomework();
  applyStage();
  renderTop(); renderHome(); renderJourney(); renderLetters(); renderThemes();
  renderWeak(); renderGrade(); renderPlan(); renderParent();
}

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
  const stg = stage();
  $("#heroLine").textContent = w.counts["hi-wrong"]
    ? (stg.showExamCountdown
        ? `最優先の弱点が ${w.counts["hi-wrong"]} 件あります。ここが一番伸びます。`
        : `「わかったつもり」が ${w.counts["hi-wrong"]} 個見つかっています。ここが一番おいしいところ。`)
    : q.length ? `今日の分を ${q.length} 個そろえました。` : "まずは軽く始めてみましょう。";

  // 夢との距離
  const gi = Math.max(0, GRADES.indexOf(S.grade));
  const sm = subjectMastery(S.mem);
  const cw = careerWeights(S.career);
  let cov = 0, n = 0;
  for (const k in sm) { if ((cw[k] ?? 0.5) >= 0.7) { cov += sm[k].coverage; n++; } }
  const progress = ((gi / 6) * 0.5 + (n ? cov / n : 0) * 0.5) * 100;
  $("#dreamFill").style.width = Math.min(100, progress) + "%";
  $("#dreamNow").textContent = S.grade;
  const cc = curCareer();
  $("#dreamGoal").textContent = `${cc.emoji} ${cc.name}`;
  const rm = ROADMAP[gi];
  $("#dreamNote").textContent = `${S.grade}:${stage().tagline}`;

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

  // 評定平均
  const hy = calcHyoteiHeikin(S.hyotei);
  const entries = Object.entries(S.hyotei || {});
  $("#hyoteiResult").innerHTML = entries.length
    ? entries.map(([k, v]) => `<div class="wr-row"><span>${esc(k)}</span><b>${v}</b>
        <button class="mini-x" data-rmhy="${esc(k)}">✕</button></div>`).join("") +
      `<div class="hy-box ${hy.ok ? "ok" : ""}"><b>評定平均 ${hy.avg}</b><br>${esc(hy.eligible)}</div>`
    : `<p class="cs">高校に入学したら、学期ごとの平均を入れていってください。中学生のうちは空欄で構いません。</p>`;
  $$("[data-rmhy]").forEach((b) => b.onclick = () => { delete S.hyotei[b.dataset.rmhy]; save(); renderGrade(); });

  // 模試の種類
  const ms = $("#moshiType");
  if (!ms.dataset.filled) {
    ms.innerHTML = Object.values(MOSHI_TYPES).map((m) =>
      `<option value="${m.id}" ${S.moshiType === m.id ? "selected" : ""}>${m.name}</option>`).join("");
    ms.dataset.filled = "1";
    ms.onchange = () => { S.moshiType = ms.value; save(); renderGrade(); };
  }
  ms.value = S.moshiType || "zento";

  // 模試の換算結果
  const mt = MOSHI_TYPES[S.moshiType || "zento"];
  let html = `<p class="cs">${esc(mt.note)}</p>`;
  if (S.hensa != null && mt.offset !== null) {
    const k = toKawaiScale(S.hensa, S.moshiType);
    html += `<div class="conv-box"><div class="conv-main">
        <span class="conv-raw">${mt.name}<br><b>${S.hensa}</b></span>
        <span class="conv-arrow">→</span>
        <span class="conv-kawai">大学偏差値表の基準<br><b>約 ${k.center}</b>${k.band ? `<small>(${Math.round(k.low)}〜${Math.round(k.high)})</small>` : ""}</span>
      </div>${S.moshiType !== "zento" ? `<p class="conv-note">この換算後の数字で志望校との距離を判定しています。</p>` : ""}</div>`;
    html += `<div class="conv-table"><div class="conv-th">同じ実力を各模試で受けたら</div>` +
      conversionTable(k.center).map((c) => `<div class="conv-tr ${c.isBase ? "base" : ""}">
        <span>${esc(c.name)}</span><b>${c.value}</b></div>`).join("") + `</div>`;
    if (S.hensaLog.length > 1) {
      html += `<div class="conv-th" style="margin-top:12px">推移(河合塾換算)</div>` +
        S.hensaLog.slice(-8).reverse().map((l) => `<div class="wr-row"><span>${l.date} ・ ${MOSHI_TYPES[l.type]?.name || ""}</span><b>${l.value} → ${l.kawai}</b></div>`).join("");
    }
  } else if (mt.offset === null) {
    html += `<div class="conv-box warn">高校受験の模試は大学受験に換算できません。母集団がまったく違うためです。高校入学後、全統模試などで測り直してください。</div>`;
  }
  $("#hensaResult").innerHTML = html;
  if ($("#hensaIn") && S.hensa != null && !$("#hensaIn").value) $("#hensaIn").value = S.hensa;

  // 限界効用
  const testScores = {};
  for (const g of S.grades) testScores[g.subject] = g.score;
  const mr = marginalReturn(S.mem, testScores, S.career);
  const max = mr[0]?.score || 1;
  $("#marginalList").innerHTML = mr.map((m, i) =>
    `<div class="mr-item"><span class="mr-rank">${i + 1}</span>
      <div class="mr-body"><div class="mr-name">${m.emoji} ${m.name}</div><div class="mr-reason">${m.reason}</div></div>
      <div class="mr-bar"><i style="width:${(m.score / max) * 100}%"></i></div></div>`).join("");

  // 志望校
  $("#schoolList").innerHTML = VET_SCHOOLS.map((s) => {
    const d = distanceToSchool(s, kawaiHensa());
    return `<div class="school"><div class="sc-body">
      <div class="sc-name">${esc(s.name)} <span class="sc-type">${s.type}</span></div>
      <div class="sc-fac">${esc(s.faculty)} ・ ${s.pref}${s.kyotsu ? ` ・ 共テ${s.kyotsu}%` : ""}</div>
      <div class="sc-fac">${esc(s.note)}</div></div>
      <div style="text-align:right"><div class="sc-h">${s.hensa}</div>
      ${d ? `<span class="sc-status" style="background:${d.color}">${d.status} ${d.gap > 0 ? "+" + d.gap : d.gap}</span>` : ""}</div></div>`;
  }).join("");
}

/* ── 今の段階(受験タブの先頭) ── */
function renderStage() {
  const st = stage();
  const t = THEMES[themeId()];
  $("#stageCard").innerHTML = `
    <div class="stg-head"><span class="stg-emoji">${t.emoji}</span>
      <div><div class="stg-label">${esc(st.label)}</div>
      <div class="stg-tag">${esc(st.tagline)}</div></div></div>
    <div class="stg-focus"><div class="stg-focus-t">${esc(st.horizon)}の focus</div>
      ${st.focus.map((f) => `<div class="stg-f">・${esc(f)}</div>`).join("")}</div>
    ${st.note ? `<div class="stg-note">${esc(st.note)}</div>` : ""}`;
}

/* ── ここまでの道のり(長く付き合うための記録) ── */
function renderJourney() {
  const j = journey(S.startedAt, S.seenMilestones);
  if (!j) { $("#journeyCard").hidden = true; return; }
  $("#journeyCard").hidden = false;
  const y = yearOverYear(S.mem, S.grades);
  $("#journeyBox").innerHTML = `
    <div class="jr-main"><span class="jr-num">${j.days.toLocaleString()}</span><span class="jr-unit">日目</span></div>
    <p class="jr-sub">${S.name}さんと一緒に過ごした日数です。</p>
    <div class="jr-stats">
      <div class="jr-s"><b>${y.conceptsNow}</b><span>学んだ概念</span></div>
      <div class="jr-s"><b>${y.mastered}</b><span>できるようになった</span></div>
      <div class="jr-s"><b>${(S.sessions || []).length}</b><span>机に向かった日</span></div>
    </div>
    ${j.next ? `<p class="jr-next">次の節目 ${j.next.emoji} ${esc(j.next.title)} まで あと ${j.daysToNext} 日</p>` : ""}
    ${j.reached.length ? `<div class="jr-badges">${j.reached.map((m) => `<span title="${esc(m.title)}">${m.emoji}</span>`).join("")}</div>` : ""}`;

  // 未表示の節目があれば祝う
  if (j.unseen.length) {
    const m = j.unseen.at(-1);
    S.seenMilestones.push(...j.unseen.map((x) => x.days)); save();
    setTimeout(() => showMilestone(m, y), 700);
  }
}

function showMilestone(m, y) {
  const el = document.createElement("div");
  el.className = "dream-modal";
  el.innerHTML = `<div class="dm-box">
    <div class="dm-h">${m.emoji}</div>
    <div class="dm-t">${esc(m.title)}</div>
    <p class="dm-affirm">${esc(m.msg)}</p>
    <div class="dm-carry">この間に <b>${y.conceptsNow}個</b> の概念を学び、<b>${y.mastered}個</b> をできるようにしました。</div>
    <button class="btn btn-primary" id="dmClose">ありがとう</button></div>`;
  document.body.appendChild(el);
  el.querySelector("#dmClose").onclick = () => el.remove();
}

/* ── 未来の自分への手紙 ── */
function renderLetters() {
  const now = Date.now();
  const arrived = S.letters.filter((l) => now >= l.openAt);
  const waiting = S.letters.filter((l) => now < l.openAt);
  let h = "";
  if (arrived.length) {
    h += arrived.slice().reverse().map((l) => {
      const w = new Date(l.writtenAt).toISOString().slice(0, 10);
      return `<div class="letter open"><div class="letter-h">📬 ${w} の自分から</div>
        <div class="letter-t">${esc(l.text)}</div></div>`;
    }).join("");
  }
  if (waiting.length) {
    h += waiting.map((l) => {
      const o = new Date(l.openAt).toISOString().slice(0, 10);
      const d = Math.ceil((l.openAt - now) / 86400000);
      return `<div class="letter sealed">✉️ ${o} に届きます(あと ${d} 日)</div>`;
    }).join("");
  }
  if (!h) h = `<p class="empty">まだ手紙はありません。<br>1年後の自分に、いま伝えたいことを書いてみてください。</p>`;
  $("#letterBox").innerHTML = h;
}

function openLetterWriter() {
  const prompts = letterPrompts(S.grade);
  const el = document.createElement("div");
  el.className = "dream-modal";
  el.innerHTML = `<div class="dm-box">
    <div class="dm-t">未来の自分への手紙</div>
    <p class="cs">1年後のこの日に届きます。あとから読み返すと、自分がどれだけ変わったかがわかります。</p>
    <div class="lw-prompts">${prompts.map((p) => `<button class="lw-p">${esc(p)}</button>`).join("")}</div>
    <textarea id="lwText" class="inp lw-text" rows="6" placeholder="思ったことを、そのまま書いて大丈夫です"></textarea>
    <div class="form-row" style="margin-top:8px">
      <select id="lwWhen" class="select">
        <option value="365">1年後に届く</option>
        <option value="180">半年後に届く</option>
        <option value="90">3ヶ月後に届く</option>
        <option value="1095">3年後に届く</option>
      </select>
    </div>
    <button class="btn btn-primary" id="lwSave">封をする</button>
    <button class="btn btn-ghost" id="lwCancel">やめる</button></div>`;
  document.body.appendChild(el);
  el.querySelectorAll(".lw-p").forEach((b) => b.onclick = () => {
    const ta = el.querySelector("#lwText");
    ta.value += (ta.value ? "\n\n" : "") + b.textContent + "\n";
    ta.focus();
  });
  el.querySelector("#lwCancel").onclick = () => el.remove();
  el.querySelector("#lwSave").onclick = () => {
    const text = el.querySelector("#lwText").value.trim();
    if (!text) return toast("何か書いてから封をしてください");
    const days = Number(el.querySelector("#lwWhen").value);
    S.letters.push({ text, writtenAt: Date.now(), openAt: Date.now() + days * 86400000 });
    save(); renderLetters(); el.remove();
    toast(`封をしました。${days}日後に届きます`);
  };
}

/* ── テーマ ── */
function renderThemes() {
  $("#themeGrid").innerHTML = Object.entries(THEMES).map(([id, t]) =>
    `<button class="th ${themeId() === id ? "on" : ""}" data-th="${id}">
      <span class="th-sw" style="background:${t.v["--bg"]};border-color:${t.v["--line"]}">
        <i style="background:${t.v["--accent"]}"></i></span>
      <span class="th-n">${t.emoji} ${esc(t.name)}</span>
      <span class="th-d">${esc(t.desc)}</span>
      <span class="th-f">${esc(t.forStage)}</span></button>`).join("");
  $$("[data-th]").forEach((b) => b.onclick = () => {
    S.theme = b.dataset.th; save(); applyTheme(S.theme); renderThemes(); applyStage();
    toast(`${THEMES[S.theme].emoji} ${THEMES[S.theme].name} にしました`);
  });
}

/* ── 保護者のiPhoneへ共有 ── */
function buildShareData() {
  const days = S.parentPeriod || 7;
  const p = periodSummary(S, days);
  const w = weaknessSummary(S.mem);
  const sm = subjectMastery(S.mem);
  const adv = guardianAdvice(S);
  const ds = dreamStatus(S);
  const cd = countdownToExam(S.grade);
  const st = stage();
  const j = journey(S.startedAt, []);
  return {
    n: S.name, g: S.grade, pd: days, dt: today(),
    ad: { t: adv.tone === "neutral" ? "" : adv.tone, x: adv.text, s: adv.say },
    al: detectAlerts(S).filter((a) => a.title !== adv.featured).slice(0, 5)
        .map((a) => ({ l: a.level, i: a.icon, t: a.title, b: a.body, s: a.say })),
    p: { ad: p.activeDays, an: p.answered, mi: p.minutes, nw: p.newly,
         ac: p.accuracy != null ? Math.round(p.accuracy * 100) : null },
    sm: Object.entries(sm).filter(([, v]) => v.learned).map(([k, v]) =>
        ({ n: SUBJECTS[k].emoji + SUBJECTS[k].name, l: v.learned, t: v.total, m: Math.round(v.avgMastery * 100) })),
    w: w.totalAnswers ? { o: Math.round(w.overconfidence * 100), hw: w.counts["hi-wrong"], hr: w.counts["hi-right"] } : null,
    gr: S.grades.slice(-5).map((g) => ({ s: SUBJECTS[g.subject]?.name || "", n: g.name, p: g.score, a: g.avg, h: g.eval.estHensa })),
    c: ds ? { e: ds.current.emoji, n: ds.current.name, ch: ds.changes, r: ds.read } : null,
    // ★中学生のうちは大学受験の残り日数を保護者にも出さない
    ex: st.showExamCountdown && cd ? `${cd.days.toLocaleString()}日(${cd.examYearLabel})` : null,
    hs: st.showHensa && S.hensa ? `${MOSHI_TYPES[S.moshiType]?.name} ${S.hensa}(河合換算 約${kawaiHensa()})` : null,
    j: j ? j.days : null,
  };
}

function buildShareUrl() {
  const json = JSON.stringify(buildShareData());
  const bytes = new TextEncoder().encode(json);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const base = location.href.replace(/[^/]*$/, "") + "share.html";
  return { url: `${base}#d=${b64}`, size: b64.length };
}

async function shareToPhone() {
  const { url, size } = buildShareUrl();
  $("#shareInfo").textContent = `リンクの長さ:${size.toLocaleString()}文字`;
  if (size > 30000) $("#shareInfo").textContent += " ⚠ 長すぎる可能性があります。期間を7日に縮めてお試しください。";
  const text = `${S.name}さんの学習レポートです`;
  try {
    if (navigator.share) { await navigator.share({ title: "学習レポート", text, url }); return; }
    await navigator.clipboard.writeText(url);
    toast("リンクをコピーしました。LINEなどに貼って送ってください");
  } catch (e) {
    if (e?.name !== "AbortError") toast("共有できませんでした。「リンクをコピー」をお試しください");
  }
}

function renderCareer() {
  const c = curCareer();
  $("#currentCareer").innerHTML = `
    <div class="cc">
      <span class="cc-e">${c.emoji}</span>
      <div class="cc-b"><div class="cc-n">${esc(c.name)}</div>
        <div class="cc-f">${esc(c.faculty)}${c.license && c.license !== "—" ? " ・ " + esc(c.license) : ""}</div>
        <div class="cc-k">${c.key.length ? "特に効く科目:" + c.key.map(esc).join("・") : ""}</div></div>
    </div>
    <p class="cc-desc">${esc(c.desc)}</p>
    ${c.hs ? `<div class="cc-hs">💡 ${esc(c.hs)}</div>` : ""}`;

  /* 転用率 */
  const tm = transferMap(S.mem, S.career);
  const hasData = tm.some((t) => t.rate != null);
  $("#transferList").innerHTML = !hasData
    ? `<p class="empty">学習を始めると、ここに「別の道でも何%活きるか」が出ます。</p>`
    : tm.slice(0, 8).map((t) => {
        const pct = Math.round((t.rate ?? 0) * 100);
        return `<div class="tr-item"><span class="tr-e">${t.career.emoji}</span>
          <span class="tr-n">${esc(t.career.name)}</span>
          <span class="tr-bar"><i style="width:${pct}%"></i></span>
          <span class="tr-p">${pct}%</span></div>`;
      }).join("") + `<p class="cs" style="margin-top:10px">
        主要教科の土台はほとんどの進路で共通しています。<b>だから今の勉強は、どの道に進んでも無駄になりません。</b></p>`;

  /* 志望の記録 */
  const hist = S.dreamHistory || [];
  $("#dreamHistory").innerHTML = hist.length
    ? hist.map((h, i) => {
        const cc = CAREER_MAP[h.career];
        if (!cc) return "";
        const d = new Date(h.at).toISOString().slice(0, 10);
        return `<div class="dh ${i === hist.length - 1 ? "now" : ""}">
          <span class="dh-e">${cc.emoji}</span>
          <div><div class="dh-n">${esc(cc.name)}${i === hist.length - 1 ? " <span class='dh-cur'>今</span>" : ""}</div>
          <div class="dh-d">${d}${h.note ? " ・ " + esc(h.note) : ""}</div></div></div>`;
      }).join("")
    : `<p class="empty">まだ変更はありません。変えたときにここに残ります。</p>`;
  if (S.careerInterests?.length) {
    $("#dreamHistory").innerHTML += `<div class="cs" style="margin-top:10px"><b>気になっている道:</b> ` +
      S.careerInterests.map((i) => CAREER_MAP[i] ? `${CAREER_MAP[i].emoji}${esc(CAREER_MAP[i].name)}` : "").join(" / ") + `</div>`;
  }

  /* つぶしが効く教科 */
  $("#versatilityList").innerHTML = versatility().map((v) =>
    `<div class="vs"><span>${v.emoji} ${esc(v.name)}</span>
      <span class="vs-bar"><i style="width:${v.score * 100}%"></i></span>
      <span class="vs-p">${Math.round(v.score * 100)}</span></div>`).join("");
}

function renderExplorer() {
  const box = $("#careerExplorer");
  const tm = transferMap(S.mem, S.career);
  const rateOf = (id) => tm.find((t) => t.career.id === id)?.rate;
  const fields = [...new Set(CAREERS.map((c) => c.field))];
  box.innerHTML = fields.map((f) => `<div class="cex-f">${esc(f)}</div>` +
    CAREERS.filter((c) => c.field === f).map((c) => {
      const on = c.id === S.career;
      const r = rateOf(c.id);
      return `<div class="cex ${on ? "on" : ""}" data-cex="${c.id}">
        <span class="cex-e">${c.emoji}</span>
        <div class="cex-b"><div class="cex-n">${esc(c.name)}${on ? " <span class='cex-cur'>今の志望</span>" : ""}</div>
          <div class="cex-f2">${esc(c.faculty)}</div>
          <div class="cex-d">${esc(c.desc)}</div>
          ${c.hs ? `<div class="cex-hs">${esc(c.hs)}</div>` : ""}</div>
        ${!on && r != null ? `<span class="cex-r">積み上げの<br><b>${Math.round(r * 100)}%</b><br>が活きる</span>` : ""}</div>`;
    }).join("")).join("");

  $$("[data-cex]").forEach((el) => el.onclick = () => {
    const id = el.dataset.cex;
    if (id === S.career) return;
    const c = CAREER_MAP[id];
    if (!confirm(`志望を「${c.name}」に変えますか?\n\n前の志望は記録として残ります。いつでも戻せます。`)) return;
    const msg = setCareer(id);
    if (msg) showDreamChange(msg);
  });
}

/** 志望を変えたときのメッセージ。変化そのものを肯定する */
function showDreamChange(msg) {
  const el = document.createElement("div");
  el.className = "dream-modal";
  el.innerHTML = `<div class="dm-box">
    <div class="dm-h">${msg.from.emoji} → ${msg.to.emoji}</div>
    <div class="dm-t">${esc(msg.headline)}</div>
    <p class="dm-affirm">${esc(msg.affirm)}</p>
    <div class="dm-carry"><b>${esc(msg.carry)}</b></div>
    ${msg.up.length ? `<p class="dm-sub">これから少し厚くするとよい教科:${msg.up.map((x) => x.emoji + x.name).join("・")}</p>` : ""}
    ${msg.down.length ? `<p class="dm-sub">比重が下がる教科:${msg.down.map((x) => x.emoji + x.name).join("・")}</p>` : ""}
    <p class="dm-keep">${esc(msg.keepPast)}</p>
    <button class="btn btn-primary" id="dmClose">わかった</button></div>`;
  document.body.appendChild(el);
  el.querySelector("#dmClose").onclick = () => el.remove();
}

function renderPlan() {
  const gi = Math.max(0, GRADES.indexOf(S.grade));
  renderStage();
  renderCareer();

  /* カウントダウン */
  const cd = countdownToExam(S.grade);
  if (cd) {
    $("#cdDays").textContent = cd.days.toLocaleString();
    $("#cdSub").textContent = `共通テスト(${cd.examYearLabel})まで — 約${cd.years}年 / ${cd.months}ヶ月 / 週末は残り${cd.weekends}回`;
    $("#cdGrid").innerHTML = [
      ["高3の1年", `${Math.max(0, Math.round((cd.days - 365) / 365 * 10) / 10)}年後に開始`],
      ["受験学年度", `${cd.gradYear}年度`],
      ["入試方式", "一般 / 推薦 / 総合型"],
      ["志望", "獣医学部(全国17校)"],
    ].map(([k, v]) => `<div class="cd-cell"><div class="cd-k">${k}</div><div class="cd-v">${v}</div></div>`).join("");
  }

  /* 逆算マイルストーン */
  $("#milestones").innerHTML = backwardMilestones(S.grade).map((m) =>
    `<div class="ms ${m.critical ? "crit" : ""}">
      <div class="ms-at">${esc(m.at)}</div>
      <div class="ms-body"><div class="ms-label">${m.critical ? "★ " : ""}${esc(m.label)}</div>
      <div class="ms-detail">${esc(m.detail)}</div></div></div>`).join("");

  /* 学習時間の見通し */
  if (S.dailyMinutes && $("#dailyMin")) $("#dailyMin").value = S.dailyMinutes;
  renderTimeProjection();

  /* 入試方式 */
  $("#admissionTypes").innerHTML = ADMISSION_TYPES.map((a) =>
    `<div class="adm"><div class="adm-h"><b>${esc(a.name)}</b><span class="adm-when">${esc(a.when)}</span></div>
      <p class="adm-desc">${esc(a.desc)}</p>
      <ul class="adm-need">${a.need.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
      <div class="adm-tip">💡 ${esc(a.tip)}</div></div>`).join("");

  /* 併願戦略 */
  const kh = kawaiHensa();
  const st = buildStrategy(kh);
  if (!st) $("#strategyBox").innerHTML = `<p class="empty">模試の偏差値を「成績」タブで入力すると、併願プランが出ます。</p>`;
  else {
    const grp = (title, arr, color, note) => !arr.length ? "" :
      `<div class="stg"><div class="stg-h" style="color:${color}">${title} <span class="stg-note">${note}</span></div>
        ${arr.map((s) => `<div class="stg-item"><span>${esc(s.name)} <span class="sc-type">${s.type}</span></span>
          <span class="stg-h2">${s.hensa} <small>(${s.gap > 0 ? "+" : ""}${Math.round(s.gap * 10) / 10})</small></span></div>`).join("")}</div>`;
    $("#strategyBox").innerHTML =
      `<p class="cs">河合塾換算 偏差値 <b>${kh}</b> を基準にしています。</p>` +
      grp("挑戦圏", st.challenge, "var(--red)", "届けば大きい。1〜2校まで") +
      grp("射程圏", st.target, "var(--amber)", "本命ゾーン") +
      grp("安全圏", st.safe, "var(--green)", "必ず確保したい") +
      `<div class="stg-advice">${esc(st.advice)}</div>`;
  }

  /* 年間スケジュール */
  $("#examCalendar").innerHTML = EXAM_CALENDAR.map((c) =>
    `<div class="cal"><div class="cal-m">${c.label}</div><ul>${c.items.map((i) =>
      `<li class="${i.startsWith("★") ? "cal-key" : ""}">${esc(i)}</li>`).join("")}</ul></div>`).join("");

  /* 費用 */
  const cs = $("#costSchool");
  if (!cs.dataset.filled) {
    cs.innerHTML = VET_SCHOOLS.map((s) => `<option value="${s.id}" ${S.costSchool === s.id ? "selected" : ""}>${s.name}(${s.type})</option>`).join("");
    cs.dataset.filled = "1";
    cs.onchange = () => { S.costSchool = cs.value; save(); renderCost(); };
  }
  renderCost();

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

function renderTimeProjection() {
  const min = S.dailyMinutes;
  if (!min) { $("#timeProjection").innerHTML = `<p class="cs">1日の学習時間を入れると、受験までに積み上がる総量が出ます。</p>`; return; }
  const p = studyTimeProjection(S.grade, min);
  if (!p) return;
  const over = p.diff >= 0;
  $("#timeProjection").innerHTML = `
    <div class="tp"><div class="tp-row"><span>1日 ${min}分 を受験まで続けると</span><b>約 ${p.totalHours.toLocaleString()} 時間</b></div>
    <div class="tp-row"><span>${S.grade}の一般的な目安(1日)</span><b>${p.recommended}分</b></div>
    <div class="tp-row ${over ? "up" : "down"}"><span>目安との差</span><b>${over ? "+" : ""}${p.diff}分/日</b></div></div>
    <p class="cs">${over
      ? "目安を上回っています。無理が続いていないかだけ気をつけてください。量より継続です。"
      : `目安まであと ${-p.diff}分。ただし<b>時間より中身</b>です。混ぜた問題を確信度つきで解く30分は、ぼんやり読む90分より効きます。`}</p>`;
}

function renderCost() {
  const c = estimateCost(S.costSchool);
  if (!c) return;
  const yen = (n) => "¥" + n.toLocaleString();
  $("#costResult").innerHTML = `
    <div class="cost-total">${esc(c.school.name)}(${c.school.type})<br>
      <span class="cost-num">${yen(c.total)}</span><span class="cost-lab">6年間の総額(目安)</span></div>
    <div class="cost-row"><span>学費(6年)</span><b>${yen(c.tuition)}</b></div>
    <div class="cost-row"><span>受験費用(共テ+国公立1+私立2+交通宿泊)</span><b>${yen(c.exam)}</b></div>
    <div class="cost-row"><span>学費を月額にならすと</span><b>${yen(c.monthly)} / 月</b></div>
    <p class="cs" style="margin-top:10px">${c.school.type === "私立"
      ? "私立は国公立のおよそ<b>3〜4倍</b>です。奨学金・教育ローン・大学独自の特待生制度を早めに調べておくと選択肢が広がります。"
      : "国公立は学費が大きく抑えられます(入学金282,000円+授業料535,800円/年の標準額)。その分、共通テストで6教科8科目が必要です。"}</p>
    <p class="cs cs-warn">※ 実習費・教材費・生活費は含みません。必ず各大学の公式サイトで最新の金額をご確認ください。</p>`;
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
  /* 今週の一言 */
  const adv = guardianAdvice(S);
  $("#guardianAdvice").innerHTML = `<div class="adv adv-${adv.tone}">
    <p class="adv-text">${esc(adv.text)}</p>
    ${adv.say ? `<div class="adv-say"><span class="adv-say-l">かけるとよい言葉</span>${esc(adv.say)}</div>` : ""}</div>`;

  /* アラート */
  const alerts = detectAlerts(S).filter((a) => a.title !== adv.featured);
  $("#alertList").innerHTML = alerts.length
    ? alerts.map((a) => `<div class="al al-${a.level}">
        <div class="al-h"><span class="al-i">${a.icon}</span><b>${esc(a.title)}</b></div>
        <p class="al-b">${esc(a.body)}</p>
        ${a.say ? `<div class="al-say">${esc(a.say)}</div>` : ""}</div>`).join("")
    : `<p class="empty">${adv.featured ? "他に気になる点はありません。" : "学習が始まると、ここに良い変化と気になる点が表示されます。"}</p>`;

  /* 期間サマリー */
  const days = S.parentPeriod || 7;
  $$("#periodSeg .seg-btn").forEach((b) => b.classList.toggle("on", Number(b.dataset.days) === days));
  const p = periodSummary(S, days);
  const w = weaknessSummary(S.mem);
  $("#weeklyReport").innerHTML = `
    <div class="wr-row"><span>学習した日数</span><b>${p.activeDays} 日 / ${days}日</b></div>
    <div class="wr-row"><span>解いた問題数</span><b>${p.answered} 問</b></div>
    ${p.minutes ? `<div class="wr-row"><span>学習時間</span><b>${Math.round(p.minutes / 60)} 時間(1日平均 ${p.avgMinutes} 分)</b></div>` : ""}
    <div class="wr-row"><span>新しく習得した概念</span><b>${p.newly} 個</b></div>
    <div class="wr-row"><span>練習中の正答率</span><b>${p.accuracy != null ? Math.round(p.accuracy * 100) + "%" : "—"}</b></div>
    <div class="wr-row"><span>最優先の弱点</span><b>${w.counts["hi-wrong"]} 件</b></div>
    <div class="wr-msg"><b>この数字の読み方</b><br>
      練習中の正答率は<b>低くて構いません</b>。このアプリは単元をわざと混ぜて出題しており(交互練習)、
      研究では練習中の正答率が 89%→60% に下がる一方、本番のテスト成績は約2倍になることが確認されています。
      正答率ではなく<b>「学習した日数」と「新しく習得した概念」</b>を見てあげてください。</div>`;

  /* 教科別の内訳 */
  const bs = Object.entries(p.bySubject);
  $("#subjectBreakdown").innerHTML = bs.length
    ? `<div class="bd-title">この期間に触れた教科</div>` + bs.sort((a, b) => b[1].touched - a[1].touched).map(([k, v]) =>
        `<div class="bd"><span>${SUBJECTS[k].emoji} ${SUBJECTS[k].name}</span>
          <span class="bd-v">${v.touched}概念(うち習得 ${v.mastered})</span></div>`).join("")
    : "";

  /* 受験までの位置 */
  const cd = countdownToExam(S.grade);
  const kh = kawaiHensa();
  const n = calcNaishin(S.naishin);
  const hy = calcHyoteiHeikin(S.hyotei);
  const st = buildStrategy(kh);
  $("#parentExamStatus").innerHTML = `
    ${cd ? `<div class="wr-row"><span>共通テストまで</span><b>${cd.days.toLocaleString()}日(${cd.examYearLabel})</b></div>` : ""}
    ${S.hensa ? `<div class="wr-row"><span>${MOSHI_TYPES[S.moshiType]?.name || "模試"}</span><b>偏差値 ${S.hensa}</b></div>
      <div class="wr-row"><span>河合塾基準に換算</span><b>約 ${kh}</b></div>` : `<div class="wr-row"><span>模試</span><b>未入力</b></div>`}
    ${n.filled ? `<div class="wr-row"><span>内申点</span><b>${n.total} / 45</b></div>` : ""}
    ${hy ? `<div class="wr-row"><span>高校の評定平均</span><b>${hy.avg}(${hy.eligible})</b></div>` : ""}
    ${st && st.target.length ? `<div class="wr-row"><span>射程圏の獣医学部</span><b>${st.target.length}校</b></div>` : ""}
    ${st ? `<div class="wr-msg">${esc(st.advice)}</div>` : `<div class="wr-msg">模試の偏差値を入力すると、志望校との距離と併願プランが出ます。<br>
      <b>模試の種類によって偏差値は10〜15変わります。</b>大学の偏差値表は河合塾基準なので、進研模試の数字をそのまま比べると実力を大きく見誤ります。</div>`}`;

  /* 志望の状況 */
  const ds = dreamStatus(S);
  if (ds) {
    $("#parentDream").innerHTML = `
      <div class="wr-row"><span>今の志望</span><b>${ds.current.emoji} ${esc(ds.current.name)}</b></div>
      <div class="wr-row"><span>これまでの変更回数</span><b>${ds.changes} 回</b></div>
      ${ds.interests.length ? `<div class="wr-row"><span>気になっている道</span><b>${ds.interests.map((i) => CAREER_MAP[i]?.name).filter(Boolean).join("、")}</b></div>` : ""}
      <div class="wr-msg">${esc(ds.read)}</div>`;
  }

  /* 夢が変わったときのガイド */
  $("#dreamFacts").innerHTML = DREAM_CHANGE_GUIDE.facts.map((f) => `<div class="fact">📊 ${esc(f)}</div>`).join("");
  $("#dreamSayGrid").innerHTML = `
    <div class="say bad"><h3>✕ 避けたい</h3><ul>${DREAM_CHANGE_GUIDE.avoid.map((a) =>
      `<li>${esc(a.say)}<span class="say-why">${esc(a.why)}</span></li>`).join("")}</ul></div>
    <div class="say good"><h3>○ 効果がある</h3><ul>${DREAM_CHANGE_GUIDE.good.map((a) =>
      `<li>${esc(a.say)}<span class="say-why">${esc(a.why)}</span></li>`).join("")}</ul></div>`;
  $("#dreamParentNote").textContent = DREAM_CHANGE_GUIDE.note;

  /* テキストレポート */
  $("#reportPre").textContent = buildTextReport(S, days);

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
  // 使い始めた日を記録(長く付き合うための起点)
  if (!S.startedAt) { S.startedAt = Date.now(); save(); }
  takeBackup();                     // 1日1回、端末内にひかえを取る
  applyTheme(themeId());

  // 設定
  $("#provider").innerHTML = PROVIDER_IDS
    .map((id) => `<option value="${id}" ${S.provider === id ? "selected" : ""}>${esc(PROVIDERS[id].label)}</option>`).join("");
  $("#provider").onchange = () => {
    S.provider = $("#provider").value;
    S.model = "";           // プロバイダが変わればモデルも既定に戻す
    S.baseUrl = "";
    save(); renderProviderUI();
  };
  $("#fetchModels").onclick = fetchModelList;
  renderProviderUI();

  $("#pName").value = S.name;
  $("#pGrade").innerHTML = GRADES.map((g) => `<option ${S.grade === g ? "selected" : ""}>${g}</option>`).join("");

  // ナビ
  $$(".nb").forEach((b) => b.onclick = () => go(b.dataset.go));
  $("#askHomework").onclick = () => {
    S.persona = "sensei"; renderPersona(); go("study");
    send("今日の宿題を出してください。学校のぶんと合わせて、無理のない量でお願いします。");
  };
  $("#uploadHomework").onclick = () => { go("study"); showScanHelp(); };
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
  $("#cameraIn").onchange = (e) => intakeFiles(e.target.files, "camera");
  $("#scanIn").onchange = (e) => intakeFiles(e.target.files, "scan");
  $("#scanHelp").onclick = showScanHelp;
  

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
    S.hensa = v; S.moshiType = $("#moshiType").value;
    const k = toKawaiScale(v, S.moshiType);
    S.hensaLog.push({ value: v, type: S.moshiType, kawai: k ? k.center : null, date: today() });
    save(); renderAll();
    toast(k ? `河合塾換算 約${k.center} として記録しました` : "記録しました");
  };
  $("#addHyotei").onclick = () => {
    const v = Number($("#hyoteiIn").value);
    const label = $("#hyoteiLabel").value.trim() || `記録${Object.keys(S.hyotei).length + 1}`;
    if (!v || v < 1 || v > 5) return toast("1〜5の評定平均を入れてください");
    S.hyotei[label] = v; save(); renderGrade();
    $("#hyoteiIn").value = ""; $("#hyoteiLabel").value = "";
    toast("追加しました");
  };
  $("#calcTime").onclick = () => {
    const v = Number($("#dailyMin").value);
    if (!v) return toast("1日の学習時間(分)を入れてください");
    S.dailyMinutes = v; save(); renderTimeProjection();
  };
  $("#timerBtn").onclick = toggleTimer;
  $("#writeLetter").onclick = openLetterWriter;
  $("#shareToPhone").onclick = shareToPhone;
  $("#copyLink").onclick = async () => {
    const { url, size } = buildShareUrl();
    try { await navigator.clipboard.writeText(url); toast("リンクをコピーしました"); }
    catch (_) { toast("コピーできませんでした"); }
    $("#shareInfo").textContent = `リンクの長さ:${size.toLocaleString()}文字`;
  };
  $("#openLink").onclick = () => window.open(buildShareUrl().url, "_blank");
  $("#dreamSwitch").onclick = () => { go("plan"); setTimeout(() => $("#currentCareer").scrollIntoView({ behavior:"smooth", block:"center" }), 100); };
  $("#openExplorer").onclick = () => {
    const box = $("#careerExplorer");
    box.hidden = !box.hidden;
    $("#openExplorer").textContent = box.hidden ? "ほかの道も見てみる(20の進路)" : "閉じる";
    if (!box.hidden) renderExplorer();
  };
  $$("#periodSeg .seg-btn").forEach((b) => b.onclick = () => {
    S.parentPeriod = Number(b.dataset.days); save(); renderParent();
  });
  $("#copyReport").onclick = async () => {
    try { await navigator.clipboard.writeText(buildTextReport(S, S.parentPeriod || 7)); toast("コピーしました"); }
    catch (_) { toast("コピーできませんでした。長押しで選択してください"); }
  };
  $("#dlReport").onclick = () => {
    const blob = new Blob([buildTextReport(S, S.parentPeriod || 7)], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${S.name}-学習レポート-${today()}.txt`; a.click();
    URL.revokeObjectURL(a.href);
  };
  $("#calcTarget").onclick = renderKyotsu;

  // 設定保存
  $("#saveSettings").onclick = () => {
    S.apiKeys[S.provider] = $("#apiKey").value.trim();
    S.model = $("#model").value.trim();
    if (curProvider().needsBaseUrl) S.baseUrl = $("#baseUrl").value.trim();
    S.name = $("#pName").value.trim() || "沙和";
    const prevGrade = S.grade;
    S.grade = $("#pGrade").value;
    // 学年が変わったら、その学年のテーマを提案(押しつけない)
    if (prevGrade !== S.grade && !S.theme) applyTheme(themeId());
    save(); renderProviderUI(); renderAll();
    $("#settingsMsg").textContent = "保存しました";
    setTimeout(() => ($("#settingsMsg").textContent = ""), 2500);
  };

  // バージョン表示と更新確認
  $("#appVersion").textContent = APP_VERSION;
  $("#swVersion").textContent = "確認中…";
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    caches.keys().then((ks) => {
      const c = ks.find((k) => k.startsWith("sawa-navi-"));
      $("#swVersion").textContent = c ? c.replace("sawa-navi-", "") : "なし";
      const match = c && c.replace("sawa-navi-", "") === APP_VERSION;
      $("#verMsg").textContent = match ? "最新の状態です" : "古いファイルが残っています。下のボタンを押してください";
      $("#verMsg").className = match ? "ok-msg" : "ok-msg warn-msg";
    });
  } else {
    $("#swVersion").textContent = "—";
    $("#verMsg").textContent = "";
  }
  $("#checkUpdate").onclick = async () => {
    $("#verMsg").textContent = "確認しています…";
    try {
      for (const k of await caches.keys()) if (k.startsWith("sawa-navi-")) await caches.delete(k);
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) { await reg.update(); }
      location.reload(true);
    } catch (_) { location.reload(true); }
  };

  // データ
  $("#shareBackup").onclick = async () => {
    const r = await shareBackup();
    if (r === "shared") toast("バックアップを保存しました");
    else if (r === "downloaded") toast("バックアップをダウンロードしました");
  };
  $("#importData").onchange = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        applyBackupText(r.result);
        alert("バックアップから戻しました。");
        location.reload();
      } catch (_) { toast("このファイルは読み込めませんでした"); }
      e.target.value = "";
    };
    r.readAsText(f);
  };
  $("#resetChat").onclick = () => {
    if (!confirm("会話履歴だけを消します。学習データ・成績・宿題は残ります。")) return;
    S.chat = []; S.apiMessages = []; save(); location.reload();
  };
  $("#resetAll").onclick = () => {
    if (!confirm("すべてのデータ(学習記録・成績・宿題・会話)を消します。\n\n消す直前に自動でひかえを取るので、あとから戻せます。")) return;
    takeBackup("すべて消す前");
    localStorage.removeItem(KEY); location.reload();
  };
  renderBackup();

  // 復元
  for (const m of S.chat.slice(-40)) addMsg(m.who, m.text, { img: m.img, persona: m.persona });
  if (!S.chat.length) {
    $("#chat").innerHTML = `<div class="hint">話す相手を選んで、話しかけてみてください。<br>
      宿題や問題集は <b>📷</b> から写真で送れます。<br><br>
      ミミ先生🐰 = 教える人 / コタロー🐕 = 友だち / ナギ🦉 = 伴走者</div>`;
  }

  renderPersona(); renderKyotsu(); renderAll();

  // オフラインでも開けるように
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  // iOSの100vh問題対策
  const vh = () => document.documentElement.style.setProperty("--vh", window.innerHeight * 0.01 + "px");
  vh(); window.addEventListener("resize", vh); window.addEventListener("orientationchange", vh);

  if (!curKey()) {
    go("parent");
    $("#settingsMsg").textContent = "はじめに、おうちの方が使うAIとAPIキーを設定してください";
  }
}

/* ═══════════════ バックアップの画面 ═══════════════ */

async function renderServerBackup() {
  const box = document.querySelector("#srvBox");
  if (!box) return;

  if (S.srvToken) {
    const d = S.srvLastAt ? Math.floor((Date.now() - S.srvLastAt) / 3600000) : null;
    const when = S.srvLastAt
      ? (d < 1 ? "さっき" : d < 24 ? `${d}時間前` : `${Math.floor(d / 24)}日前`)
      : "まだ";
    box.innerHTML = `
      <div class="bk-notice ${S.srvLastError ? "warn" : "ok"}">
        <b>${S.srvLastError ? "⚠ 前回うまく預けられませんでした" : "✓ 自動で預けています"}</b>
        <p>${S.srvLastError ? esc(S.srvLastError) : `最後に預けたのは <b>${when}</b>。
          学習のたびに、30分に1回のペースで自動で預かります。何もしなくて大丈夫です。`}</p>
      </div>
      <div class="bk-btns">
        <button class="btn btn-sm" id="srvNow">今すぐ預ける</button>
        <button class="btn btn-sm btn-ghost" id="srvList">預けた記録から戻す</button>
      </div>
      <div id="srvItems"></div>`;
    document.querySelector("#srvNow").onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = "預けています…";
      const ok = await srvBackup(false);
      toast(ok ? "サーバーに預けました" : "うまく預けられませんでした");
    };
    document.querySelector("#srvList").onclick = renderServerList;
    return;
  }

  const found = await srvPing();
  if (!found) {
    box.innerHTML = `<div class="bk-notice">
      <b>まだ使えません</b>
      <p>サーバーに <code>api/backup.php</code> を置くと、<b>何もしなくても自動で</b>
        サーバーに記録が預けられるようになります。端末がこわれても、機種変更しても残ります。<br>
        ZIPの中の <code>api</code> フォルダを、ほかのファイルと一緒にアップロードしてから、
        このページを開き直してください。</p></div>`;
    return;
  }
  box.innerHTML = `<div class="bk-notice warn">
      <b>準備ができています</b>
      <p>ボタンを1回押すだけで、以後は自動で預かるようになります。</p></div>
    <button class="btn btn-primary" id="srvSetup">自動バックアップを始める</button>`;
  document.querySelector("#srvSetup").onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = "設定しています…";
    try {
      await srvSetup();
      await srvBackup(false);
      toast("自動バックアップを始めました");
    } catch (err) {
      const claimed = /設定済み/.test(String(err.message));
      alert(claimed
        ? "このサーバーは、ほかの端末ですでに設定されています。\n\nその端末の「保護者」タブに出ている合言葉を、この端末にも貼り付けてください。"
        : String(err.message));
      if (claimed) {
        const t = prompt("合言葉を貼り付けてください");
        if (t) { S.srvToken = t.trim(); save(); await srvBackup(false); }
      }
    }
    renderBackup();
  };
}

async function renderServerList() {
  const box = document.querySelector("#srvItems");
  box.innerHTML = `<p class="cs">読み込んでいます…</p>`;
  try {
    const j = await srvFetch("list");
    if (!j.items.length) { box.innerHTML = `<p class="cs">まだ預けた記録はありません。</p>`; return; }
    box.innerHTML = `<h3 class="sub-h">サーバーに預けた記録</h3>` + j.items.map((it) => {
      const d = new Date(it.at);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return `<div class="bk-item"><div><b>${label}</b>
        <span class="bk-meta">${Math.round(it.bytes / 1024)} KB</span></div>
        <button class="btn btn-sm btn-ghost" data-srv="${esc(it.file)}">これに戻す</button></div>`;
    }).join("");
    box.querySelectorAll("[data-srv]").forEach((b) => b.onclick = async () => {
      if (!confirm("サーバーに預けた記録に戻します。\n\n今の状態も自動でひかえを取るので、やり直せます。")) return;
      try {
        const txt = await srvFetch("get", { query: `&f=${encodeURIComponent(b.dataset.srv)}`, raw: true });
        applyBackupText(txt);
        alert("戻しました。");
        location.reload();
      } catch (e) { toast(String(e.message || e)); }
    });
  } catch (e) { box.innerHTML = `<p class="cs">${esc(String(e.message || e))}</p>`; }
}

function renderBackup() {
  renderServerBackup();
  const d = daysSinceBackup();
  const n = document.querySelector("#backupNotice");
  if (n) {
    if (d == null) {
      n.innerHTML = `<div class="bk-notice ${S.srvToken ? "" : "warn"}"><b>まだファイルに保存していません</b>
        <p>${S.srvToken ? "サーバーへの自動バックアップが動いているので急ぎませんが、手元にも1つあると安心です。"
          : "いま作っておくと、機種変更や不意の消去のときも沙和さんの記録が残ります。1分で終わります。"}</p></div>`;
    } else if (d >= 30) {
      n.innerHTML = `<div class="bk-notice warn"><b>前回のバックアップから ${d}日 たちました</b>
        <p>そろそろ保存しておくと安心です。</p></div>`;
    } else {
      n.innerHTML = `<div class="bk-notice ok"><b>${d === 0 ? "今日" : d + "日前"}にバックアップしました</b>
        <p>この調子で月1回ほどお願いします。</p></div>`;
    }
  }

  const box = document.querySelector("#backupList");
  if (!box) return;
  const list = loadBackups().slice().reverse();
  if (!list.length) {
    const hasData = Object.keys(S.mem || {}).length > 0;
    box.innerHTML = hasData
      ? `<div class="bk-notice warn"><b>端末内のひかえが作れていません</b>
          <p>記録が多くなり、端末の保存領域に収まらなくなっている可能性があります。
          上の<b>「バックアップを保存する」</b>でファイルに残しておいてください。</p></div>`
      : `<p class="cs">まだひかえはありません。学習をはじめると自動で作られます。</p>`;
    return;
  }
  box.innerHTML = list.map((b, i) => {
    const idx = loadBackups().length - 1 - i;
    const con = Object.keys(b.data.mem || {}).length;
    const hw = (b.data.homework || []).length;
    const gr = (b.data.grades || []).length;
    return `<div class="bk-item">
      <div><b>${esc(b.date)}</b>${b.label ? ` <span class="bk-tag">${esc(b.label)}</span>` : ""}
        <span class="bk-meta">概念${con} ・ 宿題${hw} ・ テスト${gr}</span></div>
      <button class="btn btn-sm btn-ghost" data-restore="${idx}">これに戻す</button>
    </div>`;
  }).join("");
  box.querySelectorAll("[data-restore]").forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.restore);
    const bk = loadBackups()[i];
    if (!confirm(`${bk.date} の状態に戻します。\n\n今の状態も自動でひかえを取るので、やり直せます。`)) return;
    if (restoreBackup(i)) { alert("戻しました。"); location.reload(); }
  });
}

/* ═══════════════ AIプロバイダの設定画面 ═══════════════ */

function renderProviderUI() {
  const p = curProvider();
  $("#provider").value = S.provider;
  $("#providerNote").textContent = p.note;

  $("#model").value = curModel();
  $("#modelList").innerHTML = p.models
    .map((m) => `<option value="${esc(m.id)}">${esc(m.label || "")}</option>`).join("");
  $("#modelNote").innerHTML = modelNoteHtml(p);

  const needBase = !!p.needsBaseUrl;
  $("#baseUrlRow").hidden = !needBase;
  if (needBase) $("#baseUrl").value = curBaseUrl();

  $("#apiKeyLabel").firstChild.nodeValue = p.keyLabel;
  $("#apiKey").placeholder = p.keyPlaceholder;
  $("#apiKey").value = curKey();
  $("#keyNote").innerHTML =
    `<a href="${p.keyUrl}" target="_blank" rel="noopener">${esc(new URL(p.keyUrl).host)}</a> で取得できます。`;
}

/** モデルごとの目安金額。価格が不明なものは出さない */
function modelNoteHtml(p) {
  const rows = p.models.filter((m) => m.inUsd != null).map((m) => {
    const yen = costPerTurnYen(S.provider, m.id);
    return `${esc(m.label)} … 1往復あたり<b>約${yen}円</b>`;
  });
  if (!rows.length) return "モデル名は提供元の表記どおりに入力してください。";
  return rows.join(" / ") +
    "<br>※ 入力8,000・出力800トークン、1ドル155円で計算した目安です。実際の請求は提供元の画面で確認してください。";
}

async function fetchModelList() {
  const key = $("#apiKey").value.trim() || curKey();
  if (!key) { $("#settingsMsg").textContent = "先にAPIキーを入れてください"; return; }
  const btn = $("#fetchModels");
  btn.disabled = true; btn.textContent = "取得中…";
  try {
    const base = curProvider().needsBaseUrl ? ($("#baseUrl").value.trim() || curBaseUrl()) : "";
    const list = await listModels(S.provider, key, base);
    if (!list.length) throw new Error("使えるモデルが見つかりませんでした");
    $("#modelList").innerHTML = list
      .map((m) => `<option value="${esc(m.id)}">${esc(m.label || "")}</option>`).join("");
    $("#settingsMsg").textContent = `${list.length}件のモデルを取得しました。モデル欄をタップすると選べます`;
  } catch (e) {
    $("#settingsMsg").textContent = (e instanceof ApiError ? e.friendly() : String(e.message || e));
  } finally {
    btn.disabled = false; btn.textContent = "使えるモデルの一覧を取得";
    setTimeout(() => ($("#settingsMsg").textContent = ""), 6000);
  }
}


/* ═══════════════ 宿題 ═══════════════ */

function renderHomework() {
  const open = openAssignments(S.homework);
  const rest = remainingMinutes(S.homework, S.dailyMinutes);
  const sum = homeworkSummary(S.homework, S.dailyMinutes);

  $("#hwNote").textContent = open.length ? `${open.length}件(今日ぶん ${sum.todayCount}件)` : "";

  if (!open.length) {
    $("#hwList").innerHTML = `<p class="cs hw-empty">今日出ている宿題はありません。<br>
      学校の宿題は「取り込む」から、AI先生の宿題は上のボタンから出してもらえます。</p>`;
  } else {
    $("#hwList").innerHTML = open.map((a) => {
      const p = assignmentProgress(a);
      const tag = a.source === "school" ? '<span class="hw-tag hw-school">学校</span>' : '<span class="hw-tag hw-ai">AI先生</span>';
      const overdue = a.due < todayISO();
      const later = a.due > todayISO();
      return `<div class="hw ${p.done === p.total ? "hw-done" : ""}">
        <div class="hw-head">
          <div>${tag}<b class="hw-title">${esc(a.title)}</b></div>
          <span class="hw-meta">${p.done}/${p.total}問 ・ 約${a.minutes || estimateMinutes(a)}分${overdue ? ' ・ <b class="hw-late">期限すぎ</b>' : later ? ` ・ ${esc(a.due.slice(5))}まで` : ""}${p.stuck ? ` ・ <b class="hw-late">わからない${p.stuck}問</b>` : ""}</span>
        </div>
        ${a.reason ? `<p class="hw-reason">${esc(a.reason)}</p>` : ""}
        <div class="bar"><i style="width:${p.pct}%"></i></div>
        <div class="hw-items">${a.items.map((it) => `
          <div class="hw-item ${it.status}">
            <span class="hw-n">${it.n}</span>
            <span class="hw-q">${esc(it.q)}</span>
            <span class="hw-mark">${it.status === "todo" ? "" : it.correct === true ? "○" : it.correct === false ? "×" : "?"}</span>
          </div>`).join("")}</div>
        <div class="hw-btns">
          <button class="btn btn-sm" data-hw-start="${a.id}">この宿題をやる</button>
          <button class="btn btn-sm btn-ghost" data-hw-stuck="${a.id}">わからないところがある</button>
        </div>
      </div>`;
    }).join("");

    $$("[data-hw-start]").forEach((b) => b.onclick = () => startHomework(b.dataset.hwStart));
    $$("[data-hw-stuck]").forEach((b) => b.onclick = () => askHomeworkHelp(b.dataset.hwStuck));
  }

  const budget = S.dailyMinutes || DEFAULT_MINUTES;
  $("#hwBudget").innerHTML = sum.stuckCount
    ? `⚠ 「わからない」が ${sum.stuckCount}問 あります。まずそこから一緒に見ましょう。`
    : `今日の目安 ${budget}分 のうち、あと <b>約${rest}分</b> ぶん入ります。` +
      (rest < MIN_AI_MINUTES ? " 今日はもう十分です。" : "") +
      (sum.accuracy7 != null ? `<br>直近7日の正答率 ${sum.accuracy7}%(ねらいは85%前後です)` : "");
}

function startHomework(id) {
  const a = S.homework.find((x) => x.id === id);
  if (!a) return;
  S.persona = "sensei"; renderPersona(); go("study");
  const next = a.items.find((i) => i.status === "todo") || a.items[0];
  send(`「${a.title}」の${next.n}問目からやりたいです。答えは先に言わないで、一緒に進めてください。`);
}

function askHomeworkHelp(id) {
  const a = S.homework.find((x) => x.id === id);
  if (!a) return;
  S.persona = "sensei"; renderPersona(); go("study");
  send(`「${a.title}」でわからないところがあります。どこがわからないか一緒に見つけてください。`);
}

function showScanHelp() {
  addMsg("sys", "");
  const el = $("#chat").lastElementChild;
  el.innerHTML = `<div class="scan-help">
    <b>📄 宿題をきれいに取り込むには</b>
    <p><b>いちばん読み取りやすいのは、iPhoneの「書類スキャン」です。</b>
      斜めやゆがみを自動でまっすぐに直し、影を飛ばしてくれるので、
      手で持って撮った写真よりずっと正確に読めます。</p>
    <ol>
      <li><b>メモ</b>アプリを開いて、新しいメモを作る</li>
      <li>カメラのマークをタップ →「<b>書類をスキャン</b>」</li>
      <li>宿題のページにかざす(自動で撮れます)。複数ページなら続けて撮る</li>
      <li>「保存」→ 画像を長押しして「<b>写真に保存</b>」</li>
      <li>このアプリに戻って「<b>スキャン</b>」ボタン → 保存した画像を選ぶ</li>
    </ol>
    <p><b>ファイル</b>アプリの「…」→「書類をスキャン」でも同じことができます。
      こちらはPDFで保存されますが、そのまま送れます(Gemini・Claudeのみ)。</p>
    <p class="scan-tip">📷「カメラ」ボタンはその場で1枚だけ撮るとき用です。急ぐときはこちらでも大丈夫。
      <b>明るい場所で、影が入らないように、まっすぐ上から</b>撮ってください。</p>
  </div>`;
  $("#chat").scrollTop = $("#chat").scrollHeight;
  go("study");
}

init();
