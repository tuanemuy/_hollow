# ブラウザ検証レポート — Issue #388

**実行日時**: 2026-06-01
**テストソース**: `.issue/388/testing.md`
**サーバー**: http://localhost:3005（`vite dev`、ライブソース反映）
**ブランチ**: issue/388/directory-move-ui-scalability

## 結論

全4テストケース PASS（FAIL なし）。Issue #388 の2要件（移動先ディレクトリ選択 UI のスケーラビリティ改善 / パス先頭スラッシュ重複の修正）はブラウザ上で期待どおり動作することを確認した。起票が必要な実装バグはなし。

## 結果サマリー

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-001 | パス先頭スラッシュ重複の解消（要件2） | PASS |
| TC-002 | 検索フィルタ＋キーボード/マウス操作（要件1） | PASS |
| TC-003 | cyclic 除外（MoveDirectoryDialog） | PASS |
| TC-004 | フィルタ0件・空状態 | PASS |

詳細は `results/summary.md` および `results/TC-00{1..4}.md` を参照。

## 検証できなかった項目

- **移動の実 submit（mutation）**: agent-browser からの server-function POST は cross-origin（FORBIDDEN_CROSS_ORIGIN）で弾かれるため未実行。本 Issue の変更はピッカー UI・パス表示・cyclic 除外という表示/クライアント側ロジックであり、submit に至るまでの選択・移動ボタン活性化まで確認済み。move アクション自体は本 PR で変更していない。
- **IME 変換中 Enter の誤確定防止**: agent-browser で IME composition を再現できないため自動検証不可。ソース（`DirectorySelectField` の `onKeyDown` の `event.nativeEvent.isComposing` ガード）で実装確認済み。

## 検証環境メモ

- 既存の検証済みユーザー `existing@example.com` を流用し、その root 配下に `Documents > Work > 2024` と `Personal` を D1 直 INSERT してシード。検証後に削除済み（ローカル D1 をクリーン状態に戻した）。
- ログインは better-auth 経由のため成功。新規サインアップ（server-fn）は cross-origin で不可。
