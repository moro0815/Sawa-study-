/* =========================================================================
   luke.js — Luke(マルプー・オス)

   沙和さんの相棒。勉強のとなりにいて、反応する犬。

   ★設計でいちばん考えたこと:「間違えたらソッポを向く」をどう作るか
   ----------------------------------------------------------------------
   犬が反応してくれるのは楽しい。ただ、【間違い】に対して
   そっけなくする作りには、このアプリでは使えない理由がある。

   ・このシステムの中核は「自信あり×不正解」を最優先で拾うこと。
     間違いを見せた瞬間に相棒が離れると、間違いを隠すようになる。
     いちばん伸びる場所が、いちばん見えなくなる。
   ・沙和さんは、わからないことを人に聞くのが少し苦手。
     「できないと嫌われる」の形は、この子にはいちばん効いてしまう。
   ・愛情を成績の条件にすること(条件つき肯定)は、
     保護者向けの説明で「やめてください」と書いていること そのもの。

   そこで【ソッポは残した。向ける相手を変えた】。

     間違えたとき          → きょとん(首をかしげる)。責めない。近づいてくる
     自信あり×不正解       → 目をまんまる。いちばん喜ぶ ★宝物を見つけた顔
     「答えを教えて」       → ソッポ。「それは教えないもん」
     確信度を言わずに答えた → ソッポ。「先に言って?」
     何日も会えていない     → しょんぼり。でも戻ってきた瞬間に大喜び

   つまり Luke がそっぽを向くのは【できなかったとき】ではなく
   【近道をしようとしたとき】。しかも、すぐ許す。
   これなら「反応が返ってくる楽しさ」はそのままで、
   間違いを隠す方向には働かない。

   ★もうひとつ:成長を2つに分けた
     年齢     … 実際の時間で育つ。何をしてもしなくても育つ(愛情は無条件)
     できる芸 … 一緒にやったことの【中身】で増える(結果ではなく、やり方)
   芸の条件はすべて「正解した数」ではなく「良いやり方ができた」こと。
   ごほうびで釣らないという原則(過正当化効果)と揃えてある。
   ========================================================================= */

const LUKE_INFO = {
  name: "Luke", ruby: "ルーク", breed: "マルプー", sex: "男の子",
  about: "マルチーズとトイプードルの子。ふわふわの巻き毛で、人のそばにいるのが大好き。かしこくて、よく人の顔を見ている。",
};

/* ── きもち ─────────────────────────────────────────────
   art: 見た目のパラメータ。tail=しっぽの速さ(秒) tilt=首のかたむき
        ear=耳の下がり具合 eye=目の形 bob=体のはずみ */

