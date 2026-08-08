/* ═══════════════════════════════════════════════════════════════════
   expiry.js — 「AIの使用期限」

   ★何のためか
   AIのキーは、いちど作ると**期限なしで使えてしまいます。**
   端末をなくしたとき、家族以外の目に触れたとき、
   知らないうちに使われ続けても気づけません。
   そこで期限を決めて、そこで一度立ち止まる形にします。

   ★正直に書いておくべきこと
   **ここで日付を入れても、AI会社側のキーが自動で無効になるわけではありません。**
   このアプリが「その日が来たら送信を止め、入れ替えを促す」だけです。
   本当に安全になるのは、保護者が**提供元でキーを作り直した瞬間**です。
   期限は、そのための**忘れないための仕掛け**です。ここを混同させません。

   ★沙和さんには「API」という言葉を出しません。
   12歳に「APIキーの有効期限が切れました」と言っても、何もできません。
   できるのは「おうちの人に伝えること」だけなので、そう言わせます。
   そして**止まらない機能(書く練習など)へ案内します。**
   何もできなくなる画面は、それだけで学習をやめる理由になります。
   ═══════════════════════════════════════════════════════════════════ */

/** 期限が近いと判断する日数 */
const EXPIRY_SOON_DAYS = 7;

/** よく使う期間。保護者が1タップで選べるように */
const EXPIRY_PRESETS = [
  { d: 30,  label: "1ヶ月" },
  { d: 90,  label: "3ヶ月" },
  { d: 180, label: "6ヶ月" },
  { d: 0,   label: "期限なし" },
];

function expiryStore(S) { return (S.keyExpiry ||= {}); }

/** 期限日(YYYY-MM-DD)。決めていなければ "" */
function keyExpiry(S, provider) {
  return expiryStore(S)[provider || S.provider] || "";
}

function setKeyExpiry(S, provider, iso) {
  const p = provider || S.provider;
  if (!iso) delete expiryStore(S)[p];
  else expiryStore(S)[p] = String(iso).slice(0, 10);
  return keyExpiry(S, p);
}

/** 今日から n 日後の YYYY-MM-DD */
function isoAfterDays(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);                 // 時差でずれないよう昼に寄せる
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * いまの状態。
 * state: none=期限を決めていない / ok=まだ先 / soon=もうすぐ /
 *        today=今日まで / expired=切れた / invalid=提供元に拒否された
 */
function expiryStatus(S, provider) {
  const p = provider || S.provider;
  const iso = keyExpiry(S, p);
  const invalid = !!(S.keyInvalid || {})[p];

  if (invalid) return { provider: p, state: "invalid", iso, days: null };
  if (!iso) return { provider: p, state: "none", iso: "", days: null };

  const today = new Date(todayISO() + "T00:00:00").getTime();
  const end = new Date(iso + "T00:00:00").getTime();
  const days = Math.round((end - today) / 864e5);

  return {
    provider: p, iso, days,
    state: days < 0 ? "expired" : days === 0 ? "today" : days <= EXPIRY_SOON_DAYS ? "soon" : "ok",
  };
}

/** いまAIに送ってよいか */
function keyUsable(S) {
  const st = expiryStatus(S);
  return st.state !== "expired" && st.state !== "invalid";
}

/** 提供元にキーを拒否された(401/403)。期限切れと同じ扱いにする */
function markKeyInvalid(S, provider) {
  (S.keyInvalid ||= {})[provider || S.provider] = true;
}

/** キーを入れ直したら、拒否の印を消す */
function clearKeyInvalid(S, provider) {
  const k = (S.keyInvalid ||= {});
  delete k[provider || S.provider];
}

/* ── 沙和さんへの言葉 ──────────────────────────────────
   ★「API」「キー」「トークン」「有効期限切れ」は1つも使いません。
     使えるのは、本人が実際にできることの説明だけです。 */

