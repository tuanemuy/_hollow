# PR #714 レビュー — Use Case & Domain (review-001)

対象 PR: #714 / 実装計画: `.issue/612/plan.md` / 設計判断: `.issue/612/adr.md`
レビュー観点: Use Case & Domain
レビュー日: 2026-06-13

## 検証サマリー

Issue #612 の修正は、port `PublicationStateRepository` に件数専用の read-only メソッド
`countPublicByOwner(ownerId): Promise<number>` を新設し、`getPublicProfile` の
`publicNoteCount` 導出を `findPublicByOwner({limit:1000}).length` から
`countPublicByOwner` に切り替えるもの。ADR-001 の案 (c) どおりに実装され、
`findPublicByOwner` は一切改変していない。

Use Case / Domain 層に関わる AC（AC-1/AC-2/AC-3/AC-4）はいずれも実装で満たされている。

- AC-1（trashed-but-public 除外）: 新メソッドが `eq(notes.status, "active")` を INNER JOIN しているため達成。
- AC-2（listing total と整合）: 新メソッドの WHERE 4 条件が `listSortedAll`（L255-261）と完全一致（owner + visibility=public + published_at NOT NULL + active）。デフォルト経路でのみ厳密一致するスコープも JSDoc / usecase コメントで保持。
- AC-3（1000 頭打ち解消）: COUNT クエリに limit/offset/cursor が無く達成。
- AC-4（3 呼び出し元の不変更）: `findPublicByOwner` は無改変。`listRelatedPublicNotes` / `deleteAccount` のソースに差分なし（diff にも現れず）。

## Use Case & Domain

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** port IF への `countPublicByOwner` 追加は依存方向・集約境界・read-only 射影規約に適合
  - 場所: `app/core/domain/publication/ports/publicationStateRepository.ts:87-97`
  - 内容: domain port にメソッドを足し、adapter（D1）が実装、usecase（application）が依存する内向き依存で閉じている。戻り値はスカラ `number` で Note エンティティを publication ドメインに引き込まず、active 判定のための `notes` JOIN は adapter の read-only SQL に閉じている。ヘッダ JSDoc（L51-55）の「cross-aggregate joins live in the adapter's read-only SQL」規約どおり。

- **[N-002]** port JSDoc が契約を正しく表現している
  - 場所: `app/core/domain/publication/ports/publicationStateRepository.ts:87-96`
  - 内容: 「`listSortedAll` / `listPublicNoteIdsByOwnerInRange` と同じ active JOIN」「`findPublicByOwner.length` と異なり active 母集合・limit なし」「listing total と同一 WHERE で整合」の 3 点（active 母集合・limit なし・listing total 整合・findPublicByOwner との違い）が明記されており、計画ステップ 2 の要求を満たす。`findPublicByOwner`（active 不問）との使い分けを型と契約の両方で誘導できている。

- **[N-003]** `getPublicProfile` の切替が正しく import 残骸・未使用変数なし
  - 場所: `app/core/application/publication/getPublicProfile.ts:40-41`
  - 内容: 旧 `publicNotes`（`findPublicByOwner` の戻り）を削除し `publicNoteCount` を直接受けている。`publicationStateRepository` は UoW コンテキストから destructure されるため import 文の変更は不要で、残骸なし。関数 JSDoc（L20-24）も `findPublicByOwner` 記述から `countPublicByOwner`（active 母集合・listing total 整合）へ更新済みで計画ステップ 4 に一致。`publicNoteCount: number` の型・意味（公開カタログ件数）は不変で presentation 契約を破壊しない。

- **[N-004]** `findPublicByOwner` を一切触っていないことを確認
  - 場所: `app/core/adapters/d1/repositories/publicationStateRepository.ts:197-222`（無改変）/ `app/core/application/publication/listRelatedPublicNotes.ts:87-114`（無改変）/ `app/core/application/identity/deleteAccount.ts:60-90`（無改変）
  - 内容: `findPublicByOwner` の SQL（active JOIN なし・keyset cursor on `note_id`）は無変更。`deleteAccount` は依然として全 public 行（trashed-but-public 含む）を keyset walk して `visibility !== "private"` を private に flip する掃除を維持（L66-90）。`listRelatedPublicNotes` も over-fetch + in-memory active 再フィルタ（L106-114）のまま。両者とも PR の diff に含まれず、keyset cursor の母集合（全 public 行の安定 walk）の意味も不変。ADR-001 が案 (a) を退けた根拠が実装でも守られている。

- **[N-005]** adapter 実装が確立パターンの素直な再利用
  - 場所: `app/core/adapters/d1/repositories/publicationStateRepository.ts:347-367`（新 `countPublicByOwner`）
  - 内容: `listSortedAll` の count 部分（L277-281）と同形の `select({value: count()}) ... innerJoin(notes) ... where(and(owner, public, isNotNull(publishedAt), active))`。`mapDbError` でラップし `Number(countRows[0]?.value ?? 0)` を返す。使用シンボル（`count` / `and` / `eq` / `isNotNull` / `notes` / `publicationStates`）はすべて既存 import。WHERE 条件は `listSortedAll`（範囲フィルタ無し時）と完全一致するため AC-2 の drift 要因がない。

- **[N-006]** D1 integration test が active JOIN / visibility / published_at NOT NULL / owner 分離 / listing total 整合を網羅（AC-5）
  - 場所: `app/core/adapters/d1/__tests__/publicationStateRepository.integration.test.ts:731-906`
  - 内容: 計画ステップ 5 の (a)〜(g) がそれぞれ独立ケースとして実装されている。特に trashed-but-public 除外（AC-1）と published_at NULL 除外を別ケースで固定し、`listPublicNoteIdsByOwnerSorted` の total と `countPublicByOwner` の一致（AC-2 の adapter レベル裏取り、必須ケース）も実装済み。fake 不在のため D1 integration に検証を寄せる判断も #605 方針と整合。
