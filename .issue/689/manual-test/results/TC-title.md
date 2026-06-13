# TC-title: タイトル入力のフォント・行高（AC-3）

**結果**: PASS

## 概要

編集画面 (`/notes/01950622-0000-7000-8000-000000000001/edit`) のタイトル入力に
見出しフォント (`font-heading`) と行高 `leading-[1.12]` が適用されていることを確認した。

## 実行ログ

| ステップ | 操作 | 結果 |
| --- | --- | --- |
| 1 | セッション cookie 設定・編集画面へ遷移・networkidle 待機 | OK |
| 2 | タイトル input の computed style 取得 | OK |
| 3 | タイトル input の className 取得 | OK |
| 4 | 本文段落 (`p`) の computed fontFamily 取得（比較用） | OK |
| 5 | フォントトークン (`--font-heading` / `--font-sans` / `--font-body`) の解決値取得 | OK |

## 取得した computed style の実値

タイトル input (`value="P31検証用 — 複数タグとバックリンクを持つ公開ノート"`):

- `fontFamily`: `"Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif`
- `fontSize`: `40px`
- `lineHeight`: `44.8px`

タイトル input の className:

```
w-full bg-transparent border-0 outline-none py-1 mb-5 text-3xl font-heading font-regular tracking-tightest leading-[1.12] text-ink placeholder:text-ink-tertiary
```

本文段落 `p`（比較用）:

- `fontFamily`: `"Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif`
- `fontSize`: `16px`

フォントトークン解決値（`document.documentElement`）:

- `--font-heading`: `"Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif`
- `--font-sans`: 同上
- `--font-body`: 同上

## 判定根拠

- **行高**: `lineHeight 44.8px ÷ fontSize 40px = 1.12` で、`leading-[1.12]` 相当と完全一致。PASS。
- **フォント**: className に `font-heading` が適用されていることを確認。タイトルは見出しフォントを使用している。PASS。

## 注記（フォントファミリー比較について）

タイトルと本文の computed `fontFamily` は同一の文字列になったが、これは実装欠陥ではない。
本環境では `--font-heading` / `--font-sans` / `--font-body` の 3 トークンが
すべて同じフォールバックスタック（`"Helvetica Neue", Arial, ...`）として定義されている
（Web フォント未ロード時のフォールバック値）。トークン自体が同値のため、
`font-heading` を正しく適用しても computed 値は本文と一致する。
className レベルでは `font-heading` が確かに適用されており、AC-3 の実装は正しい。
