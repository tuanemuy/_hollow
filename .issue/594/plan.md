# 実装計画 — Issue #594: 領域7（P06）モックの未追従機能（メール変更確認のアドレス差分カード）

**Issue:** #594
**作成日:** 2026-06-09
**複雑度:** 中〜大規模

---

## 目的

P06 メール変更確認画面の success 状態に、デザインモック `P06-email-change-confirm.html` の `.address-summary` 差分カード（旧アドレス→新アドレスを取り消し線で対比表示）を追従させる。そのブロッカーである「`verifyEmailChange` usecase の応答 DTO に旧/新アドレスが含まれない」を解消するため、usecase / DTO を先に拡張し、その実値を UI に配線する。

## スコープ

### 含まれるもの

- `verifyEmailChange` usecase の応答 DTO に `oldEmail` / `newEmail` を追加
- `EmailChangeConfirm/action.ts`（server function）の戻り値拡張
- `EmailChangeConfirm/index.tsx` success 状態への差分カード描画
- `auth/styles.ts` への `.address-summary` 相当スタイル定数の追加
- 既存統合テストへの DTO アサーション追記

### 含まれないもの

- P01 email 重複の field 直下開示（#201 所有）
- `_app/notes` 配下の無スタイル errorComponent（#474 所有）
- P04 / P05 パスワードリセットの form-error サマリー案D 化（モック側更新待ち）
- 差分カード以外の P06 画面要素の変更

## 実装ステップ

### 1. usecase の応答 DTO を拡張

- **対象ファイル:** `app/core/application/identity/verifyEmailChange.ts`
- **変更内容:**
  - `VerifyEmailChangeOutput` を `{ userId: string; oldEmail: string; newEmail: string }` に拡張。
  - UoW コールバックの戻り値を `updated.id` から `{ userId: updated.id, oldEmail: found.entity.email, newEmail }` に変更（`newEmail` は構築済みの `EmailAddress` 変数を流用）。
  - 関数末尾の `return` をコールバック戻り値からそのまま返す形に変更。
- **理由:** DTO 射影はアプリケーション層の責務（CLAUDE.md「DTO projection for the presentation layer lives here」）。差分カードに必要な実値の供給源。`EmailAddress` はブランド string なので追加変換不要。

### 2. server function の戻り値を拡張

- **対象ファイル:** `app/components/auth/EmailChangeConfirm/action.ts`
- **変更内容:** `return { userId: result.userId }` を `return { userId: result.userId, oldEmail: result.oldEmail, newEmail: result.newEmail }` に拡張。
- **理由:** server function が DTO を絞るとクライアントに値が届かない。usecase が返す DTO を透過させる。

### 3. `.address-summary` 相当のスタイル定数を追加

- **対象ファイル:** `app/components/auth/styles.ts`
- **変更内容:** モック CSS（247-278行）を utility-first に翻訳した定数を追加。padding/gap/radius/色はすべて `tokens.css` / `index.css` の `@theme inline` で実値照合した上でトークン由来ユーティリティとして表現。モックの構造に1対1で対応する定数を用意する:
  - コンテナ `.address-summary`: `flex flex-col gap-2 text-left px-5 py-4 rounded-lg bg-surface`（`var(--space-2)=gap-2`, `var(--space-5)=px-5`, `var(--space-4)=py-4`, `var(--radius-lg)=rounded-lg`）。
  - 各行 `.address-row`: `flex items-baseline justify-between gap-4 text-sm`。
  - ラベル `.label`: `text-ink-tertiary shrink-0`（文言は「旧アドレス」「新アドレス」）。
  - 値 `.value`: `text-ink font-medium text-right break-all`（`word-break: break-all` 相当の折返し）。
  - 旧行の値 `.address-row.old .value`: 上記に加え `text-ink-tertiary line-through font-normal`（モックは `font-weight: var(--weight-regular)` を明示。base の medium を **regular に上書き**する点を取りこぼさない）。
- **理由:** スタイルは `auth/styles.ts` の既存方式（モジュールスコープ定数）に合わせる。リテラル px を新規に持ち込まない。

### 4. success 状態に差分カードを配線

