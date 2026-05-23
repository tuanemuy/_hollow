# PR Review #003 — perf(notes): 2-pass findByOwner chunk path
**PR:** #175
**Date:** 2026-05-23
**Round:** 1回目
**Perspective:** Performance

## Summary
- Blockers: 0
- Warnings: 2
- Notes: 4
- Verdict: APPROVED

ADR-001 の 2-pass 戦略は `idScope.size × NoteRow` → `idScope.size × ~150B + limit × NoteRow` というメモリ削減プロファイルを的確に達成しており、Workers 128MB ヒープ制限超過の根因（`contentHtml` 10-50KB/行の全 idScope マテリアライズ）を解消する。caller 側 limit（最大 500: `DELETE_NOTE_PAGE_SIZE` / `MERGE_NOTE_PAGE_SIZE` / `RENAME_NOTE_PAGE_SIZE`、200: `handleUserDeletedEvent.PAGE_LIMIT`、50: `REBUILD_PAGE_SIZE`、UI: `listNotesByOwner.input.limit`）は全て `SAFE_CHUNK_SIZE = 90` を超える可能性があり、Pass 2 を `selectInChunks` でラップする判断は妥当。Pass 2 の `where` 再適用省略、`Map<id, NoteRow>` の order 復元、`Promise.all` 並列も Performance 観点で最適点に近い。Blocker なし。

## Blockers

なし

## Warnings

- **[P-W-001]** Pass 1 projection に `title` が常時含まれており、`sort='updatedAt' | 'createdAt'`（実運用の典型ケース）では不要なバイト転送が発生する
  - **場所:** `app/core/adapters/d1/repositories/noteRepository.ts:432-437`
  - **詳細:** Pass 1 は `{ id, updatedAt, createdAt, title }` を常に projection する。`title` の DB 上限は実質数百バイト級だが、`idScope.size = 5000` のオーナーでは `5000 × (title 平均 ~100B) = ~500KB` の追加転送 + `Buffer→string` decode コストが乗る。`sortCol` が `title` のときだけ `title` を含める動的 projection（あるいは 3 経路への分岐展開）にすれば、典型ケースの転送量は `5000 × {id (40B) + updatedAt (24B) + createdAt (24B)} = 440KB` から `320KB` 程度に削減でき、JS 側 sort 時の string compare ペナルティ（`title` を比較する分岐に流れ込まないなら不要）も消える
  - **ADR 整合性:** ADR-001 §Consequences の `5000 × 64B = 320KB` という数値ガードは「id + 1 つの sort col」前提だが、実装は 3 sort col 全てを射影するため実測 `5000 × ~150B = 750KB`。係数 2.3 倍ズレている。functional には問題ないが ADR の数値根拠を実装が満たしていない
  - **代替案:** `pickSortColumn` の switch を Pass 1 builder に拡張して 3 分岐展開（plan.md §実装ステップ 2.1 で「typecheck が緩む場合は」と既に想定されている経路）、あるいは Pass 1 builder を `sortCol` ごとに closure 化する。`sortNoteRowsBy` の generic 制約を `T extends { id: string } & Record<SortColumn, string>` から `T extends { id: string; [K in SortColumn]: string | undefined }` に緩めれば、欠落 col を `undefined` で持つことも許容できる（comparator 側は actual sortCol しか読まないので動作変わらず）
  - **重大度:** 主目的（heap OOM 解消）は達成済みで、削減ぶんは数百 KB / 1.4 倍程度。Blocker ではないが ADR の数値整合のため記録

- **[P-W-002]** Pass 1 sort のオーバーヘッドが page サイズ 500 ケースで顕在化しうる（`idScope.size` の入力サイズに対する `O(N log N)` JS sort）
  - **場所:** `app/core/adapters/d1/repositories/noteRepository.ts:441`
  - **詳細:** `sortNoteRowsBy` は `[...rows].sort(...)` で `idScope.size` 件をフル sort する。`limit = 500`, `idScope.size = 5000` のとき、`O(N log N) = 5000 × log(5000) ≈ 60000` の比較。tag delete / merge / rename の page loop は同じ owner に対して何ページも繰り返すため、累積 sort コストは `pages × idScope.size × log(idScope.size)`。partial-sort（top-k 限定 selection、`offset + limit` だけ確定すれば足りる）で `O(N log k)` に落とせる余地はあるが、JS 標準に partial sort はなく、heap ベース実装の追加は割に合わない可能性が高い
  - **代替案:** 当面は `slice(offset, offset+limit)` 後のサイズ削減を維持しつつ、partial-sort は Follow-up で検討（適切な heap 実装を導入できるなら `O(N log k)` で削れる）。あるいは `idScope.size` が極端に大きいオーナーに対する追加ガード（例: `idScope.size > 50000` で警告ログ）も別 Issue として検討余地あり
  - **重大度:** メモリ削減目標は達成済みで、CPU レイテンシは `Promise.all` 並列の DB I/O ラウンドトリップ（数百 ms クラス）が支配的。sort 自体は数 ms オーダー。Blocker ではない

