# 動作確認計画 — Issue #637: 高度なローディングUX（アップロード進捗・失敗リトライ導線・useFormStatus）

**Issue:** #637
**作成日:** 2026-06-12

---

## 確認環境

本 Issue は presentation 層（`app/components/` / `app/routes/` / `docs/`）のみの変更。検証は起動中のローカルサーバーに対するブラウザ目視が中心。

### 検証環境の起動

ソース変更を実サーバーで見る場合（`docs/test.md`）:

```bash
pnpm build && pnpm start
```

（`pnpm start` = wrangler dev。`dist/worker` を配信するため先に `pnpm build` が必要。HMR 重視なら `pnpm dev` でも可。）

ログインユーザーの用意（`docs/test.md`）:

```bash
pnpm db:migrate
pnpm seed:dev-admin
```

セッション cookie はスクリプト出力トークンを CDP 経由で注入（`__Host-session`、Secure 必須）:

```bash
agent-browser cookies set "__Host-session" "<token>" --url http://localhost:<port> --path / --secure --sameSite Lax
```

自動テスト:

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
```

### デプロイ方法

なし（検証環境のみで確認できる。ステージング反映が必要な場合は `pnpm deploy:staging`）。

## 確認項目

### 1. 取り込みアップロードの進捗可視化（UploadDialog）

- **目的:** ファイル選択 → 確定までの進行が可視化されること。
- **手順:**
  1. ヘッダーのアップロード CTA を開く。
  2. 対応形式（Markdown / 画像 / PDF 等）を**複数**選択する。
  3. アップロード中の表示を観察する。
- **期待結果:** `uploading` でスケルトン or 件数進捗（`n / total 件目`）が出る。サーバー処理待ち（`waiting`）はスケルトン +「LLM がタイトルとメタデータを提案中...」。`prefers-reduced-motion: reduce` ではアニメーションが止まり静的表示になる。
- **確認ポイント:** `aria-live="polite"` で状態遷移が読み上げられること。複数ファイル時に件数が進むこと。

### 2. 取り込みキューの「処理中」カードの進捗（IngestionJobRow / IngestionQueue）

- **目的:** `processing` / `pending` 状態のジョブが「進行中」と分かること。
- **手順:**
  1. `/upload`（取り込みキュー）を開く。
  2. アップロード直後の `pending` / `processing` カードを観察する（必要なら DB に `processing` 状態のジョブを SQL 投入）。
- **期待結果:** processing カードに indeterminate な `ProgressBar`（スライドアニメーション）+ 状態文言（「タイトルとメタデータを解析中...」等）。ポーリングで status が進むとカード表示が遷移する。
- **確認ポイント:** P13 の進捗バー言語に視覚的に揃っていること。`motion-reduce` でアニメーション停止。

### 3. ミューテーション失敗時のエラー表示・リトライ導線（RetryableError）

- **目的:** インライン mutation 失敗で統一されたエラー + 再試行導線が出ること。
- **手順:**
  1. 取り込みジョブの commit / regenerate / 破棄を、失敗を誘発する状況（例: ジョブ状態を SQL で変えて invalid_status を起こす、ネットワークを切る）で実行する。
  2. キューのポーリングを失敗させる（一時的にオフライン化）。
- **期待結果:** `displayError` 文言が `role="alert"` で表示され、`再試行` ボタン（`RefreshCw`）が併置される。再試行押下で直前操作が再実行され、押下中は `disabled` + `aria-busy`。
- **確認ポイント:** 取り込み・キューポーリング・アップロードで見た目・操作が一貫していること。fatal（unauthorized/forbidden）時はリトライを出さない。

### 4. ルート失敗の共通フォールバック（RouteErrorFallback）

- **目的:** `_app` 配下ルートのエラー画面が統一され、リトライ導線を持つこと。
- **手順:**
  1. ローダーが失敗するルート（例: 存在しない noteId 以外のサーバーエラー、`/tags`・`/trash`・ホーム等）を強制的にエラーさせる（DB を一時的に壊す／不正パラメータ等）。
- **期待結果:** どのルートでも同じ見た目のエラー表示 + `再読み込み` ボタン。押下で `router.invalidate()` によりロードが再試行される。
- **確認ポイント:** シェル境界（`_app/route.tsx`）のエラーは従来どおりシェル invalidate、子ルートは `router.invalidate()`。`notFound` は `notFoundComponent` のまま（誤って巻き込まれない）。

### 5. フォーム pending フィードバック（useFormStatus / SubmitButton）

- **目的:** `useFormStatus` を導入した `<form action>` フォームで送信ボタンが pending を表示すること。
- **手順:**
  1. 設定 → セキュリティ（`SecurityForm`）でパスワード変更・メール変更を送信する。
  2. 設定 → プロフィール（`ProfileForm`）でユーザー名変更を送信する。
  3. 公開ノートの共有リンクゲート（`ShareLinkGate`）でパスワードを送信する。
- **期待結果:** 送信中は送信ボタンが `disabled` + `aria-busy` + pending ラベル（「変更中...」「確認中...」等）に切り替わる。二重送信されない。
- **確認ポイント:** 既存の `useActionState` 同居フォーム（auth・`PublishSettings`・`DesignTokensForm` 等）・`CreateTagForm`（対象外）の挙動が変わっていないこと。

## エッジケース・異常系

### 1. 対応外 / サイズ超過ファイル

- **目的:** クライアントガードのアラートが従来どおり出ること（進捗表示と競合しない）。
- **手順:** 対応外形式・50MB 超のファイルをドロップする。
- **期待結果:** `UploadValidationBanners`（`.alert-error` / `.alert-warning`）が表示され、進捗・スケルトンへは遷移しない。

### 2. `prefers-reduced-motion: reduce`

- **目的:** 進捗バー・スケルトンのアニメーションが停止すること。
- **手順:** OS / ブラウザで reduce motion を有効化し、項目 1・2 を再確認。
- **期待結果:** スライド／パルスが止まり、静的なプレースホルダー／バーになる。

### 3. ポーリング fatal エラー

- **目的:** unauthorized / forbidden 時にリトライを出さず案内に留めること。
- **手順:** セッションを失効させた状態でキューを開く。
- **期待結果:** ポーリングが停止し、リトライボタンは出ない（再取得しても回復しないため）。

## 既存機能への影響確認

- 取り込みフロー全体（upload → preview → commit / discard / regenerate / retry）が従来どおり動くこと。
- `MediaUploader`（ノート編集のメディア追加）— ステップ 7b を実施しない場合は既存の「アップロード中…」+ 再試行が崩れていないこと。
- auth フォーム（ログイン・サインアップ等）の `useActionState` pending・エラー表示が不変であること。
- 公開側 `ErrorPage`（P34）は対象外。回帰がないこと。

## 確認チェックリスト

- [ ] UploadDialog のアップロード進捗（スケルトン / 件数進捗）が出る
- [ ] 取り込みキュー processing カードに進捗インジケータが出る
- [ ] インライン mutation 失敗で統一エラー + 再試行導線が出る（取り込み・キュー・アップロード）
- [ ] `_app` ルート失敗が共通フォールバック + リトライで統一されている
- [ ] `useFormStatus` 導入箇所で送信ボタン pending が出る
- [ ] reduce motion でアニメーションが停止する
- [ ] fatal ポーリングエラーでリトライが出ない
- [ ] 既存の取り込み / auth / MediaUploader / 公開エラーページに回帰がない
- [ ] `pnpm typecheck && pnpm lint && pnpm test:unit` がパスする
