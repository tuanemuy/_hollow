# ブラウザ検証レポート — Issue #421

**実行日:** 2026-06-06
**テストソース:** `.issue/421/testing.md`
**対象:** `app/components/identity/AccountDeleteForm`（`/settings/account-delete`）
**サーバー:** http://localhost:3000（`pnpm dev`）
**ログイン:** seed 済み `dev-admin`（`__Host-session` クッキーを CDP 注入）

---

## サマリー

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-01 | validation エラーはダイアログを開いたまま入力欄近接表示 | 正常系 | PASS |
| TC-02 | サーバーエラーはダイアログを閉じず in-dialog 表示・外側に漏れない | 異常系 | PASS |
| TC-03 | cancel でエラーが破棄され外側に残らない | 異常系 | PASS |

**合計: 3 件（PASS: 3 / FAIL: 0）**

> 確認項目3（成功時の実削除）は破壊的なため意図的に未実行。

## サーバーエラーの非破壊的再現方法

サーバーエラー時の挙動を**実際にアカウントを削除せずに**検証するため、ローカル D1 の他 2 管理者を一時的に `role='member'` へ降格し、`dev-admin` を唯一の管理者にした。この状態で正しいユーザー名を入力して削除を確定すると、`deleteAccount` usecase の `IdentityService.assertNotLastAdmin` が `BusinessRuleError("last_admin_protected")` を投げる（`kind: "business"` → `fieldErrors === undefined` → in-dialog 表示経路）。削除は拒否されるため**非破壊**。検証後、2 管理者を `role='admin'` に復元し、`dev-admin` が `deleted_at=NULL` のまま無傷であることを確認した。

## TC-01: validation エラー（ユーザー名不一致）

- 操作: 「続けて削除する」→ ダイアログで誤ったユーザー名 `wrong-name` を入力 → 「アカウントを完全に削除する」
- 期待: ダイアログは開いたまま、入力欄の直後に「ユーザー名が一致しません」が `role="alert"` で表示。サーバーへは送信されない。
- 実際: `alertdialog` 存続。textbox の直後に `alert` "ユーザー名が一致しません"。URL は `/settings/account-delete` のまま。**PASS**
- 証跡: `screenshots/tc-01b-validation-error.png`

## TC-02: サーバーエラーは in-dialog 表示（本Issueの主眼）

- 操作: 同ダイアログで正しいユーザー名 `dev-admin`（唯一の管理者状態）を入力 → 確定
- 期待: ダイアログが閉じず、description（入力欄・ヒント）と action row の間に `role="alert"` でエラー文言。外側セクションにエラーが漏れない。home へ遷移しない。
- 実際: `alertdialog` 存続。`form > generic`（description）の後・ボタンの前に `alert` "操作を完了できませんでした。時間をおいて再度お試しください"。ダイアログ外に `alert` は無し（唯一の alert は dialog 内）。URL は `/settings/account-delete` のまま（home 遷移なし）。**PASS**
- 証跡: `screenshots/tc-02-server-error-in-dialog.png`

## TC-03: cancel でエラー破棄

- 操作: TC-02 の in-dialog エラー表示状態から「キャンセル」
- 期待: ダイアログが閉じ、外側セクションにエラーが残らない（#98 ADR-005 の「閉じる＝破棄」不変条件）。
- 実際: `alertdialog` count 0（閉）。`完了できませんでした`/`一致しません` の alert はページ上に 0 件。URL 不変。**PASS**
- 証跡: `screenshots/tc-03-cancel-cleared.png`

## 起票した Issue

なし（全 PASS）。

## 環境メモ

- `pnpm seed:dev-admin` は既存ローカル D1 の残存データにより FK 制約（トリガー）で失敗したが、過去 seed の `dev-admin` ユーザー＋セッション（token `dev-admin-session-token`, expires 2999）が有効だったため再 seed 不要でログインできた。これは本 Issue と無関係な seed スクリプト/ローカル DB 状態の問題。
- agent-browser は idle timeout でセッションがリセットされることがあり、TC-03 は別セッションで再実行した（結果は同一）。
