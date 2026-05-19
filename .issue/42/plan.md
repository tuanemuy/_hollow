# 実装計画 — Issue #42: [spec-sync] follow-up: behavior gaps surfaced by Issue #5 integration tests

**Issue:** #42
**作成日:** 2026-05-20
**複雑度:** 中〜大規模

---

## 目的

Issue #5 で note / media ドメインの integration test を実装する過程で判明した、spec が要求する挙動と現状実装の乖離 4 件を解消する。

3 件は usecase / domain の業務ルール追加（`downloadMedia` の share-link 検証強化、`duplicateNote` の trashed 拒否、`restoreNote` の slug 衝突検証 + partial unique index 化）、1 件は spec ドキュメントの整理。対応する 4 件の `it.todo` を `it` に変換し、green になることを確認する。

## スコープ

### 含まれるもの

- ADR-004 #1 DownloadMedia: unlisted + viaShareLinkId 未指定の拒否
- ADR-004 #10 RestoreNote: slug 衝突検証（partial unique index + 事前検証）
- ADR-004 #11 DuplicateNote: trashed ノート拒否
- ADR-004 #18 ListNotesByOwner: keyword 行を `searchOwnNotes` 表に移動（コード変更なし）
- 4 件の `it.todo` を `it` 化

### 含まれないもの

- ADR-004 の他の項目（#2〜#9, #12〜#17）— 別 Issue で対応
- `searchOwnNotes` 側の integration test 追加（既存 unit test で keyword 委譲を網羅済み）
- 他ドメインへの波及修正

## 実装ステップ

### 1. DownloadMedia: unlisted + viaShareLinkId 未指定 → `BusinessRuleError('media_not_viewable')`

- **対象ファイル:**
  - `app/core/domain/media/service.ts`
  - `app/core/application/media/downloadMedia.ts`
  - `app/core/domain/media/__tests__/service.test.ts`（存在すれば修正、なければ新規）
- **変更内容:**
  1. `MediaService.assertViewableBy` のシグネチャに `hasShareLink: boolean` を追加。`relatedNoteVisibility === "unlisted"` の分岐を `hasShareLink === true` のときのみ pass、false なら `BusinessRuleError(MediaErrorCode.NotViewable)` を throw する。
  2. `downloadMedia.ts` で `void input.viaShareLinkId;` を削除し、`MediaService.assertViewableBy({ ..., hasShareLink: input.viaShareLinkId !== null })` を呼ぶ。
  3. domain service の unit test に「unlisted + hasShareLink=false → throws」「unlisted + hasShareLink=true → passes」の 2 ケースを追加。既存ケースは `hasShareLink: true` 等を渡すよう修正。
- **理由:** access policy を domain service に集約する SSOT 原則。将来別 usecase から `assertViewableBy` を呼ぶ際もガードが効く。`hasShareLink: boolean` を選んだのは YAGNI — 現状 domain 側で ShareLinkId 自体を使う必要がない（presentation で resolve 済みの前提）。

### 2. RestoreNote: 復元先 slug 衝突 → `BusinessRuleError('slug_conflict')`

- **対象ファイル:**
  - `app/core/domain/note/errorCode.ts`
  - `app/core/adapters/d1/schema.ts`（L261 付近）
  - `app/core/adapters/d1/migrations/0007_notes_slug_partial_unique.sql`（新規）
  - `app/core/adapters/d1/repositories/noteRepository.ts`（`findByOwnerAndSlug` を active 限定化）
  - `app/core/domain/note/ports/noteRepository.ts`（ポート JSDoc 更新）
  - `app/core/domain/note/service.ts`（`assertSlugUnique` シグネチャ拡張）
  - `app/core/application/note/restoreNote.ts`
