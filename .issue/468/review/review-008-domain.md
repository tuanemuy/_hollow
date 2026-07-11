# Review 008 — PR #834 (Issue #468)

### Domain

#### Blockers

なし

検証済みの受け入れ基準（Domain 関連）:

- **AC-1**: 保持ポリシーは ADR-001 と `spec/domains/media.md`（「保持ポリシー（source, Issue #468 ADR-001）」セクション）に明文化されている。TTL なし・Note ライフサイクル連動・3 契機（overwrite / note purge / 放棄 intake）・二重猶予（24h + 24h）・再検討トリガーまで揃っており、実装（`MediaService.isAbandonedSourceIntake` の strict `<` / 24h デフォルト）と一致する。
- **AC-2 / AC-4 のドメイン部分**: 放棄判定ルールは `MediaService.isAbandonedSourceIntake`（`app/core/domain/media/service.ts`）に単一ソース化され、`listAbandonedSourceIntakes` が同一ルールの一括クエリ版として対称に定義されている。cutoff 計算（`now - graceSec`、strict `<`）はドメイン側にあり、アダプターは status/kind/updatedAt フィルタのみ。境界値（`updatedAt == cutoff` は非対象）は `service.test.ts` で直接ピン留めされている。状態遷移は新規追加なしで既存の `decrementRef(pending) → orphan`（エンティティに文書化済み）を再利用しており、新しい状態・イベント・削除経路を増やしていない。
- **AC-5**: commit の main UoW は `findById → MediaAsset.isPending ガード → markAttached` に置換され、null / 非 pending は `SystemError(DataIntegrityError)` で fail-loud（黙って `sourceFileId` を落とさない）。`pending → attached` の遷移と `media.attached` イベント収集は既存エンティティ操作のまま。

#### Warnings

- **[W-001]** `MediaService.isAbandonedSourceIntake` の型述語 `asset is PendingMedia` は false 分岐で不健全なナローイングを生む（場所: `app/core/domain/media/service.ts` の `isAbandonedSourceIntake` / 理由: 述語の真偽が型レベルの判別子（`status`）だけでなく実行時の値条件（`kind === 'source'`、`updatedAt` の経過時間）に依存するため、TypeScript は false 分岐で `PendingMedia` を union から除外するが、実際には「猶予内の pending source」や「pending image」が false を返す — false 分岐の `asset` は誤って `AttachedMedia | OrphanMedia | DeletingMedia` に絞られる。現在の唯一の呼び出し箇所（`sweepAbandonedSourceIntakes` の per-row ガード）は false で即 return するため実害はないが、リポジトリ内の既存型ガード（`MediaAsset.isPending`、`Note.isActive`、`IngestionJob.isPending` 等）はすべて純粋な判別子であり、値条件付き型述語はこの codebase で本メソッドが初。将来の呼び出し元が else 分岐で網羅 switch や `status === 'pending'` 比較を書くと、コンパイルが誤誘導する / 提案: 戻り型を `boolean` にし、呼び出し側で `MediaAsset.isPending(fresh) && MediaService.isAbandonedSourceIntake(fresh, ...)` と組み合わせてナローイングする — または少なくとも JSDoc に「false 分岐のナローイングは信用しないこと（値条件を含む述語）」と明記する。CLAUDE.md の「lean on TypeScript's type system fully」の観点で、型が語る内容と実際の保証を一致させたい）

#### Notes

- **[N-001]** ドメイン設計の質が高い。放棄回収を新しい状態・イベント・削除経路なしで既存状態機械（`decrementRef(pending) → orphan` → 標準 purge）に一本化し、猶予ルールを `abandonedSourceIntakeCutoff` 経由で述語と一括クエリの両方から共有している。ポート `findAbandonedSourceIntakes` の戻り型を `readonly PendingMedia[]` に絞って「契約上 pending しか返らない」ことを型で表明し、oldest-first + `id` 昇順 tie-break を JSDoc でポート契約として明文化（D1 integration test が limit 跨ぎの tie-break を検証、in-memory フェイクも同一順序を実装）している点は模範的。ドメインは `now` を引数で受け取り決定的・純粋なまま。
- **[N-002]** `UploadableMediaKind = Exclude<MediaKind, "source">`（`app/core/application/media/uploadMedia.ts`）による upload 系エントリポイントからの `source` の型レベル封鎖は、ADR-004 の安全前提「pending source は commit フロー内でのみ誕生し同一リクエスト内で attach される」を静的に支える良い補強。transport 境界の `z.enum(["image", "video", "avatar"])`（`app/components/media/schema.ts`）とも整合しており、境界検証 → 静的型の信頼という CLAUDE.md の原則どおり。
- **[N-003]** `ObjectStorage.delete` の冪等性（missing key = 成功、`StorageNotFoundError` は投げない）が、JSDoc（回収チェーンの構造的依存の理由込み）・`spec/domains/media.md`・実 R2 binding に対する integration test（`r2ObjectStorage.integration.test.ts`）の三点で契約として固定された。「blob なし pending 行」が定常的に purge に流入する #468 の設計で暗黙の前提が明示契約に昇格しており、`MediaService.purge` の JSDoc も NotFound 誤読を防ぐ表現に整理されている。spec の `StorageNotFoundError`（get / stat のみ）という限定もポート実装と正確に一致する。
- **[N-004]** 既存ドリフト（本 PR 起因ではない）: `spec/domains/media.md` エンティティ振る舞いの `decrementRef(now: Instant, orphanThresholdSec: number)` は実装シグネチャ（`decrementRef(asset, now)` — threshold 引数なし。orphan 猶予は purge 側の候補クエリで表現）と乖離している。本 PR が触った行ではないが、#468 で sweep が `decrementRef` に依存するようになったため、次回 spec-sync での修正を推奨。
