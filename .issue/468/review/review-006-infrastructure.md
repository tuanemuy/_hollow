# Review 006 — Infrastructure（ゼロベース・フルレビュー）

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: アダプター・worker・インフラ構成
検証方法: `gh pr diff 834` 全読 + 関連実装（`serverCloudflare.ts` の `readRequestServerConfig`、`purgeOrphans.ts`、`checkSecrets.ts`、`vitest.config.integration.ts`）+ runbook コマンドの実在性を `node_modules` の wrangler 4.90.1 で実機確認。

## 受け入れ基準の充足（Infrastructure 関連）

- **AC-2（自動回収）**: metadata-first（`prepareSourcePersist` の小 UoW → put）+ sweep → purge チェーンが `ingestion.integration.test.ts`（rollback / put 失敗の E2E）と `handlers.integration.test.ts`（実 DB・実 R2 binding の 2-tick 経路）で実証されている。充足。
- **AC-3（cron 配線）**: `runPruneTick` に `sweepAbandonedSourceIntakes` → `purgeOrphans` が既存の best-effort try/catch パターンで追加され、戻り値契約 `{ outboxDeleted, processedEventsDeleted }` は不変。pruner cron（03:00 UTC daily）は 3 つの toml すべてに既存。未配線だった `purgeOrphans` の spec 乖離も解消。充足。
- **AC-4（誤回収防止）**: strict `<` の cutoff が D1 実装・InMemory フェイク・ドメインサービスの 3 層でテストされ、tick 統合テストは「1h 前の fresh pending/source が両 tick を無傷で生き残る」ことまで assert（`graceSec: 0` 誤配線の検出ガード）。充足。
- **AC-5（既存フロー無退行）**: `runPruneTick.test.ts` が既存ステップの順序・失敗分離・新ペアの非阻害を検証。充足。

### Infrastructure

#### Blockers

なし

#### Warnings

- **[W-001]** 回収レイテンシの記載「up to ~2 days」が最悪ケースを過小に表現している
  - 場所: `docs/runtime_cloudflare.md`（Media storage hygiene セクション「End-to-end reclaim latency for an abandoned intake is therefore up to ~2 days」）。`.issue/468/adr.md` ADR-003 の「回収レイテンシは最悪 約2日」も同様。
  - 理由: tick は日次で猶予は 24h・候補条件は strict `<` のため、tick 直後（03:00+ε）に放棄された intake は day+1 tick で 24h−ε となり skip、orphan 化は day+2 tick（≈48h 後）。orphan の `updatedAt` は tick 実行時刻に再スタンプされるため、purge はさらに翌 tick（24h+数秒後、tick 内の実行順で sweep より purge が後なので通常は通るが ms ジッター次第で day+4 に滑る）。つまり現実の最悪値は約 3 日（稀に約 4 日）であり、「up to（上限）」として ~2 days を示すのは向きが逆。運用者が「2 日過ぎても blob が残っている」を異常と誤認する材料になる。
  - 提案: 「約 2〜4 日（各ステージの 24h 猶予が日次 tick に量子化されるため）」等、tick 量子化込みの上限に修正する。ADR-003 の同記述も揃える。

#### Notes

- **[N-001]** `ObjectStorage.delete` の冪等性契約（missing key = success）が JSDoc の宣言だけでなく、実 R2 binding（miniflare）に対する新設の `r2ObjectStorage.integration.test.ts` でピン留めされている。回収チェーンがフェイクの挙動にしか依存していない、という fake-vs-real の隙間を正しく塞いでおり、アダプター契約の固定方法として模範的。
- **[N-002]** #783 由来の infra ドリフト（production/staging テンプレートの pruner に `OBJECT_STORAGE` binding / `R2_OBJECT_BUCKET_NAME` が無い）が両テンプレートで解消され、コメントに「binding + presign secrets 3 種 + bucket name var の all-or-nothing で欠けると unavailable フォールバック」という失敗モードまで明記されている（`readRequestServerConfig` の実装 L383-387 と一致することを確認済み）。`secrets.ts` の `dispatchExtras` → `llmDispatchExtras` / `r2PresignExtras` 分割は宣言の正確化のみで secrets の union は不変であり、`checkSecrets.ts`（union 比較）と CI bulk push に影響しないことを確認した。
- **[N-003]** 手動リコンサイル runbook（`docs/runtime_cloudflare.md`）のコマンドを wrangler 4.90.1 で実機検証した: `r2 object` サブコマンドは get / put / delete のみで「wrangler に `r2 object list` は無い」という記述は正確。`r2 object delete` の positional は `{bucket}/{key}` 単一パス + `--remote` フラグ実在、`d1 execute --remote --command` も実在。`--region auto` の注記は AWS CLI の実際の failure mode に対応する。また手順が「S3 listing → D1 突合」の順であるため、metadata-first（行が blob より先）と合わせて in-flight commit の blob を誤削除しない順序になっている点も良い。
- **[N-004]** デプロイ初回の pruner tick から、これまで未配線で溜まっていた orphan / deleting 行のバックログ（source 以外の image / video / avatar も含む）の purge が始まる。spec どおりの意図された挙動で、削除は設計上正当（orphan 化は decrementRef 経由のみ、trash 中は参照保持）だが、R2 delete は不可逆であることは運用上意識しておくとよい。日次 100 行のバッチ上限（既知の別 Issue 課題）が事実上のスロットルとして働く。
- **[N-005]** `runPruneTick` の統合テストが「テスト用オプション貫通をプロダクションコードに足さない」制約下で 2-tick + `updatedAt` バックデートにより container → adapter → D1/R2 の実配線を検証しており、さらに tick がデフォルト猶予（24h）で sweep を呼んでいることを fresh 行の生存で assert している。unit テスト（全ステップ mock）だけでは検出できない DI 配線ミス・猶予上書きミスの両方を実経路で塞いでいる。

## 既知の見送り（再指摘しない）

`.issue/468/adr.md`「pruner 回収の運用強化」に記録済みの purge スループット上限（100 行/日）、malformed 行による候補列挙の全体 throw、attach / re-stamp 経路の構造的封鎖、テンプレート↔ローカル wrangler.toml の binding パリティテストは、別 Issue 対応の合意済み見送りとして本レビューの対象外とした。