const LUKE_MOODS = {
  normal: {
    id: "normal", name: "ごきげん", art: { tail: 1.1, tilt: 0, ear: 0, eye: "open", bob: 0 },
    lines: ["となりにいるよ。", "いつでもどうぞ。", "ひまだから見てる。", "ん、なに?", "今日はなにやる?"],
  },
  excited: {
    id: "excited", name: "わくわく", art: { tail: 0.34, tilt: -4, ear: -6, eye: "wide", bob: 1 },
    lines: ["やった、はじまる!", "オレも見てる!", "なにやるの、なにやるの!", "ソワソワする!"],
  },
  happy: {
    id: "happy", name: "うれしい", art: { tail: 0.22, tilt: 0, ear: -4, eye: "arc", bob: 1 },
    lines: ["できた!すごい!", "今の、かっこよかった!", "オレもうれしい!", "ね、もう1問いこ!", "しっぽ止まんない。"],
  },
  tilt: {
    id: "tilt", name: "きょとん", art: { tail: 0.9, tilt: 14, ear: 3, eye: "open", bob: 0 },
    lines: ["んー?どこでちがったんだろ。", "オレもわかんない。いっしょに見よ。",
            "まちがえた?ふーん。で、次は?", "そこ、むずかしいとこだもんね。", "ちょっと戻ってみる?"],
  },
  treasure: {
    id: "treasure", name: "だいはっけん", art: { tail: 0.18, tilt: -8, ear: -8, eye: "sparkle", bob: 1 },
    lines: ["!! いま、たからもの見つけたよ!", "自信あったのに違った — そこがいちばん伸びるとこ!",
            "オレ知ってる。ここ直すとすごく強くなるやつ。", "ラッキー!見つかってよかったね。"],
  },
  sulk: {
    id: "sulk", name: "ソッポ", art: { tail: 1.8, tilt: -26, ear: 4, eye: "away", bob: 0, faceX: -13 },
    lines: ["…答えは教えないもん。", "ふんっ。自分で考えるほうが楽しいよ。",
            "先に『どのくらい自信ある?』を言って?", "ずるはナシ。オレ見てるからね。", "…ヒントだけなら、いいけど。"],
  },
  lonely: {
    id: "lonely", name: "しょんぼり", art: { tail: 2.6, tilt: 6, ear: 8, eye: "sad", bob: 0 },
    lines: ["……ひさしぶり。", "待ってた。ほんとに待ってた。", "帰ってきた!もういい、うれしい!",
            "ちょっとだけ、さみしかった。"],
  },
  sleepy: {
    id: "sleepy", name: "ねむい", art: { tail: 2.2, tilt: 8, ear: 6, eye: "closed", bob: 0 },
    lines: ["ふぁ…そろそろ休も?", "今日はよくやったよ。", "つづきは明日でいいと思う。",
            "寝る前にちょっとだけ思い出すと、よく残るんだって。"],
  },
  proud: {
    id: "proud", name: "どやっ", art: { tail: 0.3, tilt: -6, ear: -5, eye: "arc", bob: 0 },
    lines: ["ここまで来たね。", "前はできなかったの、覚えてる。", "オレの自慢の相棒。", "胸はってていいと思う。"],
  },
  snuggle: {
    id: "snuggle", name: "そばにいる", art: { tail: 1.5, tilt: 12, ear: 4, eye: "closed", bob: 0 },
    lines: ["……(すりよってきた)", "なんも言わないでおく。となりにいる。",
            "つらい日はあるよ。オレもある。", "今日はもう、なでてるだけでいい。"],
  },
  teach: {
    id: "teach", name: "おしえて", art: { tail: 0.6, tilt: 16, ear: -3, eye: "wide", bob: 0 },
    lines: ["オレまだ1歳だからわかんない。教えて?", "それどういうこと?", "へー!…で、なんでそうなるの?",
            "もういっかい、ゆっくり言って。"],
  },
  party: {
    id: "party", name: "おめでとう", art: { tail: 0.16, tilt: 0, ear: -8, eye: "sparkle", bob: 1 },
    lines: ["きょうは特別な日!", "やったー!", "おめでとう!!"],
  },
};

/* ── 覚える芸 ───────────────────────────────────────────
   条件はすべて「正解の数」ではなく【やり方が良かったこと】。
   点を取ったから増えるのではなく、良い学び方をしたから増える。 */

