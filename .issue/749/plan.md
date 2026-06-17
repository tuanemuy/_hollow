# 実装計画 — Issue #749: モバイル表示がモックと一致しない（横断: P40 / P10 / フィルターチップ）

**Issue:** #749
**作成日:** 2026-06-18
**複雑度:** 小規模

---

## 目的

モバイル幅でモバイルmock（`spec/design/pages/mobile/`）を再現する横断トラッキングIssueのうち、設計判断が絡むため先行コミット（07c60229）で見送られた「要確認」項目を解消する。具体的にはフィルターチップとノート選択チェックボックスのモバイル寸法を mock に一致させ、mock が明記する「裸のチップ／チェックボックスには 44px タッチ床を適用しない」方針に揃える。

## 背景（先行コミットとの関係）

- 先行コミット `d576bb2b`（旧 07c60229 を main から切り直したブランチに引き継ぎ）で、P40 ダッシュボード・P10 行レイアウト・フィルターチップ折り返しなど**低リスクな mock 不一致は対応済み**。
- 本計画は、その際に「a11y / 設計判断が絡む」として見送られた残項目のうち、ユーザーがスコープに含めると判断したものだけを扱う。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | モバイル幅（〜640px）でフィルターチップ（`filter-chip` / `filter-chip-ghost`）の高さが **32px** になる（デスクトップは 28px のまま） | Issue 本文 2.B / mobile mock `.filter-chip` height:32px | ステップ2 |
| AC-2 | フィルターチップに **44px のタッチ床（`min-h-[44px]`）が適用されない**（チップ高さが 32px を超えて膨張しない） | Issue 本文 2.C / mobile mock line 161-165 | ステップ2 |
| AC-3 | モバイル幅で選択チェックボックス（`note-check`）の表示寸法が **24px×24px** になる（デスクトップは 20px のまま） | Issue 本文 2.A / mobile mock `.note-check` 24px / desktop mock 20px | ステップ1 |
| AC-4 | チェックボックスに **44px の正方形タッチ床が適用されず** 24px に潰されない | mobile mock line 161-165（チェックボックスは床対象外） | ステップ1 |
| AC-5 | 既存の横スクロール挙動・折り返し抑止（`whitespace-nowrap` / `shrink-0`）・選択トグル動作が維持される | 回帰防止 | 全ステップ |

## スコープ

### 含まれないもの

- **カード化 breakpoint の 640→768 変更**（Issue 2.C） — ユーザー判断によりスコープ外。意図的乖離として ADR-002 に記録。
- **チェック表示モデルの常時列描画化**（Issue 2.C） — ユーザー判断によりスコープ外。現状の「選択モード時のみ列描画」を維持。意図的乖離として ADR-003 に記録。
- P40 / P10 のその他余白・色・サイズ・折り返し（先行コミットで対応済み）。
- note-title letter-spacing の微差（Issue 2.C 軽微項目） — 体感差がなく今回は触れない。

## 調査結果

- 関連ファイル:
  - `app/components/note/list/styles.ts` — `filterChip` / `filterChipGhost`（`h-7` + `${TOUCH_TARGET}`）。
  - `app/components/note/list/NoteCheckbox.tsx` — `NOTE_CHECK`（`w-5 h-5` + `${TOUCH_TARGET_SQUARE}`）。
  - `app/components/common/styles.ts` — `TOUCH_TARGET`（`max-sm:min-h-[44px]`）/ `TOUCH_TARGET_SQUARE`（両軸 44px）の SSOT。**本Issueでは共有定数は変更せず、利用側の文字列から外す**。
  - 消費側: `filterChip`/`filterChipGhost` は `FilterBar.tsx` のみ。`NoteCheckbox` は List/Tile/Calendar の3ビュー共有（#354）。
- あるべきアーキテクチャ: スタイルは utility-first（`className` 直書き / module-scoped 文字列定数）。state は `data-*` + `data-[name]:` variant。タッチ床は `TOUCH_TARGET` / `TOUCH_TARGET_SQUARE` を SSOT とし、mock の意図（pill/icon に限定、裸チップ・チェックボックスは各自で最小高さを明示）に従う。
- 既存実装の状態: 先行コミットで多くは mock 一致済み。チップ高さ・チェックボックス寸法は 44px 床が効いていて mock と乖離。床を外し各自の高さを明示することで mock に一致する。
- 依存関係: `NoteCheckbox` 変更は3ビューに波及するが、いずれも選択チェックの見た目を 24px(モバイル)/20px(デスクトップ) に揃えるだけで挙動は不変。テストはこれらのクラス文字列を参照していない。

