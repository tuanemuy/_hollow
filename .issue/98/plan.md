# 実装計画 — Issue #98: [a11y] ConfirmDialog エラー時のフォーカス管理と in-dialog エラー表示

**Issue:** #98
**作成日:** 2026-06-02
**複雑度:** 中〜大規模

---

## 目的

`ConfirmDialog` を使う削除（破棄/リセット）フローで、サーバーエラー発生時に「モーダル消失＝成功」と視覚ユーザーが誤認する問題を解消する。`ConfirmDialog` に `error?: SerializedError` prop を追加し、エラーをダイアログ内に `role="alert"` で表示してダイアログを閉じない設計に統一する。フォーカス復帰（trigger への復帰）と focus trap / Esc / Portal は既存 `app/components/common/Dialog.tsx` で実装済みのため再実装しない。

## スコープ

### 含まれるもの

- `ConfirmDialog` に `error?: SerializedError` prop を追加し、in-dialog でエラーを `role="alert"` 表示する
- close-on-error 型（A 群）の mutation 呼び出し側を「成功時のみ close、エラー時は開いたまま dialog 内表示」へ移行する
- 既に `description` 内で ad-hoc にエラー表示している `DeleteDirectoryDialog`（B 群）を新 prop へ移行する
- ConfirmDialog の error 表示・閉じない挙動のユニットテスト追加

### 含まれないもの

- focus trap / Esc / Portal / フォーカス復帰の実装（Issue #54 で `Dialog.tsx` に実装済み）
- `AccountDeleteForm`（B 群）の全面移行 — fieldErrors の入力欄近接表示が `description` 内に密結合しており、`error?` prop へ寄せると a11y 後退。非 validation エラー時の close 抑止のみ軽微修正（下記 ADR 参照、リスク次第で次 Issue 送り）
- `PromptsForm` / `DesignTokensForm`（C 群）— reset 確認であり削除フローでなく、エラーはフォーム本体に出る設計。スコープ外
- 行内 `FORM_ERROR` ブロックの全面撤去（dialog 内表示と排他ガードで二重表示は防ぐが、ブロック削除は別整理）

## 呼び出し側の分類

**A 群（close-on-error 型 → 移行対象）**: catch で `setConfirmOpen(false)` し行内 `FORM_ERROR role="alert"` で表示。「モーダル消失＝成功」誤認型。
- `app/components/tag/TagActions.tsx`
- `app/components/note/detail/NoteActions.tsx`
- `app/components/trash/TrashRowActions.tsx`
- `app/components/note/list/BulkActionBar.tsx`
- `app/components/note/history/NoteRevisionRestorePanel.tsx`
- `app/components/ingestion/IngestionJobRow.tsx`
- `app/components/ingestion/IngestionPreviewForm.tsx`
- `app/components/view/SavedViewsList/index.tsx`

**B 群（既に in-dialog 表示・ad-hoc）**: catch で開いたまま `description` ReactNode 内に `role="alert"` を描画。
- `app/components/directory/DeleteDirectoryDialog.tsx` → 新 prop へ移行
- `app/components/identity/AccountDeleteForm/index.tsx` → 据え置き（fieldErrors 構造ゆえ。非 validation の close 抑止のみ任意修正）

**C 群（mutation を伴わない reset 確認 → 非対象）**:
- `app/components/admin/PromptsForm/index.tsx`
- `app/components/admin/DesignTokensForm/index.tsx`

## 実装ステップ

### 1. ConfirmDialog に `error?: SerializedError` prop を追加

- **対象ファイル:** `app/components/common/ConfirmDialog.tsx`
- **変更内容:**
  - `import { displayError } from "@/core/presentation/errorDisplay"` と `import type { SerializedError } from "@/core/presentation/errorResponse"` を追加
  - props に `error?: SerializedError` を追加、`errorId = useId()` を追加
  - description の直後・アクション行の直前にエラー領域を描画。スタイルは既存定数 `formError`（`app/components/common/styles.ts` の `"text-error text-[13px] mt-2"`）を再利用（生文字列を書かない＝styles.ts 集約規約）:
    ```tsx
    import { dialogActions, formError, pillBtn, pillBtnDanger } from "./styles";
    ...
    {error !== undefined ? (
      <p id={errorId} role="alert" className={formError}>
        {displayError(error)}
      </p>
    ) : null}
    ```
  - `ariaDescribedBy` を description と error の id を指すよう合成。`description` 無し・`error` だけのケースも error id が必ず載るよう `filter(Boolean).join(" ") || undefined` 形式にする:
    ```tsx
    const describedBy = [
      description !== undefined ? descId : null,
      error !== undefined ? errorId : null,
    ].filter(Boolean).join(" ") || undefined;
    ```
  - JSDoc に「error 時はダイアログを閉じない＝呼び出し側は catch から close を除く」「`isPending` と error は排他（error 到達時は transition 完了で isPending=false）」を明記