const LUKE_TRICKS = [
  { id: "sit",   name: "おすわり", emoji: "🐕", how: "はじめから できる",
    why: "会えた日から、ずっと一緒。",
    check: () => true },

  { id: "paw",   name: "おて", emoji: "🐾", how: "答える前に「どのくらい自信あるか」を1回言えた",
    why: "自信を先に言うと、どこがあやしいかが見えるようになる。",
    check: (S) => countAnswers(S) >= 1 },

  { id: "wait",  name: "まて", emoji: "⏳", how: "3日つづけて勉強した",
    why: "まとめてやるより、日をあけて何回もやるほうが残る。",
    check: (S) => streakDays(S) >= 3 },

  { id: "down",  name: "ふせ", emoji: "🙋", how: "「わからない」と1回言えた",
    why: "わからないと言えるのは、いちばん難しくて、いちばん大事なこと。",
    check: (S) => hasStuckOrLowConf(S) },

  { id: "again", name: "おかわり", emoji: "🔁", how: "まちがえた問題を直して、もう1問やった",
    why: "直した直後にもう1問やらないと、1週間で元に戻ってしまう。",
    check: (S) => countFixed(S) >= 1 },

  { id: "fetch", name: "もってこい", emoji: "📸", how: "宿題を自分で取り込んだ",
    why: "出ているものを自分で見えるようにしたら、もう半分終わったようなもの。",
    check: (S) => (S.homework || []).some((a) => a.source === "school") },

  { id: "high5", name: "ハイタッチ", emoji: "🙌", how: "「自信あったのに間違えた」を1つ直した",
    why: "ここは、いちばん強く直る場所。見つけて直せたら大金星。",
    check: (S) => countFixedHiWrong(S) >= 1 },

  { id: "spin",  name: "おまわり", emoji: "🌀", how: "ちがう教科を混ぜて解いた",
    why: "混ぜると今日はできなくなる。でも本番で思い出せる力は強くなる。",
    check: (S) => mixedSubjectDay(S) },

  { id: "speak", name: "はなす", emoji: "🗣", how: "Lukeに1回、説明してあげた",
    why: "人に説明すると、わかっていない場所が自分で見つかる。",
    check: (S) => (S.luke?.taught || 0) >= 1 },

  { id: "jump",  name: "ジャンプ", emoji: "✨", how: "30日いっしょに過ごした",
    why: "続いたこと自体が力。ここまで来た人はあまりいない。",
    check: (S) => daysTogether(S) >= 30 },

  { id: "guide", name: "みちあんない", emoji: "🧭", how: "自分から勉強を始めた日が5回",
    why: "言われてやるのと、自分から始めるのは、別のこと。",
    check: (S) => Object.values(S.engage || {}).reduce((a, b) => a + (b.selfStarted || 0), 0) >= 5 },

  { id: "hero",  name: "そばにいる", emoji: "💛", how: "100日いっしょに過ごした",
    why: "長いこと隣にいた犬にしかできない芸。",
    check: (S) => daysTogether(S) >= 100 },
];

/* ── 絵の差しかえ ───────────────────────────────────────
   ★手描きのSVGでは、生成したイラストの可愛さには勝てない。
   なので【本人の用意した絵に置きかえられる】ようにした。
   絵は端末の中(localStorage)に持つ。ネットには出さない。

   6枚ぜんぶ用意しなくていい。「ふつう」の1枚だけ入れれば、
   足りないきもちはそこへ落ちる。1枚も無ければSVGを描く。 */

const LUKE_ART_KEY = "sawa-navi-luke-art";

const LUKE_ART_SLOTS = [
  { id: "base",  name: "ふつう",     hint: "いちばんよく出ます。まずこの1枚だけでOK" },
  { id: "happy", name: "うれしい",   hint: "できたとき・ほめるとき・じまんするとき" },
  { id: "think", name: "きょとん",   hint: "まちがえたとき・考えているとき・さみしいとき" },
  { id: "wow",   name: "びっくり",   hint: "だいはっけんのとき・おめでとうのとき" },
  { id: "sulk",  name: "ソッポ",     hint: "「答え教えて」と言われたとき" },
  { id: "sleep", name: "おやすみ",   hint: "夜おそいとき・そばにいるとき" },
];

/** きもち → どの絵を使うか */
const MOOD_TO_SLOT = {
  normal: "base", excited: "happy", happy: "happy", proud: "happy",
  tilt: "think", teach: "think", lonely: "think",
  treasure: "wow", party: "wow",
  sulk: "sulk", sleepy: "sleep", snuggle: "sleep",
};

function loadLukeArt() {
  try { return JSON.parse(localStorage.getItem(LUKE_ART_KEY) || "{}") || {}; }
  catch { return {}; }
}
function saveLukeArt(art) {
  try { localStorage.setItem(LUKE_ART_KEY, JSON.stringify(art)); return true; }
  catch { return false; }              // 容量オーバー。呼んだ側で知らせる
}
function lukeArtUrl(moodId) {
  const art = loadLukeArt();
  return art[MOOD_TO_SLOT[moodId] || "base"] || art.base || null;
}
function lukeArtCount() { return Object.keys(loadLukeArt()).length; }
function lukeArtBytes() {
  return Object.values(loadLukeArt()).reduce((n, v) => n + (v ? v.length : 0), 0);
}