- **変更内容:**
  1. `NoteErrorCode` に `SlugConflict: "slug_conflict"` を追加（spec 文言リテラル一致、snake_case 流儀）。
  2. `schema.ts:261` を `uniqueIndex("uniq_notes_owner_slug").on(table.ownerId, table.slug).where(sql\`status = 'active'\`)` に変更。
  3. マイグレーション 0007: `DROP INDEX IF EXISTS uniq_notes_owner_slug; CREATE UNIQUE INDEX IF NOT EXISTS uniq_notes_owner_slug ON notes(owner_id, slug) WHERE status = 'active';`（既存 0005/0006 と冪等スタイルを揃える。先頭にヘッダコメントで「Manual migration — partial unique index after Issue #42」と明記）
  4. **`findByOwnerAndSlug` を active 限定に変更**: `noteRepository.ts:304-316` のクエリ WHERE 句に `eq(notes.status, "active")` を追加。`domain/note/ports/noteRepository.ts:84` の JSDoc に「returns active notes only; trashed notes are excluded」と明記。これにより partial unique index と API のセマンティクスが対称になり、`getPublicNote` の公開ルートや `generateUniqueSlug` の衝突回避も意味的に正しく動作する。
  5. `assertSlugUnique` のシグネチャに任意引数 `code: NoteErrorCode = NoteErrorCode.InvalidSlug` を追加。`restoreNote.ts` から `NoteErrorCode.SlugConflict` を渡して呼び出す。`findByOwnerAndSlug` の active 限定化により自分自身（trashed）はもう返らないため、既存の `exceptId` ロジックは変更不要。
- **理由:**
  - partial index は fixture 可達性のための前提（active と trashed の同一 slug 共存を可能にする）。
  - 違反時の error は DB driver の `UNIQUE constraint failed` 経由で SystemError 系に翻訳されるため、ユーザ向けに `'slug_conflict'` ドメインエラーを返すには usecase 側の事前検証も必要。
  - `findByOwnerAndSlug` を status 非区別のままにすると、partial index 化後に「active と trashed が同 slug で共存する」状況で SQLite が非決定的にどちらかを返し、`getPublicNote` の公開ルートや restoreNote の衝突検査が偶発的に壊れる（実現可能性レビュー P-001 / P-002 で指摘済）。active 限定にすれば `getPublicNote` / `generateUniqueSlug` も意味的に正しくなる（trashed slug は publish 対象でないし、新規 active が trashed slug を再利用できるべき）。
  - `assertSlugUnique` の呼び出し元は `restoreNote.ts:77` の 1 箇所のみで、create / rename は `generateUniqueSlug` 経由のため、シグネチャ拡張の波及は restoreNote のみ（実現可能性レビュー P-003 で訂正済）。任意引数（既定 `InvalidSlug`）にしておけば既存挙動も保持できる。

### 3. DuplicateNote: trashed ノート拒否

- **対象ファイル:** `app/core/application/note/duplicateNote.ts`
- **変更内容:** owner 検査の if ブロックの直後に status 検査を追加:
  ```ts
  if (found.entity.status !== "active") {
    throw new BusinessRuleError(
      NoteErrorCode.AlreadyTrashed,
      `Cannot duplicate trashed note: ${input.noteId}`,
    );
  }
  ```
  必要に応じて `BusinessRuleError` / `NoteErrorCode` の import を追加（既存にあれば不要）。
- **理由:** `saveNote.ts:82-87` / `renameNote.ts:44` で全く同形のパターンが既に複数 usecase で使われているため、既存 `AlreadyTrashed` を再利用するのが最小波及。新規 code 追加は YAGNI。spec は具体的 code を要求していない（「動作対象外 / 拒否」のみ）ため既存流用で十分。

### 4. ListNotesByOwner: keyword 行の spec 移動（コード変更なし）

- **対象ファイル:** `spec/testcases/note/index.md`（L83 行を削除）
- **変更内容:** `| keyword 指定 | ListNotesByOwner | Search ドメインへ委譲 |` の 1 行を削除する。
- **理由:** `spec/testcases/search/index.md` の `## SearchOwnNotes` 表に既に `| キーワードあり | Search | 該当 hits + nextCursor |` 等が網羅されており、note 側に同じ意味の行を残す必要がない。追加の integration test も不要（既存 `searchOwnNotes.test.ts` の unit test で keyword → SearchQuery への委譲が網羅されている）。

### 5. `it.todo` の解除と本実装テスト化

