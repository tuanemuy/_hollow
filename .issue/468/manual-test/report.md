# Browser Verify Report

**実行日時**: 2026-07-11
**テストソース**: .issue/468/testing.md
**サーバー**: http://localhost:8787（アプリ、`pnpm build:local && pnpm start`）/ http://localhost:8788（pruner、`pnpm wrangler dev --env pruner --test-scheduled --port 8788`）
**修正ラウンド**: 1回（環境是正のみ、コード修正なし）

---

## サマリー

| 項目 | 値 |
|---|---|
| テストケース総数 | 9 |
| PASS | 9 |
| FAIL | 0 |
| PASS率 | 100% |
| 起票Issue数 | 0 |

---

## シードデータ

- ログインユーザー: `dev-login@example.com` / `DevPassw0rd!2024`（`scripts/seed-dev-login.mjs`。admin は `pnpm seed:dev-admin`）
- テスト用 PDF: 最小の有効 PDF（598 bytes、1ページ）
- pruner 系の seed 行（`media_assets`）は各テストケース実行時に SQL で投入・テスト後に回収済み（`test-468` 残骸なしを SELECT で確認）
- 詳細: `.issue/468/manual-test/seed-data.md`

---

## テスト結果一覧

| TC | テスト名 | 種別 | 最終結果 | 初回結果 | 修正ラウンド | 備考 |
|----|---------|------|---------|---------|-------------|------|
| TC-001 | 取り込み commit 正常系（metadata-first 化後） | 正常系 | PASS | FAIL | Round 1 | 環境問題2件を是正（下記）。実装は無退行 |
| TC-002 | 放棄 source intake の sweep（orphan 化 + `media.orphaned` outbox） | 正常系 | PASS | PASS | - | swept: 1 / updated_at 再スタンプ確認 |
| TC-003 | orphan 行の purge（1 tick で markDeleting→purge 完走） | 正常系 | PASS | PASS | - | blob なし行でも delete 冪等性で stall なし |
| TC-004 | pruner tick の既存刈り込み無退行 | 回帰 | PASS | PASS | - | sweep 失敗時も swallow され他ステップ継続（best-effort 実証） |
| TC-005 | infra テンプレートの pruner R2 配線 | 構成 | PASS | PASS | - | render + `deploy:staging:pruner:dry` 完走、`OBJECT_STORAGE` binding 表示確認 |
| TC-006 | 保持ポリシー・運用ノート明文化（AC-1） | ドキュメント | PASS | PASS | - | spec/domains/media.md・spec/usecases/media.md・docs/runtime_cloudflare.md の3箇所 |
| EC-1 | 猶予期間内 pending/source 非回収 | 異常系 | PASS | PASS | - | swept: 0、行不変 |
| EC-2 | pending/image は sweep 対象外 | 異常系 | PASS | PASS | - | 猶予超過でも kind='source' 限定で非対象 |
| EC-3 | R2 設定欠落時の tick | 異常系 | PASS | PASS | - | per-row catch でログ、tick 完走、復旧後 tick で回収。`.dev.vars` は diff で完全復元確認 |

---

## 環境是正の記録（TC-001 Round 1、実装バグではない）

1. **CSRF Origin 不一致**: `pnpm dev`（vite、:3000）は `APP_URL=http://localhost:8787` と Origin が食い違い、全 state-changing サーバー関数が 403。→ `pnpm start`（wrangler dev、:8787）に切り替え（.issue/385 と同じ確立パターン）。
2. **inline relay の DCE**: plain `pnpm build` 成果物では inline relay が落ち、取り込みジョブが「待機中」で停滞（docs/runtime_cloudflare.md 記載の既知の罠）。→ `pnpm build:local` で再ビルド。

いずれも testing.md の「確認環境」に反映済み。

## testing.md への実測フィードバック（反映済み）

- seed 行の id は UUIDv7 形式必須（非 UUIDv7 は再水和検証で `DATA_INTEGRITY_ERROR` → sweep 自体が失敗）
- `outbox_events` に `status` 列は無い（`event_type, processed_at` で確認）
- `/__scheduled` の発火形式を確定: `curl "http://localhost:8788/__scheduled?cron=0+3+*+*+*"`

## 起票した Issue

なし（全 PASS。環境是正・手順修正はその場で解消）
