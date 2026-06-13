# Infrastructure / Adapter + Security レビュー — PR #691 (Issue #654)

対象: `listPublicTagNamesByOwner`（D1 アダプター新メソッド）と公開可視性 gate、件数上限、関連ユースケース／ローダー。

結論: **Blocker なし**。公開可視性 gate の JOIN は既存公開ノート取得経路と整合し、owner 条件・LIMIT・`limit<=0` ガード・バインド変数・エラー翻訳すべて妥当。`published_at NOT NULL` 条件の不在のみ Note として記録（既存 `searchPublicByNamePrefix`／`getPublicNote` と同じ規約で、現状の書き込みパス上リークは発生しない）。

## 公開 gate の1カラム突き合わせ

基準経路 = 公開ノート列挙の正典 `listUserPublicNotes`（usecase）＋ その下の publication アダプター
（`publicationStateRepository.findPublicByOwner` / `listPublicNoteIdsByOwnerSorted` / range 系）。

| gate 条件 | 正典の公開ノート経路 | 新 `listPublicTagNamesByOwner` | 一致 |
|---|---|---|---|
| `publication_states.visibility = 'public'` | あり（pub SQL） | あり（`eq(publicationStates.visibility,"public")` tagRepository.ts:312） | ✅ |
| `notes.status = 'active'` | あり（pub SQL `eq(notes.status,"active")` ＋ usecase 側 active 再フィルタ） | あり（`eq(notes.status,"active")` tagRepository.ts:305） | ✅ |
| owner scope | あり（`eq(publicationStates.ownerId, ownerId)`） | あり（`eq(notes.ownerId, ownerId)` tagRepository.ts:304） | ✅ |
| user が active（≠ deleted/suspended） | usecase 層 guard（listUserPublicNotes.ts:106-111） | usecase 層 guard（listUserPublicTags.ts:37-42）＋ loader が NotFound→notFound (UserPublicTop.tsx:94) | ✅ |
| `published_at IS NOT NULL` | **あり**（pub SQL の `isNotNull(publishedAt)` を全公開クエリに付与） | **なし** | ⚠️ N-001 |
| join 結合キー `publication_states.note_id = notes.id` | あり | あり（tagRepository.ts:311） | ✅ |

private / unlisted / trashed のタグ、別オーナーのタグ、deleted/suspended ユーザーのタグはいずれも漏れない
（visibility=public ＋ status=active ＋ notes.owner_id=ownerId ＋ usecase の user guard で多重に閉じている）。
owner scope を `notes.owner_id`（publication 側ではなく notes 側）に置いている点も、note_tags の FK が
owner を検証しないため正しい選択で、integration test「cross-owner public note」(tagRepository.integration.test.ts:840) が
この境界を明示的に検証している。

## Blockers

なし

## Warnings

なし

## Notes

### [N-001] `published_at IS NOT NULL` gate を持たない（既存規約に整合・現状リークなし）
- 場所: `app/core/adapters/d1/repositories/tagRepository.ts:308-314`（publication JOIN）
- 事実: 正典の公開ノート列挙（`publicationStateRepository.findPublicByOwner` ほか, publicationStateRepository.ts:209,258,315,363,396）は
  公開クエリに必ず `isNotNull(publication_states.published_at)` を付ける防御的 gate を持つが、本メソッドは
  雛形の `searchPublicByNamePrefix` 同様これを持たない。
- 評価: **現状リークしない**。`public ⇒ published_at != null` はドメイン不変条件ではない（不変条件は
  `private ⇒ published_at == null` のみ。publication/entity.ts:25,54）が、可視性遷移は全て
  `PublicationService.changeVisibilityAndCascade` → `changeVisibility`（entity.ts:70-76）を通り、`public` 遷移時は
  必ず `published_at = now` を刻む。直接 public+null を作る書き込みパスは存在しないため、実データ上
  public 行の published_at が null になることはない。単一公開ノート読み取り `getPublicNote`（getPublicNote.ts:122-126）も
  visibility のみで gate し published_at の null を許容しており、本メソッドはこの「visibility-only gate」系統と一貫している。
  list/sorted 経路が `isNotNull` を付けるのは ORDER BY published_at のための実務的理由（null 行が並びを乱す）も兼ねる。
- 提案: 機能上は不要だが、「公開 gate＝visibility+status の2条件」と「published_at は順序付け都合」という
  使い分けが暗黙なので、ポート JSDoc か SQL コメントに「published_at gate を意図的に外している（visibility-only 系統）」
  旨を一行残すと、将来 gate 変更時に list 系との取りこぼし差分を生まない。`searchPublicByNamePrefix` にも同じ注記が望ましい。
  （本 PR スコープ外の既存メソッドにも波及する論点のため Note 止まり。）

### [N-002] DISTINCT / ORDER BY / 性能は妥当
- `selectDistinct({ name: tags.name })`（表示名で distinct）＋ `orderBy(asc(tags.name))` は
  `searchPublicByNamePrefix` と同一作法。大文字小文字の畳み込みが表示名基準（"Cloud" と "cloud" は別行）になる点は
  既存と一致し、integration test（tagRepository.integration.test.ts:759-783）が binary collation 順
  （"Cloud" < "apple"）まで含めて固定している。
- インデックス: JOIN は `note_tags.tag_id`／`notes.id`(PK)／`publication_states.note_id` を辿る。
  notes.owner_id+status は `idx_notes_owner_status_updated`、publication 側は `idx_pubs_owner_visibility_published_at` が
  効きうる。母集合 cap=1000 ＋ 単一オーナー規模では N+1 もなく問題なし（ADR-002 と整合）。
- SQL インジェクション: 全条件が Drizzle の `eq()` バインド変数。prefix LIKE を除去したため
  `escapeLikePattern` も不要になっており、ユーザー入力を文字列連結する箇所は皆無。

### [N-003] 件数上限・ガード・エラー翻訳
- `if (limit <= 0) return []`（tagRepository.ts:289）を雛形どおり踏襲。`.limit(limit)` は distinct 行に適用され、
  integration test「applies the limit (cap)」(L863) と「limit<=0」(L881) が両方を検証。
  cap=1000 は `PUBLIC_TAG_MASTER_CAP`（listUserPublicTags.ts:14）でユースケース層が定数として渡す（ADR-002 準拠）。
- ドライバエラーは `mapDbError("Failed to list public tags by owner", ...)` でラップ（tagRepository.ts:288）。
  他メソッドと同一の翻訳契約で、driver-native エラーがアプリ層に漏れない。
- ポート追加で壊れる `FakeTagRepo` に空スタブを追加済み（service.test.ts:50）。typecheck グリーン維持。
- usecase re-export（publication/index.ts:19）・loader 並列ロード（UserPublicTop.tsx:122-134）・
  NotFound→notFound 変換（UserPublicTop.tsx:94）も siblings と整合。

## AC 検証結果

- **AC-3（公開 gate）**: 満たす。visibility=public ＋ status=active ＋ owner-scope の3重 gate で
  private/unlisted/trashed・別オーナー・cross-owner public note・deleted/suspended user を全て排除。
  integration test L785-861 が網羅。
- **AC-4（件数上限）**: 満たす。`PUBLIC_TAG_MASTER_CAP=1000` → ポート `limit` → SQL `LIMIT`。
  `limit<=0` 早期 return ガードあり。integration test L863-893 が検証。
