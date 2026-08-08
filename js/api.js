/* =========================================================================
   api.js — ツール実行ループ
   プロバイダごとの差は providers.js が吸収する
   ========================================================================= */

const HISTORY_LIMIT = 30;
const MAX_TOOL_ROUNDS = 6;

/**
 * ツール実行ループつきでAIを呼ぶ。
 * @param {object} o
 *   provider, model, apiKey, baseUrl, system, messages, tools,
 *   onDelta(text)        — テキストが届くたび
 *   onToolUse(name,input)— ツール呼び出しが決まったとき(表示用)
 *   runTool(name,input)  — 実際にツールを実行して結果を返す(async)
 * @returns {Promise<{text:string, messages:Array}>}
 */
async function chatWithTools(o) {
  let messages = trimHistory(o.messages);
  let finalText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await sendToProvider({
      provider: o.provider, model: o.model, apiKey: o.apiKey, baseUrl: o.baseUrl,
      system: o.system, messages, tools: o.tools,
      onDelta: (t) => { finalText += t; o.onDelta?.(t); },
    });

    messages = [...messages, { role: "assistant", content: res.content }];

    const toolUses = res.content.filter((b) => b.type === "tool_use");
    if (!toolUses.length) return { text: finalText, messages };

    const results = [];
    for (const tu of toolUses) {
      const schema = o.tools?.find((t) => t.name === tu.name)?.input_schema;
      const input = coerceArgs(tu.input, schema);
      o.onToolUse?.(tu.name, input);
      try {
        const out = await o.runTool(tu.name, input);
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: tu.id, content: String(e.message || e), is_error: true });
      }
    }
    messages = [...messages, { role: "user", content: results }];
  }
  return { text: finalText, messages };
}

/**
 * ツール引数をスキーマの型に合わせる。
 * モデルによっては整数を "3"、真偽値を "true" のように文字列で返すことがあり、
 * そのまま計算に使うと壊れるため、ここで一度そろえる。
 */
function coerceArgs(input, schema) {
  if (!input || typeof input !== "object" || !schema?.properties) return input || {};
  const out = { ...input };
  for (const [k, def] of Object.entries(schema.properties)) {
    if (!(k in out) || out[k] == null) continue;
    const t = def.type;
    const v = out[k];
    if ((t === "integer" || t === "number") && typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) {
      out[k] = t === "integer" ? Math.round(Number(v)) : Number(v);
    } else if (t === "boolean" && typeof v === "string") {
      if (/^(true|yes|1)$/i.test(v.trim())) out[k] = true;
      else if (/^(false|no|0)$/i.test(v.trim())) out[k] = false;
    } else if (t === "string" && typeof v !== "string") {
      out[k] = String(v);
    } else if (t === "array" && !Array.isArray(v)) {
      out[k] = [v];
    }
  }
  return out;
}

/** 履歴を直近に絞る。画像は最新1枚のみ残してトークンを節約 */
function trimHistory(messages) {
  const recent = messages.slice(-HISTORY_LIMIT);
  while (recent.length && recent[0].role !== "user") recent.shift();
  let imageKept = false;
  const out = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (Array.isArray(m.content) && m.content.some((b) => b.type === "image" || b.type === "document")) {
      if (imageKept) {
        const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        out.unshift({ role: m.role, content: "【写真・スキャンを送りました】" + (text ? "\n" + text : "") });
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
