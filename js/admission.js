/* =========================================================================
   admission.js — 大学受験エンジン
   模試偏差値の換算 / 入試方式 / 逆算スケジュール / 併願戦略 / 費用
   ========================================================================= */

/* ---------------------------------------------------------------
   模試の偏差値換算

   親と受験生が最も誤解するポイント。
   同じ実力でも、受ける模試によって偏差値は10〜15も変わる。
   母集団が違うため。
     進研模試(ベネッセ) … 学年ほぼ全員(約45万人)。大学進学しない層も含む → 高く出る
     全統模試(河合塾)   … 大学受験を目指す層が中心 → 標準。大学の偏差値表はこれが基準
     駿台全国模試       … 難関大志望者中心 → 低く出る
   業界の経験則: 駿台 +5 ≒ 河合 / 河合 +10 ≒ 進研
   --------------------------------------------------------------- */
const MOSHI_TYPES = {
  shinken: { id:"shinken", name:"進研模試(ベネッセ)", offset:-10, band:3,
    note:"学年のほぼ全員が受ける。大学進学しない生徒も母集団に含まれるため、偏差値が最も高く出ます。" },
  zento:   { id:"zento",   name:"全統模試(河合塾)",   offset:0,  band:0,
    note:"大学受験生が中心。大学の偏差値表はこの模試が基準です。ここでの偏差値が「実質的な数字」。" },
  sundai:  { id:"sundai",  name:"駿台全国模試",       offset:+5, band:3,
    note:"難関大志望者中心。同じ実力でも最も低く出ます。ここで偏差値が低くても落ち込む必要はありません。" },
  toshin:  { id:"toshin",  name:"東進模試",           offset:+2, band:3,
    note:"駿台と河合の中間程度。" },
  koukou:  { id:"koukou",  name:"高校受験の模試",     offset:null, band:0,
    note:"⚠ 高校受験と大学受験では母集団がまったく違います。高校受験の偏差値は大学受験に換算できません。" },
};

/** どの模試の偏差値でも、大学偏差値表の基準(河合塾・全統)に換算する */
function toKawaiScale(value, moshiId) {
  const m = MOSHI_TYPES[moshiId];
  if (!m || m.offset === null) return null;
  const center = value + m.offset;
  return { center: Math.round(center * 10) / 10, low: center - m.band, high: center + m.band, band: m.band };
}

/** 換算の全体像(表示用) */
function conversionTable(kawaiValue) {
  return Object.values(MOSHI_TYPES).filter((m) => m.offset !== null).map((m) => ({
    name: m.name, value: Math.round((kawaiValue - m.offset) * 10) / 10, note: m.note,
    isBase: m.id === "zento",
  }));
}

/* ---------------------------------------------------------------
   入試方式(獣医学部)
   --------------------------------------------------------------- */
const ADMISSION_TYPES = [
  { id:"ippan", name:"一般選抜", when:"1〜3月",
    need:["共通テスト(国公立は原則6教科8科目)","二次試験(記述)"],
    desc:"最も募集人数が多い本流。学力勝負。",
    tip:"獣医学部は理科2科目(化学+生物が主流)が必要な大学が多い。高2までに理科の選択を決めること。" },
  { id:"suisen", name:"学校推薦型選抜", when:"11〜12月出願",
    need:["高校の評定平均値(多くは3.8〜4.3以上)","学校長の推薦","小論文・面接","共通テストを課す大学もある"],
    desc:"高1からの成績の積み重ねがそのまま出願資格になる。",
    tip:"評定平均は高1の1学期から全部が対象。中3の今から『高校でオール4以上を取る』意識が効いてくる。" },
  { id:"sougou", name:"総合型選抜(旧AO)", when:"9月〜出願",
    need:["志望理由書","面接・プレゼン","活動実績","共通テストを課す大学もある"],
    desc:"動物への関わりや探究活動を評価してもらえる方式。",
    tip:"動物病院の見学、保護活動のボランティア、自由研究などの記録を中学のうちから残しておくと強い材料になる。" },
];

/* ---------------------------------------------------------------
   年間スケジュール(高3を基準にした受験イヤーの流れ)
   --------------------------------------------------------------- */
