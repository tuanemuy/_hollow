# Review 005 — PR #834 (Issue #468)

### Infrastructure

#### Blockers

なし

#### Warnings

- **[W-001]** wrangler テンプレートとローカル `wrangler.toml` の binding パリティが引き続き手動同期のままで、本PRが修正したものと同じクラスのドリフトを構造的に防ぐ仕組みがない（場所: `infra/templates/wrangler.{production,staging}.toml.tmpl` / `wrangler.toml` / `infra/scripts/__tests__/` — 理由: #783 では「ローカルには `[env.pruner]` の `OBJECT_STORAGE` binding + `R2_OBJECT_BUCKET_NAME` を追加したがテンプレートには入れなかった」というドリフトが実際に発生し、本番の export purge が unavailable storage へ静かにフォールバックしたまま本PRまで検出されなかった。今回テンプレートは修正されたが、再発防止はコメント（「Mirrors the `[env.consumer]` binding」等）による注意喚起のみ。misconfig 時の実挙動は「purge の R2 delete が per-row の `StorageUnavailableError` エラーログになり、行は `deleting` で再試行され続ける」で、候補ゼロの間は兆候すら出ない — 提案: `infra/scripts/__tests__/` に、`wrangler.toml` の各 `[env.*]` に存在する `r2_buckets` binding / 重要 vars（`R2_OBJECT_BUCKET_NAME` 等）が両テンプレートにも存在することを assert する軽量なパリティテスト（TOML パースで十分）を追加する。placeholderGuard と同様の「純関数 + unit test」構成で載せられる。本PRのマージブロッカーではないが、#783 で一度実証された失敗モードなので早めに手当てする価値がある）
  → 見送り: 運用強化テーマに束ねて別Issueで対応（`.issue/468/adr.md`「pruner 回収の運用強化」参照）

#### Notes

- **[N-001]** AC-3（cron 配線）は完全に満たされている。`runPruneTick`（`app/worker/cloudflare/handlers.ts`）が `sweepAbandonedSourceIntakes` → `purgeOrphans` を #783 の export purge と同一の「独立 best-effort try/catch + 専用 `RequestContainer` + 戻り値契約不変」パターンで実行し、未配線だった `purgeOrphans` の spec 乖離（`spec/usecases/media.md`「Cron 起動」）も解消。unit テスト（`runPruneTick.test.ts`）は呼び出し順（sweep → purge）・各ステップの失敗分離・既存ステップ非阻害・戻り値契約を検証し、`handlers.integration.test.ts` の 2-tick テストが container → D1/R2 アダプターの実配線（unit がモックで潰している継ぎ目）を実DB/実R2バインディングで裏付けている。テスト env の完備（`OBJECT_STORAGE` binding + presign vars）も `vitest.config.integration.ts` で確認した。
- **[N-002]** infra テンプレート修正はエンドツーエンドで正しい。`${R2_OBJECTS_BUCKET}` は `infra/scripts/renderWrangler.ts` の既知変数（未知変数は render 時に throw するため typo は CI で検出される）。`[env.pruner.vars]` への `R2_OBJECT_BUCKET_NAME`、`[[env.pruner.r2_buckets]]` の配置は production/staging 両テンプレートで local `wrangler.toml` と一致。テンプレートコメント・`docs/runtime_cloudflare.md` の「binding + presign 3 secrets + bucket var の all-or-nothing」という記述は `readRequestServerConfig`（`serverCloudflare.ts` の presignComplete ゲート）の実装と正確に一致することを確認した。
- **[N-003]** `infra/src/secrets.ts` の `dispatchExtras` → `llmDispatchExtras` / `r2PresignExtras` 分割は正確。pruner は実消費する R2 トリオのみ宣言し、web / consumer の宣言集合は従来と同一。secrets の union（`checkSecrets.ts` は `flatMap` の Set で照合）は不変のため SOPS ファイル・bulk push とも影響なし。コメントも pruner の実消費（purge チェーン）を正しく反映している。
- **[N-004]** `docs/runtime_cloudflare.md` の手動リコンサイル runbook のコマンド実在性を wrangler 4.90.1 で検証した: `wrangler r2 object` のサブコマンドは get/put/delete のみで「`r2 object list` は無い」という記述は正しい。`r2 object delete <{bucket}/{key}>` の positional 形式と `--remote` フラグ、`d1 execute <db> --remote --command` も CLI と一致。`aws s3api list-objects-v2 --region auto` の注記（region 必須、R2 は auto）も妥当。また手順自体が稼働中でも安全: metadata-first 化後は「行が blob より先」なので、進行中 commit の source blob は必ず DB 行を持ち、bucket−DB の差分（削除対象）に載らない。
- **[N-005]** `ObjectStorage.delete` の冪等性（missing key = 成功、`StorageNotFoundError` を投げない）をポート契約として明文化した点は良い。put 失敗で「blob なし pending 行」が purge 経路に定常流入する #468 以降、この契約が破られると行が `deleting` で永久 stall するため、JSDoc への依存関係込みの固定と blob なし行の purge 完走テスト（sweep integration ⑥）による契約検証は、将来の別バックエンドアダプター実装に対する適切な防護。
- **[N-006]** D1 `findAbandonedSourceIntakes` は既存 `idx_media_status_updated (status, updated_at)` で賄い kind を残余述語とする判断（マイグレーション不要）は候補集合の規模（稀な異常系の残骸）に対して妥当。`updatedAt ASC, id ASC` の tie-break をポート契約として明記し、D1 integration テストで limit 跨ぎの決定性まで検証している。

（既知の見送り — purge スループット上限・malformed 行の listing 耐性・attach/re-stamp 経路の構造的封鎖 — は `.issue/468/adr.md` の別Issue記録を確認済みのため再指摘しない）
