/* =========================================================================
   stage.js — 学年段階と、その時々のUI

   ■ なぜ段階を分けるのか

   中1に「大学受験まであと1988日」と毎日見せることには害がある。

   ・英国の縦断研究(Lancet Child & Adolescent Health)では、中等教育期の
     学業プレッシャーの高さが、抑うつ症状と自傷のリスクを高め、その影響が
     成人期初期まで持続しうることが示されている。
   ・52研究のレビューでも、学業プレッシャーと不安・抑うつ・自殺念慮との
     正の関連が大半で確認されている。
   ・さらに、プレッシャーは自律性の感覚を損ない、内発的動機を「統制された
     動機」に置き換えてしまう。つまり、成績を上げるどころか下げる方向に働く。

   ■ ではどうするか — プレッシャーではなく「未来の自分とのつながり」

   Hershfield らの「未来自己連続性」研究では、いまの自分と未来の自分が
   心理的につながっていると感じられるほど、長期的な行動を取りやすくなる。
   思春期では、つまずきを「自分を決定づけるもの」ではなく「一時的で
   扱えるもの」と解釈できるようになり、抑うつ症状も低い。

   → 締切で急かすのではなく、未来の自分と手紙をやりとりする。
     カウントダウンは、それが現実になる学年まで出さない。
   ========================================================================= */

/* 学年ごとに「何を見せるか」 */
const STAGES = {
  "中1": {
    id: "explore", label: "たねまき期",
    theme: "sprout",
    tagline: "今は、好きなものを増やす時期",
    showExamCountdown: false,   // ★大学受験のカウントダウンは出さない
    showHighSchoolExam: false,
    showStrategy: false,        // 併願戦略
    showCost: false,            // 学費
    showHensa: false,           // 模試偏差値
    showAdmissionTypes: false,
    showRoadmapDetail: false,   // ロードマップは「今の学年」だけ
    horizon: "今学期",
    focus: ["毎日ちょっとだけ続ける", "わからないをそのままにしない", "好きな教科を見つける"],
    note: "中学1年生に受験の話を毎日見せることは、研究上むしろ逆効果です。今は土台づくりと、勉強を嫌いにならないことが最優先。",
  },
  "中2": {
    id: "build", label: "根をはる期",
    theme: "sprout",
    tagline: "土台が固まる、いちばん大事な年",
    showExamCountdown: false,
    showHighSchoolExam: false,
    showStrategy: false, showCost: false, showHensa: false,
    showAdmissionTypes: false, showRoadmapDetail: false,
    horizon: "今学期",
    focus: ["一次関数を確実に", "英語の文の形をつかむ", "内申は『提出物』から"],
    note: "中2は最もつまずきが出る学年。でもまだ受験を意識させる段階ではありません。今の単元を確実にすることが、そのまま将来につながります。",
  },
  "中3": {
    id: "hs-exam", label: "はじめての受験",
    theme: "sky",
    tagline: "高校受験。ここは現実の勝負どころ",
    showExamCountdown: false,   // 大学受験はまだ出さない
    showHighSchoolExam: true,   // 高校受験は出す
    showStrategy: false, showCost: false,
    showHensa: true,            // 高校受験の偏差値は必要
    showAdmissionTypes: false, showRoadmapDetail: true,
    horizon: "今年度",
    focus: ["中学範囲の穴を全部埋める", "内申点を確定させる", "理数に強い高校を選ぶ"],
    note: "高校受験は目の前の現実なので扱います。ただし大学受験のカウントダウンはまだ出しません。3年先の締切は、今の力になりません。",
  },
  "高1": {
    id: "foundation", label: "つみあげ期",
    theme: "mint",
    tagline: "高校の土台。ここが崩れると後が効かない",
    showExamCountdown: false,   // まだ「日数」では出さない
    showHighSchoolExam: false,
    showStrategy: false, showCost: true,   // 費用は早く知るほど選択肢が広がる
    showHensa: true, showAdmissionTypes: true, showRoadmapDetail: true,
    horizon: "今年度",
    focus: ["mol計算を落とさない", "二次関数を確実に", "評定平均は高1から全部が対象"],
    note: "進路の話を始める時期です。ただし残り日数のカウントダウンはまだ出しません。今は『何を積むか』であって『あと何日か』ではありません。",
  },
  "高2": {
    id: "decide", label: "しぼりこみ期",
    theme: "ink",
    tagline: "受験科目を固める、いちばん重い年",
    showExamCountdown: true,    // ここから出す
    showHighSchoolExam: false,
    showStrategy: true, showCost: true, showHensa: true,
    showAdmissionTypes: true, showRoadmapDetail: true,
    horizon: "受験まで",
    focus: ["受験科目のインプットを終える", "志望校を3〜5校に絞る", "模試で現在地を知る"],
    note: "高3は演習の年なので、知識を入れ終えるのは高2。ここからカウントダウンを表示します。",
  },
  "高3": {
    id: "final", label: "しあげ期",
    theme: "ink",
    tagline: "積んできたものを、出しきる年",
    showExamCountdown: true,
    showHighSchoolExam: false,
    showStrategy: true, showCost: true, showHensa: true,
    showAdmissionTypes: true, showRoadmapDetail: true,
    horizon: "本番まで",
    focus: ["過去問と時間配分", "理科2科目の完成", "出願戦略"],
    note: "",
  },
};

