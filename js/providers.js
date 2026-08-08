/* =========================================================================
   providers.js — AIプロバイダの切り替え

   アプリ内部は Claude(Anthropic)形式のメッセージ・ツール定義で統一し、
   各プロバイダのアダプタがそこへ変換する。
   これにより personas.js / app.js 側はプロバイダを意識しなくてよい。

   内部の正規形:
     messages: [{role:"user"|"assistant", content: string | Block[]}]
     Block:    {type:"text", text}
             | {type:"image", source:{type:"base64", media_type, data}}
             | {type:"tool_use", id, name, input}
             | {type:"tool_result", tool_use_id, content, is_error?}
     tools:    [{name, description, input_schema}]
   ========================================================================= */

const MAX_TOKENS = 4000;

/* ── プロバイダ定義 ───────────────────────────────────────── */

const PROVIDERS = {
  anthropic: {
    label: "Claude (Anthropic)",
    short: "Claude",
    defaultModel: "claude-opus-5",
    keyUrl: "https://console.anthropic.com/",
    keyLabel: "Anthropic APIキー",
    keyPlaceholder: "sk-ant-api03-…",
    keyPrefix: "sk-ant-",
    needsBaseUrl: false,
    note: "教える力と写真の読み取りがいちばん高い。そのぶん料金も高い。",
    models: [
      { id: "claude-opus-5",    label: "Opus 5(最高性能)",    inUsd: 5,  outUsd: 25 },
      { id: "claude-sonnet-5",  label: "Sonnet 5(バランス)",  inUsd: 3,  outUsd: 15 },
      { id: "claude-haiku-4-5", label: "Haiku 4.5(最安・軽量)", inUsd: 1, outUsd: 5 },
    ],
  },

  google: {
    label: "Gemini (Google)",
    short: "Gemini",
    defaultModel: "gemini-3.6-flash",
    keyUrl: "https://aistudio.google.com/apikey",
    keyLabel: "Google AI Studio APIキー",
    keyPlaceholder: "AIza…",
    keyPrefix: "AIza",
    needsBaseUrl: false,
    note: "料金が安く、無料枠もある。写真もツールも使える。まずはここから試すのがおすすめ。",
    models: [
      { id: "gemini-3.6-flash",      label: "3.6 Flash(おすすめ)", inUsd: 1.5, outUsd: 7.5 },
      { id: "gemini-3.5-flash-lite", label: "3.5 Flash-Lite(最安)", inUsd: 0.3, outUsd: 2.5 },
      { id: "gemini-3.1-pro",        label: "3.1 Pro(高性能)",     inUsd: 2,   outUsd: 12 },
    ],
  },

  openai: {
    label: "OpenAI互換 (DeepSeek / OpenRouter など)",
    short: "OpenAI互換",
    defaultModel: "deepseek/deepseek-chat",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
    keyLabel: "APIキー",
    keyPlaceholder: "sk-or-v1-… / sk-…",
    keyPrefix: "",
    needsBaseUrl: true,
    note: "「OpenAI互換」をうたうサービスならどこでも使える。ただしブラウザから直接呼べるかは提供元しだい(下記の注意を参照)。",
    models: [
      { id: "deepseek/deepseek-chat",        label: "DeepSeek Chat(格安)" },
      { id: "google/gemini-3.6-flash",       label: "Gemini 3.6 Flash" },
      { id: "anthropic/claude-sonnet-5",     label: "Claude Sonnet 5" },
      { id: "openai/gpt-5-mini",             label: "GPT-5 mini" },
    ],
  },
};

const PROVIDER_IDS = Object.keys(PROVIDERS);

function providerOf(id) { return PROVIDERS[id] || PROVIDERS.anthropic; }

/** 1往復あたりの目安金額(円)。入力8000/出力800トークンを仮定 */
function costPerTurnYen(providerId, modelId, usdJpy = 155) {
  const m = providerOf(providerId).models.find((x) => x.id === modelId);
  if (!m || m.inUsd == null) return null;
  const usd = (8000 / 1e6) * m.inUsd + (800 / 1e6) * m.outUsd;
  return Math.round(usd * usdJpy * 10) / 10;
}

/** 実際に使ったトークン数から円を出す */
function usageYen(providerId, modelId, usage, usdJpy = 155) {
  const m = providerOf(providerId).models.find((x) => x.id === modelId);
  if (!m || m.inUsd == null || !usage) return null;
  const usd = (usage.in / 1e6) * m.inUsd + (usage.out / 1e6) * m.outUsd;
  return Math.round(usd * usdJpy * 100) / 100;
}

/* ── エラー ──────────────────────────────────────────────── */

