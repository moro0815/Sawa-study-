/* ===== Claude API 呼び出し ===== */

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-opus-5";
const MAX_TOKENS = 3000;
const HISTORY_LIMIT = 24; // APIに送る直近メッセージ数

/**
 * Claude にメッセージを送り、ストリーミングでテキストを受け取る。
 * @param {string} apiKey
 * @param {string} systemPrompt
 * @param {Array} messages - [{role, content}] 形式(contentは文字列 or ブロック配列)
 * @param {(text: string) => void} onDelta - テキスト断片を受け取るコールバック
 * @returns {Promise<string>} 完成した応答テキスト
 */
async function callClaude(apiKey, systemPrompt, messages, onDelta) {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    stream: true,
    output_config: { effort: "medium" },
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: trimHistory(messages),
  };

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
    try {
      const err = await res.json();
      detail = err?.error?.message || "";
    } catch (_) { /* ignore */ }
    throw new ApiError(res.status, detail);
  }

  // SSE をパースしてテキストを組み立てる
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let stopReason = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop(); // 未完の行は残す

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let event;
      try { event = JSON.parse(payload); } catch (_) { continue; }

      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        fullText += event.delta.text;
        onDelta(event.delta.text);
      } else if (event.type === "message_delta" && event.delta?.stop_reason) {
        stopReason = event.delta.stop_reason;
      } else if (event.type === "error") {
        throw new ApiError(0, event.error?.message || "ストリーミングエラー");
      }
    }
  }

  if (stopReason === "refusal") {
    throw new ApiError(0, "この内容にはお答えできませんでした。別の聞き方をためしてみてね。");
  }
  return fullText;
}

/** 履歴を直近に絞り、古い画像はテキストに置き換えてトークンを節約する */
function trimHistory(messages) {
  const recent = messages.slice(-HISTORY_LIMIT);
  // 先頭は必ず user から始まるように調整
  while (recent.length && recent[0].role !== "user") recent.shift();

  // 画像は最新の1枚だけ残す
  let imageKept = false;
  const result = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (Array.isArray(m.content)) {
      const hasImage = m.content.some((b) => b.type === "image");
      if (hasImage && imageKept) {
        const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        result.unshift({ role: m.role, content: "【写真をおくりました】" + (text ? "\n" + text : "") });
        continue;
      }
      if (hasImage) imageKept = true;
    }
    result.unshift(m);
  }
  return result;
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
  friendlyMessage() {
    if (this.status === 401) return "APIキーが正しくないみたい。設定画面で確認してね。";
    if (this.status === 429) return "少し混み合っているよ。1分ほど待ってからもう一度ためしてね。";
    if (this.status === 529) return "サーバーが混雑中…。少し待ってからもう一度ためしてね。";
    if (this.status >= 500) return "サーバーの調子が悪いみたい。少し待ってからもう一度ためしてね。";
    if (this.status === 400 && /credit|billing/i.test(this.message)) return "APIの利用残高が足りないようです。おうちの人に確認してね。";
    return this.message || "エラーが起きちゃった。もう一度ためしてみてね。";
  }
}

/**
 * 画像ファイルを読み込み、長辺を制限したJPEGのbase64に変換する。
 * @param {File} file
 * @returns {Promise<{data: string, mediaType: string, previewUrl: string}>}
 */
function processImage(file, maxSize = 1568) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, maxSize / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(url);
      resolve({
        data: dataUrl.split(",")[1],
        mediaType: "image/jpeg",
        previewUrl: dataUrl,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像を読み込めませんでした"));
    };
    img.src = url;
  });
}