- **理由:** Issue 要件の in-dialog エラー表示の中核。`role="alert"` 単体で assertive live region になるため `aria-live` は併用しない（二重通知回避）。

### 2. A 群を「エラー時は閉じない／成功時のみ close」へ反転 + `error` prop 付与

**重要（レビュー指摘 P-001）**: A 群 8 ファイルの close は所在がバラバラ。`TagActions` だけが run 関数の **catch 内**で close、残り 7 ファイルは `onConfirm={() => { setConfirmOpen(false); run(); }}` の **onConfirm 内（実行前に同期 close）**型。`TagActions` は成功(L67)・catch(L70)の両方にある。実装前に各ファイルの close 所在を必ず grep で確認すること。改修は共通して以下の3手順:

- **手順A**: `onConfirm` から `setConfirmOpen(false)` を除き、`onConfirm={run}` の単純呼び出しにする
- **手順B**: run 関数の **catch から `setConfirmOpen(false)` を除く**（エラー時に開いたまま残す）
- **手順C**: 成功パスに close が必要なファイルだけ、run 成功末尾に `setConfirmOpen(false)` を追加（navigate / コールバックでアンマウントするファイルは不要）

各 `ConfirmDialog` には `error={confirmOpen ? (error ?? undefined) : undefined}` を渡す（開いている間だけ dialog 内表示＝共有 `error` state の行内表示との二重化を防ぐ排他ガード）。さらに **`onClose` で `setError(null)`** を呼ぶ（レビュー S-003: エラー表示中にキャンセルで閉じると `error` state が残り行内へ「移動」するのを防ぐ。閉じる＝そのエラーを破棄）。

ファイル別の成功時 close 要否（実装時に各 run 関数で要確認）:

| ファイル | close 所在（現状） | 成功時 close | error state 共有 | ガード式 |
|---|---|---|---|---|
| `tag/TagActions.tsx` | runDelete 成功+catch | **要**（invalidate のみ） | rename と共有 | `confirmDeleteOpen ? error : undefined` |
| `note/detail/NoteActions.tsx` | onConfirm | 不要（成功 navigate でアンマウント） | 共有 | `confirmDeleteOpen ? error : undefined` |
| `trash/TrashRowActions.tsx` | onConfirm | **要**（invalidate のみ） | 共有 | `confirmPurgeOpen ? error : undefined` |
| `note/list/BulkActionBar.tsx` | onConfirm | **要**（invalidate のみ） | 共有 | `confirm…Open ? error : undefined` |
| `note/history/NoteRevisionRestorePanel.tsx` | onConfirm | 不要（成功 navigate） | 共有 | ガード |
| `ingestion/IngestionJobRow.tsx` | onConfirm | **要**（discard は invalidate） | commit/discard/regenerate/retry で共有 | `confirmDiscardOpen ? error : undefined` |
| `ingestion/IngestionPreviewForm.tsx` | onConfirm | 不要（discard 成功は onDiscarded 経由） | commit/discard で共有 | `confirmDiscardOpen ? error : undefined` |
| `view/SavedViewsList/index.tsx` | onConfirm | **要**（invalidate のみ） | 共有（summary は `kind!=="validation"` 条件付き） | `confirmDeleteOpen ? error : undefined` ※注 |

- **TagActions**: 行内 `FORM_ERROR`（rename 用）は残置。排他ガードで delete 時は dialog 内のみ
- **IngestionPreviewForm**: discard は dialog 内、commit は従来どおりフォーム内 alert（ガードで分離、既存テスト不変）
- **IngestionJobRow**: error は4操作で共有。ガードで discard 失敗のみ dialog 内、他は閉じているので従来の行内表示
- **SavedViewsList**: rename validation error は dialog と無関係。ガード適用時は delete 系 error のみ dialog 内に出ることを確認

**理由:** エラー時にダイアログを残す唯一の正しい形。`closable={!isPending}` により処理中はキャンセル無効なので、ユーザーは完了（成功=close / 失敗=error表示）まで待つ一貫 UX。

### 3. DeleteDirectoryDialog を新 prop へ移行

- **対象ファイル:** `app/components/directory/DeleteDirectoryDialog.tsx`
- **変更内容:** `description` 内の error 描画ブロックを除去し `error={error ?? undefined}` を渡す。catch は既に閉じない実装なので close 変更不要。
- **理由:** ad-hoc な in-dialog 表示を標準 prop へ統一。

### 4. AccountDeleteForm の非 validation close 抑止（任意・リスク次第）

