# ADR — Issue #257: アップロードモーダルのレスポンシブ改善

## ADR-001: `Dialog` API は変えず `dialog` クラスに `flex flex-col` を付与する

### Status

Accepted

### Context

`IngestionPreviewForm` の二重スクロール / sticky action bar 浮きを解消するには、modal panel の中で「スクロール領域 + 固定 footer」の layout を表現する必要がある。選択肢：

- A. `Dialog` を slot 化（`header` / `body` / `footer` props を導入）し、各 slot で flex 配置を組む
- B. `Dialog` の panel を flex column 化（`dialog` クラスに `flex flex-col`）し、layout 構築は consumer 任せ
- C. 既存どおり sticky bottom + 内部 max-h スクロールを維持し、CSS だけで誤魔化す

### Decision

**B**。`dialog` クラスに `flex flex-col` を付与し、`Dialog` の API は変えない。`overflow-y-auto` は維持する（IngestionPreviewForm パスでは事実上 dead code、他 consumer ではフォールバック）。

### Consequences

- 良い点:
  - `Dialog` の API 互換が完全に保たれる（全 8 consumer は children を渡すだけのまま）
  - consumer 側の layout 自由度が高い（IngestionPreviewForm は 3-part flex、他短い consumer は単純な縦並びのまま）
  - 既存テストへの影響が最小（flex column でも見た目は変わらない短い consumer。flex item では margin collapse が発生しないが、現状の Dialog consumer は全て `mt-*` / `mb-*` のみ使っており block と同じ余白で表示される）
- トレードオフ:
  - consumer 側で `flex-1 min-h-0` のような flex item 制御を書く必要がある（学習コスト）
  - flex の暗黙挙動（min-height: auto）に依存するため、長いコンテンツが入ると意図せず leak する可能性 → `min-h-0` を必ず付ける運用で対応
  - `dialog` の `overflow-y-auto` は **IngestionPreviewForm パスでは dead code 化** する（form が `flex-1 min-h-0` + 内部 `overflow-y-auto` を持つため panel level の overflow が触られない）。他 consumer（ConfirmDialog, NotePickerDialog, MoveNoteDialog, SaveViewDialog, BulkVisibilityDialog, BulkExportDialog, MergeTagDialog）では引き続き panel が overflow fallback として機能する。これは将来 consumer が新たに `overflow-y-auto` の子を作ったときに二重スクロールが復活しうるリスクと表裏 — 規約として「Dialog 内部で scroll を取りたい場合は `flex-1 min-h-0 overflow-y-auto` パターンを使い、panel の overflow を信頼しない」運用にする

A（slot 化）は API breaking で全 consumer 改修が必要、C（誤魔化し）は症状を根本的に解消しないため不採用。

`dialog` の `overflow-y-auto` を完全撤廃する案も検討したが、`BulkExportDialog` のような縦に長い consumer で切れるリスクがあり、影響範囲を見極めずに切ると regression を生む可能性があるため見送った。

---

## ADR-002: `pillBtn` (common) と `PILL_BTN` (layout) の統合は本 Issue では行わない

### Status

Accepted

### Context

Issue #257 の Resp-H2 提案には「`pillBtn` / `PILL_BTN` を 1 系統に集約する」案がある。実態として：

- `pillBtn`: `app/components/common/styles.ts` で定義。`ConfirmDialog`, `UploadDialog` など共通 UI で使用
- `PILL_BTN`: `app/components/layout/styles.ts` で定義。`IngestionJobRow`, `IngestionPreviewForm` などレイアウト隣接 UI で使用

両者は class 文字列がほぼ重複し、唯一の差分は `PILL_BTN` のみが `max-sm:min-h-[44px]` を持つ点。

### Decision

本 Issue では**統合せず**、`pillBtn` 側にモバイル `min-h-[44px]` を追加するだけに留める。統合タスクは **Phase 4 で本リポジトリに別 Issue を起票** する。

### Consequences

- 良い点:
  - 本 Issue の意図（モバイル 44px 不揃い解消）は最小修正で達成
  - 影響範囲が `pillBtn` の class 定義 1 行（`pillBtnDanger` への波及含む）に収まる
  - 統合判断（どちらに寄せるか、`pillBtnPrimary` / `pillBtnDanger` をどう移すか）を別途じっくり議論できる
- トレードオフ:
  - 2 系統の重複は残るため、将来的にもう一方だけ更新されると再び乖離するリスク → 統合 Issue を Phase 4 で起票することで forget 防止

---

## ADR-003: safe-area-inset 対応のため viewport meta に `viewport-fit=cover` を追加する

### Status

Accepted

### Context

`IngestionPreviewForm` の action bar の `padding-bottom` に `max(1rem, env(safe-area-inset-bottom))` を入れることで iOS Safari の home indicator と action bar の重畳を避けたい。しかし iOS Safari は viewport meta に `viewport-fit=cover` が含まれていないと `env(safe-area-inset-*)` を常に `0` として返す。

現状 `app/core/presentation/head.ts:55` の viewport meta は `width=device-width, initial-scale=1` のみで `viewport-fit=cover` が無いため、`env(safe-area-inset-bottom)` が `0` になり、`max(1rem, 0)` が常に `1rem` になって safe-area 対応が無効化される。

### Decision

`app/core/presentation/head.ts:55` の viewport meta に `viewport-fit=cover` を追加し、`env(safe-area-inset-*)` を実機で有効化する。

### Consequences

- 良い点:
  - action bar の `pb-[max(1rem,env(safe-area-inset-bottom))]` が実機 iPhone で意図どおり home indicator を回避する
  - 全ページに viewport-fit=cover が適用されるため、今後 safe-area を意識した layout を組むときの土台が整う
- トレードオフ:
  - 横向き iPhone で notch / Dynamic Island 領域に背景が露出する可能性。body 背景が `--color-bg` 単色で統一されている現状で視覚的 regression は想定しないが、Phase 2 で目視確認する
  - これは見た目の僅かな変更を含む可能性のある決定だが、Issue の「やること」に「safe-area-inset の対応確認」が明記されており、対応自体が無効化される状態を放置するほうが Issue 意図に反する
