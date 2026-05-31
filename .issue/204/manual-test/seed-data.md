# シードデータ — Issue #204 ブラウザ検証

検証は既存のローカル D1（`.wrangler/state/v3/d1`、integration テスト由来データ）上で実施。
公開ノートが1件も無かったため、検証用に既存ノートを1件公開状態へ更新した（追加的・ローカルのみ）。

## 投入/更新したデータ

- `publication_states`: ノート `019e7368-a581-743f-b10f-fc366c8e1f9e` を
  `visibility='public'`, `published_at='2026-05-30T12:00:00.000Z'` に更新。
- `users`: 所有者 `test298`（`019e7368-a580-7573-8251-c8a06f3a2a23`）の `bio` に
  「SEO 検証用のテストユーザーです。」を設定（ProfilePage description 検証用）。
- `tags` + `note_tags`: タグ「検証」「SEO」を作成しノートに紐付け（article:tag / keywords 検証用）。

## 検証に使った URL

- 公開ノート(slug): `/u/test298/issue-298-panel-bg-check`
- 公開ノート(id): `/notes/public/019e7368-a581-743f-b10f-fc366c8e1f9e`
- ユーザー公開トップ: `/u/test298`
- ランディング: `/`
- 認証ページ: `/admin`（200で描画）, `/settings/profile`（未認証は307→/login）

## 後始末

- 検証中に admin ユーザーの偽造セッションを1件 insert し、検証後に DELETE 済み。
- 公開ノート化したデータはローカル dev DB に残置（追加的・無害）。
