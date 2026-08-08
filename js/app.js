/* ===== さわの勉強部屋 メインロジック ===== */

// ---------- 状態 ----------
const STORAGE_KEY = "sawa-study-state-v1";

const defaultState = () => ({
  apiKey: "",
  name: "さわ",
  xp: 0,
  subjectXp: {},          // { math: 120, ... }
  streak: 0,
  lastStudyDate: null,    // "2026-08-08"
  missions: {},           // { "2026-08-08": { login: 1, question: 2, ... } }
  claimedMissions: {},    // { "2026-08-08": ["login"] }
  chat: [],               // 表示用+API用の履歴 [{role, content, imagePreview?}]
  subject: "all",
});

let state = loadState();
let pendingImage = null;  // {data, mediaType, previewUrl}
let sending = false;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch (_) { /* ignore */ }
  return defaultState();
}
function saveState() {
  pruneOldImages();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {
    // 容量オーバー時は古い履歴を削って再保存
    state.chat = state.chat.slice(-20);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
  }
}

// 古いメッセージの画像データ(base64)は容量が大きいので、直近以外はテキストに置き換える
function pruneOldImages() {
  const KEEP = 6;
  for (let i = 0; i < state.chat.length - KEEP; i++) {
    const m = state.chat[i];
    if (Array.isArray(m.content) && m.content.some((b) => b.type === "image")) {
      const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      m.content = "【写真をおくりました】" + (text ? "\n" + text : "");
      delete m.imagePreview;
    }
  }
}

// ---------- ユーティリティ ----------
const $ = (sel) => document.querySelector(sel);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function levelInfo(xp) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].xp) idx = i;
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1] || null;
  return { idx, cur, next };
}

function unlockedAnimalCount(xp) {
  return Math.min(ANIMALS.length, Math.floor(xp / ANIMAL_UNLOCK_XP));
}

// ---------- ストリーク ----------
function touchStreak() {
  const today = todayStr();
  if (state.lastStudyDate === today) return;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  state.streak = state.lastStudyDate === yStr ? state.streak + 1 : 1;
  state.lastStudyDate = today;
  saveState();
}

// ---------- ミッション ----------
function missionProgress(id) {
  return (state.missions[todayStr()] || {})[id] || 0;
}
function bumpMission(id, amount = 1) {
  const today = todayStr();
  if (!state.missions[today]) state.missions[today] = {};
  const m = DAILY_MISSIONS.find((x) => x.id === id);
  if (!m) return;
  const before = state.missions[today][id] || 0;
  state.missions[today][id] = before + amount;

  // 達成した瞬間にXP付与
  const claimed = state.claimedMissions[today] || [];
  if (before < m.target && state.missions[today][id] >= m.target && !claimed.includes(id)) {
    claimed.push(id);
    state.claimedMissions[today] = claimed;
    awardXp(m.xp, `ミッション達成!「${m.name}」`);
  }
  saveState();
  renderMissions();
}

// ---------- XP ----------
function awardXp(amount, reason) {
  if (amount <= 0) return;
  const beforeLevel = levelInfo(state.xp).idx;
  const beforeAnimals = unlockedAnimalCount(state.xp);

  state.xp += amount;
  const sub = state.subject === "all" ? null : state.subject;
  if (sub) state.subjectXp[sub] = (state.subjectXp[sub] || 0) + amount;
  saveState();

  showXpFloat(`+${amount} XP`);
  renderHeader();
  renderHome();

  // レベルアップ演出
  const afterLevel = levelInfo(state.xp);
  if (afterLevel.idx > beforeLevel) {
    showCelebrate("🎉", `レベルアップ! Lv.${afterLevel.idx + 1}`, `「${afterLevel.cur.title}」になったよ!\n獣医さんへの道、また一歩前進!`);
    return;
  }
  // どうぶつ解放演出
  const afterAnimals = unlockedAnimalCount(state.xp);
  if (afterAnimals > beforeAnimals) {
    const a = ANIMALS[afterAnimals - 1];
    showCelebrate(a.emoji, `${a.name}が仲間になった!`, `${a.fact}\nずかんで会えるよ!`);
  } else if (reason) {
    // 小さな通知はフロートのみ
  }
}

