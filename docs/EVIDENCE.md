# このシステムの科学的根拠

沙和ナビの機能はすべて、査読済みの教育・認知心理学研究に対応づけて設計しています。
**効果が疑わしいと判明している手法は、疑わしいと明記して採用していません。**

---

## 採用した研究(効果が確認されているもの)

### 1. テスト効果(検索練習)— 最重要

Dunlosky らは10の代表的な学習法を検証し、**「練習テスト」と「分散学習」の2つだけ**に最高評価(高有用性)を与えました。一方で、多くの生徒が実際に使っている**要約・線引き・再読は低評価**でした。

> Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013).
> *Improving Students' Learning With Effective Learning Techniques: Promising Directions From Cognitive and Educational Psychology.*
> Psychological Science in the Public Interest, 14(1), 4–58.

**実装:** 教材を「読ませる」機能を意図的に作っていません。すべての学習は「問いに答える」形をとります。AIも説明したら必ず問い返すよう指示されています。

### 2. 分散学習と FSRS

同じ総時間なら、まとめて学習するより間隔をあけたほうが定着します。FSRS(Free Spaced Repetition Scheduler)は記憶を **難易度 D / 安定度 S / 想起可能性 R** の3変数でモデル化し、従来の SM-2 より忘却の予測精度が高いことが大規模な学習ログで確認されています。想起可能性はべき関数で減衰します。

> Cepeda, N. J. et al. (2008). *Spacing effects in learning.* Psychological Science.
> Open Spaced Repetition. *FSRS Algorithm (DSR model).* https://github.com/open-spaced-repetition

**実装:** `js/memory.js` に FSRS の簡易版を実装。想起可能性が90%を下回る日に復習を出します。一夜漬けが構造的にできない設計です。

### 3. 交互練習(インターリービング)

同種の問題を続けて解く(aaabbbccc)より、種類を混ぜる(abcbcacab)ほうがテスト成績が大幅に上がります。小4のRCTで 38% → 77%(効果量 d=1.21)、大学生の体積問題で 20% → 63%(d=1.34)。

**ただし決定的な副作用があります。** 練習中の正答率は逆に下がります(混合60% vs 集中89%、d=1.06)。「できていない感じ」がするため、生徒が自分から交互練習をやめてしまうことが知られています。

> Rohrer, D., Dedrick, R. F., Hartwig, M. K., & Cheung, C.-N. (2020).
> *A randomized controlled trial of interleaved mathematics practice.* Journal of Educational Psychology, 112(1), 40–52.
> Taylor, K., & Rohrer, D. (2010). *The effects of interleaved practice.* Applied Cognitive Psychology.

**実装:** 出題は必ず単元をまたいで混ぜます。そのうえで**「今わざと混ぜている。今日の正答率が下がるのは設計どおり」と本人に明示**し、練習中の正答率と定着度を別々のメーターで表示して混同を防ぎます。保護者レポートでも同じ説明を繰り返しています。この「体感の悪さ」への対処こそが、交互練習を実際に続けさせるための鍵です。

### 4. ハイパーコレクション効果 — 本システムの中核

**「自信があったのに間違えた」誤りは、自信のなかった誤りよりも強く、長く修正されます。** 予想と現実のズレ(メタ認知的驚き)が注意を引きつけるためです。

ただし重要な但し書きがあります。**高確信度の誤りは約1週間後に復活しやすく、訂正の直後にもう一度テストするとその復活が防げます。**

> Metcalfe, J., & Finn, B. (2011). *People's hypercorrection of high-confidence errors: Did they know it all along?*
> Psychonomic Bulletin & Review.
> Butler, A. C., Fazio, L. K., & Marsh, E. J. (2014). *Hypercorrection of high-confidence errors: Prior testing both enhances delayed performance and blocks the return of the errors.*

**実装:**
- 答える前に必ず確信度(◎自信ある / ○たぶん / △わからない)を申告させる
- 確信度 × 正誤で4象限に分類し、**「自信あり×不正解」を最優先の弱点**として扱う
- そこに当たったら、**訂正直後に同型の問題を再出題**し、さらに **12時間後に強制的に再テストを予約**する(`memory.js` の `flagged` 処理)
- 「わかったつもり率」として本人に可視化する

### 5. マスタリー学習と前提知識 — 本システムの中核

学習のつまずきは、目の前の単元ではなく、その土台にある過去の単元の欠損であることが多い。習得基準に達するまで先に進めない「マスタリー・ラーニング」には効果があります。

**ただし誇張に注意が必要です。** Bloom の有名な「2シグマ」は、後の系統的レビューで過大評価だったことが判明しています。マスタリー学習単体の効果はおよそ 0.5σ、知能型チューターシステムのメタ分析では効果量 g ≒ 0.66〜0.70 です。十分に大きな効果ですが、2σ ではありません。

> Bloom, B. S. (1984). *The 2 Sigma Problem.* Educational Researcher.
> 系統的レビューによる修正:Nintil (2020). *On Bloom's two sigma problem.*
> 知能型チューターのメタ分析(2024): g ≒ 0.70

**実装:** `js/curriculum.js` に中1〜高3の全教科 **210概念** を前提関係の有向グラフ(DAG)として保持。つまずいたら現単元を教え直す前に、`diagnoseRootCause()` で前提をさかのぼり、本当に壊れている場所を特定してからそこを直します。

### 6. 認知負荷理論(足場の段階的除去)

初学者には完成した解答例(ワークトエグザンプル)を見せるほうが、いきなり解かせるより効率的です。ただし習熟すると逆転します(専門性逆転効果)。

