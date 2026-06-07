# テスト実行サマリー — Issue #571

**実行日時**: 2026-06-07〜08
**テストソース**: .issue/571/testing.md
**サーバー**: http://localhost:3017（pnpm dev, Cloudflare runtime）
**ログインユーザー**: dev-admin（`pnpm seed:dev-admin` + bio/last_username_changed_at/updated_at UPDATE）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-01 | アバター未設定時のイニシャル fallback | 正常系 | PASS | avatar-large にイニシャル表示、img なし |
| TC-02 | アバターアップロード→プレビュー→保存 | 正常系 | BLOCKED(環境) | presign 200（avatar kind OK）、PUT が R2 CORS preflight 403。ローカル環境制約（実装バグではない） |
| TC-03 | アバター削除→保存 | 正常系 | BLOCKED(環境) | TC-02 前提（保存済み avatar が必要）。削除ボタンは preview 成立時に出現することは確認 |
| TC-04 | リセットで未保存変更が破棄 | 正常系 | PASS | 表示名・自己紹介・bio カウンタ（37/500）が初期値へ復帰 |
| TC-05 | 「最終保存」タイムスタンプ表示 | 正常系 | PASS | 「2026年6月5日 23:30」表示。hydration mismatch を検出→修正済み |
| TC-06 | ユーザー名「次に変更できる日付」表示 | 正常系 | PASS | 「次に変更できるのは2026年7月1日以降です。」 |
| EDGE-1a | 非対応形式（gif）reject | 異常系 | PASS | 「PNG または JPEG を選択してください。」、presign/PUT 発生せず |
| EDGE-1b | サイズ超過（46MB）reject | 異常系 | PASS | 「ファイルサイズは5MBまでです。」、presign/PUT 発生せず |
| EDGE-2 | lastUsernameChangedAt=null で日付非表示 | 異常系 | PASS | 静的ヘルプのみ表示、「次に変更できる日付」非表示（虚偽表示回避） |

**合計**: 9 件（PASS: 7 / BLOCKED(環境): 2 / FAIL: 0）

## 検証中に発見・修正したバグ

- **hydration mismatch（最終保存 / 次に変更できる日付）**: `ProfileForm` は `"use client"` で SSR + hydration 両方描画されるため、`toLocaleString` のローカル TZ 整形と `new Date()` がサーバー（UTC）とクライアント（JST）で食い違い React の hydration mismatch（`14:30` vs `23:30`）が発生していた。`mounted` フラグでマウント後にのみ当該表示を描画する修正を適用（ADR-007）。修正後、新サーバーログで hydration エラー 0 件を確認。

## 環境制約メモ（Issue 起票せず）

- **TC-02/TC-03（avatar アップロード/削除）**: ブラウザ→R2 への presigned PUT は R2 バケットの CORS 設定が必要。ローカル dev では `localhost` origin が許可されておらず OPTIONS preflight が 403。これは avatar 固有ではなく既存のノート画像アップロード（同じ MediaUploader / presign→PUT→finalize フロー・同じ R2 バケット）も同様に制約される**環境問題**で、実装の欠陥ではない。presign が `kind:"avatar"` で 200 を返し object key に `/avatar/` セグメントが入ることまで確認済み（配線は正しい）。実機（CORS 設定済みステージング/本番）での確認が必要。
</content>
