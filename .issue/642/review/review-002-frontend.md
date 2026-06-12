# PR #674 レビュー（2回目・ゼロベース）— Issue #642 公開検索ソート選択肢

レビュー観点: Frontend（React 19 / TanStack Start / Tailwind）
対象: `app/components/public/SearchSortToggle.tsx`, `PublicSearch.tsx`, `styles.ts`, `app/routes/search.tsx`, `__tests__/reduceSortSearch.test.ts`, `spec/design/pages/P32-public-search.html` ほか

### Frontend

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001] 前回 W-001 の解消を確認（useOptimistic 化）** / `app/components/public/SearchSortToggle.tsx:46-87`。`useOptimistic(confirmed)` でラベルを即時反映し、`isPending` を `aria-busy` / `data-pending` に反映、`next` を optimistic 値 `current` から導出している。これにより loader ラウンドトリップ中の2回目クリックは `relevance` へ正しくトグルし（reducer は `sort` を絶対値で書くため最後のクリックが必ず勝つ）、「連打で同じ値を再送する」前回の問題は解消。`router.navigate` を `await` してトランジションを navigation commit まで張る点・失敗時に optimistic が confirmed へ巻き戻る点も `SearchFilterDrawer`（FilterBar precedent, `.issue/354/adr.md` ADR-003）と同型で正しい。
- **[N-002] `data-pending` に対応する視覚スタイルは未定義** / `SearchSortToggle.tsx:81` + `styles.ts` の `SEARCH_SORT_BTN`。属性は CLAUDE.md の `data-x={value || undefined}` 規約どおりに出ているが、`data-[pending]:` バリアントを使うユーティリティがないため現状は純粋なフック（テスト・デバッグ用）に留まる。主たるフィードバックは optimistic ラベル変化で担保されているので必須ではないが、付けるなら `data-[pending]:opacity-60` 等を `SEARCH_SORT_BTN` に足すだけで済む。ブロッカーでも警告でもない。
- **[N-003] URL 状態管理は正しい**。`reduceSortSearch` は pure・非破壊（テストで証明済み、`__tests__/reduceSortSearch.test.ts`）。ソート切替で `cursor: undefined`（AC-5 / 並び替え後の offset cursor 無効化）、`relevance` で `sort: undefined`（URL から除去・`sort=relevance` を書かないクリーンな扱い、AC-7）。`q`/`username`/`tags`/`period`/`limit` のパススルーもテスト済み。「次のページ」リンク（`PublicSearch.tsx:265`）とキーワード再送フォームの hidden input（`PublicSearch.tsx:161-163`）への `sort` 伝播は `period` と完全対称で漏れなし。
- **[N-004] transport 境界は規約準拠** / `app/routes/search.tsx`。URL 側 `searchSchema` は `z.enum(SEARCH_SORTS).optional().catch(undefined)`（手打ち不正値は黙って除去 — マニュアルテスト EDGE-1 で `sort=oldest` が正規化されることを確認済み）、server fn 側 `renderInputSchema` は `.catch` なしで厳格。`loaderDeps` 経由の `...(deps.sort !== undefined ? { sort: deps.sort } : {})` も `exactOptionalPropertyTypes` 下で正しい。`serverData` に未検証外部入力を流さない規約も守られている（loader で検証済みの値のみ）。
- **[N-005] スタイリング規約準拠**。`SEARCH_SORT_BTN` は `styles.ts` へのモジュールスコープ定数ホイスト（規約どおり）、ユーティリティのみで新規 CSS なし。モック `.sort-btn`（36px/pill/13px/ink-2/gap4/hover surface+ink/`--transition-bg`/モバイル44px）と `h-9 px-3 rounded-pill text-[13px] text-ink-secondary gap-1 transition-colors hover:bg-surface hover:text-ink max-sm:h-11` が1:1対応し、`motion-reduce:transition-none` の付与・P31 の `SORT_BTN` との名前衝突回避コメントも適切。モック HTML 側も `span.sort-label` → `button.sort-btn` + 11px chevron へ同期済みで spec と実装が一致。
- **[N-006] モバイル実高 40.56px 問題（TC-007 FAIL→許容）は妥当な判断**。`max-sm:h-11`（rem）×フルード root font-size により 375px 幅で 44px を僅かに下回るが、同一ツールバーの既存 `FILTER_BTN` と同じパターンであり、px リテラル化するとボタン間で高さが揃わなくなる。プロジェクト横断の既存差異としてスコープ外扱い（`.issue/642/.manual-test/results/analysis.md`）に同意。
- **[N-007] a11y 良好**。ネイティブ `<button type="button">`、`aria-label` は可視テキスト（現在のソート名）を含むため label-in-name 違反なし、chevron は `aria-hidden`、`aria-busy` で処理中を通知、グローバル `:focus-visible` リングが pill に追従、モバイルはほぼ 44px タップターゲット。optimistic 化に伴う状態変化は可視ラベル変更で伝わる。
- **[N-008] RSC 境界も正しい**。RSC `PublicSearch` → client `SearchSortToggle` へはシリアライズ可能な `SearchSort | null` のみ。`SearchSort` の import は type-only でドメインコードのクライアント混入なし。`as never` キャストは `SearchFilterDrawer.navigate` と同根（strict search schema × open Record reducer）でコメントにより根拠明示済み。

### 結論

APPROVED。前回 W-001 は useOptimistic + isPending + optimistic 由来の `next` 導出で完全に解消。新規の Blocker / Warning なし。