- **対象ファイル:**
  - `app/core/application/media/__tests__/media.integration.test.ts`（L599 付近）
  - `app/core/application/note/__tests__/duplicateNote.integration.test.ts`（L150 付近）
  - `app/core/application/note/__tests__/trashLifecycle.integration.test.ts`（L222 付近）
  - `app/core/application/note/__tests__/listNotesByOwner.integration.test.ts`（L345 付近）
- **変更内容:**
  - **media.integration.test.ts**: 直前の「unlisted + viaShareLinkId 有」ケース（L572-597 付近）を fixture コピーし、`viaShareLinkId: null` で呼び出す。`isBusinessRuleError(err) && err.code === MediaErrorCode.NotViewable` を assert。
  - **duplicateNote.integration.test.ts**: `seedNote(..., { status: "trashed" })` で trashed ノートを作成 → `duplicateNote` 呼び出し → `BusinessRuleError + NoteErrorCode.AlreadyTrashed` を assert。複製が発生していないことを `schema.notes` の件数で確認する補助 assertion を追加。
  - **trashLifecycle.integration.test.ts**: `seedNote(owner, dir, { slug: "shared", status: "trashed" })` と `seedNote(owner, dir, { slug: "shared", status: "active" })` の両方を挿入し（partial index 化後は両方 OK）、trashed 側に対して `restoreNote` を呼ぶ → `BusinessRuleError + NoteErrorCode.SlugConflict` を assert。
  - **listNotesByOwner.integration.test.ts**: `it.todo` 行と関連コメントブロックを削除（spec 移動済のため）。
- **理由:** 各テストは現状 fixture 構築前に `it.todo` で停止しており、実装変更後に新規 fixture と assert を加えれば green になる。`ADR-004` を参照するコメントを「Issue #42 で対応済」に書き換える。

## 設計判断

詳細は `.issue/42/adr.md` を参照。サマリーは以下の通り:

- ADR-001: `assertViewableBy` 改修 vs downloadMedia 事前 reject → domain service 改修を採用（access policy SSOT）
- ADR-002: `hasShareLink: boolean` vs `viaShareLinkId: ShareLinkId | null` → boolean を採用（YAGNI、domain 側で ID 自体を使わない）
- ADR-003: partial unique index vs 事前検証のみ → 両方採用（DB 制約 + usecase 検証の責務分離）
- ADR-004: `restoreNote` の slug 衝突対応 → `assertSlugUnique` にエラーコード引数を追加（既定値で後方互換維持）＋ `findByOwnerAndSlug` を active 限定化（呼び出し元は restoreNote のみで波及小、partial index と意味的に対称）
- ADR-005: DuplicateNote の error code → 既存 `AlreadyTrashed` 流用（YAGNI、`saveNote.ts` 同形）
- ADR-006: `searchOwnNotes` 側の integration test 追加は不要（search spec 表に既に網羅、unit test で keyword 委譲を検証済み）
- ADR-007: `findByOwnerAndSlug` のリネーム不要・JSDoc 明記のみ（全呼び出し元の意図と整合）

## リスクと注意点

- **partial unique index 適用時の既存データ衝突:** 現行スキーマでは (owner_id, slug) で active と trashed の共存が不可能なため、本番 D1 に重複データはない想定。ただし `pnpm wrangler d1 migrations apply` 時に念のため確認。
- **`assertViewableBy` シグネチャ変更:** 呼び出し元は `downloadMedia.ts` 1 箇所のみ（grep で確認済）。domain service の単体テストは引数追加に応じて修正必要。
- **テスト fixture 構築順序:** Step 2f は partial index migration 適用後でないと seed が UNIQUE 制約で失敗する。実装 → migration → fixture 構築 → assert の順で進める。
- **`SlugConflict` と `InvalidSlug` の使い分け:** `assertSlugUnique` は引き続き `InvalidSlug` を投げる（create / rename 経路）。`SlugConflict` は restoreNote 専用。JSDoc / コメントに明示する。
- **Issue スコープ厳守:** ADR-004 には他 14 件の乖離があるが、本 Issue は 4 件のみ。他は別 Issue（既に検討中）に委ねる。

## テスト方針

