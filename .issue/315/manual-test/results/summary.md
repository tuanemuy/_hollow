# Issue #315 手動テストサマリー

検証日: 2026-05-30 / 環境: http://localhost:3000 / agent-browser 0.27.0 / session=verify-315
ログインユーザー: admin@example.com（@admin-user, role=admin）

| TC番号 | 名前 | 結果 |
|--------|------|------|
| TC-001 | ログイン | PASS |
| TC-002 | ユーザー管理画面へ | PASS |
| TC-003 | 自分の行（admin-user）にアクションボタンが出ない【主眼】 | PASS |
| TC-004 | 他 admin の行（admin309）にアクションボタンが出る（非退行） | PASS |
| TC-005 | member / suspended 行（非退行） | PASS |

## 結論

Issue #315 は解消済み。ログイン中の管理者自身（@admin-user）の行ではアクション列が空で、
「一時停止」「管理者を解除」ボタンが表示されない。他 admin・member・suspended の各行では
従来どおり適切なボタンが表示され、非退行も確認。FAIL なし。
