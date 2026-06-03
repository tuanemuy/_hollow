# 動作確認計画 — Issue #419: ボタン/リンクの focus-visible リング統一と disabled opacity (55/60) 正規化

**Issue:** #419
**作成日:** 2026-06-03

---

## 確認環境

このIssueの変更（スタイル定数と tokens.css のみ）を確認するために必要な手順。

### 検証環境の起動

```bash
pnpm db:migrate   # ローカル D1 にマイグレーション適用（認証ページ閲覧用にデータが必要な場合）
pnpm dev          # vite dev（Cloudflare runtime）。空きポートで開発サーバ起動
```

### デプロイ方法

なし（検証環境のみで確認できる。スタイルの見た目変更のため staging/production への反映は不要）。

## 確認項目

### 1. focus-visible リングの全ボタン/リンク表示

- **目的:** グローバル `:focus-visible`（`box-shadow: var(--shadow-focus)`）が全ボタン/リンクに効いていることを確認する。
- **手順:**
  1. 各画面で Tab キーのみでフォーカスを巡回する（マウスは使わない）。
  2. 以下の要素にフォーカスを当て、リング（4px の outset リング）が表示されるか確認:
     - サイドバーナビ（`NAV_ITEM`）、ディレクトリツリーのリンク（`TREE_ITEM_LINK`）
     - pill ボタン（`pillBtn`）、各 `BTN_*` / `PILL_BTN`
     - public ページの送信ボタン・リンク
     - ユーザーメニュー項目（`USER_MENU_ITEM`）、ディレクトリアクションメニュー項目（`ACTIONS_MENU_ITEM`）
     - 円形ボタン（ダイアログ閉じる `dialogCloseButton`、ノートチェックボックス `NoteCheckbox`）
- **期待結果:** すべての要素でキーボードフォーカス時にリングが表示される。角丸要素は `border-radius: inherit` で形状に追従、円形要素は offset 付き outline リング。
- **確認ポイント:** スクロール可能なナビ/ツリー（`overflow-y-auto`）の端にある項目でリングが `overflow:hidden` でクリップされないか。メニュー項目は背景変化（`focus:bg-surface`）とリングが併存する。

### 2. disabled opacity の正規化（全画面で 0.55 統一）

- **目的:** disabled / aria-disabled 状態のボタン・入力が、全画面で同一の淡さ（opacity 0.55）になっていることを確認する。
- **手順:**
  1. disabled になる要素を発火させて見た目を比較:
     - auth フォームの送信ボタン（送信中 disabled）
     - admin 各フォームの pill ボタン（保存中・未変更時など disabled、旧 opacity-50）
     - public ゲートの送信ボタン `GATE_SUBMIT`（旧 opacity-60）
     - admin LLM 設定の disabled input（旧 opacity-60）
     - common pillBtn の disabled / aria-disabled（旧 opacity-55、据え置き値）
     - InlineEditor の `data-[disabled]` 状態（旧 opacity-60）
- **期待結果:** すべての disabled 要素が同じ淡さで表示される（バラつきが無い）。
- **確認ポイント:** 旧 opacity-50 の admin ボタンは僅かに濃く、旧 opacity-60 の auth/public/input は僅かに薄くなる。機能は変わらない。

## エッジケース・異常系

### 1. reduced-motion 下での表示

- **目的:** `prefers-reduced-motion` 設定下でもリング/淡色が壊れないことを確認する。
- **手順:**
  1. OS/ブラウザで reduced-motion を有効化し、上記項目1・2を再確認。
- **期待結果:** リング表示・disabled 淡色とも正常（既存の `motion-reduce:` 規約と独立）。

## 既存機能への影響確認

- スタイル定数の変更のみで、ボタン/リンクの機能（クリック・遷移・送信）には影響しないはず。各画面の主要ボタン押下が従来どおり動作することを確認する。
- discarded ジョブ（`IngestionJobRow` の `data-[discarded]`）と楽観的UI 保留中（`NoteListViews` の `data-[pending]`）の淡色は **据え置き（opacity-60 のまま）**。これらは disabled とは別概念のため変化しないことを確認する。

## 確認チェックリスト

- [ ] Tab 巡回で全ボタン/リンク（nav, tree, pill, BTN_*, public, menu item, 円形）にフォーカスリングが表示される
- [ ] スクロール端の nav/tree 項目でリングがクリップされない
- [ ] disabled ボタン・入力の淡さが全画面で統一されている（auth / admin / public / common / InlineEditor）
- [ ] discarded / pending の淡色は据え置き（変化しない）
- [ ] ボタン押下・遷移・送信など既存機能が従来どおり動作する
- [ ] reduced-motion 下でも表示が壊れない
