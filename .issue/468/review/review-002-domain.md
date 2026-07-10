# Review 002 — PR #834 (Issue #468: source blob のストレージ衛生)

### Domain

レビュー範囲: `app/core/domain/media/` 一帯（entity / service / ports / domain unit tests）、ドメイン契約に依存するアプリケーション層の該当箇所、`spec/domains/media.md`。ゼロベースのフルレビュー（前ラウンド非依存）。

検証した受け入れ基準（Domain 関連）:

- **AC-1**（保持ポリシーの明文化）: `spec/domains/media.md` に「保持ポリシー（source, Issue #468 ADR-001）」セクションが追加され、TTL なし・Note ライフサイクル連動・3契機の orphan 化・二重猶予（24h+24h）・再検討トリガーが ADR-001 と一致する内容で記載されている。**充足**。
- **AC-4**（grace window の安全性）: cutoff 計算（`now - graceSec`）が `MediaService.listAbandonedSourceIntakes` としてドメインサービスに置かれ、strict `<` 境界がドメイン unit（`service.test.ts`）・アダプター integration・アプリケーション integration の3層で検証されている。**充足**。
- **計画ステップ1**（ポート契約）: `findAbandonedSourceIntakes` の追加 JSDoc（kind 限定の理由 = ADR-004 込み）、`ObjectStorage.delete` の冪等性契約補強（「missing key は成功、`StorageNotFoundError` は投げない」+ #468 回収チェーンの構造的依存の明記）とも計画どおり。`MediaService.purge` の JSDoc も「delete が NotFound を投げうる」という誤読を誘わない表現に整えられている。**充足**。

状態機械への影響: 新しい状態・遷移・イベントはゼロ。sweep は既存の `decrementRef(pending) → orphan`（`entity.ts:139-156`、「Intake abandoned without ever attaching」としてドキュメント済み）をそのまま使い、`media.orphaned` の発火・`updatedAt` 再スタンプ（orphan 猶予の起点）も既存セマンティクスに乗っている。`assembleByStatus` の status×refCount 不変条件、`reconstruct` の RehydrationError 契約にも変更なし。

#### Blockers

なし

#### Warnings

- **[W-001]** ポート契約の「oldest-first 順序」をインメモリフェイクが実装しておらず、契約が D1 実装でしか担保されない
  - 場所: `app/core/domain/media/__tests__/service.test.ts:84`（`InMemoryRepo.findAbandonedSourceIntakes`）、`app/core/application/media/__tests__/sweepAbandonedSourceIntakes.test.ts:58`（`MutableFakeRepo`）
  - 理由: `mediaAssetRepository.ts:57-64` の JSDoc は「ordered oldest-first」を契約として宣言しており、この順序は「oldest-first + 再試行で回収は最終的に進む」という backlog drain の成立根拠（adr.md の見送り判断の前提）でもある。しかし両フェイクは `filter(...).slice(0, limit)` で Map の挿入順のまま返す。現状のテスト（全件同時刻 or 挿入順 = 時刻順）では露見しないが、`limit` 越えの候補集合を扱う将来のテストで順序依存の挙動が静かに素通りする。なお既存 `findPurgeableOlderThan` のフェイク（`service.test.ts:71-82`）も同じ形なので、本PRが新規に持ち込んだ癖ではなく既存パターンの踏襲ではある — ただし既存メソッドはポート JSDoc で順序を約束していないのに対し、新メソッドは約束している点が非対称。
  - 提案: フェイクに `sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id.localeCompare(b.id))` を1行足して契約に揃える。あるいは順序を契約から外すなら port JSDoc の「ordered oldest-first」を削る（ただし drain 前提が崩れるので前者を推奨）。
