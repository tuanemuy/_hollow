# Review 003 — Build 設定 & 構造保証（Round 3 収束確認）

- **PR:** #833
- **観点:** Build 設定 & 構造保証
- **前提:** Round 2 は Build レイヤー Blocker 0 / Warning 0 でクリーン。本ラウンドは追加コミット ba90adc6（`inlineRelayTrigger.test.ts` のコメント修正＋manual-test レポート追記のみ、`docs` / `vite.config` / エントリのコードは無変更）を含めた最終収束確認。

## Build & 構造保証

### Blockers（なければ「なし」）

なし。

### Warnings

なし。

### Notes

- **AC-1 / AC-2（prod バンドルに dev-only コードが構造的に載らない）— 満たす。** `app/server.cloudflare.ts` の import は `RelayTrigger`（型）/ `RequestServerConfig` / `readRequestServerConfig` / `createRequestContainer` / `buildSitemapResponse` / ALS 系のみで、`InlineRelayTrigger` / `resolveInlineRelayGate` / `buildDevObjectStorageResponse` / `resolveDevObjectStorageGate` / `ConsoleLogger` への import 経路は皆無。dev-only の唯一の import 元は `app/server.cloudflare.dev.ts` に集約されている。manual-test TC-1/TC-2 が `pnpm build`（production）出力の force-text grep で dev-only シンボル（`InlineRelayTrigger` / `inline-dev` / `buildDevObjectStorageResponse` / `resolveInlineRelayGate` / `resolveDevObjectStorageGate`）ゼロ、`pnpm build:local` 出力には存在、と裏取り済み。ワンタイム構造検証（plan ステップ7）の要件を満たす。

- **AC-5（mode でエントリ切り替え・誤設定は安全側に倒れる）— 満たす。** `vite.config.cloudflare.ts` は `defineConfig(({ mode }) => ...)` 関数形式で、実効レバーである `@cloudflare/vite-plugin` の `config` カスタマイザが `mode === "production" ? undefined : { main: DEV_SERVER_ENTRY }` を返す（delta のみ返す＝ADR-004 で修正済みのバインディング二重連結バグを回避）。tanstackStart 側の `server.entry` も同じ mode 分岐で冗長に揃えてあり意図を明示。production は常に `wrangler.toml [main]`（prod エントリ）へフォールスルーするため「prod へ dev 混入」は構造上あり得ず、誤設定は「dev 側の main 解決失敗＝dev 機能停止」に倒れる。plan の AC-5 文言（「`server.entry` を切り替える」）は ADR-004 の実装時発見（実効レバーは `config` カスタマイザの `main` 上書き）で更新済みであり、コードは ADR-004 の結論に整合している。

- **AC-6（旧保証モデルの記述撤去）— 満たす。** DCE ゲート（`&&` 左辺・`import.meta` インライン参照）と post-build grep 検証コマンドはコード・docs から撤去済み。`docs/runtime_cloudflare.md` に残る `grep`/`dist/` 参照は L55/L89 の「`pnpm start` が `dist/server/index.js` を実行する」ビルド経路説明であり、保証手順の grep ではない。JSDoc（`inlineRelayTrigger.ts` / `devObjectStorageHandler.ts`）は「prod エントリが import しないため production では構造的に到達不能」へ更新済み。残存する「dead-code elimination」の3箇所（`inlineRelayTrigger.ts` L29、docs L52/L62）はいずれも「構造保証であって DCE ではない」という**対比表現**であり、旧モデルへの依存を示すものではない。

- **AC-6（テストの旧モデル参照）— 残存なし（本ラウンドの追加確認点）。** ba90adc6 で `inlineRelayTrigger.test.ts` L132-137 の `resolveInlineRelayGate` テストコメントが「production で無効になる保証は構造的（prod エントリが import しないため到達不能、Issue #675）」へ更新され、この関数は dev 側 ON/OFF のみを検証する、と明記。旧「DCE ゲート＋grep で保証」文言は残っていない。テストのロジック・アサーションは不変で回帰なし。

- **AC-9（prod default `createFetchHandler()` の機能不変）— 満たす。** hook なしの prod 経路で fetch フローの分岐順（`preRoute` 早期 return → `/sitemap.xml` 判定 → `defaultEntry.fetch`）が保持されており、sitemap 分岐は `storage.run` 内で従来位置を維持。manual-test TC-3 が `GET /` 200 / `/sitemap.xml` 200 `application/xml`（正しい urlset）/ `/admin` 200 / `/dev/r2/x` はアプリの HTML 404（proxy 不発火）を確認。dev 側（TC-4/TC-5）は `/dev/r2/x` が dev proxy の plain-text `Not Found` で発火判定でき、prod/dev の応答差で hook 配線が決定的に区別できている。

- **品質ゲート:** manual-test レポートで `pnpm test:unit` 297 files / 4507 tests 全 PASS（`inlineRelayTrigger.test.ts` / `devObjectStorageHandler.test.ts` 含む）。本ラウンドの追加変更（ba90adc6）はテストコメントと docs のみで Build 設定・エントリ・vite 設定に無変更のため、Round 2 のクリーン結論を覆す要素なし。

## 結論

Build 設定 & 構造保証の観点で **Blocker 0 / Warning 0**。AC-1/AC-2/AC-5/AC-6/AC-9 すべて構造・実測の両面で満たされ、収束を確認した。
</content>
</invoke>
