# TC-7a: @ユーザーチップ内アバターが16px（AC-10、PC幅）

結果: **PASS**

## 環境
- viewport: 1280x900 (PC幅)
- URL: `http://localhost:3000/search?q=hollow671&period=30d&username=p671-alice&tags=%5B%22p671-tech%22%5D`
- networkidle 待ちで遷移完了

## 手順と eval 出力

### アクティブチップ行内 @ユーザーアバター
- チップ要素: `<span>` `inline-flex items-center gap-1.5 h-7 ... rounded-pill bg-accent-surface`（テキスト `P6@p671-alice`）
- チップ高さ: **28px**（h-7）
- チップ内アバター: `<span aria-hidden="true" class="rounded-full bg-gradient-to-br ...">` テキスト `P6`
  - **width=16, height=16** → 16px。28px に化けていない。

```
chip: { h: 28 }
avatarCandidates[0]: { tag: SPAN, cls: "rounded-full bg-gradient-to-br...", aria: true, txt: "P6", w: 16, h: 16 }
```
（他候補は削除ボタン 18px / SVG 12px で対象外）

### ドロワー内 token チップのアバター（選択済み @ユーザーの丸チップ）
- フィルターボタンをクリックしてドロワー（`[role=dialog]`）を開いて測定。
- dialog 内に `P6` アバターが存在（`insideDialog: true`）。
- アバター: **width=16, height=16**、チップ高さ 26px、`overflow: false`（アバター top/bottom がチップ範囲内、はみ出しなし）。

```
dialogFound: true
avatar: { avTxt: "P6", avW: 16, avH: 16, chipH: 26, overflow: false }
insideDialog: true
```

## 判定
- アクティブチップ行内 @ユーザーアバター = 16px（PASS、28px バグ再発なし）
- ドロワー token チップ内アバター = 16px・チップからはみ出しなし（PASS）
