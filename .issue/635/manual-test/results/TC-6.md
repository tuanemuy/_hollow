# TC-6: アップロードダイアログのスケルトン（共通 Skeleton 置換 no-regression）

結果: PASS（スケルトン状態を捕捉）

判定の主軸（no-regression）: UploadDialog の共通 Skeleton 置換後もスケルトンが期待どおり描画され、アップロード→スケルトン→プレビューのフロー全体が成立。レイアウト崩れなし。

## 重要: モーダルの開き方

UploadDialog のスケルトン（UploadingView / WaitingView）はモーダルダイアログ内のみで表示される。`/upload` ページではインライン表示で、モーダルは開かない（`UploadDialogMount` は `hash === "upload"` かつ pathname が `/upload` でない時のみ開く設計）。そのため `/#upload`（ホーム + upload ハッシュ）でモーダルを開いてファイルをアップロードすることでスケルトンを再現した。

## 操作ログ

| 手順 | 操作 | 結果 |
| --- | --- | --- |
| 1 | `/upload` を開く | アップロード管理画面。ドロップゾーン・ジョブ一覧（空）正常描画 |
| 2 | ドロップゾーンにファイルをアップロード | IngestionQueue に「プレビュー可能」ジョブ生成（AI 提案タイトル・タグ付き）。ingestion フロー正常 |
| 3 | `/#upload` でアップロードモーダルを開く | モーダル（heading「アップロード」、ドロップゾーン）表示 |
| 4 | モーダルの file input にファイルをアップロード、直後に連続スクリーンショット | **WaitingView スケルトン捕捉**: surface 色のバー 3 本（中央寄せ・幅 ~75/50/66%）がパルス、キャプション「LLM がタイトルとメタデータを提案中...」＋サブ「この処理には数十秒かかることがあります」 |
| 5 | 完了後 | モーダルがプレビューフォームへ遷移（AI 提案タイトル「tc6-modal」、DirectoryPicker、AI 提案タグ「testing」、キャンセル/破棄/再生成/登録）。レイアウト崩れなし |

## pending / skeleton 観察

- 捕捉できた。06-modalskel-2.png に WaitingView スケルトン（3 本のバー＋キャプション＋サブラベル）が明瞭に写っている。testing.md の期待（バー 3 本・surface 色・中央寄せ・パルス）と一致。
- アップロードが速いため UploadingView（「N 件のファイルをアップロード中...」）の段階は未捕捉だが、同一 Skeleton コンポーネントなので描画は同等。

## コンソール

- アプリ機能由来のエラーはなし。
- React のハイドレーション不一致警告（"A tree hydrated but some attributes ... didn't match"）が観測されたが、要素名を特定しない汎用 SSR 警告で、TanStack Start dev では既知の一般的事象。#635 変更（Skeleton 置換）に起因すると断定する根拠はない。要監視として記録。

## スクリーンショット

- screenshots/tc-6/01-after-upload.png
- screenshots/tc-6/02-preview-dialog.png（queue 行プレビュー）
- screenshots/tc-6/05-modal-open.png
- screenshots/tc-6/06-modalskel-2.png（**WaitingView スケルトン捕捉**）
- screenshots/tc-6/07-modal-preview.png（スケルトン→プレビュー遷移完了）
