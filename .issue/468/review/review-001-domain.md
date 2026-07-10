# PR #834 レビュー — Domain 観点

対象: Issue #468（source blob のストレージ衛生）/ 計画 `.issue/468/plan.md` / ADR `.issue/468/adr.md`

## レビュー範囲と前提

Domain レイヤーの変更点は以下の3点で、計画の「ドメインモデルへの影響」（エンティティ・値オブジェクト変更なし / ポートに `findAbandonedSourceIntakes` 追加 / `MediaService.listAbandonedSourceIntakes` 追加 / `ObjectStorage` はJSDoc補強のみ）と完全に一致していることを diff で確認した。

- `app/core/domain/media/ports/mediaAssetRepository.ts` — `findAbandonedSourceIntakes(before, limit)` 追加
- `app/core/domain/media/ports/objectStorage.ts` — `delete` の冪等性契約のJSDoc補強
- `app/core/domain/media/service.ts` — `listAbandonedSourceIntakes(now, graceSec, repo, limit)` 追加、`purge` のJSDoc更新

加えて、ドメイン境界に接するアプリケーション層（`commitIngestionPreview.ts` の metadata-first 化、`sweepAbandonedSourceIntakes.ts` のエンティティ操作）を「ドメインロジックの漏出 / 型安全」の観点で検証した。

### 受け入れ基準（Domain 関連分）の検証

| AC | Domain 観点での判定 | 根拠 |
|---|---|---|
| AC-1 | 充足 | `spec/domains/media.md` に保持ポリシー（TTLなし・Noteライフサイクル連動・二重猶予24h+24h・再検討トリガー）が明文化。`listAbandonedSourceIntakes` / `findAbandonedSourceIntakes` / `delete` 冪等性契約も spec に反映 |
| AC-2 | 充足 | 回収の状態遷移は既存の `decrementRef(pending) → orphan`（`entity.ts:140-153`、「Abandoning a pending intake」として元々文書化済み）を再利用。新しい状態・イベント・遷移は増えていない。E2E テスト（`ingestion.integration.test.ts` のロールバック→sweep→purge）で実証 |
| AC-4 | 充足 | 猶予窓は strict `<` で、ドメインサービスJSDoc・D1実装（`lt`）・フェイク・テストの4箇所で一貫。cutoff 計算はドメインサービスに置かれアダプターは status/kind フィルタのみ（計画ステップ2どおり） |

### ドメイン純粋性の確認

- `listAbandonedSourceIntakes` は `now` を明示引数で受け取り、ambient time なし。`listPurgeCandidates` と完全対称。
- sweep ユースケースの時刻は `container.clock.now()` から供給され、`decrementRef` へ明示的に渡される。id 生成もドメイン外（`prepareSourcePersist` の `idGenerator.next()`）。
- `ObjectStorage.delete` の冪等性契約（missing key = 成功、`StorageNotFoundError` を投げない）は R2 アダプター実装（`r2ObjectStorage.ts:124-133` — `bucket.delete` は missing key で no-op、throw は `StorageUnavailableError` のみ）と実際に整合しており、JSDoc が実装から乖離した「願望の契約」になっていない。spec 側の「`StorageNotFoundError`（get / stat のみ）」も presign 系が `StorageUnavailableError` しか投げない実装と一致。

---

### Domain

#### Blockers

なし

#### Warnings

- **[W-001]** `SourcePersist.mediaId` が `string` のまま運ばれ、main UoW で `as MediaAssetId` の型アサーションにより値オブジェクト検証をバイパスしている
  - 場所: `app/core/application/ingestion/commitIngestionPreview.ts:258-259`（キャスト）、`:370-372`（`SourcePersist` 型）
  - 理由: 変更前は raw string が main UoW 内の `MediaAsset.create` → `MediaAssetId.create` を通って検証されていたが、metadata-first 化でこの経路が `findById(sourcePersist.mediaId as MediaAssetId)` に置き換わり、branded 型への unchecked cast が新規に入った。ステージ (a) の小 UoW では `MediaAsset.create` が同じ文字列を検証済みなので実行時安全ではあるものの、検証済みの branded 値（`asset.id: MediaAssetId`）がすぐ手元にあるのに捨てて raw string + cast で運ぶのは、CLAUDE.md「Validate at the boundaries …; trust the static type in between」「lean on TypeScript's type system fully」に反する。将来 `prepareSourcePersist` 内の生成順が変わると cast だけが残り検証が消える構造的な脆さがある。
  - 提案: `SourcePersist` を `Readonly<{ mediaId: MediaAssetId }>` にし、小 UoW 内で生成した `asset.id` を持ち帰る（小 UoW のコールバックから `asset.id` を return するか、UoW 前に `MediaAssetId.create(mediaId)` を1回通す）。`findById` の呼び出しから cast が消え、「検証は構築時に1回、以後は静的型を信頼」が回復する。

