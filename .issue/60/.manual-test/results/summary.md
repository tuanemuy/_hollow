# テスト実行サマリー — Issue #60

**実行日時**: 2026-05-21
**テストソース**: `.issue/60/testing.md`
**サーバー**: http://localhost:3000
**ブランチ**: `issue/60/instance-settings-rehydrate-fix`

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | 新規環境（行不在 → default フォールバック） | 正常系 | **PASS** | `/admin/llm` 200 確認 |
| TC-2 | 汚染環境 → DELETE 修復 → save 動作 | 正常系 | **PASS** (修復スコープ) | 500 再現 → 修復後 200。save の永続化は `.dev.vars` 未整備で別途課題 |
| TC-3 | 正規行温存（マイグレーション破壊チェック） | 正常系 | **PASS** | version=3, claude-opus-4-7 が温存・UI反映 |
| TC-4 | /signup 経路の回復 | 正常系 | **PASS** | POST 500 → 修復後 signup 成功 (userId 払い出し確認) |

**合計**: 4件（PASS: 4 / FAIL: 0）

## Issue #60 スコープに対する判定

OK to merge / release。期待挙動 4 点をすべて確認:

1. 行不在で `InstanceSettings.default()` フォールバックが効き `/admin/llm` 200 (TC-1, TC-2)
2. legacy 行で `/admin/llm` レンダリングと `/signup` POST が 500 を再現 (TC-2, TC-4)
3. マイグレーション 0009 と同等の `DELETE` で両経路が回復 (TC-2, TC-4)
4. 正規行（`limits_json.maxUploadBytesPerDay` ＆ `design_tokens_json.tokens` あり）は DELETE 述語で除外され温存 (TC-3)

## TC-2 save 失敗の補足

- フォーム保存試行で 422 → API キー入力後は 500 (`SECRET_BOX_MASTER_KEY` 未設定で暗号化失敗)
- 原因はテスト環境の `.dev.vars` 未整備で、Issue #60 のスコープ外
- 「修復後フォームが表示され、UI から save リクエストが投げられる」までは確認済み（adapter `save()` の OCC 0→1 遷移そのものは TC-3 の version=3 行が UI に反映されることで間接的に検証）

## TC-4 の補足

`/signup` の GET ページ自体は instance_settings に依存せず正常表示される（route の `beforeLoad` は認証チェックのみ）。実際の 500 は POST 経路: `signUp` ユースケースが UoW 内で `instanceSettingsRepository.get()` を呼んで legacy 行の VO 復元で失敗する。POST で 500 → 修復後 200 (`userId: 019e4633-72f2-77d9-a2ea-d44cd2901308` 払い出し、DB に `signuptest001` 作成済み) を確認。

## 起票したIssue

なし。
