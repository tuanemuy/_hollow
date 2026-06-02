# ADR — Issue #98: [a11y] ConfirmDialog エラー時のフォーカス管理と in-dialog エラー表示

## ADR-001: エラー時はダイアログを閉じず `error?: SerializedError` で in-dialog 表示する（#55 ADR-003 を上書き）

### Status
Proposed

### Context
Issue #55 ADR-003 は「`ConfirmDialog` は `error` props を持たず、削除エラー時はダイアログをクローズして親側の行内 `FORM_ERROR`（role="alert"）でエラー表示する」設計を採用した。SR には伝わるが、視覚ユーザーは「モーダル消失＝成功」と誤認しうる、フォーカス遷移が不定、というフォローアップ課題が Issue #98 として残された。

選択肢:
1. `error?: SerializedError` prop を追加し、エラーをダイアログ内に表示してダイアログを閉じない
2. フォーカス管理のみ追加（クローズ時に trigger へフォーカス復帰）
3. 共通 `<Dialog>` ラッパー導入後の一括対応（Issue #54）

調査の結果、**選択肢2（フォーカス復帰）と選択肢3（focus trap/Esc/Portal）は既に `app/components/common/Dialog.tsx` に実装済み**だった（`previousActiveRef` の cleanup で trigger へ復帰、`role="alertdialog"` で panel へ初期フォーカス）。

### Decision
**選択肢1を採用し、#55 ADR-003 を上書きする。** `ConfirmDialog` に `error?: SerializedError` prop を追加し、エラーをダイアログ内に `role="alert"` で表示する。呼び出し側は catch から close を除き、成功時のみダイアログを閉じる。エラー時はダイアログが開いたまま残るため、視覚ユーザーも誤認しない。フォーカスは `alertdialog` で panel 内に留まり、`aria-describedby` に error id を追加して SR が description→error を辿れるようにする。

**キャンセル時のエラー破棄**: 共有 `error` state（rename/commit 等と削除で同一 state）を持つ呼び出し側では、エラーをダイアログ内に出した後ユーザーがキャンセルで閉じると、`error` state が残ったまま `confirmOpen=false` になり、行内 `FORM_ERROR` に同じエラーが「移動」再表示される。これを避けるため、移行対象の `onClose` ハンドラで `setError(null)` を呼び、ダイアログを閉じる＝そのエラーを破棄する挙動に統一する。

### Consequences
- 良い点:
  - 視覚ユーザーの「消失＝成功」誤認を解消
  - フォーカスがダイアログ内に留まる（既存 Dialog の挙動と整合）
  - 呼び出し側のエラー処理が `error?` prop で統一される
- トレードオフ:
  - #55 ADR-003 の「エラー時クローズ」方針を反転する（意図的な上書き）
  - 成功時 close のため、各 A 群呼び出し側で「先に close→run」を「run 成功で close」へ書き換える必要がある。close の所在はファイルごとに異なる（TagActions は catch、他7は onConfirm）ため、grep で確認しながら改修する

---

## ADR-002: `error` prop は `SerializedError` 型で受ける（ReactNode 不可）

### Status
Proposed

### Context
ConfirmDialog の `description` は既に `React.ReactNode` 型で、B 群（DeleteDirectoryDialog / AccountDeleteForm）はその中にエラー UI を ad-hoc に埋め込んでいた。error も ReactNode で受ければ呼び出し側の自由度は高いが、表示マークアップ・`role="alert"`・パレットが呼び出し側ごとにバラつく。

### Decision
**`error?: SerializedError` 型で受け、ConfirmDialog 内で `displayError(error)` してレンダリングする。** 表示文言生成とマークアップを共通コンポーネントに一元化する。呼び出し側は state（`SerializedError | null`）を `error ?? undefined` で渡すだけ。

### Consequences
- 良い点:
  - 型安全（Issue 文言通り）。`role="alert"`・パレット・`aria-describedby` 組み込みが共通化され一貫する
  - 呼び出し側の `displayError` 重複を削減
- トレードオフ:
  - fieldErrors を入力欄近接で出す必要がある `AccountDeleteForm` には合わない → ADR-003 で据え置き

---

## ADR-003: AccountDeleteForm は据え置き、C 群は非対象

### Status
Proposed

### Context
`AccountDeleteForm` は確認入力欄 + validation `fieldErrors` を `description` 内に持ち、`aria-describedby`/`aria-invalid` で入力欄とエラーを近接結合している。`error?` prop（dialog 末尾の summary 表示）へ寄せると、入力欄からエラー位置が離れ a11y が後退する。`PromptsForm`/`DesignTokensForm`（C 群）は削除でなく reset 確認で、エラーはフォーム本体に出る設計。

### Decision
- `AccountDeleteForm` は `error?` prop へ全面移行しない。fieldErrors の近接構造を維持する。非 validation エラー時の `setConfirmOpen(false)`（誤認型）の close 抑止のみ軽微修正の余地があるが、複雑度が高い場合は次 Issue 送りとし ADR に明記する。
- C 群（PromptsForm / DesignTokensForm）は本 Issue の対象外（削除フローでない）。

