/* =========================================================================
   curriculum.js — 知識の系譜グラフ (Knowledge Prerequisite DAG)
   中1 → 高3・大学受験までの全教科の概念を、前提関係で結んだ有向グラフ。

   このシステムの中核。つまずいたとき「今の単元」を教え直すのではなく、
   pre をさかのぼって「本当に壊れている場所」を特定するために使う。
   ========================================================================= */

const SUBJECTS = {
  math:    { name: "数学",     emoji: "🔢", color: "#5b8def", vetWeight: 1.0 },
  science: { name: "理科",     emoji: "🔬", color: "#3fb27f", vetWeight: 1.0 },
  english: { name: "英語",     emoji: "🌍", color: "#e2725b", vetWeight: 1.0 },
  japanese:{ name: "国語",     emoji: "📖", color: "#b07cc6", vetWeight: 0.7 },
  social:  { name: "社会",     emoji: "🗾", color: "#e6a54b", vetWeight: 0.5 },
  info:    { name: "情報",     emoji: "💻", color: "#4aa3c7", vetWeight: 0.4 },
  skill:   { name: "実技4教科", emoji: "🎨", color: "#8fa87c", vetWeight: 0.3 },
};

const GRADES = ["中1", "中2", "中3", "高1", "高2", "高3"];

