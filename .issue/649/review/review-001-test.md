# Review 001 — Test（網羅性・テスト設計・契約テスト）

対象: PR #659 / 計画: `.issue/649/plan.md`（ステップ8 = テスト更新、AC-11）

総評: 契約テストの設計品質は高い。aria-label ベースのセレクタで実装詳細（可視テキスト・クラス名）への結合を避けており、ViewSwitcher のナビゲーション契約（#215/#219 の search 関数の入出力）を関数レベルで固定しているのは壊れにくく的確。既存の `skeletonAria.test.tsx` が「ToolbarSkeleton = aria-hidden / 他スケルトンは単一 `role="status"`」を既に固定しているため、ステップ7 の境界再構成後もアナウンス集約の要求（plan ステップ8 最終項）は満たされている。CI（Lint/Typecheck/Unit）は pass。一方で、新規に増えた共通コードパス（Popover の listbox 枝・roving の `option`）のキーボード/フォーカス契約と、不明 viewId エッジに穴がある。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** ViewSwitcher のキーボード契約が単体で未検証 / 場所: `app/components/note/list/__tests__/ViewSwitcher.test.tsx`（テスト不在）、`app/components/note/list/ViewSwitcher.tsx:704-710` / 理由: 本 PR は `useRovingMenu` に `itemRole: "option"` を、`Popover` に listbox 枝（`onMenuKeyDown` 配線）を新設し、ViewSwitcher が初の利用者。しかし ViewSwitcher.test はクリック経路のみで、矢印キーの roving 移動・Enter/Space での選択・Esc クローズ・`initialIndex`（開いたとき選択中ビューにフォーカスが乗る）のいずれも検証していない。既存 `Popover.test.tsx` は `haspopup="dialog"` のみ、`Menu.test.tsx` は別コンポーネントなので、listbox 枝の `onMenuKeyDown` 配線が外れても unit では検知されない（plan は手動確認に寄せているが、配線自体は happy-dom で固定可能）。また `select()` が `close()` → `onSelectView()` の順で呼ぶフォーカス返却契約もコメントのみでテストがない / 提案: ViewSwitcher.test に「開いたとき選択中 option に tabindex=0 / ArrowDown で次 option へ roving / Enter（click）で navigate / Escape で `aria-expanded=false` に戻る」を追加。`Menu.test.tsx` の既存パターンが流用できるはず。
- **[W-002]** 不明（削除済み）viewId のときの listbox 選択状態の不整合がエッジとして未テストで、実装の矛盾を隠している / 場所: `app/components/note/list/ViewSwitcher.tsx:699-702, 794`（`aria-selected={search.viewId === undefined}`）/ 理由: `resolveViewName("gone", views)` のフォールバックは listSelectors.test で固定済みだが、コンポーネントレベルでは未検証。`viewId="gone"` のとき見出しは「すべてのノート」を表示する一方、listbox では「すべてのノート」option の `aria-selected` が false（`viewId === undefined` 判定）になり、どの option も selected にならない。`selectedIndex` は `findIndex + 1 = 0` で初期フォーカスだけは index 0 に乗るため、表示・フォーカス・aria-selected が三者で食い違う。単一選択 listbox としては「selected がゼロ件」は許容されるが、見出し表示との整合を仕様としてどちらかに固定すべき / 提案: `render({ viewId: "gone" })` のテストを追加し、「heading = すべてのノート、かつ aria-selected の期待値」を契約として固定する（実装を `aria-selected` 側もフォールバック判定（`resolveViewName` ベース等）に揃えるのが自然）。
- **[W-003]** 共通 Popover の listbox 枝固有のガード（panel `onMouseDown` preventDefault）が未テスト / 場所: `app/components/common/Popover.tsx`（listbox 枝）、`app/components/common/__tests__/Popover.test.tsx`（dialog のみ） / 理由: コメントで「menu 枝と同じ Safari/Firefox click-drop 対策」と主張しているが、menu/listbox の二枝は JSX が別実体で複製されており、片方だけ preventDefault が落ちるリグレッションをテストが検知しない。ViewSwitcher.test は `role="listbox"` パネルの存在しか見ていない / 提案: Popover.test.tsx に haspopup ごとのパラメタライズ（menu / listbox は panel mousedown が defaultPrevented、dialog はされない）を1本追加。

#### Notes

- **[N-001]** `NoteListToolbar.test.tsx` の 選択 トグルは `aria-pressed="false"` 側しか検証していない（`SelectionContext` モックが `mode: false` 固定）。`mode: true` 時に `aria-pressed="true"` + `data-on` が立つこと、click で `toggleSelectMode` が dispatch されることは未検証。アイコンのみ化でトグル状態の視覚手掛かりが `aria-pressed`/`data-on` に依存度を増したので、true 側も固定する価値がある（場所: `app/components/note/list/__tests__/NoteListToolbar.test.tsx:66-77`）。
- **[N-002]** ADR-002 の核心（`notesQuery` の単一参照共有による `cache` デデュープ）に回帰ガードがない。RSC 構成のため unit での検証は困難で JSDoc 注記による運用は妥当だが、`HeaderSection` / `NotesSection` のどちらかでクエリを再構築するリファクタが入っても全テストが green のまま二重クエリになる点は認識しておくこと（場所: `app/components/note/HomePage.tsx`）。
- **[N-003]** `homeHeadingText` の「空白のみ q + viewName あり」（→ viewName を返す）組合せが未検証。`isSearchActive` 経由で実質カバーされているため低優先（場所: `app/components/note/list/__tests__/listSelectors.test.ts:810` 周辺）。
- **[N-004]** 良い点: 旧 `tabByLabel` の textContent 依存を aria-label 取得へ置き換えつつ #219/#215 のナビゲーション契約テストを温存、FilterBar の × は「未適用時非表示 + click で navigate 1回」と表示条件・挙動の両面を維持、ViewSwitcher の search 関数を `prev` 注入で直接検証する手法はモック過剰でなく壊れにくい。AC-1〜AC-7 のテスト対応は適切（AC-3/5/8/9 の寸法・focus リング・44px 当たり判定は happy-dom で検証不能なため manual-test 側でカバー済みなのも妥当）。