/**
 * 選ばれた絵を小さくして data URL にする。
 * 透過を保つため webp を優先し、使えない端末では png に落とす。
 */
function shrinkLukeImage(file, max = 300) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("読み込めませんでした"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("画像として開けませんでした"));
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * r), h = Math.round(img.height * r);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, w, h);
        let out = "";
        try { out = c.toDataURL("image/webp", 0.9); } catch { out = ""; }
        if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/png");
        resolve(out);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ── 状態 ───────────────────────────────────────────── */

function lukeState(S) {
  const l = (S.luke ||= {});
  if (!l.bornAt) {
    // 既定は「いま1歳」。保護者が本当の誕生日に直せる
    const d = new Date(); d.setFullYear(d.getFullYear() - 1);
    l.bornAt = d.toISOString().slice(0, 10);
  }
  l.metAt ||= S.startedAt || Date.now();
  l.tricks ||= [];
  l.memories ||= [];
  l.pats ||= 0;          // なでた回数
  l.taught ||= 0;        // 説明してあげた回数
  l.lastSeen ||= null;
  return l;
}

/** 一緒に過ごした日数 */
function daysTogether(S) {
  const l = lukeState(S);
  return Math.max(0, Math.floor((Date.now() - l.metAt) / 864e5));
}

/** Lukeの年齢(実時間で育つ) */
function lukeAge(S) {
  const l = lukeState(S);
  const born = new Date(l.bornAt + "T00:00:00");
  const ms = Date.now() - born.getTime();
  const years = ms / (365.2425 * 864e5);
  const y = Math.floor(years);
  const m = Math.max(0, Math.floor((years - y) * 12));
  return { years, y, m, text: y >= 1 ? `${y}歳${m ? m + "ヶ月" : ""}` : `${m}ヶ月`, human: dogToHuman(years) };
}

/**
 * 小型犬の年齢を人の年齢におきかえる目安。
 * 1年目でおよそ15歳、2年目で24歳、そのあとは1年に約4歳ずつ。
 * (獣医の世界で広く使われている換算。個体差はある)
 */
function dogToHuman(years) {
  if (years <= 0) return 0;
  if (years <= 1) return Math.round(years * 15);
  if (years <= 2) return Math.round(15 + (years - 1) * 9);
  return Math.round(24 + (years - 2) * 4);
}

/** Lukeの育ち具合。年齢に応じて、ふるまいが落ち着いていく */
function lukeStage(S) {
  const a = lukeAge(S).years;
  if (a < 2) return { n: 1, name: "やんちゃ", note: "まだ子犬。なんでも知りたがるし、すぐはしゃぐ。" };
  if (a < 4) return { n: 2, name: "わんぱく", note: "体はもう大人。でも遊びたい気持ちは子犬のまま。" };
  if (a < 6) return { n: 3, name: "たよれる", note: "落ち着いてきた。沙和さんの顔色をよく見ている。" };
  return { n: 4, name: "どっしり", note: "もう立派な大人の犬。そばにいるだけで安心する。" };
}

/* ── いまのきもち ───────────────────────────────────── */

/** 何もなければ、いまの状況から決まるきもち */
function lukeBaseMood(S) {
  const l = lukeState(S);
  const h = new Date().getHours();
  const since = l.lastSeen ? (Date.now() - l.lastSeen) / 864e5 : 0;
  if (isLukeBirthday(S)) return "party";
  if (since >= 3) return "lonely";
  if (h >= 22 || h < 5) return "sleepy";
  const mins = (S.sessions || []).find((x) => x.date === todayISO())?.minutes || 0;
  if (mins >= 90) return "sleepy";
  if (streakDays(S) >= 7) return "proud";
  return "normal";
}

