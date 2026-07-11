# Review 009 — PR #834 (Issue #468)

### Domain

#### Blockers

なし

ゼロベースで再検証した受け入れ基準（Domain 関連）:

- **AC-1（保持ポリシーの明文化）**: `spec/domains/media.md` の「保持ポリシー（source, Issue #468 ADR-001）」セクションに、TTL なし・Note ライフサイクル連動（trash 中も保持）・orphan 化の 3 契機（overwrite / note purge / 放棄 intake）・二重猶予（intake→orphan 24h + orphan→purge 24h）・再検討トリガー（opt-in TTL + `aggregateByOwner`）まで明文化されており、実装のデフォルト値（`DEFAULT_GRACE_SEC = 24h`、strict `<`）と一致する。ADR-001 とも整合。
- **AC-2 / AC-4 のドメイン部分（放棄判定ルール）**: 放棄判定は `MediaService.isAbandonedSourceIntake`（`app/core/domain/media/service.ts`）に単一ソース化され、cutoff 計算は `abandonedSourceIntakeCutoff` を述語（per-row fresh ガード用）と一括クエリ（`listAbandonedSourceIntakes`）の両方が共有する。`pending` ∧ `kind='source'` ∧ strict `<` の 3 条件は、ドメイン unit（`service.test.ts`: 境界値 `updatedAt == cutoff` の除外・非 source 除外・attached 除外を直接ピン留め）、D1 integration（status/kind/cutoff フィルタ + oldest-first + `id` tie-break）、sweep unit（re-stamp / 遷移 / 削除の 3 レース全てのスキップ）で三層検証されている。ドメインは `now` を引数で受け取り決定的・純粋なまま（ambient time なし）。
- **AC-2 の状態機械部分**: 新しい状態・遷移・イベントを一切増やさず、エンティティに文書化済みの `decrementRef(pending) → orphan`（intake 放棄）を再利用して既存 purge 機構に回収を一本化している。`PendingMedia` の JSDoc に「`kind='source'` では `updatedAt` が放棄判定アンカーであり、re-stamp は回収を先送りする」という不変条件の意味論が追記され、実装（sweep の fresh ガードの cutoff 再チェック）と一致する。
- **AC-5（既存フロー非退行）**: commit main UoW は `findById → MediaAsset.isPending ガード → markAttached` に置換され、null / 非 pending は `SystemError(DataIntegrityError)` で fail-loud（黙って `sourceFileId` を落とさない）。`markAttached` / `media.attached` の遷移・イベント収集は既存エンティティ操作のまま。stage (a) 小 UoW が `media.created` を collect しない判断は `uploadMedia` / `uploadMediaPresigned` の既存方針（transient intake は consumer を起こさない）と整合していることをコード上で確認した。

既知の見送り（`.issue/468/adr.md`「pruner 回収の運用強化」: purge スループット上限・malformed 行の listing 耐性・attach/re-stamp 経路の構造的封鎖・テンプレートパリティテスト）と既存ドリフト（`spec/domains/media.md` の `decrementRef` シグネチャ乖離）は本レビューの対象外として再指摘しない。

#### Warnings

なし

（前ラウンドで指摘のあった `isAbandonedSourceIntake` の値条件付き型述語は、現行コードでは戻り型 `boolean` + 「型述語にしない理由」の JSDoc（false 分岐の不健全ナローイング回避、`PendingMedia` が必要なら `isPending` と組み合わせる）として解消済みであることをゼロベースで確認した。`spec/domains/media.md` 側にも同じ判断が記載されており、コード・spec の両方で一貫している。）

#### Notes

- **[N-001]** ドメイン設計の質が高い。「blob は誕生時点から必ず DB 行を持つ」という不変条件の回復を、既存状態機械の再利用（`decrementRef(pending) → orphan` → 標準 purge）だけで達成し、新しい削除経路・状態・イベントを増やしていない。猶予ルール（cutoff）は `abandonedSourceIntakeCutoff` で単一ソース化され、述語と一括クエリが同一ルールを表現することが JSDoc・spec 双方で宣言されている。ポート `findAbandonedSourceIntakes` の戻り型 `readonly PendingMedia[]` は「契約上 pending しか返らない」ことの型レベル表明（illegal states unrepresentable）で、oldest-first + `id` 昇順 tie-break が「同一秒に量産される失敗 bulk commit で limit 跨ぎが決定的になるため」という理由込みでポート契約化され、D1 integration test（limit 境界の tie-break）と in-memory フェイク 2 箇所（service.test.ts / sweep unit の MutableFakeRepo）が同一順序を実装している。
- **[N-002]** `UploadableMediaKind = Exclude<MediaKind, "source">`（`app/core/application/media/uploadMedia.ts`）により、ADR-004 の安全前提「pending source は ingestion commit フロー内でのみ誕生し同一リクエスト内で attach される」が upload 系エントリポイントで型レベル封鎖された。transport 境界の `z.enum(["image", "video", "avatar"])`（`app/components/media/schema.ts`）が runtime 側でも `source` を拒否していることを確認済みで、「境界で検証し内側は静的型を信頼する」という CLAUDE.md の原則どおり二層で閉じている。
- **[N-003]** `ObjectStorage.delete` の冪等性（missing key = 成功、`delete` は `StorageNotFoundError` を投げない）が、ポート JSDoc（#468 回収チェーンが構造的に依存する hard contract である理由込み）・`spec/domains/media.md`・実 R2 binding に対する integration test（`r2ObjectStorage.integration.test.ts`: 存在しないキー / 二重 delete の成功）の三点で固定された。「blob なし pending 行」が定常的に purge へ流入する本設計の暗黙前提が明示契約に昇格しており、`MediaService.purge` の JSDoc も「delete が NotFound を投げうる」という誤読を防ぐ表現に整理されている。
- **[N-004]** commit の VO 構築順序の整理が良い。`DirectoryId` / `NoteTitle` / `FrontMatter` / `NoteId`（overwrite）の入力由来 VO をすべて stage (a) より前に構築することで、「不正リクエストは pending 行も blob も残さない」（VO エラー = 4xx で回収経路に乗るゴミを作らない）ことが構造的に保証され、テスト（malformed title → 行なし・blob なし）で実証されている。`SourcePersist` を `{ mediaId: MediaAssetId }`（branded 型）に縮小し「真実は DB 行」に一本化した判断も、メタデータ二重運搬の曖昧さを排除する正しい方向。
- **[N-005]** 既存ドリフト（本 PR 起因ではない、参考情報）: `spec/domains/media.md` の ObjectStorage ポートのメソッド一覧に `stat` が載っていない（実装ポートには `FinalizeUpload` 用の `stat` が存在し、本 PR が更新したエラーケース行「`StorageNotFoundError`（get / stat のみ）」は実装と正確に一致している）。エラーケース行だけが `stat` に言及する形になっているため、次回 spec-sync でメソッド一覧への `stat` 追記を推奨。
