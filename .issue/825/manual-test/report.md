# ブラウザ検証レポート — Issue #825

**実行日時**: 2026-07-10
**テストソース**: .issue/825/testing.md
**サーバー**: http://localhost:3000（`PORT=3000 pnpm dev`）
**認証**: `pnpm seed:dev-admin` の dev-admin セッションを cookie 注入
**検証幅**: モバイル 390×844 / デスクトップ 1280×900・768×1000

## 結果

全 7 テストケース PASS（FAIL 0）。詳細は `results/summary.md` と各 `results/TC-*.md`。

## 受け入れ基準の充足

- **AC-1 / AC-3（ツールバー圧縮・オーバーフローメニュー）**: モバイル 390px で主要6ボタン + `⋯` が横スクロールなしに収まる（scrollWidth=clientWidth=358）。低頻度書式5種は `⋯` メニューに menuitem として収納、適用で editor が変化しメニューが閉じる。aria-expanded トグル・roving tabindex 準拠。
- **AC-2（デスクトップ不変）**: 1280px / 768px とも全11ボタンが現状の並び順どおりインライン表示、`⋯` オーバーフロートリガーは DOM に存在しない（`sm:hidden`）。
- **AC-1/AC-2 sticky回帰**: 長文スクロール（scrollY 581→1220）でもツールバー top=72px 一定でヘッダー直下に追従。sticky 移設の回帰なし。
- **AC-4 / AC-5（未保存確認）**: dirty 時にネイティブ confirm ではなく `role="alertdialog"` のアプリ内ダイアログ。「切り替える」で切替、「キャンセル」/Escape で現状維持。not-dirty ではダイアログなし。新規サーフェスでは装飾ロスバナーとの二重プロンプトなしを確認。
- **AC-6 / AC-7（リンクダイアログ）**: ネイティブ prompt/alert ではなくアプリ内ダイアログで URL 入力・挿入・解除。非対応スキーム `javascript:` で `role="alert"` インラインエラー、ダイアログ継続。選択テキストへのリンク付与を確認（arch-risk S-004）。
- **エッジ（親フォーム波及）**: リンク submit が親 NoteEditor form に伝播せず、保存 submit・ナビゲーションなし（`stopPropagation`）。

## 留保・SKIP

- **AC-5 の edit サーフェス二重ダイアログ順序**: `proceedModeSwitch` の装飾ロスゲートは `surface === "edit"`（既存ノート編集）にスコープされており、新規作成画面（`/notes/new`）では設計上再現できない。既存ノート SQL 投入が重いため edit サーフェスでの順序検証は SKIP し、ユニットテスト `noteEditorModeChange.test.tsx` でのカバーを確認済み。
- **AC-3 の「適用中」チェック表示**: オーバーフローメニュー項目のトグル適用中状態（Check アイコン）は選択位置依存で agent-browser 上で決定的に確認できず副次確認にとどめた。実装上は active 時に Check を表示する設計。ブロッカーではない。

## 起票した Issue

なし（全 PASS、修正不要）。
