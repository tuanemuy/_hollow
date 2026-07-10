# Review 005 — Domain

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: Domain（エンティティ・値オブジェクト・ドメインサービス・ポート契約・状態機械・型安全性・spec/domains 整合）— ゼロベースのフルレビュー

検証した受け入れ基準（Domain 関連）:

- AC-1（保持ポリシーの明文化）: `spec/domains/media.md` に「保持ポリシー（source, Issue #468 ADR-001）」セクションが追加され、ADR-001 の内容（時間ベース TTL なし・Note ライフサイクル連動・trash 中保持・orphan 化の3契機・二重猶予 24h+24h・再検討トリガーと `aggregateByOwner` による判断材料）と過不足なく一致している。充足。
- AC-2/AC-4 のドメイン側前提: 回収の起点はエンティティに既存ドキュメント済みの `decrementRef(pending) → orphan` 遷移（`entity.ts:139-156`、`media.orphaned` 発火込み）の再利用で、新しい状態・イベント・削除経路は増えていない。`findAbandonedSourceIntakes` はポート契約（pending/source 限定・strict `<`・oldest-first + id タイブレーク）が JSDoc で固定され、猶予計算（cutoff = now − graceSec）は `MediaService.listAbandonedSourceIntakes` にドメインルールとして置かれ、境界（`updatedAt == cutoff` の除外）が unit test で検証されている（`service.test.ts:3628-3648` 相当）。D1 実装は同一の WHERE/ORDER を実装し integration test でフィルタ・順序を検証。充足。
- AC-5 のドメイン側: エンティティ・値オブジェクト・`MediaService` 既存メソッドはシグネチャ不変（`purge` は JSDoc 精密化のみ）。`errorCodeNaming` 対象の新規エラーコードなし（stage (b) ガードは application 層の `SystemError(DataIntegrityError)` で、整合性異常とビジネスルール違反の区別という cross-layer catch policy に合致）。充足。

既知の見送り（adr.md「pruner 回収の運用強化」: purge スループット上限・malformed 行の listing 耐性・attach/re-stamp 経路の構造的封鎖 = reconcileRefs / updateProfile / finalizeUpload）は再指摘しない。

### Domain

#### Blockers

なし

#### Warnings

- **[W-001]** `PendingMedia` の JSDoc が新設した「`updatedAt` の再スタンプは回収を先送りする」というドメイン仕様の主張が、sweep の per-row fresh ガードでは担保されず、候補列挙〜per-row 再読の間に着地した再スタンプは無視されて orphan 化される。
  - 場所: `app/core/domain/media/entity.ts:40-43`（主張）/ `app/core/application/media/sweepAbandonedSourceIntakes.ts:59-67`（fresh ガードは `isPending && kind === 'source'` のみで cutoff を再検査しない）
  - 理由: fresh 再読は「pending でなくなった行」（attach / 削除）はスキップするが、「pending のまま `updatedAt` だけ再スタンプされた行」は候補時点の判定のまま orphan 化する。pending/source を保ったまま再スタンプする writer は現状 `finalizeUpload`（構造的封鎖は別Issueで記録済み）だけであり、実害の発生条件は記録済み残余リスクと同クラス（日次 tick のミリ秒級窓 × 故意の操作）なので本PRのブロッカーではない。ただし本PRが entity.ts に導入した「re-stamping … defers its reclaim」は無条件の記述であり、実装が保証するのは「候補列挙時点までの再スタンプ」に限られる。これは構造的封鎖（経路側を塞ぐ）とは独立に、sweep 側で安価に閉じられる半分（列挙〜再読の窓。再読〜flush の残余窓は deferred-batch UoW の設計上閉じられず、既に JSDoc で許容記録済み）。
  - 提案: per-row ガードに `fresh.updatedAt.getTime() < cutoff.getTime()` の再検査を1行追加する（cutoff を per-row UoW に引き回すだけ。再スタンプ = 回収先送りの主張が、attach/re-stamp 経路が今後増えても列挙時点の鮮度に依存せず成立するようになる）。あるいは修正を見送るなら、entity.ts の当該 JSDoc を「候補列挙時点までの再スタンプ」に限定する形へ精密化する。いずれも別Issue（構造的封鎖）と重複しない本PR内で完結する軽微な整合修正。

#### Notes

- **[N-001]** 「ドメインモデル変更なし」という計画どおり、エンティティの状態機械（`decrementRef(pending) → orphan`、doc 済みの intake 放棄遷移）をそのまま回収の起点に使い、blob の実削除を既存 purge 機構に一本化した設計は良い。orphan 化の `updatedAt` 再スタンプによる二重猶予（sweep 24h → purge 24h）も、時刻ベースの例外規則を増やさず既存の age-anchor 規約に載っている。
- **[N-002]** `findAbandonedSourceIntakes` の戻り型 `readonly PendingMedia[]` と、D1 実装の cast ではない `filter(MediaAsset.isPending)` type-guard narrowing は「illegal states unrepresentable → 静的型を信頼」に忠実。タイブレーク（`updatedAt` 同値時の `id` 昇順）を「同一秒に量産される放棄行に対する limit 跨ぎの決定性」という理由込みでポート契約に明記し、InMemory フェイク2箇所が同じ順序を実装している点も契約の一貫性が取れている。
- **[N-003]** `ObjectStorage.delete` の冪等性（missing key = 成功、`StorageNotFoundError` を投げない）を「#468 回収チェーンが構造的に依存するポート契約」として JSDoc に固定し、`MediaService.purge` の JSDoc から `incl. StorageNotFoundError` の誤読誘発文言を除去、spec 側もエラーケースを「`StorageNotFoundError`（get / stat のみ）」に精密化。ポート・spec・integration テスト（blob なし行の purge 完走）の三点が揃っており、暗黙前提の契約化として的確。
- **[N-004]** `UploadableMediaKind = Exclude<MediaKind, "source">` によるアップロード入口（`uploadMedia` / `uploadMediaPresigned`）の型レベル封鎖は、ADR-004 の安全前提「pending/source は commit フロー内でのみ誕生し同一リクエスト内で attach される」をコンパイル時に守る良い補強。`spec/usecases/media.md` の入力 DTO にも理由込みで反映されている。
- **[N-005]** `MediaService.listAbandonedSourceIntakes` の `graceSec` に下限（>= 0）の表明がない。負値なら cutoff が未来になり進行中 intake が候補に載りうる（commit 進行中の行は main UoW の fail-loud ガードで止まるため blob 損失には直結しない）。呼び出し元はコード内定数（env 配線なし）で、既存 `listPurgeCandidates` と対称の形なので許容だが、「猶予はドメインルール」と宣言する以上、不変条件も将来的にドメイン側で表明する余地がある。
- **[N-006]** commit stage (b) の `findById → isPending ガード → markAttached` は、同一リクエストが直前に挿入した行の再読であるため kind / 所有の再検査を省いており、これは正当（id は当該リクエストが採番・永続化した branded `MediaAssetId` で、`SourcePersist` を `{ mediaId }` に縮小して真実を DB 行に一本化した追加決定とも整合）。null / 非 pending の両アームが `SystemError(DataIntegrityError)` として実DBテストで検証されている。