- **既存 `it.todo` 4 件を `it` 化** — 上記ステップ 5 の通り。
- **ユニットテスト追加** — `MediaService.assertViewableBy` の `hasShareLink` 引数追加に応じて domain 側 unit test を 1-2 件追加（unlisted + hasShareLink=false → throws、true → passes）。
- **追加 integration test** — partial index 回帰防止として「active + trashed 同 slug 共存可」のスキーマレベル確認は trashLifecycle のテスト fixture 構築で自然にカバーされるため新規ファイルは不要。
- **検証コマンド:** `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit && pnpm test:integration`

## 参考: エージェント比較

| 観点 | エージェント1 (アーキテクチャ) | エージェント2 (保守性) | エージェント3 (シンプルさ) |
|------|-------------------------------|------------------------|---------------------------|
| ベース採用 | × | △ | ○ |
| 取り込んだ点 | partial index + ドメイン検証併用の理由付け / シグネチャ拡張の SSOT 論拠 | restoreNote インライン化案 / 新規 `SlugConflict` 追加 / fixture 構築順序のリスク | 全体方針、`hasShareLink: boolean`、`AlreadyTrashed` 流用、spec L83 削除のみ |

3 エージェントとも:
- partial unique index の導入は必須と判断 — 一致
- `assertViewableBy` 改修方向 — 一致（引数の中身は分かれた）
- `restoreNote` 内インライン化方向 — エージェント2/3 一致、エージェント1案（assertSlugUnique 改修＋findByOwnerAndSlug を active 限定化）は他 usecase 波及のため不採用
- 新規 `SlugConflict` code 追加 — 一致
- DuplicateNote の status check 追加場所（usecase 層）— 一致（code 名は分かれた → 最小波及の `AlreadyTrashed` 流用）

## レビュー反映

### 修正した点

- **[P-001 / S-002 統合対応]** `findByOwnerAndSlug` を active 限定化（noteRepository.ts のクエリに `eq(notes.status, "active")` 追加 + ポート JSDoc 更新）。これにより partial index 化後の SQLite の非決定的挙動による衝突取りこぼし／getPublicNote のフレーキー化を回避。
- **[P-002 対応]** `getPublicNote.ts:73` で `findByOwnerAndSlug` を使っている公開ルートの regression を防止。`findByOwnerAndSlug` の active 限定化により意味的に正しく動作するようになるため、追加コード変更は不要だが ADR-004/007 で明示。
- **[P-003 対応]** ADR-004 の前提（「他 usecase 波及」）が事実誤認だったため書き直し。`assertSlugUnique` の呼び出し元は `restoreNote.ts:77` のみであり、シグネチャ拡張（任意引数 `code` 追加）で十分。インライン化案を撤回。
- **[S-001 対応]** ADR-006 を新設し「searchOwnNotes 側の integration test 追加を見送る」判断を ADR として明文化。
- **[S-003 対応 / testing.md]** 確認項目 3 の RestoreNote 手順を整理。partial index が active 同士の衝突は引き続き禁止することを明示。

### 取り込んだ改善提案

- **[S-002 / 0007 migration]** マイグレーション SQL に `CREATE UNIQUE INDEX IF NOT EXISTS` を加え、既存 migrations と冪等スタイルを揃える。ヘッダコメントで Manual migration と明記。
- **[S-004 / unit test 網羅]** `assertViewableBy` の `hasShareLink: boolean` は非 optional のまま（既定値なし）にすることで、既存テストすべてに引数渡しが TypeScript の型エラーで強制される。実装ステップ 1c のテスト追加時に必ず全 6 ケースを追従する。

### 見送った提案とその理由

- **[S-001 / generateUniqueSlug の整合性追補]** ADR-004 で `findByOwnerAndSlug` 自体を active 限定化したことで `generateUniqueSlug` も自動的に正しい挙動になる（trashed slug を新規 active で再利用可）。追加の改修は不要。
- **[S-003 / マイグレーション apply 時の重複データ検査 SQL]** testing.md エッジケース 1 に「pnpm db:migrate がエラーなく完了する」確認を入れているが、明示的な検査 SQL は本 Issue のスコープ外（運用手順は別途 docs/runtime_cloudflare.md に集約すべき）。Issue 起票候補としては検討するが本 PR には含めない。
