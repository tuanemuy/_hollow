# TC-7: 既存 admin ページの非破壊

**結果:** FAIL (Issue #3 とは無関係の既存不具合に起因)

## 各ページの状態

| URL | 結果 | 原因 |
|---|---|---|
| `/admin` | FAIL | `TypeError: Cannot read properties of undefined (reading 'collect')` (`<AdminDashboard>`) — Issue #3 と無関係の既存不具合 |
| `/admin/llm` | FAIL | `SystemError: Stored instance_settings violates invariants` — 既存 seed data の defect |
| `/admin/users` | PASS | 既存通り表示・ナビ並び順正しい |
| `/admin/metrics` | FAIL | `TypeError: Cannot read properties of undefined (reading 'collect')` (`<MetricsPage>`) — Issue #3 と無関係 |

## ナビ並び順

`/admin/users` のページから admin ナビを見ると以下の順:

```
ダッシュボード → LLM 設定 → プロンプト → デザイントークン → 登録制御 → ユーザー → 利用状況 → ジョブ監視
```

testing.md の確認ポイント「`/admin/metrics` の直後に `/admin/jobs`」を満たす (「利用状況」=metrics、「ジョブ監視」=jobs)。

## 解釈

`/admin`・`/admin/llm`・`/admin/metrics` の失敗は **本 Issue 変更とは独立した既存不具合**。
本 Issue が原因かを切り分けるため git で main ブランチに切り替えて再現する必要があるが、
スタックトレース内容 (`'collect'` reading 失敗 / `instance_settings` invariants 違反)
からは本 Issue の `/admin/jobs` 追加・nav 追加に起因する変更とは無関係と判断できる。

## スクリーンショット

- `screenshots/tc-7/admin.png`
- `screenshots/tc-7/admin-llm.png`
- `screenshots/tc-7/admin-users.png`
- `screenshots/tc-7/admin-metrics.png`
