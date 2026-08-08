/* =========================================================================
   english.js — 英語:発音・会話・文法・語彙・読解・英作文・受験

   ★このファイルの前提になっている考え方
   ----------------------------------------------------------------------
   「会話ができれば、読み書きも受験英語も自然にできるようになる」——
   これは、残念ながら研究の上では成り立ちません。会話だけで受験レベルの
   読解精度や英作文の正確さには届かないことが繰り返し確認されています
   (Norris & Ortega 2000:明示的な文法指導は効果量 d≈0.96 で、
    暗示的な学習より明確に大きい)。

   ただし【順番】には意味があります。音と会話を先に作ると、そのあとの
   読み・書き・受験の伸び方が変わります。理由は3つ、どれも仕組みの話です。

   ① 音を覚えられない語は、記憶に残らない
      新しい単語は、まず音のかたち(音韻ループ)に保持されてから
      長期記憶に移ります。音として区別できない語は、この入口で落ちます。
      Baddeley, Gathercole & Papagno (1998) — 音韻的短期記憶は
      語彙習得の最も強い予測因子のひとつ。
      → だから「発音から」は、発音のためではなく【語彙のため】に正しい。

   ② 黙読も、頭の中では音に変換されている
      音のあいまいな語ばかりの文章は、読む速度が落ちます。
      長文が「読めない」原因の多くは、語彙不足と音の未整備です。

   ③ 話すと、自分に何が足りないかが分かる(気づきの機能)
      Swain の出力仮説。聞いているだけでは気づけない穴が、
      言おうとした瞬間に見つかります。会話は練習であると同時に【診断】です。

   そのうえで、読解・英作文・受験英語は【別に作らないと身につきません】。
   このファイルは、その5層を全部持ちます。

     1. 音   … 聞き分け・発音(日本語話者がつまずく音に限定)
     2. 話す … 会話(直さずに続ける時間と、あとでまとめて直す時間を分ける)
     3. 読む … 語彙カバー率・チャンク読み・談話標識・設問タイプ
     4. 書く … 和文和訳 → 英訳、自由英作文の型
     5. 受験 … 共通テストの構造、頻出の型、時間配分

   ★もうひとつの柱:日本語話者【固有】のつまずきだけを狙う
   冠詞・可算不可算・自動詞他動詞・時制。これらは母語に無い区別なので、
   英語圏向けの教材には載っていません。ここを潰すのが最短距離です。
   ========================================================================= */

/* ── 5つの層(道すじ)───────────────────────────────────── */

const ENG_LAYERS = [
  {
    n: 1, id: "sound", name: "音をつくる", emoji: "🔊",
    goal: "日本語にない音を、聞き分けられる・出せる",
    why: "音で区別できない語は、覚えても記憶に残りません。単語帳より先にここです。",
    doing: "聞き分けドリル / お手本と聞き比べ / 音読",
  },
  {
    n: 2, id: "speak", name: "話す", emoji: "💬",
    goal: "まちがえてもいいから、英語で言い切れる",
    why: "言おうとした瞬間に「言えない場所」が見つかります。会話は練習であり診断です。",
    doing: "AIと英会話 / 4-3-2(同じ話を短くしていく)/ 言えなかったことの回収",
  },
  {
    n: 3, id: "read", name: "読む", emoji: "📖",
    goal: "戻り読みせずに、前から意味を取れる",
    why: "文章の98%の語を知っていて初めて、辞書なしで読めます。語彙とつなぎ言葉が要です。",
    doing: "チャンク読み / つなぎ言葉 / 設問タイプ別の解き方",
  },
  {
    n: 4, id: "write", name: "書く", emoji: "✍️",
    goal: "自分の言いたいことを、減点されない英語にする",
    why: "書くと、あいまいだった文法がぜんぶ表に出ます。話すよりごまかせません。",
    doing: "和文和訳 → 英訳 / 自由英作文の型 / 減点ポイント",
  },
  {
    n: 5, id: "exam", name: "受験に仕上げる", emoji: "🎓",
    goal: "時間内に、確実に点にする",
    why: "共通テストはリーディング100点・リスニング100点。音の力がそのまま点になります。",
    doing: "時間配分 / 設問の型 / 頻出テーマ",
  },
];

/* ── ① 発音:日本語話者がつまずく音だけ ─────────────────────
   全部の音をやる必要はない。日本語に「無い区別」だけが問題になる。
   カタカナで書かないこと。カタカナは誤った音を固定してしまう。 */

