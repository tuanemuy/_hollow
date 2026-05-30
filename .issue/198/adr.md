# ADR — Issue #198: エラー UI の設計成果物化 (spec/design)

## ADR-001: エラー状態モックの配置を「同一ファイル末尾 variant」にする

### Status
Proposed

### Context
Issue は対象3ページのエラー状態バリアントを (A) 各ファイル末尾に variant として並べる、または (B) `spec/design/pages/error-states/` 配下に分離する、のどちらにするかを計画判断に委ねている。

### Decision
(A) 同一ファイル末尾に variant として並べる。各バリアントは `--color-ink-tertiary` の小さなキャプション見出しで区切る。

### Consequences
- 良い点: `spec/design/index.md` §9「単一ファイルでブラウザ表示可能」「同じマークアップを各ページに貼る」規約に沿う。`:root` トークンと共通 CSS を再利用でき低コスト。確認方法「成功状態モックと並べて視覚的一貫性を確認」がしやすい。既存 P01b / P03 が既にエラー要素を本体に埋め込んでおり分離は CSS 重複・乖離リスクを増やす。
- トレードオフ: 1ファイルが縦に長くなる。キャプション見出しで区切って緩和する。

---

## ADR-002: エラー関連トークンは原則追加しない

### Status
Proposed

### Context
Issue は「不足するエラー関連トークンがあれば補う」とする。既存トークンに `--color-error` / `--color-error-surface` / `--color-warning` / `--color-warning-surface` があり、スペーシングは `--space-*`、半径は `--radius-*` が揃っている。

### Decision
新規トークンは原則追加しない。エラーアイコンは Lucide 風線画 SVG を `currentColor`（`--color-error` を継承）でインライン描画し専用トークンを設けない。不足が実作業で判明したときのみ、`tokens.css` + `tokens.md` §1.3 表 + 各 HTML `:root` の3箇所を同時更新する。

### Consequences
- 良い点: トークンの SSOT を汚さない。Apple Calm の「セマンティックカラーを増やさない」方針と整合。
- トレードオフ: 実装 #201 で新トークンが本当に要ると判明したら追補が必要になる。本 Issue では過剰先取りを避ける。

---

## ADR-003: conflict の「あり版」field 開示はビジュアル提示に留め、採否は #201 に委ねる

### Status
Proposed

### Context
conflict（例: username / email の重複）を field 直下に紐付けて開示すると、未ログインの第三者にアカウント存在を教える列挙攻撃のリスクがある。現実装は汎用 summary（なし版）で抽象化している。Issue は「両パターンの UI を用意するに留める」と明記し、抽象化の維持/緩和は実装側 Issue の判断事項としている。

### Decision
「なし版（fallback / 現実装の既定）」と「あり版（field 直下開示）」の両 UI をモックとして提示する。あり版には「列挙攻撃リスクを踏まえた採否は #201 で判断する」旨をファイル内コメントで明記する。

### Consequences
- 良い点: Issue 制約に忠実。#201 がビジュアルを見ながらセキュリティ判断を下せる。
- トレードオフ: モックだけ見るとどちらが既定か紛らわしい。コメントとキャプションで「なし版が現実装の既定」と明示して緩和する。

---

## ADR-004: P03 未認証 callout の配色は実装（neutral surface + accent アイコン）に合わせる

### Status
Proposed

### Context
既存モック `P03-login.html` の `.callout` は `--color-warning-surface` 背景 + `--color-warning` アイコン（warning 配色）。一方、実装 `app/components/auth/styles.ts` の `CALLOUT` は `bg-surface`（中立グレー）+ `CALLOUT_ICON` = `text-accent`（アクセント色）で、配色が乖離している。本 Issue は設計成果物（あるべき姿）を起こすものであり、#201 がこのモックを実装の参照にする前提のため、どちらを正準とするか決める必要がある。

### Decision
実装に合わせ **neutral surface + accent アイコン**を正準とする。未認証は「ユーザー操作の不備」ではなく「メール未確認状態の次の行動案内」であり、warning の強い注意喚起トーンより neutral + accent の方が §フィードバック原則の polite 案内と Apple Calm（強い赤・黄を多用しない）に整合する。`role="status"`（polite）も維持する。

### Consequences
- 良い点: 実装の現状と一致し #201 でのブレを防ぐ。Apple Calm トーンと整合。
- トレードオフ: 既存モックの warning 配色を変更するため、視覚的にやや控えめになる。緩和: アイコン + プレフィックス文言で「メール確認が必要」という意味は十分伝わる。critique/polish ゲートで最終確認する。