- **対象ファイル:** `app/components/identity/AccountDeleteForm/index.tsx`
- **変更内容:** 非 validation エラー時の `setConfirmOpen(false)`（誤認型）を止め、description 内 summary alert で表示。fieldErrors の既存 `aria-describedby`/`aria-invalid` 構造は不変。
- **理由:** 削除フローに該当するため理想的だが複雑度が高い。リスクが高ければ ADR で次 Issue 送りと明記。

### 5. ADR 記録

- **対象ファイル:** `.issue/98/adr.md`
- Issue #55 ADR-003 の上書き（エラー時クローズ→開いたまま in-dialog 表示）、`error` を `SerializedError` 型で受ける理由、A/B/C 群の移行スコープ、AccountDeleteForm 据え置き理由を記録。

### 6. テスト + 静的チェック

- ConfirmDialog ユニットテスト新設（下記テスト方針）
- `pnpm typecheck` / `./node_modules/.bin/biome lint --write` / `pnpm format`（rtk が biome を mangle するため biome 直叩き）

## 設計判断

詳細は `.issue/98/adr.md` を参照。要点:

- prop 型は `error?: SerializedError`（ReactNode 不可）— 型安全・`displayError` 集約
- エラー時クローズ廃止 = run 成功パスで close
- 共有 `error` state を持つ呼び出し側は `confirmOpen ? error : undefined` ガードで dialog 内と行内の二重表示を防ぐ
- マークアップは `role="alert"` のみ（`aria-live` 併用しない）、`text-error text-[13px] mt-3`

## リスクと注意点

- 共有 `error` state を持つファイルで排他ガードを入れないと dialog 内と行内で二重表示になる
- `NoteActions`/`NoteRevisionRestorePanel` は成功時 `router.navigate` でアンマウントするため close 不要。エラー時に dialog が開いたまま残るのが本 Issue の狙い（意図的変更）
- `IngestionPreviewForm.test.tsx`（commit エラーは form 内 alert）を壊さないこと。discard error をガードで分離
- `aria-describedby` 合成で空文字を渡さない（`filter(Boolean).join(" ") || undefined`）
- A 群の close は所在がファイルごとに違う（TagActions は catch、他7は onConfirm）。grep で確認してから改修すること
- 共有 `error` state を持つファイルでは `onClose` に `setError(null)` を入れ、キャンセル時のエラー残留→行内移動を防ぐ

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 2視点並列）

**修正した点**:
- **P-001（両視点）**: A 群 8 ファイルの close 所在が一律「catch」という記述が誤りだった（実際は TagActions のみ catch、他7は onConfirm 内で実行前 close）。ステップ2を3手順（onConfirm 除去 / catch 除去 / 成功時 close 追加）に分け、ファイル別の close 所在・成功時 close 要否・ガード式を表で明示した。
- **P-002（要件視点）**: 成功時 close の要否表が欠けていた → ファイル別表に「成功時 close」列を追加（navigate アンマウント型は不要、invalidate 型は要）。
- **P-002（アーキ視点）**: 新規マークアップが生文字列 `mt-3` で既存 `formError`(mt-2) と不一致・styles.ts 集約規約違反だった → 既存 `formError` 定数を再利用する形に修正。
- **S-003（アーキ視点）**: 共有 error state でキャンセル時にエラーが dialog→行内へ「移動」する副作用 → `onClose` で `setError(null)` する方針を追加（ADR-001 に追記）。
- **S-001（アーキ視点）**: `aria-describedby` 合成を `filter(Boolean).join(" ") || undefined` 形式にして「error だけ」ケースも担保。

**取り込んだ改善提案**:
- IngestionJobRow も4操作で error 共有のためガード必要（S-002/S-003）→ 表に明記。
- SavedViewsList の summary は validation 条件付きで複雑 → 表に注記。

**見送った提案**: なし（すべてスコープ内で反映）。

両視点とも「設計方向は妥当、要修正は P-001/P-002 の2点」で一致。2点とも反映済み。

## テスト方針

- **ユニット（ConfirmDialog 単体・新設）**: (a) `error` 指定時に `role="alert"` 領域が描画され `displayError` 文言を含む、(b) `error` 指定でもダイアログが mount 維持（閉じない）、(c) `aria-describedby` に description と error の id が両方含まれる、(d) `error` 未指定時は alert 領域なし
- **回帰**: `IngestionPreviewForm.test.tsx` が緑のまま。可能なら discard 失敗で dialog が閉じないテストを1本追加
- **ブラウザ検証**: 認証必須ルート手順で削除エラーを起こし「ダイアログが残る／フォーカスが panel 内に留まる／キャンセルで trigger 復帰」を確認。server-fn POST は agent-browser で 403 になるため mutation エラー誘発はユニットで担保、ブラウザは静的なエラー表示状態の見た目確認に留める
