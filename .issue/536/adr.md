# ADR — Issue #536: 全画面のモバイル向けモックを作成する

## ADR-001: mock化の手段は別途 `mobile/{name}.html` を新規作成する

### Status
Accepted（ユーザー承認済み 2026-06-08）

### Context
Issue 本文が「既存ファイルにモバイル breakpoint を作り込むか、`mobile/*.html` を別途用意するか」を着手時の決定事項として残していた。49画面という規模、受け入れ基準（390px目視で overflow=0）、既存 desktop モックの巨大さ（最大48k）を踏まえ選択する必要があった。

### Decision
**別途 `mobile/{name}.html` を新規作成**する。各画面を独立に 390px 実体として生成し、既存 desktop モックには一切触れない。

### Consequences
- 良い点: サブエージェントが1枚ずつ独立生成でき desktop 挙動を壊すリスクがない / レビューが「390pxで開いて overflow=0」とシンプルで受け入れ基準に直結 / 並列で大規模を回せる。
- トレードオフ: desktop/mobile の二重管理（将来どちらかが古くなるリスク）。ただし本Issueは一発でモバイル設計を固めるのがゴールで、`app/` 実装時は両方を参照し1つのレスポンシブCSSへ統合される流れのため、モック段階では問題にならない。

---

## ADR-002: トークンは各 mobile ファイルへ inline 複製する

### Status
Accepted

### Context
mobile ファイルでデザイントークンをどう持つか。共有CSS化 / 各ファイルへ複製の選択肢。

### Decision
対応 desktop ファイルの `:root` トークンブロック（`tokens.md §11` の最終形）を**各 mobile ファイルへ逐語コピー**する。新トークンは追加しない。

### Consequences
- 良い点: `index.md §9`「各HTMLを依存なし単一ファイルで表示可能に」と整合 / SSOT は `tokens.md` で一意。
- トレードオフ: トークン更新が全ファイルへ波及。生成時にコピー元 desktop を明示して差分を防ぐ。

---

## ADR-003: ダイアログ/showcase 系も独立 mobile ファイルにする

### Status
Accepted

### Context
desktop 側でダイアログは単独ファイル（state-grid showcase 含む）として存在。mobile を親画面に内包するか独立ファイルにするか。

### Decision
**独立した `mobile/{name}.html` を作る**。showcase/state-grid 系（move/note-picker/save-view/confirm/filterbar）は mobile でも複数ステートを縦1カラムで並べたまま、各ダイアログをボトムシート表現にする。

### Consequences
- 良い点: desktop と 1:1 対応が明快で「全49本存在」を機械照合できる / state 比較カタログの意図を保持。
- トレードオフ: ファイル数が多い（49本）。チェックリストで管理する。

---

## ADR-004: admin mobile はタッチ床44pxを採る

### Status
Accepted

### Context
admin の desktop は密度優先でタッチ床24pxを許容（`index.md §7.1`）。mobile でどう扱うか。

### Decision
mobile ファイルでは **44px タッチ床**を採る（`§3` のタッチ主体文脈の原則に従う）。

### Consequences
- 良い点: モバイル実機での誤タップ回避。WCAG AAA 目標に整合。
- トレードオフ: desktop と密度が異なるが、これは文脈差（マウス精度 vs タッチ）の反映でありデグレではない。