function showXpFloat(text) {
  const el = document.createElement("div");
  el.className = "xp-float";
  el.textContent = "⭐ " + text;
  el.style.left = "50%";
  el.style.top = "30%";
  el.style.transform = "translateX(-50%)";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

function showCelebrate(emoji, title, sub) {
  $("#celebrateEmoji").textContent = emoji;
  $("#celebrateTitle").textContent = title;
  $("#celebrateSub").textContent = sub;
  $("#celebrate").hidden = false;
}

// ---------- 画面切り替え ----------
function goto(screen) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(`#screen-${screen}`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.goto === screen));
  if (screen === "home") renderHome();
  if (screen === "zukan") renderZukan();
  if (screen === "study") setTimeout(() => $("#chatArea").scrollTop = $("#chatArea").scrollHeight, 50);
}

// ---------- 描画 ----------
function renderHeader() {
  $("#xpCount").textContent = state.xp;
  $("#streakCount").textContent = state.streak;
}

function renderHome() {
  const name = state.name || "さわ";
  const hour = new Date().getHours();
  const greet = hour < 10 ? "おはよう" : hour < 18 ? "こんにちは" : "こんばんは";
  $("#greetingText").textContent = `${greet}、${name}さん!`;
  $("#greetingSub").textContent = state.streak >= 3
    ? `${state.streak}日連続で勉強中!すごい!🔥`
    : "今日も一緒にがんばろう!";

  const { idx, cur, next } = levelInfo(state.xp);
  $("#levelTitle").textContent = cur.title;
  $("#levelNum").textContent = `Lv.${idx + 1}`;
  if (next) {
    const pct = ((state.xp - cur.xp) / (next.xp - cur.xp)) * 100;
    $("#levelProgress").style.width = `${Math.min(100, pct)}%`;
    $("#levelNext").textContent = `次のレベル「${next.title}」まで あと ${next.xp - state.xp} XP`;
  } else {
    $("#levelProgress").style.width = "100%";
    $("#levelNext").textContent = "最高レベルに到達!すごすぎる!";
  }

  renderMissions();

  // 図鑑プレビュー
  const count = unlockedAnimalCount(state.xp);
  $("#collectionCount").textContent = `(${count} / ${ANIMALS.length})`;
  $("#animalPreview").innerHTML = count === 0
    ? `<span style="font-size:13px;color:var(--text-light)">勉強するとどうぶつが仲間になるよ!</span>`
    : ANIMALS.slice(0, count).slice(-8).map((a) => `<span>${a.emoji}</span>`).join("");

  // 教科別XP
  const statsEl = $("#subjectStats");
  const entries = SUBJECTS.filter((s) => s.id !== "all");
  const maxXp = Math.max(20, ...entries.map((s) => state.subjectXp[s.id] || 0));
  statsEl.innerHTML = entries.map((s) => {
    const xp = state.subjectXp[s.id] || 0;
    return `<div class="subject-stat">
      <div class="subject-stat-label"><span>${s.emoji} ${s.name}</span><span>${xp} XP</span></div>
      <div class="subject-stat-bar"><div class="subject-stat-fill" style="width:${(xp / maxXp) * 100}%"></div></div>
    </div>`;
  }).join("");
}

function renderMissions() {
  const claimed = state.claimedMissions[todayStr()] || [];
  $("#missionList").innerHTML = DAILY_MISSIONS.map((m) => {
    const p = Math.min(missionProgress(m.id), m.target);
    const done = claimed.includes(m.id) || p >= m.target;
    return `<li class="${done ? "done" : ""}">
      <span class="mission-check">${done ? "✅" : "⬜"}</span>
      <span class="mission-name">${m.name}${m.target > 1 ? ` (${p}/${m.target})` : ""}</span>
      <span class="mission-xp">+${m.xp} XP</span>
    </li>`;
  }).join("");
}

