# Review 007 — Use Case (PR #834 / Issue #468)

レビュー範囲: アプリケーション層のゼロベースフルレビュー。対象は `commitIngestionPreview` の metadata-first 化（stage (a) 小 UoW + main UoW の `findById → isPending` ガード）、新規 `sweepAbandonedSourceIntakes`、`runPruneTick` への sweep → `purgeOrphans` 配線、`uploadMedia` / `uploadMediaPresigned` の契約変更（`UploadableMediaKind`）、および plan.md 受け入れ基準（AC-1〜AC-5）の充足検証。既知の見送り（adr.md「pruner 回収の運用強化」: purge スループット上限・malformed 行の listing 耐性・reconcileRefs / updateProfile / finalizeUpload の構造的封鎖・テンプレートパリティテスト）は再指摘しない。

## 受け入れ基準の検証結果

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 | 充足 | ADR-001 と `spec/domains/media.md`「保持ポリシー（source）」セクション。対象・保持・回収契機 (a)(b)(c)・二重猶予・再検討トリガーまで明文化され、実装（TTL なし、参照連動、`SweepAbandonedSourceIntakes` 経由の intake 放棄回収）と一致 |
| AC-2 | 充足 | `ingestion.integration.test.ts`「reclaims the source blob after a commit rollback via sweep → purge」が put 成功・main UoW ロールバック → pending 行 + blob 残存 → sweep で orphan 化 → purge 1 回で blob + 行の両方消滅、を人手介在なしの実経路で実証。put 失敗経路（blob なし行）も別テストで delete 冪等性込みの回収完走を実証 |
| AC-3 | 充足 | `runPruneTick` が `sweepAbandonedSourceIntakes` → `purgeOrphans` を各々独立の best-effort try/catch で実行（`purgeExpiredExports` と同パターン、戻り値契約不変）。unit で順序・swallow・非阻害を、`handlers.integration.test.ts` の 2-tick テストで container → D1/R2 の実配線を検証。未配線だった `purgeOrphans` の spec 乖離も解消 |
| AC-4 | 充足 | 猶予境界（24h−1min スキップ / 24h+1min 回収）の integration テストでデフォルト値の縮退退行まで捕捉。per-row fresh ガードは pending/kind 再確認に加え cutoff 再検査（re-stamp = 回収先送りのスキップ）まで実装。tick 実DBテストにも in-grace 行の生存 assert があり、`graceSec: 0` 誤配線の退行を production 経路で検出できる |
| AC-5 | 充足 | 既存テストは削除・改変なしで追加のみ。commit 正常系（pending → attached、sourceFileId 束縛、temp delete）・overwrite 差し替え・uploadMedia 系・purge ループは既存テスト維持。イベント収集は旧実装と等価（`MediaAsset.create` の draft は従来も破棄されており、attach 系 draft のみ collect — rollback テストの「outbox に media.* が漏れない」assert で固定） |

### Use Case

#### Blockers

なし

#### Warnings

なし

- 前ラウンド（review-006 [W-001]）の cutoff 導出二重化は解消済みであることを確認した: sweep の per-row fresh ガードは `MediaService.isAbandonedSourceIntake(fresh, now, graceSec)` を呼び、放棄判定ルール（pending ∧ kind='source' ∧ strict `<` cutoff）の導出点は `app/core/domain/media/service.ts` の `abandonedSourceIntakeCutoff` / `isAbandonedSourceIntake` に一本化された。`listAbandonedSourceIntakes` も同じ導出を使い、spec（`spec/domains/media.md` の「単一ソース」記述）とも一致する。

#### Notes

- **[N-001]** `commitIngestionPreview` の metadata-first 化は ADR-002 に忠実で、失敗パスの網羅が良い。temp 欠損 skip 判定を行 insert より前に置き（stray 行ゼロ、テストで順序を固定）、ハンドオフ型 `SourcePersist` を `{ mediaId: MediaAssetId }` に縮小して真実を DB 行に一本化し、main UoW の `findById → isPending` ガードを `SystemError(DataIntegrityError)` で fail-loud にしている。両ガード腕（行消失 / 非 pending 遷移）とも実DBテストで main UoW 全体のロールバックまで検証されている。
- **[N-002]** `sweepAbandonedSourceIntakes` は `purgeOrphans` と完全に同型（`RequestContainer` + options `{graceSec, batchSize}` + `{swept, failed}` + per-row try/catch + fresh 再読ガード）で、ユースケース層のオーケストレーションパターンとして一貫している。fresh ガードの残余窓（deferred-batch UoW の read → flush 間）とその許容根拠は JSDoc に正確に記述され、構造的封鎖の別 Issue 化と整合。
- **[N-003]** `UploadableMediaKind`（`Exclude<MediaKind, "source">`）による upload 系エントリポイントからの `source` 排除は、ADR-004 の安全前提「pending source は commit フロー内でのみ誕生し同一リクエスト内で attach される」を型レベルで構造化する良い補強。トランスポート境界（`app/components/media/schema.ts` の `z.enum(["image","video","avatar"])`）は元々 source を受けないため挙動変更なしで、防御が二層になった。
- **[N-004]** 回収チェーンの接続点が両側からテストされている: sweep 側は orphan 化 → `purgeOrphans` 完走（blob あり / なし両方）、ingestion 側は rollback / put 失敗 → sweep → purge、worker 側は 2-tick 実DB。さらに rollback テストは「temp blob 保全 → 同一 job の再 commit が放棄行に干渉されず完走し、purge は放棄行だけを回収して生きた source は無傷」という誤爆非発生まで assert しており、AC-2 の実証として十分以上。
- **[N-005]** （情報・前ラウンド N-005 の継続）`mods.directoryId` / `title` の VO 検証は main UoW 内（stage (a) の行 insert + put の後）で走るため、不正入力による commit 失敗 1 回ごとに pending 行 + blob が 1 組残る（〜2 日で自動回収）。#452 以来の構造であり本PRはむしろ回収可能側に改善しているため対応不要だが、頻発が観測されたら `parseDirectoryPathToCreate` と同様に stage (a) より前へ寄せる余地がある。
