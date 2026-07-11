# 残存課題 — Issue #287

**作成日:** 2026-07-11

plan.md の実装ステップはすべて完了（unit 4541 件 green・ブラウザ検証 8/8 PASS）。以下はブラウザ検証で実機確認された既知の制限。

## snapshot 追従の欠如による道連れ巻き戻り（フォローアップ Issue 起票対象）

- **内容:** InlineEditor の保守的 rollback（ADR-003 #233）は、エディタ全体を「最後の rebuild 時点の snapshot」まで巻き戻す。rebuild は外部 `value` 変更時のみ発生するため、rollback トリガー（Element remove を含む mutation バッチ）を踏むと、それまでの未 rebuild 編集がすべて道連れで消える。
- **実害シナリオ（TC-007 で観察):** #287 で `<td><br></td>` が新たに editable になった結果、空セルへの 1 文字入力（ブラウザがプレースホルダ `<br>` を remove するバッチ）が rollback を誘発。保存済みだった他ブロックの入力が DOM から消え、その後の入力で巻き戻り後の本文が自動保存され、編集がサイレント消失する。
- **理由（スコープ外判断):** rollback の粒度・snapshot 追従は #233 由来の既存設計で、本 Issue のゲート変更とは独立した改善。plan.md リスク欄・adr.md ADR-002 で当初からスコープ外と整理済み。
- **影響範囲:** inline モードで空セル/画像削除試行などの rollback トリガーを踏んだ場合のみ。通常のテキスト編集・メディア挿入フローは影響なし（TC-001〜004 PASS）。
- **対応:** Phase 4 でフォローアップ Issue を起票する。

## 軽微な観察（起票不要）

- `<pre>` 末尾で Enter → 入力すると Chromium の caret 挙動で新規テキストが `\n` の前に入る（構造・リテラル改行は正常）。
- testing.md の「別タブで編集ロック」記述は現実装（ロック機構なし・disabled は保存 transition 中のみ）と乖離。本 Issue の回帰ではない。
