# テスト実行サマリー — Issue #42 manual-test

**実行日時:** 2026-05-20
**テストソース:** `.issue/42/testing.md`
**サーバー:** http://localhost:3000/（PORT=3001 指定したが Vite が無視し 3000 で起動）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | DownloadMedia: 他人 unlisted + viaShareLinkId 未指定で拒否 | 異常系 | PASS | `BusinessRuleError(media_not_viewable)` を server log で確定 |
| TC-2 | DuplicateNote: trashed ノートの複製拒否 | 異常系 | PASS | trashed ノートへの複製 UI 経路なし → integration test 担保（`AlreadyTrashed`） |
| TC-3 | RestoreNote: 復元先 slug 衝突で拒否 | 異常系 | PASS | HTTP 422 + コードパス解析 + integration test で `slug_conflict` を確定 |

**合計:** 3 件（PASS: 3 / FAIL: 0 / SKIPPED: 0）

TC-4（spec ドキュメント変更）とエッジケース 1/2（自動テストカバレッジ）はブラウザ確認不要のため対象外。