const PHONEMES = [
  {
    id: "rl", name: "R と L", jp: "ラ行が両方をつぶしてしまう",
    why: "日本語のラ行は舌先で上あごを一瞬たたく音で、R でも L でもありません。だから日本語話者には同じに聞こえます。",
    how: {
      R: "舌をどこにもつけない。舌先を少し奥に引いて、口を軽くすぼめる。「うー」の口から始めると近い",
      L: "舌先を上の前歯のうしろにしっかりつけたまま声を出す。つけたまま、が大事",
    },
    pairs: [["right", "light"], ["rice", "lice"], ["road", "load"], ["pray", "play"], ["correct", "collect"], ["fry", "fly"], ["grass", "glass"]],
    tip: "L は舌をつける。R はどこにもつけない。迷ったら「つける/つけない」だけで判断する",
  },
  {
    id: "th", name: "th(θ / ð)", jp: "s や z で代用してしまう",
    why: "日本語に舌を歯に挟む音がないので、いちばん近い s / z に置きかえてしまいます。think が sink に聞こえます。",
    how: {
      "θ(think)": "舌先を上下の歯のあいだに軽くはさんで、息だけを出す。声は出さない",
      "ð(this)": "同じ形で、こんどは声を出す。のどがふるえる",
    },
    pairs: [["think", "sink"], ["three", "tree"], ["mouth", "mouse"], ["thank", "sank"], ["they", "day"], ["breathe", "breeze"], ["path", "pass"]],
    tip: "鏡を見て、舌先が見えていればOK。見えないなら s になっている",
  },
  {
    id: "fv", name: "F・V と H・B", jp: "ハ行・バ行で代用してしまう",
    why: "日本語のフは唇を丸めて息を出す音で、F ではありません。V にいたっては日本語にないので B になります。",
    how: {
      F: "下くちびるを上の前歯に軽くあてて、息を通す",
      V: "同じ形で声を出す。くちびるがふるえる感じ",
    },
    pairs: [["very", "berry"], ["vote", "boat"], ["fan", "pan"], ["food", "hood"], ["vest", "best"], ["fine", "pine"], ["leaf", "leap"]],
    tip: "F と V は【歯とくちびる】。B と P は【くちびる同士】。どこが当たっているかで決まる",
  },
  {
    id: "si", name: "si と shi", jp: "「し」が全部 shi になる",
    why: "日本語のシは英語の she の音に近く、see の s ではありません。だから see が she に聞こえます。",
    how: { s: "舌先を歯ぐきに近づけて、細く鋭い息を出す。口は横に引く", "ʃ": "舌を少し後ろに引き、口をすぼめる" },
    pairs: [["see", "she"], ["seat", "sheet"], ["save", "shave"], ["sell", "shell"], ["sign", "shine"], ["sort", "short"]],
    tip: "si は「スィ」に近い。「シ」と言った時点で she になっている",
  },
  {
    id: "vowel", name: "母音を足さない", jp: "子音のあとに母音がついてしまう",
    why: "日本語は原則「子音＋母音」で1拍。だから desk が de-su-ku と3拍になります。英語では1拍。ここが通じない最大の原因です。",
    how: { 止め方: "最後の子音で【口の形だけ作って、そこで止める】。息を足さない" },
    pairs: [["desk", "desuku"], ["milk", "miruku"], ["six", "sikkusu"], ["asked", "asukudo"], ["texts", "tekisutsu"], ["strength", "sutorengusu"]],
    noAudioB: true,
    tip: "McDonald's は英語では3拍(Mc-DON-alds)。日本語では6拍。この差が「通じない」の正体",
  },
  {
    id: "stress", name: "強く言う場所", jp: "全部を同じ強さで言ってしまう",
    why: "日本語は音の高低でことばを区別しますが、英語は【強弱】です。強い場所がずれると、正しい音でも通じません。",
    how: { 練習: "強い所だけ、大きく・長く・高く。弱い所はつぶしてよい" },
    words: [
      { w: "hotel", s: "ho-TEL" }, { w: "volunteer", s: "vol-un-TEER" },
      { w: "photograph", s: "PHO-to-graph" }, { w: "photography", s: "pho-TOG-ra-phy" },
      { w: "important", s: "im-POR-tant" }, { w: "develop", s: "de-VEL-op" },
      { w: "difficult", s: "DIF-fi-cult" }, { w: "necessary", s: "NEC-es-sar-y" },
    ],
    pairs: [],
    tip: "photograph と photography は、同じつづりでも強い場所が動く。動くと母音の音まで変わる",
  },
  {
    id: "reduce", name: "弱く言う・つなげる", jp: "1語ずつはっきり言ってしまう",
    why: "英語は内容語を強く、機能語(a/of/to/can)を極端に弱く言います。リスニングで聞き取れない原因のほとんどがこれです。",
    how: {
      弱形: "can は「クン」に近いくらい弱い。強い can は逆に can't のことが多い",
      連結: "get up は「ゲラップ」、want to は「ウォナ」のようにつながる",
    },
    pairs: [],
    phrases: ["I can do it.", "I can't do it.", "What do you want to do?", "Get up and check it out."],
    tip: "「can が聞こえた」と思ったら can't のことがある。強く聞こえたほうが can't",
  },
  {
    id: "ae", name: "a の3つの音", jp: "全部「ア」にしてしまう",
    why: "英語には日本語のアにあたる音が3つ以上あります。cat / cut / cot は英語では別の語です。",
    how: {
      "æ(cat)": "口を横に大きく開ける。「エ」と「ア」の中間",
      "ʌ(cut)": "口をあまり開けず、のどの奥で短く",
      "ɑ(cot)": "口を縦に大きく開けて「オ」に近く",
    },
    pairs: [["cat", "cut"], ["bad", "bud"], ["hat", "hot"], ["cap", "cup"], ["match", "much"], ["ran", "run"]],
    tip: "æ は口を横、ʌ は口を閉じ気味、ɑ は口を縦。口の形が3つある",
  },
  {
    id: "ii", name: "長い i と短い i", jp: "長さだけの違いだと思ってしまう",
    why: "eat と it は長さではなく【音そのもの】が違います。日本語のイは英語の短い i に近く、eat の音は日本語にありません。",
    how: {
      "iː(eat)": "口を横にしっかり引いて、舌を高く前に",
      "ɪ(it)": "力を抜いて、口を少しゆるめる。短く",
    },
    pairs: [["eat", "it"], ["sheep", "ship"], ["feel", "fill"], ["leave", "live"], ["seat", "sit"], ["reach", "rich"]],
    tip: "sheep と ship を言い分けられるかが目安。ゆるめると ship になる",
  },
  {
    id: "ng", name: "ん の使い分け", jp: "全部おなじ「ん」にしてしまう",
    why: "日本語の「ん」は次の音につられて勝手に変わりますが、英語では n / m / ng が別の語を作ります。",
    how: { n: "舌先を歯ぐきにつける", m: "くちびるを閉じる", ng: "舌の奥を上げる。口は開いたまま" },
    pairs: [["sin", "sing"], ["thin", "thing"], ["ban", "bang"], ["run", "rung"], ["sun", "sung"]],
    tip: "ng は口を閉じない。閉じると m になる",
  },
];

const PHONEME_MAP = Object.fromEntries(PHONEMES.map((p) => [p.id, p]));

/**
 * ★聞き取り結果から、どの音でつまずいたかを当てる。
 * 目標が right で light と認識されたなら、R/L の問題だと分かる。
 * 音声認識が使える端末では、これがそのまま診断になる。
 */
function diagnosePronunciation(target, heard) {
  const t = normalizeEn(target).split(" ").filter(Boolean);
  const h = normalizeEn(heard).split(" ").filter(Boolean);
  const hits = [];
  for (const p of PHONEMES) {
    for (const [a, b] of p.pairs || []) {
      // 言おうとした語が a で b と聞こえた(逆も同じ)
      if ((t.includes(a) && h.includes(b)) || (t.includes(b) && h.includes(a))) {
        hits.push({ id: p.id, name: p.name, said: t.includes(a) ? a : b, heard: t.includes(a) ? b : a, tip: p.tip });
      }
    }
  }
  return hits;
}