class ApiError extends Error {
  constructor(status, message, kind) { super(message); this.status = status; this.kind = kind; }
  friendly() {
    if (this.kind === "cors")
      return "このサービスはブラウザから直接呼び出せない設定のようです(CORS)。" +
             "別のプロバイダ、またはブラウザ利用に対応した提供元(OpenRouterなど)をお試しください。";
    if (this.kind === "network")
      return "通信できませんでした。電波とURLの綴りを確認してください。";
    if (this.status === 400) {
      // 履歴の tool_use / tool_result の対応が崩れている場合。
      // 利用者にはモデル名の話をしても意味がないので分けて出す。
      if (/tool_result|tool_use|tool_call/i.test(this.message))
        return "会話のつながりが途中で切れてしまいました。ここまでの会話をいったん整理してから、もう一度送ってみてください。";
      if (/model/i.test(this.message))
        return "モデル名が正しくないようです。設定画面で綴りを確認するか、「使えるモデルの一覧を取得」から選び直してください。" + (this.message ? "\n" + this.message : "");
      return "リクエストが受け付けられませんでした。" + (this.message ? "\n" + this.message : "");
    }
    if (this.status === 401) return "APIキーが正しくないようです。設定画面で確認してください。";
    if (this.status === 403) return "このAPIキーには権限がないようです。設定画面で確認してください。";
    if (this.status === 404) return "そのモデルが見つかりませんでした。モデル名を確認してください。";
    if (this.status === 429) return "少し混み合っています(または無料枠の上限)。1分ほど待ってからもう一度お願いします。";
    if (this.status === 529) return "サーバーが混雑しています。少し待ってからもう一度。";
    if (this.status >= 500) return "サーバー側の不具合のようです。少し待ってからもう一度。";
    if (/credit|billing|balance|quota|残高/i.test(this.message)) return "APIの残高または利用枠が足りないようです。おうちの方に確認してください。";
    return this.message || "エラーが起きました。もう一度お試しください。";
  }
}

/** fetch の失敗をCORS/ネットワークに分けて投げ直す */
async function safeFetch(url, init) {
  try {
    return await fetch(url, init);
  } catch (e) {
    const cors = /cors|failed to fetch|networkerror|load failed/i.test(String(e && e.message));
    throw new ApiError(0, String(e && e.message || e), cors ? "cors" : "network");
  }
}

/* ── 共通のSSE行リーダー ─────────────────────────────────── */

async function readSSE(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      let ev;
      try { ev = JSON.parse(raw); } catch (_) { continue; }
      onEvent(ev);
    }
  }
}

async function errorFrom(res) {
  let detail = "";
  try {
    const j = await res.json();
    detail = j?.error?.message || j?.message || j?.error?.status || "";
  } catch (_) {}
  return new ApiError(res.status, detail);
}

/* =========================================================================
   Anthropic
   ========================================================================= */

async function sendAnthropic({ apiKey, model, system, messages, tools, onDelta }) {
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    stream: true,
    output_config: { effort: "medium" },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  };
  if (tools?.length) body.tools = tools;

  const res = await safeFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFrom(res);

  const blocks = [];
  const partial = {};
  let stopReason = null;
  const usage = { in: 0, out: 0 };

  await readSSE(res, (ev) => {
    if (ev.type === "message_start") {
      const u = ev.message?.usage || {};
      usage.in += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    }
    if (ev.type === "content_block_start") {
      const cb = ev.content_block;
      if (cb.type === "text") partial[ev.index] = { type: "text", text: "" };
      else if (cb.type === "tool_use") partial[ev.index] = { type: "tool_use", id: cb.id, name: cb.name, json: "" };
      else if (cb.type === "thinking") partial[ev.index] = { type: "thinking", skip: true };
    } else if (ev.type === "content_block_delta") {
      const p = partial[ev.index];
      if (!p) return;
      if (ev.delta.type === "text_delta") { p.text += ev.delta.text; onDelta?.(ev.delta.text); }
      else if (ev.delta.type === "input_json_delta") { p.json += ev.delta.partial_json; }
    } else if (ev.type === "content_block_stop") {
      const p = partial[ev.index];
      if (!p || p.skip) return;
      if (p.type === "text") { if (p.text) blocks.push({ type: "text", text: p.text }); }
      else if (p.type === "tool_use") {
        let input = {};
        try { input = p.json ? JSON.parse(p.json) : {}; } catch (_) {}
        blocks.push({ type: "tool_use", id: p.id, name: p.name, input });
      }
      delete partial[ev.index];
    } else if (ev.type === "message_delta") {
      if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
      if (ev.usage?.output_tokens) usage.out = ev.usage.output_tokens;
    } else if (ev.type === "error") {
      throw new ApiError(0, ev.error?.message || "ストリーミングエラー");
    }
  });

  if (stopReason === "refusal") throw new ApiError(0, "この内容にはお答えできませんでした。別の聞き方を試してみてください。");
  return { content: blocks.length ? blocks : [{ type: "text", text: "" }], usage };
}

