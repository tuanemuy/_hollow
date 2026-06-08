# PR Review #001 — feat: 領域5(P30/P31/P32)モックの未追従機能 (#568)

**PR:** #604
**Date:** 2026-06-09
**Round:** 1回目

---

## Summary

- Blockers: 2
- Warnings: 7（修正対象）+ 2（progress.md 記録）
- Notes: 多数
- Verdict: **BLOCKED**

5レイヤー並列レビュー（Domain&UseCase / Adapter&SQL / Frontend&a11y / Test / Security&Performance）。

---

## Blockers

### [B-001] 公開ユーザーサジェストが trashed 済み公開ノートしか持たない著者を露出しうる（列挙の過渡的漏洩）

- 場所: `app/core/adapters/d1/repositories/userRepository.ts`（`searchPublicByUsernamePrefix` の EXISTS）
- 理由: EXISTS が `publication_states.visibility='public'` のみで `notes.status='active'` を結合していない。同 PR のタグサジェスト（`tagRepository.ts`）は `notes(status='active')` を INNER JOIN しており**非対称**。ノートを trash しても `publication_states` 行は残り、`note.trashed` → 非公開化は outbox 経由の非同期（at-least-once・順序なし）。コミット〜リレー処理の窓で「公開ノートが実体 0 件（全 trashed）」の著者がサジェストに漏れ、未認証クライアントに存在を推測させる。`getPublicNote`/`listRelatedPublicNotes` は note active を再チェックするのにサジェストだけ穴。
- 提案: EXISTS を active ノートに結合（`JOIN notes n ON n.id=ps.note_id WHERE ... AND n.status='active'`）。`userRepository.integration.test.ts` に「公開 state だが note は trashed の著者は除外」ケースを追加。
- 検出: Domain&UseCase W-001 / Test W-001 / Security B-001 の3者一致。

### [B-002] 未認証の `tags` 配列に長さ上限がなく検索+ファセット集計を増幅できる（DoS）

- 場所: `app/routes/search.tsx`（`z.array(z.string().min(1).max(64))` に `.max(N)` なし）、増幅先 `app/core/adapters/d1/searchIndex.ts`（タグごと `LIKE '%"<tag>"%'`）、`app/core/domain/search/valueObject.ts`（`SearchQuery.create` 配列長キャップなし）。`app/routes/u/$username/index.tsx` の `tags` も同様（`listUserPublicNotes` がタグごと `findByOwnerAndName` を `Promise.all`）。
- 理由: `/search?q=foo&tags=...`（数百件）を未認証で投げると各 tag が全走査 LIKE 句になり、`searchPublicNotes`(1) + `countPublicSearchFacets`(4 期間) の計5クエリに同じ N 句が乗る（4倍超増幅）。要素長 64 は抑えてるが要素数無制限。main には `tags` が無く本 PR で初めて未認証面に露出した新規攻撃面。
- 提案: route の `validateSearch`/`renderInputSchema` の `tags` に `.max(8)`（P30 chip 上限と整合）クランプ。多層防御で `SearchQuery.create` でも `tagNames` をスライス。`/u/$username` 側も同様。

---

## Warnings（修正対象）

### [W-FE-001] lucide アイコンを Icon ラッパ非経由でリテラル px 直書き（CLAUDE.md「新規リテラル px 禁止」+ Icon 契約に抵触）
- 場所: `SearchFilterDrawer.tsx`（194,219,232,245,289,381,490 付近）/ `PublicTopControls.tsx`（173,198-203,213-217 付近）。`size-[11px]`/`[13px]`/`[14px]`/`[18px]` + `strokeWidth={1.8/2/2.2}`。
- 理由: コードベース唯一の Icon ラッパ迂回。`Icon.tsx` は size を 16|20|24 に型制限・stroke 1.5 固定・`w-*/h-*` 禁止を規定し全49箇所が準拠。
- 提案: Icon ラッパの最寄りサイズへ寄せて px を消す。dense レイアウトで真に sub-16px が要る箇所のみアイコン寸法トークンを `tokens.css`（+ `@theme inline` + `tokens.md`）に追加して `var()` 参照。いずれの場合も新規リテラル px を残さない。採った方針を ADR に記録。`PublicNoteDetail` の手描き `<svg>`（lucide に無い形状）は既存 `ShareLinkGate` パターンと同類で許容。

