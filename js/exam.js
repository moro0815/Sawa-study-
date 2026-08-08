/* =========================================================================
   exam.js — 志望校データ・成績評価・6年ロードマップ

   ※偏差値・共通テスト得点率は 2026年度入試の一般的な公表値をもとにした「目安」。
     実際の出願判断は必ず河合塾・駿台・ベネッセ等の最新資料で確認してください。
   ========================================================================= */

/* 全国17校の獣医学部・獣医学科 */
const VET_SCHOOLS = [
  // 国公立 11校
  { id:"todai",   name:"東京大学",           faculty:"農学部 獣医学課程", type:"国立", pref:"東京",   hensa:67.5, kyotsu:90, note:"進学振分けを経る。実質最難関" },
  { id:"hokudai", name:"北海道大学",         faculty:"獣医学部",         type:"国立", pref:"北海道", hensa:65.0, kyotsu:82, note:"国立唯一の独立した獣医学部(1952年設置)" },
  { id:"noukou",  name:"東京農工大学",       faculty:"農学部 共同獣医学科", type:"国立", pref:"東京", hensa:65.0, kyotsu:80, note:"岩手大と共同獣医学課程" },
  { id:"osakakou",name:"大阪公立大学",       faculty:"獣医学部",         type:"公立", pref:"大阪",   hensa:62.5, kyotsu:79, note:"2022年に獣医学部として再編" },
  { id:"gifu",    name:"岐阜大学",           faculty:"応用生物科学部 共同獣医学科", type:"国立", pref:"岐阜", hensa:62.5, kyotsu:78, note:"鳥取大と共同課程" },
  { id:"tottori", name:"鳥取大学",           faculty:"農学部 共同獣医学科", type:"国立", pref:"鳥取", hensa:60.0, kyotsu:76, note:"岐阜大と共同課程" },
  { id:"kagoshima",name:"鹿児島大学",        faculty:"共同獣医学部",     type:"国立", pref:"鹿児島", hensa:60.0, kyotsu:76, note:"山口大と共同獣医学部" },
  { id:"yamaguchi",name:"山口大学",          faculty:"共同獣医学部",     type:"国立", pref:"山口",   hensa:60.0, kyotsu:75, note:"鹿児島大と共同獣医学部" },
  { id:"miyazaki",name:"宮崎大学",           faculty:"農学部 獣医学科",   type:"国立", pref:"宮崎",   hensa:60.0, kyotsu:75, note:"産業動物臨床に強い" },
  { id:"iwate",   name:"岩手大学",           faculty:"農学部 共同獣医学科", type:"国立", pref:"岩手", hensa:57.5, kyotsu:73, note:"東京農工大と共同課程" },
  { id:"obihiro", name:"帯広畜産大学",       faculty:"畜産学部 獣医学課程", type:"国立", pref:"北海道", hensa:57.5, kyotsu:72, note:"大動物・産業動物に強み" },
  // 私立 6校
  { id:"nvlu",    name:"日本獣医生命科学大学",faculty:"獣医学部 獣医学科", type:"私立", pref:"東京",   hensa:62.5, kyotsu:null, note:"私立最難関。小動物臨床に強い" },
  { id:"azabu",   name:"麻布大学",           faculty:"獣医学部 獣医学科", type:"私立", pref:"神奈川", hensa:60.0, kyotsu:null, note:"歴史が長く付属病院が充実" },
  { id:"kitasato",name:"北里大学",           faculty:"獣医学部 獣医学科", type:"私立", pref:"青森",   hensa:57.5, kyotsu:null, note:"十和田キャンパス。大動物実習が豊富" },
  { id:"nihon",   name:"日本大学",           faculty:"生物資源科学部 獣医学科", type:"私立", pref:"神奈川", hensa:57.5, kyotsu:null, note:"総合大学の強み" },
  { id:"rakuno",  name:"酪農学園大学",       faculty:"獣医学群 獣医学類", type:"私立", pref:"北海道", hensa:55.0, kyotsu:null, note:"酪農・産業動物に特化した実習環境" },
  { id:"ous",     name:"岡山理科大学",       faculty:"獣医学部 獣医学科", type:"私立", pref:"愛媛",   hensa:52.5, kyotsu:null, note:"2018年開設。今治キャンパス" },
];