/* =========================================================================
   Google Gemini
   ========================================================================= */

/** JSON Schema を Gemini が受け付ける形(OpenAPI 3.0 サブセット)に落とす */
function toGeminiSchema(s) {
  if (!s || typeof s !== "object") return null;
  const out = {};
  if (s.type) out.type = String(s.type).toUpperCase();
  if (s.description) out.description = s.description;
  if (Array.isArray(s.enum)) {
    // Gemini の enum は STRING 型にしか付けられない。
    // 数値の候補を文字列に変えると型が崩れるので、説明文に逃がす。
    if (out.type === "STRING") out.enum = s.enum.map(String);
    else out.description = `${out.description || ""}（次のいずれか: ${s.enum.join(", ")}）`.trim();
  }
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.properties) {
    const props = {};
    for (const [k, v] of Object.entries(s.properties)) {
      const c = toGeminiSchema(v);
      if (c) props[k] = c;
    }
    if (Object.keys(props).length) out.properties = props;
  }
  if (Array.isArray(s.required) && s.required.length) out.required = s.required;
  return Object.keys(out).length ? out : null;
}

function toGeminiTools(tools) {
  if (!tools?.length) return undefined;
  const decls = tools.map((t) => {
    const d = { name: t.name, description: t.description };
    const p = toGeminiSchema(t.input_schema);
    // 引数なしのツールは parameters を付けない(空オブジェクトは弾かれる)
    if (p && p.properties) d.parameters = p;
    return d;
  });
  return [{ functionDeclarations: decls }];
}

function toGeminiContents(messages) {
  // tool_use_id → ツール名 の対応を先に作る(GeminiのfunctionResponseは名前で紐づく)
  const nameById = {};
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) if (b.type === "tool_use") nameById[b.id] = b.name;
  }

  const contents = [];
  for (const m of messages) {
    const role = m.role === "assistant" ? "model" : "user";
    if (typeof m.content === "string") {
      if (m.content) contents.push({ role, parts: [{ text: m.content }] });
      continue;
    }
    const parts = [];
    for (const b of m.content) {
      if (b.type === "text") { if (b.text) parts.push({ text: b.text }); }
      else if (b.type === "image" || b.type === "document")
        parts.push({ inlineData: { mimeType: b.source.media_type, data: b.source.data } });
      else if (b.type === "tool_use") parts.push({ functionCall: { name: b.name, args: b.input || {} } });
      else if (b.type === "tool_result") {
        let value;
        try { value = JSON.parse(b.content); } catch (_) { value = { result: String(b.content) }; }
        if (value === null || typeof value !== "object" || Array.isArray(value)) value = { result: value };
        if (b.is_error) value = { error: String(b.content) };
        parts.push({ functionResponse: { name: nameById[b.tool_use_id] || "tool", response: value } });
      }
    }
    if (parts.length) contents.push({ role, parts });
  }
  return contents;
}

async function sendGemini({ apiKey, model, system, messages, tools, onDelta }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: toGeminiContents(messages),
    generationConfig: { maxOutputTokens: MAX_TOKENS },
  };
  const t = toGeminiTools(tools);
  if (t) body.tools = t;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const res = await safeFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFrom(res);

  const blocks = [];
  let text = "";
  let calls = 0;
  let finish = null;
  let blocked = null;
  const usage = { in: 0, out: 0 };

  await readSSE(res, (ev) => {
    if (ev.usageMetadata) {
      usage.in = ev.usageMetadata.promptTokenCount || usage.in;
      usage.out = ev.usageMetadata.candidatesTokenCount || usage.out;
    }
    if (ev.promptFeedback?.blockReason) blocked = ev.promptFeedback.blockReason;
    const cand = ev.candidates?.[0];
    if (!cand) return;
    if (cand.finishReason) finish = cand.finishReason;
    for (const p of cand.content?.parts || []) {
      if (typeof p.text === "string" && p.text) { text += p.text; onDelta?.(p.text); }
      else if (p.functionCall) {
        if (text) { blocks.push({ type: "text", text }); text = ""; }
        blocks.push({
          type: "tool_use",
          id: `gcall_${++calls}_${Date.now()}`,
          name: p.functionCall.name,
          input: p.functionCall.args || {},
        });
      }
    }
  });

  if (text) blocks.push({ type: "text", text });
  if (blocked) throw new ApiError(0, "この内容にはお答えできませんでした。別の聞き方を試してみてください。");
  if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT")
    throw new ApiError(0, "この内容にはお答えできませんでした。別の聞き方を試してみてください。");
  if (finish === "MALFORMED_FUNCTION_CALL")
    throw new ApiError(0, "うまく処理できませんでした。もう一度送ってみてください。");
  return { content: blocks.length ? blocks : [{ type: "text", text: "" }], usage };
}

