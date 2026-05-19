# PR Review #001 — fix(spec-sync): close 4 behavior gaps surfaced by Issue #5

**PR:** #81
**Date:** 2026-05-20
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 10（うち 1 件は重複指摘）
- Notes: 多数（参考情報）
- Verdict: **BLOCKED**（Warning が複数件あるため修正後に再レビュー）

---

## Domain

### Blockers
なし

### Warnings

- **[W-001]** `findByOwnerAndSlug` の active 限定化が `NoteService.resolveInternalLinks` の挙動を変えていることが ADR-007 で言及されていない
  - 場所: `app/core/domain/note/service.ts:183` / `.issue/42/adr.md` ADR-007
  - 理由: ADR-007 の Consequences は `getPublicNote` / `generateUniqueSlug` / `assertSlugUnique` 経由の restoreNote のみを呼び出し元として列挙しているが、`resolveInternalLinks` も同じポートを使う。`[[trashed-slug]]` 形式の内部リンクが broken link 扱いになる挙動変化が生じる
  - 提案: ADR-007 の Consequences に `resolveInternalLinks` も呼び出し元として追記し、「trashed slug への title-keyed 内部リンクは unresolved として描画される」と明示

- **[W-002]** `MediaService.assertViewableBy` の unit test に「anonymous viewer + unlisted + hasShareLink=true: passes」「anonymous viewer + unlisted + hasShareLink=false: throws」が欠けている
  - 場所: `app/core/domain/media/__tests__/service.test.ts:419-445`
  - 理由: anonymous + unlisted + share-link は本機能の正規ユースケースで、access matrix の網羅性に必須
  - 提案: 2 ケース追加（pass / throw）

- **[W-003]** `restoreNote` の `assertSlugUnique` 呼び出しで `exceptId` を渡しているが、`findByOwnerAndSlug` が active のみを返すように変更された結果、`exceptId` 分岐は決して true にならない（dead code）
  - 場所: `app/core/application/note/restoreNote.ts:77-83`
  - 提案: `exceptId: null` を渡して意図を明示する、または「restore では dead code（partial index 以降の安全網）」とコメントを残す

- **[W-004]** `NoteErrorCode` の命名規約に一貫性がない（UPPER_SNAKE + prefix と lower_snake が混在）
  - 場所: `app/core/domain/note/errorCode.ts`
  - 提案: 別 Issue で整理（本 Issue スコープ外）

## Application

### Blockers
なし

### Warnings

- **[W-001]** `restoreNote.ts:77-83` の `assertSlugUnique` 呼び出しが directory 解決ロジックの**後**に置かれている
  - 場所: `app/core/application/note/restoreNote.ts:77`
  - 理由: directory 不在で root にフォールバックする `DirectoryService.ensureRoot` は root を新規作成する副作用がある。slug 衝突で例外が出るケースでも root directory が新規作成されて rollback される無駄が生じる
  - 提案: `assertSlugUnique` を `if (found.entity.status !== "trashed")` の直後（L48 付近）に前倒しして fail-fast にする。`saveNote` の `assembleFromInputs` で slug check が先に走るパターンとも整合

## Adapter

### Blockers
なし

### Warnings

- **[W-001]** `noteRepository.ts` の `insert` JSDoc が古い（`(owner_id, slug) UNIQUE index` の記述）
  - 場所: `app/core/adapters/d1/repositories/noteRepository.ts:632-635`
  - 提案: partial index 化を反映した文言に更新（「status='active' のときのみ」）

- **[W-002]** schema.ts の partial index 述語と migration 0007 の SQL 述語が完全一致する必要があるが、その不変条件がコメントで明示されていない
  - 場所: `app/core/adapters/d1/schema.ts:263` 付近
  - 理由: 将来 drizzle で `sql\`status = ${"active"}\`` のような埋め込みに変えると parameter placeholder になり、partial-index matcher が外れて seq scan に落ちる
  - 提案: schema.ts のコメントで「述語テキストは migration 0007 と完全一致させること」と注記

## Test

### Blockers
なし

### Warnings

- **[W-001]** `findByOwnerAndSlug` の active 限定化を直接ピン留めする回帰テストが PR に追加されていない
  - 場所: 該当テストファイル無し
  - 理由: 将来誰かが status フィルタを外しても、`trashLifecycle.integration.test.ts` の slug_conflict ケースは別の経路で偶発的に green になる可能性がある
  - 提案: `getPublicNote` の「trashed slug は 404 になる」integration テストを追加するか、D1 adapter level で `findByOwnerAndSlug` が trashed を返さないことを直接 assert するテストを追加

- **[W-002]** `trashLifecycle.integration.test.ts` の slug_conflict テストで、エラー後に trashed ノートの状態が変わっていないこと（rollback されたこと）が検証されていない
  - 場所: `app/core/application/note/__tests__/trashLifecycle.integration.test.ts:220-249`
  - 提案: trashed ノート行の `status === "trashed"` および `trashedAt !== null` を after assert で確認する（duplicateNote 側の補助 assert と対称に）

- **[W-003]** ADR-006 の「unit test で網羅済み」という主張は keyword 委譲ロジックには妥当だが、search 自体の動作網羅性については正確ではない
  - 場所: `.issue/42/adr.md` ADR-006
  - 提案: ADR-006 の文言を「keyword の SearchQuery 委譲は unit test で網羅済み。実 D1SearchIndex の挙動検証は本 Issue スコープ外（別途検討推奨）」に明確化

- **[W-004]** `MediaService.assertViewableBy` の anonymous viewer + unlisted + hasShareLink ケースが domain unit test で欠けている
  - Domain W-002 と重複

### Notes
- `it.todo` 4 件はすべて解消されている
- assertSlugUnique のシグネチャ拡張に対する直接の domain unit test は無いが、既定値の挙動は既存呼び出し元の integration テストで間接検証されている

---

## Design Decisions

このラウンドで見つかった設計判断:

- ADR-007 の補足: `findByOwnerAndSlug` の active 限定化が `resolveInternalLinks` にも影響するという事実は ADR の Consequences に追記する価値がある（Domain W-001）。
- ADR-006 の文言改善: 「unit test で網羅」の対象範囲を keyword 委譲ロジックに限定する明確化が必要（Test W-003）。
