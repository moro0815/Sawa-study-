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
const APP_VERSION = "v29";
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
  engage: {},            // 教科ID -> {selfStarted, questions} 興味の段階の判定用
  actLog: [],            // 使った活動の型の履歴(飽きの防止)
  quizDone: {},          // 勉強法クイズの回答
  apiLog: [],            // 直近のAPI呼び出し記録
  eng: {},               // 英語 {pron, words, conv, log} — 発音の記録・単語の記憶状態・会話回数
  luke: {},              // 相棒 Luke {bornAt, metAt, tricks, memories, mood, pats, taught}
  write: {},             // 書く練習(漢字・つづり)。write.js
  ansLog: [],            // 1問ごとの記録(原因・転移レベル・時刻・使った手)。cause.js
  ansAgg: null,          // 古いログを落としても残す集計
  tr: {},                // 概念ID -> 転移レベルの状態。transfer.js
  karte: [],             // 学習カルテ(AIの自己評価ログ)。karte.js を参照
  karteAgg: null,        // 古い記録を落としても残す集計 {total, types, subjects, first}
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
  personaPinned: false,   // 自分で相手を選んだか(選んだら勝手に切り替えない)
  pendingConf: null,
  lastConf: null,
});

let S = load();
let pendingFiles = [];   // 送信待ちの写真・スキャン(複数可)
let busy = false;
let inflight = null;   // 送信中のリクエスト。「やめる」で中断する
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

/* ── CSP(通信先の制限)との整合チェック ───────────────────
   index.html の connect-src で通信先を固定した。良いことだが、
   「OpenAI互換」で一覧にないサービスを入れると、送信が黙って失敗する。
   原因の見えない不具合はいちばん困るので、設定画面で先に知らせる。 */

/** index.html の CSP に書いてある通信先の一覧。CSPが無ければ null */
function cspConnectList() {
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (!meta) return null;
  const m = /connect-src([^;]*)/i.exec(meta.getAttribute("content") || "");
  return m ? m[1].trim().split(/\s+/).filter(Boolean) : null;
}

/** その URL へ通信できるか。できないときだけ、そのホスト名を返す */
function cspBlockedHost(url) {
  const list = cspConnectList();
  if (!list) return "";
  let u; try { u = new URL(url); } catch { return ""; }
  if (u.origin === location.origin) return list.includes("'self'") ? "" : u.host;
  const ok = list.some((src) => {
    try { return new URL(src).host === u.host; } catch { return false; }
  });
  return ok ? "" : u.host;
}
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
/**
 * 書き出す中身。
 * @param secrets true で認証情報も含める(端末内のひかえ用)
 * @param withArt true で Luke の絵も含める。
 *   端末内のひかえには入れない — 12世代ぶん持つと容量を食いつぶすため。
 *   ファイル書き出しとサーバー預けには入れる(機種変更で絵が消えないように)。
 */
/* ★withArt が立つのは「ファイル書き出し」と「サーバーのひかえ」のとき。
   生データもそのときだけ入れる。端末内の12世代のひかえに毎回入れると
   localStorage を食いつぶすため。 */