function stageOf(grade) { return STAGES[grade] || STAGES["中1"]; }

/* =========================================================================
   テーマ — 学年で好みが変わることを前提に
   自分で選べること自体が自律性の支援になる(自己決定理論)
   ========================================================================= */
const THEMES = {
  sprout: {
    name: "ふたば", emoji: "🌱", forStage: "中1〜中2",
    desc: "やわらかくて、あたたかい",
    v: { "--bg":"#fdfaf3", "--card":"#ffffff", "--ink":"#463a2e", "--ink2":"#7d6d5d",
         "--ink3":"#a89887", "--line":"#eee5d6", "--accent":"#6fae6b", "--accent-soft":"#eef7ed",
         "--green":"#5a9e57", "--amber":"#dda23f", "--red":"#d3705f", "--purple":"#a488c9",
         "--r":"18px", "--font":'"Hiragino Maru Gothic ProN","Hiragino Kaku Gothic ProN",sans-serif' },
  },
  sky: {
    name: "そら", emoji: "☁️", forStage: "中3",
    desc: "明るくて、まっすぐ",
    v: { "--bg":"#f4f9fd", "--card":"#ffffff", "--ink":"#22364a", "--ink2":"#5a7183",
         "--ink3":"#93a6b5", "--line":"#dfeaf3", "--accent":"#3d8fd4", "--accent-soft":"#e8f2fb",
         "--green":"#2fa37a", "--amber":"#e0921f", "--red":"#dc5b5b", "--purple":"#8b7cf6",
         "--r":"16px", "--font":'"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif' },
  },
  berry: {
    name: "ベリー", emoji: "🫐", forStage: "いつでも",
    desc: "かわいくて、元気が出る",
    v: { "--bg":"#fdf6fa", "--card":"#ffffff", "--ink":"#40293c", "--ink2":"#7b5f74",
         "--ink3":"#ab8fa3", "--line":"#f2e2ec", "--accent":"#d15a96", "--accent-soft":"#fdeef5",
         "--green":"#3fa882", "--amber":"#e09a2f", "--red":"#d9534f", "--purple":"#9a6fd4",
         "--r":"18px", "--font":'"Hiragino Maru Gothic ProN","Hiragino Kaku Gothic ProN",sans-serif' },
  },
  mint: {
    name: "ミント", emoji: "🌿", forStage: "高1",
    desc: "すっきりして、集中しやすい",
    v: { "--bg":"#f5faf8", "--card":"#ffffff", "--ink":"#223b35", "--ink2":"#54736b",
         "--ink3":"#8fa8a0", "--line":"#dceae5", "--accent":"#2f9b84", "--accent-soft":"#e6f5f1",
         "--green":"#2f9b84", "--amber":"#d99433", "--red":"#d05f5f", "--purple":"#7f7ac9",
         "--r":"14px", "--font":'"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif' },
  },
  ink: {
    name: "すみ", emoji: "🖋", forStage: "高2〜高3",
    desc: "落ち着いて、余計なものがない",
    v: { "--bg":"#f7f8fb", "--card":"#ffffff", "--ink":"#1c2333", "--ink2":"#5a6478",
         "--ink3":"#949cae", "--line":"#e6e9f0", "--accent":"#3d5afe", "--accent-soft":"#eef1ff",
         "--green":"#17a673", "--amber":"#e0921f", "--red":"#dc4b4b", "--purple":"#8b5cf6",
         "--r":"12px", "--font":'"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif' },
  },
  night: {
    name: "よる", emoji: "🌙", forStage: "いつでも",
    desc: "暗い部屋でも目が疲れない",
    v: { "--bg":"#151823", "--card":"#1e2231", "--ink":"#e8eaf0", "--ink2":"#a4abbd",
         "--ink3":"#6f7789", "--line":"#2c3244", "--accent":"#7b8cff", "--accent-soft":"#252b40",
         "--green":"#3fc79a", "--amber":"#e8ab4a", "--red":"#f0736f", "--purple":"#a78bfa",
         "--r":"14px", "--font":'"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif' },
  },
};