/* id, s=教科, g=学年, u=単元, n=概念名, pre=前提概念, vet=獣医とのつながり */
const CONCEPTS = [
  /* ===================== 数学 ===================== */
  // 中1
  { id:"m1-seisu",  s:"math", g:"中1", u:"正負の数", n:"正負の数と大小", pre:[] },
  { id:"m1-kagen",  s:"math", g:"中1", u:"正負の数", n:"正負の数の加減", pre:["m1-seisu"] },
  { id:"m1-jojo",   s:"math", g:"中1", u:"正負の数", n:"正負の数の乗除", pre:["m1-kagen"] },
  { id:"m1-shisuu", s:"math", g:"中1", u:"正負の数", n:"累乗と四則の混合計算", pre:["m1-jojo"] },
  { id:"m1-moji",   s:"math", g:"中1", u:"文字と式", n:"文字式の表し方", pre:["m1-shisuu"] },
  { id:"m1-moji2",  s:"math", g:"中1", u:"文字と式", n:"一次式の計算", pre:["m1-moji"] },
  { id:"m1-hou",    s:"math", g:"中1", u:"方程式", n:"一次方程式の解き方", pre:["m1-moji2"] },
  { id:"m1-bunhou", s:"math", g:"中1", u:"方程式", n:"分数・小数を含む方程式", pre:["m1-hou"] },
  { id:"m1-hi",     s:"math", g:"中1", u:"方程式", n:"比例式", pre:["m1-hou"], vet:"体重に対する投薬量の計算は、すべて比例式が土台になる" },
  { id:"m1-bunsho", s:"math", g:"中1", u:"方程式", n:"一次方程式の文章題", pre:["m1-bunhou"] },
  { id:"m1-hirei",  s:"math", g:"中1", u:"比例と反比例", n:"比例", pre:["m1-moji2"], vet:"薬用量は体重に比例する。獣医が毎日使う考え方" },
  { id:"m1-hanpi",  s:"math", g:"中1", u:"比例と反比例", n:"反比例", pre:["m1-hirei"] },
  { id:"m1-zahyo",  s:"math", g:"中1", u:"比例と反比例", n:"座標とグラフ", pre:["m1-hirei"] },
  { id:"m1-heimen", s:"math", g:"中1", u:"平面図形", n:"作図と図形の移動", pre:[] },
  { id:"m1-ougi",   s:"math", g:"中1", u:"平面図形", n:"おうぎ形の弧の長さと面積", pre:["m1-heimen"] },
  { id:"m1-kuukan", s:"math", g:"中1", u:"空間図形", n:"空間内の直線と平面", pre:[] },
  { id:"m1-taiseki",s:"math", g:"中1", u:"空間図形", n:"立体の体積と表面積", pre:["m1-kuukan","m1-ougi"] },
  { id:"m1-data",   s:"math", g:"中1", u:"データの活用", n:"度数分布と代表値", pre:[] },
  { id:"m1-souta",  s:"math", g:"中1", u:"データの活用", n:"相対度数と確率の意味", pre:["m1-data"] },
  // 中2
  { id:"m2-tashiki",s:"math", g:"中2", u:"式の計算", n:"単項式・多項式の計算", pre:["m1-moji2"] },
  { id:"m2-renritsu",s:"math",g:"中2", u:"連立方程式", n:"連立方程式の解き方", pre:["m1-bunhou","m2-tashiki"] },
  { id:"m2-renbun", s:"math", g:"中2", u:"連立方程式", n:"連立方程式の文章題", pre:["m2-renritsu","m1-bunsho"] },
  { id:"m2-ichiji", s:"math", g:"中2", u:"一次関数", n:"一次関数の式と変化の割合", pre:["m1-hirei","m2-tashiki"] },
  { id:"m2-igraph", s:"math", g:"中2", u:"一次関数", n:"一次関数のグラフ", pre:["m2-ichiji","m1-zahyo"] },
  { id:"m2-iren",   s:"math", g:"中2", u:"一次関数", n:"一次関数と連立方程式(交点)", pre:["m2-igraph","m2-renritsu"] },
  { id:"m2-heikou", s:"math", g:"中2", u:"図形の性質", n:"平行線と角", pre:["m1-heimen"] },
  { id:"m2-goudou", s:"math", g:"中2", u:"図形の証明", n:"三角形の合同条件と証明", pre:["m2-heikou"] },
  { id:"m2-shikaku",s:"math", g:"中2", u:"図形の証明", n:"四角形の性質と証明", pre:["m2-goudou"] },
  { id:"m2-kaku",   s:"math", g:"中2", u:"確率", n:"場合の数と確率", pre:["m1-souta"] },
  { id:"m2-hako",   s:"math", g:"中2", u:"データの活用", n:"四分位範囲と箱ひげ図", pre:["m1-data"] },
  // 中3
  { id:"m3-tenkai", s:"math", g:"中3", u:"式の展開と因数分解", n:"多項式の展開・乗法公式", pre:["m2-tashiki"] },
  { id:"m3-inzu",   s:"math", g:"中3", u:"式の展開と因数分解", n:"因数分解", pre:["m3-tenkai"] },
  { id:"m3-kon",    s:"math", g:"中3", u:"平方根", n:"平方根の意味と大小", pre:["m1-shisuu"] },
  { id:"m3-konkei", s:"math", g:"中3", u:"平方根", n:"根号を含む式の計算・有理化", pre:["m3-kon","m3-tenkai"] },
  { id:"m3-niji",   s:"math", g:"中3", u:"二次方程式", n:"二次方程式(平方根・因数分解)", pre:["m3-inzu","m3-konkei"] },
  { id:"m3-kaiho",  s:"math", g:"中3", u:"二次方程式", n:"解の公式と文章題", pre:["m3-niji"] },
  { id:"m3-nikan",  s:"math", g:"中3", u:"関数", n:"二次関数 y=ax²", pre:["m2-igraph"] },
  { id:"m3-souji",  s:"math", g:"中3", u:"相似", n:"三角形の相似条件と証明", pre:["m2-goudou"] },
  { id:"m3-senbun", s:"math", g:"中3", u:"相似", n:"平行線と線分比・中点連結", pre:["m3-souji"] },
  { id:"m3-sanpei", s:"math", g:"中3", u:"三平方の定理", n:"三平方の定理と応用", pre:["m3-konkei","m3-souji"] },
  { id:"m3-en",     s:"math", g:"中3", u:"円", n:"円周角の定理", pre:["m1-ougi","m2-goudou"] },
  { id:"m3-hyohon", s:"math", g:"中3", u:"標本調査", n:"標本調査", pre:["m2-kaku"] },
  // 高1 (数I・A)
  { id:"h1-shiki",  s:"math", g:"高1", u:"数と式", n:"式の展開と因数分解(発展)", pre:["m3-inzu"] },
  { id:"h1-jissuu", s:"math", g:"高1", u:"数と式", n:"実数・絶対値・根号", pre:["m3-konkei"] },
  { id:"h1-futou",  s:"math", g:"高1", u:"数と式", n:"一次不等式", pre:["m1-bunhou","h1-jissuu"] },
  { id:"h1-shuugo", s:"math", g:"高1", u:"集合と命題", n:"集合・命題・必要十分条件", pre:["h1-futou"] },
  { id:"h1-nikan",  s:"math", g:"高1", u:"二次関数", n:"二次関数のグラフと最大最小", pre:["m3-nikan","h1-shiki"] },
  { id:"h1-nifutou",s:"math", g:"高1", u:"二次関数", n:"二次方程式・二次不等式", pre:["h1-nikan","h1-futou"] },
  { id:"h1-sankaku",s:"math", g:"高1", u:"図形と計量", n:"三角比(sin/cos/tan)", pre:["m3-sanpei"] },
  { id:"h1-seigen", s:"math", g:"高1", u:"図形と計量", n:"正弦定理・余弦定理", pre:["h1-sankaku"] },
  { id:"h1-data",   s:"math", g:"高1", u:"データの分析", n:"分散・標準偏差・相関係数", pre:["m2-hako"], vet:"論文の統計はここから。研究する獣医には必須" },
  { id:"h1-baai",   s:"math", g:"高1", u:"場合の数と確率", n:"順列・組合せ", pre:["m2-kaku"] },
  { id:"h1-kaku",   s:"math", g:"高1", u:"場合の数と確率", n:"確率・条件付き確率", pre:["h1-baai"], vet:"検査の的中率(陽性的中率)は条件付き確率そのもの" },
  { id:"h1-seisuu", s:"math", g:"高1", u:"整数の性質", n:"約数・倍数・合同式", pre:["h1-shuugo"] },
  { id:"h1-zukei",  s:"math", g:"高1", u:"図形の性質", n:"チェバ・メネラウス・方べき", pre:["m3-souji","m3-en"] },
  // 高2 (数II・B)
  { id:"h2-fukuso", s:"math", g:"高2", u:"複素数と方程式", n:"複素数と二次方程式の解", pre:["h1-nikan"] },
  { id:"h2-koushi", s:"math", g:"高2", u:"複素数と方程式", n:"因数定理・高次方程式", pre:["h2-fukuso"] },
  { id:"h2-shomei", s:"math", g:"高2", u:"式と証明", n:"二項定理・恒等式・不等式の証明", pre:["h1-baai","h1-shiki"] },
  { id:"h2-zukeih", s:"math", g:"高2", u:"図形と方程式", n:"点と直線・円の方程式", pre:["h1-nikan","m3-en"] },
  { id:"h2-kiseki", s:"math", g:"高2", u:"図形と方程式", n:"軌跡と領域", pre:["h2-zukeih","h1-nifutou"] },
  { id:"h2-sankan", s:"math", g:"高2", u:"三角関数", n:"三角関数とグラフ", pre:["h1-seigen"] },
  { id:"h2-kahou",  s:"math", g:"高2", u:"三角関数", n:"加法定理と合成", pre:["h2-sankan"] },
  { id:"h2-shisuu", s:"math", g:"高2", u:"指数・対数", n:"指数関数", pre:["h1-jissuu"] },
  { id:"h2-taisuu", s:"math", g:"高2", u:"指数・対数", n:"対数関数", pre:["h2-shisuu"], vet:"薬物の血中濃度の半減期は対数で扱う" },
  { id:"h2-bibun",  s:"math", g:"高2", u:"微分・積分", n:"微分法(多項式)", pre:["h2-koushi","h1-nikan"] },
  { id:"h2-sekibun",s:"math", g:"高2", u:"微分・積分", n:"積分法(多項式)・面積", pre:["h2-bibun"] },
  { id:"h2-suuretsu",s:"math",g:"高2", u:"数列", n:"等差数列・等比数列", pre:["h1-shiki"] },
  { id:"h2-sigma",  s:"math", g:"高2", u:"数列", n:"Σの計算と数列の和", pre:["h2-suuretsu"] },
  { id:"h2-zenka",  s:"math", g:"高2", u:"数列", n:"漸化式と数学的帰納法", pre:["h2-sigma"] },
  { id:"h2-toukei", s:"math", g:"高2", u:"統計的な推測", n:"確率分布・正規分布・区間推定", pre:["h1-kaku","h1-data"], vet:"薬の効果を証明する統計解析の基礎" },
  { id:"h2-vector", s:"math", g:"高2", u:"ベクトル", n:"ベクトルの演算と内積", pre:["h2-zukeih","h1-seigen"] },
  { id:"h2-kuukanv",s:"math", g:"高2", u:"ベクトル", n:"空間ベクトル", pre:["h2-vector","m1-kuukan"] },
  // 高3 (数III・C)
  { id:"h3-kyokugen",s:"math",g:"高3", u:"極限", n:"数列と関数の極限", pre:["h2-sigma","h2-taisuu"] },
  { id:"h3-bibun3", s:"math", g:"高3", u:"微分法", n:"微分法(三角・指数・対数)", pre:["h3-kyokugen","h2-kahou","h2-taisuu"] },
  { id:"h3-bibunou",s:"math", g:"高3", u:"微分法", n:"微分の応用(増減・最大最小)", pre:["h3-bibun3"] },
  { id:"h3-seki3",  s:"math", g:"高3", u:"積分法", n:"積分法(置換・部分積分)", pre:["h3-bibun3","h2-sekibun"] },
  { id:"h3-sekiou", s:"math", g:"高3", u:"積分法", n:"積分の応用(面積・体積)", pre:["h3-seki3"] },
  { id:"h3-fukuheimen",s:"math",g:"高3",u:"複素数平面", n:"複素数平面", pre:["h2-fukuso","h2-kahou"] },
  { id:"h3-kyokusen",s:"math",g:"高3", u:"式と曲線", n:"二次曲線・媒介変数・極座標", pre:["h2-zukeih"] },

  /* ===================== 理科 ===================== */
  // 中1
  { id:"s1-shoku",  s:"science", g:"中1", u:"植物", n:"植物のつくりとはたらき", pre:[] },
  { id:"s1-bunrui", s:"science", g:"中1", u:"生物の分類", n:"動物・植物の分類", pre:["s1-shoku"], vet:"獣医が扱う動物の体のつくりの違いはここが出発点" },
  { id:"s1-mitsudo",s:"science", g:"中1", u:"物質", n:"密度と状態変化", pre:[] },
  { id:"s1-kitai",  s:"science", g:"中1", u:"物質", n:"気体の性質と発生", pre:["s1-mitsudo"] },
  { id:"s1-suiyo",  s:"science", g:"中1", u:"物質", n:"水溶液の濃度と溶解度", pre:["s1-mitsudo"], vet:"点滴や消毒液の濃度計算に直結" },
  { id:"s1-hikari", s:"science", g:"中1", u:"光と音", n:"光の反射・屈折・凸レンズ", pre:[] },
  { id:"s1-chikara",s:"science", g:"中1", u:"力", n:"力のはたらきと表し方", pre:[] },
  { id:"s1-kazan",  s:"science", g:"中1", u:"大地", n:"火山と火成岩・地層", pre:[] },
  { id:"s1-jishin", s:"science", g:"中1", u:"大地", n:"地震のゆれと伝わり方", pre:["s1-kazan"] },
  // 中2
  { id:"s2-kagaku", s:"science", g:"中2", u:"化学変化", n:"原子・分子と化学反応式", pre:["s1-kitai"] },
  { id:"s2-sanka",  s:"science", g:"中2", u:"化学変化", n:"酸化・還元と発熱吸熱", pre:["s2-kagaku"] },
  { id:"s2-shitsu", s:"science", g:"中2", u:"化学変化", n:"質量保存と量的関係", pre:["s2-kagaku","m1-hirei"] },
  { id:"s2-saibou", s:"science", g:"中2", u:"生物のからだ", n:"細胞のつくりと生物のからだ", pre:["s1-bunrui"], vet:"すべての医学の出発点" },
  { id:"s2-shoka",  s:"science", g:"中2", u:"生物のからだ", n:"消化と吸収", pre:["s2-saibou"], vet:"草食動物と肉食動物で消化器の構造が全く違う。獣医の基礎中の基礎" },
  { id:"s2-kokyu",  s:"science", g:"中2", u:"生物のからだ", n:"呼吸・血液循環・排出", pre:["s2-saibou"], vet:"聴診・心疾患の診断の土台" },
  { id:"s2-shinkei",s:"science", g:"中2", u:"生物のからだ", n:"感覚器官と神経系", pre:["s2-saibou"] },
  { id:"s2-denryu", s:"science", g:"中2", u:"電気", n:"電流・電圧と回路", pre:["m1-hirei"] },
  { id:"s2-ohm",    s:"science", g:"中2", u:"電気", n:"オームの法則と電力", pre:["s2-denryu"] },
  { id:"s2-jiba",   s:"science", g:"中2", u:"電気", n:"電流と磁界・電磁誘導", pre:["s2-ohm"] },
  { id:"s2-tenki",  s:"science", g:"中2", u:"天気", n:"気象観測と前線・天気の変化", pre:[] },
  // 中3
  { id:"s3-ion",    s:"science", g:"中3", u:"イオン", n:"原子の成り立ちとイオン", pre:["s2-kagaku"] },
  { id:"s3-denkai", s:"science", g:"中3", u:"イオン", n:"電気分解と電池", pre:["s3-ion","s2-ohm"] },
  { id:"s3-sanen",  s:"science", g:"中3", u:"イオン", n:"酸・アルカリと中和", pre:["s3-ion"], vet:"血液のpHが少しずれるだけで動物は危険な状態になる" },
  { id:"s3-seishoku",s:"science",g:"中3", u:"生命の連続性", n:"細胞分裂と生殖", pre:["s2-saibou"] },
  { id:"s3-iden",   s:"science", g:"中3", u:"生命の連続性", n:"遺伝の規則性(メンデル)", pre:["s3-seishoku"], vet:"犬猫の遺伝病を理解し予防するための土台" },
  { id:"s3-shinka", s:"science", g:"中3", u:"生命の連続性", n:"生物の進化", pre:["s3-iden","s1-bunrui"] },
  { id:"s3-seitai", s:"science", g:"中3", u:"自然と人間", n:"生態系と食物連鎖・物質循環", pre:["s1-bunrui"], vet:"野生動物医療・One Healthの考え方の基礎" },
  { id:"s3-undou",  s:"science", g:"中3", u:"運動とエネルギー", n:"力の合成分解と運動", pre:["s1-chikara"] },
  { id:"s3-shigoto",s:"science", g:"中3", u:"運動とエネルギー", n:"仕事とエネルギー保存", pre:["s3-undou"] },
  { id:"s3-tentai", s:"science", g:"中3", u:"地球と宇宙", n:"天体の動きと太陽系", pre:[] },
  // 高校 生物(獣医学部の主力)
  { id:"b-saibou",  s:"science", g:"高1", u:"生物基礎", n:"細胞小器官と生体膜", pre:["s2-saibou"] },
  { id:"b-koso",    s:"science", g:"高1", u:"生物基礎", n:"タンパク質と酵素", pre:["b-saibou"] },
  { id:"b-dna",     s:"science", g:"高1", u:"生物基礎", n:"DNAの構造と複製", pre:["b-saibou","s3-iden"] },
  { id:"b-tensha",  s:"science", g:"高1", u:"生物基礎", n:"転写・翻訳(セントラルドグマ)", pre:["b-dna","b-koso"] },
  { id:"b-taieki",  s:"science", g:"高1", u:"生物基礎", n:"体液と恒常性(ホメオスタシス)", pre:["s2-kokyu"], vet:"点滴・輸液の設計はここの理解がすべて" },
  { id:"b-jiritsu", s:"science", g:"高1", u:"生物基礎", n:"自律神経とホルモン", pre:["b-taieki","s2-shinkei"], vet:"麻酔管理はこの知識の応用" },
  { id:"b-jinzou",  s:"science", g:"高1", u:"生物基礎", n:"肝臓と腎臓のはたらき", pre:["b-taieki"], vet:"猫の腎臓病は臨床で最も多い病気のひとつ" },
  { id:"b-mennekiki",s:"science",g:"高1", u:"生物基礎", n:"免疫のしくみ", pre:["b-taieki"], vet:"ワクチンの原理。獣医の日常業務の中心" },
  { id:"b-seitaih", s:"science", g:"高1", u:"生物基礎", n:"植生・バイオームと生態系保全", pre:["s3-seitai"] },
  { id:"b-daisha",  s:"science", g:"高2", u:"生物", n:"代謝(呼吸・光合成)", pre:["b-koso"] },
  { id:"b-chousetsu",s:"science",g:"高2", u:"生物", n:"遺伝子発現の調節", pre:["b-tensha"] },
  { id:"b-baio",    s:"science", g:"高2", u:"生物", n:"バイオテクノロジー", pre:["b-chousetsu"], vet:"遺伝子検査・再生医療は動物医療の最前線" },
  { id:"b-hassei",  s:"science", g:"高2", u:"生物", n:"動物の発生と形態形成", pre:["b-tensha"], vet:"繁殖・産科の基礎" },
  { id:"b-shinkeih",s:"science", g:"高2", u:"生物", n:"刺激の受容と神経・筋肉", pre:["b-jiritsu"] },
  { id:"b-kotai",   s:"science", g:"高2", u:"生物", n:"個体群と生物群集", pre:["b-seitaih"] },
  { id:"b-shinkah", s:"science", g:"高2", u:"生物", n:"進化のしくみと系統分類", pre:["s3-shinka","b-dna"] },
  // 高校 化学(獣医学部で必須が多い)
  { id:"c-kessei",  s:"science", g:"高1", u:"化学基礎", n:"物質の構成と化学結合", pre:["s3-ion"] },
  { id:"c-mol",     s:"science", g:"高1", u:"化学基礎", n:"物質量(mol)と化学反応式の量", pre:["c-kessei","s2-shitsu"] },
  { id:"c-nodo",    s:"science", g:"高1", u:"化学基礎", n:"濃度計算(質量%・モル濃度)", pre:["c-mol","m1-hirei"], vet:"薬液の希釈計算を間違えると動物の命に関わる" },
  { id:"c-chuwa",   s:"science", g:"高1", u:"化学基礎", n:"酸・塩基と中和滴定・pH", pre:["c-nodo","s3-sanen"] },
  { id:"c-sankah",  s:"science", g:"高1", u:"化学基礎", n:"酸化還元・電池・電気分解", pre:["c-mol","s3-denkai"] },
  { id:"c-netsu",   s:"science", g:"高2", u:"化学", n:"熱化学・エンタルピー", pre:["c-mol"] },
  { id:"c-heikou",  s:"science", g:"高2", u:"化学", n:"反応速度と化学平衡", pre:["c-netsu"] },
  { id:"c-muki",    s:"science", g:"高2", u:"化学", n:"無機物質(典型元素・遷移元素)", pre:["c-sankah"] },
  { id:"c-yuuki",   s:"science", g:"高2", u:"化学", n:"有機化合物の構造と反応", pre:["c-kessei"] },
  { id:"c-hokou",   s:"science", g:"高2", u:"化学", n:"芳香族化合物", pre:["c-yuuki"] },
  { id:"c-tanpaku", s:"science", g:"高2", u:"化学", n:"糖・アミノ酸・タンパク質・核酸", pre:["c-hokou","b-koso"], vet:"栄養学と薬理学の土台" },
  // 高校 物理基礎
  { id:"p-undou",   s:"science", g:"高1", u:"物理基礎", n:"運動の表し方(等加速度)", pre:["s3-undou","m2-igraph"] },
  { id:"p-newton",  s:"science", g:"高1", u:"物理基礎", n:"運動の法則", pre:["p-undou"] },
  { id:"p-energy",  s:"science", g:"高1", u:"物理基礎", n:"仕事とエネルギー保存", pre:["p-newton","s3-shigoto"] },
  { id:"p-nami",    s:"science", g:"高1", u:"物理基礎", n:"波の性質と音", pre:["s1-hikari"], vet:"超音波(エコー)検査の原理" },
  { id:"p-denki",   s:"science", g:"高1", u:"物理基礎", n:"電気と磁気", pre:["s2-ohm"], vet:"レントゲン・心電図を理解するための基礎" },

  /* ===================== 英語 ===================== */
  { id:"e1-be",     s:"english", g:"中1", u:"基本文型", n:"be動詞", pre:[] },
  { id:"e1-ippan",  s:"english", g:"中1", u:"基本文型", n:"一般動詞", pre:["e1-be"] },
  { id:"e1-3tan",   s:"english", g:"中1", u:"基本文型", n:"三人称単数現在の s", pre:["e1-ippan"] },
  { id:"e1-meishi", s:"english", g:"中1", u:"名詞・冠詞", n:"名詞の複数形と冠詞", pre:[] },
  { id:"e1-gimon",  s:"english", g:"中1", u:"疑問文", n:"疑問詞(what/who/where…)", pre:["e1-ippan"] },
  { id:"e1-can",    s:"english", g:"中1", u:"助動詞", n:"助動詞 can", pre:["e1-ippan"] },
  { id:"e1-shinko", s:"english", g:"中1", u:"時制", n:"現在進行形", pre:["e1-ippan"] },
  { id:"e1-kako",   s:"english", g:"中1", u:"時制", n:"過去形(規則・不規則)", pre:["e1-ippan"] },
  { id:"e1-goi",    s:"english", g:"中1", u:"語彙", n:"中1語彙(約600語)", pre:[] },
  { id:"e2-mirai",  s:"english", g:"中2", u:"時制", n:"未来表現(will / be going to)", pre:["e1-kako"] },
  { id:"e2-kakoshin",s:"english",g:"中2", u:"時制", n:"過去進行形", pre:["e1-shinko","e1-kako"] },
  { id:"e2-futei",  s:"english", g:"中2", u:"準動詞", n:"不定詞(名詞・形容詞・副詞用法)", pre:["e1-ippan"] },
  { id:"e2-doumei", s:"english", g:"中2", u:"準動詞", n:"動名詞", pre:["e2-futei"] },
  { id:"e2-hikaku", s:"english", g:"中2", u:"比較", n:"比較級・最上級", pre:["e1-meishi"] },
  { id:"e2-setsu",  s:"english", g:"中2", u:"接続", n:"接続詞 that / when / if / because", pre:["e1-kako"] },
  { id:"e2-juju",   s:"english", g:"中2", u:"文型", n:"SVOO / SVOC", pre:["e1-ippan"] },
  { id:"e2-jodou",  s:"english", g:"中2", u:"助動詞", n:"must / should / may / have to", pre:["e1-can"] },
  { id:"e2-goi",    s:"english", g:"中2", u:"語彙", n:"中2語彙(累計約1200語)", pre:["e1-goi"] },
  { id:"e3-judou",  s:"english", g:"中3", u:"態", n:"受動態", pre:["e1-kako"] },
  { id:"e3-kanryo", s:"english", g:"中3", u:"時制", n:"現在完了(継続・経験・完了)", pre:["e3-judou"] },
  { id:"e3-kankei", s:"english", g:"中3", u:"関係詞", n:"関係代名詞", pre:["e2-setsu"] },
  { id:"e3-bunshi", s:"english", g:"中3", u:"準動詞", n:"分詞の形容詞用法", pre:["e3-judou"] },
  { id:"e3-kansetsu",s:"english",g:"中3", u:"文構造", n:"間接疑問文", pre:["e1-gimon","e2-setsu"] },
  { id:"e3-goi",    s:"english", g:"中3", u:"語彙", n:"中3語彙(累計約1800語)", pre:["e2-goi"] },
  { id:"eh-bunkei", s:"english", g:"高1", u:"文法", n:"5文型と品詞の役割", pre:["e2-juju"] },
  { id:"eh-jisei",  s:"english", g:"高1", u:"文法", n:"時制の全体像(完了進行形まで)", pre:["e3-kanryo"] },
  { id:"eh-jodouh", s:"english", g:"高1", u:"文法", n:"助動詞+完了形", pre:["e2-jodou","e3-kanryo"] },
  { id:"eh-katei",  s:"english", g:"高2", u:"文法", n:"仮定法", pre:["eh-jisei"] },
  { id:"eh-kankeih",s:"english", g:"高2", u:"文法", n:"関係副詞・複合関係詞", pre:["e3-kankei"] },
  { id:"eh-bunkou", s:"english", g:"高2", u:"文法", n:"分詞構文", pre:["e3-bunshi"] },
  { id:"eh-hikakuh",s:"english", g:"高2", u:"文法", n:"比較の発展・慣用表現", pre:["e2-hikaku"] },
  { id:"eh-goi",    s:"english", g:"高2", u:"語彙", n:"高校語彙(3000〜5000語)", pre:["e3-goi"] },
  { id:"eh-choubun",s:"english", g:"高3", u:"読解", n:"長文読解(論説・科学系)", pre:["eh-bunkei","eh-goi"], vet:"獣医の最新研究はほぼ英語論文。ここが読めるかで一生の差になる" },
  { id:"eh-listen", s:"english", g:"高3", u:"リスニング", n:"リスニング(共通テスト形式)", pre:["eh-goi"] },
  { id:"eh-saku",   s:"english", g:"高3", u:"英作文", n:"自由英作文・要約", pre:["eh-bunkei","eh-goi"] },

  /* ===================== 国語 ===================== */
  { id:"j1-kanji",  s:"japanese", g:"中1", u:"言語知識", n:"中1漢字・語彙", pre:[] },
  { id:"j1-bunpou", s:"japanese", g:"中1", u:"文法", n:"文節・単語・品詞の識別", pre:[] },
  { id:"j1-setsu",  s:"japanese", g:"中1", u:"読解", n:"説明的文章の読解", pre:[] },
  { id:"j1-bungaku",s:"japanese", g:"中1", u:"読解", n:"文学的文章の読解", pre:[] },
  { id:"j1-koten",  s:"japanese", g:"中1", u:"古典", n:"歴史的仮名遣い・古典入門", pre:[] },
  { id:"j2-kanji",  s:"japanese", g:"中2", u:"言語知識", n:"中2漢字・語彙", pre:["j1-kanji"] },
  { id:"j2-bunpou", s:"japanese", g:"中2", u:"文法", n:"用言の活用・助動詞", pre:["j1-bunpou"] },
  { id:"j2-ronsetsu",s:"japanese",g:"中2", u:"読解", n:"論理的文章の読解(論の構造)", pre:["j1-setsu"] },
  { id:"j2-koten",  s:"japanese", g:"中2", u:"古典", n:"古文(係り結び・基本助動詞)", pre:["j1-koten"] },
  { id:"j3-kanji",  s:"japanese", g:"中3", u:"言語知識", n:"中3漢字・語彙", pre:["j2-kanji"] },
  { id:"j3-hyoron", s:"japanese", g:"中3", u:"読解", n:"評論の読解と要旨把握", pre:["j2-ronsetsu"] },
  { id:"j3-kanbun", s:"japanese", g:"中3", u:"古典", n:"漢文(返り点・書き下し)", pre:["j2-koten"] },
  { id:"j3-kijutsu",s:"japanese", g:"中3", u:"記述", n:"記述・作文", pre:["j2-ronsetsu"] },
  { id:"jh-genbun", s:"japanese", g:"高2", u:"現代文", n:"評論・小説の読解(共通テスト)", pre:["j3-hyoron"] },
  { id:"jh-koten",  s:"japanese", g:"高2", u:"古文", n:"古文(文法・単語・和歌)", pre:["j3-kanbun"] },
  { id:"jh-kanbun", s:"japanese", g:"高2", u:"漢文", n:"漢文(句法・読解)", pre:["j3-kanbun"] },

  /* ===================== 社会 ===================== */
  { id:"so1-chiri", s:"social", g:"中1", u:"地理", n:"世界の姿と各地域", pre:[] },
  { id:"so1-reki",  s:"social", g:"中1", u:"歴史", n:"古代の日本と世界", pre:[] },
  { id:"so2-chiri", s:"social", g:"中2", u:"地理", n:"日本の地理(地形・産業)", pre:["so1-chiri"] },
  { id:"so2-reki",  s:"social", g:"中2", u:"歴史", n:"中世〜近世", pre:["so1-reki"] },
  { id:"so3-reki",  s:"social", g:"中3", u:"歴史", n:"近現代", pre:["so2-reki"] },
  { id:"so3-koumin",s:"social", g:"中3", u:"公民", n:"政治・経済・国際社会", pre:["so3-reki"], vet:"動物愛護管理法や食品衛生法を扱うのは獣医の仕事" },
  { id:"soh-chiri", s:"social", g:"高2", u:"地理", n:"地理総合・地理探究", pre:["so2-chiri"] },
  { id:"soh-reki",  s:"social", g:"高2", u:"歴史", n:"歴史総合・探究", pre:["so3-reki"] },
  { id:"soh-koumin",s:"social", g:"高2", u:"公共", n:"公共・倫理・政治経済", pre:["so3-koumin"] },

  /* ===================== 情報(2025年〜共通テスト必須) ===================== */
  { id:"i-kiso",    s:"info", g:"高1", u:"情報I", n:"情報デザインとメディア", pre:[] },
  { id:"i-program", s:"info", g:"高1", u:"情報I", n:"プログラミングとアルゴリズム", pre:["i-kiso","m2-ichiji"] },
  { id:"i-data",    s:"info", g:"高2", u:"情報I", n:"データの活用と統計処理", pre:["i-program","h1-data"] },
  { id:"i-network", s:"info", g:"高2", u:"情報I", n:"ネットワークと情報セキュリティ", pre:["i-kiso"] },

  /* ===================== 実技4教科(内申点に直結) ===================== */
  { id:"k-pe",  s:"skill", g:"中1", u:"保健体育", n:"保健分野・運動の知識", pre:[], vet:"保健の『からだのしくみ』は生物と直結" },
  { id:"k-mu",  s:"skill", g:"中1", u:"音楽", n:"音楽理論・鑑賞", pre:[] },
  { id:"k-ar",  s:"skill", g:"中1", u:"美術", n:"表現技法・美術史", pre:[] },
  { id:"k-te",  s:"skill", g:"中1", u:"技術", n:"材料・エネルギー・情報の技術", pre:[] },
  { id:"k-ho",  s:"skill", g:"中1", u:"家庭", n:"食生活・衣生活・住生活", pre:[], vet:"栄養学の基礎。動物の食事管理にもつながる" },
];