- **[W-002]** `findAbandonedSourceIntakes` / `listAbandonedSourceIntakes` の戻り型が `readonly MediaAsset[]` のままで、契約上 `pending` しか返らないことが型に表れていない
  - 場所: `app/core/domain/media/ports/mediaAssetRepository.ts:65-68`、`app/core/domain/media/service.ts:93-101`
  - 理由: CLAUDE.md「Make illegal states unrepresentable at the type level」。本 Issue の設計自体が「kind 限定をメソッド名で型レベルに表明する」（ADR-004）と謳っているのに対し、status の限定は JSDoc 止まり。`readonly PendingMedia[]` を返せば、呼び出し側（sweep）で候補が pending であることが静的に確定する。実害は小さい — sweep は per-row の fresh 再読で結局 `isPending` ガードを通すため候補の静的型は load-bearing でない — かつ既存 `findPurgeableOlderThan` が `MediaAsset[]`（orphan|deleting の union を非表現）である対称性の事情も理解できるため Blocker にはしない。
  - 提案: 戻り型を `readonly PendingMedia[]` にし、D1 実装は `rows.map(toMediaAsset).filter(MediaAsset.isPending)`（契約違反行は 0 件のはずなので実質 narrowing のみ）とする。既存メソッドとの対称性を優先して見送るなら、その判断を port JSDoc に一言残すとよい。

#### Notes

- **[N-001]** ドメインモデルの規律が高い。新しい状態・遷移・イベント・エラーコードを一切増やさず、既存の `decrementRef(pending) → orphan` に「放棄 intake の回収」という新ユースケースを載せた。`PendingMedia` の doc 追記（`entity.ts:40-43`「updatedAt が abandoned-intake age anchor として働き、再スタンプは回収を遅らせる」）は `OrphanMedia` の既存 doc（orphan age anchor）と正確に対をなしており、暗黙だった `updatedAt` のセマンティクスを不変条件として明文化した良い変更。
- **[N-002]** `ObjectStorage.delete` の冪等性契約化（`objectStorage.ts:74-86`）は模範的。「blob なし pending 行が purge 経路に定常流入する」という #468 で初めて構造的に踏まれる前提を、(a) port JSDoc で「hard port contract」と宣言し、(b) `MediaService.purge` の JSDoc の誤読余地（storage エラー伝播 ≠ delete が NotFound を投げる）を潰し、(c) `spec/domains/media.md` のエラーケースを「`StorageNotFoundError`（get / stat のみ）」に限定し、(d) blob なし行 → sweep → purge 完走の integration テストで検証する、と4点セットで固定している。
- **[N-003]** branded 型の扱いが正しい。`SourcePersist` を `{ mediaId: MediaAssetId }` に縮小し、値はステージ (a) の `MediaAsset.create`（`buildBase` → `MediaAssetId.create` で検証）が返す branded 値をそのまま運ぶため、main UoW 側にキャストが一切ない。メタデータの真実を DB 行に一本化する追加決定（adr.md）とも整合。
- **[N-004]** 猶予期間（cutoff 計算）の配置が正しい。`listAbandonedSourceIntakes` は `listPurgeCandidates` と完全対称（引数順・default limit 100・strict `<`）で、ドメインルール（grace window）はサービスに、status/kind フィルタはアダプターに、という責務分割が計画どおり実装されている。`now` は引数注入でありドメインサービスの純粋性（no ambient time）も保たれている。
- **[N-005]** `sweepAbandonedSourceIntakes` の JSDoc が、fresh 再読ガードの守備範囲（listing → per-row UoW の遷移のみ）と deferred-batch UoW の残余ウィンドウ、およびそれが今日安全である理由（grace 24h ≫ commit リクエスト内 attach）と将来の再検討条件（aged pending source を attach する経路の新設）を正直に文書化している。ドメインの並行性前提を隠さない良いドキュメント。
- **[N-006]** ポート成長の随伴コストとして `runExportJob.ts:270` のスタブ repo にも `findAbandonedSourceIntakes` の no-op 追加が必要だった。これは `MediaAssetRepository` を丸ごと実装するスタブという既存構造の帰結（interface segregation の緩み）であり本PRの瑕疵ではないが、ポートにメソッドが増えるたびに export 経路を触る結合が続く点は将来の整理候補。
- **[N-007]** ドメイン port / entity の JSDoc が「commit フローのステージ (a)」というアプリケーション層のフロー名を参照している。依存はドキュメントのみでコード依存の逆流はなく、回収対象の由来を説明する文脈情報として妥当な範囲（既存の `OrphanMedia` doc も purge worker に言及する前例あり）。
