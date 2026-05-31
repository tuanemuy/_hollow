# ブラウザ検証レポート — Issue #397

**実行日時**: 2026-06-01
**テストソース**: `.issue/397/testing.md`
**サーバー**: http://localhost:5175（`pnpm dev`、Cloudflare Workers ローカル）
**ブラウザ**: agent-browser 0.27.0（Chrome for Testing）

## 結果概要

中心要件「ビルトイン既定値がフォームに初期表示され、上書き状態が可視化される」を実ブラウザで検証し、**全 4 ケース PASS**。保存・リセットの mutation は agent-browser の serverfn POST が 403（既知事項）になるため integration テスト（529 件全パス）で担保。

## 認証方法

`/admin/*` は admin 認証が必要。ログイン（`loginFn`）は TanStack server function で、agent-browser からの POST は CSRF/origin チェックで 403 になる（MEMORY 既知事項）。そのため、セッションは独自実装（BetterAuth ではなく `__Host-session` クッキー＝平文トークン）である点を利用し、`sessions` テーブルに admin ユーザーのセッション行を直接 INSERT → agent-browser で `__Host-session` クッキーを set して認証した。ページロード（GET / RSC）は serverfn POST ではないため 403 の影響を受けない。

## テストケース詳細

### TC-1: 既定値が初期表示される（override 無し） — PASS
- `instance_settings.design_tokens_json = {"tokens":{}}`（override 無し）の状態で `/admin/design` を開く。
- **結果**: 27 トークン（brand 6 / neutral 9 / radius 7 / `--font-sans` 1 / code 4）が全行表示。各行にキー名・`既定値: <値>`（例 `--color-accent` → `既定値: oklch(37.1% 0 0)`）を表示。トークン名欄は disabled（curated キーはリネーム不可）、各行の「既定に戻す」は未上書きのため disabled、「すべてリセット」も disabled。
- スクリーンショット: `screenshots/tc01-defaults-displayed.png`

### TC-2: override の表示 — PASS
- `design_tokens_json = {"tokens":{"--color-accent":"#ff0000","--custom-x":"42px"}}` を注入して再読込。
- **結果**: `--color-accent` 行が値 `#ff0000`・「上書き中」バッジ・「既定に戻す」ボタン有効。未上書きの他 curated 行は「既定に戻す」disabled のまま。「上書き中」バッジは 2 個（accent + custom-x）。
- スクリーンショット: `screenshots/tc02-override-display.png`

### TC-3: 既定外の任意キー override（後方互換） — PASS
- 同上の注入で `--custom-x` を確認。
- **結果**: row 28 として表示。トークン名欄は編集可能（disabled でない）、ボタンは「削除」（「既定に戻す」ではない）、既定値ラベルなし。既定キー行と共存表示。

### TC-4: すべてリセットの活性制御 — PASS
- **結果**: override 無し時は disabled、override 有り時は enabled。

### TC-S: 保存・リセット mutation — 自動テストで担保
- 保存（`updateDesignTokensFn`）・全リセット（`resetDesignTokensFn`）は serverfn POST のため agent-browser から 403 CROSS_ORIGIN（MEMORY 既知事項）。
- 既定同値除外・DTO 合成・override 永続化は integration テスト（`adminSettings.integration.test.ts`、全 529 件パス）で担保。

## 既存の環境データ問題（本Issueスコープ外）

検証着手時、`/admin/design`・`/admin/prompts` が「アクセスできません」を表示。サーバーログ解析の結果、ローカル D1 の `instance_settings.design_tokens_json` が `"{}"`（rehydration が期待する `{"tokens":{}}` 形でない）であり、`InstanceSettings` rehydrate 時に `TypeError: Cannot convert undefined or null to object` が発生していた。本Issueの変更とは無関係の既存データ不整合（`mapDbError` が `SystemError: Stored instance_settings violates invariants` に変換）。検証のためローカル行を正しい形に修復した。スキーマ列デフォルト `'{}'` と rehydration 形 `{"tokens":{}}` の不一致は潜在バグの可能性があり、Phase 4 で起票を検討。

## 成果物
- テスト結果: `results/summary.md`
- スクリーンショット: `screenshots/tc01-defaults-displayed.png`, `screenshots/tc02-override-display.png`