### [W-FE-002] ドロワーに focus trap がなく `aria-modal="true"` 宣言と DOM 実態が不一致
- 場所: `SearchFilterDrawer.tsx`（panel の `role="dialog" aria-modal="true"`、open 中の背後不活性化が無い）
- 理由: 開いている間に背後ページを不活性化していないため Tab で背後へ脱出できる。`aria-modal` の約束に反し、キーボード/SR 利用者がモーダル外へ抜ける。
- 提案: open 中は背後コンテナに `inert` を当てる、またはドロワー内で Tab/Shift+Tab をループする最小 focus trap。combobox 矢印移動未実装は残課題として progress.md に明記済みでよい。

### [W-FE-003] 検索フォーム再送信で tags/period が失われる（username だけ hidden で保持＝非対称）
- 場所: `PublicSearch.tsx`（ヒーロー検索フォーム、`username` のみ hidden）
- 理由: ネイティブ GET 送信で `q`(+`username`) だけ再構築され `tags`/`period`/`cursor`/`limit` が消える。`username` だけ残るのは一貫しない。
- 提案: フィルタ保持なら `tags`/`period` も hidden で載せて統一。仕様意図に合わせて対称化。

### [W-SEC-001] 公開バックリンクが limit なしで全参照元をハイドレート
- 場所: `app/core/application/publication/listPublicBacklinks.ts`（`findReferrers(noteId)` を opts なしで呼ぶ）
- 理由: 公開判定で絞る前に全参照元を `contentHtml`+`loadChildren` 付きでフルハイドレート。人気公開ノートで未認証アクセスのたびに重い materialization。悪意ある著者が大量自己参照で増幅可能。
- 提案: `findReferrers` に limit/offset を渡す（モック表示分 + α、例 20 程度）。

### [W-TEST-002] user LIKE ワイルドカードエスケープが未検証
- 場所: `app/core/adapters/d1/__tests__/userRepository.integration.test.ts`
- 理由: tag 側は `"50%"` リテラル一致でエスケープ固定済みだが user 側に `%`/`_` 含むケースがない。エスケープが将来外れても赤くならない。
- 提案: username に `%`/`_` を含む行を seed しリテラル一致を固定。

### [N-TEST-002→要対応] countPublicSearchFacets の username/NotFound 経路が未テスト
- 場所: `countPublicSearchFacets.integration.test.ts`（`{keyword}` と空 keyword の2本のみ）
- 提案: `username` 指定時の owner 解決・存在しない username での `NotFoundError` の代表1本を追加。

### [W-SEC-002 / FE 関連] facet 件数と listing の tag-AND 整合に関するコメントが実装とズレている疑い
- 場所: `PublicSearch.tsx`（resultsCount の facet 優先採用コメント）
- 理由: コメントは「facet は tag-AND を厳密反映しない」とするが `countPublicSearchFacets` は `tagNames` を `SearchQuery` に渡しており実際は AND が効くはず。コメントが誤解を招く。
- 提案: 実挙動を確認し、コメント/progress.md の results-count 記述を実態に合わせて修正。

---

## Warnings（progress.md に記録・段階的着地）

### [W-ADP-001] `LOWER(username) LIKE` がインデックス非効率（全表走査）
- `uniq_users_username` は素の `username` 列で、`LOWER()` 式はプレフィックススキャンに使えない。`tags.name_normalized` のような正規化列/式インデックスが user 側に無い。現規模では実害小。式インデックス or `username_normalized` 列導入を後続 Issue 候補として記録。

### [W-ADP-002] 期間ファセットの相関語が `date_for_calendar` で「公開日」と意味がずれうる
- facet 窓は `sd.date_for_calendar` 基準で publication の `published_at` ではない。ADR-008 の sort 暫定対応と同じく「公開日厳密でない」制約として記録。SQL 自体（ISO8601 辞書順=時系列順）は正しい。

---

## Notes（対応不要・確認済み）

- [N] `listPublicBacklinks` の参照元 owner-live 未チェックは安全（`findReferrers` が owner スコープ内のみ解決、ターゲット owner は live 確認済み）。
- [N] `listRelatedPublicNotes` の `byOwnerId` 経路は呼び出し元が live 済み owner.id を渡す前提（ADR-007）。JSDoc に前提を明記すると安全側（軽微対応）。
- [N] LIKE エスケープ（全3メソッド `escapeLikePattern` + `ESCAPE '\\'`）・NotFound 正規化・ディレクトリ非露出（ADR-006）は適切。
- [N] stub adapter 二重実装不要は正しく守られている。
- [N] テスト戦略遵守（fake 新設なし・real-DB integration）。回帰固定テストは新契約を固定（旧実装に対しては未実行＝単一スカッシュのため）だが新契約固定として良質。

---

## Design Decisions

- B-001 / W-FE-001 の対応で新たな設計判断（active JOIN の対称化方針、アイコン寸法のトークン化 or 逸脱記録）が生じるため adr.md に追記する。
