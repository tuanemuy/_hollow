# R-1: 自分の保存 → invalidate → 最新値再表示の非退行 (AC-6)

- セッション: verify-tc-r1
- 対象: /views 保存ビュー「テスト用ビュー design」の inline rename → 保存

## 操作

1. /views で 3件目ビューの rename を開始
2. 新しい名前を入力（Control+a が textarea で全選択にならず追記となったため、結果値は
   "テスト用ビュー designRenamedR1View" になった — テスト操作上の打鍵詳細であり挙動評価には影響なし）
3. 「保存」ボタンをクリック → invalidate（保存後の loader 再取得）→ networkidle + 800ms

## 期待

保存後は loader 最新値が表示され、編集モードが閉じる。フック追加が invalidate セマンティクス／
最新値再表示を壊していない。

## 実際

- 保存後ビュー名一覧: `["TestLongViewName649…", "テスト用タイル日記", "テスト用ビュー designRenamedR1View"]`
- `editingOpen: false`（編集モード解除）
- `errorVisible: false`（エラーなし）

## 判定: PASS

保存 → invalidate 後に編集値（最新 loader 値）がその場で反映され、編集 UI が閉じた。
復元フックは focus/caret のみを扱い、value 反映・invalidate 発火経路に介入していない。