> Sweller, J. Cognitive Load Theory.

**実装:** 習得度が低い概念では「解法例 → 一部空欄 → 自力」の順に足場を外します。AIには「3回試して進まないときは考え方ごと教える」と指示しています。

### 7. 自己決定理論(やる気の本体)

やる気は **自律性・有能感・関係性** の3つが満たされると内側から湧きます。統制的な関わり(命令・監視・報酬でつる)は内発的動機づけを損ないます。保護者の自律性支援は、学業成績と心理的適応の両方を高めることが思春期の研究でも確認されています。

> Deci, E. L., & Ryan, R. M. Self-Determination Theory.
> Joussemet, M., Landry, R., & Koestner, R. (2008). *A Self-Determination Theory Perspective on Parenting.* Canadian Psychology.
> Frontiers in Psychology (2024). *Academic motivation in adolescents: the role of parental autonomy support.*

**実装:** 3つの人格が3つの欲求に対応しています。
| 人格 | 支える欲求 |
|---|---|
| ミミ先生(先生) | 有能感 — 「できるようになっている」実感 |
| コタロー(相棒) | 関係性 — 評価されずに話せる相手 |
| ナギ(伴走者) | 自律性 — 選択肢を出し、本人が決める |

保護者画面は「監視ツール」ではなく「支援の仕方を伝えるもの」として設計しています。

### 8. 過正当化効果(報酬がやる気を壊す)

もともと興味があった活動に外的報酬を与えると、報酬がなくなったときに以前よりやらなくなります。

> Deci, E. L., Koestner, R., & Ryan, R. M. (1999). Psychological Bulletin, 125(6), 627–668.

**実装:** ポイント・バッジ・レベルを主軸から降ろしました。進捗表示は「点数」ではなく **「どの概念が本当にできるようになったか」と「夢との距離」** です。

### 9. プロテジェ効果(教えることで学ぶ)

誰かに教えるつもりで学ぶと、自分のためだけに学ぶより深く理解できます。説明する過程で自分の理解の穴が見えます。

> Chase, C. C. et al. (2009). *Teachable Agents and the Protégé Effect.*

**実装:** 相棒モード(コタロー)では、沙和さんが**AIに教える側に回る**セッションを用意しています。コタローはわざと少し的外れな質問をします。

### 10. 試験前の書き出し(テスト不安への介入)

試験直前に不安を10分間書き出すと、作業記憶が解放されて成績が上がります。不安が高い生徒ほど効果が大きい。

> Ramirez, G., & Beilock, S. L. (2011). *Writing about testing worries boosts exam performance in the classroom.* Science, 331(6014), 211–213.

**実装:** 伴走者モード(ナギ)がテスト前日に書き出しワークを提案します。

### 11. 興味の4段階発達モデル

興味は「一時的なおもしろさ」から始まり、繰り返し価値を感じることで「個人的な関心」へ育ちます。既にある強い興味に結びつけると、無関係に見える教科の学習も持続します。

> Hidi, S., & Renninger, K. A. (2006). *The Four-Phase Model of Interest Development.* Educational Psychologist.

**実装:** 28の概念に「獣医の仕事とのつながり」を具体的に設定しています。
例:比例 → 体重に対する投薬量 / 濃度計算 → 薬液の希釈 / 免疫 → ワクチンの原理 / 対数 → 薬物の半減期 / 条件付き確率 → 検査の陽性的中率。

---

## 採用しなかった研究(効果が疑わしいもの)

### グロースマインドセット — 本システムでは柱にしていません

「やればできると信じさせる」介入は、広く信じられているほどの効果がありません。

122件を対象としたメタ分析では **全体効果 d = 0.05**、**最も質の高い6研究(N=13,571)に限ると d = 0.02 で有意ではありませんでした**。効果があるとしても、対象は低学力層に限られる可能性が高いとされています。

> Macnamara, B. N., & Burgoyne, A. P. (2023). *Do Growth Mindset Interventions Impact Students' Academic Achievement? A Systematic Review and Meta-Analysis with Recommendations for Best Practices.* Psychological Bulletin.
> Yeager, D. S. et al. (2019). *A national experiment reveals where a growth mindset improves achievement.* Nature.
> (注:Burnette らは異なる手法でより肯定的な結論を出しており、論争は継続中です)

**判断:** 「気持ちの持ちよう」を機能の柱にしていません。ほめることは有効ですが、それは**関係性(自己決定理論)の効果**であって、マインドセット教育の効果としては期待していません。正直にそう扱っています。

---

## 日本の受験制度に関する確認事項(2026年8月時点)

- **共通テストは2025年度入試から新課程**:「情報」が新設され7教科21科目に。国立大学の多くが **5教科7科目 → 6教科8科目** へ移行。全国立大学が情報Iを利用することを公表済み。国語は80分→90分、数学は「数II・B」→「数II・B・C」。
- **獣医学部・獣医学科は全国17校**(国公立11・私立6)。募集人数が少なく、戦略が合否を分けます。
- **中学の評定は9教科×5段階=45点満点**。2021年度から全教科が「知識・技能」「思考・判断・表現」「主体的に学習に取り組む態度」の**3観点**で評価(平成29年改訂 学習指導要領)。テストの点だけでは決まりません。

> ⚠️ アプリ内の偏差値・共通テスト得点率は**目安**です。出願判断は必ず河合塾・駿台・ベネッセ等の最新資料でご確認ください。
