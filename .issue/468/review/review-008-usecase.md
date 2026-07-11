# Review 008 — Use Case（ゼロベース・フルレビュー）

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: アプリケーション層（ユースケースのオーケストレーション、UoW 境界、エラー契約、ポート利用、受け入れ基準の充足）。前ラウンドの結果は前提にせず、diff・実装・spec・テストを一次情報として再検証した。

## 受け入れ基準の検証結果

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 | 満たす | 保持ポリシーが `.issue/468/adr.md` ADR-001 と `spec/domains/media.md`（保持ポリシーセクション新設）に明文化。TTL なし・Note ライフサイクル連動・二重猶予・再検討トリガーまで記載 |
| AC-2 | 満たす | `commitIngestionPreview` の metadata-first 化（pending 行 → put → main UoW attach）により「行なし blob」が構造的に発生しない。`ingestion.integration.test.ts` の「commit rollback → sweep → purge」E2E と「put 失敗 → blob なし行 → 回収完走」テストが人手介在なしの自動回収を実証 |
| AC-3 | 満たす | `runPruneTick` に `sweepAbandonedSourceIntakes` → `purgeOrphans` を best-effort try/catch で配線（未配線だった `purgeOrphans` の spec 乖離も解消）。呼び出し順・失敗分離は `runPruneTick.test.ts`、実 DB 経路は `handlers.integration.test.ts` の 2-tick テストで検証 |
| AC-4 | 満たす | strict `<` cutoff + 24h デフォルト猶予。境界近傍（24h−1min）スキップの integration テスト、per-row fresh ガード（遷移・再スタンプ・消失）の unit テスト、tick がデフォルト猶予で走ることを in-grace 行の生存で検証する handlers integration テストが揃う |
| AC-5 | 満たす | commit 正常系のイベント収集は旧実装と同一（`markAttached` の drafts のみ collect、`media.created` は従来も未発火）。overwrite 差し替え・temp delete・`purgeOrphans` 本体は無変更。`uploadMedia` / `uploadMediaPresigned` は型絞り込みと JSDoc 修正のみで挙動不変 |

### Use Case

#### Blockers

なし

#### Warnings

- **[W-001]** VO 構築の一部がステージ (a) の後ろに残っており、malformed 入力 1 件ごとに回収待ちの pending 行 + blob を無駄に作る。
  - 場所: `app/core/application/ingestion/commitIngestionPreview.ts` — `DirectoryId.create(mods.directoryId)`（L160）、`NoteTitle.create`（L171）、`FrontMatterVO.create`（L180）、`NoteId.create(overwriteRaw)`（L205）はいずれも main UoW 内、つまり `prepareSourcePersist`（pending 行 insert + R2 put）の後に実行される。
  - 理由: 同関数は `directoryNameToCreate` / `tagNames` / `internalLinkRefs` を「VO エラーがストレージ操作より先に表面化するように」（L70-73 のコメント）とわざわざ UoW 前に検証している一方、`directoryId` は transport スキーマ（`commitIngestionPreviewSchema`）でも `z.string().min(1)` のみで UUID 形式は検証されない。そのため不正形式の `directoryId` 等を持つ commit は、temp 読み出し・pending 行 insert・R2 put を全部済ませてから main UoW 冒頭の VO 構築で即死し、回収チェーン（最悪 sweep 24h + purge 24h + 日次 tick 量子化）を回るゴミを毎回 1 組残す。#468 以前は同ケースが「行なし blob の恒久リーク」だったので本 PR で厳密に改善されてはいるが、自ら掲げた ordering 原則が部分適用に留まっている。
  - 提案: 入力由来の純粋な VO 構築（`DirectoryId` / `NoteTitle` / `FrontMatterVO` / overwrite の `NoteId`）を `prepareSourcePersist` 呼び出しより前の parse ブロックへ hoist する（存在・所有チェックは従来どおり UoW 内）。挙動互換のまま、自明に失敗するリクエストがストレージへ副作用を残さなくなる。

#### Notes

- **[N-001]** metadata-first の実装が丁寧。temp 欠損 skip 判定を行 insert より前に置いて「skip 時に行が残らない」ことをテストで ordering ごとピン留めし（temp-missing テスト）、main UoW 側は `findById → isPending ガード → markAttached` の fail-loud（`SystemError(DataIntegrityError)`）を「3-UoW トポロジーを `uowRuns === 3` で固定した変異注入」で両アーム（消失 / 非 pending）とも実 DB 経路で検証している。ハンドオフ型 `SourcePersist` を `{ mediaId }` に縮小して真実を DB 行に一本化した判断も良い。
- **[N-002]** 放棄判定ルールが `MediaService.isAbandonedSourceIntake` に単一ソース化され、sweep の per-row fresh ガードが同じ述語を再適用する構造。ユースケース側にドメインルール（cutoff 計算・kind 限定）が漏れておらず、fresh ガードが状態遷移だけでなく `updatedAt` 再スタンプ（回収先送り）も同一述語で拾う点まで unit テストで担保されている。
- **[N-003]** `UploadableMediaKind`（`Exclude<MediaKind, "source">`）による型レベル封鎖が、transport 境界の zod enum（`["image","video","avatar"]`）と二重に整合しており、「pending source は commit フロー内でのみ誕生する」という ADR-004 の安全前提が CLAUDE.md の二点検証ポリシーどおり両境界で成立している。
- **[N-004]** `runPruneTick` への配線は既存の「独立 best-effort try/catch + 戻り値契約不変」パターンに忠実。sweep → purge の順序・失敗分離・他ステップ非阻害が unit テストで、container → D1/R2 の実配線とデフォルト 24h 猶予（in-grace 行の生存）が handlers integration の 2-tick テストで検証されており、AC-4 を本番経路でも押さえている。
- **[N-005]** 既存乖離の後始末が正確: `uploadMediaPresigned` の「PurgeOrphans が pending を回収する」という誤 JSDoc を実態（pending は回収対象外、source のみ #468 sweep）へ修正し、`uploadMedia` の bytes-first 残余リスク（metadata 永続化失敗 → 行なし blob、#452 以来の許容）も嘘のない記述に更新。`ObjectStorage.delete` の冪等性を回収チェーンの依存として契約化し、blob なし行の purge 完走テストで裏付けている。
- **[N-006]** 既知の見送り（purge スループット上限、malformed 行の listing 耐性、attach / re-stamp 経路の構造的封鎖、テンプレートパリティテスト）は `adr.md` に記録済みであることを確認した。sweep の JSDoc が残余窓の存在と許容根拠を隠さず記述しており、見送りとコードの言明が一致している。