### Consequences
- 良い点: Issue 主眼（削除フローの誤認解消）に集中し、複雑な a11y 構造を壊さない
- トレードオフ: 呼び出し側のエラー表示が完全には一元化されない（B 群一部・C 群は従来形のまま）

実装結果: `AccountDeleteForm`（B 群）と C 群（PromptsForm / DesignTokensForm）はいずれも本 Issue では未着手で据え置いた。AccountDeleteForm の非 validation close 抑止も複雑度を踏まえ次 Issue 送りとする。

---

## ADR-004: 実装時の追補（prop 型・二重表示抑止ガード・テスト）

### Status
Accepted（実装で確定）

### Context
ADR-001/002 の方針を A 群 8 ファイルへ適用する際、計画の擬似コードでは詰め切れていなかった 2 点が型・挙動上の論点になった。

1. **`error?` prop の型**: ガード式 `confirmOpen ? (error ?? undefined) : undefined` は `SerializedError | undefined` を生む。本プロジェクトは `exactOptionalPropertyTypes: true` のため、`error?: SerializedError`（省略可だが値に `undefined` 不可）には明示 `undefined` を渡せず TS2375 になる。
2. **行内エラーとの二重表示**: A 群は共有 `error` state を行内 `FORM_ERROR` でも描画している。dialog 側へ `confirmOpen ? error : undefined` ガードを付けても、行内側は `error !== null` のままだと「dialog 内 + 行内」で二重に出る。

### Decision
1. prop 型を `error?: SerializedError | undefined` とし、明示 `undefined` を許容する（呼び出し側のガード式をそのまま使える）。
2. 各 A 群ファイルの行内エラー描画条件を `error !== null && !<該当 confirmOpen>` に変更し、dialog が開いている間は行内を抑止する。`SavedViewsList` は summary（`error !== null && nameFieldErrors === undefined`）に同条件を追加。rename の validation `fieldErrors` は元々入力欄直下に出る別系統なので無変更。

### Consequences
- 良い点: 排他ガードが dialog 側（表示先の切替）と行内側（抑止）の両輪で成立し、二重表示が確実に消える。`displayError` 文言・`role="alert"` マークアップは ConfirmDialog に一元化される。
- トレードオフ: 行内描画条件に dialog state への依存が 1 つ増える（各ファイルにコメントで意図を明記）。

### テスト
`app/components/common/__tests__/ConfirmDialog.test.tsx` を新設（Dialog.test.tsx と同じ happy-dom / react-dom 構成）。(a) error 指定で `role="alert"` 領域が `displayError` 文言付きで描画、(b) error 指定でも panel が mount 維持、(c) `aria-describedby` に description と error の 2 id、(d) error 未指定で alert なし・id は 1 つ、(e) confirm 押下で `onConfirm` 発火かつ panel は閉じない、の 5 本。`SerializedError` モックは `{ kind: "system", code: null, message: "System error" }` を使用（`displayError` が固定文言「システムエラーが発生しました」に写像）。`IngestionPreviewForm.test.tsx` を含む既存 3035 テストは全緑（回帰なし）。

---

## ADR-005: レビュー指摘の判断（stale error 破棄・a11y 三者重複）

### Status
Accepted（レビュー#001 で確定）

### Context
PR レビュー#001 で以下が指摘された:
1. **ST-B-001（Blocker）**: 共有 `error` state を持つ呼び出し側で、削除以外の操作が失敗してエラーが残った状態で削除ダイアログを開くと、`error={confirmOpen ? error : undefined}` ガードにより未確認の確認ダイアログ内へ無関係な stale error が漏れる。
2. **FA-W-001/W-002**: `alertdialog` 内に `role="alert"` をネストし `aria-describedby` にも errorId を載せる三者重複で二重読み上げの懸念。エラー再描画後のフォーカス保証。

### Decision
1. **ST-B-001**: 各削除/破棄/パージボタンの open ハンドラに `setError(null)` を追加し、「確認ダイアログを開く＝前操作の error を破棄」を不変条件にする。onClose 側の既存 `setError(null)` と対称化し、ダイアログ境界で error をライフサイクル管理する。対象: IngestionJobRow / IngestionPreviewForm / SavedViewsList / TagActions / NoteActions / TrashRowActions。回帰テストを IngestionJobRow に1本追加。
2. **FA-W-001/W-002**: `role="alert"`（動的 announce の実機構）と `aria-describedby` の errorId（alertdialog APG 準拠）はいずれも維持する。エラーは「ダイアログ開後の失敗時」に動的描画され、その瞬間 isPending=false で focus は confirm ボタン（panel 内）に留まり移動しない。`aria-describedby` は focus 入場時にのみ読まれるため再読み上げは発火せず、実フローで二重読み上げは起きない。focus も panel 内に留まり `role="alert"` で情報も届くため機能的後退なし。よってコード変更なし。

### Consequences
- 良い点: 確認ダイアログが表示するのは「その confirm 操作の結果」だけ、という不変条件が open/close 両境界で成立。a11y は live region と describedby の役割分担が APG 準拠で、実フローで重複読み上げが起きないことを分析で確認。
- トレードオフ: 各 open ハンドラに `setError(null)` が1行増える（uniform な invariant のため許容）。