## 設計

### ドメインモデル / ユースケース / アダプター

なし（UI スタイルのみの変更）。

### UI / プレゼンテーション

mock は「44px タッチ床は pill/icon ボタンに限定し、裸のチップとチェックボックスには適用しない。各々が適切な最小高さ（チップ32px・チェック24px）を明示する」と定めている（mobile mock line 161-165）。実装側も同方針に揃える:

- **チップ**: `${TOUCH_TARGET}`（`max-sm:min-h-[44px]`）を外し、`max-sm:h-8`（32px）を明示。デスクトップは `h-7`（28px）維持。
- **チェックボックス**: `${TOUCH_TARGET_SQUARE}`（両軸 44px）を外し、`max-sm:w-6 max-sm:h-6`（24px）を明示。デスクトップは `w-5 h-5`（20px）維持。床を残すと `min-w/min-h:44px` が `w-6/h-6` に勝って 24px 化できないため、床除去は 24px 化と不可分（ADR-001）。

いずれも実効タップ対象は別途確保される（チップは横スクロール行内で 32px+間隔、チェックは行全体がトグル対象）。詳細トレードオフは ADR-001。

## 実装ステップ

### 1. チェックボックスのモバイル寸法を 24px にし正方形タッチ床を外す

- **対象ファイル:** `app/components/note/list/NoteCheckbox.tsx`
- **変更内容:** `NOTE_CHECK` の `w-5 h-5` を `w-5 h-5 max-sm:w-6 max-sm:h-6` に変更し、末尾の `${TOUCH_TARGET_SQUARE}` を除去（import も削除）。
- **理由:** mobile mock の `.note-check` は 24px。44px 正方形床が残ると 24px に潰せない（AC-3 / AC-4）。

### 2. フィルターチップのモバイル高さを 32px にしタッチ床を外す

- **対象ファイル:** `app/components/note/list/styles.ts`
- **変更内容:** `filterChip` / `filterChipGhost` の `h-7` を `h-7 max-sm:h-8` に変更し、末尾の `${TOUCH_TARGET}` を除去（未使用になれば import も整理）。`whitespace-nowrap shrink-0` は維持。
- **理由:** mobile mock の `.filter-chip` / `.filter-chip-ghost` は 32px・タッチ床なし（AC-1 / AC-2）。

## 設計判断

- ADR-001: 裸チップ／チェックボックスから 44px タッチ床を外す（mock 準拠・実効タップ対象は別途確保）。
- ADR-002: カード化 breakpoint の 640→768 変更は今回スコープ外（意図的乖離）。
- ADR-003: チェック表示モデルの常時列描画化は今回スコープ外（意図的乖離）。

## リスクと注意点

- `NoteCheckbox` は3ビュー共有のため、Tile/Calendar の選択チェックもモバイル 24px になる。mock は list のみ収載だが、3ビューで寸法を揃えるのは一貫性として妥当。
- a11y: 32px チップ / 24px チェックは WCAG 2.5.8（AA 24px 最小）を満たすが 2.5.5（AAA 44px）は下回る。mock 作者が明示的に許容した方針（line 161-165）であり、ユーザーも当該スコープを選択済み。
- Tailwind の同プロパティ解決順（生成CSS順）に注意。`max-sm:h-8` / `max-sm:w-6` は基底 `h-7` / `w-5` より後にソートされ拡大方向で勝つ。床（`min-*`）を外さないと `min-*` が `w/h` に勝つ点に注意（ADR-001）。

## テスト方針

- `pnpm typecheck && pnpm lint && pnpm format:check`。
- manual-test（agent-browser）でモバイル幅（375/390px）の P10 ノート一覧を表示し、チップ高さ32px・チェックボックス24px・横スクロール維持・折り返し無しを mock と重ねて確認。
- デスクトップ幅でチップ28px・チェック20px が維持されていることを確認（回帰防止）。
