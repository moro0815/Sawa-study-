/* =========================================================================
   careers.js — 進路(夢)の管理

   ■ なぜこのモジュールが必要か

   このアプリを「獣医学部専用」に作ることには、発達心理学上の実害がある。

   1) Gottfredson の「囲い込み(circumscription)」理論
      子どもは 3〜13歳にかけて、社会的な影響から職業の選択肢を次々に
      「消していく」。14歳以降になってようやく、内面的な自己に基づいて
      選び直す段階に入る。12歳はちょうどその手前。
      → ひとつの職業だけを前提にしたシステムは、この「消す」働きを強めてしまう。

   2) Marcia の「早期完了(identity foreclosure)」
      探索を経ないまま早くコミットした状態。周囲が肯定し続けている間は
      安定して見えるが、その支えが崩れた瞬間に脆くなることが知られている。
      → アプリが「獣医」を毎日肯定し続けることは、まさにその「支え」になる。

   3) Krumboltz の「計画された偶発性」
      キャリアの大半は予期しない出来事で決まる。重要なのは目標の固定ではなく、
      好奇心・柔軟性・楽観性・行動力。「迷っていること」はむしろ望ましい。

   4) 縦断研究では、思春期の約3分の1が志望を大きく変える。
      約20%は「決まっていない」状態にある。変わるのは異常ではなく標準。

   ■ このモジュールの設計方針
      ・今の夢(獣医師)は全力で応援する。薄めない。
      ・同時に、夢は変数として扱い、いつでも変えられるようにする。
      ・変えたときに「積み上げが無駄になる」不安を、数字で否定する。
      ・過去の夢は消さず、記録として残す(変わったことは成長であって失敗ではない)。
      ・探索は促すが、強制しない(自律性支援)。
   ========================================================================= */

