# PR Review #003 — ダイアログモック群（#528 / PR #518 に積む）

**PR:** #518
**Date:** 2026-06-06
**Round:** 3回目（#528 ダイアログモック追加分）

---

## Summary

- Blockers: 2
- Warnings: 2
- Notes: 5
- Verdict: **BLOCKED**

新規13ダイアログモックをレビュー。構造一貫性の結論は「**フラット方式に統一**」（実 `Dialog.tsx` primitive はフラット＝header/body/footer 区画を持たない。フラット方式が実装忠実、ディレクトリ系3枚が乖離。P13/P14 は primitive 化以前の旧モックで揃える先ではない）。

---

## ダイアログモックレビュー

### Blockers
- **[B-001]** ディレクトリ系3枚で送信ボタンが `<form>` の外 / `P10-directory-create/rename/move-dialog.html`（`<form class="modal-body">` の後ろの `.modal-footer` 内に `type="submit"`）/ フォーム外の submit はそのフォームを送信できず動線不成立 / **提案: フラット方式（form 内に title→fields→actions 直置き）へ書き換え、他8枚と統一。** → 本ラウンドで修正
- **[B-002]** ディレクトリ系3枚に実装に無い × 閉じるボタン / `.modal-close` / Create/Rename/MoveDirectory は `showCloseButton` を渡さず × は描画されない（× は UploadDialog のみ）/ **提案: ディレクトリ系から × 削除。** → 本ラウンドで修正

### Warnings
- **[W-001]** tokens.md に無い `--shadow-lg` を新規導入 / `P10-bulk-export-dialog` / `P20-view-form-dialog` / `P10-bulk-visibility-dialog` の `:root` / §9 違反、モーダル用は `--shadow-md` / **提案: `--shadow-md` に統一し `--shadow-lg` 定義削除。** → 本ラウンドで修正
- **[W-002]** パネル/タイトルのクラス命名が13枚で割れている（`.modal`/`.dialog`/`.panel`、`.modal-title`/`.dialog-title`/`.panel-title`）/ 実装 style 名は `dialog`/`dialogTitle`/`dialogActions` / **提案: `.dialog` / `.dialog-title` / `.dialog-actions` に統一（mobile overflow-wrap セレクタも追従）。** → 本ラウンドで修正（P13a の状態ギャラリーは別系統として除外可）

### Notes
- **[N-001]** `--opacity-disabled: 0.55`（tokens.md 正式トークン）が5枚（ディレクトリ系3・filterbar・merge-tag）の `:root` に欠落（旧 P13 の :root をコピーしたため）。揃えるなら全13枚に含める。 → 本ラウンドで対応
- **[N-002]** P13a の9番目 `queueGuidance` はテキスト言及のみ（任意）。
- **[N-003]** P13a の各 `.panel` は `role=dialog`/`aria-modal`/`aria-labelledby` 無し（8状態ギャラリーゆえの割り切り、許容）。
- **[N-004]** 高忠実度で良好: common-confirm-dialog（alertdialog/AlertTriangle/danger/aria-describedby）、filterbar-popovers（menu/menuitemradio/roving）、note-picker（combobox/listbox gating）、merge-tag（indeterminate progressbar）。
- **[N-005]** CSS 健全性良好（brace balance / シャドウは浮く要素のみ / 絵文字 UI 装飾なし / 横スクロール誘発なし）。app/ 非変更。

---

## Design Decisions

ダイアログモックの正準構造は **フラット方式**（`.dialog` 単一パネル + `.dialog-title` + `.dialog-actions`、`<form>` 内に直置き、× は showCloseButton を渡す UploadDialog 等のみ）と確定。実 `Dialog.tsx` primitive に準拠する。P13/P14 の header/body/footer は primitive 化以前の旧表現。
