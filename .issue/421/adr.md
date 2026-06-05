# ADR — Issue #421: AccountDeleteForm のサーバーエラー in-dialog 表示

## ADR-001: 非 validation エラーは `ConfirmDialog` の既存 `error?` prop で表示する

### Status
Proposed

### Context
Issue #98 ADR-003 は `AccountDeleteForm` を `error?` prop へ「全面移行しない」と決めた。理由は、確認入力欄の validation `fieldErrors` を `aria-describedby`/`aria-invalid` で入力欄に近接結合しており、`error?` prop（dialog 末尾の summary 表示）へ寄せると validation エラーが入力欄から離れて a11y が後退するため。

本 Issue（#421）はそのうち「非 validation エラー時の `setConfirmOpen(false)`（誤認型 close）」だけを解消する。設計の選択肢:

1. 非 validation エラーだけを `ConfirmDialog` の既存 `error?` prop へ渡し、validation `fieldErrors` は入力欄近接のまま維持する（両者を `fieldErrors === undefined` で排他化）
2. `description` 内に独自の summary alert を新設し、非 validation エラーをそこに描画する

### Decision
**選択肢 1 を採用する。** `error={confirmOpen && fieldErrors === undefined ? (error ?? undefined) : undefined}` でゲートし、validation（`fieldErrors !== undefined`）のときは `error?` prop へ渡さず入力欄近接表示を維持、非 validation のときだけ `error?` prop に渡して in-dialog 表示する。

ADR-003 が `error?` prop を避けた理由は **validation エラーの位置後退** であり、これは選択肢 1 でも回避される（validation は従来どおり入力欄近接）。非 validation サーバーエラーは入力欄の直下（`ConfirmDialog` の description と action row の間）に出るため位置後退の問題はなく、むしろ `displayError` 文言・`role="alert"`・`aria-describedby` 組み込みを A 群と一元化できる。選択肢 2 は同等の UI を独自マークアップで再実装することになり、共通化の利点を捨てる。

あわせて、A 群（NoteActions 等）と同じく `closeDialog` に `setError(null)` を加え、open トリガーの既存 `setError(null)` と対称化して「ダイアログ境界＝error 破棄」の不変条件（#98 ADR-005）を成立させる。外側 summary（`role="alert" aria-live="polite"`）は in-dialog 化により描画経路が無くなるため撤去する。

### Consequences
- 良い点:
  - Issue 主眼（サーバーエラー時の「消失＝成功」誤認）を解消しつつ、#98 ADR-003 が守った validation の入力欄近接構造を一切壊さない
  - エラー表示が A 群と同じ共通 `error?` prop に乗り、`displayError`/`role="alert"`/`aria-describedby` が一貫する
  - `catch` から表示先分岐（`isFieldValidation`）が消え、表示ルーティングは render 側の `fieldErrors` 分岐に一元化される
- トレードオフ:
  - 行内エラー描画条件に dialog-open 依存（`confirmOpen &&`）が 1 つ増える（A 群と同じ stale 漏れ防止ガード。意図をコメントで明記する）

---