- **対象ファイル:** `app/components/auth/EmailChangeConfirm/index.tsx`
- **変更内容:**
  - `Status` の `success` バリアントを `{ kind: "success"; oldEmail: string; newEmail: string }` に拡張。
  - `useEffect` 内で `verifyChange(...)` の戻り値を受け、`setStatus({ kind: "success", oldEmail, newEmail })` に変更。
  - success 描画（本文の後、warning alert の前）にモック（344-353行）相当の差分カードを挿入。コンテナは `role="group" aria-label="変更内容"`。**各行は「ラベルspan（旧アドレス/新アドレス）+ 値span（アドレス実値）」の2要素構成**で、`justify-between` により左ラベル・右値の2カラムレイアウトにする。旧アドレス行 → 新アドレス行の順、step 3 の定数を適用。旧行の値だけ `line-through` + `text-ink-tertiary` + `font-normal`。
- **理由:** モック構造（本文 → 差分カード → warning alert → CTA）に忠実に追従。実値表示で「飾り UI」ではなくなる。差分カードはライブリージョンではなく静的グルーピングなので、モック通り `role="group"` のみとし `aria-live` は付けない（既存 warning alert の `role="status"` を据え置く）。

### 5. 統合テストに DTO アサーションを追加

- **対象ファイル:** `app/core/application/identity/__tests__/identity.integration.test.ts`
- **変更内容:** 既存「updates the user's email to the new address」テスト（1428行〜）に `expect(result.oldEmail)` / `expect(result.newEmail)` のアサーションを追加。`oldEmail` の期待値は **変更前の元アドレス（`activeMember` シードが生成する元アドレス、`newEmail` ではない）** を明示してアサートし、ADR-001 の「旧アドレス=ロード済みエンティティの現アドレス」決定を回帰で固定する。
- **理由:** 応答 DTO 拡張の回帰防止。新規テストファイルは不要。

## 設計判断

- **旧アドレスの取得元 — ロード済みエンティティ採用**: challenge payload に `oldEmail` を足す案もあるが、(a) `requestEmailChange` の payload は現状 `{ newEmail }` のみで波及が大きい、(b) verify 時点の現アドレス（`found.entity.email`）の方が「今まさに無効化される旧アドレス」として正確。usecase 変更が `verifyEmailChange` 1ファイルに閉じる。詳細は adr.md 参照。
- **server function の返し方**: usecase 出力を明示的に射影（`{ userId, oldEmail, newEmail }`）。

## リスクと注意点

- **トークン → ユーティリティのマッピング精度**: モックの `var(--space-*)` が Tailwind ユーティリティと一致するか `tokens.css` / `index.css` の `@theme inline` で実値照合してから定数を確定する。
- **success 状態の型変更**: `Status` の `success` バリアントにフィールドを足すため `setStatus({ kind: "success" })` の呼び出し箇所を漏れなく更新（型エラーで検出可能）。
- **PII**: 認証済みフローで自分の旧/新アドレスを表示するのは妥当。ログ等への新規出力は行わない。
- **スコープ厳守**: 差分カード以外には手を付けない。

## テスト方針

- 自動: 既存 `identity.integration.test.ts` の verifyEmailChange テストに DTO アサーション追記。`pnpm test:integration`。
- 静的: `pnpm typecheck && pnpm lint:fix && pnpm format`。
- 手動/ブラウザ: ローカルでメール変更リクエスト → 確認リンク → success 画面に旧（取り消し線）→ 新の差分カードが実値表示され、モックと寸法・色が一致することを確認。

## レビュー履歴

### 1周目: 2視点並列レビュー

**修正した点（要件カバレッジ視点）**:
- P-001: モックの各 `.address-row` が「ラベルspan + 値span」の2要素構成である点が計画に欠落していた → ステップ3/4 に2要素構成・ラベル文言（旧アドレス/新アドレス）・`justify-between` の2カラムレイアウトを明記。
- P-002: 旧行の値が `font-weight: regular`（base の medium を上書き）である点の取りこぼし → ステップ3/4 に旧行値の `font-normal` を明記。

**取り込んだ改善提案**:
- S-002（break-all）: 長いアドレスの折返し `word-break: break-all` → 値の定数に `break-all` を追加。
- S-002（テスト）: `oldEmail` の期待値が変更前の元アドレス（newEmail ではない）であることを明示 → ステップ5 に追記。
- aria 判断: 差分カードは `role="group"` のみ・`aria-live` 不付与の根拠をステップ4 と adr.md に記録。

**見送った提案とその理由**:
- S-001（スタイル定数化せずインライン化）: `auth/styles.ts` の既存方式（リピート文字列のモジュールスコープ定数化）に合わせる方針を維持。複数行で共通利用するため定数化が妥当。

**アーキ・リスク視点**: 問題点ゼロ（`found.entity.email` が変更前の値であること、`Status` 型変更の配線漏れリスクが低いこと、テスト追記先の実在を実コードで確認済み）。
