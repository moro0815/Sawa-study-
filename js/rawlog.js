/* ═══════════════════════════════════════════════════════════════════
   rawlog.js — 生データを、消さずに6年ためる

   ★なぜ分けるのか
   いまの仕組みは「現在どういう状態か」を持っています(記憶モデル、転移レベル、
   誤答原因の集計)。これは**加工されたあとの数字**です。
   加工の仕方を将来もっと良くしたくなったとき、加工後しか残っていないと
   **やり直しがききません。**

   そこで3層に分けます。

     ┌─ 生データ ────────────────────────────────┐
     │ 問題ID / 答えた内容 / 正誤 / 確信度 /       │  ← 消さない
     │ 回答時間 / 端末 / 日時                      │     ここが資産
     └───────────────────────────────────────────┘
                       ↓ いつでも作り直せる
     ┌─ 分析データ ──────────────────────────────┐
     │ 誤答原因 / 概念 / 前提概念 / 転移レベル /   │  ← 作り直せる
     │ 定着度(記憶モデル)                        │
     └───────────────────────────────────────────┘
                       ↓
     ┌─ 長期記憶 ────────────────────────────────┐
     │ 苦手パターン / 効く学習法 / 指導方針 /      │  ← 積み上がる
     │ 次回の復習                                  │
     └───────────────────────────────────────────┘

   ★rebuildFromRaw() を用意した理由
   「作り直せます」と書くだけなら誰でも書けます。**実際に作り直す関数**を
   置いておかないと、いつのまにか生データだけでは足りない状態になります。
   このアプリでは、記憶モデルと転移レベルを生データから丸ごと再計算できます。
   将来 FSRS の本家パラメータに寄せるときも、6年ぶんを流し直すだけです。

   ★保存先を localStorage から IndexedDB に移した理由
   6年 × 1日10問 ≒ 22,000件。localStorage は端末あたり約5MBで、
   すでに状態・12世代のひかえ・Lukeの絵が入っています。**足りません。**
   IndexedDB なら桁がひとつ以上違います。iPhone / iPad の Safari でも使えます。
   使えない環境では localStorage に落ちますが、そのときだけ古いものを間引きます。

   ⚠️ Safari の「Webサイトデータを消去」は IndexedDB も消します。
      いままでどおり、ファイル書き出しとサーバーのひかえが最後の砦です。
   ═══════════════════════════════════════════════════════════════════ */

const RAW_DB = "sawa-navi-raw";
const RAW_STORE = "events";
const RAW_LS_KEY = "sawa-navi-raw-fallback";
/** localStorage に落ちたときだけの上限。IndexedDB では無制限(消さない) */
const RAW_LS_MAX = 4000;

let RAW = [];          // 全件をメモリに載せる(2万件でも数MB。分析は同期でやりたい)
let rawDb = null;
let rawReady = false;
let rawQueue = [];

/* ── 端末の種類 ───────────────────────────────────────── */

/** どの端末で答えたか。あとで「iPadのほうが集中できる」などを見るため */
function deviceTag() {
  const ua = navigator.userAgent;
  const touch = navigator.maxTouchPoints || 0;
  let d = "pc";
  if (/iPhone/.test(ua)) d = "iphone";
  else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch > 1)) d = "ipad";  // iPadOSはMacを名乗る
  else if (/Android/.test(ua)) d = /Mobile/.test(ua) ? "android" : "androidtab";
  else if (/Macintosh/.test(ua)) d = "mac";
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
  return d + (standalone ? "+app" : "");
}

/* ── IndexedDB ────────────────────────────────────────── */

