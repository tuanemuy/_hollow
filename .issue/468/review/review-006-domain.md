# Review 006 — Domain

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: Domain（エンティティ・値オブジェクト・ドメインサービス・ポート契約・状態機械・型安全性・ドメインロジックの配置・spec/domains 整合）— ゼロベースのフルレビュー

検証した受け入れ基準（Domain 関連）:

- **AC-1（保持ポリシーの明文化）**: `spec/domains/media.md` に「保持ポリシー（source, Issue #468 ADR-001）」セクションが追加され、ADR-001 の決定内容（時間ベース TTL なし・Note ライフサイクル連動・trash 中も保持・orphan 化の3契機・二重猶予 24h+24h・再検討トリガーと `aggregateByOwner` による判断材料）と過不足なく一致。充足。
- **AC-2/AC-4 のドメイン側前提**: 回収の起点は既存ドキュメント済みの `decrementRef(pending) → orphan` 遷移（`app/core/domain/media/entity.ts:139-156`、`media.orphaned` 発火込み）の再利用で、新しい状態・イベント・削除経路は増えていない。ポート `findAbandonedSourceIntakes` は pending/source 限定・strict `<`・oldest-first + id タイブレークが JSDoc で契約化され、猶予計算（cutoff = now − graceSec）は `MediaService.listAbandonedSourceIntakes` にドメインルールとして置かれ、境界（`updatedAt == cutoff` の除外）が `service.test.ts` の unit test で検証されている。D1 実装は同一の WHERE/ORDER。充足。
- **AC-5 のドメイン側**: エンティティ・値オブジェクト・`MediaService` 既存メソッドはシグネチャ不変（`purge` / `PendingMedia` は JSDoc 精密化のみ）。新規 `*ErrorCode` なし（`errorCodeNaming` 影響なし）。stage (b) ガードの `SystemError(DataIntegrityError)` は「整合性異常 ≠ ビジネスルール違反」という cross-layer catch policy に合致。充足。

既知の見送り（adr.md「pruner 回収の運用強化」: purge スループット上限・malformed 行の listing 耐性・attach/re-stamp 経路の構造的封鎖 = reconcileRefs / updateProfile / finalizeUpload・テンプレートパリティテスト）は再指摘しない。

### Domain

#### Blockers

なし

#### Warnings

- **[W-001]** 「放棄された source intake」の判定ルール（`pending` ∧ `kind='source'` ∧ `updatedAt < now − graceSec`、strict `<`）が、ドメイン層とアプリケーション層の2箇所に分散して実装されている。
  - 場所: `app/core/domain/media/service.ts:93-101`（`listAbandonedSourceIntakes` の cutoff 計算）/ `app/core/application/media/sweepAbandonedSourceIntakes.ts`（per-row fresh ガードが cutoff を独自に再計算し、`isPending && kind === 'source' && updatedAt < cutoff` の三条件をインラインで再実装）
  - 理由: `MediaService.listAbandonedSourceIntakes` の JSDoc は「the grace window is a domain rule owned here」と所有を宣言しているが、strict `<` の境界セマンティクスと三条件の組は sweep ユースケース側にも埋め込まれており、猶予セマンティクスを変更する際に2箇所の同期が必要になる（現状はコメントで相互リンクされ整合しているため実害はない）。CLAUDE.md の「ドメインルールはドメイン層に」の観点では、fresh ガードの判定本体もドメイン側に置くのが素直。
  - 提案: `MediaService` に述語（例: `isAbandonedSourceIntake(asset: MediaAsset, cutoff: Date): asset is PendingMedia` — kind / status / cutoff の三条件と strict `<` を単一ソース化）を追加し、sweep の fresh ガードから呼ぶ。挙動不変のリファクタであり、見送って現状のコメント相互参照で運用する判断も許容範囲。

#### Notes

- **[N-001]** 計画どおり「ドメインモデル変更なし」を守り、エンティティの状態機械（doc 済みの intake 放棄遷移 `decrementRef(pending) → orphan`）をそのまま回収の起点に使い、blob の実削除を既存 purge 機構に一本化した設計は良い。orphan 化の `updatedAt` 再スタンプによる二重猶予（sweep 24h → purge 24h）も、既存の age-anchor 規約（`OrphanMedia` の JSDoc）にそのまま載っており、時刻ベースの例外規則が増えていない。
- **[N-002]** `findAbandonedSourceIntakes` の戻り型 `readonly PendingMedia[]` による型レベルの契約表明と、D1 実装が cast ではなく `filter(MediaAsset.isPending)` の type-guard で静的に narrowing している点は「illegal states unrepresentable」に忠実。タイブレーク（`updatedAt` 同値時の `id` 昇順）を「同一秒に量産される放棄行に対する limit 跨ぎの決定性」という理由込みでポート契約に明記し、InMemory フェイク（`service.test.ts` / sweep unit test）が同一順序を実装しているのも契約の一貫性が取れている。
- **[N-003]** `ObjectStorage.delete` の冪等性（missing key = 成功、`StorageNotFoundError` を投げない）を「#468 回収チェーンが構造的に依存するポート契約」として JSDoc に固定し、`MediaService.purge` の JSDoc から誤読誘発文言を除去、spec 側もエラーケースを「`StorageNotFoundError`（get / stat のみ）」へ精密化。ポート・spec・integration テスト（blob なし行の purge 完走）の三点が揃った的確な契約化。
- **[N-004]** `UploadableMediaKind = Exclude<MediaKind, "source">` によるアップロード入口の型レベル封鎖が、transport boundary の zod スキーマ（`app/components/media/schema.ts` の `z.enum(["image", "video", "avatar"])`）でも同じ集合に検証されており、静的型が実行時にも裏付けられている。ADR-004 の安全前提「pending/source は commit フロー内でのみ誕生する」がコンパイル時と境界検証の両方で守られる良い補強。
- **[N-005]** 前ラウンド Domain [W-001]（per-row fresh ガードの cutoff 再検査欠落）は解消済み: sweep の fresh ガードが `updatedAt >= cutoff` をスキップし、unit test（「re-stamped back inside the grace window」ケース）で検証されている。これにより `PendingMedia` JSDoc の「re-stamping … defers its reclaim」の主張が、設計上閉じられない deferred-batch UoW の残余窓（sweep JSDoc に許容根拠込みで記録済み・別Issue化済み）を除いて実装で担保された。
- **[N-006]** `MediaService.listAbandonedSourceIntakes` の `graceSec` に下限（>= 0）の表明がない。負値なら cutoff が未来になり進行中 intake が候補に載りうる（blob 損失には直結しない — commit 進行中の行は stage (b) の fail-loud ガードで止まる）。呼び出し元がコード内定数のみ（env 配線なし）で既存 `listPurgeCandidates` と対称のため許容。
