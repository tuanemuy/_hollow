# TC-1: source 付きノートの詳細画面に「元ファイル」セクションが表示される

**結果:** PASS

## 目的
sourceFile を持つノートの詳細画面に「元ファイル」セクションが表示され、ファイル名と「閲覧」「ダウンロード」リンクが正しい href を指すこと。

## 前提シードデータ
- ユーザー: `qa452@example.com` (id `019e8e7e-ed4d-716e-926e-ae63451b8835`)
- ノート: `019e8e80-14df-7628-9967-65d25df97409`「Source File Note TC1」
- source MediaAsset: `019e8e81-0000-7000-8000-000000000452`
  - kind=`source`, status=`attached`, ref_count=1
  - original_file_name=`sample-source.pdf`, mime_type=`application/pdf`
  - storage_key=`019e8e7e-ed4d-716e-926e-ae63451b8835/source/019e8e81-0000-7000-8000-000000000452`

## 操作ログ

| # | 操作 | 期待 | 結果 |
|---|------|------|------|
| 1 | `/notes/019e8e80-14df-7628-9967-65d25df97409` を開く | 詳細画面表示 | OK |
| 2 | プロパティ内に「元ファイル」行が存在 | 表示される | OK |
| 3 | ファイル名 `sample-source.pdf` が表示 | 表示される | OK |
| 4 | 「閲覧」リンク href | `/media/<mediaId>` | `/media/019e8e81-0000-7000-8000-000000000452` (target=`_blank`, rel=`noopener`) |
| 5 | 「ダウンロード」リンク href | `/media/<mediaId>?download=1` | `/media/019e8e81-0000-7000-8000-000000000452?download=1` (同タブ) |

## スクリーンショット
- `screenshots/TC1-source-file-section.png`
- `screenshots/TC1-source-file-links.png`

## 判定
DOM 構造・ファイル名・両リンクの href すべて仕様どおり。**PASS**。
（リンクの href のみで判定。実体クリックは React onClick の偽陰性回避のため href 検証で代替。リンク先の挙動は TC-2 で検証。）
