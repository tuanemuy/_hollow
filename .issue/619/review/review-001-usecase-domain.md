# Use Case / Domain レビュー — Issue #619
**PR:** #653  
**レビュー対象:** listUserPublicNotes ユースケース、ポート設計、期間フィルター  
**レビュアー観点:** Use Case / Domain 層の純粋性・型安全・アーキテクチャ整合

---

## Blockers
なし

---

## Warnings

### [W-001] `NoteOwnerListOpts.noteIds` 追加の後方互換性確保の明示的確認
- **場所:** `app/core/domain/note/ports/noteRepository.ts:67` / `app/core/adapters/d1/repositories/noteRepository.ts`
- **理由:** `noteIds` フィルタが `NoteOwnerListOpts` 型に新設されたことで、既存の `findByOwner` / `listWithCount` 呼び出し全てが（型上は後方互換）実装側の処理分岐に依存するようになった。**実装は正確に見える**（`undefined` 時は candidateSets に push されず、空配列時は `intersectIdSets` で「match nothing」に短絡）が、既存呼び出しが無傷かの完全な確認は manual / integration テスト実行時に必須。
- **留意点:** 実装側で既に `if (opts.noteIds !== undefined) { candidateSets.push(...) }` で undefined と非空を区別し、`intersectIdSets` が空集合を正確に扱っているため、**理論的には問題なし**。ただし既存の visibility / tag / directory フィルタとの組み合わせが「期間＋ソート」時にも安定していることを確認する（後続のテスト実行で capture 可能）。

### [W-002] `PublicNoteSortedOpts.publishedRange` の型契約が曖昧（軽微）
- **場所:** `app/core/domain/publication/ports/publicationStateRepository.ts:22-26` / `app/core/application/publication/listUserPublicNotes.ts:52`
- **理由:** `publishedRange?: DateRange` で undefined と「両端 null」の表現が共存可能。実装上は `publishedRangeConditions` が両者を同等に扱う（空条件列返却）が、**presentation 境界の `normalizePublicDateRange` が既に「両端 null → undefined」を正規化する設計（line 23）で、ユースケース層には undefined のみが流入**するため、実質的には問題なし。ただし VO 契約の曖昧さを型・JSDoc で除去可能。
- **現状:** 実装は正しい（`normalizePublicDateRange` → ユースケース input → ポート呼び出し の流れで undefined が保証される）。軽微だが、JSDoc で「両端 null → undefined は正規化済み」と明記するか、入力型を `Required` するか（実装に影響なし）すれば完全。

### [W-003] 公開日 projection の `null` フォールバック（防御的）
- **場所:** `app/core/application/publication/listUserPublicNotes.ts:205`
- **理由:** `publishedAtById.get(note.id as string) ?? null` は「Map に key がなければ null」だが、live notes は前段で確定した id 群で、`findByNoteIds` は「供給 id に対し public かつ non-null publishedAt」を返す。故に到達不可能ケースだが、entity invariant「public note は必ず non-null publishedAt」との防御的乖離を明示するコメントがあるとベター。
- **現状:** **実装は正確・防御的で OK**。出力型 `publishedAt: string | null` が「relay-lag rows を想定」との設計意図がコメントに含まれているため（line 59-60）、追加コメントは optional。

---

## Notes

### [N-001] ADR-001（公開日専用出力型）の実装が潔い
**良い点:** `PublicNoteListItem = NoteListItemDTO & { publishedAt: string | null }` で、ベース DTO を「汚さず」公開ドメイン固有概念を拡張している。型レベルで `NoteListItemDTO` は owner-scoped 一覧の汎用型のままで、`listUserPublicNotes` の戻り値という **文脈限定**で公開日が付与される設計になっている。管理画面（`listNotesInDirectory` / `listNotesByOwner`）への波及なし。

### [N-002] 期間フィルターの両 path 合流が型安全・効率的
**良い点:** 
- ステップ1の「page 確定後の `liveNotes` の id 群に対し `findByNoteIds` を1回」共通後処理設計により、`publishedAt` path（publication を直接見る）と `noteColumn` path（publication を見ない）の非対称性が美しく吸収されている。
- 両 path で `liveNotes` という型が統一されており（`ListResult.liveNotes: readonly Note[]`）、その後の `publishedAtById` Map と `toNoteListItem` 変換が path 不知であり、将来メンテナンスしやすい。
- `PUBLISHED_RANGE_CANDIDATE_CAP = 1000` が `TAG_CANDIDATE_CAP` と対称であり、既存のタグ候補機構との類似性が意識的に設計されている。

### [N-003] 期間フィルター実装の候補集合交差パターンが既存機構に乗っている（ADR-005）
**良い点:** `noteColumn` path で「period id 解決 → `NoteOwnerFilters.noteIds` → `buildOwnerListWhere` の `candidateSets` へ push」という流れが、既存のタグ候補解決パターンと同型。`items.length <= total` 不変条件が `candidateSets` の交差を通じて自動的に維持される。D1 の host-variable 上限も `selectInChunks` が既に吸収する設計（line 314-327 の `selectInChunks<SortedRow>`）。