/* ---------- グラフ操作 ---------- */
const CONCEPT_MAP = Object.fromEntries(CONCEPTS.map((c) => [c.id, c]));

/** 直接の前提概念を返す */
function prereqsOf(id) {
  return (CONCEPT_MAP[id]?.pre || []).map((p) => CONCEPT_MAP[p]).filter(Boolean);
}

/** その概念を前提としている「次に進む先」の概念を返す */
function unlocksOf(id) {
  return CONCEPTS.filter((c) => c.pre.includes(id));
}

/** 前提を再帰的に全部集める(深さ制限つき) */
function allPrereqs(id, depth = 4, seen = new Set()) {
  if (depth <= 0) return [];
  const out = [];
  for (const p of CONCEPT_MAP[id]?.pre || []) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(CONCEPT_MAP[p]);
    out.push(...allPrereqs(p, depth - 1, seen));
  }
  return out.filter(Boolean);
}

/** 前提グラフを根に近い順(浅い順)に並べる — 診断はここから遡る */
function prereqChain(id) {
  const layers = [];
  let frontier = [id];
  const seen = new Set([id]);
  for (let d = 0; d < 6 && frontier.length; d++) {
    const next = [];
    for (const f of frontier) {
      for (const p of CONCEPT_MAP[f]?.pre || []) {
        if (!seen.has(p)) { seen.add(p); next.push(p); }
      }
    }
    if (next.length) layers.push(next.map((i) => CONCEPT_MAP[i]));
    frontier = next;
  }
  return layers; // [1階層前, 2階層前, ...]
}

function conceptsBySubject(sid) {
  return CONCEPTS.filter((c) => c.s === sid);
}
function conceptsByGrade(g) {
  return CONCEPTS.filter((c) => c.g === g);
}