/** 出来事に対する反応。しばらく続いてから、もとのきもちに戻る */
function lukeReact(S, kind) {
  const map = {
    correct: "happy", wrong: "tilt", hiwrong: "treasure",
    answer_asked: "sulk", skipped_confidence: "sulk", cheat: "sulk",
    start: "excited", done: "proud", tired: "snuggle", taught: "teach",
    pat: "happy", milestone: "party",
  };
  const m = map[kind] || "normal";
  const l = lukeState(S);
  l.mood = m; l.moodUntil = Date.now() + (m === "treasure" || m === "party" ? 14000 : 9000);
  l.lastSeen = Date.now();
  if (kind === "taught") l.taught++;
  if (kind === "pat") l.pats++;
  return m;
}

function lukeMood(S) {
  const l = lukeState(S);
  const id = (l.moodUntil && Date.now() < l.moodUntil && l.mood) ? l.mood : lukeBaseMood(S);
  return LUKE_MOODS[id] || LUKE_MOODS.normal;
}

/** そのきもちのひとこと。毎回変える(同じ言葉が続くと飽きる) */
function lukeLine(S, mood) {
  const m = mood || lukeMood(S);
  const l = lukeState(S);
  const pool = m.lines.filter((x) => x !== l.lastLine);
  const pick = (pool.length ? pool : m.lines)[Math.floor(Math.random() * (pool.length || m.lines.length))];
  l.lastLine = pick;
  return pick;
}

function isLukeBirthday(S) {
  const l = lukeState(S);
  return l.bornAt.slice(5) === todayISO().slice(5);
}

/* ── 芸 ─────────────────────────────────────────────── */

/** 覚えた芸を数え直す。新しく覚えたぶんを返す */
function refreshTricks(S) {
  const l = lukeState(S);
  const got = [];
  for (const t of LUKE_TRICKS) {
    if (l.tricks.includes(t.id)) continue;
    let ok = false;
    try { ok = !!t.check(S); } catch { ok = false; }
    if (ok) { l.tricks.push(t.id); got.push(t); addLukeMemory(S, `「${t.name}」ができるようになった`, t.emoji); }
  }
  return got;
}

function lukeTricks(S) {
  const l = lukeState(S);
  return LUKE_TRICKS.map((t) => ({ ...t, got: l.tricks.includes(t.id) }));
}

/** 次に覚えられそうな芸(近い目標を1つだけ見せる) */
function nextTrick(S) {
  const l = lukeState(S);
  return LUKE_TRICKS.find((t) => !l.tricks.includes(t.id)) || null;
}

/* ── 思い出 ─────────────────────────────────────────── */

function addLukeMemory(S, text, emoji = "🐾") {
  const l = lukeState(S);
  const at = todayISO();
  if (l.memories.some((m) => m.text === text)) return null;   // 同じ思い出は1回だけ
  l.memories.push({ text, emoji, at });
  if (l.memories.length > 60) l.memories.shift();
  return { text, emoji, at };
}

/** その日ぶんの節目を拾う */
function checkLukeMilestones(S) {
  const d = daysTogether(S);
  const out = [];
  for (const n of [7, 30, 100, 365, 730, 1095, 1460, 1825, 2190]) {
    if (d >= n) {
      const m = addLukeMemory(S, `いっしょに${n}日`, "🎉");
      if (m) out.push(m);
    }
  }
  if (isLukeBirthday(S)) {
    const a = lukeAge(S);
    const m = addLukeMemory(S, `Lukeが${a.y}歳になった`, "🎂");
    if (m) out.push(m);
  }
  return out;
}

/* ── 集計の道具 ─────────────────────────────────────── */

