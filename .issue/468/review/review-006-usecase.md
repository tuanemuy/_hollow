# Review 006 — Use Case (PR #834 / Issue #468)

レビュー範囲: アプリケーション層（`commitIngestionPreview` の metadata-first 化、新規 `sweepAbandonedSourceIntakes`、`purgeOrphans` 配線、`uploadMedia` / `uploadMediaPresigned` の契約修正）と、それらに対する plan.md 受け入れ基準（AC-1〜AC-5）の充足。ゼロベースのフルレビュー。既知の見送り（adr.md「pruner 回収の運用強化」: purge スループット上限・malformed 行の listing 耐性・reconcileRefs / updateProfile / finalizeUpload の構造的封鎖・テンプレートパリティテスト）は対象外。

## 受け入れ基準の検証結果

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 | 充足 | ADR-001 + `spec/domains/media.md` の保持ポリシーセクション。実装（TTL なし・参照連動）と一致 |
| AC-2 | 充足 | `ingestion.integration.test.ts` の rollback → 残存 assert → sweep → purge 完走テスト。put 失敗経路（blob なし行）も別テストで回収完走を実証 |
| AC-3 | 充足 | `runPruneTick` に sweep → purgeOrphans を best-effort try/catch で配線。unit（順序・swallow・非阻害）+ 実DB 2-tick テストあり |
| AC-4 | 充足 | 猶予境界（24h−1min スキップ / 24h+1min 回収）の integration テスト、tick 実DBテストにも in-grace 行の生存 assert あり。per-row fresh ガードは cutoff 再検査まで実装（plan より強い） |
| AC-5 | 充足 | 既存テストは削除・改変なしで追加のみ。正常系（pending → attached、sourceFileId 束縛、temp delete、overwrite 差し替え）は既存テストが維持。イベント収集は旧実装と等価（create の draft は従来も破棄、attached の draft のみ collect） |

### Use Case

#### Blockers

なし

#### Warnings

- **[W-001]** 放棄判定の cutoff（`now − graceSec`）というドメインルールが 2 箇所で二重に導出されている。
  - 場所: `app/core/application/media/sweepAbandonedSourceIntakes.ts`（`const cutoff = new Date(now.getTime() - graceSec * 1000)`）と `app/core/domain/media/service.ts` `listAbandonedSourceIntakes`（同式）。
  - 理由: plan / spec は猶予窓を「ドメインルール（MediaService が所有、アダプターに漏らさない）」と位置づけているが、per-row fresh ガードの cutoff 再検査のためにユースケース側が同じ式を再実装しており、ルールの所有者が実質 2 人になっている。将来境界の意味（strict `<` / 単位 / clamp 等）を変えるとき、片側だけ直して静かに乖離するリスクがある。コメントで意図は明示され unit テスト（re-stamp スキップ）で現挙動は固定されているため実害は現時点でない。
  - 提案: ドメイン側に単一の導出点を置き両者が使う。例: `MediaService.isReclaimableSourceIntake(asset, now, graceSec): boolean`（fresh ガードの pending/kind/cutoff 判定を丸ごと収容）か、最低限 cutoff 導出関数の共有。ブロッカーではないので追随コミットで良い。

#### Notes

- **[N-001]** `commitIngestionPreview` の metadata-first 化は ADR-002 に忠実で堅牢。temp 欠損スキップ判定を行 insert より前に済ませて「無駄な残留行」を作らない順序、ハンドオフ型 `SourcePersist` の `{ mediaId: MediaAssetId }` への縮小（真実を DB 行に一本化、branded 型でキャスト排除）、main UoW の `findById → isPending` ガードを `SystemError(DataIntegrityError)` で fail-loud にした点はいずれも適切。DataIntegrityError の使い分けは既存箇所（`getNoteDetail` / `consumeIndexJob` 等）と整合。
- **[N-002]** `sweepAbandonedSourceIntakes` の per-row fresh ガードが plan の要求（pending/kind 再確認）を超えて `updatedAt` の cutoff 再検査まで行っており、候補列挙〜per-row UoW 間の re-stamp（finalizeUpload 型の回収先送り）まで正しくスキップする。unit テストが 3 つのスキップ腕（遷移・re-stamp・消失）+ per-row 失敗分離を全部駆動しており、`purgeOrphans` とのパターン整合（RequestContainer + options + per-row try/catch + `{swept, failed}`）も取れている。
- **[N-003]** `UploadableMediaKind`（`Exclude<MediaKind, "source">`）による upload 系エントリポイントからの `source` の型レベル排除は、ADR-004 の安全前提（「pending source は commit フロー内でのみ誕生する」）を実行時チェックでなく型で担保する良い手。非テストコードで `kind: "source"` の `MediaAsset.create` が `commitIngestionPreview` にしか存在しないことを確認した。`uploadMedia` / `uploadMediaPresigned` の JSDoc 修正（誤った「PurgeOrphans が回収する」の実態化）も plan ステップ 5 どおり。
- **[N-004]** テストの因果カバレッジが厚い。rollback E2E テストは残存 assert に加えて「outbox に media.* が漏れない」「temp blob が保全され同一 job を再 commit できる」「放棄行が再 commit に干渉せず、sweep/purge が放棄行だけを回収して生きた source は無傷」まで検証しており、AC-2 の回収経路が誤爆なしで機能することの実証として十分。実DB 2-tick テストのデフォルト猶予（in-grace 行の生存）assert は「tick が graceSec: 0 で誤配線される」退行まで捕まえる。
- **[N-005]** （情報）`mods.directoryId` / `title` 等の安価な VO 検証は main UoW 内（= stage (a) の行 insert + put の後）で走るため、不正入力での commit 失敗 1 回ごとに pending 行 + blob が 1 組残る（〜2日で自動回収）。これは #452 以来の構造で、本PRはむしろ「回収不能な行なし blob」を「回収可能な行あり残留」に改善している。頻発が観測されたら `parseDirectoryPathToCreate` と同様に stage (a) より前へ検証を寄せる余地がある、という程度。
- **[N-006]** （情報）`runPruneTick` は sweep / purge それぞれで `createRequestContainer(readRequestServerConfig(env))` を新規生成する。共有も可能だが、各ステップの try/catch 内で構築することでコンテナ構築失敗まで独立に隔離される（export purge の既存パターン踏襲）ため、現状の形で妥当。
