/* ═══════════════════════════════════════════════════════════
   aiuse.js — AIの使い分け(勉強用 / 英語用)
   ─────────────────────────────────────────────────────────
   ★なぜ分けるのか
   ・請求を分けて見られる。英会話は声を送るので、勉強の会話より
     費用の増え方が違う。どちらが伸びているか分からないと止められない
   ・片方のキーが漏れても、被害がその用途だけで止まる
   ・得意なAIが違う。英会話は声をそのまま聞ける Gemini、
     勉強は別の会社、という組み合わせが選べる

   ★モデルは固定しない
   モデル名を空にしておくと、そのときのアプリの既定を使う。
   設定画面を開いただけでモデル名が欄に書き込まれて【固定されてしまう】
   作りだったので、そこを直した(空欄=自動のまま保てるようにした)。

   ★キーは「用途 × 提供元」で覚える
   用途だけで持つと、会社を切り替えたときに前のキーが消える。
   提供元だけで持つと、勉強用と英語用が同じキーになってしまう。
   ═══════════════════════════════════════════════════════════ */

const AI_USES = {
  study: {
    id: "study", name: "勉強用", emoji: "📘",
    what: "ミミ先生・Luke・ナギとの学習、宿題の写真、書く練習の見てもらう",
    childWord: "べんきょう",
  },
  talk: {
    id: "talk", name: "英語用", emoji: "🎙",
    what: "英会話モード(声のやりとり)",
    childWord: "えいかいわ",
  },
};

const AI_USE_IDS = Object.keys(AI_USES);
const DEFAULT_USE = "study";

/** 有効な用途IDに丸める。知らない値が来ても勉強用に落とす */
function useId(u) { return AI_USES[u] ? u : DEFAULT_USE; }

/* ── 設定の入れ物 ──────────────────────────────────────── */

/**
 * 用途ごとの設定を取り出す。無ければ作る。
 * ★古い形(S.provider / S.model / S.baseUrl / S.apiKeys[提供元])から
 *   1回だけ引き継ぐ。すでに動いている端末のキーを失わないため。
 */
function aiUse(S, u) {
  const id = useId(u);
  migrateAiSettings(S);
  return (S.ai[id] ||= { provider: "anthropic", model: "", baseUrl: "" });
}

function migrateAiSettings(S) {
  if (S.ai && S.aiMigrated) return;

  const oldProvider = S.provider || "anthropic";
  const oldKeys = (S.apiKeys && !AI_USES[Object.keys(S.apiKeys)[0]]) ? S.apiKeys : null;
  const oldExp = (S.keyExpiry && !AI_USES[Object.keys(S.keyExpiry)[0]]) ? S.keyExpiry : null;
  const oldInv = (S.keyInvalid && !AI_USES[Object.keys(S.keyInvalid)[0]]) ? S.keyInvalid : null;

  S.ai ||= {};
  for (const id of AI_USE_IDS) {
    /* ★どちらの用途も、いま使っている会社をそのまま引き継ぐ。
       英語用だけ Gemini を既定にすると、手持ちのキーが対象外になり、
       更新した瞬間に【英会話だけ黙って使えなくなる】。
       Gemini のほうが英会話に向いている(声をそのまま聞ける)ことは、
       設定画面のおすすめとして伝えるにとどめる。 */
    S.ai[id] ||= {
      provider: oldProvider,
      model: S.model || "",
      baseUrl: S.baseUrl || "",
    };
  }

  /* キー・期限・拒否の印を「用途 × 提供元」の形に組み直す。
     古い形は提供元ごとだったので、両方の用途に同じものを引き継ぐ
     (いきなり英会話が使えなくなるのを避ける。あとで別々に入れ替えられる) */
  const nest = (old, fallbackEmpty) => {
    const out = {};
    for (const id of AI_USE_IDS) out[id] = old ? { ...old } : { ...(fallbackEmpty || {}) };
    return out;
  };
  if (oldKeys) S.apiKeys = nest(oldKeys);
  if (oldExp)  S.keyExpiry = nest(oldExp);
  if (oldInv)  S.keyInvalid = nest(oldInv);

  S.apiKeys ||= {}; S.keyExpiry ||= {}; S.keyInvalid ||= {};
  for (const id of AI_USE_IDS) {
    S.apiKeys[id] ||= {}; S.keyExpiry[id] ||= {}; S.keyInvalid[id] ||= {};
  }
  S.aiMigrated = 1;
}

/* ── 読み書き ──────────────────────────────────────────── */

function useProviderId(S, u) { return aiUse(S, u).provider; }

/** その用途のキー。無ければ "" */
function useKey(S, u) {
  const id = useId(u);
  migrateAiSettings(S);
  return (S.apiKeys[id] || {})[useProviderId(S, id)] || "";
}

function setUseKey(S, u, key) {
  const id = useId(u);
  migrateAiSettings(S);
  (S.apiKeys[id] ||= {})[useProviderId(S, id)] = String(key || "").trim();
}

/**
 * その用途のモデル名。
 * ★空のまま = 自動。ここで既定に落とすが、**設定には書き戻さない**。
 *   書き戻すとモデルが固定され、新しいものが出ても乗り換わらない。
 */
function useModel(S, u, providers) {
  const a = aiUse(S, u);
  if (a.model) return a.model;
  const p = (providers || PROVIDERS)[a.provider];
  return p ? p.defaultModel : "";
}

/** モデル名を自分で決めているか(=自動でない) */
function useModelPinned(S, u) { return !!aiUse(S, u).model; }

function useBaseUrl(S, u, providers) {
  const a = aiUse(S, u);
  const p = (providers || PROVIDERS)[a.provider];
  return a.baseUrl || (p && p.defaultBaseUrl) || "";
}

/** 用途をまたいで、同じ提供元・同じキーを使っていないか(請求が分けられない) */
function usesShareKey(S) {
  migrateAiSettings(S);
  const a = useKey(S, "study"), b = useKey(S, "talk");
  return !!a && a === b;
}

/** 設定が済んでいる用途の数 */
function usesReady(S) {
  return AI_USE_IDS.filter((id) => !!useKey(S, id)).length;
}