function countAnswers(S) {
  return Object.values(S.mem || {}).reduce((n, m) => n + (m.history || []).length, 0);
}
function hasStuckOrLowConf(S) {
  if ((S.homework || []).some((a) => a.items.some((i) => i.status === "stuck"))) return true;
  return Object.values(S.mem || {}).some((m) => (m.history || []).some((h) => h.confidence === 1));
}
/** 間違えたあとに正解した回数 */
function countFixed(S) {
  let n = 0;
  for (const m of Object.values(S.mem || {})) {
    const h = m.history || [];
    for (let i = 1; i < h.length; i++) if (!h[i - 1].correct && h[i].correct) n++;
  }
  return n;
}
/** 「自信あり×不正解」を直した回数 */
function countFixedHiWrong(S) {
  let n = 0;
  for (const m of Object.values(S.mem || {})) {
    const h = m.history || [];
    for (let i = 1; i < h.length; i++) if (h[i - 1].q === "hi-wrong" && h[i].correct) n++;
  }
  return n;
}
/** 同じ日に2教科以上やったか(交互練習) */
function mixedSubjectDay(S) {
  const byDay = {};
  for (const [id, m] of Object.entries(S.mem || {})) {
    const c = CONCEPT_MAP[id]; if (!c) continue;
    for (const h of m.history || []) {
      const d = new Date(h.t).toISOString().slice(0, 10);
      (byDay[d] ||= new Set()).add(c.s);
    }
  }
  return Object.values(byDay).some((s) => s.size >= 2);
}
/** 連続で勉強している日数 */
function streakDays(S) {
  const days = new Set((S.sessions || []).filter((s) => s.answered > 0).map((s) => s.date));
  let n = 0;
  const d = new Date();
  for (let i = 0; i < 400; i++) {
    const k = new Date(d.getTime() - i * 864e5).toISOString().slice(0, 10);
    if (days.has(k)) n++;
    else if (i > 0) break;
  }
  return n;
}

/* ── すがた(SVG)───────────────────────────────────────
   外部の画像を使わない。オフラインでも出るし、拡大しても粗くならない。
   きもちに応じて、耳・しっぽ・首のかたむき・目のかたちが変わる。 */

const LUKE_EYES = {
  open:    'M0 0 a7.4 7.4 0 1 0 .01 0Z',
  wide:    'M0 -1 a8.4 8.4 0 1 0 .01 0Z',
  arc:     'M-7 3 Q0 -7 7 3',
  closed:  'M-7 0 Q0 5 7 0',
  sad:     'M-6.4 3 Q0 -3 6.4 3',
  sparkle: 'M0 -1.6 a8.8 8.8 0 1 0 .01 0Z',
  away:    'M-4 0 a5 5 0 1 0 .01 0Z',
};

/**
 * Lukeを描く。
 * 前から順に:しっぽ → からだ → 耳 → 頭 → 顔。
 * きもちで変わるのは【首のかたむき・耳の角度・目のかたち・顔の向き・しっぽの速さ】。
 * @param mood LUKE_MOODS の1つ
 * @param size px
 */
