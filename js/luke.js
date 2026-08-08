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
  about: "マルチーズとトイプードルの子。赤みのあるアプリコットの巻き毛と、あごより下まで垂れた波打つ耳。人のそばにいるのが大好きで、いつも顔を見上げてくる。",
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
  try {
    const raw = JSON.parse(localStorage.getItem(LUKE_ART_KEY) || "{}") || {};
    // 昔の形式(文字列のまま)も読めるようにしておく
    const out = {};
    for (const [k, v] of Object.entries(raw)) out[k] = typeof v === "string" ? { u: v, r: false } : v;
    return out;
  } catch { return {}; }
}
function saveLukeArt(art) {
  try { localStorage.setItem(LUKE_ART_KEY, JSON.stringify(art)); return true; }
  catch { return false; }              // 容量オーバー。呼んだ側で知らせる
}
/** そのきもちで使う絵。無ければ「ふつう」に落ちる */
function lukeArtEntry(moodId) {
  const art = loadLukeArt();
  return art[MOOD_TO_SLOT[moodId] || "base"] || art.base || null;
}
function lukeArtUrl(moodId) { return lukeArtEntry(moodId)?.u || null; }
function lukeArtCount() { return Object.keys(loadLukeArt()).length; }
function lukeArtBytes() {
  return Object.values(loadLukeArt()).reduce((n, v) => n + (v?.u ? v.u.length : 0), 0);
}

/** data URL から Image を作る */
function toImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("画像として開けませんでした"));
    img.onload = () => resolve(img);
    img.src = url;
  });
}

/**
 * ファイルを Image として読み込む。
 * スマホの写真はそのままだと大きすぎる(1200万画素など)ので、
 * ここで長辺1000pxに縮めておく。あとの回転や切り抜きが軽くなる。
 */
async function readImage(file, max = 1000) {
  if (!/^image\//.test(file.type)) throw new Error("画像ファイルを選んでください");
  const url = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("読み込めませんでした"));
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(file);
  });
  const img = await toImage(url);
  const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (r >= 1) return img;
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * r);
  c.height = Math.round(img.naturalHeight * r);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return toImage(c.toDataURL("image/png"));
}

/**
 * 90度ずつ回す。
 * iPhoneで撮った写真は、向きの情報(EXIF)の扱いが端末や経路によって
 * まちまちで、横向きのまま出ることがある。自動判定に頼らず、
 * その場で回せるようにしておくほうが確実。
 */
async function rotateImage(img, deg = 90) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const swap = Math.abs(deg) % 180 !== 0;
  const c = document.createElement("canvas");
  c.width = swap ? h : w;
  c.height = swap ? w : h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2);
  return toImage(c.toDataURL("image/png"));
}

/**
 * 切り抜いて小さくする。
 * @param img   元の画像
 * @param crop  {x, y, w} 元画像の座標での正方形の切り抜き範囲
 * @param out   出力の一辺(px)
 * 透過を保つため webp を優先し、使えない端末では png に落とす。
 * 透過が【無い】= 写真とみなして、丸く表示する目印(r)をつける。
 */
function cropLukeImage(img, crop, out = 300) {
  const c = document.createElement("canvas");
  c.width = out; c.height = out;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.w, 0, 0, out, out);

  // 透過があるか調べる(間引いて見るだけで十分)
  let hasAlpha = false;
  try {
    const d = ctx.getImageData(0, 0, out, out).data;
    for (let i = 3; i < d.length; i += 4 * 37) { if (d[i] < 250) { hasAlpha = true; break; } }
  } catch { hasAlpha = true; }

  let url = "";
  try { url = c.toDataURL("image/webp", 0.9); } catch { url = ""; }
  if (!url.startsWith("data:image/webp")) url = c.toDataURL("image/png");
  return { u: url, r: !hasAlpha };      // 写真(不透明)なら丸く出す
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
   ★写真を測って作った。それまでは「犬っぽい形」を想像で描いていて、
   何度直しても似なかった。実物で確かめた比率は次のとおり。

     ・いちばん幅が広いのは【耳】。頭のまるみより外へ張り出す
     ・耳の下端は鼻より少し下。その下に【あごの毛】がさらに出る
     ・目は上から約36%の位置。目より下のほうが広い(マズルが短い)
     ・鼻は大きく、顔幅のおよそ1割強を占める
     ・頭が大きく、体は小さい

   巻き毛は輪郭を凸凹させず、内側に短い弧を置いて出す。
   陰影は userSpaceOnUse で光源をひとつに統一する。図形ごとに
   グラデーションがかかると、毛の丸が「並んだ球」に見えてしまう。
   ========================================================================= */

