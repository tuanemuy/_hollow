# Review 004 — Use Case（ゼロベース・フルレビュー）

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: アプリケーション層（ユースケースのオーケストレーション、UoW 境界、エラー契約、型封鎖、受け入れ基準の充足）

## 受け入れ基準の検証結果

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 | 充足 | `spec/domains/media.md` に保持ポリシー（TTL なし・Note ライフサイクル連動・二重猶予・再検討トリガー・orphan 化の3契機）を明文化。ADR-001 と整合 |
| AC-2 | 充足 | `prepareSourcePersist` が metadata-first（temp 欠損チェック → 小 UoW で pending 行 commit → put）に変更され、`ingestion.integration.test.ts` の rollback E2E（NotFoundError ロールバック → pending/source 行 + blob 残存 assert → sweep（swept:1）→ purgeOrphans 1 回で blob+行消滅）で人手介在なしの回収経路を実証。put 失敗系（blob なし pending 行 → 冪等 delete で purge 完走）も別テストで実証 |
| AC-3 | 充足 | `runPruneTick` に `sweepAbandonedSourceIntakes` → `purgeOrphans` を各々独立の best-effort try/catch で配線（戻り値契約 `{ outboxDeleted, processedEventsDeleted }` 不変）。未配線だった `purgeOrphans` の spec 乖離も解消。`runPruneTick.test.ts`（順序・失敗分離・非阻害）と `handlers.integration.test.ts` の 2-tick 実 DB テストで裏付け |
| AC-4 | 充足 | 猶予内スキップ（sweep integration）、strict `<` cutoff、orphan 化の `updatedAt` 再スタンプによる二重猶予（sweep → purge が別 tick になる構造）、per-row fresh `findById` ガード（unit の変異注入）を確認 |
| AC-5 | 充足 | commit 正常系 / overwrite / uploadMedia 系の既存テストは維持。`uploadMedia` / `uploadMediaPresigned` は JSDoc + 型（`UploadableMediaKind`）のみの変更で実行時挙動は不変。transport schema（`z.enum(["image","video","avatar"])`）は元から source を弾いており退行なし |

## 実装確認メモ（判断根拠）

- **commit の metadata-first 3段フロー**: temp 欠損 skip 判定 → 小 UoW（`MediaAsset.create`、イベント collect なし）→ `safeStoragePut` → main UoW（`findById` → `isPending` ガード → `markAttached` + collectEvents）。put 失敗・main UoW ロールバック・クラッシュのどの断面でも `pending(kind='source')` 行が残り回収経路に乗ることをコードで確認。
- **同一 job の並行 commit / リトライ**: mediaId は毎回新規ミントなので pending 行は衝突せず、敗者側の残骸（行 + blob）は sweep 対象、勝者は自分の行を attach。E2E テストの re-commit 非干渉 assert とも一致。
- **`sweepAbandonedSourceIntakes`**: `purgeOrphans` と同型（候補列挙 UoW → per-row UoW + try/catch、`{ swept, failed }`）。`clock` ポート経由の時刻取得、`MediaService.listAbandonedSourceIntakes` への猶予計算の委譲、`media.orphaned` の outbox 収集（`dispatchDomainEvent` は `media.*` skip — 確認済み）はいずれも規約どおり。
- **既知の見送り3件**（purge スループット上限 / malformed 行の listing 耐性 / `reconcileRefs` の構造的封鎖）は adr.md 記録と sweep JSDoc の残余窓説明を確認済み。本レビューでは再指摘しない。

### Use Case

#### Blockers

なし

#### Warnings

