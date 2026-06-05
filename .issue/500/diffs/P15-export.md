# P15-export 突き合わせ
対応: route=`app/routes/export/index.tsx`, components=[`export/ExportForm`,`ExportForm/Page`], styles=[—]

共通シェル付きでエクスポート設定モーダルを描いたページ。SHELL.md A 反映済み。

## A. モック修正（実装に寄せた＝書き換えた）
- [x] ヘッダー shell（アップロード pill 追加 / 新規作成 / placeholder） / 観点:component。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- **エクスポートフォームのデザイン全体が未実装**。実装 `ExportForm` は className を一切持たない**素の HTML**（`<fieldset>`/`<label>`/`<button>` をトークン無しで描画）。モックは形式ラジオ（HTML/Markdown/PDF）、対象選択（このノート/選択した複数件/ビュー）、FrontMatter/メディア埋め込みチェック、PDF 用紙サイズ等を Apple Calm トークンで整えている。
  - 方針2（明らかに未実装）: モックを正に残す。実装側のスタイル適用を別 Issue 化。別Issue化候補:Yes。
  - 実装にある機能: 形式(html/markdown/pdf)、FrontMatter を含める、メディアを埋め込む、PDF 用紙サイズ(A4/Letter)、単一=「ダウンロード」/一括=「対象ノート ID（改行/カンマ区切り）」textarea + 「一括エクスポートを開始」。
  - モックと実装の差（実装が正になった場合に将来モック修正が必要な点、現時点では未実装ゆえ保留）:
    - 対象選択 UI: モック=ラジオ（このノート/選択した複数件/ビュー）/ 実装=単一は noteId 固定・一括は ID テキストエリア（ラジオではない）。
    - 形式ラベルにファイルサイズ目安・説明（`.sub`/`.count`）: 実装には無い。

## C. 要判断（曖昧）
- モックの「ビューをエクスポート」対象オプション。実装は単一 or 一括(ID列挙)のみで「ビュー」スコープの導線は ExportForm に無い（enqueueExport の scope は "multiple"）。未実装か非対応かは要判断（フォーム未実装に内包）。
- エクスポートが**モーダル**（モック）か**ページ**（実装 ExportFormPage は `<main>` 直下）か。実装はページ型。フォーム未実装ゆえ、スタイル実装時にモーダル/ページのどちらに寄せるか要判断。
