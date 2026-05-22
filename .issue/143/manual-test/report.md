# ブラウザ検証レポート — Issue #143

**Issue**: #143 feat(admin/llm): surface env override state in UI (read-only fields + lock badge)
**検証日**: 2026-05-22
**ブランチ**: issue/143/admin-llm-env-override-ui

## 検証概要

`/admin/llm` の admin UI に env override 状態が正しく反映されることを 3 ケースで確認した。

- TC-1: baseline (provider+model env set / apiKey+baseURL unset)
- TC-2: 全 4 env set (full lock + banner)
- TC-3: apiKey set + baseline (provider/model/apiKey lock)

env 切り替えは `.dev.vars` の `ADMIN_LLM_API_KEY` と `wrangler.toml [vars]` の `ADMIN_LLM_BASE_URL` を編集 → `pnpm dev` 再起動 で行った。

## 結果

**全 3 ケース PASS**。詳細は `results/summary.md` および `results/TC-*.md`。

## 検証対象との対応（受け入れ基準）

| 基準 | 対応 | 結果 |
|------|------|------|
| 環境変数で固定中バッジ表示 | TC-1/2/3 で lock 文言確認 | PASS |
| `<input disabled>` 描画 | TC-1/2/3 で snapshot 確認 | PASS |
| usecase が env 値保持 (silent skip) | 自動テスト (integration) | PASS |
| 4 env set で全体 banner | TC-2 で「すべての LLM 設定が環境変数で固定中」確認 | PASS |
| env 未設定項目は編集可能 | TC-1 で apiKey が編集可能 | PASS |
| `.dev.vars.example` の 3 provider 対応 | ファイル diff で確認 | PASS |
| provider 切替の運用 note | ファイル diff で確認 | PASS |

## Secret Hygiene

env API key 実値の DOM / レスポンス漏れチェックを TC-2 / TC-3 で実施。

- `sk-ant-fake-test-key-for-manual-verification` を `.dev.vars` に set した状態で `/admin/llm` を表示
- HTML body 全体（70KB）に env 値の出現が 0 件
- `<input type="password">` の `value` 属性が存在せず、env 由来 API key は UI に流れていない

## 環境後始末

- `.dev.vars` を初期状態に復元（`ADMIN_LLM_API_KEY=""`）
- `wrangler.toml` を初期状態に復元（`ADMIN_LLM_BASE_URL = ""`）
- `pnpm dev` プロセスを kill、agent-browser セッション close、一時ファイル削除

## 成果物

- `.issue/143/manual-test/results/TC-1.md` 〜 `TC-3.md`
- `.issue/143/manual-test/results/summary.md`
- `.issue/143/manual-test/screenshots/tc-1/` 〜 `tc-3/`

## 起票したIssue

なし（全 PASS）
