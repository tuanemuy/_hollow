# 動作確認計画 — Issue #817: UsersTable/Jobs の hydration mismatch（日付フォーマット）

**Issue:** #817
**作成日:** 2026-07-10

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:apply:local     # ローカル D1 にマイグレーション適用（未適用の場合）
pnpm seed:dev-admin     # admin ログイン可能なシードユーザーを投入
pnpm dev                # Cloudflare runtime の開発サーバー（localhost:3000）
```

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. /admin/users で hydration mismatch warning が出ない

- **対応する受け入れ基準:** AC-1, AC-3
- **目的:** SSR とクライアントで登録日の整形が一致し、React が hydration mismatch を報告しないことを確認する。
- **手順:**
  1. `pnpm seed:dev-admin` で投入した admin アカウントでログインする。
  2. ブラウザの開発者ツールでコンソールを開いた状態にする。
  3. `/admin/users` を（リロードして SSR → hydration が走る形で）開く。
  4. コンソールの出力を確認する。
- **期待結果:** `Hydration failed because the server rendered text didn't match the client` / `SectionErrorBoundary section="ユーザー一覧"` を含む warning が出ない。ユーザー一覧の「登録日」列が JST 基準の `YYYY/MM/DD` 形式で表示される。
- **確認ポイント:** リロード直後（hydration 時）に日付テキストがちらつかない・警告が出ないこと。

### 2. /admin/jobs で hydration mismatch warning が出ない

- **対応する受け入れ基準:** AC-2, AC-3
- **目的:** ジョブ日時（更新・作成）と再構築/バックフィル結果の日時整形が SSR/クライアントで一致することを確認する。
- **手順:**
  1. admin でログインした状態で、コンソールを開いたまま `/admin/jobs` をリロードして開く。
  2. 取り込みジョブ・エクスポートジョブの「更新」「作成」列の日時表示を確認する。
- **期待結果:** hydration mismatch warning が出ない。日時が JST 基準の `YYYY/MM/DD HH:MM` 形式で表示される。
- **確認ポイント:** ジョブ行が1件以上あるとき（シードにジョブが無ければ空表示でも warning が出ないことを確認）。

## エッジケース・異常系

### 1. 不正な日付文字列のフォールバック

- **目的:** パース不能な値が渡っても整形処理が落ちず、元文字列をそのまま返す既存挙動が壊れていないことを確認する。
- **手順:**
  1. 通常のシードデータでは発生しないため、コードレビュー観点で `Number.isNaN(date.getTime())` の early return が維持されていることを確認する（`timeZone` 追加はこの分岐より後）。
- **期待結果:** 不正値でも例外を投げず元文字列を返す。

## 既存機能への影響確認

- `/admin/users` のユーザー一覧・検索・フィルタ・各アクション（一時停止/復帰/昇格/解除）が従来どおり動くこと（日付整形以外は無変更）。
- `/admin/jobs` のジョブ再実行・検索インデックス再構築・内部リンクバックフィル・再暗号化の各操作の結果表示日時が正しく出ること。
