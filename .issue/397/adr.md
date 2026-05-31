# ADR — Issue #397: 管理画面のデザイントークン設定で既定値が表示されず「既定値を上書きする」UXになっていない

## ADR-001: 既定値マップは手書き定数 + tokens.css 整合性テストで担保する

### Status
Proposed

### Context
「既定値を UI に見せて上書きする」UX を実装するには、コードから参照可能な「キー→既定値」マップが必要。現状ビルトイン既定値は `app/styles/tokens.css`（CSS SSOT）と `spec/design/tokens.md`（ドキュメント）にしか存在しない。コードに既定値を持たせると tokens.css との二重管理が発生する。選択肢:

- 案A: 手書き定数（domain）+ tokens.css をパースする整合性テスト
- 案B: ランタイムで tokens.css をパースして導出
- 案C: ビルド時に tokens.css → TS 定数を codegen

### Decision
**案A** を採用する。`BUILTIN_DESIGN_TOKENS` を手書き定数として domain に置き、`tokens.css` との値整合を単体テストで機械検出する。

- 案B は domain/usecase が CSS ファイル I/O に依存し、純粋性・テスタビリティ・Cloudflare Workers 互換（ファイルシステム前提なし）を損なうため却下。
- 案C は真の単一ソースになるがビルドパイプライン追加が Issue スコープに対し過剰なため却下。

### Consequences
- 良い点: domain が純粋なまま（実行時 CSS パース不要）。prompts の `BUILTIN_PROMPT_DEFAULTS` と同じ「手書き定数 SSOT」パターンで一貫。
- トレードオフ: 二重管理は残るが、整合性テストが CI でドリフトを即検出するため実害を抑えられる。テストだけが `fs.readFileSync` で tokens.css を読む。

---

## ADR-002: 定義場所は domain `defaults.ts`、上書き対象は spec §12 の curated subset

### Status
Proposed

### Context
既定値マップをどのレイヤーに置くか、また `tokens.css` の約90トークンのうちどれを上書き対象（フォーム表示対象）にするか。`spec/design/tokens.md` §12 は上書き対象を「Color: brand / Color: neutral / Radius / Typography(`--font-sans`) / Color: code」と定めている。

### Decision
- **定義場所は domain `app/core/domain/adminSettings/defaults.ts`**。「上書き対象トークンの集合」は adminSettings ドメインの業務概念であり、prompts の既定（`BUILTIN_PROMPT_DEFAULTS`）が既に同ファイルにある。CLAUDE.md の `app/lib/` は「全レイヤー共通の構造プリミティブ」用途なので不適。
- **上書き対象は spec §12 の curated subset に限定**。全90トークンではなく brand(6)/neutral(9)/radius(7)/`--font-sans`(1)/code(4) = 計27トークン。
- **除外:** `var(...)` 参照値（`--code-comment` = `var(--color-ink-tertiary)`, semantic の `--color-info` = `var(--color-accent)`）は、別トークンへの参照を既定値として編集させると意味が不明瞭になるため除外。breakpoints（`--bp-*`）は media-query 用リテラルで `:root` 上書きが効かないため除外。spacing/typography scale/shadow/motion など spec §12 が上書き対象に挙げないものも除外。

### Consequences
- 良い点: フォームに表示するトークン数が現実的（27）で、spec の意図どおりの curated set。prompts と同一レイヤーで一貫。
- トレードオフ: 将来上書き対象を増やす場合は `BUILTIN_DESIGN_TOKENS` への追記が必要（が、それが SSOT 化された明確な拡張点になる）。

---

## ADR-003: 既定同値フィルタは application usecase に配置する

### Status
Proposed

### Context
「既定値そのままの行は DB に永続化しない」要件をどのレイヤーで実現するか。既定マップ `BUILTIN_DESIGN_TOKENS` を知っているのは domain だが、`DesignTokens` VO はこれまで「永続化される override 集合」を表す純粋な値オブジェクトだった。

### Decision
フィルタは **application 層の `updateDesignTokens` usecase** で行う。受け取った tokens から `BUILTIN_DESIGN_TOKENS` と完全一致するエントリを除外してから `DesignTokens.create` に渡す。フォーム側でも既定同値・空値の行は送らない（二重防御）。

### Consequences
- 良い点: domain の `DesignTokens` VO を「永続化 override 集合」という意味で純粋に保てる（既定マップ依存を持ち込まない）。既定マップ知識を application に局在化。import 方向は application→domain で正しい。
- トレードオフ: フィルタ責務が usecase に乗るが、prompts の reset/override 判定も application/DTO 層で行っており一貫している。