/* 共通テスト(2025年度〜 新課程):国公立獣医は原則 6教科8科目 */
const KYOTSU_SUBJECTS = [
  { id:"kokugo",  name:"国語",            score:200, note:"2025年度から試験時間90分" },
  { id:"math1",   name:"数学I・A",        score:100 },
  { id:"math2",   name:"数学II・B・C",    score:100, note:"新課程でCが追加" },
  { id:"eng-r",   name:"英語(リーディング)", score:100 },
  { id:"eng-l",   name:"英語(リスニング)",  score:100 },
  { id:"sci1",    name:"理科①(化学 等)",  score:100, note:"獣医は化学必須の大学が多い" },
  { id:"sci2",    name:"理科②(生物 等)",  score:100, note:"獣医は生物選択が主流" },
  { id:"shakai",  name:"地理歴史・公民",   score:100 },
  { id:"joho",    name:"情報I",           score:100, note:"2025年度入試から新設。全国立大が利用" },
];

/* 中学の評定:9教科 × 5段階 = 45点満点(3観点で評価) */
const NAISHIN_SUBJECTS = [
  { id:"kokugo", name:"国語", s:"japanese" }, { id:"shakai", name:"社会", s:"social" },
  { id:"suugaku",name:"数学", s:"math" },     { id:"rika",   name:"理科", s:"science" },
  { id:"eigo",   name:"英語", s:"english" },  { id:"ongaku", name:"音楽", s:"skill" },
  { id:"bijutsu",name:"美術", s:"skill" },    { id:"hotai",  name:"保健体育", s:"skill" },
  { id:"gika",   name:"技術・家庭", s:"skill" },
];

/* 3観点(平成29年改訂 学習指導要領) */
const VIEWPOINTS = [
  { id:"chishiki", name:"知識・技能", hint:"テストの基本問題・用語・計算の正確さ" },
  { id:"shikou",   name:"思考・判断・表現", hint:"応用問題・記述・発表・レポート" },
  { id:"shutai",   name:"主体的に学習に取り組む態度", hint:"提出物・振り返り・授業での取り組み" },
];

/* ---------- 6年ロードマップ(獣医学部から逆算) ---------- */
const ROADMAP = [
  { grade:"中1", theme:"土台を1つも欠けさせない",
    goals:["正負の数〜文字式を完全に(ここが崩れると高校数学まで全部響く)","理科の生物分野を『好き』のまま伸ばす","英語は音と語彙。単語1200語を目標","毎日15分でも机に向かう習慣"],
    why:"中1の内容は、高3までの全単元の根に位置している。ここの穴は6年間ずっと足を引っ張る。" },
  { grade:"中2", theme:"つまずきが出る学年。前提診断をフル活用",
    goals:["一次関数(高校数学の関数の入口)","化学変化と原子・分子","消化・呼吸・循環 ← 獣医の直接の土台","英語:不定詞・動名詞・比較","内申点を意識し始める(実技4教科も)"],
    why:"中2は最も脱落が起きる学年。数学は一次関数、英語は不定詞で差がつく。" },
  { grade:"中3", theme:"高校受験と、高校生物への橋渡し",
    goals:["二次方程式・三平方の定理・相似","遺伝の規則性 ← 高校生物へ直結","現在完了・関係代名詞","志望高校の決定(理系に強い進学校を優先)","内申点を確定させる"],
    why:"獣医学部を目指すなら、高校選びの時点で理数のカリキュラムが厚い学校が有利。" },
  { grade:"高1", theme:"数I・A と化学基礎・生物基礎を落とさない",
    goals:["二次関数(高校数学最大の山の1つ)","場合の数と確率","化学基礎のmol計算 ← ここで脱落者が急増","生物基礎:恒常性・免疫・腎臓","英語:5文型と時制の再整理"],
    why:"mol計算と二次関数は、ここでつまずくと高2以降が積み上がらない。" },
  { grade:"高2", theme:"受験科目を固める最重要学年",
    goals:["数II・B(微積・三角関数・数列)","化学:理論分野の完成","生物:遺伝子発現・発生","英語:長文読解に入る","模試で偏差値の現在地を把握","志望校を3〜5校に絞る"],
    why:"高3は演習の年。知識のインプットは高2で終える設計が現実的。" },
  { grade:"高3", theme:"演習と共通テスト対策",
    goals:["共通テスト6教科8科目(情報Iを含む)","二次試験の記述対策","理科2科目の完成度を上げる","過去問演習と時間配分","出願戦略(国公立前期・後期・私立併願)"],
    why:"獣医学部は全国17校しかなく、募集人数も少ない。戦略が合否を分ける。" },
];