## Notes

- **[P-N-001]** I/O 増加コストの D1 課金影響は許容範囲
  - **場所:** `app/core/adapters/d1/repositories/noteRepository.ts:430-453`
  - **詳細:** Pass 1 chunk 数 = `ceil(idScope.size / 90)`、Pass 2 chunk 数 = `ceil(limit / 90)`。`idScope.size = 5000, limit = 500` で Pass 1 = 56 chunks、Pass 2 = 6 chunks（合計 62 queries / 旧 56 queries）。`Promise.all` 並列なので累積レイテンシは Pass 1 と Pass 2 の 2 ラウンドトリップに集約（旧 1 → 新 2、~+1RT）。D1 課金は per-query なので 62/56 = 1.1 倍だが、heap OOM で 0 件返るより遥かにマシ。ADR-001 §Consequences の見立て通り
- **[P-N-002]** Pass 2 で `where` 再適用を省略する race window 評価
  - **場所:** `app/core/adapters/d1/repositories/noteRepository.ts:448-452` および ADR-001 §補足
  - **詳細:** Pass 1 → Pass 2 間で並行 `update`（`status: active → trashed` など）が走ると、Pass 2 で `where` 述語を満たさない row も hydrate される可能性がある。ADR は「DB 側 LIMIT/OFFSET 経路でも同じ race（read committed 単発トランザクション）」と説明しているが、厳密には DB 側経路は単一クエリ内のスナップショット読み取りで race window がより短い。2-pass では Pass 1 と Pass 2 が 2 つの独立クエリなので、SQLite の `BEGIN ... COMMIT` 内ですらない（drizzle の `.run()` ごとに別 statement）。実害は「trashed に変わった note が active 結果に 1 件混じる」程度で UI/usecase は `Note.status` を見て後段で弾けるが、`listNotesByOwner` の DTO 投影で `status` が露出していない場合は注意。本 Issue の責務外（既存 chunk 経路でも本質的に同じ性質）だが、race window が「単一クエリ内 → 2 クエリ間」に広がる事実は ADR 補足に明記する価値がある
- **[P-N-003]** `Map<id, NoteRow>` の order 復元コストは無視できる
  - **場所:** `app/core/adapters/d1/repositories/noteRepository.ts:461-467`
  - **詳細:** `page = 500` でも `Map.set` 500 回 + `pageIds.map → byId.get` 500 回で `O(N)`。`byId.get(id) === undefined` の skip 分岐も同じく `O(N)`。sort 後の `slice` で確定した `pageIds.length ≤ limit` がそのまま `Map` の上限なので、`limit = 500` で `Map` のメモリは ~500 entries × pointer サイズ ≈ 数 KB。実害なし
- **[P-N-004]** `findReferrers` のメモリ展開は本 PR 範囲外で同じ問題が残る（Issue スコープと整合）
  - **場所:** `app/core/adapters/d1/repositories/noteRepository.ts:718` 付近の `selectInChunks(Array.from(idScope), (chunk) => this.db.select().from(notes).where(...))` 経路
  - **詳細:** `findReferrers` は backlink 件数の現実的上限が低い前提で 2-pass 化が見送られている（ADR-001 §Follow-up に明記）。本 PR では `sortNoteRowsBy` の generic 化により `findReferrers` 側は型変更なく動作することを確認済み（行 960 のコメント通り `T = NoteRow` で推論）。Follow-up Issue として残すのは妥当
  - **`countByOwner` への影響なし:** 本 PR が `countByOwner` に変更を加えていないことを diff で確認（chunk 経路は既に `count()` 集計済み、review-001.md P-W-003 で対応済み）

## Verdict

**APPROVED**

主目的（chunk 経路のメモリ削減）は数値ガード通り達成。Pass 2 chunk が `SAFE_CHUNK_SIZE = 90` 超で必須である根拠（caller limit 上限 500）は ADR §補足とコードで整合。Promise.all 並列で累積レイテンシは +1RT に留まり、D1 課金 1.1 倍は許容範囲。`Map<id, NoteRow>` の `O(N)` order 復元も page = 500 で問題なし。

P-W-001（Pass 1 で `title` を常時含めることで ADR 数値ガードが ~2.3 倍ズレている）は Follow-up での改善余地。P-W-002（Pass 1 sort の `O(N log N)`）は当面 I/O 支配で実害なし。Blocker なし。
