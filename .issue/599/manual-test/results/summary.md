# 動作確認サマリー — Issue #599

公開系ルートで存在しない／非公開ノート・ユーザーを開いたときの 404/410 表示検証。
agent-browser によるブラウザ検証（各 TC 別セッション）。

## サマリー表

| TC | AC | URL | 期待 | 実際の表示 | 判定 |
|----|----|-----|------|-----------|------|
| TC-1 | AC-1 | /notes/public/…ffff | 410 このノートは公開されていません | 410 「このノートは公開されていません」(Error code: 410 Gone) | PASS |
| TC-2 | AC-1/AC-4 | /notes/public/…b004（非公開 id） | TC-1 と同一 410 | 410 「このノートは公開されていません」TC-1 と完全一致 | PASS |
| TC-3 | AC-2 | /u/dev-admin/this-slug-does-not-exist | 410 このノートは公開されていません | 410 「このノートは公開されていません」(Error code: 410 Gone) | PASS |
| TC-4 | AC-3 | /u/nonexistent-user-xyz | 404 ページが見つかりません | 404 「ページが見つかりません」(Error code: 404 Not Found) | PASS |
| TC-5 | AC-5 | /notes/public/…203 と /u/dev-admin/p671-note-03 | ノート正常表示 | 「1週間以内のノート hollow671」本文・メタ・関連を両 URL で正常表示 | PASS |
| TC-6 | AC-5 | /u/dev-admin | プロフィール＋ノート一覧 | 「Dev Admin」プロフィール＋公開ノート 5 件を正常表示 | PASS |

## 集計

- PASS: 6 / FAIL: 0
- 500「予期しないエラー」は全 TC で発生せず。修正は有効。