function lukeSvg(mood, size = 132) {
  const a = mood.art;
  const eye = LUKE_EYES[a.eye] || LUKE_EYES.open;
  const line = a.eye === "arc" || a.eye === "closed" || a.eye === "sad";
  const glad = a.eye === "arc" || a.eye === "sparkle" || a.eye === "wide";
  const fx = a.faceX || 0;

  const eyeEl = (cx) => line
    ? `<path d="${eye}" transform="translate(${cx} 90)" fill="none" stroke="#4a2c17" stroke-width="3.2" stroke-linecap="round"/>`
    : `<g transform="translate(${cx} 90)"><path d="${eye}" fill="#31200f"/>
         <circle cx="-2.4" cy="-2.8" r="2.7" fill="#fff"/>
         <circle cx="2.2" cy="2.4" r="1.3" fill="#fff" opacity=".8"/></g>`;

  const puff = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;

  return `<svg class="luke-svg${a.bob ? " lk-bob" : ""}" viewBox="0 0 200 200" width="${size}" height="${size}"
    role="img" aria-label="Luke(${mood.name})" style="--tail:${a.tail}s">
  <defs>
    <radialGradient id="lkF" cx="38%" cy="28%">
      <stop offset="0%" stop-color="#f6cfa0"/><stop offset="100%" stop-color="#e0a367"/>
    </radialGradient>
  </defs>

  <!-- しっぽ(くるん)。からだより先に描いて、後ろにする -->
  <g class="lk-tail">
    <path d="M144 158 q28 4 32 -18 q3 -19 -13 -21 q-12 -1 -12 11 q0 9 9 9"
      fill="none" stroke="#d0904f" stroke-width="17" stroke-linecap="round"/>
    <path d="M144 158 q28 4 32 -18 q3 -19 -13 -21 q-12 -1 -12 11 q0 9 9 9"
      fill="none" stroke="url(#lkF)" stroke-width="11" stroke-linecap="round"/>
  </g>

  <!-- からだ(おすわり) -->
  <g fill="url(#lkF)">
    ${puff(100, 163, 33)}${puff(76, 169, 21)}${puff(124, 169, 21)}${puff(100, 143, 26)}
  </g>
  <g fill="#f4c894">${puff(85, 185, 12)}${puff(115, 185, 12)}</g>

  <!-- 首輪(ブルー)と、ゴールドのLチャーム -->
  <path d="M76 138 q24 12 48 0" fill="none" stroke="#2f7bad" stroke-width="10" stroke-linecap="round"/>
  <path d="M76 138 q24 12 48 0" fill="none" stroke="#4a97c8" stroke-width="4" stroke-linecap="round"/>
  <circle cx="100" cy="155" r="7.5" fill="#e0a82e"/>
  <circle cx="100" cy="155" r="7.5" fill="none" stroke="#c28c1c" stroke-width="1.2"/>
  <text x="100" y="159" font-size="9" font-weight="700" text-anchor="middle" fill="#8a6111"
    font-family="system-ui, sans-serif">L</text>

  <!-- あたま(耳ごとかたむく) -->
  <g class="lk-head" style="--tilt:${a.tilt}deg">
    <!-- たれ耳。頭より外・下に出して、少し濃い色にする -->
    <g class="lk-ear lk-ear-l" style="--ear:${a.ear}deg" fill="#d2934f">
      ${puff(43, 96, 22)}${puff(37, 121, 18)}${puff(44, 140, 13)}
    </g>
    <g class="lk-ear lk-ear-r" style="--ear:${a.ear}deg" fill="#d2934f">
      ${puff(157, 96, 22)}${puff(163, 121, 18)}${puff(156, 140, 13)}
    </g>
    <!-- 頭のふわふわ -->
    <g fill="url(#lkF)">
      ${puff(100, 86, 46)}${puff(66, 62, 22)}${puff(134, 62, 22)}${puff(100, 43, 24)}
      ${puff(78, 47, 17)}${puff(122, 47, 17)}${puff(60, 96, 18)}${puff(140, 96, 18)}
      ${puff(100, 128, 26)}
    </g>
    <!-- 顔(ソッポのときは横にずれる) -->
    <g class="lk-face" style="--fx:${fx}px">
      ${eyeEl(81)}${eyeEl(119)}
      <ellipse cx="100" cy="114" rx="21" ry="15.5" fill="#fbe4c6"/>
      <path d="M91.5 107 q8.5 -6.5 17 0 q0 8 -8.5 9.4 q-8.5 -1.4 -8.5 -9.4Z" fill="#31200f"/>
      <ellipse cx="96" cy="109" rx="2.6" ry="1.6" fill="#fff" opacity=".35"/>
      <path d="M100 117 q0 5.5 -6.5 5.5 M100 117 q0 5.5 6.5 5.5" fill="none" stroke="#31200f"
        stroke-width="2.4" stroke-linecap="round"/>
      ${glad ? `<path d="M88 121 q12 14 24 0 q-12 6 -24 0Z" fill="#31200f"/>
                <ellipse cx="100" cy="126" rx="6.5" ry="5.8" fill="#f4a0a8"/>
                <path d="M100 122 v7.5" stroke="#e0848f" stroke-width="1.3" stroke-linecap="round"/>` : ""}
      <ellipse cx="63" cy="106" rx="9" ry="5.6" fill="#f4a0a8" opacity="${glad ? ".6" : ".38"}"/>
      <ellipse cx="137" cy="106" rx="9" ry="5.6" fill="#f4a0a8" opacity="${glad ? ".6" : ".38"}"/>
      ${a.eye === "sad" ? `<path d="M93 125 q7 -5 14 0" fill="none" stroke="#4a2c17" stroke-width="2" stroke-linecap="round"/>` : ""}
    </g>
  </g>

  ${mood.id === "sleepy"
    ? `<text x="152" y="56" font-size="17" fill="#c9a273" class="lk-zzz">z</text>
       <text x="168" y="38" font-size="13" fill="#dab88f" class="lk-zzz" style="animation-delay:.7s">z</text>` : ""}
  ${mood.id === "sulk"
    ? `<text x="138" y="48" font-size="13" fill="#b08a5e">ぷいっ</text>` : ""}
  ${mood.id === "party"
    ? `<text x="24" y="48" font-size="22">🎉</text><text x="152" y="42" font-size="20">🎂</text>` : ""}
  ${mood.id === "treasure"
    ? `<text x="146" y="44" font-size="20">✨</text><text x="30" y="52" font-size="16">✨</text>` : ""}
</svg>`;
}