/** 発音の記録 */
function pronState(S, id) {
  const e = (S.eng ||= {});
  const p = (e.pron ||= {});
  return (p[id] ||= { heard: 0, heardRight: 0, said: 0, saidRight: 0, lastAt: null });
}
function notePron(S, id, kind, ok) {
  const st = pronState(S, id);
  if (kind === "listen") { st.heard++; if (ok) st.heardRight++; }
  else { st.said++; if (ok) st.saidRight++; }
  st.lastAt = Date.now();
  return st;
}
function pronAccuracy(S, id) {
  const st = pronState(S, id);
  const n = st.heard + st.said, r = st.heardRight + st.saidRight;
  return n ? r / n : null;
}
/** 苦手な音を、練習回数が少ない順・正答率が低い順に返す */
function weakPhonemes(S, limit = 3) {
  return PHONEMES.map((p) => {
    const st = pronState(S, p.id);
    const n = st.heard + st.said;
    const acc = pronAccuracy(S, p.id);
    return { ...p, n, acc, score: (acc == null ? 0.5 : 1 - acc) * 100 + (n < 10 ? 30 : 0) };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ── ② 語彙 ───────────────────────────────────────────────
   ★ここは設計の判断が必要だった。

   3000語の単語帳をアプリに丸ごと積むのは、実は効率が悪い。
   バラバラの語を並べて覚えるのは、文章の中で出会って覚えるより
   定着が弱く、しかも本人が飽きる。

   そこで積むのは【3種類だけ】にした。
     (a) 絶対に要るのに有限なもの        … 不規則動詞
     (b) 語彙を何倍にもふくらませる道具   … 接辞と語根
     (c) 日本語話者だけがひっかかる罠     … 和製英語・多義語・可算不可算
   これ以外の語は、実際に読んだ文・解いた問題の中で出会ったものを
   AIがその場で登録し、FSRS(忘れかけたころに出す仕組み)に乗せる。
   出会った文脈ごと覚えるほうが、確実に残る。 */

/** 語彙カバー率 — 「何語知っていれば読めるのか」の実際の数字 */
const COVERAGE = [
  { words: 1000,  cover: "約72%", can: "会話のいちばん基本。文章はまだ読めない" },
  { words: 2000,  cover: "約80%", can: "5語に1語わからない。辞書なしでは苦しい" },
  { words: 3000,  cover: "約90%", can: "だいたいの話は追える。細部は落ちる" },
  { words: 5000,  cover: "約95%", can: "共通テストが読める。辞書があれば大丈夫" },
  { words: 8000,  cover: "約98%", can: "辞書なしで読める。難関大の長文もここ" },
];
const COVERAGE_NOTE =
  "研究では、辞書なしで文章を理解するには【その文章の98%の語を知っている】必要があるとされます(Hu & Nation 2000)。" +
  "95%では理解度が大きく落ちます。つまり「わからない単語が20語に1語」でも、まだ足りません。";

/** (a) 不規則動詞 — 有限で、必ず出る。型でまとめると覚える量が減る */
const IRREGULAR = [
  { g: "AAA(変わらない)", note: "原形・過去・過去分詞が全部同じ。読み方だけ変わるものに注意",
    v: [["cut","cut","cut","切る"],["put","put","put","置く"],["set","set","set","置く・定める"],["hit","hit","hit","打つ"],
        ["let","let","let","させる"],["shut","shut","shut","閉める"],["cost","cost","cost","費用がかかる"],["hurt","hurt","hurt","傷つける"],
        ["spread","spread","spread","広げる"],["read","read","read","読む(過去はレッドと読む)"]] },
  { g: "ABA(戻る)", note: "過去分詞が原形に戻る。数が少ないのでここだけ覚える",
    v: [["come","came","come","来る"],["become","became","become","〜になる"],["run","ran","run","走る・経営する"]] },
  { g: "ABB(2つ同じ)", note: "いちばん多い型。過去と過去分詞が同じ",
    v: [["buy","bought","bought","買う"],["bring","brought","brought","持ってくる"],["think","thought","thought","思う"],
        ["teach","taught","taught","教える"],["catch","caught","caught","つかまえる"],["feel","felt","felt","感じる"],
        ["keep","kept","kept","保つ"],["sleep","slept","slept","眠る"],["leave","left","left","去る・残す"],
        ["lose","lost","lost","失う・負ける"],["meet","met","met","会う"],["sit","sat","sat","座る"],
        ["stand","stood","stood","立つ・耐える"],["understand","understood","understood","理解する"],["tell","told","told","伝える"],
        ["sell","sold","sold","売る"],["find","found","found","見つける"],["hold","held","held","持つ・開催する"],
        ["hear","heard","heard","聞こえる"],["say","said","said","言う"],["pay","paid","paid","払う"],
        ["make","made","made","作る"],["have","had","had","持つ"],["build","built","built","建てる"],
        ["send","sent","sent","送る"],["spend","spent","spent","費やす"],["win","won","won","勝つ"],
        ["get","got","got / gotten","得る"],["feed","fed","fed","えさをやる"],["lead","led","led","導く"]] },
  { g: "ABC(全部ちがう)", note: "受験で最もよく問われる型。母音の変化に規則がある(i-a-u など)",
    v: [["be","was / were","been","である"],["do","did","done","する"],["go","went","gone","行く"],
        ["see","saw","seen","見る"],["eat","ate","eaten","食べる"],["give","gave","given","与える"],
        ["take","took","taken","取る"],["write","wrote","written","書く"],["speak","spoke","spoken","話す"],
        ["break","broke","broken","こわす"],["choose","chose","chosen","選ぶ"],["drive","drove","driven","運転する"],
        ["ride","rode","ridden","乗る"],["rise","rose","risen","のぼる(自動詞)"],["fall","fell","fallen","落ちる"],
        ["know","knew","known","知る"],["grow","grew","grown","育つ"],["throw","threw","thrown","投げる"],
        ["fly","flew","flown","飛ぶ"],["draw","drew","drawn","描く・引く"],["begin","began","begun","始める"],
        ["drink","drank","drunk","飲む"],["sing","sang","sung","歌う"],["swim","swam","swum","泳ぐ"],
        ["ring","rang","rung","鳴る"],["wear","wore","worn","身につける"],["forget","forgot","forgotten","忘れる"],
        ["freeze","froze","frozen","凍る"],["steal","stole","stolen","盗む"],["show","showed","shown","見せる"],
        ["hide","hid","hidden","隠す"],["bite","bit","bitten","かむ"],["blow","blew","blown","吹く"]] },
  { g: "★ひっかけ", note: "受験で必ず狙われる3組。意味と自動詞・他動詞で区別する",
    v: [["lie","lay","lain","横になる(自動詞)"],["lay","laid","laid","〜を横たえる(他動詞)"],
        ["lie","lied","lied","うそをつく(規則変化)"],["rise","rose","risen","のぼる(自動詞)"],
        ["raise","raised","raised","〜を上げる(他動詞)"],["fall","fell","fallen","落ちる(自動詞)"],
        ["fell","felled","felled","〜を切り倒す(他動詞)"]] },
];

/** (b) 接辞と語根 — 覚える語数を何倍にもする道具 */
const WORD_PARTS = [
  { p: "un-",     k: "接頭", m: "〜でない", ex: ["unhappy", "unknown", "unable"] },
  { p: "in-/im-/ir-/il-", k: "接頭", m: "〜でない(後ろの音で形が変わる)", ex: ["impossible", "irregular", "illegal"] },
  { p: "dis-",    k: "接頭", m: "反対・離れる", ex: ["disagree", "disappear", "discover"] },
  { p: "re-",     k: "接頭", m: "再び・元へ", ex: ["return", "repeat", "recover"] },
  { p: "pre-",    k: "接頭", m: "前もって", ex: ["prepare", "predict", "prevent"] },
  { p: "pro-",    k: "接頭", m: "前へ", ex: ["progress", "produce", "promote"] },
  { p: "sub-",    k: "接頭", m: "下・副", ex: ["submarine", "subway", "subject"] },
  { p: "inter-",  k: "接頭", m: "あいだ", ex: ["international", "interact", "interview"] },
  { p: "trans-",  k: "接頭", m: "越えて・移す", ex: ["transport", "translate", "transfer"] },
  { p: "ex-",     k: "接頭", m: "外へ", ex: ["export", "expand", "exit"] },
  { p: "con-/com-", k: "接頭", m: "共に・すっかり", ex: ["connect", "combine", "complete"] },
  { p: "de-",     k: "接頭", m: "下へ・離れる・逆", ex: ["decrease", "destroy", "depart"] },
  { p: "bio-",    k: "接頭", m: "生命", ex: ["biology", "antibiotic", "biodiversity"] },
  { p: "spect",   k: "語根", m: "見る", ex: ["inspect", "respect", "spectator"] },
  { p: "port",    k: "語根", m: "運ぶ", ex: ["import", "transport", "portable"] },
  { p: "dict",    k: "語根", m: "言う", ex: ["predict", "dictionary", "contradict"] },
  { p: "duc/duct", k: "語根", m: "導く", ex: ["produce", "reduce", "conduct"] },
  { p: "ject",    k: "語根", m: "投げる", ex: ["project", "reject", "inject"] },
  { p: "scrib/script", k: "語根", m: "書く", ex: ["describe", "prescription", "manuscript"] },
  { p: "vert/vers", k: "語根", m: "回す・向ける", ex: ["convert", "reverse", "version"] },
  { p: "tain/ten", k: "語根", m: "保つ", ex: ["maintain", "contain", "continue"] },
  { p: "mit/miss", k: "語根", m: "送る", ex: ["submit", "permit", "mission"] },
  { p: "pos/pon", k: "語根", m: "置く", ex: ["compose", "expose", "postpone"] },
  { p: "struct",  k: "語根", m: "建てる・組む", ex: ["structure", "construct", "instruct"] },
  { p: "fac/fect", k: "語根", m: "作る・なす", ex: ["factory", "effect", "perfect"] },
  { p: "vis/vid", k: "語根", m: "見る", ex: ["vision", "evidence", "provide"] },
  { p: "sent/sens", k: "語根", m: "感じる", ex: ["sense", "consent", "sensitive"] },
  { p: "-tion/-sion", k: "接尾", m: "〜すること(名詞)", ex: ["action", "decision", "education"] },
  { p: "-ment",   k: "接尾", m: "〜すること・もの(名詞)", ex: ["movement", "treatment", "development"] },
  { p: "-ness",   k: "接尾", m: "〜さ(名詞)", ex: ["kindness", "illness", "darkness"] },
  { p: "-ity",    k: "接尾", m: "〜さ・性質(名詞)", ex: ["ability", "activity", "reality"] },
  { p: "-able/-ible", k: "接尾", m: "〜できる(形容詞)", ex: ["possible", "comfortable", "visible"] },
  { p: "-ous",    k: "接尾", m: "〜の多い(形容詞)", ex: ["dangerous", "famous", "various"] },
  { p: "-ive",    k: "接尾", m: "〜する性質の(形容詞)", ex: ["active", "creative", "effective"] },
  { p: "-ize",    k: "接尾", m: "〜化する(動詞)", ex: ["realize", "organize", "recognize"] },
  { p: "-ify",    k: "接尾", m: "〜にする(動詞)", ex: ["identify", "classify", "simplify"] },
  { p: "-ist",    k: "接尾", m: "〜する人", ex: ["scientist", "dentist", "specialist"] },
];

/** (c) 日本語話者だけがひっかかる語 */
const TRAP_WORDS = [
  { jp: "コンセント", ng: "consent", ok: "outlet / socket", note: "consent は「同意」。医療では重要語" },
  { jp: "マンション", ng: "mansion", ok: "apartment / condo", note: "mansion は大邸宅" },
  { jp: "クレーム", ng: "claim", ok: "complaint", note: "claim は「主張する」。苦情ではない" },
  { jp: "ナイーブ", ng: "naive", ok: "sensitive", note: "naive は「世間知らず」で、ほめ言葉ではない" },
  { jp: "テンションが高い", ng: "high tension", ok: "excited / energetic", note: "tension は緊張・張力" },
  { jp: "スマート(細い)", ng: "smart", ok: "slim", note: "smart は「賢い」" },
  { jp: "カンニング", ng: "cunning", ok: "cheating", note: "cunning は「ずる賢い」" },
  { jp: "ファイト!", ng: "Fight!", ok: "Good luck! / You can do it!", note: "Fight! は「けんかしろ」に聞こえる" },
  { jp: "マイペース", ng: "my pace", ok: "at my own pace", note: "" },
  { jp: "チャレンジする", ng: "challenge to ~", ok: "try / take on", note: "challenge は他動詞で「異議を唱える・挑む」" },
  { jp: "ノートパソコン", ng: "note PC", ok: "laptop", note: "" },
  { jp: "ペットボトル", ng: "pet bottle", ok: "plastic bottle", note: "" },
  { jp: "アルバイト", ng: "arbeit", ok: "part-time job", note: "" },
  { jp: "ホッチキス", ng: "hotchkiss", ok: "stapler", note: "" },
  { jp: "シャーペン", ng: "sharp pencil", ok: "mechanical pencil", note: "" },
  { jp: "ベビーカー", ng: "baby car", ok: "stroller", note: "" },
  { jp: "バイキング", ng: "viking", ok: "buffet", note: "" },
  { jp: "ワンピース", ng: "one piece", ok: "dress", note: "" },
  { jp: "ジェットコースター", ng: "jet coaster", ok: "roller coaster", note: "" },
  { jp: "ガソリンスタンド", ng: "gasoline stand", ok: "gas station", note: "" },
  { jp: "スキンシップ", ng: "skinship", ok: "physical affection", note: "" },
  { jp: "サービス(無料)", ng: "service", ok: "free / on the house", note: "" },
];

/** 受験頻出の多義語 — 「知っている意味」で読むと外れる語 */
const POLYSEMY = [
  { w: "mean",    m: ["意味する", "意地悪な", "平均の"] },
  { w: "book",    m: ["本", "予約する"] },
  { w: "last",    m: ["最後の", "続く", "この前の"] },
  { w: "run",     m: ["走る", "経営する", "流れる"] },
  { w: "matter",  m: ["問題", "重要である", "物質"] },
  { w: "fine",    m: ["元気な", "罰金", "細かい"] },
  { w: "present", m: ["現在の", "出席して", "贈り物", "提示する"] },
  { w: "fair",    m: ["公平な", "かなりの", "品評会", "色白の"] },
  { w: "content", m: ["中身", "満足して"] },
  { w: "object",  m: ["物体", "目的", "反対する"] },
  { w: "subject", m: ["科目", "主題", "〜を受けやすい", "従わせる"] },
  { w: "charge",  m: ["料金", "充電する", "責任", "告発する"] },
  { w: "order",   m: ["順序", "命令", "注文"] },
  { w: "issue",   m: ["問題", "発行する", "(雑誌の)号"] },
  { w: "address", m: ["住所", "演説", "対処する"] },
  { w: "observe", m: ["観察する", "述べる", "(規則を)守る"] },
  { w: "practice",m: ["練習", "慣習", "開業(医)"] },
  { w: "capital", m: ["首都", "資本", "大文字"] },
  { w: "article", m: ["記事", "品物", "冠詞"] },
  { w: "degree",  m: ["程度", "学位", "度"] },
  { w: "leave",   m: ["去る", "残す", "休暇"] },
  { w: "stand",   m: ["立つ", "我慢する", "立場"] },
];

/* ── ③ 文法:日本語話者【固有】のつまずき ───────────────────
   母語に無い区別は、放っておいても直りません。ここを名指しで潰します。 */

const GRAMMAR_TRAPS = [
  {
    id: "article", name: "a / the / 無冠詞", level: "中1〜", concept: "e1-meishi",
    ng: "I have dog.", ok: "I have a dog.",
    why: "日本語に冠詞がないので、そもそも意識に上りません。日本語話者の英作文で最も多い減点はここです。",
    rule: "①相手も分かっている1つ → the ②数えられる名詞が1つ、初めて出す → a/an ③複数か不可算で一般論 → 何もつけない",
    check: "名詞を書いたら毎回「これは初めて出す?相手は分かってる?数えられる?」の3つを見る",
  },
  {
    id: "countable", name: "数えられる/数えられない", level: "中1〜", concept: "e1-meishi",
    ng: "I got many informations. / He gave me an advice.", ok: "I got a lot of information. / He gave me some advice.",
    why: "日本語は数を区別しないので、英語で不可算になる語が分かりません。",
    rule: "information / advice / news / homework / furniture / equipment / progress / research は不可算。a も -s もつけない",
    check: "数えたいときは a piece of ~ を使う",
  },
  {
    id: "perfect", name: "現在完了と過去形", level: "中3〜", concept: "e3-kanryo",
    ng: "I have been to Kyoto last year.", ok: "I went to Kyoto last year.",
    why: "日本語の「〜した」が両方に対応してしまうため、区別する必要を感じません。",
    rule: "はっきりした過去の一点(yesterday / last ~ / ago / when I was ~)があれば【必ず過去形】。現在完了は「今とつながっている」ときだけ",
    check: "文の中に「いつ」があるか探す。あったら過去形",
  },
  {
    id: "vt", name: "自動詞と他動詞", level: "中3〜", concept: "eh-bunkei",
    ng: "discuss about it / marry with her / reach to the station / mention about it",
    ok: "discuss it / marry her / reach the station / mention it",
    why: "日本語では「〜について議論する」と助詞が入るので、英語でも前置詞を入れたくなります。",
    rule: "discuss / marry / reach / mention / enter / attend / approach / resemble / answer は【前置詞なし】でそのまま目的語をとる",
    check: "逆に、前置詞が要るもの:graduate from / apologize to / object to / listen to",
  },
  {
    id: "order", name: "語順(SOVではなくSVO)", level: "中1〜", concept: "eh-bunkei",
    ng: "I yesterday the book read.", ok: "I read the book yesterday.",
    why: "日本語は動詞が最後に来るので、英語でも修飾語を前に置きたくなります。",
    rule: "英語は【誰が → どうする → 何を】。時や場所はいちばん後ろ。「いつ・どこで」を先に言わない",
    check: "動詞が主語のすぐ後ろにあるか",
  },
  {
    id: "indirect", name: "間接疑問文で語順を戻す", level: "中3〜", concept: "e3-kansetsu",
    ng: "I don't know where does he live.", ok: "I don't know where he lives.",
    why: "疑問詞を見ると反射的に疑問文の語順にしてしまいます。",
    rule: "文の中に入った疑問文は【ふつうの語順】に戻す。do/does/did は消える",
    check: "疑問詞のあとが「主語＋動詞」になっているか",
  },
  {
    id: "subject", name: "主語を省略しない", level: "中1〜", concept: "e1-be",
    ng: "Is very hot today. / Think it is good.", ok: "It is very hot today. / I think it is good.",
    why: "日本語は主語を言わないのがふつうなので、英語でも落としてしまいます。",
    rule: "英語は主語が必須。天気・時間・距離は It、「〜がある」は There is/are",
    check: "すべての動詞に主語がついているか",
  },
  {
    id: "sv", name: "三単現の s", level: "中1〜", concept: "e1-3tan",
    ng: "He play tennis.", ok: "He plays tennis.",
    why: "日本語に主語による動詞の変化がないので、意識が向きません。中1で習うのに高3まで落とし続ける人が多い項目です。",
    rule: "主語が he/she/it(または3人称単数の名詞)で、現在の話なら動詞に s",
    check: "書き終わったら主語と動詞だけをもう一度見る",
  },
  {
    id: "notthink", name: "「〜ないと思う」の位置", level: "中2〜", concept: "e2-setsu",
    ng: "I think he will not come.", ok: "I don't think he will come.",
    why: "日本語は「来ないと思う」と後ろを否定しますが、英語は前を否定します。",
    rule: "think / believe / suppose / expect は【否定を前に出す】",
    check: "",
  },
  {
    id: "postmod", name: "うしろから修飾する", level: "中3〜", concept: "e3-kankei",
    ng: "(読めない) The dog running in the park is mine.",
    ok: "The dog / running in the park / is mine.(公園を走っている犬は、ぼくの犬だ)",
    why: "日本語は修飾語が【前】にしか来ません。英語は名詞の【後ろ】から長い説明がつきます。長文が読めない最大の原因はここです。",
    rule: "名詞のすぐ後ろに ing / ed / to / 前置詞 / 関係代名詞 が来たら、そこから後ろは全部その名詞の説明",
    check: "名詞を見つけたら、どこまでが説明かを / で区切ってから読む",
  },
  {
    id: "prep", name: "前置詞(in / on / at)", level: "中1〜", concept: "e1-meishi",
    ng: "in Monday / on 2026 / at Japan", ok: "on Monday / in 2026 / in Japan",
    why: "日本語の「に」が全部に対応してしまうためです。",
    rule: "時間:広い→in(年・月)/ 日→on / 一点→at。場所:広い→in / 面→on / 一点→at",
    check: "「広さ」で選ぶ。in > on > at の順に狭くなる",
  },
  {
    id: "make", name: "使役(make / let / have / get)", level: "高1〜", concept: "eh-bunkei",
    ng: "She made me to go.", ok: "She made me go. / She got me to go.",
    why: "to があるかないかが動詞ごとに決まっており、日本語からは推測できません。",
    rule: "make / let / have + 人 + 動詞の原形(to なし)。get だけ + to 動詞",
    check: "make / let / have を見たら to を消す",
  },
];

/* ── ④ 読む ───────────────────────────────────────────── */

/** つなぎ言葉(談話標識)— これが見えると、読まずに流れが分かる */
const DISCOURSE = [
  { k: "逆接(ここで話が変わる。設問になりやすい)", w: ["but", "however", "yet", "nevertheless", "although", "though", "despite", "in spite of", "on the contrary", "whereas", "while"] },
  { k: "因果(理由と結果)", w: ["because", "since", "as", "therefore", "thus", "hence", "so", "consequently", "as a result", "due to", "owing to"] },
  { k: "追加(同じ方向)", w: ["also", "moreover", "furthermore", "in addition", "besides", "what is more"] },
  { k: "例示(前の文の言い換え)", w: ["for example", "for instance", "such as", "namely", "in particular"] },
  { k: "対比", w: ["on the other hand", "in contrast", "unlike", "rather than", "instead"] },
  { k: "言い換え(前が難しければ、ここで簡単になる)", w: ["in other words", "that is", "that is to say", "put simply"] },
  { k: "結論(筆者の主張が出る)", w: ["in conclusion", "in short", "to sum up", "overall", "after all", "in the end"] },
];

/** 設問の型と、その解き方 */
const QUESTION_TYPES = [
  { t: "主旨・タイトル", how: "各段落の第1文だけを拾って並べる。全部に共通する話題が答え。細部の言い換えは、たいてい誤り選択肢" },
  { t: "指示語(it / this / that / they)", how: "直前を見る。ほとんどは【直前の文の名詞句】か【直前の文全体】。代入して意味が通るか確かめる" },
  { t: "言い換え(本文の内容と一致)", how: "選択肢の語が本文にそのまま出ていたら、むしろ疑う。正解はたいてい【別の語で言い換えられている】" },
  { t: "理由(Why ~?)", how: "because / since / as / due to を探す。無ければ、その文の直前直後に理由が置かれている" },
  { t: "空所補充", how: "空所の【前後のつなぎ言葉】を先に見る。逆接なら反対の内容、追加なら同じ方向の内容が入る" },
  { t: "図表・グラフ", how: "本文より先にグラフの【軸と単位】を読む。設問は「最も多い/増えた」など比較を聞くことがほとんど" },
  { t: "不要文の削除", how: "段落の話題からずれた1文を探す。話題語が出てこない文があやしい" },
];

const READING_RULES = [
  { n: "戻り読みをやめる", how: "1文を左から右へ1回で読む。分からなくても止まらず、段落の最後まで行ってから戻る", why: "戻り読みは理解を上げず、時間だけを倍にします" },
  { n: "かたまり(チャンク)で読む", how: "The dog / running in the park / is mine. のように、意味のかたまりで / を入れながら読む", why: "1語ずつ訳すと、名詞の後ろの長い説明で必ず迷子になります" },
  { n: "訳さない", how: "日本語に直さず、英語の順のまま意味を取る", why: "訳すと日本語の語順に組み替えることになり、時間が3倍かかります" },
  { n: "知らない語で止まらない", how: "前後から意味を推測して進む。品詞だけ分かれば十分なことが多い", why: "本番で全部の語を知っていることはありません" },
];

/* ── ⑤ 書く ───────────────────────────────────────────── */

const WRITING_STEPS = [
  {
    n: "① 和文和訳(いちばん大事)",
    what: "日本語を、英語にしやすいやさしい日本語に書き直す",
    ex: "「彼は口が堅い」→「彼は秘密を人に言わない」→ He doesn't tell others' secrets.",
    why: "日本語のまま訳そうとすると、難しい単語を探して手が止まります。先に日本語を崩すと、知っている語だけで書けます",
  },
  {
    n: "② 主語と動詞を決める",
    what: "「誰が」「どうする」を先に決めてから、あとを足す",
    ex: "「この本を読むと元気が出る」→ 主語 This book / 動詞 makes → This book makes me feel better.",
    why: "日本語は主語が消えるので、まずここを決めないと英語になりません",
  },
  {
    n: "③ 知っている形だけで書く",
    what: "自信のない構文を使わない。短い文を2つに分ける",
    ex: "関係代名詞に自信がなければ、文を切って and / so でつなぐ",
    why: "採点は【減点方式】です。難しい構文で1つ間違えるより、簡単な文で正確に書くほうが点は高くなります",
  },
  {
    n: "④ 見直しは4点だけ",
    what: "三単現の s / 冠詞 / 名詞の単複 / 時制",
    ex: "",
    why: "日本語話者の減点の大半がこの4つです。全部見直す時間がなくても、ここだけは見ます",
  },
];

/** 自由英作文の型 */
const ESSAY_FRAME = {
  name: "自由英作文の型(意見を書くとき)",
  steps: [
    "① 立場をはっきり書く … I think / I agree with ~ because there are two reasons.",
    "② 理由1 … First, ~ (理由) For example, ~ (具体例)",
    "③ 理由2 … Second, ~ (理由) In my case, ~ (自分の経験)",
    "④ まとめ … For these reasons, I think ~",
  ],
  note: "内容の面白さでは点は伸びません。【型どおりで、文法が正確】がいちばん点になります。理由は必ず2つ、具体例は必ず1つ入れること。",
};

/* ── ⑥ 受験(共通テスト)───────────────────────────────── */

const EXAM_ENGLISH = {
  structure: [
    { t: "リーディング", p: "100点", n: "全問読解。発音・アクセント・文法単独問題は出ない。制限時間80分に対し語数が多く、【速く読めるか】が点を決める" },
    { t: "リスニング", p: "100点", n: "配点がリーディングと同じ。前半は2回読み、後半は【1回読み】。音の力がそのまま点になる" },
  ],
  note: "以前のセンター試験は筆記200点・リスニング50点で、リスニングは全体の5分の1でした。今は【半分】です。" +
        "音をおろそかにすると、それだけで半分を失います。発音の練習は、受験でもいちばん割のいい投資です。",
  timing: [
    "リーディングは1問あたりの時間を先に決める。分からない問題は飛ばして戻る",
    "設問を先に読んでから本文に入る(何を探すかを決めてから読む)",
    "リスニングは、音が流れる前に選択肢に目を通す。読み上げ中にメモを取りすぎない",
  ],
};

/* ── ⑦ 会話 ───────────────────────────────────────────── */

/**
 * ★会話でいちばん大事な設計:【直す時間と、直さない時間を分ける】
 * 話している最中に文法を直されると、話す量が激減します。
 * 流暢さと正確さは同時に伸ばせないので、時間で分けます。
 */
const CONV_TOPICS = [
  { id: "pet",    name: "動物・ペットのこと", emoji: "🐾", lv: 1, q: ["Do you have any pets?", "What animal do you like the best? Why?", "What do you do for your pet every day?"] },
  { id: "school", name: "学校のこと",         emoji: "🏫", lv: 1, q: ["What subject do you like?", "What did you do at school today?", "Who do you eat lunch with?"] },
  { id: "food",   name: "食べもの",           emoji: "🍙", lv: 1, q: ["What did you have for breakfast?", "What food can you cook?", "What is your favorite food?"] },
  { id: "day",    name: "1日のこと",          emoji: "🕒", lv: 1, q: ["What time do you get up?", "What do you do after school?", "How do you go to school?"] },
  { id: "future", name: "しょうらいのこと",   emoji: "🌱", lv: 2, q: ["What do you want to be?", "What do you want to try next year?", "Where do you want to go someday?"] },
  { id: "opinion",name: "考えを言う",         emoji: "💭", lv: 3, q: ["Do you think students should have smartphones? Why?", "Which is better, living in a city or in the country?"] },
  { id: "vet",    name: "動物のお医者さんの話", emoji: "🩺", lv: 3, q: ["Why do you think animals get sick?", "How can we take care of animals better?"] },
  { id: "debate", name: "賛成・反対を言う",   emoji: "⚖️", lv: 4, q: ["Should zoos exist? What do you think?", "Is it better to study alone or with friends?"] },
];

/**
 * 4-3-2 法(Nation)— 同じ話を4分→3分→2分でくり返す。
 * 内容が同じなので、回を追うごとに語や文を探す時間が減り、
 * 流暢さ(speed)が上がることが確認されている。
 */
const FLUENCY_432 = {
  name: "4-3-2(同じ話を短くしていく)",
  how: ["同じ話を、まず【2分】で話す", "つぎに同じ話を【90秒】で", "最後に同じ話を【60秒】で"],
  why: "内容は同じなので、考える負担がありません。回を追うごとに「言い方を探す時間」が減り、口が動くようになります。中学生は4-3-2より短めの2分-90秒-60秒から始めます。",
};

/* ── レベル判定と記録 ─────────────────────────────────── */

function engState(S) {
  const e = (S.eng ||= {});
  e.pron ||= {};
  e.words ||= {};       // word -> FSRSの記憶状態
  e.conv ||= [];        // [{at, topic, turns, level}]
  e.log ||= [];         // [{at, kind}]
  return e;
}

/** 語をFSRSに載せる(意味・例文つき) */
function addWord(S, word, meaning, example = "", note = "") {
  const e = engState(S);
  const key = String(word || "").trim().toLowerCase();
  if (!key) return null;
  const w = (e.words[key] ||= { ...newMemState("w:" + key), word: key, meaning: "", example: "", note: "", addedAt: Date.now() });
  if (meaning) w.meaning = meaning;
  if (example) w.example = example;
  if (note) w.note = note;
  return w;
}

function reviewWord(S, word, grade, confidence) {
  const e = engState(S);
  const key = String(word || "").trim().toLowerCase();
  const w = e.words[key];
  if (!w) return null;
  return reviewConcept(w, grade, confidence, Date.now());
}

/** 今日出すべき単語(忘れかけている順) */
function dueWords(S, limit = 10) {
  const e = engState(S);
  const now = Date.now();
  return Object.values(e.words)
    .map((w) => ({ w, R: retrievability(w, now), due: w.due || 0 }))
    .filter((x) => !x.w.S || x.due <= now)
    .sort((a, b) => a.R - b.R || a.due - b.due)
    .slice(0, limit)
    .map((x) => ({ word: x.w.word, meaning: x.w.meaning, example: x.w.example, mastery: Math.round((x.w.mastery || 0) * 100) }));
}

function wordStats(S) {
  const e = engState(S);
  const all = Object.values(e.words);
  const known = all.filter((w) => (w.mastery || 0) >= 0.7).length;
  return { total: all.length, known, learning: all.length - known };
}

/**
 * 今どの層にいるかを推定する。
 * 「順に進む」のではなく「どこに重心を置くか」を決めるための目印。
 */
function englishLayer(S) {
  const grade = S.grade || "中1";
  const gi = GRADES.indexOf(grade);
  const engIds = CONCEPTS.filter((c) => c.s === "english").map((c) => c.id);
  const learned = engIds.filter((id) => (S.mem?.[id]?.mastery || 0) >= 0.6).length;
  const pron = PHONEMES.map((p) => pronAccuracy(S, p.id)).filter((x) => x != null);
  const pronOk = pron.length >= 5 && avg(pron) >= 0.8;
  const conv = (engState(S).conv || []).length;
  const words = wordStats(S).known;

  let n = 1;
  if (pronOk || conv >= 3) n = 2;
  if (n >= 2 && learned >= 12 && words >= 100) n = 3;
  if (n >= 3 && learned >= 20 && gi >= 3) n = 4;
  if (n >= 4 && gi >= 4) n = 5;
  // 中学生に「受験期」を出さない(学年による表示制御と揃える)
  if (gi <= 2) n = Math.min(n, 4);
  return { ...ENG_LAYERS[n - 1], learned, total: engIds.length, words, conv, pronOk };
}

function noteConversation(S, topic, turns, level) {
  const e = engState(S);
  e.conv.push({ at: Date.now(), topic: topic || "", turns: turns || 0, level: level || 1 });
  if (e.conv.length > 60) e.conv.shift();
  return e.conv.length;
}

/* ── AIに渡す状況とルール ───────────────────────────────── */

function englishStatusText(S) {
  const L = englishLayer(S);
  const w = wordStats(S);
  const weak = weakPhonemes(S, 3);
  const traps = weakGrammarTraps(S, 3);
  const lines = [
    `- いまの重心:【${L.n}. ${L.name}】${L.goal}`,
    `- 英語の概念:${L.total}項目のうち ${L.learned}項目が習得済み`,
    `- 覚えた単語:${w.known}語(登録 ${w.total}語)`,
    `- 英会話の回数:${L.conv}回`,
  ];
  if (weak.length) {
    lines.push(`- 音でいま弱いところ:${weak.map((p) => `${p.name}(${p.acc == null ? "未計測" : Math.round(p.acc * 100) + "%"})`).join(" / ")}`);
  }
  if (traps.length) lines.push(`- 文法で狙って直すところ:${traps.map((t) => t.name).join(" / ")}`);
  const due = dueWords(S, 6);
  if (due.length) lines.push(`- 今日出すべき単語:${due.map((d) => d.word).join(", ")}`);
  return lines.join("\n");
}

/** 直近で間違えた文法項目(概念の習得度から拾う) */
function weakGrammarTraps(S, limit = 3) {
  return GRAMMAR_TRAPS
    .map((t) => ({ ...t, mastery: t.concept ? (S.mem?.[t.concept]?.mastery ?? null) : null }))
    .filter((t) => t.mastery == null || t.mastery < 0.7)
    .slice(0, limit);
}

function englishPromptBlock(S) {
  const L = englishLayer(S);
  const weak = weakPhonemes(S, 3).map((p) => `${p.name}(${p.tip})`);
  const traps = weakGrammarTraps(S, 4).map((t) => `${t.name}:✕${t.ng} → ○${t.ok}`);
  const due = dueWords(S, 8).map((d) => d.word);
  const isJHS = GRADES.indexOf(S.grade || "中1") <= 2;

  return `
【英語の教え方】
現在の重心:${L.n}. ${L.name} — ${L.goal}
(理由:${L.why})

A. 会話のとき — 直す時間と直さない時間を【必ず分ける】
   1. 会話中は文法をその場で直さない。話が止まると、話す量そのものが減る。
   2. どうしても直したいときは「言い直して返す」だけにする(リキャスト)。
      例:本人「I go to zoo yesterday.」→ AI「Oh, you went to the zoo yesterday! What did you see?」
      「間違いだよ」と言わない。正しい形を自然に混ぜて返すだけ。
   3. 会話が終わったあとに、まとめて【2〜3点だけ】伝える。全部は言わない。
   4. 沙和さんの英語が短くても、内容で返す。長さを求めない。
   5. 英語で行き詰まったら日本語に切り替えてよい。黙らせるより、言えたほうがいい。

B. 発音を教えるとき
   1. **カタカナで書かない。** カタカナは間違った音を固定してしまう。
      口・舌・歯のどこがどう当たるかを、日本語で具体的に説明する。
   2. 日本語の音との【ちがい】から入る。「日本語のラ行は舌が上あごを叩くけど、Rはどこにもつけない」
   3. いま弱い音:${weak.length ? weak.join(" / ") : "まだ計測前"}
   4. 単語を新しく出すときは【音 → 意味 → 使い方】の順。意味より先に読み方を渡す。

C. 語彙を扱うとき
   - 単語だけを裸で覚えさせない。必ず【例文の中】で出す。文脈ごと覚えたほうが残る。
   - 今日出すべき単語(忘れかけている):${due.length ? due.join(", ") : "まだ登録なし"}
   - 沙和さんが知らない語に出会ったら、add_english_word で登録する。意味と例文を必ずつける。
   - 知らない語が続いたら、接辞と語根で崩せないか先に試す(un- / re- / -tion / spect / port など)。

D. 文法を直すとき — 日本語話者だけがひっかかる所を狙う
${traps.length ? traps.map((t) => `   ・${t}`).join("\n") : "   ・(記録がたまると、ここに本人の弱点が入ります)"}
   - 「なぜ日本語だとそうなってしまうのか」を必ずセットで説明する。
     理由が分かると、同じ間違いが減る。ルールだけだと減らない。

E. 読解を教えるとき
   - 訳させない。英語の順のまま意味を取らせる。
   - 名詞の後ろに ing / ed / to / 関係代名詞 が来たら、そこで / を入れて区切らせる。
     日本語には後置修飾がないので、ここが読めない最大の原因になる。
   - 戻り読みをさせない。分からなくても段落の最後まで行かせる。
   - つなぎ言葉(however / therefore / for example)を先に丸で囲ませる。流れが見える。

F. 英作文を教えるとき
   - いきなり英訳させない。まず【和文和訳】。日本語をやさしい日本語に崩させてから英語にする。
     例:「彼は口が堅い」→「彼は秘密を人に言わない」→ He doesn't tell others' secrets.
   - 難しい構文を使わせない。減点方式なので、簡単で正確なほうが点が高い。
   - 見直しは4点だけ:三単現のs / 冠詞 / 単複 / 時制。

G. 音読を毎回1回入れる
   - その日にやった英文を1つ、声に出して読ませる。黙読だけで終わらせない。
   - 読み上げボタン(お手本)を使ってから、まねさせる。

H. ${isJHS
    ? "**受験の話をしない。** いまは中学生です。「入試に出る」「共通テストでは」という言い方をしない。\n   代わりに「これが言えると、動物の動画が字幕なしで分かるようになる」のように、いま届く場所を見せる。"
    : "受験を意識してよい時期です。共通テストはリーディング100点・リスニング100点で、音の力が半分を占めることを、必要なときに伝える。"}`;
}
