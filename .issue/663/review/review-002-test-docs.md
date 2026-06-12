# PR #673 レビュー — Round 2（Test & Docs）

レビュー日: 2026-06-13。ゼロベースのフルレビュー（Round 1 指摘 W-001〜W-003 の反映確認を含む）。

## Round 1 指摘の反映確認

- **W-001（エントリコメントの旧前提）**: 修正済み。`app/server.cloudflare.ts:50-64` のコメントは「`pnpm start` は redirected config 経由で常に Vite ビルド成果物を実行する」「optional chaining は非 Vite 実行系（テスト等）への防御であり `pnpm start` のためではない」と ADR / docs に整合する記述へ更新された。中間変数束縛禁止の制約も明記されている。
- **W-002（presigned セクションの plain build 手順）**: 修正済み。`docs/runtime_cloudflare.md:67` は `pnpm build:local && pnpm start` に統一され、「プロキシ自体は DCE 対象外で素の build でも動くが、outbox 経由の機能を含む E2E では build:local 必須」と相互参照付きで補足。78行目相当（対象記述）も `build:local` に更新。
- **W-003（vars の焼き込みと再ビルド必須）**: 修正済み。build:local 段落に「`[vars]` は `dist/server/wrangler.json` にビルド時に焼き込まれるため、変更後は `pnpm build:local` の再実行が必要（再起動のみでは反映されない）」を明記。88行目のファイル説明テーブルも「`pnpm start` は dist 側に焼かれた vars を間接消費する」へ更新された。

## 独立検証（レビュー時に実施）

- `npx vitest run app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts` → 20/20 PASS（`resolveInlineRelayGate` 真偽表 8 ケース含む）
- `pnpm build` → `grep -rn "InlineRelayTrigger\|inline-dev\|import.meta.env" dist/` → ヒットなし（AC-2 を実機で再確認、「OK: DCE clean」）
- `infra/templates/wrangler.{staging,production}.toml.tmpl` 差分なし（AC-3）
- plan.md ステップ 5（`wrangler types` 再生成）: `worker-configuration.d.ts` は gitignore 対象（`predev`/`postinstall` で再生成）のため「コミットに含める」は適用外。ローカル再生成物には `DEV_INLINE_RELAY?: "true"` が反映済みで不整合なし

### Test & Docs

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** README.md のローカル実行手順（`README.md:78-79`, `86-87`）は `pnpm build` → `pnpm start` のまま
  - 理由: 「production ビルドを wrangler dev で動かす」説明としては依然正しく、Round 1 N-004 の判断を維持する。ただし docs/runtime_cloudflare.md 側が「plain build && start では var がサイレントに無効（無シグナルで元症状）」と明示的に警告する罠である以上、README からローカル E2E に入る読者向けに「outbox 経由の機能を E2E するなら `pnpm build:local`（docs/runtime_cloudflare.md 参照）」の一言があると親切。次に docs を触る機会での追記で十分
  - 提案: README の該当ブロックに 1 行の相互参照を追加（本 PR 必須ではない）
- **[N-002]** `.issue/663/testing.md` 確認項目 2（単一ノート同期エクスポート）の「対応する受け入れ基準: AC-3（傍証）」のマッピングがやや緩い
  - 理由: AC-3 は staging / production の実行時挙動不変が本旨で、その検証手段はテンプレート差分なし＋DCE grep と plan に明文化済み。単一ノート同期エクスポートはローカルの既存経路回帰確認であり、AC-3 の傍証というより「既存機能への影響確認」に属する。判定への実害はない（検証自体は有益で PASS 済み）
  - 提案: 履歴成果物のため改変不要。今後の testing.md 生成時は回帰確認系を「既存機能への影響確認」側に置くとマッピングが明瞭
- **[N-003]** `.issue/663/adr.md` の ADR-001 Status が `Proposed` のまま（実装・検証完了済み）。また 2 件目以降の追記 ADR（`import.meta` インライン参照 / build:local）には Status・採番がない。記録としての正確性に影響はないが、形式を揃えるなら `Accepted` 化と採番を検討
- **[N-004]** AC-2（DCE grep）の自動化（Round 1 N-001 の `verify:dce` スクリプト提案）は未対応のまま。本ラウンドの独立検証でも手動 build+grep で確認した。実装中に一度実際に壊れた保証（中間変数束縛で DCE 失敗）であり、CI ないし pre-PR チェックへの組み込みは依然価値が高い。本 PR スコープ外として Issue 化推奨

#### 総評

Round 1 の Warnings 3 件はいずれも提案どおりに修正され、コメント・docs・testing.md・plan 注記の間で「`pnpm start` = redirected config 経由の Vite ビルド成果物実行」「production 無効の担保 = ビルド時 DCE + grep」という前提が一貫している。テストは plan の責務分割（実行時ゲート = 単体テスト真偽表 / production 無効 = ビルド検証）に忠実で、除外理由のコメントも適切。AC-1〜AC-5 はマニュアルテスト証跡（5/5 PASS、EC-1 でゲート OFF の元症状再現）と本ラウンドの独立検証（unit 20/20、DCE grep クリーン、テンプレート差分なし）で充足を確認した。残る指摘は将来改善の Note のみで、ブロッカー・警告なし。