- **[W-001]** `UploadableMediaKind` の型封鎖が spec に未反映 — `spec/usecases/media.md` の UploadMedia 入力DTO は `kind: MediaKind`、UploadMediaPresigned は無注釈の `kind` のまま（場所: `spec/usecases/media.md` L6 / L26）。本PRは実装側を `Exclude<MediaKind, "source">` に狭め、その封鎖を sweep の安全前提（ADR-004「猶予超過の pending source = 放棄と断定できる」）の根拠として `uploadMedia.ts` の JSDoc に明記しているのに、spec の入力契約は「source も受け付ける」と読める記述のまま残っている。spec を正として将来アップロード経路を実装・変更すると、封鎖の意図（と sweep の放棄判定の健全性）が spec からは読み取れない。同 PR が隣接セクション（PurgeOrphans / SweepAbandonedSourceIntakes）を更新しているだけに、この行だけ取り残されたのは PR 起因の spec-実装乖離。提案: 両ユースケースの入力DTO を `kind: UploadableMediaKind（= MediaKind から 'source' を除外。#468 ADR-004）` に更新する。
- **[W-002]** `finalizeUpload` が放棄された pending source の `updatedAt` を無条件に再スタンプでき、sweep の放棄判定アンカーを owner 操作で無期限に先送りできる（場所: `app/core/application/media/finalizeUpload.ts` L66-81）。`finalizeUpload` は owner チェックのみで kind / status を見ず、`stat` 成功なら `{ ...fresh, updatedAt: now }` で save する。put 成功・main UoW ロールバックで残った pending source は blob を持つため `stat` が成功し、呼ぶたびに sweep cutoff がリセットされる（放棄 intake の id は `listMediaByOwner` で owner に露出）。本PRの `entity.ts` JSDoc 自身が「re-stamping `updatedAt` on such a row defers its reclaim」とこの意味論を明文化した一方、再スタンプできる唯一の owner 向けユースケースにガードを入れていない。実害は自分のストレージの回収遅延のみ（データ損失なし・他者影響なし）で severity は低いが、ADR-004 の「pending source に触るのは commit フローだけ」という前提の穴であり、presign フローが型封鎖で source を作れなくなった今、`finalizeUpload` が source を受ける正当ユースケースは存在しない。提案: `finalizeUpload` で `kind === 'source'`（または非 uploadable kind）を `BusinessRuleError` / `NotFoundError` で拒否する（見送るなら adr.md の残余リスクに1行追記して判断を記録する）。
  - → 見送り: 構造的封鎖テーマに束ねて別Issueで対応（adr.md 参照）

#### Notes

- **[N-001]** metadata-first 化の実装が丁寧: `SourcePersist` を `{ mediaId: MediaAssetId }` に縮小して「行と projection のどちらが真か」の曖昧さを排除、main UoW の `findById` → `isPending` ガードは黙って `sourceFileId` を落とさず `SystemError(DataIntegrityError)` で fail-loud、temp 欠損チェックを行 insert より前に置いて無駄な行を作らない — いずれも計画・ADR の意図どおり。
- **[N-002]** AC-2 の E2E テスト（`ingestion.integration.test.ts`）が模範的: ロールバック後の残骸 assert に加えて、outbox への `media.*` 非漏出（stage (a) の collect なし + main UoW discard の検証）、temp 保全による再 commit 可能性、再 commit と残骸の非干渉、sweep の選別（attached は触らない）まで一本のシナリオで検証しており、受け入れ根拠として十分。
- **[N-003]** `UploadableMediaKind` の封鎖は型レベルで完結している: transport 境界の zod enum が source を含まず、仮に将来 enum を広げても `uploadMediaPresigned` の入力型が `UploadableMediaKind` のため typecheck が落ちる構造（`app/components/media/actions.ts` L28 で確認）。「illegal states unrepresentable」の原則に忠実で、封鎖理由が型の JSDoc に自己記述されている点も良い。
- **[N-004]** `runPruneTick` の配線は既存の「独立 best-effort try/catch + 戻り値契約不変」パターンに忠実で、sweep → purge の順序・「1 tick で 1 段だけ進む」二重猶予の帰結・per-step の独立 `RequestContainer` が JSDoc と spec（`usecases/media.md`）の双方に一貫して記述されており、運用時の挙動が読み取りやすい。
