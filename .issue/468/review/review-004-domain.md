# Review 004 — Domain

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: Domain（エンティティ・値オブジェクト・ドメインサービス・ポート契約・状態機械・型安全性・spec/domains 整合）

検証した受け入れ基準（Domain 関連）:

- AC-1（保持ポリシーの明文化）: `spec/domains/media.md` に ADR-001 どおりの保持ポリシーセクション（TTL なし・Note ライフサイクル連動・二重猶予・再検討トリガー）が追加されている。充足。
- AC-2/AC-4 のドメイン側前提: `decrementRef(pending) → orphan` の既存遷移の再利用、`findAbandonedSourceIntakes` ポート契約（strict `<`・pending/source 限定・oldest-first）、`listAbandonedSourceIntakes` の cutoff 計算が unit test で境界（`updatedAt == cutoff` 除外）込みで検証されている。充足。

既知の見送り（purge スループット上限・malformed 行の listing 耐性・`reconcileRefs` の構造的封鎖 — adr.md 記録済み）は再指摘しない。

### Domain

#### Blockers

なし

#### Warnings

- **[W-001]** ADR-004 の安全前提（「aged pending source = 放棄」）を破りうる attach 経路が `reconcileRefs` 以外にもう1本あり、記録済みの封鎖計画では塞がらない。
  - 場所: `app/core/application/identity/updateProfile.ts:71-93`
  - 理由: avatar 差し替えは `findById → 所有チェック → isPending || isAttached ガード → MediaAsset.incrementRef` を直接呼び、**kind を一切検査しない**。owner に露出している（`listMediaByOwner`）放棄済み `pending(kind='source')` の id を `avatarMediaId` に渡せば経過時間を問わず attach できる。sweep の JSDoc / `.issue/468/adr.md` が残余リスクとして記録し「`reconcileRefs` の added パスで pending source を拒否する」として別Issue化した構造的封鎖は、`reconcileRefs` を経由しないこの経路には効かない。発生条件（sweep の fresh 再読 → batch flush のミリ秒級残余窓に attach commit が重なる）と実害（当該 blob 1件の purge）は記録済みの `reconcileRefs` ケースと同一クラスであり本PRのブロッカーではないが、封鎖を `reconcileRefs` 内に置くと不完全になる。
  - 提案: 別Issue（構造的封鎖）の対象に本経路を含める。封鎖点はユースケース側の列挙ではなく、`MediaAsset.incrementRef` / `markAttached` がドメイン遷移規則として「放棄回収対象の pending source の attach」を拒否する形（またはそれに準ずる単一のドメイン側ガード）にすると、attach 経路が増えても破れない。本PRでは少なくとも sweep JSDoc / adr.md の残余リスク記述が `reconcileRefs` のみを挙げている点を実態（attach 経路は2本）に合わせて補正するとよい。
  - → 見送り: 構造的封鎖テーマに束ねて別Issueで対応（adr.md 参照）

- **[W-002]** `finalizeUpload` が kind 無差別に `updatedAt` を再スタンプするため、放棄 source intake の回収を owner の finalize 呼び出しで無期限に先送りできる。
  - 場所: `app/core/application/media/finalizeUpload.ts:66-81`
  - 理由: `PendingMedia` の doc（`entity.ts:40-43`）が明記するとおり `updatedAt` は abandoned-intake の age anchor であり、再スタンプ = 回収の先送り。upload 入口は `UploadableMediaKind` で source を型レベル排除した（`uploadMedia.ts:22`）のに対し、finalize は mediaId ベースで kind 検査がなく、blob が実在する放棄 intake（main UoW ロールバック残骸）に対しては stat が成功して pending のまま `updatedAt = now` で save される。誤回収ではなく先送りなので安全側の非対称だが、「commit フロー以外は source intake に触れない」という ADR-004 の前提を運用面で弱め、放棄残骸が finalize ポーリングで永続化しうる。
  - 提案: `finalizeUpload` で `asset.kind === 'source'` を reject する実行時ガードを追加（W-001 の別Issueに同梱でも可）。
  - → 見送り: 構造的封鎖テーマに束ねて別Issueで対応（adr.md 参照）

#### Notes

- **[N-001]** ドメインモデル（エンティティ・値オブジェクト・イベント）を一切変更せず、既にドキュメントされていた `decrementRef(pending) → orphan`（intake 放棄）遷移をそのまま回収の起点に使った設計は良い。新しい状態・削除経路を増やさず、回収を既存 purge 機構に一本化できている。
- **[N-002]** `findAbandonedSourceIntakes` の戻り型を `readonly PendingMedia[]` に絞り、D1 実装が cast ではなく `filter(MediaAsset.isPending)`（type-guard）で narrowing している点は「illegal states unrepresentable → 静的型を信頼」の原則に忠実。`kind='source'` までは型で表明されないが、消費側（sweep）は fresh 再読 + 実行時ガードで判定するため実害はない。
- **[N-003]** `ObjectStorage.delete` の冪等性（missing key = 成功、`StorageNotFoundError` を投げない）を「回収チェーンが構造的に依存するポート契約」として JSDoc / spec（`StorageNotFoundError` は get/stat のみ）に固定し、blob なし pending 行の purge 完走を integration で検証した点は、暗黙前提の契約化として的確。`MediaService.purge` の JSDoc から `incl. StorageNotFoundError` の誤読誘発文言を除去した修正も整合している。
- **[N-004]** `UploadableMediaKind = Exclude<MediaKind, "source">` によるアップロード入口の型レベル封鎖は、ADR-004 の前提（source pending は commit フロー内でのみ誕生・attach）をコンパイル時に守る良い補強（`MediaKind` が plain union のため `Exclude` が実効）。
- **[N-005]** commit main UoW の `findById → isPending ガード → markAttached` で null / 非 pending を `SystemError(DataIntegrityError)` として fail-loud にしたのは、cross-layer catch policy（整合性異常はビジネスルール違反と区別）に沿っており、両アームが実DBの3-UoW 実経路テストで検証されている。
- **[N-006]** `MediaService.listAbandonedSourceIntakes` の `graceSec` に下限（>= 0）の表明がない。負値を渡すと cutoff が未来になり進行中 intake を掃引しうる（main UoW 側ガードにより fail-loud で止まるためデータ損失はない）。既存 `listPurgeCandidates` と対称の形なので許容だが、「猶予はドメインルール」と宣言する以上、その不変条件も将来的にはドメイン側で表明する余地がある。
