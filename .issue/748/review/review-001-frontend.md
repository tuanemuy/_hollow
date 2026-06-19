# PR #760 レビュー — Frontend

対象 PR: #760 / Issue #748
実装計画: `.issue/748/plan.md`（ステップ 8 = UI）
レビュー観点: Frontend（Tailwind utility-first / data-* state / design tokens / RSC / breakpoint 二重定義 / アクセシビリティ / 虚偽表示禁止）

フロントエンドの差分は実質 `app/components/admin/Dashboard/index.tsx` の 1 ファイルのみ（`chart.ts` は本 PR では変更なし。`buildSparkline` / `sumCounts` は既存をそのまま再利用）。typecheck・biome ともにパス。

## サマリ
- Blockers: 0
- Warnings: 1
- Notes: 3

## Frontend

### Blockers
なし。

AC-4（LLM 系列カード追加・null→『取得失敗』・0 件平坦線・scalar 実数表示）の主要要件は満たされている。具体的には:
- 2 カラム復帰（`md:grid-cols-2`、base `grid-cols-1`、`max-sm:gap-3`）でモバイル（max-sm）は単一カラムに落ち、#749 のモバイル整合（チップ 32px / 44px 床除去 / カードスタック）と干渉する箇所は無い（このセクションは #749 が触ったテーブル/チップ系と独立）。
- LLM カードは `metrics.llmCallsHourly === null` で『取得失敗』（チャート枠・下部キャプション両方）、非 null は `Sparkline` 描画。0 件系列は `buildSparkline` の `max === 0 → ratio=0` 平坦線で描かれ、null（取得失敗）とは layer 分離されている（chart.ts JSDoc どおり）。虚偽表示禁止の 0-vs-null 出し分けは正しい。
- `UploadsSparkline` → 汎用 `Sparkline` への一般化が正しい。`aria-label` を `ariaLabel` prop 化し、アップロードは「アップロード数の直近 24 時間の推移」、LLM は「LLM 呼び出し数の直近 24 時間の推移」を渡して文言を出し分け（AC / arch[S-005] 準拠）。`gradientId` も prop 化され `uploads-spark-fill` / `llm-spark-fill` と一意で、同一ページ 2 svg の `<linearGradient id>` 衝突を回避できている（これは元実装の固定 id を 2 枚化したときの実バグになり得たため、prop 化は妥当）。
- scalar「LLM 呼び出し (24h)」カードは main から無改変（diff にカード本体の行が一切現れない）。値が `null`→実数に変わるだけで、表示ロジック（`null`→『取得失敗』、非 null→「回 / 24h」）は据え置き。AC（scalar 変更不要）どおり。
- #595 の「LLM 系列はデータ源が無く正しく非描画 … LLM 記録源が入れば 2 カラムに戻す」コメントは完全に撤去済み（残存は chart.ts の「すべて見る」導線に関する別文脈コメントのみで、LLM 非描画とは無関係）。
- ハードコードのダミー値・実データに一致しない表示は無い（系列・scalar とも DTO 由来。DTO 側にも `llmCallsHourly` / `llmCallsToday` が実在することを確認）。
- RSC: `AdminDashboard` は async server component のまま。不要な client component 化（"use client"）は無い。`Sparkline` は SVG を返す純粋関数コンポーネントでクライアント境界を増やさない。

### Warnings

