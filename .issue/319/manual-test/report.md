# ブラウザ検証レポート — Issue #319

**実行日時:** 2026-05-29
**テストソース:** `.issue/319/testing.md`
**サーバー:** http://localhost:3001 （`pnpm dev`、3000 使用中のため 3001 にフォールバック）
**ツール:** agent-browser 0.27.0
**ログインユーザー:** `existing@example.com`（ローカル D1 既存シードユーザー）

---

## サマリー

| TC | 確認内容 | 種別 | 結果 |
|----|---------|------|------|
| TC-1 | アップロードモーダル select view 描画（見出し / ドロップゾーン / キュー誘導リンク） | 回帰 | PASS |
| TC-2 | 初回アップロード: select → uploading → waiting → editing 遷移 | 正常系（回帰） | PASS |
| TC-3 | `/upload` 取り込みキュー画面の描画（キュー誘導の飛び先） | 回帰 | PASS |

**合計:** 3 件（PASS: 3 / FAIL: 0）

## 詳細

- **TC-1:** モーダルを開き、見出し「アップロード」・説明文・ドロップゾーン「ファイルをドラッグ&ドロップ」・「取り込みキューを見る」リンク（/upload）がすべて描画されることを確認。本 Issue の view 型変更（`origin` 追加・`queueGuidance` 追加）による select view のレンダリング回帰なし。
- **TC-2:** 小さな Markdown（`/tmp/test-319.md`）を投入し、`uploading` → `waiting`（「LLM がタイトルとメタデータを提案中...」）→（ローカルパイプラインが完走し）`editing`（「プレビュー編集に進みました」/ タイトル AI 提案 / 本文プレビュー / ディレクトリ選択）まで遷移。初回アップロード起点（origin: "upload"）の waiting → editing が正常動作することを確認。
- **TC-3:** `/upload` キュー一覧が描画され、投入した `test-319.md` が表示されることを確認。

## スクリーンショット

- `screenshots/smoke-01.png` — モーダル select view
- `screenshots/smoke-02-editing.png` — アップロード完走後の editing view
- `screenshots/smoke-03-upload-queue.png` — /upload 取り込みキュー画面

## ブラウザで検証しなかった項目とその理由

本 Issue の核心である「`waiting` ポーリング中の **fatal error** 発生時の遷移出し分け（既存ジョブ起点→`queueGuidance` / 初回アップロード起点→`select`）」は、ブラウザ上で fatal error を意図的に再現する手段がない（フォールトインジェクション不可）ため、ブラウザ検証の対象外とした。

この核心ロジックは `app/components/ingestion/__tests__/UploadDialog.test.tsx` のユニットテストで view machine レベルに担保している（起点別 fatal → 遷移先の出し分け、全25ケース PASS）:
- 再生成起点（existingJob）の fatal → `queueGuidance`（ドロップゾーンに戻らない）
- retry 起点（existingJob）の fatal → `queueGuidance`
- 初回アップロード起点（upload）の fatal → `select`（従来通り）

## 備考

- `/signup` からの新規ユーザー登録はブラウザ経由で成立せず（フォーム送信が発火しない様子。原因未特定）、既存シードユーザーでログインして検証を完遂した。これは本 Issue（取り込みモーダル）と無関係な認証フォームの挙動であり、別途確認の余地がある（本 Issue のスコープ外）。
- コードは一切変更していない。
