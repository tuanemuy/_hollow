# ブラウザ検証レポート — Issue #396

**実行日:** 2026-06-03
**テストソース:** `.issue/396/testing.md`
**サーバー:** http://localhost:3010（hollow2 worktree, `pnpm dev`）

## サマリー

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-1 | /admin/prompts の文言是正 | 正常系 | PASS |
| TC-2 | UploadDialog の文言是正 | 正常系 | PASS |

**合計:** 2 件（PASS: 2 / FAIL: 0 / SKIP: 0）

## TC-1: admin プロンプト設定画面（/admin/prompts）

admin 認証で確認。全項目 PASS:

- 未上書きカードの既定値ヒント: 「既定値: （追加の指示なし）」（全5カード）
- textarea placeholder: 「どう分析してほしいかの意図を記入（空欄ならシステム既定の動作）」（既定値ラベルと別文言に分離済み）
- フィールドラベル: 「分析の指示（任意）」
- リセット confirm 説明文: 「すべての上書きが削除され、各プロンプトはシステム既定の動作に戻ります。…」
- 禁止文言「プロバイダ既定 / プロバイダ組み込み / プロバイダ既定指示」: 画面上に一切なし

スクリーンショット: `screenshots/tc1-admin-prompts.png`

## TC-2: UploadDialog の per-upload override 文言

ヘッダーのアップロードモーダル →「詳細オプション（カスタムプロンプト）」展開で確認。全項目 PASS:

- 両 textarea（構造化／メタデータ抽出）の placeholder: 「システム既定の動作を使用」
- 出所ラベル: 「既定の出所: システム既定」
- 状態バッジ: 「既定を使用中」（機能不変）
- 禁止文言「LLM プロバイダの既定指示を使用 / プロバイダ組み込み」: なし

スクリーンショット: `screenshots/tc2-upload-dialog.png`

## 補足・環境メモ

- 当初 port 3000 で稼働していた dev サーバーは別 worktree(hollow3)のもので #396 を含まなかったため、hollow2 worktree から別ポート(3010)で `pnpm dev` を起動して検証した。
- 認証 cookie 注入: `__Host-session` は Secure 必須で http の JS `document.cookie` 注入は不可。`agent-browser cookies set "__Host-session" <token> --url http://localhost:3010 --secure --sameSite Lax`（CDP は localhost を secure context 扱い）が有効。admin 認証には `users.email_verified=1` が必要。
- sessions は平文トークンマッチ（`sessionService.ts`）。dev D1 に検証用 admin セッション（token=`verify396admintoken-...`, expires 2030）を投入。ローカル dev DB のテストデータのため本番影響なし。
- prompts.ts の組み立てロジック（①固定＋②追記＋③保護）は `app/core/adapters/llm/__tests__/prompts.test.ts` の unit で担保（ブラウザ非対象）。

FAIL なし。起票した Issue なし。