const LUKE_EYES = {
  open:    'M0 0 a8 8 0 1 0 .01 0Z',
  wide:    'M0 -1 a9 9 0 1 0 .01 0Z',
  arc:     'M-8 3 Q0 -7.5 8 3',
  closed:  'M-8 0 Q0 5.6 8 0',
  sad:     'M-7.5 3 Q0 -3 7.5 3',
  sparkle: 'M0 -1.6 a9.4 9.4 0 1 0 .01 0Z',
  away:    'M-4 0 a5.2 5.2 0 1 0 .01 0Z',
};

/** 巻き毛。短い弧を内側に置くだけ。輪郭は触らない */
function curl(x, y, r, rot = 0, o = 0.3) {
  return `<path d="M${-r} 0A${r} ${r} 0 0 1 ${r} 0" transform="translate(${x} ${y}) rotate(${rot})"
    fill="none" stroke="#a8672c" stroke-width="2" stroke-linecap="round" opacity="${o}"/>`;
}

/** 頭。上はまるく、下はあごの毛でやや細くなる */
const LUKE_HEAD = "M100 40C118 40 131 49 136 63C141 78 139 93 137 105"
                + "C135 120 128 133 115 138C106 142 94 142 85 138"
                + "C72 133 65 120 63 105C61 93 59 78 64 63C69 49 82 40 100 40Z";

/** 耳(左)。頭より外へ張り出し、鼻より少し下まで垂れる。右は反転して使う */
const LUKE_EAR = "M76 48C55 52 38 64 33 86C28 108 33 126 48 132"
               + "C63 138 72 128 74 110C76 92 79 66 79 56C79 48 80 45 76 48Z";

/** からだ。おすわり。頭に対して小さい */
const LUKE_BODY = "M100 143C120 143 135 155 137 172C139 187 130 195 116 195"
                + "L84 195C70 195 61 187 63 172C65 155 80 143 100 143Z";

