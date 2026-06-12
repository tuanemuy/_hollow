# 動作確認サマリー — Issue #499 ノート一覧の行全体クリック

**実行日:** 2026-06-06
**環境:** http://localhost:5175 / dev-admin（ノート3件: A=excerpt/タグ無し, B=excerpt+タグ「#日記 #アイデア」, C=excerpt有/タグ無し別日付）
**ツール:** agent-browser（CDP 経由で secure cookie 注入）

## 結果一覧

| TC | 内容 | 結果 |
|----|------|------|
| TC-001 | ListView 行全体クリック（excerpt/日時/左右余白） | PASS |
| TC-002 | CalendarView 行全体クリック（title 文字外の余白） | PASS |
| TC-003 | hover ハイライト範囲とクリック領域の一致（list/calendar） | PASS |
| TC-004 | 行リンクのアクセシブルネーム = note.title | PASS |
| TC-E1 | 選択モード時の行クリック=選択トグル・チェックボックス単発トグル（list/calendar） | PASS |
| TC-E2 | excerpt/タグ無しノートの行クリック（レイアウト崩れなし） | PASS |

**合計: 6 / PASS: 6 / FAIL: 0**

## 主な確認事項

- ListView / CalendarView とも行全体が全幅（972px）の `<a href="/notes/{id}">` で構成され、title 文字以外（excerpt・日時・余白）クリックでも詳細へ遷移する。
- hover の `hover:bg-surface` を持つ `<li>` の範囲とクリック可能な anchor 範囲が座標一致（list/calendar とも）。ハイライトするがクリック無反応な領域は無い。
- 行リンクの `aria-label` は note.title のみ（excerpt/タグ/日時を含まない）。
- 選択モード ON では行が `role=button` + checkbox に切り替わり、行本体クリックは遷移せず選択トグル、`data-[selected]:bg-accent-surface`（oklch(0.97 0 0)）ハイライトが付く。チェックボックス直接クリックは件数が単調に±1し二重発火しない。
- excerpt/タグ無しノート（A）も全幅 anchor を維持しレイアウト崩れなし。

## 備考
- TC-E2 実行中に一度セッションの認証 cookie が落ち未認証ページに戻る事象あり。cookie 再注入で復旧し正常結果を取得。Issue #499 対象機能の不具合ではなく、テスト環境のセッション維持に起因。
