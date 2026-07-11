# Review 005 — Use Case（ゼロベース・フルレビュー）

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: アプリケーション層（ユースケースのオーケストレーション、UoW 境界、エラー契約、受け入れ基準の充足）。前ラウンドの結果は前提にせず、diff・実装・spec を一次情報として再検証した。

## 受け入れ基準の検証結果

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 | 充足 | `spec/domains/media.md` に保持ポリシー（TTL なし・Note ライフサイクル連動・orphan 化の3契機・二重猶予 24h+24h・再検討トリガー）を明文化。ADR-001 と一致。`docs/runtime_cloudflare.md` に pre-#468 漏れ blob の手動リコンサイル手順（ADR-002 の約束）も追記済み |
| AC-2 | 充足 | `prepareSourcePersist` が metadata-first（temp 欠損 skip → 小 UoW で pending 行 commit → put）に変更。`ingestion.integration.test.ts` の rollback E2E（NotFoundError ロールバック → pending/source 行 + blob 残存 → sweep(swept:1) → purgeOrphans 1回で blob+行消滅）と put 失敗系（blob なし行 → 冪等 delete で purge 完走）の両テストで人手介在なしの回収を実証 |
| AC-3 | 充足 | `runPruneTick` に `sweepAbandonedSourceIntakes` → `purgeOrphans` を各々独立の best-effort try/catch で配線（戻り値契約不変）。pruner cron は `[env.pruner.triggers] crons = ["0 3 * * *"]` で実在し、production/staging テンプレートにも `OBJECT_STORAGE` binding が追加済み。未配線だった `purgeOrphans` の spec 乖離も解消 |
| AC-4 | 充足 | 猶予内スキップ（sweep integration②）、strict `<` cutoff（domain unit）、orphan 化の `updatedAt` 再スタンプによる二重猶予、per-row fresh `findById → isPending ∧ kind==='source'` ガード（unit の変異注入: attached 化・行消失の両アーム）を確認 |
| AC-5 | 充足 | commit 正常系 / overwrite / uploadMedia 系の既存テスト維持。`uploadMedia` / `uploadMediaPresigned` は JSDoc + 型（`UploadableMediaKind`）のみで実行時挙動不変（transport の zod enum は元から source を含まない）。`pnpm typecheck` green を確認 |

## 実装確認メモ（判断根拠）

