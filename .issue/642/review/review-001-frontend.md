# PR #674 レビュー — Issue #642 公開検索ソート選択肢

レビュー観点: Frontend（React 19 / TanStack Start / Tailwind）
対象: `app/components/public/SearchSortToggle.tsx`, `PublicSearch.tsx`, `styles.ts`, `app/routes/search.tsx`, `spec/design/pages/P32-public-search.html` ほか

### Frontend

#### Blockers

なし

#### Warnings

- **[W-001]** ソートトグルに押下中のフィードバックがなく、連打時の挙動も直感に反する / 場所: `app/components/public/SearchSortToggle.tsx:118-147` / 理由: `useTransition` の `isPending` を破棄しており（`const [, startTransition]`）、`useOptimistic` も使っていない。ラベルは loader ラウンドトリップ（D1 + RSC 再レンダー）が完了して URL が確定するまで一切変化しないため、レイテンシ下ではクリックしても無反応に見える。同ファミリーの `SearchFilterDrawer.tsx:135-137` は同じ理由で `useOptimistic`（FilterBar precedent, `.issue/354/adr.md` ADR-003）を採用しており、本コンポーネントだけパターンから逸脱している。さらに `next` が確定済み prop `sort` から導出されるため、ナビゲーション commit 前に2回クリックすると両方が同じ `sort=newest` へ navigate し、「2回押したら元に戻る」というトグルの期待に反する（結果は newest に固定）。/ 提案: `SearchFilterDrawer` と同型に `useOptimistic(sort)` でラベルを即時反映し、`next` は optimistic 値から導出する。最低限でも `isPending` を拾って `data-pending` + `aria-busy` 等の視覚フィードバックを付けるか、pending 中は `disabled` にする。

#### Notes

- **[N-001]** 受け入れ基準は満たしている。AC-2/3（`sort` の URL 保持・usecase 伝播）、AC-5（`nextSearch.cursor = undefined` でのリセット、`SearchSortToggle.tsx:138`）、AC-7（省略時 relevance、`sort=relevance` を URL に書かずに除去するクリーンな扱い）をコードで確認。「次のページ」リンク（`PublicSearch.tsx:265`）とキーワード再送フォームの hidden input（`PublicSearch.tsx:162-164`）への `sort` 伝播も `period` と対称で漏れなし。
- **[N-002]** AC-4（モック整合）OK。`SEARCH_SORT_BTN`（h-9/px-3/rounded-pill/text-[13px]/text-ink-secondary/gap-1/hover:bg-surface hover:text-ink/max-sm:h-11）はモック `.sort-btn`（36px/12px/pill/13px/gap4/hover surface/モバイル44px）と1:1で一致し、`ChevronDown` の `size-[11px]` もモック svg 11px と一致。モック側の復元も a91f73fe 以前の定義と完全一致することを確認（差分なし）。P31 ツールバーの既存 `SORT_BTN` との名前衝突を `SEARCH_SORT_BTN` で回避しコメントで明示している点も良い。
- **[N-003]** transport 境界は規約どおり。`searchSchema` は `z.enum(SEARCH_SORTS).optional().catch(undefined)`（URL の手打ちノイズを黙殺）、`renderInputSchema` は `.catch` なし（server fn 入力は厳格）で、plan のリスク項目「`period` の轍」を正しく回避している（`app/routes/search.tsx:666,674`）。loader の `...(deps.sort !== undefined ? { sort: deps.sort } : {})` も `exactOptionalPropertyTypes` 下で正しい。
- **[N-004]** a11y は概ね良好。ネイティブ `<button type="button">`、`aria-label="並び替え: {現在}（{次}に切り替え）"` は可視テキストを含むため label-in-name 違反なし、chevron は `aria-hidden`、グローバル `:focus-visible` リング（`app/styles/index.css:174`）が pill 形状に `border-radius: inherit` で追従する。モバイル 44px タップターゲットも確保。なお W-001 を optimistic 化する場合、状態変化の通知は可視ラベル変更で足りる（`aria-live` までは不要）という現行の割り切りで妥当。
- **[N-005]** RSC 境界の扱いが正しい。`PublicSearch`（RSC）から client component へはシリアライズ可能な `SearchSort | null` のみを渡し、`SearchSort` の import は type-only なのでドメインコードがクライアントバンドルに混入しない。`SearchFilterDrawer` が `route.useSearch` で読むのに対し本コンポーネントは prop 受けだが、どちらも URL を単一の真実とする設計に収まっており許容（揃えるなら `useSearch` 化も可）。
- **[N-006]** ドメイン〜アダプターも先行例（`DateBasis`）と同型で一貫。`buildOrderBy` が `updated_at`（ISO8601 文字列）の辞書順 DESC = 逆時系列である根拠と `note_id` tie-breaker をコメントで残しているのは良い。integration テストは MATCH/LIKE 両経路・tie-breaker・newest ページネーション連続性・default 回帰までカバーし plan のテスト方針と一致。
- **[N-007]** spec 3点（pages/domains/usecases）の同期、`period`（公開日基準）×新着順（更新日時基準）併用挙動の明記まで plan のステップ8どおりで AC-1 充足。
