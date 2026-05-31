# テスト実行サマリー — Issue #388

**実行日時**: 2026-06-01
**テストソース**: `.issue/388/testing.md`
**サーバー**: http://localhost:3005（`vite dev`、ライブソース反映）
**ブランチ**: issue/388/directory-move-ui-scalability

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | パス先頭スラッシュ重複の解消（要件2） | 正常系 | PASS | 3ダイアログで `//` なし・単一スラッシュ確認 |
| TC-002 | 検索フィルタ＋キーボード/マウス操作（要件1） | 正常系 | PASS | 3箇所で combobox+listbox、フィルタ、Arrow/Enter、クリック、二択UI確認。submit は cross-origin のため未実行 |
| TC-003 | cyclic 除外（MoveDirectoryDialog） | 異常系 | PASS | Documents の子孫除外＋（ルート）重複なし |
| TC-004 | フィルタ0件・空状態 | 異常系 | PASS | aria-live 空メッセージ＋listbox消失 |

**合計**: 4 件（PASS: 4 / FAIL: 0）

## 検証できなかった項目
- 移動の submit（実 mutation）: server-fn POST はブラウザ自動操作では cross-origin で弾かれる方針。UI・選択・活性化まで検証。
- IME 変換中 Enter: agent-browser で composition 再現不可。ソースで `event.nativeEvent.isComposing` ガード確認済み。

## ブラウザ経由 mutation
- signup: 送信後 `/signup` に留まり DB 反映なし・ログ出力なし（client で握り潰し / FORBIDDEN_CROSS_ORIGIN 整合）。
- login: better-auth 経由のため成功。
- move: submit 未試行。

## 起票が必要な実装バグ
なし。
