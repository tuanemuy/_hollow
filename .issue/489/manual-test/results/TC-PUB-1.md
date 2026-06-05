# TC-PUB-1: publication 公開設定・共有リンク

**結果: PASS**

Issue #489（presentation→domain の id を string に統一する型レベルリファクタ）の publication スライスを検証。すべて従来どおり成功し、500 やエラーは観測されなかった。

## 対象データ
- ノート「検証ノートA改」: `019e9546-cb22-7298-9baf-6361e3f2675c`
- ノート「検証ノートA改 (コピー)」: `019e9549-a511-7654-8299-90e50bd33b05`

## 実行ログ

| # | ステップ | 操作 | 結果 | スクリーンショット |
|---|---------|------|------|------------------|
| 1 | ノート詳細を開く | /notes/{A} | PASS（初期 visibility=非公開） | pub-01-note-detail.png |
| 2 | 公開設定ダイアログを開く | toolbar「公開状態」ボタン | PASS（ダイアログ表示） | pub-02-dialog-open.png |
| 3 | visibility 非公開→限定公開 | radio + 公開状態を更新 | PASS（toolbar が「限定公開」に変化、リンク発行フォーム出現） | pub-03-after-unlisted.png |
| 4 | visibility 限定公開→公開 | radio + 公開状態を更新 | PASS（toolbar が「公開」に変化） | pub-04-after-public.png |
| 5 | 共有リンク発行（パスワード付き） | パスワード入力 + リンクを発行 | PASS（「発行されたリンク（一度だけ表示）」URL 表示、行に「パスワード設定中」相当の解除ボタン出現） | pub-05-link-issued-with-password.png |
| 6 | 共有リンク失効（パスワード付きリンク） | 失効させる | PASS（「失効済み」表示、操作ボタン消失）※eval click で発火 | pub-06-link-revoked.png |
| 7 | 共有リンク発行（パスワードなし） | リンクを発行 | PASS（新規 active リンク発行） | pub-07-link-issued-nopw.png |
| 8 | 行のパスワード設定 | 新しいパスワード入力 + パスワードを設定 | PASS（「パスワード設定中」チップ＋「パスワードを解除」ボタン出現） | pub-08-password-set.png |
| 9 | 共有リンク失効 | 失効させる | PASS（両リンクとも「失効済み」） | pub-09-final-revoked.png |
| 10 | 一覧で 2 ノート選択（選択モード） | 選択モード + 2件チェック | PASS（「2 件選択中」、バルクアクション有効化） | pub-10-bulk-selected.png |
| 11 | バルク公開設定ダイアログを開く | バルク「公開設定」 | PASS（「2 件のノートの公開設定を変更」表示） | pub-11-bulk-visibility-dialog.png |
| 12 | バルク visibility 変更を適用（→非公開） | 非公開 radio + 適用 | PASS（エラーなしで完了、選択クリア） | pub-12-bulk-applied.png |
| 13 | バルク結果検証 | /notes/{A} 再読込 | PASS（visibility=非公開 に反映） | — |

## 確認した usecase 経路（すべて成功）
- changePublicationVisibility（手順3,4,12）
- issueShareLink（手順5,7、パスワードあり/なし両方）
- setShareLinkPassword（手順8）
- revokeShareLink（手順6,9）
- bulkChangePublicationVisibility（手順12、failures は発生せず）

## 気づいた点
- agent-browser の `click {ref}` / `find text click` で一部の React onClick（共有リンク行の「失効させる」「パスワードを設定」）が発火しないことがあった。既知の偽陽性問題に該当。`element.click()` の eval 経由および native value setter + input イベントで正常に発火・成功を確認したため、実装バグではない。
- バルク変更は failures なしで全件成功。失敗ノートが出るケース（trashed 等）は今回のデータでは再現せず未検証だが、`failures` の表示経路は BulkVisibilityDialog 実装に存在する。
- 共有リンク URL は `http://localhost:8787/...`（appUrl 設定値）で生成され、ブラウザの 3000 ポートとは別。これは appUrl 構成由来で本 Issue とは無関係。