const EXAM_CALENDAR = [
  { m:4,  label:"4月",  items:["全統記述模試・進研模試","志望校の最終検討を開始"] },
  { m:5,  label:"5月",  items:["全統共通テスト模試","基礎の総点検を終える目標時期"] },
  { m:6,  label:"6月",  items:["全統記述模試","評定平均が確定(推薦を狙う場合の分岐点)"] },
  { m:7,  label:"7-8月",items:["夏の模試ラッシュ","オープンキャンパス","理科2科目の完成が目標","過去問に初めて触れる"] },
  { m:9,  label:"9月",  items:["総合型選抜の出願開始","共通テスト出願(9月末〜10月上旬)"] },
  { m:10, label:"10月", items:["全統プレ共通テスト","学校推薦型選抜の校内選考"] },
  { m:11, label:"11月", items:["学校推薦型選抜の出願・試験","最後の記述模試"] },
  { m:12, label:"12月", items:["共通テスト直前対策に完全移行","私立の出願準備"] },
  { m:1,  label:"1月",  items:["★共通テスト(1月中旬の土日)","自己採点→国公立の出願先を決定","私立一般入試が開始"] },
  { m:2,  label:"2月",  items:["私立一般入試","★国公立前期日程(2月25日〜)"] },
  { m:3,  label:"3月",  items:["★国公立後期日程(3月12日〜)","合格発表・入学手続き"] },
];

/* ---------------------------------------------------------------
   受験までの逆算
   --------------------------------------------------------------- */
/** 現在の学年から、共通テスト本番までの年月日を逆算する */
function countdownToExam(grade, now = new Date()) {
  const gi = GRADES.indexOf(grade);
  if (gi < 0) return null;
  // 年度(4月始まり)
  const y = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const gradYear = y + (5 - gi);           // 高3の年度
  const examDate = new Date(gradYear + 1, 0, 17);  // 共通テストは1月中旬(目安)
  const days = Math.ceil((examDate - now) / 86400000);
  return {
    examDate, gradYear,
    examYearLabel: `${gradYear + 1}年1月`,
    days: Math.max(0, days),
    months: Math.max(0, Math.round(days / 30.4)),
    years: Math.max(0, Math.round((days / 365) * 10) / 10),
    weekends: Math.max(0, Math.floor(days / 7)),
  };
}

/**
 * 残り時間から、現実的な学習時間の目安を出す。
 * ※「必要時間」ではなく「今のペースで積み上がる量」を示すためのもの。
 */
function studyTimeProjection(grade, minutesPerDay) {
  const cd = countdownToExam(grade);
  if (!cd) return null;
  const totalHours = Math.round((cd.days * minutesPerDay) / 60);
  // 学年別の一般的な推奨(平日ベース・目安)
  const rec = { "中1":60, "中2":75, "中3":110, "高1":100, "高2":140, "高3":240 }[grade] || 90;
  return {
    ...cd, minutesPerDay, totalHours,
    recommended: rec,
    diff: minutesPerDay - rec,
    recTotalHours: Math.round((cd.days * rec) / 60),
  };
}

/**
 * ★受験日から逆算したマイルストーン。
 * 「いつまでに何が終わっていれば間に合うか」を学年ごとに返す。
 */
function backwardMilestones(grade) {
  const gi = GRADES.indexOf(grade);
  const all = [
    { at:"高3 1月", label:"共通テスト本番", detail:"6教科8科目。情報Iを含む", critical:true },
    { at:"高3 12月", label:"共通テスト対策に完全移行", detail:"新しい範囲の学習は終えている状態にする" },
    { at:"高3 夏",  label:"理科2科目を完成", detail:"化学・生物とも全範囲を1周し、過去問に入れる状態" },
    { at:"高3 春",  label:"英語長文と数学の演習を開始", detail:"インプットではなくアウトプット中心に切り替える" },
    { at:"高2 3月", label:"受験科目のインプットを完了", detail:"高3は演習の年。知識入れは高2で終える設計が現実的", critical:true },
    { at:"高2 冬",  label:"志望校を3〜5校に絞る", detail:"国公立前期・後期・私立の組み合わせを決める" },
    { at:"高2 夏",  label:"数II・B・C を一通り終える", detail:"微積・三角関数・数列・ベクトル" },
    { at:"高1 冬",  label:"理科の選択科目を決定", detail:"獣医は化学+生物が主流。大学ごとの指定を必ず確認", critical:true },
    { at:"高1 秋",  label:"mol計算(化学基礎)を確実に", detail:"ここで脱落する生徒が最も多い分岐点" },
    { at:"高1 春",  label:"評定平均の積み上げ開始", detail:"推薦を狙うなら高1の1学期から全部が対象になる", critical:true },
    { at:"中3 冬",  label:"理数に強い高校へ進学", detail:"獣医学部を目指すなら高校のカリキュラムが効いてくる", critical:true },
    { at:"中3 夏",  label:"中学範囲の穴を全て埋める", detail:"特に数学(方程式・関数)と英語(文型・時制)" },
    { at:"中2 冬",  label:"一次関数を確実にする", detail:"高校数学の関数すべての入口" },
    { at:"中1 通年",label:"正負の数〜文字式を完璧に", detail:"ここが崩れると6年間ずっと足を引っ張る", critical:true },
  ];
  // 現在の学年より先(未来)のものだけを近い順に返す
  const order = ["中1","中2","中3","高1","高2","高3"];
  const idxOf = (s) => order.findIndex((g) => s.startsWith(g));
  return all.filter((m) => idxOf(m.at) >= gi).reverse();
}