/** APIキーで使えるモデル一覧を取得(設定画面の「一覧を取得」用) */
async function listGeminiModels(apiKey) {
  const res = await safeFetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    headers: { "x-goog-api-key": apiKey },
  });
  if (!res.ok) throw await errorFrom(res);
  const j = await res.json();
  return (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("streamGenerateContent"))
    .map((m) => ({ id: String(m.name).replace(/^models\//, ""), label: m.displayName || "" }));
}

/* =========================================================================
   OpenAI 互換 (/chat/completions)
   ========================================================================= */

function toOpenAIMessages(system, messages) {
  const out = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") { out.push({ role: m.role, content: m.content }); continue; }

    const toolResults = m.content.filter((b) => b.type === "tool_result");
    if (toolResults.length) {
      for (const b of toolResults) {
        out.push({ role: "tool", tool_call_id: b.tool_use_id, content: String(b.content) });
      }
      const rest = m.content.filter((b) => b.type !== "tool_result");
      if (rest.length) out.push({ role: "user", content: rest.map(openaiPart).filter(Boolean) });
      continue;
    }

    if (m.role === "assistant") {
      const uses = m.content.filter((b) => b.type === "tool_use");
      const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const msg = { role: "assistant", content: text || null };
      if (uses.length) {
        msg.tool_calls = uses.map((b) => ({
          id: b.id, type: "function",
          function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
        }));
      }
      out.push(msg);
      continue;
    }

    out.push({ role: "user", content: m.content.map(openaiPart).filter(Boolean) });
  }
  return out;
}

function openaiPart(b) {
  if (b.type === "text") return { type: "text", text: b.text };
  if (b.type === "image") return { type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } };
  // OpenAI互換は提供元ごとにPDFの扱いが違うため送らない(app.js側で取り込みを止めている)
  return null;
}

async function sendOpenAI({ apiKey, model, baseUrl, system, messages, tools, onDelta }) {
  const body = {
    model,
    max_tokens: MAX_TOKENS,
    stream: true,
    stream_options: { include_usage: true },
    messages: toOpenAIMessages(system, messages),
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
  }

  const base = String(baseUrl || "").replace(/\/+$/, "");
  const res = await safeFetch(base + "/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      // OpenRouter が求める任意ヘッダ。他のサービスでは無視される
      "http-referer": location.origin,
      "x-title": "Sawa Navi",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFrom(res);

  let text = "";
  const calls = [];   // index -> {id, name, args}
  const usage = { in: 0, out: 0 };

  await readSSE(res, (ev) => {
    if (ev.usage) { usage.in = ev.usage.prompt_tokens || usage.in; usage.out = ev.usage.completion_tokens || usage.out; }
    const d = ev.choices?.[0]?.delta;
    if (!d) return;
    if (d.content) { text += d.content; onDelta?.(d.content); }
    for (const tc of d.tool_calls || []) {
      const i = tc.index ?? 0;
      const cur = calls[i] || (calls[i] = { id: "", name: "", args: "" });
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.name += tc.function.name;
      if (tc.function?.arguments) cur.args += tc.function.arguments;
    }
  });

  const blocks = [];
  if (text) blocks.push({ type: "text", text });
  calls.forEach((c, i) => {
    if (!c || !c.name) return;
    let input = {};
    try { input = c.args ? JSON.parse(c.args) : {}; } catch (_) {}
    blocks.push({ type: "tool_use", id: c.id || `ocall_${i}_${Date.now()}`, name: c.name, input });
  });
  return { content: blocks.length ? blocks : [{ type: "text", text: "" }], usage };
}

async function listOpenAIModels(apiKey, baseUrl) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const res = await safeFetch(base + "/models", { headers: { authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw await errorFrom(res);
  const j = await res.json();
  return (j.data || []).map((m) => ({ id: m.id, label: m.name || "" }));
}

/* ── 振り分け ────────────────────────────────────────────── */

function sendToProvider(o) {
  if (o.provider === "google") return sendGemini(o);
  if (o.provider === "openai") return sendOpenAI(o);
  return sendAnthropic(o);
}

function listModels(provider, apiKey, baseUrl) {
  if (provider === "google") return listGeminiModels(apiKey);
  if (provider === "openai") return listOpenAIModels(apiKey, baseUrl);
  return Promise.resolve(PROVIDERS.anthropic.models);
}
