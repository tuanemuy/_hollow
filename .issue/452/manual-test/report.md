# Issue #452 マニュアルテスト最終レポート

**Issue:** #452 — アップロードしたソースファイルを永続保存し、後から閲覧・ダウンロードできるようにする
**実施日:** 2026-06-04
**ブランチ:** issue/452/persist-source-files（マイグレーション 0014 ローカル D1 適用済み）
**検証環境:** http://localhost:3005（Cloudflare runtime / vite dev）
**ツール:** agent-browser 0.27.0（session verify-452, verify-452-anon）

## 対象（フロントエンド描画とリンク）
1. ノート詳細に「元ファイル」セクションが表示（sourceFile 保有ノート）
2. 「閲覧」リンクが /media/<mediaId>（新規タブ）
3. 「ダウンロード」リンクが /media/<mediaId>?download=1
4. sourceFile を持たないノートでは「元ファイル」非表示・UI 非破壊

## シードデータ
- ユーザー（新規 signup → email_verified=1 に更新）:
  - email `qa452@example.com` / password `QaTest452!pass`
  - id `019e8e7e-ed4d-716e-926e-ae63451b8835` / 表示名 QA 452
- source MediaAsset（直接 INSERT）:
  - id `019e8e81-0000-7000-8000-000000000452`
  - kind=source, status=attached, ref_count=1
  - mime_type=application/pdf, original_file_name=sample-source.pdf, byte_size=123456
  - storage_key=`019e8e7e-ed4d-716e-926e-ae63451b8835/source/019e8e81-0000-7000-8000-000000000452`
- ノート（UI 経由で作成後 UPDATE）:
  - source 付き: `019e8e80-14df-7628-9967-65d25df97409`「Source File Note TC1」（source_file_id=上記 mediaId）
  - source 無し: `019e8e80-65f3-7565-be06-52ab1a9b81d6`「No Source File Note TC3」（source_file_id=NULL）

## テスト結果

| TC | 内容 | 結果 |
|----|------|------|
| TC-1 | 「元ファイル」セクション表示・ファイル名・リンク href | PASS |
| TC-2 | /media/<id> 直アクセス: inline 302 / download=1 | inline=PASS / download=FAIL（実装バグ） |
| TC-3 | source 無しノートで「元ファイル」非表示・UI 非破壊 | PASS |
| TC-4 | 未ログインで他人のソースメディアアクセス拒否 | PASS（未ログインで代替） |

### TC-1 PASS
「元ファイル」行に `sample-source.pdf` を表示。
- 閲覧: href=`/media/019e8e81-0000-7000-8000-000000000452`, target=_blank, rel=noopener
- ダウンロード: href=`/media/019e8e81-0000-7000-8000-000000000452?download=1`
スクショ: TC1-source-file-section.png / TC1-source-file-links.png

### TC-2 inline=PASS / download=FAIL（実装バグ）
- inline（/media/<id>）: 302 → presigned R2 URL（host のみ署名・content-disposition なし＝inline）。追従先 R2 は NoSuchKey（ローカル実体なし＝環境制約）。
- download（/media/<id>?download=1）: HTTP 500。エラー画面「メディアを取得できません」。
  fetch(redirect:manual) で inline=opaqueredirect(302)、download=1=status 500 を確認。
スクショ: TC2-media-302-presigned-r2.png / TC2-BUG-download1-500.png

### TC-3 PASS
source 無しノートで「元ファイル」文字列が DOM に存在せず、プロパティパネル・タイトルは正常。
スクショ: TC3-no-source-file.png

### TC-4 PASS（未ログインで代替）
未ログイン（認証クッキーなし）セッションで所有者の /media/<id> にアクセス → 「メディアを取得できません」。
presigned URL は発行されず R2 へのリダイレクトも発生しない（所有者認可が機能）。
スクショ: TC4-anon-denied.png

## 実装バグ（1件・要修正）

「ダウンロード」リンク /media/<id>?download=1 をクリックすると HTTP 500。

- 原因: TanStack Router のデフォルト検索パーサが検索値を JSON パースするため、裸の `?download=1` は
  文字列 `"1"` ではなく**数値 1** になる。
- ルート `app/routes/media/$mediaId.tsx` の `mediaSearchSchema` は
  `download: z.union([z.boolean(), z.literal("1"), z.literal("0")])` で**数値 1 を受け付けない**。
  → `validateSearch` が Zod `invalid_union`（expected boolean, received number / expected "1" / expected "0"）を throw → 500。
- 影響: NoteMetaPanel.tsx:159 のダウンロードリンクは UI から常にこの形を生成するため、ダウンロード機能が機能しない。
- 補足検証: `?download=true`（boolean 一致）と `?download="1"`（z.literal("1") 一致）はいずれも 302 で成功。問題は「裸の 1（数値）」のみ。
- 修正方針（未修正）: ルートスキーマで数値 1/0 も受理する（z.literal(1)/z.literal(0) 追加 or z.coerce.boolean()）か、リンク側を ?download=true に変更する。

## 環境制約（未検証・失敗扱いにしない）
- R2 ローカルエミュレーションにオブジェクト実体が無く、presigned URL 追従先が NoSuchKey を返す。inline の 302 とリダイレクト URL の正しさは確認済み。実体バイト取得・inline プレビュー/attachment 保存のブラウザ挙動は環境制約のため対象外。
- 完全な ingestion フロー（アップロード→LLM パース→commit）は LLM 実費のため未実施。シードデータ直投入で詳細画面を検証。
- TC-4 は別ユーザー B のログイン済みアクセスではなく未ログインアクセスで代替。

## 成果物
- results/TC-1.md, TC-2.md, TC-3.md, TC-4.md, summary.md
- report.md（本ファイル）
- screenshots/: 00-logged-in-home.png, TC1-source-file-section.png, TC1-source-file-links.png,
  TC2-media-302-presigned-r2.png, TC2-BUG-download1-500.png, TC3-no-source-file.png, TC4-anon-denied.png