/* ── AIに渡す ───────────────────────────────────────── */

function lukeStatusText(S) {
  const a = lukeAge(S);
  const st = lukeStage(S);
  const l = lukeState(S);
  const got = l.tricks.length, next = nextTrick(S);
  return [
    `- Luke:${a.text}(人でいうと約${a.human}歳)・${st.name}期・いっしょに${daysTogether(S)}日`,
    `- 覚えた芸:${got}/${LUKE_TRICKS.length}${next ? ` — 次は「${next.name}」(${next.how})` : "(ぜんぶ覚えた)"}`,
    `- 今のきもち:${lukeMood(S).name}`,
    l.taught ? `- 沙和さんがLukeに説明してあげた回数:${l.taught}回` : null,
  ].filter(Boolean).join("\n");
}

function lukePromptBlock(S) {
  const a = lukeAge(S);
  const st = lukeStage(S);
  const next = nextTrick(S);
  return `
【相棒 Luke のこと】
Luke は沙和さんの犬。マルプーの男の子で、いま ${a.text}(${st.name}期:${st.note})。
一緒に ${daysTogether(S)}日 過ごしています。人でいうと約${a.human}歳。

1. Luke の反応を、会話の中で使う
   - 正解したとき・できるようになったとき → luke_react を "correct" で呼ぶ
   - 間違えたとき → "wrong"。Lukeは【責めない】。首をかしげて、近づいてくるだけ
   - 自信ありで間違えたとき → "hiwrong"。Lukeは【いちばん喜ぶ】。宝物を見つけた顔をする
   - 沙和さんが答えを聞いてきたとき → "answer_asked"。Lukeはソッポを向く(「教えないもん」)
   - 確信度を言わずに答えたとき → "skipped_confidence"。同じくソッポ
   - 「しんどい」と言われたとき → "tired"。Lukeはすりよる。何も解決しようとしない
   - 沙和さんがLukeに説明してくれたとき → "taught"

2. 【最重要】Luke は、できなかったことでは絶対に離れない
   - 間違えた・わからない・できない — これでLukeの態度は悪くならない。
   - Lukeがそっぽを向くのは【近道をしようとしたとき】だけ。しかもすぐ許す。
   - 「ちゃんとやらないとLukeが悲しむよ」という言い方は絶対にしない。
     これは条件つきの愛情になり、間違いを隠す原因になる。

3. Luke はまだ子犬。だから【教えてもらう側】に回る
   - 「オレまだ1歳だからわかんない。教えて?」と聞く。
   - わざと少しズレた質問をして、説明させる(人に説明すると理解が深まる)。
   - 説明してもらったら luke_react を "taught" で呼ぶ。

4. 次に覚えられる芸を、たまに話に混ぜる
   ${next ? `- 次の芸:「${next.name}」— 条件:${next.how}\n   - 意味:${next.why}` : "- もう全部覚えました。ここからは一緒にいるだけで十分です。"}
   - 芸の条件は【良いやり方ができたか】であって、正解の数ではない。そこを取り違えないこと。
   - ごほうびとして芸をぶら下げない。「これができたら芸が増えるよ」と釣らない。
     あとから「そういえば覚えたね」と気づく形にする。`;
}
