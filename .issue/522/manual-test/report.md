# ブラウザ検証レポート — Issue #522

**実行日時**: 2026-06-09
**テストソース**: `.issue/522/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev`）
**結果**: 全 6 件 PASS / FAIL 0 / 起票 Issue なし

## 検証対象

WYSIWYGエディターのフォーカス枠線・上下余白・キャレット/選択範囲の改善（Issue #522）。
WysiwygEditor（TipTap, 新規ノートの WYSIWYG タブ）と InlineEditor（既存ノートのビジュアルタブ）の両方を検証。

## 受け入れ基準の充足

| 受け入れ基準 | 結果 | 根拠 |
|---|---|---|
| フォーカス時の枠線をエディター枠線と一致させ二重枠を解消 | ✅ | コンテナに `shadow-focus`（`oklch(0.371 0 0 / 0.28) 0 0 0 4px`）1段＋`border-accent`。内側 `.ProseMirror:focus-visible` / InlineEditor 編集ブロックの box-shadow は全透明（リング消滅） |
| エディター内の上下余白を視覚的に揃える | ✅ | 先頭ブロック margin-top=0px / 末尾ブロック margin-bottom=0px / padding=16px。WysiwygEditor・InlineEditor とも |
| ビジュアル編集中のキャレット・選択範囲を洗練 | ✅ | caret-color=accent、`::selection` 背景=accent-surface（淡いグレー、UA デフォルト青ではない）。スクショで目視確認 |
| デザイントークン・既存スタイル方針に準拠 | ✅ | `--shadow-focus` / `accent` / `accent-surface` の既存トークンのみ。新規トークン・新規CSSファイル・@apply なし |

## 既存機能への影響

- **読み取りページ（`.note-detail-content` without `data-editing`）**: 先頭h2の margin-top=48px（元の 2em 維持）。余白リセットは `[data-editing]`（InlineEditor 編集ホスト）限定スコープで、読み取り系（NoteDetail / PublicNoteDetail / LegalDocument / NoteRevisionDetail / HtmlEditor）に波及しないことを確認。回帰なし。
- **グローバル `:focus-visible`**: 変更していないため他画面のフォーカス表現は従来どおり。

## スクリーンショット

- `screenshots/wysiwyg-focused-selection.png` — WysiwygEditor: 二重枠なし・先頭行が上端揃い・選択がグレー
- `screenshots/inline-focused-selection.png` — InlineEditor: 同上（先頭見出し・末尾段落・リスト含む）
- `screenshots/readonly-not-affected.png` — 読み取りビュー: 余白リセット非波及の証拠

## 計測ログ（agent-browser eval）

WysiwygEditor（新規ノート WYSIWYG タブ）:
- `.ProseMirror` 先頭child: P / margin-top `0px`、末尾child margin-bottom `0px`、caret `oklch(0.371 0 0)`、outline `none`、`:focus-visible` box-shadow 全透明
- コンテナ: `:focus-within` true / borderColor `oklch(0.371 0 0)` / box-shadow 末尾 `oklch(0.371 0 0 / 0.28) 0 0 0 4px` / padding 16px / transition `border-color, box-shadow`

InlineEditor（既存ノート ビジュアルタブ）:
- host `data-editing` あり / 先頭 H2 margin-top `0px` / 末尾 P margin-bottom `0px` / padding-top 16px / caret `oklch(0.371 0 0)`
- フォーカス時: host `:focus-within` true / borderColor accent / box-shadow shadow-focus / 編集ブロック box-shadow 全透明

読み取りビュー: `.note-detail-content` `data-editing` なし / 先頭 H2 margin-top `48px`（リセット非適用）
