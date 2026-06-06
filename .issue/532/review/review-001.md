# PR Review #001 — fix(#532): サイトメタデータをテンプレ初期値から hollow 固有へ差し替え

**PR:** #534
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 1（W-001、本ラウンドで修正済み）
- Notes: 4
- Verdict: **BLOCKED → 修正済み（round 2 で再確認）**

---

## General Review

### Blockers
- なし

### Warnings
- **[W-001]** マニュアルテスト用 reseed スクリプトが旧 D1 名 `tanstack-start-template-d1` を参照したまま残っている
  - 場所: `.manual-test/2026-05-17/reseed.sh:71,74`、`.manual-test/2026-05-17/seed-data.md:15`
  - 理由: ローカル D1 名は `hollow-local-d1`。`package.json` の db スクリプトと本 PR の wrangler indexer も `hollow-local-d1` に統一済みだが、この reseed スクリプトだけ旧名のままで、実行すると空の別 D1 を掴み reseed が空振りする。`.manual-test/` は追跡対象の実動スクリプトであり、Issue #532 の棚卸し対象の取りこぼし。
  - → **修正済み**: 3 箇所を `hollow-local-d1` へ置換。

### Notes
- **[N-001]** core 整合性クリーン。`Symbol.for` キーは各ファイル内で writer/reader が閉じており片側 rename 破綻なし。統合テストのキュー名は config / test 両側が完全一致。
- **[N-002]** デプロイ影響なし。wrangler.toml local indexer の `database_name` 変更は不整合の解消であり、staging/production はクリーン。
- **[N-003]** メタデータは AppConfig 型に適合、head.ts の出力経路も妥当。description は meta description として適切な長さ・内容。
- **[N-004]** スコープは概ね計画どおり、計画外の混入なし。

---

## メイン追加調査（拡張子を絞らない全 sweep）

W-001 を機に、初回 grep（`.ts/.tsx/.json/.toml` 等に限定）が**取りこぼしていた user-facing ブランディング漏れ**を、拡張子を絞らず再 sweep して発見。いずれも Issue #532 のコア意図（SEO・ブランディング・ソーシャル共有の実害）に直撃するため本 PR で修正した。

- **[B-add-1]** `public/site.webmanifest` の `"name": "TanStack Start Template"` / `"short_name": "TST"`
  - PWA マニフェスト（`__root.tsx:62` の `<link rel="manifest">` で配信）。ホーム画面追加・インストール時に露出。
  - → **修正済み**: `name`/`short_name` を `"hollow"` へ。
- **[B-add-2]** `public/og-image.svg` / `public/og-image.png` にテンプレ名がテキスト描画
  - `head.ts` の `DEFAULT_OG_IMAGE_PATH = "/og-image.png"` 経由で `og:image` / `twitter:image` に出力される**ソーシャル共有プレビュー画像**そのもの。画像内に "TanStack Start Template" / "Hexagonal-architecture starter" が焼き込まれていた。
  - → **修正済み**: SVG のワードマークを `hollow`、サブタイトルを `A quiet, personal text archive`（about.md の positioning に整合）へ。バッジの "H" は favicon/apple-touch-icon と一貫するため据え置き。配信 PNG は librsvg デリゲート（ImageMagick）で SVG から再生成し、1200x630・8-bit grayscale で元と同形式・同デザイン言語に揃えた。目視でレンダリング品質を確認済み。

## スコープ境界（本 PR では据え置き）

- `docs/runtime_cloudflare.md` の staging/production リソース作成コマンド（`tanstack-start-template-*-staging` 等）: plan で明示的にスコープ外（ドキュメント整備は別軸）。加えて doc の命名規約（`{template}-{resource}-{stage}`）が実構成（`hollow-{stage}-{resource}`）と異なり、単純置換では誤コマンドになるため、正しく直すにはドキュメントの命名規約の整理が必要。別軸の作業として本 PR では扱わない。
- `.issue/**` の歴史的記述: 過去の作業ログであり書き換え対象外。

---

## Design Decisions

特になし（既存のデザイン言語・命名規約に合わせた差し替えのみ）。