- **[W-002]** `PendingMedia` のエンティティドキュメントに「`updatedAt` が intake 放棄判定のアンカーになる」という新しいセマンティクスが反映されていない
  - 場所: `app/core/domain/media/entity.ts:36-43`
  - 理由: 本PRで `pending(kind='source')` の `updatedAt` は sweep の猶予窓（`updatedAt < now - graceSec`）の基準として構造的な意味を持つようになった。同型のセマンティクスを持つ `OrphanMedia` には「`updatedAt` acts as the orphan age anchor; the purge worker filters by …」（`entity.ts:49-53`）と明記されているのに対し、`PendingMedia` 側は非対称のまま。エンティティは状態セマンティクスの SSOT であり、ここに書かれていないと、将来 pending 行の `updatedAt` を再スタンプする処理（例: メタデータ補正）を追加した開発者が、source intake の回収を無自覚に先送りするリスクがある。ドキュメントは port（`mediaAssetRepository.ts:56-63`）とサービス（`service.ts:85-92`）にはあるが、型定義を読む人はそこに辿り着かない。
  - 提案: `PendingMedia` のJSDocに1文追加する（例: "For `kind='source'`, `updatedAt` anchors the abandoned-intake sweep window (#468) — a pending source older than the grace period is reclaimed."）。

#### Notes

- **[N-001]** 状態機械を閉じたまま解決している点が良い。新しい status / イベント / 遷移を一切増やさず、既存の `decrementRef(pending) → orphan`（エンティティに「Abandoning a pending intake transitions directly to orphan」として#452時点から文書化済みの遷移）をそのまま sweep の実行手段にしており、「回収は参照グラフという単一の真実に基づく」という ADR-001 の原則がドメインモデルの形で保たれている。
- **[N-002]** `listAbandonedSourceIntakes` と `listPurgeCandidates` の対称設計（cutoff 計算 = ドメインルールをサービスに、status/kind フィルタをアダプターに）は計画ステップ2どおりで、猶予期間ルールのアダプター漏出がない。`findAbandonedSourceIntakes` を kind 引数付きの汎用メソッドにせず名前で `source` 限定を表明したのも、ADR-004 の設計判断（他 kind の pending は放棄と断定できない）を型レベル・API レベルで固定する良い判断。
- **[N-003]** `ObjectStorage.delete` の冪等性JSDoc（`objectStorage.ts:74-87`）は「なぜ契約なのか」（blob なし pending 行が定常的に purge に流入し、`StorageNotFoundError` を投げるアダプターだと `deleting` で永久 stall する）まで書かれており、CLAUDE.md の「hidden constraint / invariant にはコメントを書く」基準に合致する模範的な contract 文書。blob なし行の purge 完走テスト（`sweepAbandonedSourceIntakes.integration.test.ts` 最終ケース）で契約が実行可能な仕様として検証されている点も良い。
- **[N-004]** `findAbandonedSourceIntakes` / `listAbandonedSourceIntakes` の戻り値型は `readonly MediaAsset[]` だが、契約上は常に `PendingMedia`（かつ `kind='source'`）しか返らない。`PendingMedia` 型が既に存在するので `readonly PendingMedia[]` に絞れば "illegal states unrepresentable" にさらに寄る。ただし (a) 既存 `findPurgeableOlderThan` も wide union を返すスタイルで一貫している、(b) sweep は per-row の fresh 再読（TOCTOU 防御）で結局実行時に再判定するため narrowing が load-bearing にならない、の2点から現状のままで妥当。ポート全体を見直す機会があれば両メソッドまとめて絞るとよい。
- **[N-005]** 軽微な非対称: 新ポートのJSDocは「ordered oldest-first」を契約として明記した（D1実装は `updatedAt ASC, id ASC` で準拠）が、`service.test.ts` の InMemoryRepo フェイクはソートせず Map の挿入順に依存している（既存 `findPurgeableOlderThan` のフェイクと同スタイル）。また既存 `findPurgeableOlderThan` はD1実装が同じ順序を持つのにポートJSDocに順序の記載がない。現状のテストは順序に依存していないため実害はないが、順序を契約に含めるなら両メソッド・フェイク実装で揃えると齟齬の芽が消える。
- **[N-006]** main UoW の整合性ガード（`commitIngestionPreview.ts:261-266`）が欠損/非 pending を `BusinessRuleError` ではなく `SystemError(DataIntegrityError)` で fail-loud にしているのは正しい分類。同一リクエスト内で自分が挿入した行の欠損はユーザー起因の不変条件違反ではなくデータ整合性異常であり、「domain → application で再翻訳しない」「invariant violation と integrity fault は別 kind」というエラー方針に沿う。黙って `sourceFileId` を落とさない点も計画どおり。
