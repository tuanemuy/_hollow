# PR #673 レビュー — Round 2

## レビュー対象

- PR: #673（fix(dev): pnpm start でジョブ型エクスポートが完走するよう InlineRelayTrigger を有効化）
- 計画: `.issue/663/plan.md` / `.issue/663/adr.md`
- 観点: Infrastructure（エントリポイント・アダプター・ビルド/wrangler 構成・DCE 保証）
- 前ラウンド: `.issue/663/review/review-001-infrastructure.md`（W-001 / W-002 の反映確認を含む）

## Round 1 指摘の反映確認

| ID | 状態 | 確認内容 |
|----|------|---------|
| W-001 | 反映済み | `docs/runtime_cloudflare.md` に「**Beware: under plain `pnpm build && pnpm start` the var is silently inert**」の明示警告、「`[vars]` 変更は再ビルド必須」（N-005 相当）、「DCE grep は素の `pnpm build` 成果物に対してのみ実施」が追記された。`start:local` 複合スクリプトは導入されなかったが、提案は択一（「少なくとも一言足す」）であり docs 側の防御で趣旨は満たされている。残余は N-002 参照 |
| W-002 | 反映済み | `.issue/663/plan.md:23` に「実装後の注記（PR #673 レビュー Round 1 反映）」が追加され、AC-1 等の `pnpm build && pnpm start` 表記を `pnpm build:local && pnpm start` に読み替える旨と、調査結果の誤前提（「TS ソースを直接バンドル」）の訂正が明記された。本文を履歴成果物として原文のまま残す方針も妥当 |

## 受け入れ基準の検証（ゼロベース）

| AC | 判定 | 根拠 |
|----|------|------|
| AC-1 | 満たす | manual-test TC-1 PASS（`pnpm build:local && pnpm start` で一括エクスポート完走、`/dev/r2/...` 200）。`runExportJob` が complete/fail を自 UoW で save するため 1 kick で完結する設計前提も docs に記録済み |
| AC-2 | 満たす（**実機再検証済み**） | PR ブランチを worktree に checkout し素の `pnpm build` を実行 → `grep -rn "InlineRelayTrigger\|inline-dev\|import.meta.env" dist/` がゼロヒット（OK: DCE clean）を本レビューで直接確認 |
| AC-3 | 満たす | `infra/templates/wrangler.{staging,production}.toml.tmpl` は diff に含まれず不変。`deploy:*` スクリプトと CI（`deploy-{staging,production}.yml`）はいずれも素の `pnpm build` を直前に実行するため `build:local` 成果物がデプロイに混入する経路はない。AC-2 の grep 通過と合わせ二重に担保 |
| AC-4 | 満たす | 実行時ゲートは `viteDev ∨ flag === "true"` の OR で `pnpm dev` 経路を包含。`resolveInlineRelayGate` の真偽表テスト 8 ケースを含む `inlineRelayTrigger.test.ts` 全 20 件 PASS を本レビューで実行確認。manual-test TC-3 も PASS |
| AC-5 | 満たす | docs/runtime_cloudflare.md「Local dev outbox dispatch」が 2 段ゲート構造・`build:local` 手順・redirected config の仕組み・staging で実 Queue 検証する方針に全面更新。presigned フロー節・コンフィグ表の `pnpm start` 記述も整合するよう追従 |

### Infrastructure

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** DCE 保証を実機で再検証した（PASS）
  - 場所: `app/server.cloudflare.ts:60-74`、`dist/server/index.js`
  - 内容: PR ブランチで (1) 素の `pnpm build` → DCE grep ゼロヒット、(2) `dist/server/wrangler.json` に `DEV_INLINE_RELAY: "true"` が焼かれるが経路自体が不在のため inert（docs の記述と一致）、(3) `pnpm build:local` → `InlineRelayTrigger` が成果物に残存（仕様どおり）、(4) ゲート単体テスト 20 件 PASS — をすべて直接確認した。定数条件を短絡 `&&` の左辺＝関数呼び出しの外側に置く構造、`import.meta` をインライン参照する制約のコメント化も plan / ADR どおり。

- **[N-002]** （W-001 の残余・任意）`wrangler.toml` の `DEV_INLINE_RELAY` コメント自体には「`pnpm build:local` でビルドした場合のみ有効」の一言がない
  - 場所: `wrangler.toml:40-47`
  - 理由: コメントは docs を参照しており、docs 側に明示警告があるため実害は薄い。ただし var を見た読者が最初に読むのはこの toml コメントで、「素の build では効かない」ことはここからは分からない。
  - 提案: 任意。コメント末尾に「effective only with `pnpm build:local` output — plain `pnpm build` DCEs the path」と一言足すか、将来 `start:local` 複合スクリプトを検討する程度でよい。

- **[N-003]** AC-2 の grep 検証は手動運用のままで、CI に組み込まれていない
  - 場所: `.github/workflows/ci.yml:85`（`pnpm build` のみ）、`docs/runtime_cloudflare.md` の検証コマンド
  - 理由: #66 以来の既存状況であり本 PR の退行ではないが、本 PR でゲートに実行時条件（var）が加わり「書き方次第で DCE が壊れる」面が広がった（実装中にも中間変数束縛で一度壊れた実績がある）。「production ビルドで無効」の唯一の検証点が手動 grep である以上、回帰検出は人に依存する。
  - 提案: 別 Issue で十分。CI の build ジョブに docs 記載の grep を 1 ステップ追加すれば AC-2 が恒久的に自動検証される。

- **[N-004]** `build:local` の `--mode development` による副作用は確認済みで問題なし
  - 場所: `package.json:10`
  - 内容: リポジトリに `.env.development` 系ファイルは存在せず、mode 切替で意図しない env 注入は起きない。`NODE_ENV=production` 前置により `import.meta.env.DEV` は `false` に inline され、他の `DEV` 利用箇所は production 挙動を維持（Round 1 N-002 の確認結果は引き続き有効）。`--mode local` が `.local` postfix と衝突して使えない経緯も ADR に記録されている。

## 結論

Blocker / Warning なし。Round 1 の W-001 / W-002 はいずれも反映済み。DCE 保証（AC-2）・`build:local` の経路残存・ゲート単体テストを本レビューで実機再検証し、すべて期待どおりであることを確認した。Notes はいずれも任意の堅牢化提案。
