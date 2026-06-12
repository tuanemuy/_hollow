# PR #673 レビュー — Round 1

### Test & Docs

#### Blockers

なし

#### Warnings

- **[W-001]** エントリポイントのコメントが、本 PR 自身の ADR が確立した事実と矛盾している
  - 場所: `app/server.cloudflare.ts:62-64`（コメント「Under `pnpm start` (`wrangler dev` without Vite) `import.meta.env` is `undefined`, so guard with optional chaining; the runtime gate then relies on the local-only `DEV_INLINE_RELAY` var.」）
  - 理由: `.issue/663/adr.md` の「`pnpm start` 検証は…」ADR と `docs/runtime_cloudflare.md:49` 自身が「`pnpm start` は redirected config 経由で常に Vite ビルド成果物を実行し、TS ソースを直接動かすことはない」と認定した。つまり「`pnpm start` = wrangler dev without Vite で `import.meta.env` が undefined」というシナリオはもう存在しない（build:local 成果物では `MODE` は `"development"` に定数化済み、素の build では経路ごと DCE 済み）。旧 #66 時代の説明の残骸であり、次にこのゲートを触る人を誤った前提（「pnpm start は TS 直バンドル」）に誘導する — まさに本 PR の Round 1 FAIL を生んだ誤解と同じもの
  - 提案: optional chaining 自体は防御として残してよいが、根拠説明を「`pnpm start` は常に Vite ビルド成果物（build:local では `MODE` が `"development"` に定数化、素の build では DCE 済み）を実行する。optional chaining は Vite を介さない実行系（テスト等）への防御」のように、ADR / docs と整合する記述へ更新する

- **[W-002]** docs 内の他セクション（#657 presigned フロー）が `pnpm build && pnpm start` のまま — ジョブ型エクスポートを含む E2E では元症状が再発する手順
  - 場所: `docs/runtime_cloudflare.md:67`, `docs/runtime_cloudflare.md:78`
  - 理由: presigned プロキシ自体は実行時ゲート（`R2_DEV_OBJECT_PROXY`）のみで DCE 対象外のため、素の `pnpm build` でも動作する — 記述として誤りではない。しかし #657 の検証シナリオ（TC-5）はジョブ型一括エクスポートのダウンロードを含み、それが本 Issue の発端。読者がこのセクションを根拠に `pnpm build && pnpm start` で E2E を回すと、ジョブが「待機中」で止まる元症状を再び踏む。新セクション（54行目）が「build:local を使え」と言う一方、すぐ下のセクションが plain build を案内しており、ドキュメント内で手順が割れている
  - 提案: 67行目（および78行目の対象記述）に「ジョブ型エクスポート等 outbox 経由の機能を含めて完走させる場合は `pnpm build:local && pnpm start`（"Local dev outbox dispatch" 参照）」の一言を添えるか、`pnpm build:local && pnpm start` に統一する

- **[W-003]** 「`wrangler.toml [vars]` の変更は `pnpm start` 環境では再ビルドしないと反映されない」という運用上の罠が docs に書かれていない
  - 場所: `docs/runtime_cloudflare.md:54`（新設の build:local 段落）、関連: `docs/runtime_cloudflare.md:88`（wrangler.toml の説明テーブル）
  - 理由: redirected config では vars が `dist/server/wrangler.json` に焼き込まれるため、`DEV_INLINE_RELAY` 等を変更してもサーバー再起動だけでは反映されない。実際 EC-1 の検証ログ（`.issue/663/manual-test/results/EC-1.md` step 2）で「再ビルド必須」と確認済みで、`.issue/663/testing.md` のエッジケース手順にも織り込まれているのに、永続ドキュメント側には記載がない。88行目のテーブルも「`pnpm dev` / `pnpm build` discover it」のままで、`pnpm start` が（dist 経由で間接的に）消費する事実を反映していない
  - 提案: build:local 段落に「vars は `dist/server/wrangler.json` に焼き込まれるため、`wrangler.toml [vars]` 変更後は `pnpm build:local` の再実行が必要」を 1 文追加する

#### Notes

- **[N-001]** AC-2（DCE grep）が手動コマンドのまま自動化されていない。plan が「本変更で最も壊れやすい保証」と位置付け、実際に実装中も中間変数束縛で一度壊れた（adr.md「`import.meta` は中間変数に束縛せず…」）保証なので、`package.json` に `verify:dce` 的なスクリプト（`pnpm build` → grep → exit code）を切って CI か pre-PR チェックに載せる価値が高い。本 PR のスコープ外として Issue 化でもよい
- **[N-002]** `resolveInlineRelayGate` の真偽表テスト（`app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts:130-150`）は plan ステップ 2 の観点（flag `"true"` 厳密一致: undefined / `"false"` / `"TRUE"` / `""`、viteDev 優先）を網羅し、「production 無効はこのテストの責務外」の理由コメントも適切。既存 20 ケースは全件 PASS を確認（vitest 実行）。指摘なし
- **[N-003]** `.issue/663/plan.md` の AC-1 等は `pnpm build && pnpm start` 表記のままだが、build:local への前提修正は adr.md・summary.md・testing.md に記録されており、計画書は履歴成果物として改変不要と判断。testing.md 冒頭の build:local 必須注記は正確
- **[N-004]** README.md（79・87行目付近）の `pnpm build` → `pnpm start` 記述は「production build を wrangler dev で動かす」文脈として依然正しい（その成果物で outbox が動かないのは仕様どおり）。ただし W-002 を直す際、README からローカル E2E 手順を辿る読者がいるなら同様の相互参照を検討してもよい

#### 総評

テスト設計は plan の責務分割（実行時ゲート = 単体テスト / production 無効 = ビルド時 DCE + grep）に忠実で、真偽表の網羅・除外理由の明文化ともに良好。manual-test の証跡（Round 1 FAIL → 原因分析 → build:local 導入 → Round 2 全 PASS、EC-1 でのゲート OFF 再現）も検証として十分。docs の新設セクション自体は実挙動と一致しているが、コメント・他セクションに旧前提（「pnpm start = TS 直実行」「plain build で E2E」）の残骸があり、それが本 Issue の発端と同種の誤解を再生産し得る点が主な指摘。