function rawOpen() {
  return new Promise((resolve) => {
    if (!window.indexedDB) return resolve(null);
    let req;
    try { req = indexedDB.open(RAW_DB, 1); } catch (_) { return resolve(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(RAW_STORE)) {
        const st = db.createObjectStore(RAW_STORE, { keyPath: "id", autoIncrement: true });
        st.createIndex("t", "t");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    // プライベートブラウズなどで固まることがあるので、待ちすぎない
    setTimeout(() => resolve(req.result || null), 3000);
  });
}

/** 起動時に1回。全件をメモリへ */
async function rawInit() {
  rawDb = await rawOpen();
  if (!rawDb) {
    try { RAW = JSON.parse(localStorage.getItem(RAW_LS_KEY)) || []; } catch (_) { RAW = []; }
    rawReady = true;
    flushQueue();
    return { store: "localStorage", count: RAW.length };
  }
  RAW = await new Promise((res) => {
    try {
      const r = rawDb.transaction(RAW_STORE, "readonly").objectStore(RAW_STORE).getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    } catch (_) { res([]); }
  });
  RAW.sort((a, b) => a.t - b.t);
  rawReady = true;
  flushQueue();
  return { store: "IndexedDB", count: RAW.length };
}

function flushQueue() {
  const q = rawQueue; rawQueue = [];
  q.forEach(rawWrite);
}

function rawWrite(ev) {
  if (rawDb) {
    try { rawDb.transaction(RAW_STORE, "readwrite").objectStore(RAW_STORE).add(ev); }
    catch (_) { rawSaveLS(); }
  } else {
    rawSaveLS();
  }
}

function rawSaveLS() {
  // localStorage しか無い環境でだけ、あふれたら古いものから間引く
  if (RAW.length > RAW_LS_MAX) RAW.splice(0, RAW.length - RAW_LS_MAX);
  try { localStorage.setItem(RAW_LS_KEY, JSON.stringify(RAW)); } catch (_) {
    RAW.splice(0, Math.ceil(RAW.length * 0.2));
    try { localStorage.setItem(RAW_LS_KEY, JSON.stringify(RAW)); } catch (_) {}
  }
}

/* ── 書く ─────────────────────────────────────────────── */

/**
 * 生データを1件。★ここに入れるのは「観測した事実」だけ。
 * 誤答原因や転移レベルの判断は分析データなので、
 * あとから作り直せるように、判断のもとになった事実も一緒に残す。
 */
function rawPush(o) {
  const ev = {
    t: o.t || Date.now(),
    kind: o.kind || "answer",       // answer | write | explain | conv
    qid: String(o.qid || "").slice(0, 60),          // 問題ID
    concept: String(o.concept || "").slice(0, 40),
    subject: String(o.subject || "").slice(0, 12),
    answer: String(o.answer ?? "").slice(0, 300),   // 実際に答えた内容
    expect: String(o.expect ?? "").slice(0, 300),   // 正解
    correct: o.correct === true ? 1 : o.correct === false ? 0 : null,
    conf: [1, 2, 3].includes(o.conf) ? o.conf : null,
    ms: Number.isFinite(o.ms) ? Math.max(0, Math.min(36e5, Math.round(o.ms))) : null, // 回答時間
    dev: o.dev || deviceTag(),
    // 以下は「そのとき AI がどう判断したか」の記録。分析のやり直しでは上書きしてよい
    cause: String(o.cause || "").slice(0, 20),
    level: Number.isFinite(o.level) ? o.level : null,
    tactic: String(o.tactic || "").slice(0, 12),
    grade: Number.isFinite(o.grade) ? o.grade : null,
    minsIn: Number.isFinite(o.minsIn) ? o.minsIn : null,
  };
  RAW.push(ev);
  if (!rawReady) rawQueue.push(ev); else rawWrite(ev);
  return ev;
}

/* ── 読む ─────────────────────────────────────────────── */

function rawAll() { return RAW; }
function rawCount() { return RAW.length; }
function rawSince(days) {
  const t = Date.now() - days * 864e5;
  return RAW.filter((r) => r.t >= t);
}
function rawSpan() {
  if (!RAW.length) return null;
  return { from: new Date(RAW[0].t).toISOString().slice(0, 10),
           to: new Date(RAW.at(-1).t).toISOString().slice(0, 10) };
}
function rawByDevice() {
  const out = {};
  for (const r of RAW) {
    const d = r.dev || "不明";     // 古いひかえから戻したものには端末が入っていない
    (out[d] ||= { n: 0, ok: 0 }); out[d].n++; out[d].ok += r.correct === 1 ? 1 : 0;
  }
  return out;
}
/** 答えるのにかかった時間の中央値(秒)。速すぎる = 勘、遅すぎる = 詰まっている */
function rawMedianSeconds(rows = RAW) {
  const v = rows.map((r) => r.ms).filter((x) => Number.isFinite(x) && x > 300).sort((a, b) => a - b);
  return v.length ? Math.round(v[Math.floor(v.length / 2)] / 100) / 10 : null;
}

/* ── 出す・戻す(バックアップ用) ────────────────────────── */

function rawExport() { return RAW; }

/** ファイルやサーバーのひかえから戻す。重複は日時＋問題IDで弾く */
async function rawImport(list) {
  if (!Array.isArray(list) || !list.length) return 0;
  const seen = new Set(RAW.map((r) => r.t + "|" + r.qid + "|" + r.answer));
  const add = list.filter((r) => r && r.t && !seen.has(r.t + "|" + (r.qid || "") + "|" + (r.answer || "")));
  for (const r of add) { const { id, ...rest } = r; RAW.push(rest); rawWrite(rest); }
  RAW.sort((a, b) => a.t - b.t);
  if (!rawDb) rawSaveLS();
  return add.length;
}

/* ── 作り直す ─────────────────────────────────────────
   ★「生データがあれば作り直せます」を、実際に動く形にしておく。
     これが無いと、いつのまにか生データだけでは足りなくなる。 */

/**
 * 生データから、分析データ(記憶モデル・転移レベル・原因集計)を丸ごと作り直す。
 * 復習アルゴリズムを差し替えたときは、これを1回流すだけで6年ぶんが反映される。
 */
function rebuildFromRaw(S, opts = {}) {
  const rows = RAW.filter((r) => r.kind === "answer" || r.kind === "write")
    .slice().sort((a, b) => a.t - b.t);
  if (!rows.length) return { rebuilt: 0, note: "生データがありません" };

  const mem = {}, tr = {}, ansLog = [];
  let agg = { n: 0, ok: 0, causes: {}, tactics: {}, hours: {}, first: null };

  for (const r of rows) {
    const c = CONCEPT_MAP[r.concept];
    if (!c) continue;

    // 1) 記憶モデル — そのときの grade / 確信度で、当時の順に流し直す
    const st = (mem[c.id] ||= newMemState(c.id));
    const grade = Number.isFinite(r.grade) ? r.grade : (r.correct === 1 ? 3 : 1);
    reviewConcept(st, grade, r.conf || 2, r.t);

    // 2) 転移レベル
    if (Number.isFinite(r.level)) {
      const t = (tr[c.id] ||= newTransferState(c.id));
      const lv = Math.max(1, Math.min(5, r.level));
      if (r.correct === 1) {
        t.hits[lv] = (t.hits[lv] || 0) + 1;
        if (lv >= t.lv && t.hits[lv] >= CLEAR_NEEDED && t.lv < 5) t.lv = lv + 1;
      } else { t.hits[lv] = 0; }
    }

    // 3) 1問ごとの記録(cause.js が使う形)
    const rec = {
      t: r.t, c: c.id, s: r.subject || SUBJECTS[c.s]?.name || "",
      ok: r.correct === 1 ? 1 : 0, cf: r.conf || 0, ca: r.cause || "",
      tl: r.level || 1, tc: r.tactic || "", hr: new Date(r.t).getHours(),
      mi: Number.isFinite(r.minsIn) ? r.minsIn : null,
    };
    ansLog.push(rec);
    agg.n++; agg.ok += rec.ok; agg.first ||= r.t;
    if (rec.ca) agg.causes[rec.ca] = (agg.causes[rec.ca] || 0) + 1;
    if (rec.tc) { (agg.tactics[rec.tc] ||= { n: 0, ok: 0 }); agg.tactics[rec.tc].n++; agg.tactics[rec.tc].ok += rec.ok; }
    (agg.hours[rec.hr] ||= { n: 0, ok: 0 }); agg.hours[rec.hr].n++; agg.hours[rec.hr].ok += rec.ok;
  }

  // 説明(Lv5)の合格は、生データの explain から戻す
  for (const r of RAW.filter((x) => x.kind === "explain")) {
    const t = tr[r.concept];
    if (t && r.correct === 1) { t.lv = 5; t.exp = { passed: true, at: r.t, attempts: 1 }; t.masteredAt = r.t; }
  }

  if (opts.dryRun) {
    return { rebuilt: rows.length, concepts: Object.keys(mem).length, dryRun: true,
             sample: Object.entries(mem).slice(0, 3).map(([k, v]) => `${k}:${Math.round(v.mastery * 100)}%`) };
  }

  S.mem = mem;
  S.tr = tr;
  S.ansLog = ansLog.slice(-1200);
  S.ansAgg = agg;
  return { rebuilt: rows.length, concepts: Object.keys(mem).length };
}
