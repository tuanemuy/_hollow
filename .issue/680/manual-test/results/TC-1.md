# TC-1: 修正前（フック無し）の focus→body / caret 喪失再現 (AC-1)

- セッション: 該当なし（修正後ビルドのため実機再現不可）

## 扱い

現ビルドはフック有り（`useRestoreFieldFocusOnCommit` を3フォームに配線済み）のため、
修正前の「invalidate コミットで focus が `<body>` に落ちる」挙動は本検証では再現できない。

AC-1 の修正前再現は #670 Step 0（`.issue/670/step0-results.md`）で既に実機実証済みとされており、
その既存実証を根拠として引用する。#670 Step 0 では:

- invalidate コミットで focus が `<body>` に落ちる一方、入力 value 自体は保持される（再マウントではない）
ことが確認されている。

## 本検証での充当

本 Issue #680 の検証では AC-1 を「修正後に focus/caret が保持される（= 問題が解消した）」ことの確認に充てる。
TC-2〜TC-6 で、修正後ビルドでは invalidate 後も focus が当該フィールドへ復帰し caret が保持されることを
before/after の数値観測で確認した（いずれも after で `isBody:false`、caret 一致）。

## 判定: N/A（#670 既存実証を引用 / 修正後の解消を TC-2〜6 で確認）

注: 参照ファイル `.issue/670/step0-results.md` は本検証時点でリポジトリに存在しなかった
（`.issue/670/` ディレクトリ自体が無い）。#670 の結論はコミットログ
（"docs: #670 Step 0 実証 — invalidate 起因の再マウント/編集内容喪失は再現せず（no-repro）"）
および本フックの JSDoc（"#670 Step 0 confirmed the node is NOT remounted and useState is preserved …
the focused subtree is momentarily detached during the commit and the browser drops focus to <body>"）から確認した。
