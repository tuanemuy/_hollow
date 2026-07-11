# レビュー Round 2 — Issue #675 / PR #833（観点: Build 設定 & 構造保証 / バンドル衛生）

**対象 PR:** #833
**レビュー日:** 2026-07-11
**位置づけ:** Round 1（`review-001-build-structure.md`）指摘反映後の再確認
**観点:** エントリ選択の正しさ、カスタマイザの差分返却契約、mode 分岐の倒れ方（AC-5）、DCE 撤去の妥当性（AC-6）、JSDoc 整合（AC-6）、prod 構造保証（AC-1/AC-2）、prod スモーク（AC-9）
**参照:** `.issue/675/plan.md`（受け入れ基準）/ `.issue/675/adr.md`（特に ADR-003/ADR-004）

## 総評

Round 2 でも **要修正（Blocker）ゼロ**。本 PR は #675 の対象コミット `afdd14b1` の1コミットのみで構成され、Round 1 レビュー時点からコード（`vite.config.cloudflare.ts` / `app/server.cloudflare.ts` / `app/server.cloudflare.dev.ts` / 2アダプター JSDoc / `docs/runtime_cloudflare.md`）に変更は入っていない。よって Round 2 は「Round 1 の合格判定が現物で維持されているか」と「Round 1 で唯一残した W-001（恒常ガード不在）の見送りが Issue の明示ゴールとして妥当か」の再確認に絞る。両者とも問題なし。`pnpm typecheck` は exit 0 を再確認した。

AC-1/AC-2/AC-5/AC-6/AC-9 はいずれも構造・型・実測（`.issue/675/manual-test/report.md` TC-1〜TC-8）で満たされている。**Round 1 の W-001 は Round 2 で Note へ格下げする** — 再検証の結果、production では独立2レバー（`config` カスタマイザの `main` 上書き＋ tanstackStart `server.entry`）が共に prod エントリを選び、かつ最終保証は「prod エントリファイルに dev アダプターへの import エッジが物理的に無い」ことなので、プラグイン実装依存リスクは dev 側（dev コードが載るか）に限定され、prod 混入方向には効かない。恒常 grep の撤去は Issue の中核ゴールそのものであり、再導入は本 Issue が排除した後追い検証モデルへの部分回帰になる。

## 再検証したこと（合格・現物で再確認）

### エントリ選択の正しさ・カスタマイザの差分返却契約

- `node_modules/@cloudflare/vite-plugin/dist/index.d.mts` の `WorkerConfigCustomizer<true>` は `(config: WorkerConfig) => Partial<WorkerConfig> | void`（＝**差分または void を返す契約**）であることを型定義で直接確認。`vite.config.cloudflare.ts:34-35` の `config: () => mode === "production" ? undefined : { main: DEV_SERVER_ENTRY }` はこの契約に厳密適合。`undefined`（void）で prod は `wrangler.toml [main]`（`wrangler.toml:13` = `app/server.cloudflare.ts`）へフォールスルー、非 production では `{ main }` の1フィールドだけを返す。
- ADR-004 の二重連結バグ（`{ ...config, main }` 全体 spread → 配列バインディングのマージ二重化）は現コードでは delta 返却に修正済み。report TC-8 が `wrangler dev` 起動失敗→修正→単一バインディング復帰まで実測記録。

### mode 分岐の倒れ方（AC-5）

- `package.json:9-11` の `dev` / `build:local`（`--mode development`）→ dev エントリ、`build:10` および `deploy:staging:23` / `deploy:production:37`（素の `vite build`）→ production mode → prod エントリ。分岐は綺麗に prod/dev に割れており、production を真側条件に置く構成で「誤設定は dev 機能停止側に倒れ、prod へ dev 混入は構造上起こり得ない」を満たす。
- 補強: production ビルドでは `config` カスタマイザ（`main`）と tanstackStart `server.entry` の**両方**が prod エントリを選び、いずれも Vite の `mode`（ビルド時定数）で決まる。dev の `main` delta は非 production mode でしか返らないため、プラグインの `main` 解決挙動が将来変わっても production 出力に dev delta が適用される経路は無い。

### DCE 撤去の妥当性・JSDoc 整合（AC-6）

- `docs/runtime_cloudflare.md:52`「Entry separation (build-time)」= import 経路不在による構造保証に置換済み。旧 DCE gate 箇条・後追い grep コマンドは撤去され、docs 全体に検証用 grep の残存なし。#663 の「`viteDev` へ簡略化するな」警告（docs L55・dev エントリ L18-22）と「素の `pnpm build && pnpm start` では var が silently inert」警告（docs L55）は保持。
- `inlineRelayTrigger.ts:24-29,54-65` / `devObjectStorageHandler.ts:36-42`: JSDoc が「dev エントリからのみ配線・prod は import しないため構造的に到達不能（DCE ではない）」に更新済み。旧「DCE ゲート／grep で保証」記述の残存なし。