/* 教科の重み(0〜1)。その進路でどれだけ効くか */
const CAREERS = [
  /* ── 動物・生命に関わる道(今の夢の周辺) ── */
  {
    id: "vet", name: "獣医師", emoji: "🩺", field: "動物・医療",
    faculty: "獣医学部・獣医学科(6年制)", license: "獣医師国家試験",
    w: { math:1.0, science:1.0, english:1.0, japanese:0.7, social:0.5, info:0.4, skill:0.3 },
    key: ["化学", "生物"],
    desc: "動物の病気を診断し治療する。小動物臨床のほか、産業動物、公務員(家畜防疫・食品衛生)、研究、製薬など進路は広い。",
    hs: "理科は化学+生物が主流。全国17校しかなく募集人数も少ない。",
    hasData: true,
  },
  {
    id: "med", name: "医師", emoji: "🏥", field: "人の医療",
    faculty: "医学部・医学科(6年制)", license: "医師国家試験",
    w: { math:1.0, science:1.0, english:1.0, japanese:0.8, social:0.5, info:0.4, skill:0.3 },
    key: ["化学", "生物または物理"],
    desc: "人の病気を診る。獣医学と学ぶ内容は大きく重なる(解剖・生理・薬理・病理)。難易度は獣医学部より高いことが多い。",
    hs: "獣医学部と受験科目がほぼ同じ。志望を移しても勉強はほぼそのまま活きる。",
  },
  {
    id: "pharm", name: "薬剤師", emoji: "💊", field: "薬・化学",
    faculty: "薬学部(6年制)", license: "薬剤師国家試験",
    w: { math:0.9, science:1.0, english:0.9, japanese:0.7, social:0.4, info:0.4, skill:0.3 },
    key: ["化学"],
    desc: "薬の専門家。動物病院で使う薬をつくる側、動物用医薬品の開発という道もある。",
    hs: "化学の比重が全教科の中で最も大きい。",
  },
  {
    id: "nurse", name: "看護師", emoji: "💉", field: "人の医療",
    faculty: "看護学部・看護学科(4年制)", license: "看護師国家試験",
    w: { math:0.7, science:0.9, english:0.8, japanese:0.8, social:0.5, info:0.4, skill:0.4 },
    key: ["生物", "化学基礎"],
    desc: "患者に最も近いところで支える。人の体のしくみを深く学ぶ点は獣医学と共通。",
    hs: "理科は生物基礎+化学基礎で受験できる大学も多く、負担は比較的軽い。",
  },
  {
    id: "animalnurse", name: "愛玩動物看護師", emoji: "🐕‍🦺", field: "動物・医療",
    faculty: "動物看護系の大学・専門学校(3〜4年制)", license: "愛玩動物看護師(2022年〜の国家資格)",
    w: { math:0.6, science:0.9, english:0.6, japanese:0.7, social:0.4, info:0.3, skill:0.4 },
    key: ["生物"],
    desc: "2022年に国家資格になったばかりの職業。獣医師とチームで動物を支える。獣医師より入りやすく、動物に毎日関われる。",
    hs: "獣医師を目指す中で「やっぱり動物の近くにいたい」と思ったときの現実的な選択肢。",
  },
  {
    id: "biores", name: "生命科学の研究者", emoji: "🧬", field: "研究",
    faculty: "理学部生物学科・農学部・生命科学部", license: "(大学院進学が一般的)",
    w: { math:1.0, science:1.0, english:1.0, japanese:0.6, social:0.3, info:0.7, skill:0.2 },
    key: ["生物", "化学"],
    desc: "遺伝子・細胞・免疫などを研究する。動物の病気の根本を解き明かす仕事。英語の論文を読み書きする力が決定的。",
    hs: "獣医学部と重なる科目が多い。研究に興味が向いたときの自然な移行先。",
  },
  {
    id: "agri", name: "農学・畜産", emoji: "🌾", field: "食と環境",
    faculty: "農学部・畜産学部", license: "(家畜人工授精師など)",
    w: { math:0.9, science:1.0, english:0.8, japanese:0.6, social:0.6, info:0.5, skill:0.3 },
    key: ["生物", "化学"],
    desc: "食料生産と動物の飼育を支える。獣医学部と同じキャンパスにあることも多く、途中で行き来しやすい。",
    hs: "帯広畜産大や北里大など、獣医学科と併設されている大学が多い。",
  },
  {
    id: "marine", name: "水産・海洋生物", emoji: "🐋", field: "生物・環境",
    faculty: "水産学部・海洋学部", license: "—",
    w: { math:0.9, science:1.0, english:0.8, japanese:0.6, social:0.5, info:0.5, skill:0.3 },
    key: ["生物", "化学"],
    desc: "魚や海の生きものを研究する。水族館の飼育やイルカ・クジラの研究もこの道。",
    hs: "生物と化学の土台は獣医学部とほぼ同じ。",
  },
  {
    id: "zoo", name: "動物園・水族館の飼育員", emoji: "🦁", field: "動物",
    faculty: "農学部・畜産系・専門学校など", license: "—",
    w: { math:0.6, science:0.9, english:0.7, japanese:0.7, social:0.6, info:0.3, skill:0.4 },
    key: ["生物"],
    desc: "野生動物を毎日世話し、繁殖や展示を担う。狭き門だが、動物と最も近い距離で働ける職業のひとつ。",
    hs: "採用が少ないため、農学・畜産系で学びつつ実習経験を積むのが現実的。",
  },
  {
    id: "wildlife", name: "野生動物保護・環境保全", emoji: "🌍", field: "環境",
    faculty: "農学部・環境学部・理学部", license: "(学芸員・公務員など)",
    w: { math:0.8, science:1.0, english:0.9, japanese:0.7, social:0.8, info:0.5, skill:0.3 },
    key: ["生物"],
    desc: "絶滅危惧種や生態系を守る。国際機関やNGO、自治体で働く道。獣医師免許を持って野生動物医療に進む人もいる。",
    hs: "社会(法律・国際)と英語の比重が他の生物系より大きい。",
  },
  {
    id: "food", name: "食品・栄養", emoji: "🍎", field: "食と健康",
    faculty: "農学部・栄養学部", license: "管理栄養士など",
    w: { math:0.7, science:1.0, english:0.7, japanese:0.7, social:0.5, info:0.4, skill:0.6 },
    key: ["化学", "生物"],
    desc: "食の安全と栄養を扱う。動物の栄養管理(ペットフード開発など)もこの分野。",
    hs: "家庭科の食生活分野が直接つながる珍しい進路。",
  },
  {
    id: "biotech", name: "バイオ・製薬企業", emoji: "🔬", field: "研究・企業",
    faculty: "理学部・農学部・薬学部・工学部", license: "—",
    w: { math:1.0, science:1.0, english:1.0, japanese:0.6, social:0.4, info:0.8, skill:0.2 },
    key: ["化学", "生物"],
    desc: "新しい薬や検査技術をつくる。動物用医薬品の開発は獣医学の知識がそのまま活きる。",
    hs: "情報(データ解析)の重要度が近年急上昇している分野。",
  },

  /* ── まったく違う方向 ── */
  {
    id: "engineer", name: "エンジニア・情報", emoji: "💻", field: "技術",
    faculty: "工学部・情報学部", license: "—",
    w: { math:1.0, science:0.9, english:0.9, japanese:0.5, social:0.3, info:1.0, skill:0.4 },
    key: ["数学", "物理", "情報"],
    desc: "ソフトウェアや機械をつくる。動物の健康を測るセンサー、AI診断など、動物と技術をつなぐ仕事も増えている。",
    hs: "理科は物理の比重が大きくなる。数学と情報が中心。",
  },
  {
    id: "teacher", name: "教員", emoji: "📚", field: "教育",
    faculty: "教育学部(または一般学部+教職課程)", license: "教員免許",
    w: { math:0.7, science:0.7, english:0.7, japanese:0.9, social:0.8, info:0.4, skill:0.6 },
    key: ["教える教科による"],
    desc: "理科の先生になれば、生きものの面白さを次の世代に伝えられる。どの学部からでも教職課程で目指せる。",
    hs: "どの学部に進んでも取れるので、進路を狭めない選択肢。",
  },
  {
    id: "psych", name: "心理職", emoji: "🧠", field: "人の心",
    faculty: "心理学部・文学部心理学科", license: "公認心理師(大学院まで必要)",
    w: { math:0.7, science:0.7, english:0.8, japanese:1.0, social:0.8, info:0.6, skill:0.3 },
    key: ["国語", "統計(数学)"],
    desc: "人の心を支える。アニマルセラピーなど、動物と人の関係を扱う分野もある。",
    hs: "意外にも統計(数学)を使う。国語の読解力が最も効く。",
  },
  {
    id: "law", name: "法律・行政", emoji: "⚖️", field: "社会",
    faculty: "法学部", license: "司法試験・公務員試験など",
    w: { math:0.6, science:0.4, english:0.8, japanese:1.0, social:1.0, info:0.4, skill:0.3 },
    key: ["国語", "社会"],
    desc: "動物愛護管理法をつくる・運用するのは行政の仕事。動物を守るしくみ自体を変えられる道。",
    hs: "文系。国語と社会が中心になり、理科の比重は下がる。",
  },
  {
    id: "design", name: "デザイン・芸術", emoji: "🎨", field: "表現",
    faculty: "美術大学・芸術学部", license: "—",
    w: { math:0.4, science:0.4, english:0.6, japanese:0.7, social:0.5, info:0.6, skill:1.0 },
    key: ["実技", "美術"],
    desc: "動物の絵本作家、医学・生物のイラストレーター(サイエンスイラスト)という道もある。",
    hs: "実技試験の比重が大きく、他の進路と準備がかなり違う。早めに知っておく価値がある。",
  },
  {
    id: "global", name: "国際・語学", emoji: "🌏", field: "国際",
    faculty: "国際学部・外国語学部", license: "—",
    w: { math:0.6, science:0.4, english:1.0, japanese:0.9, social:1.0, info:0.4, skill:0.3 },
    key: ["英語", "社会"],
    desc: "国際機関で動物福祉や食料問題に関わる道。英語が武器になる。",
    hs: "英語の比重が最大。理科の負担は軽い。",
  },
  {
    id: "undecided", name: "まだ決めていない", emoji: "🌱", field: "探索中",
    faculty: "—", license: "—",
    w: { math:0.9, science:0.9, english:1.0, japanese:0.8, social:0.7, info:0.6, skill:0.4 },
    key: ["主要5教科をまんべんなく"],
    desc: "決まっていないのは、まったく悪いことではありません。研究では、思春期に迷っている状態(モラトリアム)は健全な発達の一部とされています。むしろ早く決めすぎるほうがリスクがあります。",
    hs: "決めていない時期は、どの道にも進める『つぶしの効く』教科を厚くしておくのが最善の戦略です。主要5教科をまんべんなく。",
    isNeutral: true,
  },
];

