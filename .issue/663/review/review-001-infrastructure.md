# PR #673 レビュー — Round 1

## レビュー対象

- PR: #673（fix(dev): pnpm start でジョブ型エクスポートが完走するよう InlineRelayTrigger を有効化）
- 計画: `.issue/663/plan.md` / `.issue/663/adr.md`
- 観点: Infrastructure（エントリポイント・アダプター・ビルド/wrangler 構成・DCE 保証）

## 受け入れ基準の検証

| AC | 判定 | 根拠 |
|----|------|------|
| AC-1 | 満たす（手順は `pnpm build:local && pnpm start` に変更） | manual-test TC-1 PASS（`inline dispatch drained 2`、/dev/r2 200）。plan の前提（「`pnpm start` は TS ソースを直接バンドル」）が誤りで、redirected config（`.wrangler/deploy/config.json` → `dist/server/wrangler.json`）により常に Vite ビルド成果物が実行されるため、`build:local` が導入された。逸脱は ADR 追記・docs・testing.md に記録済み |
| AC-2 | 満たす | DCE 2段ゲート（後述 N-001）。素の `pnpm build` 後の grep クリーンを report で確認（バンドル約120kB減のエビデンスあり） |
| AC-3 | 満たす | `infra/templates/wrangler.{staging,production}.toml.tmpl` は diff に含まれず不変。`deploy:*` スクリプト（package.json:22-49）と CI（`.github/workflows/deploy-{staging,production}.yml`）はいずれも直前に素の `vite build` を実行するため、stale な `build:local` 成果物がデプロイに混入する経路はない |
| AC-4 | 満たす | エントリの実行時ゲートは `viteDev ∨ flag` の OR で `pnpm dev` 経路（`DEV === true`）を包含。manual-test TC-3 PASS |

### Infrastructure

#### Blockers

なし

#### Warnings

- **[W-001]** 素の `pnpm build && pnpm start` では `DEV_INLINE_RELAY` がサイレントに無効（無シグナルで元症状再現）
  - 場所: `package.json:10`（`build:local`）, `docs/runtime_cloudflare.md:54`
  - 理由: production ビルドではインライン経路が DCE 済みのため、var が `dist/server/wrangler.json` に焼かれていても実行時に何も起きない。これはまさに検証 Round 1 で TC-1 が FAIL した踏み抜きパターンで、現状の防御は docs の一文のみ。経路自体が消えている以上ランタイム警告は出せない。
  - 提案: `"start:local": "pnpm build:local && wrangler dev"` のような複合スクリプトを追加して「正しい組み合わせ」を 1 コマンドにする（`start` 自体の変更は不要）。少なくとも `wrangler.toml` の `DEV_INLINE_RELAY` コメントに「`pnpm build:local` でビルドした場合のみ有効」と一言足すと再発防止になる。Blocker にしないのは、docs / testing.md / PR body / ADR の 4 ヶ所に手順が明記されており、誤った場合の影響もローカル検証の手戻りに限られるため。

- **[W-002]** plan.md の AC-1 / 調査結果が実装後の事実と不整合のまま
  - 場所: `.issue/663/plan.md:17`（AC-1 の「`pnpm build && pnpm start`」）, `:35`（「wrangler dev が TS ソースを直接バンドル」）
  - 理由: 実装で判明した redirected config の事実により、AC-1 の検証コマンドは `pnpm build:local && pnpm start` に変わった。ADR・docs・testing.md は更新済みだが plan.md の受け入れ基準表と調査結果は旧前提のまま。plan を一次資料として参照すると誤った手順に誘導される。
  - 提案: plan.md に追記（または AC-1 行の注記）で `build:local` への変更を反映する。

#### Notes

- **[N-001]** DCE 2段ゲートの構造は正しい。定数条件 `(import.meta as ...).env?.MODE !== "production"` がトップレベル短絡 `&&` の左辺＝純関数呼び出しの外側にあり（`app/server.cloudflare.ts:64-69`）、Rollup が呼び出し境界を越えて畳み込めない問題を回避している。さらに実装中に発覚した「`import.meta` を中間変数に束縛すると Vite の define 置換が効かない」制約もインライン参照で解決し、コメント（`:62-63`）と ADR に記録されている。検証責務の分担（実行時ゲート＝単体テスト、production 無効＝ビルド後 grep）も plan どおりで、テスト側コメント（`__tests__/inlineRelayTrigger.test.ts:131-133`）に明記されている。

- **[N-002]** `build:local`（`NODE_ENV=production vite build --mode development`）の副作用を確認した。`NODE_ENV=production` により `import.meta.env.DEV` は `false` に inline されるため、他の `DEV` 利用箇所（`app/core/presentation/errorDisplay.ts:258`、`__root.tsx` の Devtools、各 route の `staleTime`）はすべて production 挙動を維持する。差分は `MODE` ゲートのインライン経路のみで、docs の「otherwise-equivalent bundle」という主張は正確。`pnpm start` 下では `viteDev=false` となりゲートは var のみに依存する — EC-1（var OFF で元症状再現）がこれを実証している。

- **[N-003]** staging / production の不変性は二重に担保されている: (1) テンプレート無変更、(2) 素の `pnpm build` 成果物に経路が物理的に存在しない（grep）。仮に誤って staging toml に `DEV_INLINE_RELAY` を置いても inert であり、その旨と禁止ルールが `wrangler.toml` コメント・`serverCloudflare.ts` の JSDoc・docs の 3 ヶ所に一貫して書かれている。`ServerEnv` への `DEV_INLINE_RELAY?: string` 追加は `R2_DEV_OBJECT_PROXY` の既存パターンに正確に倣っている。

- **[N-004]** `worker-configuration.d.ts` は gitignore 対象（`.gitignore:12`）で `postinstall` / `predev` の `wrangler types` により再生成されるため、plan ステップ 5 の「差分が出ればコミット」は対象外で正しい。手元の生成物には `DEV_INLINE_RELAY?: "true"` が反映済みで、`ServerEnv` の `string` 型と整合する。

- **[N-005]** redirected config では `[vars]` がビルド時に `dist/server/wrangler.json` へ焼かれるため、`wrangler.toml` の var 変更は再ビルドしないと `pnpm start` に反映されない。EC-1 の手順には明記されているが、docs 本文では暗黙。W-001 の提案コメントに含めると親切。

## 結論

Blocker なし。DCE 保証・staging/production 不変性・デプロイ経路の安全性はいずれも検証済みで、計画からの逸脱（`build:local` 導入）も根拠と記録が揃っている。W-001 / W-002 は運用上の堅牢化・記録整合の改善提案。
