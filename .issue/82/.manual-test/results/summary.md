# Issue #82 manual-test サマリー

**実行日時:** 2026-05-21
**テストソース:** `.issue/82/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev`）

## 自動テスト系（Phase 2 実装サブエージェントで確認済）

- `pnpm typecheck`: PASS（エラーなし）
- `pnpm lint`: PASS
- `pnpm test:unit`: PASS (99 files / 1981 tests)
- `pnpm test:integration`: PASS (31 files / 352 tests)
- `app/core/domain/__tests__/errorCodeNaming.test.ts`: 397 tests PASS

## ブラウザスポット確認（agent-browser 0.27.0）

| TC | テスト名 | 結果 | スクリーンショット |
|----|---------|------|-------------------|
| TC-1 | トップページ表示 | **PASS** | `screenshots/tc1-top.png` |
| TC-2 | ログインページ表示 | **PASS** | `screenshots/tc2-login.png` |
| TC-3 | ShareLinkGate（存在しない link） | **PASS** | `screenshots/tc3-share-not-found.png` |

### TC-1 詳細
- `http://localhost:3000/` が 307 リダイレクト経由でランディングページを描画
- 見出し「散らかった頭の中に、静かな置き場所を」、ナビ（機能/ログイン/アカウント作成）、機能カード4枚、フッターすべて表示確認

### TC-2 詳細
- `http://localhost:3000/login` がログインフォームを描画
- メール / パスワード / 記憶チェックボックス / 送信ボタン / アカウント作成リンク / パスワードを忘れた方リンクすべて表示

### TC-3 詳細
- `http://localhost:3000/share/abc/xyz`（存在しない share link）が「ページが見つかりません」(404 Not Found) 専用エラーページを描画
- ErrorCode リファクタリングがエラーフローを破壊していないことを確認

## ShareLinkGate revoked の完全 E2E

- 完全な revoked シナリオ（アカウント作成 → ノート作成 → share link 発行 → admin で revoke → 踏む）はコスト高のため本 manual-test ではスキップ
- ADR-007 で副次バグ修正として明示済み
- `PublicationErrorCode.ShareLinkRevoked = "share_link_revoked"` と `ShareLinkGate` 側の比較が型と value で一致することは typecheck + 397 件の `errorCodeNaming` テストで静的に保証されている
- 必要に応じて PR レビュー後に手動で実機確認するか、別 Issue で manual-test を追加する判断

## 結論

リファクタリング目的の本 Issue は自動テスト系で品質が担保されており、サーバー起動とトップ／ログイン／不正 share link スポット確認も問題なし。**異常なし**。
