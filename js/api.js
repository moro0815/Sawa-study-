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
  const stat = { rounds: 0, tools: [], usage: { in: 0, out: 0 }, startedAt: Date.now() };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // 「やめる」が押されていたら、次の往復には入らない
    if (o.signal?.aborted) throw new ApiError(0, "中断しました", "abort");
    stat.rounds++;
    o.onRound?.(round);
    const res = await sendToProvider({
      provider: o.provider, model: o.model, apiKey: o.apiKey, baseUrl: o.baseUrl,
      system: o.system, messages, tools: o.tools,
      onDelta: (t) => { finalText += t; o.onDelta?.(t); },
      signal: o.signal,
    });
    stat.usage.in += res.usage?.in || 0;
    stat.usage.out += res.usage?.out || 0;

    messages = [...messages, { role: "assistant", content: res.content }];

    const toolUses = res.content.filter((b) => b.type === "tool_use");
    if (!toolUses.length) { stat.ms = Date.now() - stat.startedAt; return { text: finalText, messages, stat }; }

    const results = [];
    for (const tu of toolUses) {
      const schema = o.tools?.find((t) => t.name === tu.name)?.input_schema;
      const input = coerceArgs(tu.input, schema);
      stat.tools.push(tu.name);
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
  stat.ms = Date.now() - stat.startedAt;
  return { text: finalText, messages, stat };
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

/**
 * 履歴を送れる形に整える。
 *
 * ★ここは一度壊れると以後ずっと通信が失敗する場所なので、慎重に。
 * ツールを使った会話は
 *     assistant: [tool_use  id=X]
 *     user     : [tool_result tool_use_id=X]
 * が必ず対になっている必要がある。
 * 単純に「直近N件」で切ると、この対の途中で切れて
 * 先頭が tool_result だけの user メッセージになり、
 * 400 (Each `tool_result` block must have a corresponding `tool_use` block)
 * を返し続けてしまう。
 */
function trimHistory(messages) {
  const recent = repairPairs(messages.slice(-HISTORY_LIMIT));

  // 画像・PDFは最新の1通ぶんだけ残してトークンを節約
  let mediaKept = false;
  const out = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (Array.isArray(m.content) && m.content.some((b) => b.type === "image" || b.type === "document")) {
      if (mediaKept) {
        const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        out.unshift({ role: m.role, content: "【写真・スキャンを送りました】" + (text ? "\n" + text : "") });
        continue;
      }
      mediaKept = true;
    }
    out.unshift(m);
  }
  return out;
}

/** tool_use と tool_result の対応が取れた形に直す */
function repairPairs(list) {
  let out = list.slice();

  // 1. 先頭を整える。
  //    対になる assistant が残っていない tool_result や、
  //    user 以外で始まるものは落とす。
  while (out.length) {
    const m = out[0];
    const hasResult = Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result");
    if (m.role !== "user" || hasResult) { out.shift(); continue; }
    break;
  }

  // 2. 末尾を整える。結果が返っていない tool_use を残すと弾かれる。
  while (out.length) {
    const m = out.at(-1);
    if (m.role === "assistant" && Array.isArray(m.content) && m.content.some((b) => b.type === "tool_use")) {
      out.pop(); continue;
    }
    break;
  }

  // 3. 念のため、対応の取れないブロックを個別に取り除く
  const useIds = new Set();
  for (const m of out) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) if (b.type === "tool_use") useIds.add(b.id);
  }
  const cleaned = [];
  for (const m of out) {
    if (!Array.isArray(m.content)) { cleaned.push(m); continue; }
    const content = m.content.filter((b) => b.type !== "tool_result" || useIds.has(b.tool_use_id));
    if (!content.length) continue;                 // 中身が空になったメッセージは送らない
    cleaned.push({ ...m, content });
  }
  return cleaned;
}

/** 履歴の対応関係が壊れているかどうか(エラー復旧の判定用) */
function historyLooksBroken(messages) {
  return JSON.stringify(repairPairs(messages)) !== JSON.stringify(messages);
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