- **commit の metadata-first フロー**（`app/core/application/ingestion/commitIngestionPreview.ts`）: temp 欠損 skip 判定 → 小 UoW（`MediaAsset.create`、イベント collect なし）→ `safeStoragePut` → main UoW（`findById` → `isPending` ガード → `markAttached` + collectEvents）。put 失敗・main UoW ロールバック・クラッシュのどの断面でも `pending(kind='source')` 行が残り回収経路に乗る。ガード違反は `SystemError(DataIntegrityError)` で fail-loud（黙って `sourceFileId` を落とさない）。
- **同一 job の並行 commit / リトライ**: mediaId は試行ごとに新規ミントなので行・キーは衝突せず、敗者の残骸は sweep 対象、勝者は自分の行だけを attach。ingestion job 側は OCC + `isPreviewing` ガードで多重 commit を拒否。E2E の再 commit 非干渉 assert と一致。
- **stage (a) の権限・状態ガード**: `ownerId !== actor` / 非 previewing / temp キーなしはいずれも row insert・put の**前**に null-return するため、権限のない actor や無効な job のために blob や行が作られることはない（本エラーは main UoW が正規の契約（Forbidden / BusinessRule）で投げる）。
- **`sweepAbandonedSourceIntakes`**: `purgeOrphans` と同型（候補列挙 UoW → per-row UoW + try/catch、`{ swept, failed }`、clock ポート経由、猶予計算は `MediaService.listAbandonedSourceIntakes` に委譲）。`media.orphaned` は outbox に載るが `dispatchDomainEvent` が `media.*` を skip するため consumer 影響なし。per-row 失敗分離は unit（`failSaveIds` 注入）で担保 — integration で作為なしに再現できない旨の設計判断が adr.md に記録済み。
- **エラー契約**: put 失敗は `SystemError(ExternalApiError)`（adapter 翻訳済みの `StorageUnavailableError` を `safeStoragePut` が変換）、整合性異常は `SystemError(DataIntegrityError)`、ユーザー起因は既存の `NotFoundError` / `ForbiddenError` / `BusinessRuleError` のまま — ドメインエラーの再翻訳なし、broad catch は worker per-row のみで、CLAUDE.md のクロスレイヤー catch 方針に準拠。
- **既知の見送り**（adr.md「pruner 回収の運用強化」: purge スループット上限 / malformed 行の listing 耐性 / attach・re-stamp 経路の構造的封鎖（reconcileRefs / updateProfile / finalizeUpload））は記録と sweep JSDoc の残余窓説明を確認済み。本レビューでは再指摘しない。sweep の per-row ガードが cutoff を再検証しない点も検討したが、正当なフロー（commit の attach）は status 遷移でガードに捕まり、`updatedAt` 再スタンプだけが起きる経路は上記見送りの封鎖対象そのものなので、独立の指摘とはしない。
- **Round 4 [W-001]（spec の `kind` 未反映）は解消済み**: `spec/usecases/media.md` の UploadMedia / UploadMediaPresigned 入力DTO が `kind: UploadableMediaKind`（source 除外、#468 ADR-004 参照付き）に更新されている。

### Use Case

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** `SourcePersist` を `{ mediaId: MediaAssetId }`（branded 型）に縮小した追加決定が効いている: main UoW は永続化済み行を単一の真実として再読し、メタデータ二重運搬の曖昧さがなく、下流に cast も残らない。adr.md「実装時の追加決定」との整合も取れている。
- **[N-002]** AC-2 の E2E テストが受け入れ根拠として十分以上: ロールバック残骸の assert に加え、outbox への `media.*` 非漏出（stage (a) 非 collect + main UoW discard の裏取り）、temp 保全による再 commit 可能性、再 commit と残骸の非干渉、sweep の選別（attached 非対象）、put 失敗の row-before-put 順序ガード、temp 欠損の check-before-insert 順序ガード、DataIntegrityError の両アーム（行消失 / 非 pending 遷移、3-UoW トポロジ固定付き）まで一本ずつ独立に固定している。
- **[N-003]** `UploadableMediaKind` による型封鎖は「illegal states unrepresentable」の好例: sweep の放棄判定（ADR-004「猶予超過の pending source = 放棄」）の安全前提を型レベルで担保し、封鎖理由が型の JSDoc に自己記述されている。`uploadMediaPresigned` の誤った「PurgeOrphans が回収する」JSDoc の実態修正（現状 pending は回収対象外）も併せて完了。
- **[N-004]** `runPruneTick` の配線は既存パターン（独立 best-effort try/catch・戻り値契約不変・per-step の `RequestContainer`）に忠実で、sweep → purge の順序と「1 tick で 1 段だけ進む」二重猶予の帰結が handler JSDoc・`spec/usecases/media.md`・adr.md の三者で一貫して記述されている。unit（順序・失敗分離・非阻害・skip 時非実行）と実 DB の 2-tick テスト（container → adapter 配線の実経路）の役割分担も明確。
- **[N-005]** ドメインサービス境界が正しく保たれている: 猶予（cutoff 計算）は `MediaService.listAbandonedSourceIntakes` に置かれ、アダプターは status/kind フィルタのみ。`findAbandonedSourceIntakes` の戻り型 `PendingMedia[]` と oldest-first + id tie-break の順序契約がポート JSDoc に明記され、フェイク実装（unit テスト・service.test の InMemoryRepo）も同順序を再現している。