function lukeSvg(mood, size = 132, view = "0 0 200 200") {
  const a = mood.art;
  const eye = LUKE_EYES[a.eye] || LUKE_EYES.open;
  const line = a.eye === "arc" || a.eye === "closed" || a.eye === "sad";
  const glad = a.eye === "arc" || a.eye === "sparkle" || a.eye === "wide";
  const fx = a.faceX || 0;

  const eyeEl = (cx) => line
    ? `<path d="${eye}" transform="translate(${cx} 79)" fill="none" stroke="#25150a" stroke-width="3.4" stroke-linecap="round"/>`
    : `<g transform="translate(${cx} 79)"><path d="${eye}" fill="#25150a"/>
         <circle cx="-2.7" cy="-3.2" r="3.1" fill="#fff"/>
         <circle cx="2.6" cy="2.8" r="1.4" fill="#fff" opacity=".7"/></g>`;

  // 頭のてっぺんの巻き毛。大きさをそろえない
  const rim = [[100,41,14],[81,46,12],[119,47,13],[67,58,10],[133,59,11]]
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("");

  return `<svg class="luke-svg${a.bob ? " lk-bob" : ""}" viewBox="${view}" width="${size}" height="${size}"
    role="img" aria-label="Luke(${mood.name})" style="--tail:${a.tail}s">
  <defs>
    <radialGradient id="lkF" gradientUnits="userSpaceOnUse" cx="76" cy="52" r="122">
      <stop offset="0%" stop-color="#f4c288"/><stop offset="50%" stop-color="#dc9c5a"/>
      <stop offset="100%" stop-color="#b1712f"/>
    </radialGradient>
    <radialGradient id="lkE" gradientUnits="userSpaceOnUse" cx="76" cy="52" r="122">
      <stop offset="0%" stop-color="#cf9855"/><stop offset="50%" stop-color="#b57737"/>
      <stop offset="100%" stop-color="#8a541f"/>
    </radialGradient>
    <radialGradient id="lkB" gradientUnits="userSpaceOnUse" cx="76" cy="52" r="122">
      <stop offset="0%" stop-color="#eeba82"/><stop offset="50%" stop-color="#d69554"/>
      <stop offset="100%" stop-color="#ab6c2c"/>
    </radialGradient>
  </defs>

  <!-- しっぽ -->
  <g class="lk-tail">
    <path d="M136 173 q25 1 27 -16 q2 -16 -12 -17 q-10 -1 -10 10 q0 8 8 8"
      fill="none" stroke="#b1712f" stroke-width="15" stroke-linecap="round"/>
    <path d="M136 173 q25 1 27 -16 q2 -16 -12 -17 q-10 -1 -10 10 q0 8 8 8"
      fill="none" stroke="#dc9c5a" stroke-width="8" stroke-linecap="round"/>
  </g>

  <!-- からだ -->
  <path d="${LUKE_BODY}" fill="url(#lkB)"/>
  <ellipse cx="87" cy="191" rx="11.5" ry="7.5" fill="#f0c48f"/>
  <ellipse cx="113" cy="191" rx="11.5" ry="7.5" fill="#f0c48f"/>
  ${curl(83,161,7,-10)}${curl(117,163,7,8)}${curl(100,153,6,0,.24)}${curl(100,178,8,4,.22)}

  <!-- 首輪(ライムイエロー・メッシュ) -->
  <path d="M72 143 q28 18 56 0" fill="none" stroke="#2b3126" stroke-width="12" stroke-linecap="round"/>
  <path d="M72 142 q28 18 56 0" fill="none" stroke="#ccec25" stroke-width="7.5" stroke-linecap="round"/>
  <path d="M72 141 q28 18 56 0" fill="none" stroke="#eafb7d" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>

  <!-- あたま -->
  <g class="lk-head" style="--tilt:${a.tilt}deg">
    <!-- ★耳。いちばん外へ張り出す部分。頭より先に描いて後ろに置く -->
    <g class="lk-ear lk-ear-l" style="--ear:${a.ear}deg">
      <path d="${LUKE_EAR}" fill="url(#lkE)"/>
      ${curl(48,74,7,-22,.26)}${curl(44,100,7,-12,.24)}${curl(54,122,6,-6,.22)}
    </g>
    <g class="lk-ear lk-ear-r" style="--ear:${a.ear}deg">
      <g transform="translate(200 0) scale(-1 1)">
        <path d="${LUKE_EAR}" fill="url(#lkE)"/>
        ${curl(48,74,7,-22,.26)}${curl(44,100,7,-12,.24)}${curl(54,122,6,-6,.22)}
      </g>
    </g>

    <!-- 頭 -->
    <g fill="url(#lkF)"><path d="${LUKE_HEAD}"/>${rim}</g>
    ${curl(80,58,7,-14)}${curl(120,58,7,14)}${curl(100,48,6,0,.26)}
    ${curl(72,84,6,-28,.22)}${curl(128,84,6,28,.22)}
    ${curl(88,131,6,-6,.2)}${curl(112,131,6,6,.2)}

    <!-- 顔。目のまわりから口もとにかけて毛が短く、明るい -->
    <g class="lk-face" style="--fx:${fx}px">
      <ellipse cx="100" cy="94" rx="27" ry="25" fill="#f7d29b" opacity=".42"/>
      ${eyeEl(84)}${eyeEl(116)}
      <ellipse cx="100" cy="102" rx="16" ry="12.5" fill="#fbe3bb" opacity=".72"/>
      <path d="M91 92 q9 -7 18 0 q0 8.5 -9 10 q-9 -1.5 -9 -10Z" fill="#25150a"/>
      <ellipse cx="95.6" cy="94.5" rx="3" ry="1.8" fill="#fff" opacity=".28"/>
      ${glad
        ? `<path d="M88 106 q12 15 24 0 q-12 6 -24 0Z" fill="#25150a"/>
           <ellipse cx="100" cy="112" rx="7" ry="6.4" fill="#f2939c"/>
           <path d="M100 107 v8.5" stroke="#dd7b87" stroke-width="1.4" stroke-linecap="round"/>`
        : `<path d="M100 103 q0 6 -7 6 M100 103 q0 6 7 6" fill="none" stroke="#25150a"
             stroke-width="2.5" stroke-linecap="round"/>`}
      ${a.eye === "sad" ? `<path d="M92 113 q8 -5 16 0" fill="none" stroke="#25150a" stroke-width="2.1" stroke-linecap="round"/>` : ""}
      <ellipse cx="73" cy="97" rx="8.5" ry="5" fill="#e0958d" opacity="${glad ? ".32" : ".14"}"/>
      <ellipse cx="127" cy="97" rx="8.5" ry="5" fill="#e0958d" opacity="${glad ? ".32" : ".14"}"/>
    </g>
  </g>

  ${mood.id === "sleepy"
    ? `<text x="162" y="48" font-size="17" fill="#c9a273" class="lk-zzz">z</text>
       <text x="178" y="30" font-size="13" fill="#dab88f" class="lk-zzz" style="animation-delay:.7s">z</text>` : ""}
  ${mood.id === "sulk"
    ? `<text x="146" y="40" font-size="13" fill="#b08a5e">ぷいっ</text>` : ""}
  ${mood.id === "party"
    ? `<text x="14" y="42" font-size="22">🎉</text><text x="158" y="34" font-size="20">🎂</text>` : ""}
  ${mood.id === "treasure"
    ? `<text x="158" y="36" font-size="20">✨</text><text x="16" y="46" font-size="16">✨</text>` : ""}
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
