# Review 010 — Use Case（ゼロベース・フルレビュー）

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: アプリケーション層（ユースケースのオーケストレーション、UoW 境界、エラー契約、ポート利用、受け入れ基準の充足）。前ラウンドの結果は前提とせず、diff 全体・実装（`commitIngestionPreview.ts` / `sweepAbandonedSourceIntakes.ts` / `purgeOrphans.ts` / `handlers.ts` / `uploadMedia.ts` / `uploadMediaPresigned.ts`）・ドメイン遷移（`entity.ts` / `service.ts`）・ポート契約・spec・テストを一次情報として再検証した。

## 受け入れ基準の検証結果（Use Case レイヤー関連）

| AC | 判定 | 根拠 |
|---|---|---|
| AC-2 | 満たす | metadata-first の 3-UoW 構成（job projection 読み → 小 UoW で `pending(kind='source')` 行 commit → put → main UoW で `findById → isPending ガード → markAttached`）により、put 成功・main UoW ロールバックの残骸が必ず `pending` 行 + blob として残り、`sweepAbandonedSourceIntakes` → `purgeOrphans` の既存経路に乗る。`ingestion.integration.test.ts` の「rollback → pending/source 残存 → 再 commit 非干渉 → sweep → purge → blob+行消滅」E2E が人手介在なしの回収を実証。put 失敗（blobless 行）・temp 欠損（行を作らない ordering）も専用テストで固定 |
| AC-3 | 満たす | `runPruneTick` 末尾に `sweepAbandonedSourceIntakes` → `purgeOrphans` を各々独立 best-effort try/catch で配線（未配線だった `purgeOrphans` の spec 乖離を解消）。順序・失敗分離・戻り値契約 `{ outboxDeleted, processedEventsDeleted }` 不変は `runPruneTick.test.ts` の unit で、container → D1/R2 の実経路は `handlers.integration.test.ts` の 2-tick テストで検証。cron トリガー（日次 03:00 UTC）は pruner 既設 |
| AC-4 | 満たす | 放棄判定は `MediaService.isAbandonedSourceIntake`（`pending` ∧ `kind='source'` ∧ strict `<` cutoff）に一元化され、候補列挙（`listAbandonedSourceIntakes`）と per-row fresh ガードが同一ルールの 2 表現。境界（24h−1min）スキップの integration、fresh ガード 3 態様（attach 遷移・grace 内への re-stamp・行消失）の unit、tick がデフォルト 24h 猶予で走ることの実DB検証（1h-old 行の 2-tick 生存）が揃う。orphan 化後さらに 24h の purge 猶予が重なる二重猶予 |
| AC-5 | 満たす | commit 正常系のイベント収集は旧実装と等価（stage (a) は `MediaAsset.create` の drafts を collect しない — 旧実装も destructure で落としていた。main UoW は `markAttached` の drafts のみ collect — 旧実装と同一）。overwrite 差し替え・temp delete・`purgeOrphans` 本体は無変更。`uploadMedia` / `uploadMediaPresigned` は `UploadableMediaKind` への型絞り込みと JSDoc 修正のみで、transport スキーマ（`app/components/media/schema.ts` の `z.enum(["image","video","avatar"])`）が元々 source を通さないため実行時挙動は不変。`runExportJob` のスタブ repo にも新ポートメソッドが追随 |

（AC-1 は ADR-001 + `spec/domains/media.md` の明文化でドキュメント側の基準。ユースケース実装は「参照が外れた時点で orphan 化 → 標準 purge」というポリシー記述と一致していることを確認した。）

### Use Case

#### Blockers

なし

#### Warnings

なし