const CAREER_MAP = Object.fromEntries(CAREERS.map((c) => [c.id, c]));
const DEFAULT_CAREER = "vet";

/* ---------------------------------------------------------------
   ★積み上げは無駄にならない — 転用率の計算

   志望を変えたときに最も大きい不安は
   「今までの勉強が無駄になるのでは」というもの。
   実際にはほとんど無駄にならない。それを数字で示す。
   --------------------------------------------------------------- */

/** 習得済みの概念のうち、進路 X にも活きる割合 */
function transferRate(memStates, careerId) {
  const c = CAREER_MAP[careerId];
  if (!c) return null;
  let total = 0, useful = 0;
  for (const id in memStates) {
    const st = memStates[id];
    if (!st || st.S === 0) continue;
    const con = CONCEPT_MAP[id];
    if (!con) continue;
    const weight = st.mastery;            // 習得度で重みづけ
    total += weight;
    useful += weight * (c.w[con.s] ?? 0.5);
  }
  return total ? useful / total : null;
}

/** 現在の志望から見た、他の進路への転用率一覧 */
function transferMap(memStates, fromCareerId) {
  return CAREERS.filter((c) => c.id !== fromCareerId && !c.isNeutral).map((c) => ({
    career: c,
    rate: transferRate(memStates, c.id),
  })).sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
}

