# Review 007 — Domain（PR #834 / Issue #468）

ゼロベースのフルレビュー。対象: `app/core/domain/media/`（entity / service / ports）と、それを消費するアプリケーション層のドメイン規則運用（sweep の fresh ガード、commit の isPending ガード）、および spec/domains/media.md の明文化（AC-1）。既知の見送り（adr.md「pruner 回収の運用強化」: purge スループット上限・malformed 行の listing 耐性・reconcileRefs / updateProfile / finalizeUpload の attach/re-stamp 経路封鎖・テンプレートパリティテスト）は対象外。

### Domain

#### Blockers

なし

検証した主要観点（いずれも問題なし）:

- **状態機械の再利用**: 新しい状態・遷移・イベントを追加せず、既存の `decrementRef(pending) → orphan`（entity にドキュメント済みの「Abandoning a pending intake」遷移、`media.orphaned` 発火）をそのまま使っている。エンティティ変更は `PendingMedia` の JSDoc（`updatedAt` = 放棄判定アンカー、再スタンプ = 回収先送り）のみで、実装挙動の変更なし（AC-5 のドメイン側退行なし）。
- **ドメイン純度**: `isAbandonedSourceIntake` / `listAbandonedSourceIntakes` は `now` を明示引数で受け、ambient time / I/O なし。猶予期間（cutoff 計算）は `listPurgeCandidates` と対称にドメインサービス側にあり、アダプターは status/kind フィルタのみ（計画どおり）。
- **型ガードの健全性**: `isAbandonedSourceIntake(asset): asset is PendingMedia` は `MediaAsset.isPending`（status 判別）に基づくが、`assembleByStatus` が rehydration 時に pending ⇒ refCount === 0 を実行時強制するため、判別 union の narrowing は健全。D1 実装の `.filter(MediaAsset.isPending)` も SQL の `status='pending'` + reconstruct の不変条件により行を落とすことがない純粋な静的 narrowing であることを確認。
- **ADR-004 の安全前提の創出側封鎖**: 「pending source は commit フロー内でのみ誕生する」は、`UploadableMediaKind = Exclude<MediaKind, "source">`（application 型）に加えて transport 境界の `z.enum(["image", "video", "avatar"])`（`app/components/media/schema.ts`）で実際にランタイム封鎖されている（型だけの主張ではない）。`MediaAsset.create(kind='source')` の呼び出し箇所が `commitIngestionPreview` のみであることを grep で確認。
- **fresh ガードのルール一元化**: sweep の per-row UoW が候補列挙と同じ `MediaService.isAbandonedSourceIntake` を再適用するため、放棄判定（strict `<` cutoff・kind・status）がドメインに単一ソース化されている。仮にアダプターの候補クエリが壊れて猶予内の行を返しても per-row ガードで誤 orphan 化しない（defence in depth）。`now` は sweep 開始時に固定され、バッチが長引いても cutoff が保守的（古い）方向にしかズレない。
- **ポート契約**: `findAbandonedSourceIntakes` の戻り型 `readonly PendingMedia[]` は「illegal states unrepresentable」に沿い、既存 `findPurgeableOlderThan` の緩い `MediaAsset[]` より強い契約。`ObjectStorage.delete` の冪等性（missing key = 成功、`StorageNotFoundError` を投げない）が JSDoc で #468 依存込みの契約として固定され、実 R2 アダプターに対する integration テストでピン留めされている。
- **AC-1 / AC-4 のドメイン側**: 保持ポリシー（TTL なし・Note ライフサイクル連動・二重猶予 24h+24h・再検討トリガー）が `spec/domains/media.md` に明文化され、`MediaService` 2 メソッドとポートメソッドの spec 追記も実装と一致。猶予の strict `<` 境界は service unit（cutoff 算術）・D1 integration（`updatedAt == cutoff` 除外）・sweep integration（24h−1min スキップ / 24h+1min 回収）で三層検証されている。

#### Warnings

なし

#### Notes

- **[N-001]** ポート戻り型 `readonly PendingMedia[]` と、それを支える rehydration 不変条件（`assembleByStatus` の pending ⇒ refCount === 0）の組み合わせが良い。契約が型・実行時・テスト（D1 integration の status/kind/cutoff/tie-break）の三点で固定されている。
- **[N-002]** `isAbandonedSourceIntake` を「放棄判定ルールの単一ソース」として bulk クエリ（listing）と per-row fresh ガードの両方から参照させる構成は、finalizeUpload 型の `updatedAt` 再スタンプ（回収先送り）を fresh 再読で正しくスキップする unit テストまで含めて一貫している。
- **[N-003]** sweep の安全前提（ADR-004）が application の型排除だけでなく transport 境界の zod enum で実封鎖されていることを確認した。CLAUDE.md の「validate at the boundaries / trust the static type in between」に正確に沿っており、`UploadableMediaKind` の JSDoc が sweep との依存関係（なぜ source を除外するか）を明示しているのも将来の変更に対する良いガードになっている。
- **[N-004]** 微小な理論上の非対称: `UUID_V7_PATTERN` は `/i` 付きで大文字 id も rehydration を通るため、ポート契約化された id 昇順 tie-break は大小文字混在 id に対して D1（BINARY collation）と in-memory フェイク（`localeCompare`）で順序が食い違いうる。実 id は `uuidv7()` の小文字固定なので実害はないが、IdGenerator を差し替える際の注意点として記録しておく。
- **[N-005]** `spec/domains/media.md` のポート定義行には順序（updatedAt 昇順・id tie-break）契約が書かれていない。既存 `findPurgeableOlderThan` の spec 行も同様の粒度なので既存慣行の範囲内だが、ポート JSDoc 側で「tie-break は契約の一部」と宣言した以上、spec 側にも一言あるとより整合的。
