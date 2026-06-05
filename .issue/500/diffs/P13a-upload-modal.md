# P13a-upload-modal 突き合わせ
対応: route=`app/routes/_app/upload/index.tsx`（モーダル本体）, components=[`ingestion/UploadDialog`,`IngestionPreviewForm`,`common/Dialog`], styles=[`common/styles.ts`]

P13a は「select / waiting / editing」3 ステートのショーケース。UploadDialog の各 View（SelectView / WaitingView / IngestionPreviewForm）に対応。

## A. モック修正（実装に寄せた＝書き換えた）
- [x] editing ステートのアクションに「再生成」を追加（デスクトップ + モバイル両方） / 観点:component / 旧:キャンセル/破棄/登録 → 実装(IngestionPreviewForm):キャンセル/破棄/再生成/登録。

## B. 実装フォローアップ（モックを正に残した＝未実装）
- なし（select の dropzone コピー「ファイルをドラッグ&ドロップ / 複数選択にも対応」、「取り込みキューを見る」リンク、waiting の skeleton + 「LLM がタイトルとメタデータを提案中...」「数十秒かかることがあります」、editing の AI 提案 ✨ バッジ・タグ（カンマ区切り）・FrontMatter(JSON)・本文プレビュー読み取り専用、ディレクトリ既存select/新規名 — いずれも実装と一致）。

## C. 要判断（曖昧）
- P13a は簡略トークンセット（`--text-*` fluid トークン未定義、`font-size:14px/13px/17px` 等のリテラル）。index.md §9 は全 `:root` コピーを求めるが、本ファイルは複数ステートを並べるショーケースとして簡略化されている。fluid トークン（text-sm=実効13px 等）への置換は §9 整合のため望ましいが、トークン定義の追加を伴うため要判断（P13-upload-modal が正式版なら、そちらに寄せる）。今回は値の意味（14px≒text-sm 実効13px 等）が概ね一致するため未変更。