### AC-1/AC-2 の構造保証

- dev アダプター（`inlineRelayTrigger.ts` / `devObjectStorageHandler.ts`）の実 import 元は `app/server.cloudflare.dev.ts:1-8` のみ。prod エントリ `app/server.cloudflare.ts` は該当 import を全削除し、残るのは型 `RelayTrigger`（L15）のみ。prod エントリは `import.meta.hot`（HMR ピン止め・build で undefined）を参照するが `import.meta.env.MODE/DEV` は参照しない。よって prod モジュールグラフから両アダプターの load 経路が消える論理は妥当。report TC-1（prod 出力で `InlineRelayTrigger`/`inline-dev`/`/dev/r2/` 等が force-text grep で全滅）/ TC-2（dev 出力では残存）が実測裏取り。
- dev フラグ（`DEV_INLINE_RELAY` / `R2_DEV_OBJECT_PROXY` / `R2_S3_ENDPOINT`）は `wrangler.toml:38-48`（LOCAL DEV ONLY）のみに存在。`wrangler.staging.toml` には無いことを確認（同ファイルに該当 var 無し・`main = dist/server/index.js`）。

### prod スモーク（AC-9）

- `app/server.cloudflare.ts:99-104` の sitemap 分岐が `preRoute` hook 早期 return（L86-94）**より後・`defaultEntry.fetch`（L105）より前**に保存され、分岐の出所を hook へ移す過程で順序を取りこぼしていない。prod default `createFetchHandler()`（両 hook undefined）は「override なし → sitemap 判定 → defaultEntry」の従来フローと等価。report TC-3（`GET /` 200・`/sitemap.xml` 200 XML・`/admin` 200）/ TC-4（`/dev/r2/x` は HTML 404 = proxy 不発火）で裏取り済み。

## Build & 構造保証

### Blockers

なし

### Warnings

なし

（Round 1 の W-001「恒常ガード不在」は Round 2 で N-001 へ格下げ。理由は下記 N-001 参照。）

### Notes

- **[N-001]** （Round 1 W-001 の再評価・格下げ）構造保証の実効レバー（`@cloudflare/vite-plugin` の `main` 上書き）はプラグイン実装依存であり、それを守る恒常的な自動ガードは存在しない。ただし Round 2 の再検証で、この依存は **prod 混入方向には効かない**ことを確認した: production ビルドでは `main`（カスタマイザ）と tanstackStart `server.entry` の両方が prod エントリを選び、いずれも Vite の `mode`（ビルド時定数）で決まる。dev の `main` delta は非 production mode でしか返らないため、プラグインが将来 `main` 解決を変えても production 出力に dev delta が適用される経路が無い。最終保証は「prod エントリファイルに dev アダプターへの import エッジが物理的に無い」ことで、これは DCE より遥かに強く、プラグイン挙動に依存しない。プラグイン依存リスクが顕在化するのは dev 側（dev コードが実際に載るか）に限られ、その不動作は `pnpm dev` / `pnpm build:local && pnpm start` で即顕在化する。加えて恒常 grep の撤去は Issue #675 の中核ゴール（DCE＋後追い grep → 構造保証へ格上げ）そのものであり、CI grep の再導入は本 Issue が排除した後追い検証モデルへの部分回帰になる。したがって恒常ガード不在は**設計として妥当な見送り**であり、Blocker/Warning ではない。defense-in-depth を望むなら plan step7 のワンタイム grep を CI 化する選択肢は残るが、必須ではない（構造保証を弱めないための任意策）。
- **[N-002]** 本 PR は Round 1 レビュー時点からコード無変更（#675 は単一コミット `afdd14b1`）。Round 1 の合格判定（エントリ選択・差分返却契約・mode 分岐・DCE 撤去・JSDoc 整合・AC-1/AC-2 構造保証）は現物で維持されており、退行なし。`pnpm typecheck` exit 0 を再確認。
- **[N-003]** tanstackStart `server.entry` の mode 分岐（`vite.config.cloudflare.ts:43-47`）は Worker ルートを決めない冗長分岐だが、ADR-004 の記述どおり「実効レバー（`main`）と常に一致させる保険」「将来 `server.entry` が尊重される挙動になっても安全側」の位置づけで、削除より現状維持が妥当。害なし。
- **[N-004]** エントリ選択・二重連結バグの経緯が ADR-004 に実測ベースで克明に記録され、「構造検証だけでなくランタイム起動確認が必須」という教訓まで残している点は、将来のプラグインアップグレード時の再確認ガイドとして有用。report TC-8 と対で読める。