/** 進路Aから進路Bへ移るとき、追加で厚くする必要がある教科 */
function subjectDelta(fromId, toId) {
  const a = CAREER_MAP[fromId], b = CAREER_MAP[toId];
  if (!a || !b) return [];
  return Object.keys(SUBJECTS).map((s) => ({
    subject: s, name: SUBJECTS[s].name, emoji: SUBJECTS[s].emoji,
    from: a.w[s] ?? 0.5, to: b.w[s] ?? 0.5, diff: (b.w[s] ?? 0.5) - (a.w[s] ?? 0.5),
  })).filter((x) => Math.abs(x.diff) >= 0.15).sort((a2, b2) => b2.diff - a2.diff);
}

/* ---------------------------------------------------------------
   夢の記録 — 変わったことを「成長」として残す
   --------------------------------------------------------------- */

/**
 * 夢が変わったときに返すメッセージ。
 * 研究にもとづき、変化を肯定的に扱う。責めない、疑わない、比べない。
 */
function dreamChangeMessage(fromId, toId, memStates) {
  const from = CAREER_MAP[fromId], to = CAREER_MAP[toId];
  if (!from || !to) return null;
  const rate = transferRate(memStates, toId);
  const delta = subjectDelta(fromId, toId);
  const up = delta.filter((d) => d.diff > 0);
  const down = delta.filter((d) => d.diff < 0);

  return {
    from, to, rate,
    headline: `${from.name} → ${to.name}`,
    // 変化そのものへの肯定
    affirm:
      "志望が変わるのは、成長の証拠です。縦断研究では、思春期の約3分の1が志望を大きく変えます。" +
      "むしろ、探索をせずに早く決めすぎるほうが、あとで脆くなることが知られています(アイデンティティの早期完了)。" +
      "変えたことを、誰にも謝る必要はありません。",
    // 積み上げは無駄にならない(数字は正直に。低くても嘘はつかない)
    carry: rate == null
      ? `主要教科の土台は、ほとんどの進路で共通しています。ゼロからやり直しにはなりません。`
      : rate >= 0.8
      ? `これまで積み上げた学習のうち、およそ ${Math.round(rate * 100)}% は ${to.name} にもそのまま活きます。ほとんど地続きの道です。`
      : rate >= 0.6
      ? `これまで積み上げた学習のうち、およそ ${Math.round(rate * 100)}% は ${to.name} にも活きます。ゼロからやり直しではありません。`
      : `これまで積み上げた学習のうち、およそ ${Math.round(rate * 100)}% が ${to.name} でも直接使えます。` +
        `教科の重なりは他の道より小さめですが、それでも半分近くは残ります。` +
        `そして何より、「わからないことを分解して考える力」「間違いから直す力」は教科に関係なく残ります。これは数字に出ませんが、いちばん大きい持ち物です。`,
    up, down,
    // 前の夢の扱い
    keepPast: `「${from.name}になりたい」と思っていた時間は消えません。その気持ちで積み上げたものが、今の土台になっています。記録として残しておきます。`,
  };
}

/* ---------------------------------------------------------------
   探索のうながし(強制しない)
   --------------------------------------------------------------- */
const EXPLORATION_PROMPTS = [
  { q: "動物のどんなところが好き?", why: "「動物が好き」の中身によって、向いている道は変わります。世話をするのが好きなのか、体のしくみを知るのが好きなのか、守るしくみを作りたいのか。" },
  { q: "獣医さんの、どの仕事が一番やってみたい?", why: "手術・診断・予防・研究・行政。同じ獣医師でも全然違う仕事です。" },
  { q: "動物以外で、時間を忘れてやってしまうことは?", why: "キャリア研究では、予期しない出会いが進路を決めることが多いとされています(計画された偶発性)。" },
  { q: "学校の教科で、意外と面白いと思ったものは?", why: "興味は「触れた回数」で育ちます。今は退屈でも、あとから化けることがあります。" },
  { q: "もし勉強も成績も関係なかったら、何をやってみたい?", why: "制約を外して考えると、本当の関心が見えることがあります。" },
  { q: "最近『すごい』と思った人は?どこがすごかった?", why: "憧れの中身を言葉にすると、自分が何を大事にしているかが見えます。" },
];

/** 志望に応じた教科の重み(限界効用分析などで使う) */
function careerWeights(careerId) {
  return (CAREER_MAP[careerId] || CAREER_MAP[DEFAULT_CAREER]).w;
}

/** 「つぶしが効く」度合い — どの進路にも共通して効く教科ほど高い */
function versatility() {
  const active = CAREERS.filter((c) => !c.isNeutral);
  return Object.keys(SUBJECTS).map((s) => {
    const avg = active.reduce((a, c) => a + (c.w[s] ?? 0.5), 0) / active.length;
    return { subject: s, name: SUBJECTS[s].name, emoji: SUBJECTS[s].emoji, score: avg };
  }).sort((a, b) => b.score - a.score);
}
