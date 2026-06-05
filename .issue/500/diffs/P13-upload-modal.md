# P13-upload-modal 突き合わせ
対応: route=`app/routes/_app/upload/index.tsx`（モーダル on ホーム）, components=[`ingestion/UploadDialog`(SelectView),`common/Dialog`], styles=[`common/styles.ts`]

共通シェル付きでモーダル（select ステート）を重ねたフルページ版。SHELL.md A 反映済み。

## A. モック修正（実装に寄せた＝書き換えた）
- [x] ヘッダー shell 3 点（アップロード icon-btn → pill / 新規→新規作成 / placeholder） / 観点:component。
- [x] モーダル dropzone のアイコン（円形 + Upload SVG）を削除 / 観点:component / 旧:dropzone-icon あり → 実装 SelectView:アイコン無し、テキストのみ / 修正:`.dropzone-icon` 削除。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- 「詳細オプション（カスタムプロンプト）」details アコーディオン（構造化/メタデータプロンプト上書き）。実装 SelectView にあるがモックに無い（実装にあってモックに無い欠落）。モック追加は本Issueスコープ外。別Issue化候補:No。
- モーダル説明文「ファイルから新規ノートを作成します。HTML / Markdown / Office / PDF / 画像 / 音声に対応しています。」は実装と一致（残置）。

## C. 要判断（曖昧）
- 「取り込みキューを見る」リンクの配置: モックは独立 `.modal-footer`。実装 SelectView は body 内末尾の `mt-6 flex justify-end`（独立フッターではない）。Dialog primitive のフッター扱いに依存するため軽微。要判断（実害小）。
- P13-upload-modal は P13a と内容が重複（select ステートのみ）。P13a が 3 ステート正本、P13-upload-modal がシェル込みフォールバック（index.md §9.アップロードモーダル）。両者の役割分担は維持。
