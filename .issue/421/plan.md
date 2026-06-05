# 実装計画 — Issue #421: [a11y] AccountDeleteForm のサーバーエラー時もダイアログを閉じず in-dialog 表示する（#98 フォローアップ）

**Issue:** #421
**作成日:** 2026-06-06
**複雑度:** 小規模

---

## 目的

`AccountDeleteForm` の削除確認ダイアログで非 validation（サーバー）エラーが起きたとき、現状の `setConfirmOpen(false)`（ダイアログを閉じて外側 summary に表示）をやめ、ダイアログを開いたまま in-dialog にエラーを表示する。Issue #98 / PR #420 が他の全削除フローで統一した「モーダル消失＝成功」誤認の解消パターンを、唯一据え置かれていたこの 1 箇所に適用する。

validation エラー（ユーザー名不一致）の入力欄近接表示（`aria-describedby`/`aria-invalid` による `fieldErrors` の近接結合）は #98 ADR-003 で守ると決めた a11y 構造なので、**一切変えずに維持する**。

## スコープ

### 含まれるもの

- `app/components/identity/AccountDeleteForm/index.tsx` 1 ファイルの改修
  - 非 validation エラー時の `setConfirmOpen(false)` 抑止（ダイアログを開いたまま保つ）
  - 非 validation エラーを `ConfirmDialog` の `error?` prop で in-dialog 表示（validation `fieldErrors` は従来どおり入力欄近接）
  - `onClose`（`closeDialog`）でのエラー破棄をダイアログ境界のライフサイクルに統一（#98 ADR-005 の不変条件と整合）
  - 外側 summary（`role="alert" aria-live="polite"`）の撤去 と不要になった import の整理
- 回帰テスト（後述、可能な範囲で）

### 含まれないもの

- `ConfirmDialog` 本体の変更（`error?` prop は #98 で実装済み・そのまま使う）
- validation `fieldErrors` の入力欄近接構造の変更（#98 ADR-003 で意図的に維持）
- C 群（PromptsForm / DesignTokensForm）など削除フロー以外（#98 ADR-003 で対象外）

## 実装ステップ

### 1. 非 validation エラーを in-dialog 表示へ切替（`error?` prop の活用）

- **対象ファイル:** `app/components/identity/AccountDeleteForm/index.tsx`
- **変更内容:**
  - 外側 summary 用の `summary` 計算（`error !== null && fieldErrors === undefined ? displayError(error) : ""`）と、それを描画する `<p role="alert" aria-live="polite">` ブロックを撤去する。
  - `ConfirmDialog` に `error` prop を渡す。validation の入力欄近接表示と排他にするため、`fieldErrors === undefined`（= 非 validation、または confirmation fieldErrors を持たないエラー）のときだけ渡す。A 群と同じく dialog-open でゲートする:
    ```tsx
    error={confirmOpen && fieldErrors === undefined ? (error ?? undefined) : undefined}
    ```
  - これにより validation エラー（`fieldErrors !== undefined`）は従来どおり `description` 内の入力欄近接 `<p id={errorId} role="alert">` に出て、`error?` prop へは渡らない（入力欄から離れない）。非 validation は `ConfirmDialog` の共通 in-dialog エラー領域（description と action row の間、入力欄の直下）に出る。
- **理由:** 既存の共通 `error?` prop を再利用することで、`displayError` 文言・`role="alert"`・`aria-describedby` 組み込みを A 群と一元化できる。サーバーエラーは入力欄の直下に出るため、ADR-003 が懸念した「入力欄からエラー位置が離れる」問題は validation に限った話で、非 validation では発生しない。

### 2. catch の close 抑止

- **対象ファイル:** 同上（`onConfirm` の catch）
- **変更内容:** catch 内の `isFieldValidation` 判定と `setConfirmOpen(false)` を削除し、`setError(extractSerializedError(e))` のみにする（A 群と同形）。表示先（入力欄近接 / in-dialog）は render 側の `fieldErrors` 分岐が決めるため、catch で分岐する必要はない。
- **理由:** 「サーバーエラー＝ダイアログ消失」を止め、視覚ユーザーの誤認を解消する（Issue 主眼）。

