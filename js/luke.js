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
   ★3回描き直して分かったこと。
   部品(丸や房)を足していく作り方だと、足すほど「組み立てた物」に見える。
   実物の写真は、頭・顔まわりの毛・耳が【ひとつながりの輪郭】になっている。
   そこで、輪郭は手で引いた曲線1本ずつにして、
   巻き毛は「輪郭を凸凹させる」のではなく【内側に短い弧を置く】ことで出す。
   これは平面イラストで毛を描くときの定石で、シルエットを壊さない。

   外部の画像を使わないので、オフラインでも出るし拡大しても粗くならない。
   きもちで変わるのは、首のかたむき・耳の角度・目のかたち・顔の向き・しっぽの速さ。
   ========================================================================= */

const LUKE_EYES = {
  open:    'M0 0 a9.4 9.4 0 1 0 .01 0Z',
  wide:    'M0 -1 a10.4 10.4 0 1 0 .01 0Z',
  arc:     'M-8.5 3.5 Q0 -8 8.5 3.5',
  closed:  'M-8.5 0 Q0 6 8.5 0',
  sad:     'M-8 3.5 Q0 -3 8 3.5',
  sparkle: 'M0 -1.8 a10.8 10.8 0 1 0 .01 0Z',
  away:    'M-4.5 0 a5.6 5.6 0 1 0 .01 0Z',
};

/** 巻き毛の質感。短い弧を内側に置くだけ。輪郭は触らない */
function curl(x, y, r, rot = 0, o = 0.34) {
  return `<path d="M${-r} 0A${r} ${r} 0 0 1 ${r} 0" transform="translate(${x} ${y}) rotate(${rot})"
    fill="none" stroke="#b8762f" stroke-width="2" stroke-linecap="round" opacity="${o}"/>`;
}

/** 耳(左)。上は細く、外へふくらんで、先は丸い。右は左右反転して使う */
const LUKE_EAR = "M76 54C58 58 42 76 39 100C36 124 43 143 57 149"
               + "C70 155 80 147 83 132C86 116 86 84 84 68C83 58 82 52 76 54Z";

/** 頭。手で引いた、やわらかい丸 */
const LUKE_HEAD = "M100 46C114 46 127 50 136 58C145 67 147 78 147 90"
                + "C147 104 141 116 131 124C122 131 112 135 100 135"
                + "C88 135 78 131 69 124C59 116 53 104 53 90"
                + "C53 78 55 67 64 58C73 50 86 46 100 46Z";

/** からだ。おすわり */
const LUKE_BODY = "M100 140C121 140 137 153 139 171C141 186 132 194 117 194"
                + "L83 194C68 194 59 186 61 171C63 153 79 140 100 140Z";

