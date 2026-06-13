# TC-body: 本文エディタのボーダーレス化（AC-5）

**結果**: PASS（初回 FAIL → 修正後 PASS）

## 修正後の再検証（最終結果）

初回検証で FAIL（下記）した後、`InlineEditor.tsx` L863 の host className からも
`rounded-md border border-hairline` を撤去（`WysiwygEditor.tsx` と同じ修正、`p-4` /
`min-h-[480px]` / `focus-within:*` は温存）。品質ゲート（typecheck / lint / format）通過後、
編集画面のビジュアルタブで再測定:

- `borderTopWidth`: `0px` → OK
- `borderRadius`（左上）: `0px` → OK
- `padding`: `16px`（p-4 維持）→ OK
- `minHeight`: `480px` → OK

枠線・角丸が撤去され padding が維持されたため **PASS**。

---

## 初回検証（FAIL — 修正のトリガー）

**結果**: FAIL

## 概要

編集画面の「ビジュアル」タブ（selected）で表示される本文エディタ本体に、
依然として枠線（`border 1px solid`）と角丸（`border-radius 8px` = `rounded-md`）が残っており、
AC-5 のボーダーレス化が反映されていない。

根本原因: 編集（edit）画面の「ビジュアル」タブは `inline` モード = `InlineEditor` を描画する。
AC-5 のボーダーレス化（`rounded-md border border-hairline` 撤去）は `WysiwygEditor`（TipTap）
にのみ適用されており、編集画面で実際に使われる `InlineEditor` には適用されていない。
`WysiwygEditor` は新規（new）画面の「WYSIWYG」タブ専用で、編集画面では使われない。

## 実行ログ

| ステップ | 操作 | 結果 |
| --- | --- | --- |
| 1 | 「ビジュアル」タブが selected であることを確認 | OK（selected=true） |
| 2 | `.ProseMirror` / `min-h-[480px]` の EditorContent を eval で探索 | NOT_FOUND（TipTap 非描画） |
| 3 | 書式ツールバー (`role=toolbar` "書式") の有無確認 | 不在（TipTap 非描画） |
| 4 | P31 本文段落の祖先チェーンを辿り実際のエディタ host を特定 | `.note-detail-content` SECTION を特定 |
| 5 | `.note-detail-content` host の computed style 取得 | OK |
| 6 | ソース (`InlineEditor.tsx` / `NoteEditor.tsx` / `EditorModeSwitch.tsx`) で原因確認 | 確認済み |

## 取得した computed style の実値

実際に描画されているエディタ host (`.note-detail-content` = `InlineEditor`):

- `borderTopWidth`: `1px`（期待: 0px）→ NG
- `borderTopStyle`: `solid`（期待: none）→ NG
- `borderRadius`（左上）: `8px`（期待: 0px、rounded-md でない）→ NG
- `padding`: `16px`（期待: 残存）→ OK（p-4 相当）
- `minHeight`: `480px`（期待: 480px 相当）→ OK

host の className（`InlineEditor.tsx` L863）:

```
note-detail-content min-h-[480px] rounded-md border border-hairline bg-bg p-4 text-base leading-relaxed ...
```

## 失敗詳細

検証手順では `.ProseMirror`（TipTap の EditorContent）を測定対象に想定していたが、
編集画面の「ビジュアル」タブには TipTap エディタが描画されない。
ツールバー（"書式"）も EditorContent (`min-h-[480px] bg-bg p-4`) も DOM に存在しなかった。

代わりに本文は `InlineEditor` の `.note-detail-content` SECTION（contenteditable）として描画されており、
このホストには `rounded-md border border-hairline` が残ったまま。computed 値でも
`border 1px solid` / `border-radius 8px` を確認した。padding (16px) と minHeight (480px) は残存。

タブ → モードのマッピング（`EditorModeSwitch.tsx`）:

- edit surface（編集画面）: 「ビジュアル」= `inline` モード → `InlineEditor`（border/rounded **残存**）
- new surface（新規画面）: 「WYSIWYG」= `wysiwyg` モード → `WysiwygEditor`（border/rounded **撤去済み**）

`WysiwygEditor.tsx` L576 の EditorContent は `min-h-[480px] bg-bg p-4`（border/rounded なし）で AC-5 を満たすが、
編集画面では到達しないため、本テスト（編集画面のビジュアルタブ）では枠線・角丸が残る。

## 結論

枠線（border 1px）と角丸（border-radius 8px）が残存しているため **FAIL**。
AC-5 のボーダーレス化を `InlineEditor.tsx`（`.note-detail-content` host, L863）にも適用する必要がある。
