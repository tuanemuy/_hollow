# P13-upload 突き合わせ
対応: route=`app/routes/_app/upload/index.tsx`, components=[`ingestion/UploadPage`,`UploadForm`,`DiscardedToggle`,`IngestionQueue`,`IngestionJobRow`], styles=[`layout/styles.ts`,`common/styles.ts`]

共通シェルは SHELL.md A 反映済み。

## A. モック修正（実装に寄せた＝書き換えた）
- [x] ヘッダー shell（placeholder / 新規作成 / アップロード pill 追加） / 観点:component。
- [x] page-subtitle 文言を実装に差し替え（「ファイルから新しいノートを作成します。LLM が…」→「裏で進行中・失敗・プレビュー保留のアップロードを管理する画面です。新規取り込みはヘッダーの『アップロード』ボタンから開くモーダルで完結します。」） / 観点:component / 根拠:実装は本ページを**キュー管理**ページと位置づけ、新規取り込みはモーダル(UploadDialog)。
- [x] ドロップゾーンをアイコン+別ボタン構成 → 領域全体クリックの label に簡素化（実装 UploadForm：アイコン無し、別ボタン無し、コピー「ファイルをドラッグ&ドロップ またはクリックして選択 / 複数選択にも対応」、bg=surface-elevated） / 観点:component / 修正:`.dropzone-icon`・「ファイルを選択」primary ボタン削除、title を `<strong>+secondary` テキストに、padding 56→48px、bg surface→surface-elevated。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- 「対応形式」チップ列（`.format-chips`：HTML/Markdown/Word…）。実装 UploadPage はページ上に対応形式チップを並べない（対応形式の案内はモーダルの説明文に集約）。根拠: 実装ページに無い。別Issue化候補:No（モーダル側に文言あり）。※モックのチップは残置。
- ドロップゾーン直下のエラー/警告バナー（対応外形式 / サイズ超過）。実装は inline `role="alert"`（UploadForm の displayError）で出すが、モックのような常設バナー2種の見本は持たない。残置。別Issue化候補:No。
- アクションバーの一括操作（すべて再生成 / 破棄 / 個別保存 / 完了分をまとめて保存）。実装 IngestionQueue/IngestionJobRow は**カードごとの個別アクション**のみで、ページ全体の一括操作バーを持たない。根拠: 実装に bulk バーが無い。別Issue化候補:Yes（取り込み一括操作）。※モック残置。
- DiscardedToggle（「破棄済みを表示」）。実装はキューの上に表示トグルがあるが、モックには無い。→ 実装にあってモックに無い要素（モック追加は本Issュースコープ外）。別Issue化候補:No。

## C. 要判断（曖昧）
- **キュー表現の根本差**: モックは 7 カラムの**テーブル**（チェック / ファイル名(形式アイコン+サイズ) / 形式 / 状態(OCR進捗バー) / 抽出タイトル / 保存先 / アクション）。実装 IngestionJobRow は**カード型**（ファイル名 + mime/サイズ、状態チップ、プレビュータイトル+タグ、カード内アクションピル）で、OCR 進捗バー・形式アイコンバッジ・保存先カラム・抽出タイトルカラムを持たない。
  - 論点: 実装(方針1)に寄せるとテーブル → カードへの全面書き換え + 進捗バー等の見本喪失。取り込み進捗の可視化（#221）の意図とも絡むため、本Issueの一存で潰さず要判断として残置。テーブルは現状維持。
- 状態ラベル: モック「待機中 / OCR中…68% / 解析中…」等。実装 statusLabel は 待機中/処理中/プレビュー可能/保存済み/失敗/破棄済み（進捗%・OCR の細分は持たない）。上記キュー差に内包。
