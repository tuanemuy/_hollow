# PR Review #001 — feat(ingestion): 取り込み元ファイルを永続保存し閲覧・ダウンロード可能にする

**PR:** #462
**Date:** 2026-06-04
**Round:** 1回目

---

## Summary

- Blockers: 2
- Warnings: 4
- Notes: 多数（良好）
- Verdict: **BLOCKED**

レビュー4観点（Domain&UseCase / Adapter&Infra / Frontend&Security / Test）を並列実施。実装ロジックは plan/ADR に忠実で Domain/Adapter/Frontend にはコードの Blocker なし。Test 観点でライフサイクル中核（ADR-005）の自動テスト空白が Blocker 2件。各レイヤーに軽微な Warning が計4件。

---

## Domain & Use Case

#### Blockers
なし

#### Warnings
- **[W-D1]** `handleNotePurgedEvent` の source decrement が `decrementRef` の eventDrafts を捨てている
  - 場所: `app/core/application/media/handleNotePurgedEvent.ts:46-47`
  - 理由: commit overwrite 経路は `collectEvents(detached.eventDrafts)` を呼ぶ一方、purge 経路は `MediaEvents.orphaned` ドラフトを破棄。実害なし（media.* は dispatcher で skip、purge worker は status クエリで拾う）だが将来 media.orphaned に consumer が付くと purge 経路だけ取りこぼす。
  - 提案: 意図的（reconcileRefs に倣う）なら1行コメントで明示、または overwrite 側と揃えて collectEvents する。

#### Notes
- no-op 判定への sourceFileId 追加、overwrite 二重 decrement 防止、冪等ガード、purged 後方互換、mediaRefs 非混入 — いずれも適切。

## Adapter & Infrastructure

#### Blockers
なし（migration 0014 を 0001 元定義と逐一照合、カラム/型/CHECK/index/trigger 完全一致でデータ破損リスクなし）

#### Warnings
- **[W-A1]** `prepareSourcePersist` の `tempFileStorage.get` がエラー翻訳/ガードされていない
  - 場所: `app/core/application/ingestion/commitIngestionPreview.ts:404`
  - 理由: JSDoc は「temp key が回収済みなら null を返す（graceful skip）」と明記するが、コードは `tempStorageKey === null` のときしか null を返さない。temp blob 欠損時に `StorageNotFoundError` が server-function 境界まで伝播し commit が失敗 → JSDoc と実装が不一致。
  - 提案: `get` を try/catch し not-found なら null 返却（source 永続化スキップ + log）で JSDoc 通りにする。transient（unavailable）は rethrow。または JSDoc から該当記述を削る。

#### Notes
- SigV4 disposition 署名順序（署名前 queryParams push）正しい、PRAGMA defer_foreign_keys 適切、ON DELETE SET NULL は ADR-005 の安全網、エラー翻訳契約準拠。

## Frontend & Presentation / Security

#### Blockers
なし（認可の穴なし。relatedNoteId:null で source は所有者のみ、公開ノートでも非公開）

#### Warnings
- **[W-F1]** 閲覧リンクの `rel="noopener"` に `noreferrer` を併記していない
  - 場所: `app/components/note/detail/NoteMetaPanel.tsx:153`
  - 理由: presigned URL（署名トークン含む）が Referer ヘッダで R2 側に送られうる。実害は低いが署名付き URL を新規タブで開く以上 `rel="noopener noreferrer"` を推奨。
  - 提案: 閲覧リンクの rel を `noopener noreferrer` にする。

#### Notes
- 本文混入の分離確実、null 非破壊の二重ガード、validateSearch×inputValidator 整合、XSS なし、Tailwind 規約遵守、download リンクは target=_blank 無しで正しい。

## Test

#### Blockers
- **[W-T → B-001]** note purge による source ファイルの orphan 化・冪等性が一切テストされていない
  - 場所: `app/core/application/media/__tests__/media.integration.test.ts:698-783`
  - 理由: `buildNotePurgedEvent` に `sourceFileId` を追加したが、非null値を渡すテストが1件もなく、ADR-005 中核（purge→source decrement→orphan、at-least-once 重複配信の冪等ガード）が完全未検証。
  - 提案: 非null sourceFileId（attached/refCount=1 の source）で purge を処理し source が orphan になること、再配信で既 orphan が不変かつ例外なしを検証するテストを追加（既存 mediaRefs 冪等テストと同型）。

- **[B-002]** overwrite commit による旧 source ファイルの orphan 化がテストされていない
  - 場所: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts:1056-1114`
  - 理由: overwrite テストが source 無しノートを seed するため、`commitIngestionPreview.ts:285-296` の旧 source orphan 化分岐が未実行。
  - 提案: 既存 source（attached）を持つノートを overwrite commit し、(1) note.source_file_id が新 asset に差し替わる、(2) 旧 source が orphan/refCount=0 になることを検証。

#### Warnings
- **[W-T1]** `r2ObjectStorage` の SigV4 署名と `buildAttachmentDisposition` が完全に未テスト
  - 場所: `app/core/adapters/cloudflare/r2ObjectStorage.ts:200-294`
  - 理由: load-bearing な disposition の queryParams push と RFC 5987/6266 エッジケース（制御文字/クォート/非ASCII/空文字）にユニットテストなし。TC-2 の 500 バグも自動テスト空白が顕在化した領域。
  - 提案: `buildAttachmentDisposition` を export し、非ASCII・クォート・制御文字・空文字で filename=/filename*= 生成を検証するユニットテスト追加。可能なら presign が response-content-disposition を署名済みクエリに含めることも検証。

- **[W-T2]** `getNoteDetail` の source-file projection が未テスト
  - 場所: `app/core/application/note/getNoteDetail.ts:61-77`
  - 理由: source 有り→sourceFile DTO 合成、無し→null の application 層経路が結合テスト未検証。
  - 提案: `getNoteDetail.integration.test.ts` に source 有り（mediaId/originalFileName/mimeType 一致）/無し（null）のケース追加。

#### Notes
- 受け入れ条件5項目の対応・ドメイン単体・mediaSearch 回帰テスト・purged 後方互換テストは良質。

---

## Design Decisions

特になし（W-A1 は doc/impl 整合の修正、W-D1 はコメント or collectEvents の選択。いずれも ADR 化不要の実装詳細）。
