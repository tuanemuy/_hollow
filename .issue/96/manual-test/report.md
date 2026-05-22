# ブラウザ検証レポート — Issue #96

**実行日時**: 2026-05-20
**ブランチ**: `issue/96/remove-as-unknown-cast`
**テストソース**: `.issue/96/testing.md`
**サーバー**: http://localhost:3000 (PID 92283、`pnpm dev`)

## 概要

`createRequestContainer` の `as unknown as RequestContainer` キャストを撤廃し、未配線ポート 11 件を全配線（Stub 4 種を新規追加 + 既存 Stub 6 種 + 既存実装 1 種）した実装に対し、ブラウザ・サーバーログ・型検査の三層で検証。本Issue の完了条件をすべて満たした。

## 結果サマリー

- **合計**: 5 件（PASS: 3 / FAIL: 0 / SKIP: 2）
- 詳細: `results/summary.md`

| TC | 結果 |
|----|------|
| TC-1 typecheck | PASS |
| TC-A admin 6 ページ描画 | PASS |
| TC-B 一般ユーザー + 非 admin 拒否 | PASS |
| TC-7 media 異常系 | SKIP（UI 経路限定的、smoke test でカバー） |
| TC-8 ingestion 異常系 | SKIP（同上） |

## 完了条件の充足

1. **`as unknown as RequestContainer` キャスト撤廃**: `grep` で 0 件、ソースは `} satisfies RequestContainer;` に置換済み
2. **全フィールド配線**: `pnpm typecheck` 通過。`satisfies` により未配線がコンパイル時検出される状態
3. **runtime で TypeError を出さない**: サーバーログ全体で `TypeError` / `Cannot read properties of undefined` が 0 件

## 検証で確認できたこと

- **PR #95 の挙動維持**: `/admin`, `/admin/metrics` が 200 で描画される
- **`/admin/llm` の描画**: `NullSecretBox` fallback が描画時に `SecretBoxError` を発火させない（`AdminSettingsService` が描画時点で `decrypt` を呼ばない設計が実機で確認できた）
- **一般動線への副作用なし**: 一般ユーザーの note 一覧表示が新規 Stub 経路に触れず正常動作
- **認可境界の維持**: 非 admin ユーザーの `/admin` アクセスが「アクセスできません」表示で拒否される（既存挙動）

## スキップした項目について

- **TC-7 (media upload で StorageUnavailableError)**: UI 経由での media アップロード起動経路は限定的。`StubObjectStorage` の throw 動作は新規 smoke test (`serverCloudflare.test.ts`) で `expect(...).rejects.toThrow(StorageUnavailableError)` 形式で検証済み
- **TC-8 (ingestion で BusinessRuleError)**: 上と同様、UI 経由の ingestion 起動経路が限定的。`StubLLMProvider` 等の throw 動作は smoke test で `BusinessRuleError(IngestionErrorCode.UnsupportedFormat)` の検証済み

## 起票したIssue

なし（全 PASS / SKIP は UI 経路の都合で smoke test でカバー済み）

## 成果物

- `results/summary.md` — テスト実行サマリー
- `results/TC-1.md` — typecheck 検証
- `results/TC-A.md` — admin ページ群描画検証
- `results/TC-B.md` — 一般動線 + 非 admin 拒否検証
- `screenshots/tc-a/` — admin ページ 8 スクリーンショット
- `screenshots/tc-b/` — 一般動線 3 スクリーンショット
- `seed-data.md` — シードデータ整備記録
- `server-info.md` — サーバー起動情報
- `issue96-supplement.sql` — `mailowner@example.com` 追加用 SQL