/* ---------------------------------------------------------------
   併願戦略
   --------------------------------------------------------------- */
/**
 * 現在の偏差値(河合換算)から、現実的な併願プランを組む。
 * 獣医学部は全国17校しかないため、組み合わせが合否を大きく左右する。
 */
function buildStrategy(kawaiHensa) {
  if (kawaiHensa == null) return null;
  const withGap = VET_SCHOOLS.map((s) => ({ ...s, gap: s.hensa - kawaiHensa }));
  const pick = (lo, hi, type) => withGap.filter((s) => s.gap > lo && s.gap <= hi && (!type || (type === "national" ? s.type !== "私立" : s.type === "私立")))
    .sort((a, b) => a.gap - b.gap);

  const challenge = withGap.filter((s) => s.gap > 5).sort((a, b) => a.gap - b.gap).slice(0, 2);
  const target    = withGap.filter((s) => s.gap > -3 && s.gap <= 5).sort((a, b) => b.hensa - a.hensa);
  const safe      = withGap.filter((s) => s.gap <= -3).sort((a, b) => b.hensa - a.hensa).slice(0, 3);

  return {
    challenge, target, safe,
    nationalCount: withGap.filter((s) => s.type !== "私立" && s.gap <= 5).length,
    privateCount:  withGap.filter((s) => s.type === "私立" && s.gap <= 5).length,
    advice: !target.length && !safe.length
      ? "現時点では全17校が挑戦圏です。まずは偏差値の底上げが最優先。今の学年でできることに集中しましょう。"
      : safe.length === 0
      ? "安全圏がまだありません。国公立1校だけに絞るのは危険です。私立の併願を必ず検討してください。"
      : `国公立と私立を組み合わせられます。国公立は前期・後期で最大2校、私立は複数校の併願が可能です。`,
  };
}

/* ---------------------------------------------------------------
   費用(※すべて目安。各大学の公式サイトで必ず確認してください)
   --------------------------------------------------------------- */
const TUITION = {
  national: { label:"国公立(全11校ほぼ共通)", first: 817800, yearly: 535800, total6: 3496800,
    note:"入学金282,000円 + 授業料535,800円/年(文部科学省の標準額)" },
  private: {
    nvlu:    { total6: 13_400_000 }, kitasato:{ total6: 12_980_000 },
    azabu:   { total6: 12_500_000 }, nihon:   { total6: 11_800_000 },
    rakuno:  { total6: 11_800_000 }, ous:     { total6: 14_000_000 },
  },
};

const EXAM_FEES = [
  { name:"共通テスト(3教科以上)", amount: 18000, note:"2教科以下なら12,000円" },
  { name:"国公立 二次試験",       amount: 17000, note:"1校あたり。前期・後期で各1回" },
  { name:"私立 一般入試",         amount: 35000, note:"1校1方式あたりの目安" },
  { name:"交通費・宿泊費",         amount: 50000, note:"遠方受験の場合の目安(1回)" },
];

/** 費用の総額を試算 */
function estimateCost(schoolId, options = {}) {
  const s = VET_SCHOOLS.find((x) => x.id === schoolId);
  if (!s) return null;
  const tuition = s.type === "私立"
    ? (TUITION.private[schoolId]?.total6 ?? 12_500_000)
    : TUITION.national.total6;
  const nPrivate = options.privateExams ?? 2;
  const nNational = options.nationalExams ?? 1;
  const travel = options.travel ?? 1;
  const exam = 18000 + nNational * 17000 + nPrivate * 35000 + travel * 50000;
  return {
    school: s, tuition, exam, total: tuition + exam,
    isEstimate: true,
    monthly: Math.round(tuition / 72),  // 6年=72ヶ月
  };
}

/* ---------------------------------------------------------------
   高校の評定平均値(推薦の出願資格)
   --------------------------------------------------------------- */
/** 高1〜高3の1学期までの全科目5段階平均。多くの推薦は3.8〜4.3以上が条件 */
function calcHyoteiHeikin(records) {
  const vals = Object.values(records || {}).filter((v) => typeof v === "number" && v > 0);
  if (!vals.length) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return {
    avg: Math.round(avg * 100) / 100, count: vals.length,
    eligible: avg >= 4.3 ? "多くの推薦に出願できる水準"
            : avg >= 3.8 ? "推薦の出願資格を満たす大学がある水準"
            : avg >= 3.5 ? "一部の総合型選抜が視野に入る水準"
            : "一般選抜に集中するのが現実的な水準",
    ok: avg >= 3.8,
  };
}