function backupPayload(secrets = true, withArt = false) {
  const { chat, apiMessages, ...rest } = S;
  const extra = withArt
    ? { ...(lukeArtCount() ? { lukeArt: loadLukeArt() } : {}), rawEvents: rawExport() }
    : {};
  if (secrets) return { ...rest, ...extra };
  const { apiKeys, srvToken, ...safe } = rest;
  return { ...safe, ...extra };
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
    name: S.name, grade: S.grade, data: backupPayload(false, true),
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
  const { lukeArt, rawEvents, ...rest } = data;  // 絵と生データは別の場所にしまう
  if (lukeArt && Object.keys(lukeArt).length) saveLukeArt(lukeArt);
  if (Array.isArray(rawEvents) && rawEvents.length) {
    // ★生データは「置きかえ」ではなく「足しこみ」。
    //   別の端末のひかえを読んでも、こちらの記録が消えないようにする
    rawImport(rawEvents).then((n) => { if (n) toast(`生データを ${n}件 取り込みました`); renderRawInfo(); });
  }
  S = { ...defaults(), ...rest, chat: [], apiMessages: [] };
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
      name: S.name, grade: S.grade, data: backupPayload(false, true),
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
/* ★回答時間。AIの問いかけが画面に出てから、沙和さんが送るまでの時間。
   速すぎる = 勘、遅すぎる = 詰まっている、の判断材料になる。
   分からないときは null。推測で埋めない。 */
let lastAskAt = 0, lastAnswerMs = null;
function markAsked() { lastAskAt = Date.now(); }
function markAnswered() { lastAnswerMs = lastAskAt ? Date.now() - lastAskAt : null; lastAskAt = 0; }
function answerMs() { return lastAnswerMs; }

/** いま何分続けているか。計測していなければ null(推測で埋めない) */
function timerMinutes() {
  if (!timer.on) return null;
  return Math.round((timer.elapsed + (Date.now() - timer.start)) / 60000);
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

      /* ★1問ぶんの記録 — 何時か・始めて何分か・どの手を使ったかまで残す。
         これがたまると「夜は計算ミスが増える」が実測で言えるようになる。 */
      const cause = input.correct ? "" : (input.error_cause || "");
      const lvl = input.transfer_level || 1;
      logAnswer(S, {
        conceptId: c.id, subject: SUBJECTS[c.s]?.name || "", correct: !!input.correct,
        confidence: input.confidence, cause, level: lvl, tactic: input.tactic,
        minsIn: timerMinutes(),
      });
      /* ★生データ(消さない層)。分析データはここから作り直せる */
      rawPush({
        kind: "answer", qid: input.question_id || "", concept: c.id,
        subject: SUBJECTS[c.s]?.name || "", answer: input.answer_text || "",
        expect: "", correct: !!input.correct, conf: input.confidence,
        ms: answerMs(), grade: input.grade, cause, level: lvl,
        tactic: input.tactic || "", minsIn: timerMinutes(),
      });
      const tr = noteTransfer(S, c.id, lvl, !!input.correct);

      // Luke はここで必ず反応する(AIが luke_react を忘れても動くように)
      lukeReact(S, r.quadrant === "hi-wrong" ? "hiwrong" : input.correct ? "correct" : "wrong");
      save(); renderAll();

      const q = QUADRANTS[r.quadrant];
      if (r.quadrant === "hi-wrong") toast("🚨 わかったつもり発見 — ここが一番伸びる場所です");
      const next = nextChallenge(S, c.id);
      const cz = cause ? ERROR_CAUSES[cause] : null;
      return {
        recorded: c.n, quadrant: r.quadrant, quadrant_name: q.name,
        mastery: Math.round(st.mastery * 100) / 100,
        next_review_in_days: Math.round(r.interval * 10) / 10,
        /* ★原因ごとの手当て。ここが空だと「とりあえず教え直す」になる */
        cause: cz ? cz.label : (input.correct ? "" : "(未分類 — 次回は error_cause を入れてください)"),
        cause_action: cz ? cz.move : "",
        transfer: next.done
          ? `Lv${next.top} まで通りました。この概念は「できた」で構いません`
          : `次は Lv${next.level} ${next.label}(あと${next.need}問)— ${next.ask}`,
        transfer_advanced: tr.advanced ? `Lv${tr.lv} に上がりました` : "",
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

    case "note_activity": {
      const ok = noteActivity(S, input.activity);
      save();
      return ok ? { noted: input.activity, recent: recentActivities(S, 3).map((x) => x.id),
                    next_suggestions: suggestActivities(S).slice(0, 3).map((a) => ({ id: a.id, name: a.name, what: a.what })) }
                : { error: "unknown activity", valid: ACTIVITIES.map((a) => a.id) };
    }

    case "note_engagement": {
      const x = noteEngagement(S, input.subject, input.kind);
      save(); renderAll();
      const p = interestPhase(S, input.subject);
      return { noted: true, counts: x, phase: { n: p.n, name: p.name, do_this: p.doThis, dont: p.dont } };
    }

    case "get_learning_style": {
      const subj = ["math", "science", "english", "japanese", "social"];
      return {
        phases: subj.map((id) => {
          const p = interestPhase(S, id);
          return { subject: SUBJECTS[id]?.name || id, subject_id: id, phase: p.n, name: p.name,
                   do_this: p.doThis, dont: p.dont, signals: p.signals };
        }),
        recent_activities: recentActivities(S, 3).map((x) => ACT_MAP[x.id]?.name),
        suggestions: suggestActivities(S).slice(0, 4).map((a) => ({ id: a.id, name: a.name, what: a.what })),
        methods: STUDY_METHODS.map((m) => {
          const ev = m.evidence(S);
          return { name: m.name, instead_of: m.bad, do_this: m.good, why: m.why,
                   your_data: ev ? ev.text : "まだ判断できるだけの記録がありません" };
        }),
        recent_wins: recentWins(S).map((w) => `${w.name}(${w.kind})`),
        note: "興味の段階は飛ばせません。1〜2の教科に自律を求めないでください。",
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

    /* ── 相棒 Luke ─────────────────────────────────── */

    case "luke_react": {
      const m = lukeReact(S, input.kind);
      save(); renderLuke();
      const mood = LUKE_MOODS[m];
      return {
        mood: mood.name, mood_id: m, says: lukeLine(S, mood),
        instruction: m === "treasure"
          ? "Lukeは【いちばん喜んでいます】。自信ありで間違えた場所は最も強く直るからです。落ち込ませず、見つかったことを一緒に喜んでください。"
          : m === "tilt"
          ? "Lukeは首をかしげているだけです。がっかりした様子は出さないでください。間違いで態度を変える犬ではありません。"
          : m === "sulk"
          ? "Lukeはそっぽを向いています。ただし怒っていません。答えを渡さないための、ふざけたそっぽです。すぐに戻ります。"
          : m === "snuggle"
          ? "Lukeは黙ってすりよっています。解決策を出さず、そのままでいてください。"
          : "そのまま続けてください。",
      };
    }

    case "get_luke": {
      const a = lukeAge(S), st = lukeStage(S), l = lukeState(S);
      const next = nextTrick(S);
      return {
        name: LUKE_INFO.name, breed: LUKE_INFO.breed,
        age: a.text, age_in_human_years: a.human, stage: st.name, stage_note: st.note,
        days_together: daysTogether(S),
        mood: lukeMood(S).name,
        tricks_learned: lukeTricks(S).filter((t) => t.got).map((t) => t.name),
        next_trick: next ? { name: next.name, how: next.how, why: next.why } : null,
        recent_memories: l.memories.slice(-5).map((m) => `${m.at} ${m.text}`),
        times_taught_by_sawa: l.taught,
        instruction:
          "芸の条件は【良いやり方ができたか】であって、正解の数ではありません。" +
          "「これができたら芸が増えるよ」とごほうびにしないでください。あとから気づく形にします。",
      };
    }

    /* ── 英語 ───────────────────────────────────────── */

    case "get_english_status": {
      const L = englishLayer(S);
      const w = wordStats(S);
      return {
        layer: { n: L.n, name: L.name, goal: L.goal, why: L.why, doing: L.doing },
        all_layers: ENG_LAYERS.map((x) => `${x.n}.${x.name}`),
        concepts: { learned: L.learned, total: L.total },
        words: w,
        conversations: L.conv,
        weak_sounds: weakPhonemes(S, 3).map((p) => ({
          id: p.id, name: p.name, japanese_problem: p.jp,
          accuracy: p.acc == null ? null : Math.round(p.acc * 100), tries: p.n, tip: p.tip,
        })),
        grammar_targets: weakGrammarTraps(S, 4).map((t) => ({
          id: t.id, name: t.name, wrong: t.ng, right: t.ok, why_japanese: t.why, rule: t.rule,
        })),
        due_words: dueWords(S, 8),
        instruction:
          "会話中は文法を直さないでください。直すのは会話が終わったあと、2〜3点だけです。" +
          "発音はカタカナで書かず、口と舌の形で説明してください。" +
          (GRADES.indexOf(S.grade || "中1") <= 2 ? "中学生なので、受験の話はしないでください。" : ""),
      };
    }

    case "get_english_material": {
      const id = input.id;
      const pick = (arr, key) => (id ? arr.filter((x) => x[key] === id) : arr);
      switch (input.kind) {
        case "phoneme":
          return { items: pick(PHONEMES, "id").map((p) => ({
            id: p.id, name: p.name, japanese_problem: p.jp, why: p.why,
            mouth: p.how, minimal_pairs: p.pairs, words: p.words || null, phrases: p.phrases || null, tip: p.tip,
          })), note: "カタカナで書かないこと。口・舌・歯のどこが当たるかで説明してください。" };
        case "grammar":
          return { items: pick(GRAMMAR_TRAPS, "id"),
            note: "「なぜ日本語だとそうなるのか」を必ずセットで説明してください。理由が分かると同じ間違いが減ります。" };
        case "reading":
          return { discourse_markers: DISCOURSE, question_types: QUESTION_TYPES, rules: READING_RULES,
            note: "訳させないこと。名詞の後ろの修飾で区切らせることが最重要です。" };
        case "writing":
          return { steps: WRITING_STEPS, essay_frame: ESSAY_FRAME,
            note: "いきなり英訳させず、必ず和文和訳から入ってください。" };
        case "exam":
          return GRADES.indexOf(S.grade || "中1") <= 2
            ? { blocked: true, note: "沙和さんは中学生です。受験の話は出さないでください。代わりに「今できるようになること」を見せてください。" }
            : { ...EXAM_ENGLISH };
        case "irregular":  return { groups: IRREGULAR, note: "型でまとめると覚える量が減ります。ひっかけの lie/lay と rise/raise は必ず区別させてください。" };
        case "parts":      return { items: WORD_PARTS, note: "知らない語が出たら、まず接辞と語根で崩せないか試させてください。" };
        case "trap":       return { items: TRAP_WORDS, note: "和製英語は、そのまま言うと通じないか、別の意味になります。" };
        case "poly":       return { items: POLYSEMY, note: "知っている意味で読むと外れる語です。長文で出たら文脈から選ばせてください。" };
        case "conversation":
          return { topics: CONV_TOPICS, fluency_432: FLUENCY_432,
            note: "会話中は直さないでください。短い返事でも内容で受けてください。" };
        case "vocab":
          return { coverage: COVERAGE, coverage_note: COVERAGE_NOTE, stats: wordStats(S) };
        default:
          return { error: "unknown kind", valid: ["phoneme","grammar","reading","writing","exam","irregular","parts","trap","poly","conversation","vocab"] };
      }
    }

    case "add_english_word": {
      const w = addWord(S, input.word, input.meaning, input.example, input.note);
      if (!w) return { error: "word is empty" };
      save(); renderEnglish();
      return { added: w.word, meaning: w.meaning, total_words: wordStats(S).total,
               note: "忘れかけたころに自動で復習に出ます。裸で覚えさせず、例文の中で使ってください。" };
    }

    case "record_english_word": {
      const r = reviewWord(S, input.word, input.grade, input.confidence);
      if (!r) return { error: "unknown word", hint: "先に add_english_word で登録してください" };
      save(); renderEnglish();
      const q = QUADRANTS[r.quadrant];
      return { word: input.word, quadrant: r.quadrant, quadrant_name: q.name,
               next_review_in_days: Math.round(r.interval * 10) / 10,
               instruction: r.quadrant === "hi-wrong"
                 ? "自信ありで間違えました。訂正したあと、その語を使った短い英文をもう1つ作らせてください。"
                 : "そのまま続けてください。" };
    }

    case "note_english_conversation": {
      const n = noteConversation(S, input.topic, input.turns, englishLayer(S).n);
      save(); renderEnglish();
      return { total_conversations: n, feedback_recorded: input.feedback || "",
               instruction: "直すのは2〜3点までにしてください。多く言うほど、次に話す量が減ります。" };
    }

    case "add_write_item": {
      const it = addWriteItem(S, input);
      if (!it) return { error: "answer is required" };
      save(); 
      const st = writeStats(S);
      return { added: it.a, kind: it.kind, total_kanji: st.kanji.total, total_spell: st.spell.total,
               note: "ホームの「✍️ 書く」から練習に出ます。忘れかけたころに自動で出てきます。" };
    }

    /* ── 転移レベルによる習得判定 ────────────────────
       「同じ形が3問解けた」を習得と呼ばないためのしくみ。 */
    case "get_mastery_plan": {
      const c = CONCEPT_MAP[input.concept_id];
      if (!c) return { error: "unknown concept_id" };
      const n = nextChallenge(S, c.id);
      return {
        concept: c.n,
        reached_level: masteredLevel(S, c.id),
        required_top_level: n.top,
        why: n.reason,
        mastered: n.done,
        next_level: n.done ? null : n.level,
        next_label: n.done ? null : n.label,
        remaining_at_this_level: n.done ? 0 : n.need,
        what_to_ask: n.done ? "この概念はもう出さなくて構いません。復習の巡回にまかせてください。" : n.ask,
        ladder: transferLadder(S, c.id).map((l) => `Lv${l.lv} ${l.label} … ${l.state}`),
      };
    }

    case "grade_explanation": {
      const c = CONCEPT_MAP[input.concept_id];
      if (!c) return { error: "unknown concept_id" };
      const v = gradeExplanation(S, c.id, input);
      // 説明できたこと自体はプロテジェ効果の本体。合否に関わらずLukeは喜ぶ
      lukeReact(S, "taught");
      if (input.summary) {
        addKarte(S, {
          subject: SUBJECTS[c.s]?.name || "", concept_ids: [c.id],
          stumble: `Lukeへの説明(${c.n})`, corrected: String(input.summary).slice(0, 240),
          error_type: v.passed ? "" : "concept",
          next_check: v.passed ? "" : `${c.n} を、${v.missing[0] || "もう一度"} の点からもう一度説明させる`,
        });
      }
      save(); renderAll();
      if (v.passed) toast(`🐾 ${c.n} — Lukeに説明できました`);
      return {
        concept: c.n,
        passed: v.passed,
        missing: v.missing,
        attempts: v.attempts,
        mastered: isMastered(S, c.id),
        instruction: v.passed
          ? "合格です。**手順の暗記では説明は通りません。**本当に分かったと言ってよい状態です。"
            + "短く、具体的にほめてください(『説明できるのがいちばん強い』)。"
          : `まだ通っていません。**やり直しを命じないでください。**足りなかったのは「${v.missing[0]}」の1点だけです。`
            + "そこだけをもう一度聞いてください(『じゃあ、なんでそうなるのかLukeに教えてあげて?』)。"
            + "落ちたことを本人に伝える必要はありません。",
      };
    }

    /* ── 学習カルテ ────────────────────────────────
       AIに毎回「どうつまずいて、どう直ったか」を書かせる。
       ためた内容は kartePromptBlock() で次回のプロンプトに戻る。 */
    case "record_session_review": {
      if (!String(input.stumble || "").trim()) {
        return { error: "stumble is required", hint: "最初のつまずきが書けないなら、まだ記録するタイミングではありません" };
      }
      const k = addKarte(S, input);
      save(); renderKarte();
      const prof = learnerProfile(S);
      return {
        recorded: k.id, date: k.date,
        error_type: k.errorType ? LEARNER_TYPES[k.errorType].label : "(未分類)",
        total_reviews: prof.total,
        resolved: input.resolves_id ? "前回の確認事項を1件、済みにしました" : "",
        instruction: prof.enough
          ? `これまでの傾向は「${prof.top.icon} ${prof.top.label}」が最多(${Math.round(prof.top.share * 100)}%)です。`
            + `${prof.top.move} ただし今回が当てはまるとは限りません。沙和さんにこの分類を伝える必要はありません。`
          : `あと ${prof.need} 回ぶんたまると傾向が出せます。少ない回数で決めつけないようにしています。`,
      };
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
    get_english_status: "🌍 英語の状況を確認中…",
    get_english_material: "📗 英語の教材データを参照中…",
    add_english_word: "🆕 単語を登録中…",
    record_english_word: "📝 単語の結果を記録中…",
    note_english_conversation: "💬 英会話を記録中…",
    luke_react: "🐾 Lukeが反応中…",
    get_luke: "🐾 Lukeの様子を確認中…",
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

  busy = true;
  markAnswered();          // ★AIの問いかけから、ここまでの時間を回答時間として拾う
  inflight = new AbortController();
  setSendMode(true);

  // 人格の自動提案(押しつけない)
  // ★自分で選んだ相手からは、勝手に離れない。
  //   例外は「つらそうな合図」のときだけ — これは comfort の方向にしか動かない。
  const suggested = suggestPersona(text);
  const maySwitch = suggested && suggested !== S.persona && !override
    && (!S.personaPinned || isDistress(text));
  if (maySwitch) {
    const p = PERSONAS[suggested];
    toast(`${p.id === "aibou" ? "🐾" : p.emoji} ${p.name}(${p.role})に切り替えました`);
    S.persona = suggested; S.personaPinned = false; renderPersona();
  }

  const files = pendingFiles.slice();     // やめたときに戻せるよう控える
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

  const thinking = addMsg("ai", `${PERSONAS[S.persona].name}が考えています…(${providerOf(S.provider).short} ${curModel()} に問い合わせ中)`);
  thinking.parentElement.classList.add("think");
  let span = null;

  try {
    const res = await chatWithTools({
      provider: S.provider, model: curModel(), apiKey: curKey(), baseUrl: curBaseUrl(),
      system: buildSystemPrompt(S.persona, {
        name: S.name, grade: S.grade, career: curCareer(),
        pastDreams: (S.dreamHistory || []).map((d) => CAREER_MAP[d.career]?.name).filter(Boolean),
        homeworkStatus: homeworkStatusText(S.homework, S.dailyMinutes),
        learningBlock: learningPromptBlock(S),
        englishBlock: englishPromptBlock(S),
        englishStatus: englishStatusText(S),
        lukeBlock: lukePromptBlock(S, S.persona),
        lukeStatus: lukeStatusText(S),
        karteBlock: kartePromptBlock(S),
        todayBlock: todayPromptBlock(S),
        writeBlock: writePromptBlock(S),
        transferBlock: transferPromptBlock(S),
        causeBlock: causePromptBlock(S),
      }, statusSummary()),
      messages: S.apiMessages,
      tools: TOOLS,
      onDelta: (t) => {
        if (!span) { thinking.parentElement.remove(); span = addMsg("ai", ""); }
        span.textContent += t; $("#chat").scrollTop = $("#chat").scrollHeight;
      },
      onToolUse: (n) => { if (!span) { thinking.parentElement.remove(); span = null; } toolLog(n); },
      onRound: (i) => { if (i > 0 && !span) toolLog("__round" + i); },
      runTool,
      signal: inflight.signal,
    });

    if (!span && res.text) { thinking.parentElement?.remove(); span = addMsg("ai", res.text); }
    else if (!span) thinking.parentElement?.remove();

    // 何がどれだけ動いたかを残す・見せる
    const u = res.stat?.usage || { in: 0, out: 0 };
    const rec = { ok: true, provider: S.provider, model: curModel(), ms: res.stat?.ms || 0,
                  in: u.in, out: u.out, yen: usageYen(S.provider, curModel(), u),
                  tools: res.stat?.tools || [] };
    logApi(rec);
    if (span?.parentElement) {
      const meta = document.createElement("div");
      meta.className = "msg-meta";
      meta.textContent = apiMetaLine(rec);
      span.parentElement.appendChild(meta);
    }

    S.apiMessages = res.messages;
    S.chat.push({ who: "ai", text: res.text, persona: S.persona });

    // AIが問題を出したら確信度パネルを開く
    if (/自信|確信|どのくらい/.test(res.text) && /[?？]/.test(res.text)) $("#confPanel").hidden = false;
    if (/[?？]/.test(res.text)) markAsked();   // ★問いかけが出た時刻 = 回答時間の起点
    save(); renderAll();
  } catch (e) {
    thinking.parentElement?.remove();
    S.apiMessages.pop(); S.chat.pop();

    // ★「やめる」で止めた場合。失敗ではないので、書いた内容を入力欄に戻すだけ
    if (e instanceof ApiError && e.kind === "abort") {
      $("#chat").lastElementChild?.remove();          // 自分の発言も画面から消す
      if (typeof sendText === "string") inp.value = text;
      if (files.length) { pendingFiles = files; renderPreview(); }
      save(); renderAll();
      toast("送信をやめました");
      return;
    }

    // 履歴の tool_use / tool_result の対応が崩れていたら、その場で直す。
    // 直さないと以後ずっと同じエラーが出続けてしまう。
    logApi({ ok: false, provider: S.provider, model: curModel(),
             error: e instanceof ApiError ? e.friendly() : String(e.message || e) });
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
    busy = false; inflight = null;
    setSendMode(false);
    renderUndo();
  }
}

/* ── 送信ボタン:送信中は「やめる」に変わる ───────────────── */

function setSendMode(sending) {
  const b = $("#send");
  if (!b) return;
  b.classList.toggle("stop", sending);
  b.textContent = sending ? "■" : "↑";
  b.title = sending ? "送信をやめる" : "送る";
  b.setAttribute("aria-label", sending ? "送信をやめる" : "送る");
}

/** 送信中に押されたら中断する */
function stopSending() {
  if (!busy || !inflight) return;
  inflight.abort();
  toast("やめています…");
}

/* ── 直前のやりとりを取り消す ───────────────────────────────
   写真を送りまちがえた、聞き方をまちがえた、というときに使う。
   ★消えるのは【会話だけ】。記録した宿題や答えの記録は消さない。
     ここで一緒に消すと、正しく記録されたものまで巻き添えになるため。 */

/** API履歴の中で、直前のやりとりが始まる位置 */
function lastTurnStart(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    const isResult = Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result");
    if (m.role === "user" && !isResult) return i;
  }
  return -1;
}

function canUndo() {
  return !busy && S.chat.some((m) => m.who === "user");
}

function undoLastTurn() {
  if (!canUndo()) return;
  const i = lastTurnStart(S.apiMessages);
  if (i >= 0) S.apiMessages = S.apiMessages.slice(0, i);
  S.apiMessages = repairPairs(S.apiMessages);

  // 表示側も、最後の自分の発言から後ろを消す
  let j = -1;
  for (let k = S.chat.length - 1; k >= 0; k--) if (S.chat[k].who === "user") { j = k; break; }
  if (j >= 0) S.chat = S.chat.slice(0, j);

  save();
  redrawChat();
  toast("直前のやりとりを取り消しました");
}

/** 会話の表示を作り直す */
function redrawChat() {
  const box = $("#chat");
  box.innerHTML = "";
  for (const m of S.chat.slice(-40)) addMsg(m.who, m.text, { img: m.img, persona: m.persona });
  if (!S.chat.length) {
    box.innerHTML = `<div class="hint">話す相手を選んで、話しかけてみてください。<br>
      宿題や問題集は <b>📷</b> から写真で送れます。<br><br>
      ミミ先生🐰 = 教える人 / Luke🐾 = 相棒 / ナギ🦉 = 伴走者</div>`;
  }
  renderUndo();
}

function renderUndo() {
  const b = $("#undoBtn");
  if (!b) return;
  b.hidden = !canUndo();
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
/* ★カメラボタン。まずアプリ内カメラを試し、だめならファイル選択に戻す。
   <input capture> はブラウザへの「お願い」でしかなく、パソコンでは必ず無視され、
   iPhoneでもホーム画面から開いたときはファイルアプリが出ることがあるため。 */
async function takePhoto() {
  const room = 6 - pendingFiles.length;
  if (room <= 0) { toast("いちどに送れるのは6枚までです"); return; }
  if (cameraSupported()) {
    const files = await openCamera({ max: room });
    if (files === null) {           // 権限拒否・カメラなし → 従来の方法へ
      toast("カメラを使えませんでした。写真を選んでください");
      $("#cameraIn").click();
      return;
    }
    if (files.length) intakeFiles(files, "camera");
    return;
  }
  $("#cameraIn").click();
}

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
  renderLuke();
  renderHomework();
  renderLearn();
  renderEnglish();
  renderApiPanel();
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

/* ═══════════ 書く練習(漢字・つづり)═══════════
   ★iPhone でも iPad でも同じ画面。Apple Pencil でも指でも書ける。
     ナビのタブは増やさない(iPhone では8個でもう限界)ので、
     カメラと同じく全画面のオーバーレイにしてある。 */

let wpKind = "kanji", wpList = [], wpIdx = 0, wpItem = null,
    wpConf = null, wpShown = false, wpStart = 0;

function openWritePad(kind) {
  wpKind = kind || "kanji";
  $("#writePad").hidden = false;
  document.body.style.overflow = "hidden";
  $$("[data-wk]").forEach((b) => b.classList.toggle("on", b.dataset.wk === wpKind));
  loadWriteList();
}

function closeWritePad() {
  $("#writePad").hidden = true;
  document.body.style.overflow = "";
  save(); renderAll();
}

function loadWriteList() {
  wpList = writeQueue(S, wpKind, 10);
  wpIdx = 0;
  if (!wpList.length) {
    $("#wpQ").innerHTML = wpKind === "kanji"
      ? `<div class="wp-empty">今日ぶんの漢字はもうありません。<br>また忘れかけたころに出てきます。</div>`
      : `<div class="wp-empty">つづりの練習に出せる単語がまだありません。<br>
          英語タブで単語が登録されると、ここに出てきます。<br>
          AI先生に「単語を登録して」と頼んでも増えます。</div>`;
    $("#wpConfRow").hidden = true;
    $("#wpAct").innerHTML = "";
    $("#wpCount").textContent = "";
    $("#wpNote").textContent = "";
    return;
  }
  showWriteItem();
}

function showWriteItem() {
  wpItem = wpList[wpIdx];
  wpConf = null; wpShown = false;
  $("#wpCount").textContent = `${wpIdx + 1} / ${wpList.length}`;
  $("#wpConfRow").hidden = false;
  $$("[data-wc]").forEach((b) => b.classList.remove("on"));
  $("#wpAnswer").hidden = true;

  $("#wpQ").innerHTML = wpItem.kind === "kanji"
    ? `<div class="wp-read">${esc(wpItem.r)}</div>
       <div class="wp-ex">${esc((wpItem.ex || "").replace("◯", "◯"))}</div>
       <div class="wp-hint">◯ のところに入る漢字を書いてください</div>`
    : `<div class="wp-read">${esc(wpItem.r || "この意味の単語")}</div>
       <div class="wp-ex">${esc(wpItem.ex || "")}</div>
       <div class="wp-hint">つづりを書いてください<button class="wp-say" id="wpSay">🔊 聞く</button></div>`;

  if (wpItem.kind === "spell") {
    const b = $("#wpSay");
    if (b) b.onclick = () => speakSafe(wpItem.a, { rate: 0.85 });
    setTimeout(() => speakSafe(wpItem.a, { rate: 0.85 }), 250);
  }

  const cv = $("#wpCanvas");
  requestAnimationFrame(() => padInit(cv));
  wpStart = Date.now();
  renderPadBtns();
  $("#wpNote").textContent = wpItem.w || "";
  $("#wpAct").innerHTML = `<button class="btn btn-primary" id="wpShow">答えを見る</button>`;
  $("#wpShow").onclick = revealWrite;
}

function renderPadBtns() {
  const empty = typeof padEmpty === "function" ? padEmpty() : true;
  const u = $("#wpUndo"), c = $("#wpClear"), a = $("#wpAsk");
  if (u) u.disabled = empty;
  if (c) c.disabled = empty;
  if (a) a.disabled = empty;
}

/* ★答えを出してから自己採点。無料・すぐ・通信なし。
   漢字練習は本来この形で、このアプリの「先に確信度」とも合う。 */
function revealWrite() {
  if (wpConf == null) { toast("先に「書けるかどうか」を押してください"); return; }
  wpShown = true;
  const el = $("#wpAnswer");
  el.hidden = false;
  el.innerHTML = `<span class="wp-a">${esc(wpItem.a)}</span>
    <span class="wp-al">こう書きます</span>`;
  $("#wpAct").innerHTML = `
    <button class="btn wp-ng" id="wpNg">ちがった</button>
    <button class="btn wp-ok" id="wpOk">合ってた</button>`;
  $("#wpOk").onclick = () => judgeWrite(true, "self");
  $("#wpNg").onclick = () => judgeWrite(false, "self");
}

function judgeWrite(ok, how) {
  const ms = Date.now() - wpStart;
  const r = recordWrite(S, wpItem.id, ok, wpConf, ms, how);
  if (r?.flagged) toast("🚨 自信あり × 書けなかった — ここが一番のびます");
  lukeReact(S, r?.quadrant === "hi-wrong" ? "hiwrong" : ok ? "correct" : "wrong");
  save();
  wpIdx++;
  if (wpIdx >= wpList.length) {
    $("#wpQ").innerHTML = `<div class="wp-empty">✓ 今日ぶん、おしまい!<br>
      <span>${wpList.length}文字やりました。また忘れかけたころに出てきます。</span></div>`;
    $("#wpConfRow").hidden = true;
    $("#wpAnswer").hidden = true;
    $("#wpAct").innerHTML = `<button class="btn btn-primary" id="wpDone">とじる</button>`;
    $("#wpDone").onclick = closeWritePad;
    $("#wpCount").textContent = "";
    $("#wpNote").textContent = "";
    return;
  }
  showWriteItem();
}

/** 迷ったものだけ、AI先生に見てもらう(1文字ごとに通信するため) */
function askWriteAI() {
  if (padEmpty()) { toast("先に書いてください"); return; }
  if (pendingFiles.length >= 6) { toast("いちどに送れるのは6枚までです"); return; }
  const url = padImage($("#wpCanvas"));
  pendingFiles.push({ kind: "image", name: "write.jpg", data: url.split(",")[1],
                      mediaType: "image/jpeg", previewUrl: url });
  renderPreview();
  closeWritePad();
  S.persona = "sensei"; S.personaPinned = true; renderPersona(); go("study");
  send(wpItem.kind === "kanji"
    ? `「${wpItem.r}」の漢字を書きました。正しくは「${wpItem.a}」です。形を見てください。書き順は写真からは分からないので言わないでください。`
    : `「${wpItem.a}」のつづりを書きました。合っているか見てください。`);
}

/* ── 今日のミッション ────────────────────────────────────
   ★ここが「3秒で始められる」の本体。
     選ばせるのをやめて、こちらで決める。決めるのがいちばん重い作業で、
     疲れている日はそこで閉じてしまうから。 */

let planMode = null;   // null = おまかせ。"mini" を押したときだけ固定

function renderMission() {
  const box = $("#cardMission");
  if (!box) return;
  const p = todayPlan(S, planMode);

  $("#msFace").innerHTML = lukeFace(52);
  $("#msSay").textContent = lukeHomeLine(S);

  const done = p.done;
  const bits = [];
  if (p.counts.hot) bits.push(`<li><b>いちばんのびるところ</b> × ${p.counts.hot}</li>`);
  const plainRev = p.counts.review - p.counts.hot;
  if (plainRev > 0) bits.push(`<li>復習 × ${plainRev}</li>`);
  if (p.counts.new) bits.push(`<li>新しいこと × ${p.counts.new}</li>`);

  $("#msBody").innerHTML = done
    ? `<div class="mi-done">✓ 今日のぶんは終わっています<br>
        <span>${(S.sessions || []).find((x) => x.date === todayISO())?.answered || 0}問こたえました。もうやらなくて大丈夫です。</span></div>`
    : `<div class="mi-min">${p.comeback ? `<b>${p.daysAway}日ぶり。軽くしておきました</b> ・ ` : ""}約 ${p.minutes} 分で終わります</div>
       <ul class="mi-list">${bits.join("") || "<li>まずは1問だけ</li>"}</ul>`;

  $("#msGo").textContent = done ? "それでも もう少しやる" : p.mode === "mini" ? "5分だけ始める" : "Lukeと始める";
  $("#msGo").className = "btn ms-go " + (done ? "btn-ghost" : "btn-primary");
  $("#msMini").classList.toggle("on", p.mode === "mini");
  // 今日なにかした日だけ「おしまい」を出す。何もしていない日に出すと催促に見える
  $("#msEnd").hidden = !todayAnswered(S);
}

function startToday(mode) {
  planMode = mode || null;
  const p = todayPlan(S, planMode);
  S.persona = "sensei"; S.personaPinned = true;
  save(); renderPersona(); go("study");
  const names = p.items.map((x) => x.concept.n).join("、");
  send(p.comeback
    ? `今日はひさしぶり。軽めでお願いします。${names} を短くやりたいです。`
    : p.mode === "mini"
    ? `5分だけやりたいです。${names} を短くお願いします。`
    : `今日の分をやりたいです。${names} の順でお願いします。`);
}

/* ★終わり方。正答率で締めない。 */
function showWrapUp() {
  const w = wrapUp(S);
  const el = document.createElement("div");
  el.className = "dream-modal";
  el.innerHTML = `<div class="dm-box wrap-box">
    <div class="wrap-face">${lukeFace(64)}</div>
    <div class="dm-t">今日できるようになったこと</div>
    <ul class="wrap-list">${w.got.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
    <p class="wrap-luke">${esc(w.lukeLine)}</p>
    <div class="wrap-meta">${w.answered ? `${w.answered}問 ・ ` : ""}${w.minutes ? `${w.minutes}分` : ""}</div>
    <button class="btn btn-primary" id="wrapClose">おしまい</button></div>`;
  document.body.appendChild(el);
  el.querySelector("#wrapClose").onclick = () => { el.remove(); go("home"); };
  lukeReact(S, "done"); save(); renderLuke();
}

function renderHome() {
  renderMission();
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
      <span class="pp-e">${p.id === "aibou" ? lukeFace(36) : p.emoji}</span><span class="pp-n">${p.name}</span>
      <span class="pp-r">${p.role}</span><span class="pp-need">${p.need}を支える</span></button>`).join("");
  $$("[data-persona]").forEach((b) => b.onclick = () => {
    S.persona = b.dataset.persona; S.personaPinned = true; save(); renderHome(); renderPersona(); go("study");
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
    `<button class="${S.persona === p.id ? "on" : ""}" data-pb="${p.id}" style="${S.persona === p.id ? `color:${p.color}` : ""}">${
      p.id === "aibou" ? `<span class="pb-luke">${lukeFace(20)}</span>` : p.emoji} ${p.name}</button>`).join("");
  $$("[data-pb]").forEach((b) => b.onclick = () => {
    S.persona = b.dataset.pb; S.personaPinned = true; save(); renderPersona(); renderHome();
    addMsg("ai", PERSONAS[S.persona].intro);
  });
  renderLukeMini();
  const qa = {
    sensei: ["今日の分をやりたい", "この前の復習して", "わからないところを診断して", "テストの準備をしたい"],
    aibou: ["ちょっと聞いてよ", "今日つかれた", "オレに教えて(説明したい)", "学校でこんなことがあった"],
    bansousha: ["今週の計画を立てたい", "テストが不安", "この成績どう思う?", "目標を決めたい"],
  }[S.persona];
  /* ★沙和さんに見える「深さ」の入口は、これ1つだけにしてある。
     転移レベルも誤答原因も画面には出さない。裏で回っていれば十分で、
     本人がやることは「問題を解く」「自信を押す」「Lukeに説明する」の3つ。 */
  const ready = explainReady(S);
  const rows = ready
    ? [`🐾 ${ready.n} をLukeに説明する`, ...qa.slice(0, 3)]
    : qa;
  $("#quickRow").innerHTML = rows.map((t, i) =>
    `<button class="qa${ready && i === 0 ? " qa-star" : ""}">${esc(t)}</button>`).join("");
  $$("#quickRow .qa").forEach((b) => b.onclick = () => {
    if (b.classList.contains("qa-star") && ready) {
      S.persona = "aibou"; S.personaPinned = true; save(); renderPersona(); 
      send(`${ready.n} を Luke に説明してみる。小学生にもわかるように話すから、聞いてて。`);
      return;
    }
    send(b.textContent);
  });
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

  renderSubjectPick();
  renderMap();
  renderDiagSelect();
}

/* ── 教科の選び方をひとつにする ─────────────────────────────
   ★以前は「マップの絞り込みボタン」と「診断の211件のドロップダウン」が
   別々に動いていた。どちらにも見出しが無く、選ぶ意味も見えなかった。
   ここで選んだ教科が、マップと診断の両方に効くようにした。 */

function renderSubjectPick() {
  const box = $("#subjPick");
  if (!box) return;
  box.innerHTML = Object.entries(SUBJECTS).map(([k, v]) => {
    const cs = conceptsBySubject(k);
    // ★マップの緑マスと同じ数え方にそろえる(以前は「触れた単元数」で、
    //   すぐ下のマップの見出しと数が食い違っていた)
    const done = cs.filter((c) => (S.mem[c.id]?.mastery || 0) >= 0.7).length;
    // その教科の「要注意(自信あり×不正解)」の数
    const alert = cs.filter((c) => {
      const st = S.mem[c.id];
      return st && (st.flagged || st.history.at(-1)?.q === "hi-wrong");
    }).length;
    return `<button class="sp ${k === mapFilter ? "on" : ""}" data-mf="${k}">
      <span class="sp-e">${v.emoji}</span>
      <b>${esc(v.name)}</b>
      <span class="sp-n">できた ${done} / ${cs.length}</span>
      ${alert ? `<span class="sp-a">要注意 ${alert}</span>` : ""}
    </button>`;
  }).join("");
  box.querySelectorAll("[data-mf]").forEach((b) => b.onclick = () => {
    mapFilter = b.dataset.mf;
    renderSubjectPick(); renderMap(); renderDiagSelect();
    $("#knowledgeMap")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/** 診断のドロップダウン。選んだ教科ぶんだけにして、学年でまとめる */
function renderDiagSelect() {
  const sel = $("#diagSelect");
  if (!sel) return;
  const keep = sel.value;
  const cs = conceptsBySubject(mapFilter);
  const byGrade = {};
  for (const c of cs) (byGrade[c.g] ||= []).push(c);
  sel.innerHTML = `<option value="">${SUBJECTS[mapFilter].name}の単元から選ぶ…</option>` +
    GRADES.filter((g) => byGrade[g]).map((g) => `<optgroup label="${g}">` +
      byGrade[g].map((c) => `<option value="${c.id}">${esc(c.n)}</option>`).join("") + `</optgroup>`).join("");
  if (cs.some((c) => c.id === keep)) sel.value = keep;
  sel.onchange = () => sel.value && renderDiag(sel.value);
}

function renderMap() {
  const cs = conceptsBySubject(mapFilter);
  const done = cs.filter((c) => (S.mem[c.id]?.mastery || 0) >= 0.7).length;
  const note = $("#mapNote");
  if (note) note.textContent = `${SUBJECTS[mapFilter].name} — ${cs.length}単元のうち ${done}個できている`;
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
    const sel = $("#diagSelect");
    if (![...sel.options].some((o) => o.value === el.dataset.kc)) renderDiagSelect();
    sel.value = el.dataset.kc;
    renderDiag(el.dataset.kc);
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
  /* ★理解の深さ(転移レベル)のはしご。
     「記憶の強さ」と「理解の深さ」は別の軸なので、並べて出す。
     同じ形が解けただけで緑にしないためのしくみが目に見えるようにする。 */
  const lad = transferLadder(S, conceptId);
  const done = isMastered(S, conceptId);
  html += `<div class="tl-box">
    <div class="tl-head">理解の深さ${done ? `<span class="tl-done">✓ マスター</span>` : ""}</div>
    <p class="cs">同じ形の問題が解けることと、わかっていることは別です。段を上げながら確かめます。</p>
    <div class="tl-rows">` +
    lad.map((l) => `<div class="tl-r ${l.state}">
      <span class="tl-ic">${l.state === "done" ? "✓" : l.icon}</span>
      <span class="tl-l"><b>${esc(l.label)}</b><i>${esc(l.what)}</i></span>
      ${l.state === "now" ? `<span class="tl-need">あと${Math.max(0, l.needed - l.hits)}問</span>` : ""}
    </div>`).join("") + `</div>` +
    (lad.length === 5
      ? `<p class="cs">この単元は<b>ほかの単元の土台</b>なので、最後にLukeへの説明まで求めます。</p>`
      : `<p class="cs">この単元は土台ではないので、組み合わせ問題まで通れば十分です。</p>`) +
    `</div>`;

  $("#diagResult").innerHTML = html;
  const btn = $("#askDiag");
  if (btn) btn.onclick = () => {
    S.persona = "sensei"; S.personaPinned = true; renderPersona(); go("study");
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

/* ── 学習カルテ ─────────────────────────────────────────
   ★見せ方の方針
   ここは保護者タブにだけ置く。本人には見せない。
   「あなたは計算ミス型」と本人に伝わった瞬間、それは能力のラベルになり、
   直すための手がかりではなくなる(#7 のポイントで釣らない、と同じ理由)。 */

function renderKarte() {
  const box = $("#karteProfile");
  if (!box) return;
  const prof = learnerProfile(S);

  $("#karteNote").textContent = prof.total ? `${prof.total}回ぶん` : "";

  if (!prof.enough) {
    box.innerHTML = `<div class="karte-empty">${esc(karteSummaryText(S))}</div>`;
    $("#karteSubjects").innerHTML = "";
    $("#karteTrend").innerHTML = "";
  } else {
    box.innerHTML = `<div class="karte-lead">${esc(karteSummaryText(S))}</div>` +
      prof.ranked.slice(0, 4).map((r) => `
        <div class="kt">
          <div class="kt-h"><span class="kt-i">${r.icon}</span><b>${esc(r.label)}</b>
            <span class="kt-n">${r.n}回 / ${Math.round(r.share * 100)}%</span></div>
          <div class="bar"><i style="width:${Math.round(r.share * 100)}%"></i></div>
          <p class="kt-w">${esc(r.what)}</p>
          <p class="kt-m">→ ${esc(plainMove(r.id))}</p>
        </div>`).join("");

    const bys = karteBySubject(S);
    $("#karteSubjects").innerHTML = bys.length
      ? `<h3 class="kt-sub">教科ごとに多い型</h3>` + bys.map((b) =>
          `<div class="row-kv"><span>${esc(b.subject)}</span><b>${b.icon} ${esc(b.label)}
             <span class="kt-n">${b.n}/${b.total}</span></b></div>`).join("")
      : "";

    const tr = karteTrend(S);
    $("#karteTrend").innerHTML = tr.length > 1
      ? `<h3 class="kt-sub">半年ごとの移り変わり</h3><div class="kt-trend">` + tr.map((b) =>
          `<div class="kt-tr"><span class="kt-tk">${esc(b.key)}</span>
             <b>${b.topId ? LEARNER_TYPES[b.topId].icon + " " + esc(LEARNER_TYPES[b.topId].label) : "—"}</b>
             <span class="kt-n">${b.n}回</span></div>`).join("") +
          `</div><p class="cs">型が変わっていくこと自体が、直った記録です。</p>`
      : "";
  }

  /* まだ確認できていない「次回確認すべきこと」 */
  const open = openNextChecks(S);
  $("#karteOpen").innerHTML = open.length
    ? `<h3 class="kt-sub">次回いちばんに確認すること</h3>` + open.map((k) =>
        `<div class="kt-next"><span class="kt-d">${esc(k.date)}</span>${esc(k.nextCheck)}</div>`).join("") +
      `<p class="cs">この内容は<b>次にAI先生と話すときのプロンプトに自動で入ります</b>。書きっぱなしにはなりません。</p>`
    : "";

  /* 1回ごとの記録 */
  const rows = (S.karte || []).slice(-40).reverse();
  $("#karteList").innerHTML = rows.length ? rows.map((k) => {
    const t = LEARNER_TYPES[k.errorType];
    const names = k.conceptIds.map((id) => CONCEPT_MAP[id]?.n).filter(Boolean);
    return `<div class="kr">
      <div class="kr-h"><span class="kr-d">${esc(k.date)}</span>
        ${k.subject ? `<span class="kr-s">${esc(k.subject)}</span>` : ""}
        ${t ? `<span class="kr-t">${t.icon} ${esc(t.label)}</span>` : ""}
        ${k.confidence ? `<span class="kr-c c${k.confidence}">${CONFIDENCE[k.confidence].label}</span>` : ""}</div>
      ${names.length ? `<div class="kr-cn">${esc(names.join(" / "))}</div>` : ""}
      <dl class="kr-dl">
        <dt>つまずき</dt><dd>${esc(k.stumble)}</dd>
        ${k.rootCause ? `<dt>根本原因</dt><dd>${esc(k.rootCause)}${
          k.rootConceptId && CONCEPT_MAP[k.rootConceptId]
            ? `<span class="kr-rc">(${esc(CONCEPT_MAP[k.rootConceptId].n)})</span>` : ""}</dd>` : ""}
        ${k.corrected ? `<dt>直ったこと</dt><dd>${esc(k.corrected)}</dd>` : ""}
        ${k.nextCheck ? `<dt>次回</dt><dd>${esc(k.nextCheck)}
          ${k.checked ? `<span class="kr-ok">確認済み</span>` : `<span class="kr-open">未確認</span>`}</dd>` : ""}
      </dl>
    </div>`;
  }).join("") : `<p class="cs">まだ記録はありません。</p>`;
}

/* ── 実測でわかった学び方 ────────────────────────────────
   ★ここが荒れると、このアプリ全体の信用が落ちる。
     少ないデータで「夜は弱い」と言い出さないよう、
     cause.js 側で件数と差の大きさの両方で止めている。 */
function renderPatterns() {
  const box = $("#patternList");
  if (!box) return;
  const pat = findPatterns(S);
  const cs = causeStats(S, 90);

  $("#patNote").textContent = (S.ansLog || []).length ? `${(S.ansLog || []).length}問ぶん` : "";

  box.innerHTML = !pat.enough
    ? `<div class="karte-empty">まだ ${(S.ansLog || []).length} 問です。
        あと ${pat.need} 問ほどたまると、傾向を出せるようになります。<br>
        <b>少ない記録でパターンを名乗らないようにしています。</b>
        たまたま出た差を「夜は弱い」と言い切ってしまうのが、いちばん困るからです。</div>`
    : pat.list.length
    ? pat.list.map((p) => `<div class="pat">
        <div class="pat-t">${esc(p.text)}</div>
        <div class="pat-a">→ ${esc(p.advice)}</div></div>`).join("")
    : `<div class="karte-empty">${pat.total}問ぶん見ましたが、
        <b>はっきりした差はまだ出ていません。</b>
        時間帯でも、続けた時間でも、成績はほぼ変わっていないということです。</div>`;

  const cl = $("#causeList");
  cl.innerHTML = cs.typed >= 8
    ? `<h3 class="kt-sub">間違いの原因(直近90日・${cs.wrong}問)</h3>` +
      cs.ranked.slice(0, 5).map((r) => `<div class="kt">
        <div class="kt-h"><span class="kt-i">${r.icon}</span><b>${esc(r.label)}</b>
          <span class="kt-n">${r.n}回 / ${Math.round(r.share * 100)}%</span></div>
        <div class="bar"><i style="width:${Math.round(r.share * 100)}%"></i></div>
        <p class="kt-m">→ ${esc(plainMove(r.id))}</p></div>`).join("") +
      `<p class="cs">${cs.deepShare < 0.35
        ? "いまは<b>概念の理解より「解き方の詰め」</b>でのつまずきが多い状態です。教え直しを増やすより、途中式や見直しの型を1つ決めるほうが効きます。"
        : "いまは<b>概念そのもの</b>に手を入れる必要のある間違いが多い状態です。前提までさかのぼる指導になります。"}</p>`
    : "";
}

/* ── 記録を失わないための守り ──────────────────────────
   ★「Webサイトデータを消去」は止められない。止められないものを
     止められるように見せないこと。代わりに、消えても困らない状態を作る。 */

let persistState = { supported: false, granted: false };

function renderSafety() {
  const box = $("#safeList");
  if (!box) return;
  const rep = safetyReport(S);
  // 保護の申請結果を差しこむ
  const pl = rep.layers.find((l) => l.id === "persist");
  pl.ok = persistState.supported ? persistState.granted : null;
  if (!persistState.supported) {
    pl.bad = "このブラウザは保護の申請に対応していません(動作には影響しません)";
  }

  const done = rep.layers.filter((l) => l.ok === true).length;
  $("#safeNote").textContent = `${done} / ${rep.layers.length}`;

  const md = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  box.innerHTML =
    (rep.naked
      ? `<div class="bk-notice warn"><b>⚠ いま、端末の外に記録がありません</b>
          <p>この状態で「Webサイトデータを消去」されると、<b>すべて失われます。</b>
             下の「いますぐ端末の外に出す」を1回押してください。</p></div>`
      : `<div class="bk-notice ok"><b>✓ ${rep.offDeviceDays === 0 ? "今日" : rep.offDeviceDays + "日前"}の記録が端末の外にあります</b>
          <p>いま消去されても、ここまで戻せます。</p></div>`) +
    rep.layers.map((l) => `
      <div class="sf ${l.ok === true ? "ok" : l.ok === null ? "na" : "ng"}">
        <span class="sf-i">${l.ok === true ? "✓" : l.ok === null ? "—" : "!"}</span>
        <div class="sf-t"><b>${esc(l.title)}</b>
          <span>${md(l.ok === true ? l.good : l.bad)}</span></div>
      </div>`).join("") +
    (persistState.usedMB != null
      ? `<p class="cs">いま使っている容量:<b>${persistState.usedMB} MB</b>${
          persistState.quotaMB ? ` / 使える上限 約${persistState.quotaMB} MB` : ""}</p>` : "");
}

async function safeExportNow() {
  const r = await exportBackupFile(S, {
    app: "sawa-navi", version: APP_VERSION, savedAt: new Date().toISOString(),
    name: S.name, grade: S.grade, data: backupPayload(true, true),
  });
  if (r.how === "cancel") return;
  S.lastBackupAt = Date.now(); save();
  await srvBackup(true);          // ついでにサーバーにも預けておく
  renderSafety(); renderBackup();
  toast(r.how === "share"
    ? "「ファイルに保存」→ iCloud Drive を選ぶと、Safariの外に残ります"
    : "ファイルに書き出しました");
}

function showRestoreKey() {
  const box = $("#safeKeyBox");
  const url = restoreLink(S);
  box.hidden = false;
  if (!url) {
    box.innerHTML = `<div class="bk-notice warn"><b>まだ作れません</b>
      <p>先に、下の「サーバーへの自動バックアップ」を始めてください。1回押すだけです。</p></div>`;
    return;
  }
  box.innerHTML = `
    <div class="bk-notice warn"><b>⚠ これはパスワードと同じものです</b>
      <p>このリンクを開くと、預けてある学習記録を取り出せます。
        <b>ご家族以外に渡さないでください。</b>
        (AIのAPIキーは入っていません。料金には影響しません)</p></div>
    <p class="cs"><b>なぜ必要か:</b> 全部消えると、サーバーの合言葉も一緒に消えます。
      預けてあるのに<b>取りに行く鍵が無い</b>状態になります。このリンクがその鍵です。</p>
    <textarea class="inp safe-key" id="safeKeyText" rows="3" readonly>${esc(url)}</textarea>
    <div class="safe-btns">
      <button class="btn btn-sm" id="safeKeyCopy">コピー</button>
      <button class="btn btn-sm btn-ghost" id="safeKeyShare">メモやメールに送る</button>
    </div>
    <p class="cs">おすすめの保管先:<b>iPhoneの「メモ」アプリ</b>、または<b>自分あてのメール</b>。
      新しい端末でこのリンクを開けば、そのまま復元できます。</p>`;
  $("#safeKeyCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast("コピーしました"); }
    catch (_) { $("#safeKeyText").select(); toast("長押しでコピーしてください"); }
  };
  $("#safeKeyShare").onclick = async () => {
    try { await navigator.share({ title: "沙和ナビ 復元用リンク", text: url }); }
    catch (_) { toast("この端末では共有が使えません。コピーしてください"); }
  };
}

/** 起動時。#restore= 付きで開かれたら復元する */
async function tryRestoreFromLink() {
  const o = readRestoreLink();
  if (!o) return;
  clearRestoreHash();
  const hasData = Object.keys(S.mem || {}).length > 0 || (S.sessions || []).length > 0;
  const msg = hasData
    ? "復元用リンクで開かれました。\n\nこの端末にはすでに記録があります。\nサーバーに預けてある記録を読み込みますか?\n(いまの記録は、読み込む前に自動でひかえを取ります)"
    : "復元用リンクで開かれました。\n\nサーバーに預けてある記録を読み込みますか?";
  if (!confirm(msg)) return;
  S.srvToken = o.t;
  if (o.n && !S.name) S.name = o.n;
  if (o.g && !S.grade) S.grade = o.g;
  save();
  try {
    const list = await srvFetch("list");
    const items = list?.items || [];
    if (!items.length) { alert("サーバーに預けた記録が見つかりませんでした。"); return; }
    const txt = await srvFetch("get", { query: "&f=" + encodeURIComponent(items[0].file), raw: true });
    applyBackupText(txt);
    renderAll();
    alert("復元しました。おかえりなさい。");
  } catch (e) {
    alert("読み込めませんでした:" + (e.message || e));
  }
}

/* ── 生データ ────────────────────────────────────────
   ★3層に分けている理由を、画面でも見えるようにしておく。
     「作り直せます」は、実際に作り直すボタンが無いと信用できない。 */
function renderRawInfo() {
  const box = $("#rawInfo");
  if (!box) return;
  const n = rawCount(), span = rawSpan(), dev = rawByDevice();
  const med = rawMedianSeconds();
  $("#rawNote").textContent = n ? `${n.toLocaleString()}件` : "";
  box.innerHTML = !n
    ? `<div class="karte-empty">まだ記録がありません。学習すると1問ずつたまっていきます。</div>`
    : `<div class="row-kv"><span>ためた期間</span><b>${esc(span.from)} 〜 ${esc(span.to)}</b></div>
       <div class="row-kv"><span>件数</span><b>${n.toLocaleString()} 件</b></div>
       ${med ? `<div class="row-kv"><span>答えるまでの時間(中央値)</span><b>${med} 秒</b></div>` : ""}
       ${Object.entries(dev).map(([d, v]) =>
         `<div class="row-kv"><span>${esc(DEVICE_LABEL[d.split("+")[0]] || d)}${d.includes("+app") ? "(ホーム画面から)" : ""}</span>
            <b>${v.n}問 ・ ${Math.round((v.ok / v.n) * 100)}%</b></div>`).join("")}
       <div class="raw-layers">
         <div class="rl"><b>生データ</b><span>問題ID / 答えた内容 / 正誤 / 確信度 / 回答時間 / 端末 / 日時</span><i>消さない</i></div>
         <div class="rl-arrow">↓ いつでも作り直せる</div>
         <div class="rl"><b>分析データ</b><span>誤答原因 / 概念 / 前提概念 / 転移レベル / 定着度</span><i>作り直せる</i></div>
         <div class="rl-arrow">↓</div>
         <div class="rl"><b>長期記憶</b><span>苦手パターン / 効く学習法 / 指導方針 / 次回の復習</span><i>積み上がる</i></div>
       </div>`;
}

const DEVICE_LABEL = { iphone: "iPhone", ipad: "iPad", mac: "Mac", pc: "パソコン",
                       android: "Android", androidtab: "Androidタブレット" };

function renderParent() {
  renderKarte();
  renderPatterns();
  renderRawInfo();
  renderSafety();

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
      ある研究では、練習中の正答率が 89%→60% に下がる一方、あとのテストの成績は 38%→77% と大きく改善しました(Rohrer et al. 2020)。
      特定の条件での比較なので、同じ幅で伸びると約束するものではありませんが、方向は一貫しています。
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

  /* ★生データを読み込む。IndexedDB なので非同期。
     読み終わるまでに答えたぶんは、待ち行列に入れてあとから書き出す。 */
  rawInit().then((r) => {
    console.info(`生データ: ${r.count}件 (${r.store})`);
    renderRawInfo();
  });

  /* ★保存の保護を申請する。防げるのは「勝手に消されること」だけで、
     手動の「Webサイトデータを消去」は防げない。そこは画面に正直に書く。 */
  askPersist().then((p) => { persistState = p; renderSafety(); });

  /* ★復元用リンクで開かれたら、そこから戻す。
     全部消えると合言葉も消えるので、この入口が無いと預けた記録に届かない。 */
  tryRestoreFromLink();

  /* ★アプリを離れる瞬間に預ける。ここが実際にいちばん効く。
     「30分に1回」だと、直前の学習が丸ごと落ちることがある。 */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && S.srvToken) srvBackup(true);
  });
  window.addEventListener("pagehide", () => { if (S.srvToken) srvBackup(true); });

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
  $("#testApi").onclick = testApi;
  renderProviderUI();

  $("#pName").value = S.name;
  $("#pGrade").innerHTML = GRADES.map((g) => `<option ${S.grade === g ? "selected" : ""}>${g}</option>`).join("");

  // ナビ
  $$(".nb").forEach((b) => b.onclick = () => go(b.dataset.go));
  $("#askHomework").onclick = () => {
    S.persona = "sensei"; S.personaPinned = true; renderPersona(); go("study");
    send("今日の宿題を出してください。学校のぶんと合わせて、無理のない量でお願いします。");
  };
  $("#uploadHomework").onclick = () => { go("study"); showScanHelp(); };
  $("#startStudy").onclick = () => startToday(null);

  // ★今日のミッション
  $("#msGo").onclick = () => startToday(planMode);
  $("#msMini").onclick = () => { planMode = planMode === "mini" ? null : "mini"; renderMission(); };
  $("#msWrite").onclick = () => openWritePad("kanji");

  // 記録の守り
  $("#safeNow").onclick = safeExportNow;
  $("#safeKey").onclick = showRestoreKey;

  // 生データ
  $("#rawRecalc").onclick = () => {
    const dry = rebuildFromRaw(S, { dryRun: true });
    if (!dry.rebuilt) { $("#rawMsg").textContent = dry.note || "生データがありません"; return; }
    if (!confirm(`生データ ${dry.rebuilt}件 から、${dry.concepts}個の概念の分析を作り直します。\n`
      + `いまの習得度・転移レベルは、計算し直した値に置きかわります。\n`
      + `(生データは消えません。何度でもやり直せます)`)) return;
    const r = rebuildFromRaw(S);
    save(); renderAll();
    $("#rawMsg").textContent = `✓ ${r.rebuilt}件から ${r.concepts}個の概念を計算し直しました。`;
  };
  $("#rawDump").onclick = () => {
    const blob = new Blob([JSON.stringify({ app: "sawa-navi", kind: "raw", version: APP_VERSION,
      savedAt: new Date().toISOString(), events: rawExport() }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `沙和ナビ_生データ_${todayISO()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  $("#msPick").onclick = () => { go("weak"); $("#cardSubjectPick")?.scrollIntoView({ behavior: "smooth" }); };

  // 書く練習
  $("#wpClose").onclick = closeWritePad;
  $("#wpUndo").onclick = () => padUndo($("#wpCanvas"));
  $("#wpClear").onclick = () => padClear($("#wpCanvas"));
  $("#wpAsk").onclick = askWriteAI;
  $$("[data-wk]").forEach((b) => b.onclick = () => openWritePad(b.dataset.wk));
  $$("[data-wc]").forEach((b) => b.onclick = () => {
    wpConf = Number(b.dataset.wc);
    $$("[data-wc]").forEach((x) => x.classList.toggle("on", x === b));
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#writePad").hidden) closeWritePad();
  });
  $("#msFree").onclick = () => { go("study"); $("#input").focus(); };
  $("#msEnd").onclick = showWrapUp;

  // チャット
  $("#send").onclick = () => (busy ? stopSending() : send());
  $("#undoBtn").onclick = () => {
    if (confirm("直前のやりとりを取り消します。\n\n会話から消えるだけで、記録した宿題や答えは残ります。")) undoLastTurn();
  };
  $("#input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  $("#input").addEventListener("input", (e) => {
    e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 110) + "px";
  });
  /* ★ #confPanel の中だけに限定する。クラス名だけで拾っていたため、
     書く練習の確信度ボタン(同じ見た目にしてある)まで巻き込み、
     そちらのハンドラを上書きして壊していた。 */
  $$("#confPanel .conf-btn").forEach((b) => b.onclick = () => {
    S.lastConf = Number(b.dataset.conf);
    $("#confPanel").hidden = true;
    toast(`確信度「${CONFIDENCE[S.lastConf].label}」を記録。答えをどうぞ`);
    $("#input").focus();
  });

  // 写真
  $("#cameraBtn").onclick = takePhoto;
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
      ミミ先生🐰 = 教える人 / Luke🐾 = 相棒 / ナギ🦉 = 伴走者</div>`;
  }

  renderPersona(); renderKyotsu(); renderAll(); renderUndo();

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

/* ═══════════════ 学び方タブ ═══════════════ */

function renderLearn() {
  /* 今週できるようになったこと */
  const wins = recentWins(S);
  const wb = document.querySelector("#winsBox");
  if (wb) {
    wb.innerHTML = wins.length
      ? wins.slice(0, 10).map((w) => `<div class="win"><span class="win-k ${w.kind === "直した" ? "fix" : "new"}">${esc(w.kind)}</span>
          <b>${esc(w.name)}</b><span class="win-s">${esc(w.subject)}</span></div>`).join("")
        + `<p class="cs" style="margin-top:10px">この1週間で <b>${wins.length}個</b>。
           先週できなかったことが、今日できています。</p>`
      : `<p class="cs">まだ記録が少ないので、来週ここに並びます。<br>
         1つでも「できるようになった」が出ると、続きやすくなります。</p>`;
  }

  /* 勉強法クイズ */
  const qb = document.querySelector("#quizBox");
  if (qb) {
    const i = METHOD_QUIZ.findIndex((_, n) => !(S.quizDone || {})[n]);
    if (i < 0) {
      qb.innerHTML = `<p class="cs">ぜんぶ答えました。<button class="linklike" id="quizReset">もう一度やる</button></p>`
        + METHOD_QUIZ.map((q, n) => `<div class="qz-done"><b>${esc(q.q)}</b>
            <p>→ ${esc(q.a[q.right])}<br><span class="qz-why">${esc(q.why)}</span></p></div>`).join("");
      document.querySelector("#quizReset").onclick = () => { S.quizDone = {}; save(); renderLearn(); };
    } else {
      const q = METHOD_QUIZ[i];
      qb.innerHTML = `<div class="qz">
        <p class="qz-q">${esc(q.q)}</p>
        ${q.a.map((t, n) => `<button class="qz-a" data-a="${n}">${esc(t)}</button>`).join("")}
        <p class="cs" style="margin:8px 0 0">${i + 1} / ${METHOD_QUIZ.length}問目</p></div>`;
      qb.querySelectorAll(".qz-a").forEach((b) => b.onclick = () => {
        const chose = Number(b.dataset.a);
        const right = chose === q.right;
        (S.quizDone ||= {})[i] = chose; save();
        qb.innerHTML = `<div class="qz">
          <p class="qz-q">${esc(q.q)}</p>
          <div class="qz-res ${right ? "ok" : "ng"}">${right ? "◎ そのとおり" : "△ 実は逆でした"}</div>
          <p class="qz-why">${esc(q.why)}</p>
          <button class="btn btn-sm" id="quizNext">次へ</button></div>`;
        document.querySelector("#quizNext").onclick = renderLearn;
      });
    }
  }

  /* 学び方カード */
  const mb = document.querySelector("#methodBox");
  if (mb) {
    mb.innerHTML = STUDY_METHODS.map((m) => {
      const ev = m.evidence(S);
      return `<div class="mth">
        <div class="mth-h"><b>${esc(m.name)}</b><span class="mth-s">${esc(m.strength)}</span></div>
        <div class="mth-ab">
          <div class="mth-bad">✕ ${esc(m.bad)}</div>
          <div class="mth-good">○ ${esc(m.good)}</div>
        </div>
        <p class="mth-why">${esc(m.why)}</p>
        <div class="mth-ev ${ev ? "has" : ""}">
          <b>沙和さんの記録では</b><br>${esc(ev ? ev.text : "まだ判断できるだけの記録がありません。続けるとここに出ます。")}
          ${ev && ev.gap != null && ev.gap > 0 ? `<span class="mth-gap">差 ${ev.gap}ポイント</span>` : ""}
        </div>
        <p class="mth-src">出典:${esc(m.source)}</p>
      </div>`;
    }).join("");
  }

  /* 活動の型 */
  const ab = document.querySelector("#actBox");
  if (ab) {
    const recent = new Set(recentActivities(S, 3).map((x) => x.id));
    ab.innerHTML = ACTIVITIES.map((a) => `<button class="act ${recent.has(a.id) ? "used" : ""}" data-act="${a.id}">
      <span class="act-e">${a.emoji}</span><b>${esc(a.name)}</b>
      <span class="act-w">${esc(a.what)}</span>
      ${recent.has(a.id) ? `<span class="act-tag">最近やった</span>` : ""}</button>`).join("");
    ab.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => {
      const a = ACT_MAP[b.dataset.act];
      S.persona = "sensei"; S.personaPinned = true; renderPersona(); go("study");
      send(`今日は「${a.name}」のやり方でお願いします。(${a.what})`);
    });
  }

  /* 興味の段階 */
  const pb = document.querySelector("#phaseBox");
  if (pb) {
    pb.innerHTML = ["math", "science", "english", "japanese", "social"].map((id) => {
      const p = interestPhase(S, id);
      return `<div class="ph">
        <div class="ph-h"><b>${esc(SUBJECTS[id]?.name || id)}</b>
          <span class="ph-n">${p.emoji} ${esc(p.name)}</span></div>
        <div class="ph-bar">${[1, 2, 3, 4].map((n) => `<i class="${n <= p.n ? "on" : ""}"></i>`).join("")}</div>
        <p class="ph-w">${esc(p.what)}</p>
        <p class="ph-do"><b>いま効くこと:</b>${esc(p.doThis)}</p>
      </div>`;
    }).join("");
  }
}

/* ═══════════════ 相棒 Luke ═══════════════
   反応が返ってくることが、この機能のすべて。
   だから「描き直すきっかけ」をなるべく多く持たせている。 */

let lukeOpen = false;
let lukeTimer = 0;

function renderLuke() {
  refreshTricks(S);
  checkLukeMilestones(S);
  const mood = lukeMood(S);
  const a = lukeAge(S);

  const stage = $("#lukeStage");
  if (stage) {
    stage.innerHTML = lukeFigure(mood, 116);
    stage.className = `luke-stage mood-${mood.id}`;
  }
  const meta = $("#lukeMeta");
  if (meta) meta.textContent = `${LUKE_INFO.breed}・${a.text}・いっしょに${daysTogether(S)}日`;

  const say = $("#lukeSay");
  if (say && (say.dataset.mood !== mood.id || !say.textContent)) {
    say.textContent = lukeLine(S, mood);
    say.dataset.mood = mood.id;
  }

  // きもちが戻る時刻に、もう一度描き直す
  const l = lukeState(S);
  clearTimeout(lukeTimer);
  if (l.moodUntil && l.moodUntil > Date.now()) {
    lukeTimer = setTimeout(() => { const s = $("#lukeSay"); if (s) s.dataset.mood = ""; renderLuke(); },
      l.moodUntil - Date.now() + 100);
  }

  const pat = $("#lukePat");
  if (pat) pat.onclick = () => {
    lukeReact(S, "pat");
    const s = $("#lukeSay"); if (s) s.dataset.mood = "";
    save(); renderLuke();
    $("#lukeStage")?.classList.add("luke-patted");
    setTimeout(() => $("#lukeStage")?.classList.remove("luke-patted"), 700);
  };
  const talk = $("#lukeTalk");
  if (talk) talk.onclick = () => {
    S.persona = "aibou"; save(); renderPersona(); go("study");
    if (!S.chat.length) addMsg("ai", PERSONAS.aibou.intro);
  };
  const more = $("#lukeMore");
  if (more) more.onclick = () => { lukeOpen = !lukeOpen; renderLukeDetail(); };

  renderLukeDetail();
  renderLukeMini();
}

function renderLukeDetail() {
  const box = $("#lukeDetail");
  if (!box) return;
  const btn = $("#lukeMore");
  if (btn) btn.textContent = lukeOpen ? "とじる" : "Lukeのこと";
  box.hidden = !lukeOpen;
  if (!lukeOpen) return;

  const l = lukeState(S);
  const a = lukeAge(S), st = lukeStage(S);
  const tricks = lukeTricks(S);
  const got = tricks.filter((t) => t.got).length;
  const next = nextTrick(S);

  box.innerHTML = `
    <div class="lk-prof">
      <p>${esc(LUKE_INFO.about)}</p>
      <div class="lk-facts">
        <div><span>いま</span><b>${esc(a.text)}</b></div>
        <div><span>人でいうと</span><b>約${a.human}歳</b></div>
        <div><span>育ち具合</span><b>${esc(st.name)}</b></div>
        <div><span>いっしょに</span><b>${daysTogether(S)}日</b></div>
      </div>
      <p class="cs">${esc(st.note)}</p>
      <label class="lk-bd">誕生日
        <input type="date" id="lukeBd" value="${esc(l.bornAt)}">
        <span class="cs">本当の誕生日を入れると、その日にお祝いします</span>
      </label>
    </div>

    <h3 class="sub">Lukeの絵を変える</h3>
    <div id="lukeArtBox"></div>

    <h3 class="sub">覚えた芸 ${got}/${tricks.length}</h3>
    <p class="cs">芸が増える条件は<b>「正解した数」ではありません。</b>
      いい学び方ができたときに増えます。ごほうびではないので、ねらって取らなくて大丈夫です。</p>
    <div class="lk-tricks">
      ${tricks.map((t) => `<div class="lk-tk ${t.got ? "got" : ""}">
        <span class="lk-tk-e">${t.emoji}</span>
        <b>${esc(t.name)}</b>
        <span class="lk-tk-how">${esc(t.how)}</span>
        <span class="lk-tk-why">${esc(t.why)}</span>
        ${t.got ? `<span class="lk-tk-ok">できる</span>` : ""}
      </div>`).join("")}
    </div>
    ${next ? `<div class="note-box"><b>つぎに覚えられそうなのは「${esc(next.name)}」</b><br>
      ${esc(next.how)}<br><span class="cs">${esc(next.why)}</span></div>` : ""}

    <h3 class="sub">Lukeのきもち一覧</h3>
    <p class="cs">Lukeが<b>そっぽを向くのは「近道をしようとしたとき」だけ</b>です。
      できなかったことで、そっけなくなることはありません。</p>
    <div class="lk-moods">
      ${[["happy", "できたとき"], ["tilt", "まちがえたとき"], ["treasure", "自信あったのに間違えたとき"],
         ["sulk", "「答え教えて」と言ったとき"], ["snuggle", "つらいとき"], ["lonely", "何日も会えないとき"]]
        .map(([id, when]) => `<div class="lk-mo">
          <div class="lk-mo-art">${lukeFigure(LUKE_MOODS[id], 62)}</div>
          <b>${esc(LUKE_MOODS[id].name)}</b><span>${esc(when)}</span></div>`).join("")}
    </div>

    ${l.memories.length ? `<h3 class="sub">思い出</h3>
      <div class="lk-mem">${l.memories.slice(-14).reverse().map((m) =>
        `<div class="lk-mm"><span>${m.emoji}</span><b>${esc(m.text)}</b><i>${esc(m.at)}</i></div>`).join("")}</div>` : ""}
    ${l.pats ? `<p class="cs" style="margin-top:10px">なでた回数:${l.pats}回</p>` : ""}`;

  renderLukeArt();

  const bd = $("#lukeBd");
  if (bd) bd.onchange = () => {
    if (!bd.value) return;
    l.bornAt = bd.value; l.bornSet = true; save(); renderLuke();
    toast(`Lukeの誕生日を ${bd.value} にしました`);
  };
}

/** チャットのとなりにいる小さなLuke。ここが「見ていてくれる」感になる */
function renderLukeMini() {
  const box = $("#lukeMini");
  if (!box) return;
  const on = S.persona === "aibou" || (lukeState(S).moodUntil || 0) > Date.now();
  box.hidden = !on;
  if (!on) return;
  const mood = lukeMood(S);
  box.innerHTML = `<div class="lkm-art mood-${mood.id}">${lukeFigure(mood, 54)}</div>
    <span class="lkm-say">${esc(lukeLine(S, mood))}</span>`;
}

/* ═══════════════ 英語 ═══════════════
   発音は「聞き分け」を中心に置いた。音声認識は使えない端末があるが、
   読み上げ(TTS)はどの端末でも動く。中心を読み上げ側に置けば、
   どの端末でも発音練習が成立する。 */

let pronOpen = null;      // いま開いている音のID
let rwTab = "reading";    // 読む/書く/受験 の切替

function renderEnglish() {
  const L = englishLayer(S);

  /* 5つの層 */
  const lg = $("#engLayers");
  if (lg) {
    lg.innerHTML = ENG_LAYERS.map((x) => `<div class="lay ${x.n === L.n ? "now" : x.n < L.n ? "past" : ""}">
      <div class="lay-h"><span class="lay-e">${x.emoji}</span><b>${x.n}. ${esc(x.name)}</b>
        ${x.n === L.n ? `<span class="lay-tag">いまここ</span>` : ""}</div>
      <p class="lay-g">${esc(x.goal)}</p>
      <p class="lay-w">${esc(x.why)}</p>
      <p class="lay-d">${esc(x.doing)}</p>
    </div>`).join("");
  }

  /* 音の一覧 */
  const pl = $("#pronList");
  if (pl) {
    pl.innerHTML = PHONEMES.map((p) => {
      const acc = pronAccuracy(S, p.id);
      const st = pronState(S, p.id);
      return `<button class="pron ${pronOpen === p.id ? "open" : ""}" data-ph="${p.id}">
        <span class="pron-l"><b>${esc(p.name)}</b><span class="pron-jp">${esc(p.jp)}</span></span>
        <span class="pron-acc ${acc == null ? "" : acc >= 0.8 ? "ok" : acc >= 0.6 ? "mid" : "ng"}">${
          acc == null ? "まだ" : Math.round(acc * 100) + "%"}</span>
        <span class="pron-n">${st.heard + st.said}回</span>
      </button>`;
    }).join("");
    pl.querySelectorAll("[data-ph]").forEach((b) => b.onclick = () => {
      const opening = pronOpen !== b.dataset.ph;
      pronOpen = opening ? b.dataset.ph : null;
      renderEnglish();
      // 開いた練習パネルは画面の外にあることが多い。そこまで送る
      if (opening) $("#pronDrill")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /* 開いている音の練習パネル */
  const pd = $("#pronDrill");
  if (pd) {
    if (!pronOpen) { pd.hidden = true; pd.innerHTML = ""; }
    else {
      const p = PHONEME_MAP[pronOpen];
      pd.hidden = false;
      pd.innerHTML = `
        <h3 class="pd-t">${esc(p.name)}</h3>
        <p class="pd-why">${esc(p.why)}</p>
        <div class="pd-how">${Object.entries(p.how).map(([k, v]) =>
          `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join("")}</div>
        <p class="pd-tip">💡 ${esc(p.tip)}</p>
        ${p.words ? `<div class="pd-words">${p.words.map((w) =>
          `<button class="pd-w" data-say="${esc(w.w)}">🔊 ${esc(w.w)}<span>${esc(w.s)}</span></button>`).join("")}</div>` : ""}
        ${p.phrases ? `<div class="pd-words">${p.phrases.map((s) =>
          `<button class="pd-w wide" data-say="${esc(s)}">🔊 ${esc(s)}</button>`).join("")}</div>` : ""}
        ${p.noAudioB
          ? `<p class="cs">ここは「日本語ふうの言い方」との比較なので、聞き分け問題は作れません。英語の側だけを読み上げます。</p>
             <div class="pd-words">${p.pairs.map(([a]) => `<button class="pd-w" data-say="${esc(a)}">🔊 ${esc(a)}</button>`).join("")}</div>
             <div class="pd-act"><button class="btn btn-sm" id="pdSay">🎤 言ってみる</button></div>`
          : p.pairs?.length
          ? `<div class="pd-act">
               <button class="btn btn-sm" id="pdListen">👂 聞き分けをやる</button>
               <button class="btn btn-sm ghost" id="pdSay">🎤 言ってみる</button>
             </div>` : ""}
        <div id="pdArea"></div>`;

      pd.querySelectorAll("[data-say]").forEach((b) => b.onclick = () => speakSafe(b.dataset.say));
      const bl = $("#pdListen"); if (bl) bl.onclick = () => startListenDrill(p);
      const bs = $("#pdSay");    if (bs) bs.onclick = () => startSayDrill(p);
    }
  }

  /* この端末でできること・できないこと */
  const sn = $("#speechNote");
  if (sn) {
    sn.textContent = [
      ttsSupported() ? "🔊 読み上げ:使えます" : "🔊 読み上げ:この端末では使えません",
      canRecord() ? "🎙 録音して聞き比べ:使えます" : "🎙 録音:この端末では使えません",
      canRecognize() ? "🎤 発音の自動判定:使えます" : "🎤 発音の自動判定:この端末では使えません(聞き比べで練習できます)",
    ].join(" / ");
  }

  /* 会話 */
  const cb = $("#convBox");
  if (cb) {
    const lv = Math.min(4, Math.max(1, GRADES.indexOf(S.grade || "中1") + 1));
    cb.innerHTML = CONV_TOPICS.map((t) => `<button class="cv ${t.lv > lv ? "hard" : ""}" data-cv="${t.id}">
      <span class="cv-e">${t.emoji}</span><b>${esc(t.name)}</b>
      <span class="cv-q">${esc(t.q[0])}</span>
      ${t.lv > lv ? `<span class="cv-tag">むずかしめ</span>` : ""}</button>`).join("");
    cb.querySelectorAll("[data-cv]").forEach((b) => b.onclick = () => {
      const t = CONV_TOPICS.find((x) => x.id === b.dataset.cv);
      S.persona = "aibou"; S.personaPinned = true; renderPersona(); go("study");
      send(`英語で話す練習をしたいです。お題は「${t.name}」。まず ${t.q[0]} から聞いてください。`
         + `話している間は直さないで、終わってから2〜3点だけ教えてください。`);
    });
  }
  const fb = $("#fluencyBox");
  if (fb) fb.innerHTML = `<b>${esc(FLUENCY_432.name)}</b><br>${FLUENCY_432.how.map(esc).join(" → ")}<br>
    <span class="cs">${esc(FLUENCY_432.why)}</span>`;

  /* 単語 */
  const wb = $("#wordBox");
  if (wb) {
    const st = wordStats(S);
    const due = dueWords(S, 8);
    const recent = Object.values(engState(S).words).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)).slice(0, 12);
    wb.innerHTML = `
      <div class="wd-sum"><b>${st.total}語</b>登録 / <b>${st.known}語</b>が定着
        ${st.total ? "" : `<span class="cs">— 会話や長文で出会った語が、ここにたまっていきます</span>`}</div>
      ${due.length ? `<div class="wd-due"><b>今日ぶんの復習(${due.length}語)</b>
        <div class="wd-chips">${due.map((d) => `<span class="wd-chip">${esc(d.word)}</span>`).join("")}</div>
        <button class="btn btn-sm" id="wdStart">この単語をテストしてもらう</button></div>` : ""}
      ${recent.length ? `<div class="wd-list">${recent.map((w) => `<div class="wd">
        <button class="wd-say" data-say="${esc(w.word)}">🔊</button>
        <b>${esc(w.word)}</b><span class="wd-m">${esc(w.meaning || "")}</span>
        <span class="wd-bar"><i style="width:${Math.round((w.mastery || 0) * 100)}%"></i></span>
        ${w.example ? `<span class="wd-ex">${esc(w.example)}</span>` : ""}
      </div>`).join("")}</div>` : ""}`;
    wb.querySelectorAll("[data-say]").forEach((b) => b.onclick = () => speakSafe(b.dataset.say));
    const ws = $("#wdStart");
    if (ws) ws.onclick = () => { S.persona = "sensei"; S.personaPinned = true; renderPersona(); go("study");
      send("今日ぶんの英単語をテストしてください。1語ずつ、確信度を聞いてから進めてください。"); };
  }

  const cvb = $("#coverBox");
  if (cvb) {
    const known = wordStats(S).known;
    cvb.innerHTML = COVERAGE.map((c) => `<div class="cov ${known >= c.words ? "done" : ""}">
      <b>${c.words.toLocaleString()}語</b><span class="cov-c">${c.cover}</span>
      <span class="cov-k">${esc(c.can)}</span></div>`).join("")
      + `<p class="cs" style="margin-top:8px">${esc(COVERAGE_NOTE)}</p>`;
  }

  /* 文法の罠 */
  const tb = $("#trapBox");
  if (tb) {
    tb.innerHTML = GRAMMAR_TRAPS.map((t) => {
      const m = t.concept ? S.mem?.[t.concept]?.mastery : null;
      return `<details class="trap">
        <summary><b>${esc(t.name)}</b><span class="trap-lv">${esc(t.level)}</span>
          ${m != null ? `<span class="trap-m ${m >= 0.7 ? "ok" : "ng"}">習得 ${Math.round(m * 100)}%</span>` : ""}</summary>
        <div class="trap-ab"><div class="trap-ng">✕ ${esc(t.ng)}</div><div class="trap-ok">○ ${esc(t.ok)}</div></div>
        <p class="trap-why"><b>なぜ日本語話者がこうなるか:</b>${esc(t.why)}</p>
        <p class="trap-rule"><b>見分け方:</b>${esc(t.rule)}</p>
        ${t.check ? `<p class="trap-chk"><b>確かめ方:</b>${esc(t.check)}</p>` : ""}
        <button class="btn btn-sm ghost" data-trap="${t.id}">ここを練習する</button>
      </details>`;
    }).join("");
    tb.querySelectorAll("[data-trap]").forEach((b) => b.onclick = () => {
      const t = GRAMMAR_TRAPS.find((x) => x.id === b.dataset.trap);
      S.persona = "sensei"; S.personaPinned = true; renderPersona(); go("study");
      send(`英語の「${t.name}」を練習したいです。まず、なぜ日本語だとまちがえるのかを教えてから、問題を出してください。`);
    });
  }

  /* 読む・書く・受験 */
  const isJHS = GRADES.indexOf(S.grade || "中1") <= 2;
  const tabs = [["reading", "📖 読む"], ["writing", "✍️ 書く"], ["irregular", "🔁 不規則動詞"],
                ["parts", "🧩 接辞・語根"], ["trap", "⚠️ 和製英語"], ["poly", "🔀 多義語"]];
  if (!isJHS) tabs.push(["exam", "🎓 受験"]);
  const rt = $("#rwTabs");
  if (rt) {
    if (!tabs.some((t) => t[0] === rwTab)) rwTab = "reading";
    rt.innerHTML = tabs.map(([id, n]) => `<button class="et ${rwTab === id ? "on" : ""}" data-rw="${id}">${n}</button>`).join("");
    rt.querySelectorAll("[data-rw]").forEach((b) => b.onclick = () => { rwTab = b.dataset.rw; renderEnglish(); });
  }
  const rb = $("#rwBox");
  if (rb) {
    rb.innerHTML = renderRwPanel(rwTab);
    rb.querySelectorAll("[data-say]").forEach((b) => b.onclick = () => speakSafe(b.dataset.say));
  }
}

function renderRwPanel(kind) {
  if (kind === "reading") {
    return `<h3 class="sub">読むときの4つの決まり</h3>
      ${READING_RULES.map((r) => `<div class="rr"><b>${esc(r.n)}</b>
        <p>${esc(r.how)}</p><p class="rr-w">${esc(r.why)}</p></div>`).join("")}
      <h3 class="sub">つなぎ言葉 — これが見えると流れが分かる</h3>
      ${DISCOURSE.map((d) => `<div class="dm"><b>${esc(d.k)}</b>
        <div class="dm-w">${d.w.map((w) => `<button class="dm-b" data-say="${esc(w)}">${esc(w)}</button>`).join("")}</div></div>`).join("")}
      <h3 class="sub">設問の型と解き方</h3>
      ${QUESTION_TYPES.map((q) => `<div class="qt"><b>${esc(q.t)}</b><p>${esc(q.how)}</p></div>`).join("")}`;
  }
  if (kind === "writing") {
    return `${WRITING_STEPS.map((w) => `<div class="ws"><b>${esc(w.n)}</b>
      <p class="ws-what">${esc(w.what)}</p>
      ${w.ex ? `<p class="ws-ex">${esc(w.ex)}</p>` : ""}
      <p class="ws-why">${esc(w.why)}</p></div>`).join("")}
      <h3 class="sub">${esc(ESSAY_FRAME.name)}</h3>
      <div class="ef">${ESSAY_FRAME.steps.map((s) => `<div>${esc(s)}</div>`).join("")}
        <p class="ws-why">${esc(ESSAY_FRAME.note)}</p></div>`;
  }
  if (kind === "irregular") {
    return IRREGULAR.map((g) => `<div class="irg"><h3 class="sub">${esc(g.g)}</h3>
      <p class="cs">${esc(g.note)}</p>
      <div class="tw"><table class="irt"><tr><th>原形</th><th>過去</th><th>過去分詞</th><th>意味</th></tr>
      ${g.v.map(([a, b, c, m]) => `<tr><td><button class="dm-b" data-say="${esc(a)}">${esc(a)}</button></td>
        <td>${esc(b)}</td><td>${esc(c)}</td><td>${esc(m)}</td></tr>`).join("")}</table></div></div>`).join("");
  }
  if (kind === "parts") {
    return `<p class="cs">知らない語が出たら、まずここで崩せないか試します。
      <b>語をひとつずつ覚えるより、部品を覚えるほうが速い</b>ことがあります。</p>
      <div class="tw"><table class="irt"><tr><th>部品</th><th>種類</th><th>意味</th><th>例</th></tr>
      ${WORD_PARTS.map((p) => `<tr><td><b>${esc(p.p)}</b></td><td>${esc(p.k)}</td><td>${esc(p.m)}</td>
        <td>${p.ex.map((e) => `<button class="dm-b" data-say="${esc(e)}">${esc(e)}</button>`).join("")}</td></tr>`).join("")}</table></div>`;
  }
  if (kind === "trap") {
    return `<p class="cs">そのまま言うと<b>通じない</b>か、<b>別の意味</b>になる言葉です。</p>
      <div class="tw"><table class="irt"><tr><th>日本語</th><th>✕ 通じない</th><th>○ 正しい</th><th>なぜ</th></tr>
      ${TRAP_WORDS.map((t) => `<tr><td>${esc(t.jp)}</td><td class="ng">${esc(t.ng)}</td>
        <td class="ok"><button class="dm-b" data-say="${esc(t.ok)}">${esc(t.ok)}</button></td>
        <td>${esc(t.note)}</td></tr>`).join("")}</table></div>`;
  }
  if (kind === "poly") {
    return `<p class="cs">知っている意味で読むと<b>外れる</b>語です。長文で意味が通らないときは、たいていこれです。</p>
      <div class="poly">${POLYSEMY.map((p) => `<div class="pw">
        <button class="dm-b" data-say="${esc(p.w)}">${esc(p.w)}</button>
        <span>${p.m.map(esc).join(" / ")}</span></div>`).join("")}</div>`;
  }
  if (kind === "exam") {
    return `${EXAM_ENGLISH.structure.map((s) => `<div class="ex-s"><b>${esc(s.t)}</b>
      <span class="ex-p">${esc(s.p)}</span><p>${esc(s.n)}</p></div>`).join("")}
      <div class="note-box">${esc(EXAM_ENGLISH.note)}</div>
      <h3 class="sub">時間の使い方</h3>
      ${EXAM_ENGLISH.timing.map((t) => `<div class="qt"><p>${esc(t)}</p></div>`).join("")}`;
  }
  return "";
}

/** 用意された絵があればそれを、無ければSVGを描く */
function lukeFigure(mood, size = 116) {
  const e = lukeArtEntry(mood.id);
  if (!e || !e.u) return lukeSvg(mood, size);
  const a = mood.art;
  // 写真(透過なし)は丸く抜く。まわりの床や部屋が目立たなくなる
  return `<img class="luke-photo${e.r ? " round" : ""}${a.bob ? " lk-bob" : ""}" src="${e.u}"
    width="${size}" height="${size}" alt="Luke(${esc(mood.name)})"
    style="--tilt:${a.tilt}deg${a.faceX ? ";--flip:-1" : ""}">`;
}

/**
 * 小さいアイコン用の Luke。
 * 全身のままだと20〜40pxでは何も見えないので、SVGは顔のあたりだけを切り出す。
 * 写真を登録してあれば、そちらを丸く出す。
 */
function lukeFace(size = 34) {
  const e = lukeArtEntry("normal");
  if (e?.u) return `<img class="luke-photo${e.r ? " round" : ""}" src="${e.u}"
    width="${size}" height="${size}" alt="Luke">`;
  return lukeSvg(LUKE_MOODS.normal, size, "26 32 148 124");
}

/* ── 切り抜き ─────────────────────────────────────────
   写真をそのまま入れると、床や部屋まで一緒に入ってしまう。
   その場で顔だけ切り出せるようにした。 */

let cropJob = null;   // {slot, img, zoom, x, y, V}

function openLukeCrop(slot, img) {
  const V = 240;
  const cover = Math.max(V / img.naturalWidth, V / img.naturalHeight);
  cropJob = { slot, img, cover, zoom: 1, V,
              x: (V - img.naturalWidth * cover) / 2, y: (V - img.naturalHeight * cover) / 2 };
  renderLukeCrop();
}

function cropClamp() {
  const j = cropJob, s = j.cover * j.zoom;
  const w = j.img.naturalWidth * s, h = j.img.naturalHeight * s;
  j.x = Math.min(0, Math.max(j.V - w, j.x));
  j.y = Math.min(0, Math.max(j.V - h, j.y));
}

function renderLukeCrop() {
  const box = $("#lukeArtBox");
  const j = cropJob;
  if (!box || !j) return;
  const slot = LUKE_ART_SLOTS.find((x) => x.id === j.slot);
  cropClamp();
  const s = j.cover * j.zoom;
  box.innerHTML = `
    <p class="cs"><b>「${esc(slot.name)}」に入れる部分を選んでください。</b><br>
      ドラッグで位置、スライダーで大きさが変えられます。<b>顔が枠いっぱいになるくらい</b>が目安です。</p>
    <div class="lk-crop" id="lkCrop" style="width:${j.V}px;height:${j.V}px">
      <img id="lkCropImg" src="${j.img.src}"
        style="width:${(j.img.naturalWidth * s).toFixed(1)}px;left:${j.x.toFixed(1)}px;top:${j.y.toFixed(1)}px">
      <div class="lk-crop-ring"></div>
    </div>
    <label class="lk-crop-zoom">大きさ
      <input type="range" id="lkCropZoom" min="100" max="320" value="${Math.round(j.zoom * 100)}">
    </label>
    <div class="lk-crop-btns">
      <button class="btn btn-sm ghost" id="lkCropRot" title="90度まわす">↻ 回す</button>
      <button class="btn btn-sm" id="lkCropOk">これにする</button>
      <button class="btn btn-sm ghost" id="lkCropNg">やめる</button>
    </div>
    <p class="cs" style="text-align:center;margin-top:8px">横向きになっていたら「回す」を押してください。</p>`;

  const area = $("#lkCrop"), im = $("#lkCropImg");
  let drag = null;
  const move = (e) => {
    if (!drag) return;
    const p = e.touches ? e.touches[0] : e;
    j.x = drag.x + (p.clientX - drag.px);
    j.y = drag.y + (p.clientY - drag.py);
    cropClamp();
    im.style.left = j.x.toFixed(1) + "px"; im.style.top = j.y.toFixed(1) + "px";
    e.preventDefault();
  };
  const down = (e) => {
    const p = e.touches ? e.touches[0] : e;
    drag = { x: j.x, y: j.y, px: p.clientX, py: p.clientY };
  };
  const up = () => { drag = null; };
  area.addEventListener("mousedown", down);
  area.addEventListener("touchstart", down, { passive: true });
  window.addEventListener("mousemove", move);
  area.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("mouseup", up);
  area.addEventListener("touchend", up);

  $("#lkCropZoom").oninput = (e) => {
    const old = j.cover * j.zoom;
    j.zoom = Number(e.target.value) / 100;
    const nw = j.cover * j.zoom;
    // 枠の中心を保ったまま拡大する
    j.x = j.V / 2 - (j.V / 2 - j.x) * (nw / old);
    j.y = j.V / 2 - (j.V / 2 - j.y) * (nw / old);
    cropClamp();
    im.style.width = (j.img.naturalWidth * nw).toFixed(1) + "px";
    im.style.left = j.x.toFixed(1) + "px"; im.style.top = j.y.toFixed(1) + "px";
  };

  $("#lkCropRot").onclick = async () => {
    const b = $("#lkCropRot"); b.disabled = true;
    try {
      j.img = await rotateImage(j.img, 90);
      // 回すと縦横が入れかわるので、位置と倍率を作り直す
      j.cover = Math.max(j.V / j.img.naturalWidth, j.V / j.img.naturalHeight);
      j.zoom = 1;
      j.x = (j.V - j.img.naturalWidth * j.cover) / 2;
      j.y = (j.V - j.img.naturalHeight * j.cover) / 2;
      renderLukeCrop();
    } catch { toast("まわせませんでした"); b.disabled = false; }
  };

  $("#lkCropNg").onclick = () => { cropJob = null; renderLukeArt(); };
  $("#lkCropOk").onclick = () => {
    const sc = j.cover * j.zoom;
    const entry = cropLukeImage(j.img, { x: -j.x / sc, y: -j.y / sc, w: j.V / sc });
    const cur = loadLukeArt();
    cur[j.slot] = entry;
    if (!saveLukeArt(cur)) { toast("端末の空きが足りません。ほかの絵を減らしてください"); return; }
    cropJob = null;
    toast("Lukeの絵を変えました");
    renderLuke();
  };
}

/* ── Lukeの絵を差しかえる ───────────────────────────────
   手描きのSVGでは、生成したイラストの可愛さには勝てない。
   だから「自分で用意した絵に置きかえられる」ようにしてある。 */

function renderLukeArt() {
  const box = $("#lukeArtBox");
  if (!box) return;
  if (cropJob) return renderLukeCrop();
  const art = loadLukeArt();
  const kb = Math.round(lukeArtBytes() / 1024);
  box.innerHTML = `
    <p class="cs">Lukeの絵を<b>自分で用意した画像に変えられます。</b>
      まず「ふつう」の1枚だけ入れれば、ほかのきもちもその絵になります。
      余裕があれば、きもちごとに別の絵を入れてください。</p>
    <p class="cs">背景が透明なPNGだと、いちばんきれいに出ます。
      画像は<b>この端末の中だけ</b>に保存され、どこにも送信されません。</p>
    <div class="lk-art-grid">
      ${LUKE_ART_SLOTS.map((sl) => `<div class="lk-as ${art[sl.id] ? "has" : ""}">
        <label class="lk-as-drop">
          ${art[sl.id]?.u ? `<img src="${art[sl.id].u}" class="${art[sl.id].r ? "round" : ""}" alt="">` : `<span class="lk-as-plus">＋</span>`}
          <input type="file" accept="image/*" data-art="${sl.id}" hidden>
        </label>
        <b>${esc(sl.name)}</b>
        <span class="lk-as-hint">${esc(sl.hint)}</span>
        ${art[sl.id]?.u ? `<button class="linklike" data-artdel="${sl.id}">消す</button>` : ""}
      </div>`).join("")}
    </div>
    <p class="cs">登録:${lukeArtCount()} / ${LUKE_ART_SLOTS.length}枚(合計 約${kb}KB)
      ${lukeArtCount() ? `　<button class="linklike" id="lukeArtClear">ぜんぶ消して、もとの絵にもどす</button>` : ""}</p>`;

  box.querySelectorAll("[data-art]").forEach((inp) => inp.onchange = async () => {
    const f = inp.files?.[0];
    if (!f) return;
    try {
      const img = await readImage(f);
      openLukeCrop(inp.dataset.art, img);       // まず切り抜き画面へ
    } catch (e) {
      toast(e.message || "読み込めませんでした");
    }
  });
  box.querySelectorAll("[data-artdel]").forEach((b) => b.onclick = () => {
    const cur = loadLukeArt();
    delete cur[b.dataset.artdel];
    saveLukeArt(cur); renderLuke();
  });
  const clr = $("#lukeArtClear");
  if (clr) clr.onclick = () => {
    if (!confirm("登録した絵をすべて消して、もとの絵にもどしますか?")) return;
    try { localStorage.removeItem(LUKE_ART_KEY); } catch {}
    renderLuke();
  };
}

/* ── 発音ドリル ─────────────────────────────────────────── */

async function speakSafe(text, opts) {
  if (!ttsSupported()) { toast("この端末では読み上げが使えません"); return; }
  if (!enVoices().length) {
    loadVoices();
    if (!enVoices().length) { toast("英語の音声がまだ読み込まれていません。少し待ってからもう一度押してください"); return; }
  }
  await speak(text, opts);
}

/** 聞き分け — どちらかを読み上げて、どちらだったか当てる */
function startListenDrill(p) {
  const area = $("#pdArea");
  const pair = p.pairs[Math.floor(Math.random() * p.pairs.length)];
  const which = Math.random() < 0.5 ? 0 : 1;
  area.innerHTML = `<div class="drill">
    <p class="dr-q">どっちに聞こえた?</p>
    <button class="btn btn-sm ghost" id="drReplay">🔊 もう一度きく</button>
    <div class="dr-ab">${pair.map((w, i) => `<button class="dr-a" data-i="${i}">${esc(w)}</button>`).join("")}</div>
  </div>`;
  speakSafe(pair[which]);
  $("#drReplay").onclick = () => speakSafe(pair[which]);
  area.querySelectorAll("[data-i]").forEach((b) => b.onclick = () => {
    const ok = Number(b.dataset.i) === which;
    notePron(S, p.id, "listen", ok); save();
    area.innerHTML = `<div class="drill">
      <div class="dr-res ${ok ? "ok" : "ng"}">${ok ? "◎ 正解" : "△ ちがいました"}</div>
      <p class="dr-w">流れたのは <b>${esc(pair[which])}</b> でした。</p>
      ${ok ? "" : `<p class="dr-tip">💡 ${esc(p.tip)}</p>`}
      <div class="dr-ab">
        <button class="dm-b" data-say="${esc(pair[0])}">🔊 ${esc(pair[0])}</button>
        <button class="dm-b" data-say="${esc(pair[1])}">🔊 ${esc(pair[1])}</button>
      </div>
      <button class="btn btn-sm" id="drNext">つぎ</button></div>`;
    area.querySelectorAll("[data-say]").forEach((x) => x.onclick = () => speakSafe(x.dataset.say));
    $("#drNext").onclick = () => startListenDrill(p);
  });
}

/** 言ってみる — お手本 → 録音 → 聞き比べ(使える端末では自動判定も) */
function startSayDrill(p) {
  const area = $("#pdArea");
  const word = (p.pairs[Math.floor(Math.random() * p.pairs.length)] || ["hello"])[0];
  area.innerHTML = `<div class="drill">
    <p class="dr-q">この語を言ってみよう</p>
    <div class="dr-word"><button class="dm-b big" data-say="${esc(word)}">🔊 ${esc(word)}</button></div>
    <p class="cs">まずお手本を2回聞いてから、まねして言います。</p>
    <div class="dr-ab">
      ${canRecord() ? `<button class="btn btn-sm" id="drRec">🎙 録音してみる</button>` : ""}
      ${canRecognize() ? `<button class="btn btn-sm ghost" id="drAsr">🎤 通じるか試す</button>` : ""}
    </div>
    ${!canRecord() && !canRecognize()
      ? `<p class="cs">この端末ではマイクが使えません。お手本を聞いて、声に出してまねするだけでも効果があります。</p>` : ""}
    <div id="drOut"></div></div>`;
  area.querySelectorAll("[data-say]").forEach((b) => b.onclick = () => speakSafe(b.dataset.say));

  const rec = $("#drRec");
  if (rec) rec.onclick = async () => {
    if (recBusy()) {
      const r = await recStop();
      rec.textContent = "🎙 録音してみる"; rec.classList.remove("rec-on");
      if (!r.ok) { $("#drOut").innerHTML = `<p class="dr-err">録音できませんでした。</p>`; return; }
      $("#drOut").innerHTML = `<div class="cmp">
        <p><b>聞き比べてみて。</b>ちがうところが自分で分かれば、そこが直せる場所です。</p>
        <button class="dm-b" data-say="${esc(word)}">🔊 お手本</button>
        <audio controls src="${r.url}"></audio>
        <div class="dr-ab"><button class="btn btn-sm ghost" id="cmpAsk">先生に聞いてみる</button></div></div>`;
      $("#drOut").querySelectorAll("[data-say]").forEach((b) => b.onclick = () => speakSafe(b.dataset.say));
      $("#cmpAsk").onclick = () => { S.persona = "sensei"; S.personaPinned = true; renderPersona(); go("study");
        send(`英語の「${p.name}」の発音を練習しています。「${word}」を言ってみました。口の形をもう一度教えてください。カタカナは使わないでください。`); };
    } else {
      const r = await recStart();
      if (!r.ok) {
        $("#drOut").innerHTML = `<p class="dr-err">${
          r.error === "denied" ? "マイクの使用が許可されませんでした。設定から許可してください。" : "この端末では録音が使えません。"}</p>`;
        return;
      }
      rec.textContent = "⏹ 止める"; rec.classList.add("rec-on");
    }
  };

  const asr = $("#drAsr");
  if (asr) asr.onclick = async () => {
    $("#drOut").innerHTML = `<p class="dr-listen">🎤 聞いています… <b>${esc(word)}</b> と言ってみて</p>`;
    const r = await listenOnce({});
    if (!r.ok) {
      $("#drOut").innerHTML = `<p class="dr-err">${
        r.error === "no-speech" || r.error === "timeout" ? "聞き取れませんでした。もう一度どうぞ。"
        : r.error === "not-allowed" ? "マイクの使用が許可されませんでした。" : "この端末では自動判定が使えません。"}</p>`;
      return;
    }
    const cmp = compareSpoken(word, r.transcript);
    const ok = cmp.score >= 1;
    notePron(S, p.id, "say", ok); save();
    const diag = diagnosePronunciation(word, r.transcript);
    $("#drOut").innerHTML = `<div class="drill">
      <div class="dr-res ${ok ? "ok" : "ng"}">${ok ? "◎ ちゃんと伝わりました" : "△ こう聞こえました"}</div>
      <p class="dr-w">言おうとした語:<b>${esc(word)}</b> / 聞こえた語:<b>${esc(cmp.heard || "(なし)")}</b></p>
      ${diag.length ? `<p class="dr-tip">💡 ${esc(diag[0].tip)}</p>` : ok ? "" : `<p class="dr-tip">💡 ${esc(p.tip)}</p>`}
      <p class="cs">※これは「機械に通じたか」の目安です。通じなければ、人にも通じにくい可能性があります。
        通じたからといって完璧という意味ではありません。</p>
      <button class="btn btn-sm" id="drNext2">もう一度</button></div>`;
    $("#drNext2").onclick = () => startSayDrill(p);
  };
}

/* ═══════════════ APIの見える化 ═══════════════
   「本当に動いているのか」がわからないと不安になる。
   何が・どれだけ・いくらで動いたかを、そのつど残して見せる。 */

function logApi(rec) {
  (S.apiLog ||= []).push({ at: Date.now(), ...rec });
  if (S.apiLog.length > 40) S.apiLog.shift();
}

function apiTotals(days = 30) {
  const since = Date.now() - days * 864e5;
  const rows = (S.apiLog || []).filter((r) => r.at >= since && r.ok);
  return {
    calls: rows.length,
    yen: Math.round(rows.reduce((s, r) => s + (r.yen || 0), 0) * 10) / 10,
    inTok: rows.reduce((s, r) => s + (r.in || 0), 0),
    outTok: rows.reduce((s, r) => s + (r.out || 0), 0),
    tools: rows.reduce((s, r) => s + (r.tools?.length || 0), 0),
  };
}

/** 1回分の要約(チャットの下に出す小さな行) */
function apiMetaLine(rec) {
  const bits = [`${providerOf(rec.provider).short} ${rec.model}`];
  bits.push(`${(rec.ms / 1000).toFixed(1)}秒`);
  if (rec.tools?.length) bits.push(`ツール${rec.tools.length}回`);
  if (rec.in || rec.out) bits.push(`${rec.in + rec.out}トークン`);
  if (rec.yen != null) bits.push(`約${rec.yen < 0.1 ? "0.1未満" : rec.yen}円`);
  return bits.join(" ・ ");
}

function renderApiPanel() {
  const st = document.querySelector("#apiState");
  if (!st) return;
  const t = apiTotals(30);
  const last = (S.apiLog || []).at(-1);
  const okLast = last?.ok;
  st.innerHTML = `
    <div class="bk-notice ${last ? (okLast ? "ok" : "warn") : ""}">
      <b>${last ? (okLast ? "✓ 動いています" : "⚠ 前回は失敗しました") : "まだ通信していません"}</b>
      <p>${last ? `最後のやりとり:${new Date(last.at).toLocaleString("ja-JP")}<br>
        ${okLast ? esc(apiMetaLine(last)) : esc(last.error || "")}` :
        "学習タブで話しかけると、ここに記録が出ます。"}</p>
    </div>
    <div class="row-kv"><span>使っているAI</span><b>${esc(providerOf(S.provider).short)} / ${esc(curModel())}</b></div>
    <div class="row-kv"><span>直近30日のやりとり</span><b>${t.calls} 回</b></div>
    <div class="row-kv"><span>直近30日の概算料金</span><b>${t.yen ? "約" + t.yen + " 円" : "—"}</b></div>
    <div class="row-kv"><span>AIが道具を使った回数</span><b>${t.tools} 回</b></div>
    <p class="cs">「道具を使った回数」は、AIが記録の書き込みや前提の診断を実際に行った回数です。
      ここが増えていれば、単に会話しているのではなく<b>学習データを更新しながら動いている</b>ということです。</p>`;

  const box = document.querySelector("#apiLogBox");
  const rows = (S.apiLog || []).slice(-12).reverse();
  box.innerHTML = rows.length ? rows.map((r) => {
    const d = new Date(r.at);
    const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `<div class="api-row ${r.ok ? "" : "ng"}">
      <span class="api-t">${hm}</span>
      <span class="api-b">${r.ok ? esc(apiMetaLine(r)) : "✕ " + esc(r.error || "失敗")}
        ${r.tools?.length ? `<span class="api-tools">${r.tools.map(esc).join(" → ")}</span>` : ""}</span>
    </div>`;
  }).join("") : `<p class="cs">まだ記録はありません。</p>`;
}

async function testApi() {
  const btn = document.querySelector("#testApi");
  const out = document.querySelector("#apiTestResult");
  btn.disabled = true; btn.textContent = "確かめています…";
  out.innerHTML = `<p class="cs">問い合わせ中…</p>`;
  const t0 = Date.now();
  try {
    if (!curKey()) throw new Error("APIキーが設定されていません");
    let reply = "";
    const res = await sendToProvider({
      provider: S.provider, model: curModel(), apiKey: curKey(), baseUrl: curBaseUrl(),
      system: "あなたは日本語で答えます。",
      messages: [{ role: "user", content: "『準備できました』とだけ返してください。" }],
      tools: null,
      onDelta: (t) => { reply += t; },
    });
    const ms = Date.now() - t0;
    const u = res.usage || { in: 0, out: 0 };
    const yen = usageYen(S.provider, curModel(), u);
    const text = reply || res.content.find((b) => b.type === "text")?.text || "(返事なし)";
    logApi({ ok: true, provider: S.provider, model: curModel(), ms, in: u.in, out: u.out, yen, tools: [], test: true });
    save();
    out.innerHTML = `<div class="bk-notice ok"><b>✓ つながりました</b>
      <p>AIの返事:「${esc(text.trim().slice(0, 60))}」<br>
        ${esc(providerOf(S.provider).short)} ${esc(curModel())} ・ ${(ms / 1000).toFixed(1)}秒
        ・ ${u.in + u.out}トークン ${yen != null ? `・ 約${yen < 0.1 ? "0.1未満" : yen}円` : ""}</p></div>`;
  } catch (e) {
    logApi({ ok: false, provider: S.provider, model: curModel(), ms: Date.now() - t0,
             error: e instanceof ApiError ? e.friendly() : String(e.message || e) });
    save();
    out.innerHTML = `<div class="bk-notice warn"><b>✕ つながりませんでした</b>
      <p>${esc(e instanceof ApiError ? e.friendly() : String(e.message || e))}</p></div>`;
  } finally {
    btn.disabled = false; btn.textContent = "接続を確かめる";
    renderApiPanel();
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

  // ★通信先がCSPで許可されているか。ダメなら直し方まで書く
  const blocked = needBase ? cspBlockedHost(curBaseUrl()) : "";
  const bw = $("#baseUrlWarn");
  bw.hidden = !blocked;
  if (blocked) {
    bw.innerHTML = `⚠ <b>${esc(blocked)}</b> へは通信できない設定になっています。<br>
      安全のため、通信先を index.html の中で限定しているためです。<br>
      使うには <code>index.html</code> の <code>connect-src</code> に
      <code>https://${esc(blocked)}</code> の1行を足してください。`;
  }
  const list = cspConnectList();
  $("#cspNote").innerHTML = list
    ? `🔒 このアプリが通信できる先は、あらかじめ
       <b>${list.filter((x) => x.startsWith("http")).length}か所</b>に限定されています。
       もしどこかに不正なスクリプトが入り込んでも、キーを知らないサーバーへは送れません。`
    : "";

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
  S.persona = "sensei"; S.personaPinned = true; renderPersona(); go("study");
  const next = a.items.find((i) => i.status === "todo") || a.items[0];
  send(`「${a.title}」の${next.n}問目からやりたいです。答えは先に言わないで、一緒に進めてください。`);
}

function askHomeworkHelp(id) {
  const a = S.homework.find((x) => x.id === id);
  if (!a) return;
  S.persona = "sensei"; S.personaPinned = true; renderPersona(); go("study");
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
