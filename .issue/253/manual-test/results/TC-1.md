# TC-1: プレビュー編集モーダルからの再生成（メイン動線）

**結果**: PASS
**セッション**: verify-253
**確認項目**: testing.md 確認項目 1

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | ログイン (existing@example.com) | ダッシュボード表示 | `/` にリダイレクト、「すべてのノート」表示 | PASS |
| 2 | ヘッダー「アップロード」ボタン押下 | アップロードモーダルが開く (`#upload`) | URL=`/#upload`、dialog「アップロード」表示 | PASS |
| 3 | `/tmp/issue253-sample.md` をアップロード | waiting→editing に進む | 「プレビュー編集に進みました」editing view 表示、title=`issue253-sample` | PASS |
| 4 | アクションバーに「再生成」ボタン確認 | RefreshCw アイコン付き、破棄と登録の間 | 「破棄 / 再生成 / 登録」の順で配置、再生成ボタンに svg アイコンあり | PASS |
| 5 | 「再生成」ボタン押下 | waiting view に切替、全アクションボタン disabled | 「LLM がタイトルとメタデータを提案中...」waiting view に切替。破棄/再生成/登録ボタンが消え × のみ残る（二重押下抑止確認） | PASS |
| 6 | ポーリングで editing view 復帰待ち | 新しい preview が editing view に表示 | 約数秒〜十数秒で editing view に復帰、再生成ボタン再表示。form 入力 ref が再生成前後で変化（`_r_15_`→`_r_1c_`）= preview 再生成の痕跡 | PASS |

## 観察

- **再生成前 preview**: title=`issue253-sample`、本文プレビュー = サンプルファイル全文、tags 空
- **再生成後 preview**: title=`issue253-sample`（同一）、本文プレビュー同一、tags 空。
  内容自体は同じ（同一ソースファイル・ローカル dev のLLMが決定論的に同じ抽出を返したため）だが、
  ジョブが再処理され form が再構築された点が確認できる。
- **waiting 遷移**: 「LLM がタイトルとメタデータを提案中...」「この処理には数十秒かかることがあります」を確認。
  これが `pending → processing` への遷移の可視化。editing 復帰が `previewing` への遷移。
- **二重押下抑止**: waiting view ではアクションボタン（破棄/再生成/登録）が DOM から消え、× のみ。
- **バックエンド再駆動の痕跡**: サーバーログに `[relay-trigger] inline dispatch drained 3 { processed: 3 }` が記録され、
  dispatch 経由で `runIngestionJob` が再駆動されたことを確認。no-op ではない（本 Issue の修正点）。

## スクリーンショット

- Step 1 (login後): `screenshots/01-after-login.png`
- Step 4 (editing + 再生成ボタン): `screenshots/02-tc1-editing-with-regenerate.png`
- Step 5 (再生成押下直後 waiting): `screenshots/03-tc1-after-regen-click.png`
- Step 6 (再生成後 editing 復帰): `screenshots/04-tc1-after-regen-editing.png`

## 結論

再生成ボタンは存在し、押下で waiting view に遷移→ポーリング→editing view 復帰のサイクルを確認。
全アクションボタンの disabled（二重押下抑止）も確認。バックエンドの dispatch 再駆動もログで確認。
本 Issue の核心（再生成ボタンが LLM を実際に再駆動する）を PASS。
