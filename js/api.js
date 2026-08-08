/* =========================================================================
   api.js — Claude API (ツール実行ループつき)
   ========================================================================= */

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-5";
const MAX_TOKENS = 4000;
const HISTORY_LIMIT = 30;
const MAX_TOOL_ROUNDS = 6;

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
  friendly() {
    if (this.status === 401) return "APIキーが正しくないようです。設定画面で確認してください。";
    if (this.status === 403) return "このAPIキーには権限がないようです。";
    if (this.status === 429) return "少し混み合っています。1分ほど待ってからもう一度お願いします。";
    if (this.status === 529) return "サーバーが混雑しています。少し待ってからもう一度。";
    if (this.status >= 500) return "サーバー側の不具合のようです。少し待ってからもう一度。";
    if (/credit|billing|balance/i.test(this.message)) return "APIの残高が不足しているようです。おうちの方に確認してください。";
    return this.message || "エラーが起きました。もう一度お試しください。";
  }
}

/**
 * ツール実行ループつきでClaudeを呼ぶ。
 * @param {object} o
 *   apiKey, system, messages, tools,
 *   onDelta(text)        — テキストが届くたび
 *   onToolUse(name,input)— ツール呼び出しが決まったとき(表示用)
 *   runTool(name,input)  — 実際にツールを実行して結果を返す(async)
 * @returns {Promise<{text:string, messages:Array}>}
 */
async function chatWithTools(o) {
  let messages = trimHistory(o.messages);
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await streamOnce({
      apiKey: o.apiKey, system: o.system, messages, tools: o.tools,
      onDelta: (t) => { finalText += t; o.onDelta?.(t); },
    });

    messages = [...messages, { role: "assistant", content: res.content }];

    const toolUses = res.content.filter((b) => b.type === "tool_use");
    if (!toolUses.length) return { text: finalText, messages };

    const results = [];
    for (const tu of toolUses) {
      o.onToolUse?.(tu.name, tu.input);
      let out;
      try {
        out = await o.runTool(tu.name, tu.input);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: tu.id, content: String(e.message || e), is_error: true });
      }
    }
    messages = [...messages, { role: "user", content: results }];
  }
  return { text: finalText, messages };
}

/** 1回分のストリーミングリクエスト。content ブロック配列を組み立てて返す */
async function streamOnce({ apiKey, system, messages, tools, onDelta }) {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    stream: true,
    output_config: { effort: "medium" },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  };
  if (tools?.length) body.tools = tools;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error?.message || ""; } catch (_) {}
    throw new ApiError(res.status, detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const blocks = [];        // 完成した content ブロック
  const partial = {};       // index -> {type, text|json}
  let stopReason = null;

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

      if (ev.type === "content_block_start") {
        const cb = ev.content_block;
        if (cb.type === "text") partial[ev.index] = { type: "text", text: "" };
        else if (cb.type === "tool_use") partial[ev.index] = { type: "tool_use", id: cb.id, name: cb.name, json: "" };
        else if (cb.type === "thinking") partial[ev.index] = { type: "thinking", skip: true };
      } else if (ev.type === "content_block_delta") {
        const p = partial[ev.index];
        if (!p) continue;
        if (ev.delta.type === "text_delta") { p.text += ev.delta.text; onDelta?.(ev.delta.text); }
        else if (ev.delta.type === "input_json_delta") { p.json += ev.delta.partial_json; }
      } else if (ev.type === "content_block_stop") {
        const p = partial[ev.index];
        if (!p || p.skip) continue;
        if (p.type === "text") { if (p.text) blocks.push({ type: "text", text: p.text }); }
        else if (p.type === "tool_use") {
          let input = {};
          try { input = p.json ? JSON.parse(p.json) : {}; } catch (_) {}
          blocks.push({ type: "tool_use", id: p.id, name: p.name, input });
        }
        delete partial[ev.index];
      } else if (ev.type === "message_delta" && ev.delta?.stop_reason) {
        stopReason = ev.delta.stop_reason;
      } else if (ev.type === "error") {
        throw new ApiError(0, ev.error?.message || "ストリーミングエラー");
      }
    }
  }

  if (stopReason === "refusal") throw new ApiError(0, "この内容にはお答えできませんでした。別の聞き方を試してみてください。");
  if (!blocks.length) blocks.push({ type: "text", text: "" });
  return { content: blocks, stopReason };
}

/** 履歴を直近に絞る。画像は最新1枚のみ残してトークンを節約 */
function trimHistory(messages) {
  const recent = messages.slice(-HISTORY_LIMIT);
  while (recent.length && recent[0].role !== "user") recent.shift();
  let imageKept = false;
  const out = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (Array.isArray(m.content) && m.content.some((b) => b.type === "image")) {
      if (imageKept) {
        const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        out.unshift({ role: m.role, content: "【写真を送りました】" + (text ? "\n" + text : "") });
        continue;
      }
      imageKept = true;
    }
    out.unshift(m);
  }
  return out;
}

/** 画像を長辺1568pxのJPEGに縮小してbase64化 */
function processImage(file, maxSize = 1568) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, maxSize / Math.max(width, height));
      width = Math.round(width * scale); height = Math.round(height * scale);
      const cv = document.createElement("canvas");
      cv.width = width; cv.height = height;
      cv.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = cv.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(url);
      resolve({ data: dataUrl.split(",")[1], mediaType: "image/jpeg", previewUrl: dataUrl });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像を読み込めませんでした")); };
    img.src = url;
  });
}
