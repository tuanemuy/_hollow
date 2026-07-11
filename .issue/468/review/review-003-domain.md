# Review 003 — PR #834 (Issue #468: source blob のストレージ衛生)

### Domain

レビュー範囲（ゼロベースのフルレビュー、前ラウンド非依存）: `app/core/domain/media/` 一帯（`entity.ts` / `service.ts` / `ports/mediaAssetRepository.ts` / `ports/objectStorage.ts` / `__tests__/service.test.ts`）、ドメイン契約に接するアプリケーション層（`commitIngestionPreview.ts` の metadata-first 化・`sweepAbandonedSourceIntakes.ts` のエンティティ操作・`uploadMedia*` の JSDoc 修正）、D1 実装のポート準拠、`spec/domains/media.md`。

#### 受け入れ基準（Domain 関連分）の検証

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1（保持ポリシーの明文化） | 充足 | `spec/domains/media.md` 冒頭に「保持ポリシー（source, Issue #468 ADR-001）」セクションが追加され、TTL なし・Note ライフサイクル連動・orphan 化の3契機（overwrite / note purge / 放棄 intake）・二重猶予（24h+24h）・再検討トリガーが ADR-001 と一致。`listAbandonedSourceIntakes` / `findAbandonedSourceIntakes` / `delete` 冪等性契約も spec のドメインサービス・ポート節に反映済み |
| AC-2（ロールバック後の自動回収 — ドメイン側の担保） | 充足 | 回収は既存遷移 `decrementRef(pending) → orphan`（`entity.ts:139-156`、#452 時点から「Abandoning a pending intake」として文書化済み）の再利用で、新しい状態・遷移・イベント・エラーコードはゼロ。`ingestion.integration.test.ts:774`（ロールバック → pending 残存 → sweep → purge）と `:915`（put 失敗 → blob なし pending 行 → 回収完走）で遷移チェーンが実証されている |
| AC-4（grace window の安全性） | 充足 | cutoff 計算（`now - graceSec`、strict `<`）が `MediaService.listAbandonedSourceIntakes`（`service.ts:93-101`）としてドメインサービスに置かれ、アダプターは status/kind フィルタのみ。境界（`updatedAt == cutoff` は除外）が `service.test.ts` のドメイン unit で明示検証されている |

#### 状態機械・純粋性の確認

- 状態機械は閉じたまま: `assembleByStatus` の status×refCount 不変条件、`reconstruct` の `RehydrationError` 契約、イベント語彙（`media.orphaned` 再利用）に変更なし。
- ドメイン純粋性維持: `listAbandonedSourceIntakes` は `now` を明示引数で受け、ambient time なし。sweep 側の時刻は `container.clock.now()` から `decrementRef` へ明示渡し。id 生成もドメイン外。
- `ObjectStorage.delete` の冪等性 JSDoc（`objectStorage.ts:74-86`「missing key は成功、`StorageNotFoundError` は投げない」）は R2 アダプター実装と整合しており「願望の契約」になっていない。spec 側も「`StorageNotFoundError`（get / stat のみ）」に限定済み。
- 前ラウンド指摘の解消を確認: Round 1 W-001（`SourcePersist.mediaId` の raw string + cast）→ `Readonly<{ mediaId: MediaAssetId }>` に縮小され branded 値を運搬、cast 消滅。Round 1 W-002（`PendingMedia` の updatedAt アンカー未記載）→ `entity.ts:40-43` に追記済み。Round 2 W-001（フェイクの oldest-first 未実装）→ `service.test.ts` / `sweepAbandonedSourceIntakes.test.ts` 両フェイクに `updatedAt ASC, id ASC` ソートが入り D1 と一致。Round 2 W-002（戻り型 `MediaAsset[]`）→ ポート・サービス・D1・フェイクすべて `readonly PendingMedia[]` に絞られ、D1 は `filter(MediaAsset.isPending)` の静的 narrowing で準拠。

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** ドメインモデルの規律が一貫して高い。新しい状態・遷移・イベント・エラーコードを一切増やさず、既存の `decrementRef(pending) → orphan` に「放棄 intake の回収」を載せた設計は、ADR-001 の「回収は参照グラフという単一の真実に基づく」をドメインモデルの形で体現している。`PendingMedia` の doc（`entity.ts:40-43` — updatedAt が abandoned-intake age anchor、再スタンプは回収を遅延させる）は `OrphanMedia` の既存 doc と正確に対をなす。
- **[N-002]** 型レベルの契約が2ラウンドを経て完成度が上がった。`findAbandonedSourceIntakes(): readonly PendingMedia[]` により sweep 候補が pending であることが静的に確定し、`SourcePersist` の branded `MediaAssetId` 運搬と合わせて「Validate at the boundaries; trust the static type in between」が回復している。既存 `findPurgeableOlderThan` が wide な `MediaAsset[]` を返すままである非対称は残るが、これは既存メソッドの整理課題であり本PRの瑕疵ではない。
- **[N-003]** 「放棄 source intake」という述語（`pending ∧ kind='source'`）が port の SQL・2つのテストフェイク・sweep の fresh ガード（`sweepAbandonedSourceIntakes.ts:82-84`）に分散して再定義されている。各所とも2条件の単純な組で同期コストは小さく、fresh ガードは TOCTOU 防御というオーケストレーション責務なので現状の配置は妥当だが、将来この判定条件が変わる場合（例: 他 kind への拡張）はドメイン側に単一の type guard（`isPendingSource` 等）を切り出して一元化するとよい。
- **[N-004]** `PendingMedia` 型は `kind='source'` までは符号化していない（kind は `MediaAssetBase` の非判別フィールド）。sweep は per-row の fresh 再読で実行時に kind を再確認するため narrowing が load-bearing にならず、kind ごとの部分型を導入するのは現時点では過剰設計。判断として妥当。
- **[N-005]** main UoW の整合性ガード（`commitIngestionPreview.ts` — 欠損 / 非 pending を `SystemError(DataIntegrityError)` で fail-loud）はエラー分類が正しい。同一リクエスト内で自分が挿入した行の欠損はユーザー起因の不変条件違反（`BusinessRuleError`）ではなく整合性異常であり、黙って `sourceFileId` を落とさない方針も計画どおり。
- **[N-006]** `uploadMedia` / `uploadMediaPresigned` の JSDoc 修正が誠実。従来の「PurgeOrphans が回収する」という誤った主張を、実態（bytes-first 経路の行なし blob は回収不能な既存許容 / presigned の stale pending は現状回収対象外で、sweep は ADR-004 により source 限定）に正確化しており、ドメイン契約とアプリケーション文書の齟齬が消えた。
- **[N-007]** sweep の JSDoc が deferred-batch UoW の残余ウィンドウ（fresh 再読 → flush 間に `reconcileRefs` 経由 attach が重なると orphan で上書きされうる）とその許容根拠・別 Issue 送りを隠さず文書化している。既知の見送り（adr.md 記録済み）として本レビューでは再指摘しない。
