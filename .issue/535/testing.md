# Issue #535 動作確認計画

ドキュメント（Markdown）のみの変更。ブラウザ検証・単体テストは対象外。

## 確認環境

リポジトリルートで pnpm scripts を実行できる状態（`pnpm install` 済み）。

## 実行手順

1. 変更後のリソース名が実構成 SSOT（`infra/src/config.ts` の `resourceNames`）と一致するか目視確認する。

   ```bash
   grep -nE 'tanstack-start-template' docs/runtime_cloudflare.md
   # → 0 件になっていること（該当節に旧テンプレ名が残っていない）
   ```

2. 該当節が実構成名になっているか確認する。

   ```bash
   grep -cE 'hollow-(staging|production)-(d1|events|events-dlq|temp-files|objects)' docs/runtime_cloudflare.md
   # → 11 行（新規: staging 5 + production 5 = 10、既存: DLQ 復旧節の `hollow-staging-d1` 例 1）
   ```

3. 変更が他ファイルに波及していないか確認する（Biome は Markdown を対象外にするため
   `docs/**` 自体はフォーマットされないが、リポジトリ全体が clean であることを確認する）。

   ```bash
   pnpm format:check
   ```

## 期待結果

- 手順 1 の grep が 0 件（旧テンプレ名が残っていない）。
- 手順 2 の grep が 11 行。
- `pnpm format:check` が "No fixes applied." で完了。
