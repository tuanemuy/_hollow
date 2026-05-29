# 実装計画 — Issue #289: DirectoryActionsMenu の menuitem 内キーボードナビゲーション（roving tabindex）

**Issue:** #289
**作成日:** 2026-05-29
**複雑度:** 小規模

---

## 目的

`DirectoryActionsMenu`（ディレクトリ行の `︙` から開く 4 操作のポップオーバー）の `role="menu"` 内で、WAI-ARIA Menu Button パターンに沿った矢印キーナビゲーションを実装する。Issue #232 の ADR-006 で「roving tabindex / `aria-activedescendant` 完全化はフォロー Issue」として切り出された分の、**メニュー（ポップオーバー）部分**を完成させる。

現状は開いたときに先頭 menuitem へフォーカスを移すだけで、メニュー内の項目移動は Tab/Shift+Tab に依存している。これを WAI-ARIA Menu パターンの必須キー（上下矢印・Home・End）で操作できるようにし、roving tabindex でフォーカス管理する。

## スコープ

### 含まれるもの
- `app/components/directory/DirectoryActionsMenu.tsx` のメニューに以下のキーボード操作を追加:
  - `ArrowDown`: 次の menuitem へフォーカス（末尾→先頭へラップ）
  - `ArrowUp`: 前の menuitem へフォーカス（先頭→末尾へラップ）
  - `Home`: 先頭の menuitem へフォーカス
  - `End`: 末尾の menuitem へフォーカス
- roving tabindex: フォーカス中の menuitem のみ `tabIndex={0}`、他は `tabIndex={-1}`
- 既存の Escape（トリガーへフォーカス復帰）・open 時の先頭フォーカス・Tab で離脱時のクローズ挙動は維持

### 含まれないもの
- Type-ahead（先頭文字ジャンプ）: 項目ラベルが日本語（「子ディレクトリを作成」「リネーム」「移動」「削除」）で先頭文字検索が機能しにくく、APG でも任意要件。今回は実装しない。
- `DirectoryTree` 側（`role="tree"`）の roving tabindex 完全化（ADR-006 の tree pattern 部分）— 本 Issue は **menu** に限定。
- 汎用 Popover/Menu primitive への切り出し（ADR-003 のフォローアップ、別件）。

## 実装ステップ

### 1. 4 つの menuitem をデータ配列化し、roving tabindex を適用

- **対象ファイル:** `app/components/directory/DirectoryActionsMenu.tsx`
- **変更内容:**
  - 4 つのアクション（create-child / rename / move / delete）を `{ label, onSelect, danger? }` の配列にまとめ、`.map()` でレンダリングする（重複した `<button>` 記述を解消し、roving tabindex の index 管理を一本化）。
  - `activeIndex` state を追加。各 menuitem の `tabIndex` を `i === activeIndex ? 0 : -1` で出し分ける。
  - menu を開くたびに `activeIndex` を 0 にリセットする。
  - 既存の「open 時に先頭 menuitem へフォーカス」useEffect は `activeIndex` 起点のフォーカス制御に統合する（`activeIndex` 変化時に該当 menuitem へ `focus()`）。
- **理由:** roving tabindex は「いま 1 つだけ tab 順に乗る要素」を index で管理するのが素直。配列化により index ↔ DOM ノードの対応がぶれない。

### 2. メニューの onKeyDown ハンドラを追加

- **対象ファイル:** `app/components/directory/DirectoryActionsMenu.tsx`
- **変更内容:** `<div role="menu">` に `onKeyDown` を付与し、`ArrowDown` / `ArrowUp` / `Home` / `End` を処理して `activeIndex` を更新する（矢印は末尾⇄先頭ラップ、Home/End は端へ）。処理したキーは `event.preventDefault()`（矢印でのページスクロール抑止）し、`DirectoryTree` の treeitem `onKeyDown`（同じく ArrowUp/Down を処理）へ伝播しないよう `event.stopPropagation()` する。
- **理由:** `DirectoryTree` の各 treeitem は ArrowUp/Down で兄弟ノードを移動する `onKeyDown` を持つ。メニューは treeitem の DOM 内に存在するため、stopPropagation しないとメニュー内移動とツリー移動が二重発火する。Escape は既存の document レベル handler が処理するため、ここでは矢印・Home・End のみを扱う。

## 設計判断

- **roving tabindex vs `aria-activedescendant`:** DOM フォーカス移譲（roving tabindex）を採用。既存実装が実 DOM フォーカス（`first?.focus()` / トリガー復帰）で組まれており、`DirectoryTree` の treeitem も `tabIndex={-1}` + 実フォーカスで統一されている。`aria-activedescendant` 方式に混在させると整合性が崩れるため、既存方針に合わせる。
- **ラップ挙動:** APG Menu の推奨に従い、ArrowDown は末尾で先頭へ、ArrowUp は先頭で末尾へラップする。Home/End はラップ対象外（端へジャンプ）。

## リスクと注意点

- `DirectoryTree` の treeitem `onKeyDown`（DirectoryTree.tsx:243-288）との二重発火。メニュー側で `stopPropagation` を徹底する。
- 既存の `onMouseDown preventDefault`（マウス操作中のフォーカス維持）・`onBlur`（離脱時クローズ）・open 時フォーカスとの干渉。roving のフォーカス制御を既存 useEffect に統合し、二重 focus を避ける。
- `useId` で生成した menuId・`aria-controls` 等の既存 ARIA 属性は変更しない。

## テスト方針

- ブラウザ（manual-test）で `︙` メニューを開き、上下矢印・Home・End・ラップ・Escape・選択実行を確認する。詳細は testing.md。
- 既存のコンポーネントユニットテストは directory メニューには存在しない。今回はキーボード挙動が中心で DOM フォーカス制御に依存するため、ブラウザ検証を主軸とする（jsdom の focus/roving 検証は脆くなりやすいため新規ユニットテストは追加しない）。

## レビュー履歴

（小規模のため計画レビューループはスキップ。Phase 3 で General Review を 1 本実施する）