/* ---------- 成績の評価ロジック ---------- */

/** 定期テスト:平均点との差から相対的な立ち位置を推定 */
function evaluateTest(score, average, max = 100) {
  const diff = score - average;
  // 定期テストの標準偏差はおおむね平均の 0.18〜0.22 倍。ここでは 0.2 と仮定
  const sd = Math.max(8, average * 0.2);
  const z = diff / sd;
  const estHensa = 50 + z * 10;
  let band, comment;
  if (z >= 1.5)      { band = "とても良い"; comment = "上位1割前後。この教科は武器にできる"; }
  else if (z >= 0.5) { band = "良い";       comment = "平均より確実に上。得意を伸ばす段階"; }
  else if (z >= -0.5){ band = "平均的";     comment = "ここから伸ばせる余地が最も大きい層"; }
  else if (z >= -1.5){ band = "要注意";     comment = "前提のどこかに穴がある可能性が高い"; }
  else               { band = "要立て直し"; comment = "前提を遡って診断することを強くすすめる"; }
  return { diff, z, estHensa: Math.round(estHensa * 10) / 10, band, comment, ratio: score / max };
}

/** 内申点:9教科×5段階=45点満点 */
function calcNaishin(grades) {
  const vals = NAISHIN_SUBJECTS.map((s) => grades[s.id]).filter((v) => typeof v === "number");
  const total = vals.reduce((a, b) => a + b, 0);
  return { total, max: vals.length * 5, filled: vals.length, avg: vals.length ? total / vals.length : 0 };
}

/** 志望校との距離 */
function distanceToSchool(school, currentHensa) {
  if (currentHensa == null) return null;
  const gap = school.hensa - currentHensa;
  let status, color;
  if (gap <= -5)     { status = "安全圏";   color = "#3fb27f"; }
  else if (gap <= 0) { status = "合格圏";   color = "#5b8def"; }
  else if (gap <= 5) { status = "射程圏";   color = "#e6a54b"; }
  else if (gap <= 10){ status = "努力圏";   color = "#e2725b"; }
  else               { status = "挑戦圏";   color = "#b06c6c"; }
  return { gap: Math.round(gap * 10) / 10, status, color };
}

/**
 * ★限界効用分析 — 「どの教科を上げるのが一番効率がいいか」
 * 習得度の穴が大きく、配点が重く、獣医で重要な教科ほど優先度が高い。
 * 同じ1時間を、最も合格可能性が上がる場所に投じるための指標。
 */
function marginalReturn(memStates, testScores) {
  const sm = subjectMastery(memStates);
  const out = [];
  for (const sid in SUBJECTS) {
    if (sid === "skill" || sid === "info") continue;
    const m = sm[sid];
    const weight = SUBJECTS[sid].vetWeight;
    // 未学習の穴 + 習得度の低さ
    const gap = (1 - m.avgMastery) * 0.6 + (1 - m.coverage) * 0.4;
    const t = testScores?.[sid];
    const testPenalty = t ? Math.max(0, (60 - t) / 60) : 0.3;
    const score = (gap * 0.6 + testPenalty * 0.4) * weight;
    out.push({
      subject: sid, name: SUBJECTS[sid].name, emoji: SUBJECTS[sid].emoji,
      score, mastery: m.avgMastery, coverage: m.coverage,
      reason: gap > 0.5 ? "習得できていない概念が多い"
            : testPenalty > 0.3 ? "テストの得点が伸び悩んでいる"
            : "安定している。維持でよい",
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** 共通テスト目標点から必要な各科目の得点を逆算 */
function kyotsuTargets(targetRate) {
  const total = KYOTSU_SUBJECTS.reduce((a, s) => a + s.score, 0);
  return {
    total,
    needed: Math.round(total * targetRate / 100),
    perSubject: KYOTSU_SUBJECTS.map((s) => ({ ...s, target: Math.round(s.score * targetRate / 100) })),
  };
}