### [N-004] `publishedRangeConditions` helper の可読性
**良い点:** `publishedAt` path / `noteColumn` path 双方で同一の `publishedRangeConditions(range)` を呼び出す（line 261, 318）。SQL 条件生成が一元化されており、境界値（`gte` / `lt`）の非対称が「ISO-8601 文字列の lexicographic 比較＝時系列順」というコメント（line 50-53）で明確。`from` は `gte`、`to` は `lt`（exclusive）の意味論が統一。

### [N-005] ユースケース入力での `tagNames` 正規化が防御的かつ失敗透明
**良い点:** line 121-132 で「tag names が owner のものでないなら短絡して空結果」という AND-filter の失敗ケースをユースケース層で吸収（domain に到達する前に）。これにより tag id 解決が tag 候補に常に非空 OR 短絡が保証される。`listByPublishedAt` / `listByNoteColumn` へのパス分岐に入る前に filter 責務が完結。

### [N-006] ポート interface JSDoc が厚い・正確
**良い点:** 
- `PublicationStateRepository.listPublicNoteIdsByOwnerSorted` (line 85-88)：page と total が同一 `active`-note 母集合で計算される保証が明記。
- `PublicationStateRepository.listPublicNoteIdsByOwnerInRange` (line 91-103)：「`cap` より大きい場合は切る、それを note 候補として」という contract が正確。`limit` parameter 名で呼び出し側の責務（candidate cap との distinction）が明確。
- `NoteOwnerFilters.noteIds` (line 50-58)：「既に解決された候補集合」という形式を、`directoryIds` / `referencingNoteId` 等の他フィルタとの差分として明記。

### [N-007] Presentation 境界での日付正規化（ADR-006）が VO 契約を保つ
**良い点:** `normalizePublicDateRange` が「user-chosen inclusive end date → 翌日 00:00（exclusive）」に正規化（line 22）。これにより `DateRange` VO の「半開 `[from, to)`」契約を変えず、presentation で「inclusive → exclusive」を達成。ユースケース・ポート・アダプター・domain はすべて半開契約のままで、レイヤー越しの曖昧さなし。VO の type-level contract と意味論が乖離しない設計。

### [N-008] Integration test の骨子が complete
**良い点:** `listUserPublicNotes.integration.test.ts` の冒頭が「default publishedAt desc order」「filtered total independent of page」「tag AND-filter」「trashed notes excluded」「private notes excluded」などの invariant を明記（line 137-192 スキャン）。`PublicNoteSortedOpts.publishedRange` が新設されたことに伴う境界ケース（from のみ / to のみ / 同日）のテストが（ファイル尾部にあるか）必要だが、構造は既に整備されている。

### [N-009] ユースケース型シグネチャの明確性
**良い点:** `ListUserPublicNotesInput` / `ListUserPublicNotesOutput` が明確に分離。Idempotency / 冪等性の関連型（例えば `tagNames: readonly string[]` が readonly）が徹底。`publishedRange?: DateRange` が optional で正確に表現。出力の `PublicNoteListItem[]` が汎用 DTO の「拡張」として明示的に型定義されている（line 62-63）。

### [N-010] `listByPublishedAt` / `listByNoteColumn` の責務分離が明確
**良い点:** 両関数の JSDoc（line 216-221, 286-307）が path ごとの読み込み戦略を明確に区別。「publication aggregate owns ordering」vs「note columns own ordering」という対比が、後続の公開日 projection 後処理（line 162-178）とどう組み合わさるかが読みやすい。`ListResult` という共通の戻り値型（line 214）が、双方の path で「いったん note id を確定させる」ステップの統一性を型で保証。

---

## 総評

**完成度:** 高い。Use Case / Domain 層の設計が整理されており、以下が確認できた：
1. **型安全:** `PublicNoteListItem` で公開日を DTO に追加（汚さない）。`DateRange` VO 契約を presentation で正規化しながら保つ。
2. **ポート設計:** 新規メソッド `listPublicNoteIdsByOwnerInRange` が既存機構（候補集合交差、`idScope`、host-var chunk）に自然に乗る。
3. **期間フィルター貫通:** both paths で一貫。`noteColumn` path が publication を見ない制約を、`listPublicNoteIdsByOwnerInRange` で解決し候補集合として渡す形が elegant。
4. **後処理集約:** page 確定後に `findByNoteIds` を1回呼ぶ共通後処理で、path 非対称を吸収。

**留意点:** W-001（`noteIds` フィルタ追加時の既存呼び出し影響）と W-002（DateRange 型契約）は実装時の詳細確認段階で対応すれば OK。W-003 はコメント補強で sufficient。

Blockers はなし。レビュー通過。