function lukeSvg(mood, size = 132) {
  const a = mood.art;
  const eye = LUKE_EYES[a.eye] || LUKE_EYES.open;
  const line = a.eye === "arc" || a.eye === "closed" || a.eye === "sad";
  const glad = a.eye === "arc" || a.eye === "sparkle" || a.eye === "wide";
  const fx = a.faceX || 0;

  const eyeEl = (cx) => line
    ? `<path d="${eye}" transform="translate(${cx} 94)" fill="none" stroke="#2b1b0e" stroke-width="3.6" stroke-linecap="round"/>`
    : `<g transform="translate(${cx} 94)"><path d="${eye}" fill="#2b1b0e"/>
         <circle cx="-3.2" cy="-3.7" r="3.7" fill="#fff"/>
         <circle cx="2.8" cy="3" r="1.6" fill="#fff" opacity=".72"/></g>`;

  // 頭のふちの毛。大きさをわざと不ぞろいにする(そろえると機械っぽくなる)
  const rim = [[100,46,16],[81,51,13],[119,52,14],[65,63,11],[135,64,12]]
    .map(([x,y,r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("");

  return `<svg class="luke-svg${a.bob ? " lk-bob" : ""}" viewBox="0 0 200 200" width="${size}" height="${size}"
    role="img" aria-label="Luke(${mood.name})" style="--tail:${a.tail}s">
  <defs>
    <!-- ★光源は1つ。userSpaceOnUse にしないと図形ごとに別々の陰影がつき、
         ふちの毛が「並んだ球」に見えてしまう(ここでかなり長くつまずいた) -->
    <radialGradient id="lkF" gradientUnits="userSpaceOnUse" cx="74" cy="56" r="118">
      <stop offset="0%" stop-color="#f7d6a4"/><stop offset="52%" stop-color="#e3a967"/>
      <stop offset="100%" stop-color="#c07d39"/>
    </radialGradient>
    <radialGradient id="lkE" gradientUnits="userSpaceOnUse" cx="74" cy="56" r="118">
      <stop offset="0%" stop-color="#e0ab6d"/><stop offset="52%" stop-color="#cd9152"/>
      <stop offset="100%" stop-color="#a86c33"/>
    </radialGradient>
    <radialGradient id="lkB" gradientUnits="userSpaceOnUse" cx="74" cy="56" r="118">
      <stop offset="0%" stop-color="#f2c894"/><stop offset="52%" stop-color="#dda261"/>
      <stop offset="100%" stop-color="#bd7a37"/>
    </radialGradient>
  </defs>

  <!-- しっぽ -->
  <g class="lk-tail">
    <path d="M138 172 q26 1 28 -17 q2 -17 -12 -18 q-11 -1 -11 10 q0 9 9 9"
      fill="none" stroke="#c8853f" stroke-width="16" stroke-linecap="round"/>
    <path d="M138 172 q26 1 28 -17 q2 -17 -12 -18 q-11 -1 -11 10 q0 9 9 9"
      fill="none" stroke="#e0a463" stroke-width="9" stroke-linecap="round"/>
  </g>

  <!-- からだ -->
  <path d="${LUKE_BODY}" fill="url(#lkB)"/>
  <ellipse cx="87" cy="190" rx="12" ry="8" fill="#f4d2a4"/>
  <ellipse cx="113" cy="190" rx="12" ry="8" fill="#f4d2a4"/>
  ${curl(82,158,7,-10)}${curl(118,160,7,8)}${curl(100,150,6,0,.26)}${curl(100,176,8,4,.24)}

  <!-- 首輪(ライムイエロー。内側は黒い2重) -->
  <path d="M70 137 q30 20 60 0" fill="none" stroke="#2b3126" stroke-width="13" stroke-linecap="round"/>
  <path d="M70 136 q30 20 60 0" fill="none" stroke="#c9e22e" stroke-width="8" stroke-linecap="round"/>
  <path d="M70 135 q30 20 60 0" fill="none" stroke="#e9f77c" stroke-width="2.6" stroke-linecap="round" opacity=".65"/>
  <circle cx="100" cy="158" r="7" fill="#dfe3e8"/>
  <circle cx="100" cy="158" r="7" fill="none" stroke="#aab2bc" stroke-width="1.1"/>
  <text x="100" y="162" font-size="8.5" font-weight="700" text-anchor="middle" fill="#6b7480"
    font-family="system-ui, sans-serif">L</text>

  <!-- あたま(耳ごとかたむく) -->
  <g class="lk-head" style="--tilt:${a.tilt}deg">
    <!-- たれ耳。頭の後ろに置いて、輪郭をひとつながりに見せる -->
    <g class="lk-ear lk-ear-l" style="--ear:${a.ear}deg">
      <path d="${LUKE_EAR}" fill="url(#lkE)"/>
      ${curl(52,98,6,-14,.3)}${curl(60,130,6,-8,.28)}
    </g>
    <g class="lk-ear lk-ear-r" style="--ear:${a.ear}deg">
      <g transform="translate(200 0) scale(-1 1)">
        <path d="${LUKE_EAR}" fill="url(#lkE)"/>
        ${curl(52,98,6,-14,.3)}${curl(60,130,6,-8,.28)}
      </g>
    </g>

    <!-- 頭。輪郭は曲線1本。ふちの毛で丸みを不ぞろいにする -->
    <g fill="url(#lkF)"><path d="${LUKE_HEAD}"/>${rim}</g>
    ${curl(78,70,7,-16)}${curl(122,70,7,16)}${curl(100,58,6,0,.26)}${curl(66,96,6,-30,.24)}${curl(134,96,6,30,.24)}

    <!-- 顔。目のまわりだけ毛が短く、明るい -->
    <g class="lk-face" style="--fx:${fx}px">
      <ellipse cx="100" cy="102" rx="33" ry="27" fill="#fae2b8" opacity=".62"/>
      ${eyeEl(80)}${eyeEl(120)}
      <ellipse cx="100" cy="118" rx="19" ry="13" fill="#fdf0da"/>
      <path d="M91.5 109 q8.5 -7 17 0 q0 8 -8.5 9.5 q-8.5 -1.5 -8.5 -9.5Z" fill="#2b1b0e"/>
      <ellipse cx="96" cy="111.5" rx="2.8" ry="1.7" fill="#fff" opacity=".3"/>
      ${glad
        ? `<path d="M88 123 q12 14 24 0 q-12 6 -24 0Z" fill="#2b1b0e"/>
           <ellipse cx="100" cy="128" rx="6.5" ry="5.6" fill="#f0989f"/>
           <path d="M100 124 v7.5" stroke="#dd7f8a" stroke-width="1.4" stroke-linecap="round"/>`
        : `<path d="M100 120 q0 5.5 -6.5 5.5 M100 120 q0 5.5 6.5 5.5" fill="none" stroke="#2b1b0e"
             stroke-width="2.6" stroke-linecap="round"/>`}
      ${a.eye === "sad" ? `<path d="M92 129 q8 -5 16 0" fill="none" stroke="#2b1b0e" stroke-width="2.2" stroke-linecap="round"/>` : ""}
      <ellipse cx="70" cy="108" rx="8.5" ry="5.2" fill="#e0958d" opacity="${glad ? ".34" : ".15"}"/>
      <ellipse cx="130" cy="108" rx="8.5" ry="5.2" fill="#e0958d" opacity="${glad ? ".34" : ".15"}"/>
    </g>
  </g>

  ${mood.id === "sleepy"
    ? `<text x="158" y="52" font-size="17" fill="#c9a273" class="lk-zzz">z</text>
       <text x="174" y="34" font-size="13" fill="#dab88f" class="lk-zzz" style="animation-delay:.7s">z</text>` : ""}
  ${mood.id === "sulk"
    ? `<text x="140" y="44" font-size="13" fill="#b08a5e">ぷいっ</text>` : ""}
  ${mood.id === "party"
    ? `<text x="18" y="44" font-size="22">🎉</text><text x="154" y="38" font-size="20">🎂</text>` : ""}
  ${mood.id === "treasure"
    ? `<text x="152" y="40" font-size="20">✨</text><text x="22" y="48" font-size="16">✨</text>` : ""}
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