### 3. ダイアログ境界でのエラーライフサイクル統一

- **対象ファイル:** 同上（`closeDialog`）
- **変更内容:** `closeDialog` に `setError(null)` を追加する（現状の「error は保持」コメントを撤去）。open トリガー（「続けて削除する」ボタンの `onClick`）は既に `setError(null)` 済みなので、open / close 両境界で「ダイアログ境界＝error 破棄」の不変条件が成立する（#98 ADR-005 と対称）。
- **理由:** in-dialog 化により error は「開いているダイアログの結果」だけを指すべき。閉じる＝そのエラーを破棄、で A 群と挙動を揃える。外側 summary を撤去した以上、error を閉じた後まで保持する理由がなくなる。

### 4. import の整理

- **対象ファイル:** 同上
- **変更内容:** summary 撤去で未使用になる `displayError`（`@/core/presentation/errorDisplay`）と `FIELD_ERROR`（`../styles`）の import を削除する。`extractSerializedError` / `SerializedError` / その他は引き続き使用。
- **理由:** lint（biome）の未使用 import 検出を通すため。

### 5. 回帰テスト（可能な範囲で）

- **対象ファイル:** `app/components/identity/AccountDeleteForm/__tests__/index.test.tsx`（新規・実現可能なら）
- **変更内容:** `ConfirmDialog.test.tsx` と同じ happy-dom / react-dom 構成で、(a) ユーザー名不一致 confirm → ダイアログが開いたまま入力欄近接に validation エラー、(b) ユーザー名一致だが `deleteAccount` が reject → ダイアログが開いたまま in-dialog `role="alert"` にサーバーエラー文言、(c) cancel（onClose）でエラーが破棄される、を検証する。`useServerFn`/`useRouter`/`deleteAccountFn` は `vi.mock` でスタブ。
- **理由:** 「サーバーエラーで閉じない」不変条件の回帰を防ぐ。`useServerFn`/`useRouter` のモックが過度に重い場合は testing.md のブラウザ検証に委ね、本ステップは見送る（その判断は adr.md に記録）。

## 設計判断

詳細は `.issue/421/adr.md` を参照。

- **ADR-001:** 非 validation エラーは `ConfirmDialog` の既存 `error?` prop で in-dialog 表示する（`description` 内に summary alert を新設しない）。`fieldErrors === undefined` で validation の入力欄近接表示と排他にする。

## リスクと注意点

- **二重表示の回避:** validation エラーが `error?` prop と入力欄近接の両方に出ないよう、`fieldErrors === undefined` ゲートを必ず通す。`onConfirm` のローカル validation は常に `fieldErrors`（confirmation）を持つので入力欄側のみに出る。
- **stale error 漏れの回避:** open トリガーの `setError(null)`（既存）と `closeDialog` の `setError(null)`（追加）で、ダイアログを開いた瞬間は必ず error クリア済み。A 群と同じく dialog-open ゲート（`confirmOpen &&`）も併用して二重に防ぐ。
- **aria-describedby の重複:** `ConfirmDialog` 側の `aria-describedby`（panel）は description + error の id を織り込む。入力欄側の `aria-describedby`（errorId/hintId）は別系統で、非 validation 時は `fieldErrors === undefined` なので errorId は載らず hintId のみ。両者は独立しており競合しない（#98 ADR-005 で「実フローで二重読み上げは起きない」と分析済みの構造を踏襲）。
- **フォーカス:** エラーは「開いているダイアログでの submit 失敗時」に動的描画され、その瞬間 `isPending=false` で focus は confirm ボタン（panel 内）に留まる。`role="alert"` が announce するため SR にも届く。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。
- 上記ステップ 5 の回帰テスト（実現可能なら）を `pnpm test:unit` で緑にする。既存テストの回帰がないことを確認。
- ブラウザ検証は `.issue/421/testing.md` に従う（サーバーエラー時にダイアログが閉じず in-dialog にエラーが出ること、validation エラーが従来どおり入力欄近接に出ること、cancel でエラーが消えること）。