function expiryChildNotice(S) {
  const st = expiryStatus(S);
  if (st.state === "ok" || st.state === "none") return null;

  if (st.state === "expired" || st.state === "invalid") {
    return {
      level: "stop",
      title: "AIの先生とお話しできる期間が おわりました",
      body: "おうちの人に <b>「沙和ナビ、こうしんおねがい」</b> と伝えてください。<br>"
          + "すぐに直せます。沙和さんがすることは、これだけで大丈夫です。",
      // ★止まらないものへ案内する。何もできない画面にしない
      still: "そのあいだも <b>「✍️ 書く」の漢字とつづりの練習</b>と、"
           + "<b>これまでの記録を見ること</b>はできます。記録が消えることもありません。",
      luke: "おうちの人にお願いしとこ?オレはここで待ってるね。",
    };
  }
  if (st.state === "today") {
    return {
      level: "warn",
      title: "きょうで AIの先生とお話しできる期間が おわります",
      body: "おうちの人に <b>「沙和ナビ、こうしんおねがい」</b> と伝えておいてください。",
      still: "", luke: "今日のうちに言っておこ!",
    };
  }
  return {
    level: "warn",
    title: `あと ${st.days}日 で AIの先生とお話しできる期間が おわります`,
    body: "おうちの人に <b>「沙和ナビ、こうしんおねがい」</b> と伝えておいてください。",
    still: "", luke: `あと${st.days}日だって。伝えといたほうがいいかも。`,
  };
}

/* ── 保護者への言葉 ────────────────────────────────────── */

function expiryParentNotice(S) {
  const st = expiryStatus(S);
  const pv = providerOf(st.provider);
  const name = pv?.short || st.provider;

  if (st.state === "invalid") return {
    level: "alert",
    title: `${name} のキーが提供元に拒否されました`,
    body: "無効化されたか、作り直された可能性があります。提供元で新しいキーを作って入れ直してください。"
        + "沙和さんの画面には「おうちの人に伝えてね」とだけ出ています。",
  };
  if (st.state === "expired") return {
    level: "alert",
    title: `AIの使用期限が ${-st.days}日前 に切れました`,
    body: "いまAIへの送信は止まっています。**提供元でキーを作り直して**入れ直し、次の期限を決めてください。",
  };
  if (st.state === "today") return {
    level: "warn",
    title: "AIの使用期限は今日までです",
    body: "明日から送信が止まります。今のうちに入れ替えておくと、沙和さんの学習が途切れません。",
  };
  if (st.state === "soon") return {
    level: "warn",
    title: `AIの使用期限まで あと ${st.days}日`,
    body: "切れると送信が止まります(記録は消えません)。都合のよいときに入れ替えてください。",
  };
  if (st.state === "none") return {
    level: "warn",
    title: "AIの使用期限を決めていません",
    body: "期限を決めておくと、**定期的にキーを作り直すきっかけ**になります。"
        + "端末をなくしたときや、知らないうちに使われていたときに、被害を期間で区切れます。3ヶ月をおすすめします。",
  };
  return {
    level: "ok",
    title: `AIの使用期限まで あと ${st.days}日(${st.iso})`,
    body: "期限が来たら、提供元でキーを作り直して入れ替えてください。",
  };
}

/** AIに渡す。期限のことを沙和さんに難しく説明させないため */
function expiryPromptBlock(S) {
  const st = expiryStatus(S);
  if (st.state === "ok" || st.state === "none") return "";
  return "\n# AIの使用期限について\n"
    + `- あと ${st.days}日 で、このアプリからAIへ送れなくなります(保護者が決めた期限)\n`
    + "- 沙和さんから聞かれたら、**「API」「キー」という言葉を使わずに**答えてください\n"
    + "- 伝えることは1つだけです:**「おうちの人に『沙和ナビ、こうしんおねがい』と言ってね」**\n"
    + "- 心配させないでください。記録が消えることはありません。書く練習はそのまま使えます\n";
}
