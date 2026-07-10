# PR Review #003 — feat(note): #819 ページ遷移フィードバック

**PR:** #826
**Date:** 2026-07-10
**Round:** 3回目（ゼロベース・フルレビュー。R2 指摘の解消確認を含む）

## Summary

- Blockers: 0
- Warnings: 1（→ ADR-004 で正規化・記録済み。修正対象として残らない）
- Notes: 15
- Verdict: **APPROVED**

typecheck / lint / format グリーン。対象ユニット 4 files / 18 tests all PASS。

## レイヤー別ファイル

- Frontend: review-003-frontend.md（B: 0 / W: 0 / N: 7）— APPROVED
- RSC/Architecture: review-003-rsc.md（B: 0 / W: 1 / N: 5）— APPROVED
- Test: review-003-test.md（B: 0 / W: 0 / N: 3）— APPROVED

## 指摘一覧と仕分け

- [RSC W-001] 編集モードへ `tagSuggestions` を新規追加（main になかった。plan の「props 契約不変」記述と食い違う。benign かつ望ましい方向） — `app/components/note/editor/NoteEditorLoader.tsx:80`
  - **仕分け: 撤去せず意図的追加として正規化。** create モードとの一貫性・既取得タグ辞書の再利用・撤去すると編集モードのタグ候補補完が退行、の3点から残す判断。`.issue/819/adr.md` ADR-004 に記録し、`NoteEditorLoader.tsx` にコメントを追加。→ 修正対象として残らない（Step 7「記録済み Warning は完了を妨げない」）。
- Notes（Frontend N-001〜N-007 / RSC N-001〜N-005 / Test N-001〜N-003）はいずれも良い点の確認・軽微な test-precision の観察・スコープ外の許容トレードオフ。修正不要。

## R2 指摘の解消確認（重点）

- **[R2 test B-001] AC-6 reduced-motion 契約テスト欠落 → 解消。** `RouteProgressBar.test.tsx` に外側 `motion-reduce:transition-none`／`data-[loading]:transition-none`・内側 `motion-safe:animate-pulse` の string-contains 契約テストを追加。
- **[R2 test W-001] loader の seed 導出が無検証 → 解消。** `NoteEditorLoader.test.tsx` に props スパイで `initialTagNames`（未知id脱落・順序保持）・`initialEditLock`（acquired / epoch-ms）・no-lock 時のキー不在・`tagSuggestions` を検証する2ケースを追加。
- **[R2 test W-002] 編集ルート streaming 回帰テスト欠落 → 解消。** ユニット化困難（createServerFn/renderServerComponent 境界）のため `testing.md` 確認項目1に「R2 test W-002 の受け入れ条件」として明示固定。
- **[R2 frontend W-001] 進捗バーのアイドル時パルス → 解消。** `ROUTE_PROGRESS_BAR` に `group`、fill を `group-data-[loading]:motion-safe:animate-pulse` に変更。Tailwind v4 の生成 CSS 実測で「親に `data-loading` があるときだけパルス発火」を確認。

## 完了判定

Step 7 の完了条件（そのラウンドで「このPRで直す」と仕分けた指摘がゼロ＝Blocker 0件 かつ 修正対象 Warning 0件、記録済み Warning は妨げない）を満たす。R3 は Blocker 0、唯一の Warning は ADR-004 で正規化・記録済み。**APPROVED として収束。**