function renderZukan() {
  const count = unlockedAnimalCount(state.xp);
  $("#animalGrid").innerHTML = ANIMALS.map((a, i) => {
    const unlocked = i < count;
    return `<div class="animal-cell ${unlocked ? "" : "locked"}">
      <div class="a-emoji">${unlocked ? a.emoji : "❓"}</div>
      <div class="a-name">${unlocked ? a.name : "???"}</div>
      <div class="a-fact">${unlocked ? a.fact : `あと ${(i + 1) * ANIMAL_UNLOCK_XP - state.xp} XP`}</div>
    </div>`;
  }).join("");
}

function renderSubjectBar() {
  $("#subjectBar").innerHTML = SUBJECTS.map((s) =>
    `<button class="subject-chip ${state.subject === s.id ? "active" : ""}" data-subject="${s.id}">${s.emoji} ${s.name}</button>`
  ).join("");
  document.querySelectorAll(".subject-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.subject = chip.dataset.subject;
      saveState();
      renderSubjectBar();
    });
  });
}

function appendMessageEl(role, text, imageUrl) {
  $("#chatWelcome")?.remove();
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    el.appendChild(img);
  }
  const span = document.createElement("span");
  span.textContent = text;
  el.appendChild(span);
  $("#chatArea").appendChild(el);
  $("#chatArea").scrollTop = $("#chatArea").scrollHeight;
  return span;
}

function renderChatHistory() {
  const area = $("#chatArea");
  area.querySelectorAll(".msg").forEach((m) => m.remove());
  for (const m of state.chat) {
    const text = Array.isArray(m.content)
      ? m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")
      : m.content;
    appendMessageEl(m.role, text, m.imagePreview);
  }
}

// ---------- チャット送信 ----------
async function sendMessage(overrideText) {
  if (sending) return;
  const input = $("#chatInput");
  const text = (overrideText ?? input.value).trim();
  if (!text && !pendingImage) return;

  if (!state.apiKey) {
    appendMessageEl("error", "APIキーが設定されていません。「せってい」画面でおうちの人に設定してもらってね。");
    goto("settings");
    return;
  }

  sending = true;
  $("#sendBtn").disabled = true;
  touchStreak();
  bumpMission("login");

  // ユーザーメッセージ組み立て
  let content;
  let imagePreview = null;
  if (pendingImage) {
    content = [
      { type: "image", source: { type: "base64", media_type: pendingImage.mediaType, data: pendingImage.data } },
      { type: "text", text: text || "この写真の問題を一緒にやりたい!" },
    ];
    imagePreview = pendingImage.previewUrl;
    bumpMission("photo");
    awardXp(XP_RULES.photo, "写真アップ");
  } else {
    content = text;
    bumpMission("question");
    awardXp(XP_RULES.message, "質問");
  }

  const userMsg = { role: "user", content };
  if (imagePreview) userMsg.imagePreview = imagePreview;
  state.chat.push(userMsg);
  saveState();

  appendMessageEl("user", text || "(写真をおくったよ)", imagePreview);
  input.value = "";
  input.style.height = "auto";
  clearPendingImage();

  // アシスタント応答
  const thinkingEl = appendMessageEl("assistant thinking", "ミミ先生が考え中… 🐰💭");
  const subjectName = SUBJECTS.find((s) => s.id === state.subject)?.name || "ぜんぶ";
  const systemPrompt = buildSystemPrompt(state.name || "さわ", subjectName);

  // API用の履歴(imagePreviewなどの余分なキーを除く)
  const apiMessages = state.chat.map(({ role, content }) => ({ role, content }));

  let replySpan = null;
  try {
    const fullText = await callClaude(state.apiKey, systemPrompt, apiMessages, (delta) => {
      if (!replySpan) {
        thinkingEl.parentElement.remove();
        replySpan = appendMessageEl("assistant", "");
      }
      replySpan.textContent += delta;
      $("#chatArea").scrollTop = $("#chatArea").scrollHeight;
    });

    // XPタグをパースして除去
    const { cleanText, earnedXp, quizCorrect } = parseXpTags(fullText);
    if (replySpan) replySpan.textContent = cleanText;
    else { thinkingEl.parentElement.remove(); appendMessageEl("assistant", cleanText); }

    state.chat.push({ role: "assistant", content: cleanText });
    saveState();

    if (earnedXp > 0) {
      if (quizCorrect) bumpMission("quiz");
      awardXp(Math.min(earnedXp, XP_RULES.maxTagXp), "正解");
    }
  } catch (e) {
    thinkingEl?.parentElement?.remove();
    const msg = e instanceof ApiError ? e.friendlyMessage() : "通信エラーが起きました。ネット接続を確認してね。";
    appendMessageEl("error", "😢 " + msg);
    // 失敗した送信は履歴から取り除く(再送しやすいように)
    state.chat.pop();
    saveState();
  } finally {
    sending = false;
    $("#sendBtn").disabled = false;
  }
}

