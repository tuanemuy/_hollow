# Issue #452 ブラウザ検証サマリー

**実施日:** 2026-06-04
**環境:** http://localhost:3005（Cloudflare runtime / vite dev）, ブランチ issue/452/persist-source-files, マイグレーション 0014 適用済み
**ツール:** agent-browser 0.27.0（session verify-452 / verify-452-anon）

## 結果一覧

| TC | 内容 | 結果 |
|----|------|------|
| TC-1 | source 付きノート詳細に「元ファイル」セクション＋ファイル名＋リンク href | PASS |
| TC-2 | /media/<id> 直アクセスで 302（inline）/ ?download=1（ダウンロード） | inline=PASS / download=**修正後 PASS** |
| TC-3 | source なしノートで「元ファイル」非表示・UI 非破壊 | PASS |
| TC-4 | 未ログインで他人のソースメディアにアクセス拒否（所有者認可） | PASS（未ログインで代替） |

## 実装バグ（1件・検出→Phase 2 で修正済み）
**初回検出:** /media/<id>?download=1（UI の「ダウンロード」リンクが生成する形）が HTTP 500。
TanStack デフォルト検索パーサが裸の 1 を数値にパースし、ルート mediaSearchSchema の
z.union([z.boolean(), z.literal("1"), z.literal("0")]) が数値 1 を拒否 → validateSearch が throw。

**修正:** `app/routes/media/$mediaId.tsx` の union に `z.literal(1)` / `z.literal(0)` を追加し
`.transform((v) => v === true || v === "1" || v === 1)` で正規化。リグレッションテスト
`app/routes/__tests__/mediaSearch.test.ts`（5件）を追加。

**再検証（同 dev サーバ・HMR 反映）:** `?download=1` が 302 で presigned R2 URL へ。
リダイレクト先に `response-content-disposition=attachment; filename="sample-source.pdf"` を確認。
download なし版は disposition 無し（inline）を維持。500 は解消。
→ スクリーンショット `screenshots/REVERIFY-download1-fixed.png`。実装バグの残存なし。

## 環境制約（未検証/失敗扱いにしない項目）
- R2 ローカルエミュレーションにオブジェクト実体が無く、presigned URL 追従先が NoSuchKey を返す。inline の 302 とリダイレクト先 URL の正しさは確認済み。実体バイト取得は環境制約のため対象外。
- 完全な ingestion フロー（アップロード→LLMパース→commit）は LLM 実費のため未実施。シードデータ直投入で詳細画面を検証。
- TC-4 は別ユーザー B のログイン済みアクセスではなく未ログインアクセスで代替。