- **[W-001] 「直近 24 時間」2 カラムのブレークポイントがモック（P40）と不一致（md vs lg）**
  - 場所: `app/components/admin/Dashboard/index.tsx:297`（`grid grid-cols-1 ... md:grid-cols-2`）
  - 理由: P40 モック `spec/design/pages/P40-admin-dashboard.html:473-478` の `.charts` は base `grid-template-columns: 1fr`、2 カラム化は `@media (min-width: 1024px)`（= **lg**）。本実装は `md:grid-cols-2`（= **768px**）で 2 カラム化しており、768〜1023px のタブレット帯でモックは 1 カラムなのに実装は 2 カラムになる。チャートカードは横長 sparkline（viewBox 600×140 を `preserveAspectRatio="none"` で横伸縮）なので、md 帯で 2 枚並べると各カードが半幅になり sparkline が過度に潰れてモックの意図（タブレットは 1 カラムで横幅を確保）から外れる。なお #595 で全幅にする前のオリジナル（main より前）が md だったか lg だったかは履歴上たどれず、計画の文言は「`md:grid-cols-2` 等」と例示で lg 指定は無いため明確な規約違反ではない。ただしモックが SSOT である以上、合わせるのが筋。
  - 提案: `md:grid-cols-2` → `lg:grid-cols-2` に変更してモックの 1024px 境界に揃える。これにより scalar メトリクス帯（`sm:grid-cols-2 lg:grid-cols-4`, line 244）とも lg で揃い、レイアウトのリズムが一貫する。変更しない場合は ADR / plan に「md 採用」の意図的逸脱を 1 行記録すること。

### Notes

- **[N-001] チャート空状態の高さが max-sm で sparkline と不一致**
  - 場所: `index.tsx:310, 336`（取得失敗プレースホルダ `h-[140px]`）vs `Sparkline` の `:80`（`h-[140px] max-sm:h-[120px]`）
  - 理由: sparkline 本体は max-sm で 120px に縮むが、『取得失敗』プレースホルダは固定 `h-[140px]`。同一カードでも「取得失敗時」と「描画時」で max-sm のチャート領域高さが 20px ずれる。実害は小（両状態が同時に出ることはない）だが、レイアウト整合としては両方 `max-sm:h-[120px]` を付けると揃う。本 PR は元のアップロードカードの挙動をそのまま LLM カードに複製しているだけなので新規退行ではない（既存の軽微な非対称の踏襲）。

- **[N-002] LLM カードの下部キャプション改行がアップロードカードと非対称**
  - 場所: `index.tsx:346-350`
  - 理由: アップロード側は `{... ? "取得失敗" : "件 / 24h（毎時）"}` を 1 行で書いているが、LLM 側は `formatter` 不要にもかかわらず三項を多行で書いている（biome の整形結果。機能差なし）。可読性のためアップロード側と同じ 1 行スタイルに揃えると差分の対称性が上がるが、Biome 整形に委ねている以上は任意。動作・出力に差は無い。

- **[N-003] 平坦線（0 件）の sparkline は area パスがベースラインに重なり視覚的にほぼ不可視**
  - 場所: `chart.ts:33-41`（本 PR 非変更）/ UI 上は LLM カードで顕在化しやすい
  - 理由: LLM 呼び出しは新規記録源ゆえ初期はほぼ全 bucket が 0 になりやすく、平坦線（baseline 上の直線 + 高さ 0 の area）が頻出する。これは「0 件 = 平坦線」の仕様どおりで虚偽ではないが、`max === 0` のとき直線がカード下端ギリギリ（`CHART_HEIGHT - CHART_PAD_Y` = 128/140）に出るため、見た目が「線が無い／取得失敗」と紛らわしい可能性がある。下部キャプション「回 / 24h（毎時）」と scalar カードの実数（0）で補完されるため誤読リスクは限定的。改善するなら 0 件時のみベースラインを band 中央に置く等が考えられるが、これは chart.ts の既存挙動でアップロード側にも共通する設計判断であり、本 PR のスコープ外（必要なら別 Issue）。

## 結論
Frontend 観点で Blocker は無し。AC-4 の機能要件・アクセシビリティ（aria-label 出し分け）・虚偽表示禁止（0 vs null 分離・scalar 無改変・#595 コメント撤去）はいずれも満たされている。唯一合わせるべきは W-001（モックの 2 カラム境界 lg に対し実装が md）。Note 3 件はいずれも既存挙動の踏襲または任意の磨き込みで、承認を妨げない。