- 検討のうえ棄却した候補（判断根拠の記録）:
  - **stage (a) の 3-UoW 分割による整合性窓**（job projection 読みと main UoW の OCC 読みの間に job が discard / commit され得る）: その場合 main UoW が `InvalidStateForCommit` / OCC で落ち、残骸の pending 行 + blob は sweep が回収する。まさに本 PR が用意した回収経路であり、欠陥ではなく設計どおり。
  - **commit リトライごとの pending 行 + blob の蓄積**: ADR-002 Consequences に明記された許容（sweep が定期回収、1 件あたりのサイズはアップロード上限で拘束）。E2E テストも「放棄行が再 commit に干渉しない」ことまで assert 済み。
  - **`purgeOrphans` の per-row fresh ガードが cutoff を再検査しない非対称**（sweep は `isAbandonedSourceIntake` で再検査する）: orphan / deleting 行の `updatedAt` を状態遷移なしで再スタンプする経路が存在しない（`reconcileRefs` は orphan / deleting を拒否、`markDeleting` / `decrementRef` は状態ごと変える）ため状態ガードで十分。かつ `purgeOrphans` は計画上「変更なし（配線のみ）」。
  - **候補列挙 → per-row UoW の残余窓での attach 上書き（`reconcileRefs`）、`updateProfile` / `finalizeUpload` 経由の attach / re-stamp、purge スループット上限（日次 100 行）、malformed 行での候補列挙全体 throw、テンプレートパリティテスト**: いずれも adr.md「pruner 回収の運用強化」に別 Issue 対応として記録済みの既知の見送り。本 PR は sweep JSDoc / `PendingMedia` JSDoc に残余リスクと許容根拠を正確に記述しており、見送りの前提（実態に即した文書化）を満たす。
  - **`runPruneTick` が sweep / purge で `createRequestContainer(readRequestServerConfig(env))` を各々生成する重複**: `purgeExpiredExports` の確立済みパターン（#783 ADR-005）の踏襲であり、try/catch 単位の独立性（config 読み失敗も per-step で swallow される）という意味論を持つ。統合は好みの問題で欠陥ではない。

#### Notes

- **[N-001]** AC-2 の達成手段が補償トランザクションの追加ではなく操作順序の再設計（row-before-bytes）である点は、CLAUDE.md の「アプリケーションレベルの put リトライ / 補償を持たない」方針と整合し、失敗時の後始末を sweep → purge という単一の既存経路に一本化している。main UoW の `findById → isPending` ガードが null / 非 pending を `SystemError(DataIntegrityError)` で fail-loud にし（黙って `sourceFileId` を落とさない）、両アームが integration テスト（3-UoW 目直前の行削除 / attached 遷移の注入、UoW 回数の topology pin 付き）で検証されている。
- **[N-002]** 放棄判定ルールが `MediaService.isAbandonedSourceIntake` にドメインルールとして集約され、sweep の per-row fresh ガードが状態チェックに加えて cutoff 再検査まで行う。`updatedAt` 再スタンプ（= 回収先送りシグナル、`PendingMedia` JSDoc に明文化）を fresh 読みでも尊重する実装で、`now` を候補列挙時に固定していることも「再スタンプ→スキップ」方向にしか誤差が出ない安全側の選択。
- **[N-003]** `UploadableMediaKind`（`Exclude<MediaKind, "source">`）により、ADR-004 の安全前提「pending source は commit フロー内でのみ誕生し同一リクエスト内で attach される」がアップロード系エントリポイントで型レベル強制になった。transport スキーマの `z.enum` と応用層の型が一致し、「境界検証 + 静的型」という入力検証方針の教科書的な適用。
- **[N-004]** 入力由来 VO 構築のステージ (a) 前への hoist が `spec/usecases/ingestion.md` 処理フロー 0 として文書化され、「malformed title → pending 行なし・put 呼び出しなし・temp/job 無傷」の回帰テストで ordering が固定されている。temp 欠損 skip → 行 insert → put の順序も同様に pin されており、`prepareSourcePersist` の副作用順序はすべてテストが守っている。
- **[N-005]** sweep が objectStorage に一切触れない純 DB ステップである点は良い分離: R2 binding / secrets が欠けた環境でも orphan 化（回収チェーンの前進）は止まらず、R2 依存は既存の `purgeOrphans` に閉じる。tick 内の sweep → purge の順序も「1 tick で 1 段ずつ進む」二重猶予の意味論と一致し、JSDoc がそれを明示している。
- **[N-006]** `SourcePersist` を `{ mediaId: MediaAssetId }`（branded 型）に縮小した実装時判断は、read-modify-write 化した main UoW と整合的で「真実は DB 行」に一本化されており、downstream のキャストも排除している。adr.md「実装時の追加決定」に記録済み。
- **[N-007]** ポート契約の補強が的確: `MediaAssetRepository.findAbandonedSourceIntakes` は戻り型 `readonly PendingMedia[]` と oldest-first + id tie-break を契約に含め（フェイク repo も同順序を再現）、`ObjectStorage.delete` の冪等性（missing key = 成功）は #468 の回収チェーンが構造的に依存する旨まで JSDoc 化され、blobless 行の purge 完走テストで検証されている。