function parseXpTags(text) {
  let earnedXp = 0;
  let quizCorrect = false;
  const cleanText = text.replace(/【XP\+(\d+)】/g, (_, n) => {
    const v = parseInt(n, 10);
    earnedXp += v;
    if (v >= 15) quizCorrect = true;
    return "";
  }).trim();
  return { cleanText, earnedXp, quizCorrect };
}

function clearPendingImage() {
  pendingImage = null;
  $("#photoPreview").hidden = true;
  $("#photoInput").value = "";
}

// ---------- イベント ----------
function setupEvents() {
  // ナビ
  document.querySelectorAll("[data-goto]").forEach((b) => {
    b.addEventListener("click", () => goto(b.dataset.goto));
  });

  // 送信
  $("#sendBtn").addEventListener("click", () => sendMessage());
  $("#chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });
  $("#chatInput").addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 110) + "px";
  });

  // クイックアクション
  $("#btnQuiz").addEventListener("click", () => sendMessage("クイズを出して!"));
  $("#btnExplain").addEventListener("click", () => sendMessage("今日学校で習ったことを復習したい!"));
  $("#btnHomework").addEventListener("click", () => sendMessage("宿題を一緒にやってほしい!"));

  // 写真
  $("#photoInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      pendingImage = await processImage(file);
      $("#previewImg").src = pendingImage.previewUrl;
      $("#photoPreview").hidden = false;
      goto("study");
    } catch (_) {
      appendMessageEl("error", "写真を読み込めませんでした。別の写真でためしてね。");
    }
  });
  $("#removePhoto").addEventListener("click", clearPendingImage);

  // 設定
  $("#saveSettings").addEventListener("click", () => {
    state.apiKey = $("#apiKeyInput").value.trim();
    state.name = $("#nameInput").value.trim() || "さわ";
    saveState();
    $("#settingsMsg").textContent = "保存しました!✅";
    setTimeout(() => ($("#settingsMsg").textContent = ""), 2500);
    renderHome();
  });

  $("#resetChat").addEventListener("click", () => {
    if (!confirm("会話履歴を削除しますか?(XPやどうぶつは残ります)")) return;
    state.chat = [];
    saveState();
    renderChatHistory();
    location.reload();
  });
  $("#resetAll").addEventListener("click", () => {
    if (!confirm("本当にすべてのデータ(XP・図鑑・履歴)を削除しますか?")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  // お祝いを閉じる
  $("#celebrateClose").addEventListener("click", () => ($("#celebrate").hidden = true));
}

// ---------- 初期化 ----------
function init() {
  $("#apiKeyInput").value = state.apiKey;
  $("#nameInput").value = state.name;
  renderHeader();
  renderHome();
  renderSubjectBar();
  renderChatHistory();
  setupEvents();

  if (!state.apiKey) {
    // 初回はセットアップへ誘導
    goto("settings");
    $("#settingsMsg").textContent = "はじめに、おうちの人がAPIキーを設定してください。";
  }
}

init();