function applyTheme(id) {
  const t = THEMES[id] || THEMES.ink;
  const r = document.documentElement;
  for (const k in t.v) r.style.setProperty(k, t.v[k]);
  r.setAttribute("data-theme", id);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t.v["--bg"]);
}

/* =========================================================================
   長く付き合うための記録
   — 未来自己連続性(Hershfield):
     いまの自分と未来の自分がつながっていると感じられるほど、
     長期的な行動を取りやすく、つまずきを「一時的なもの」と解釈できる。
     締切で急かすより、これを育てるほうが本人のためになる。
   ========================================================================= */

const MILESTONES = [
  { days: 7,    emoji:"🌱", title:"はじめて1週間", msg:"1週間続いた。ここが一番むずかしいところだった。" },
  { days: 30,   emoji:"🌿", title:"1ヶ月",       msg:"1ヶ月続けられた。習慣になりかけている。" },
  { days: 100,  emoji:"💯", title:"100日",       msg:"100日。もうこれは、続けられる人だと言っていい。" },
  { days: 180,  emoji:"🍀", title:"半年",         msg:"半年前の自分に、いま何て言いたい?" },
  { days: 365,  emoji:"🎊", title:"1年",          msg:"1年。この1年でできるようになったことを、下に並べておいたよ。" },
  { days: 730,  emoji:"🌳", title:"2年",          msg:"2年。ずっと隣にいます。" },
  { days: 1095, emoji:"🏔", title:"3年",          msg:"3年。ここまで来た人は、そんなに多くない。" },
  { days: 1460, emoji:"⭐", title:"4年",          msg:"4年。長いあいだ、よく続けた。" },
  { days: 1825, emoji:"🌌", title:"5年",          msg:"5年。もうすぐ、あの日決めたところに着く。" },
  { days: 2190, emoji:"🎓", title:"6年",          msg:"6年。最初のころの自分に、見せてあげたい。" },
];

/** 使い始めてからの日数と、達成した節目 */
function journey(startedAt, seen = []) {
  if (!startedAt) return null;
  const days = Math.floor((Date.now() - startedAt) / 86400000);
  const reached = MILESTONES.filter((m) => days >= m.days);
  const next = MILESTONES.find((m) => days < m.days);
  const unseen = reached.filter((m) => !seen.includes(m.days));
  return { days, reached, next, unseen, daysToNext: next ? next.days - days : null };
}

/** 未来の自分への手紙のテンプレート(学年で変える) */
function letterPrompts(grade) {
  const base = [
    "1年後の自分に、いま伝えておきたいことは?",
    "いま、いちばんがんばっていることは?",
    "いま、いちばん苦手なことは?(1年後に読み返すと面白い)",
  ];
  const byStage = {
    "中1": ["いま好きなことは?", "1年後、どんな人になっていたい?"],
    "中2": ["いま夢中になっていることは?", "1年後の自分に、何を続けていてほしい?"],
    "中3": ["どんな高校生になりたい?", "受験のいま、どんな気持ち?"],
    "高1": ["高校生活で、やってみたいことは?", "1年後、何ができるようになっていたい?"],
    "高2": ["受験勉強で、いま一番不安なことは?", "1年後の自分に、何て声をかけたい?"],
    "高3": ["ここまで来た自分に、何て言いたい?", "大学に入ったら、何をしたい?"],
  }[grade] || [];
  return [...byStage, ...base];
}

/** 1年前と比べた成長 */
function yearOverYear(memStates, grades) {
  const yearAgo = Date.now() - 365 * 86400000;
  const now = Object.values(memStates || {}).filter((m) => m.S > 0);
  const then = now.filter((m) => m.last && m.last < yearAgo);
  const mastered = now.filter((m) => m.mastery >= 0.7).length;
  const gradeCount = (grades || []).length;
  return {
    conceptsNow: now.length,
    conceptsGained: now.length - then.length,
    mastered,
    tests: gradeCount,
    hasHistory: then.length > 0 || now.length > 0,
  };
}
