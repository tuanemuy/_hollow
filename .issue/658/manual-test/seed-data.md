# Issue #658 マニュアルテスト用シードデータ

作成日: 2026-06-13 / 対象 DB: ローカル D1（`hollow-local-d1`、`pnpm dev` が参照するもの）

## 実行済みの準備

1. `pnpm db:migrate` — 適用済み（差分なし）
2. `pnpm seed:dev-admin` — dev-admin ユーザー + セッション投入（冪等）
3. `pnpm db:execute:local .issue/658/manual-test/seed-notes-tags.sql` — 本 Issue 用データ投入（冪等、再実行可）

## アカウント

### dev-admin（タグあり、メインのテスト用）

- email: `dev-admin@example.com` / username: `dev-admin` / role: admin
- セッション token: `dev-admin-session-token`

### dev-tester（タグ 0 件、AC-9 確認用）

- email: `dev-tester@example.com` / username: `dev-tester` / role: member
- セッション token: `dev-tester-session-token`
- ノート・タグ・ディレクトリを一切持たない（「+ タグ」チップ非表示の確認に使う）

## ログイン方法（cookie 設定）

cookie 名は `__Host-session`。Secure 属性必須のため `document.cookie` では設定できない。CDP 経由（agent-browser）で注入する。

```bash
# dev-admin としてログイン
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:<port> --path / --secure --sameSite Lax

# dev-tester に切り替える場合（AC-9）
agent-browser cookies set "__Host-session" "dev-tester-session-token" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```

その後 `http://localhost:<port>/` を開くと認証済みでホーム（P10）が表示される。

## 投入データ（dev-admin 所有）

| テーブル | 件数 | 内容 |
| --- | --- | --- |
| directories | 1 | ルートディレクトリ（name/slug 空、depth 0） |
| notes | 14 | `test-note-01` 〜 `test-note-14`（全て active、updated_at は 2026-06-01 で分散） |
| tags | 14 | `test-tag-01` 〜 `test-tag-14`（VISIBLE_TAG_LIMIT=12 超） |
| note_tags | 16 | 各ノートに同番タグ 1 件 + `test-note-01` に `test-tag-02` / `test-tag-03` を追加 |

タグごとのノート件数: `test-tag-02` と `test-tag-03` が 2 件、その他は 1 件（ピッカーの件数バッジ確認用の変化を持たせている）。

ID は固定 UUIDv7 形式: ルートディレクトリ `…-000000000658`、タグ `…-000000000101`〜`114`、ノート `…-000000000201`〜`214`。

## テストケースとの対応

- タグ 3 件以上（AC-4/5、マルチセレクト）: 14 件で充足
- 13 種類以上のタグ（確認項目 6・エッジケース 2 の VISIBLE_TAG_LIMIT 超）: 14 件で充足
- タグ 0 件状態（AC-9）: dev-tester に切り替えて確認可能
- 「もっと見る (+N)」トグル表示: 12 件超なので表示される想定

## 注意

- 既存の `test-public-user`（過去 Issue のテストデータ、ノート/タグあり）には触れていない
- シード SQL は `INSERT … WHERE NOT EXISTS` / `ON CONFLICT DO NOTHING` で冪等。データを壊した場合は再実行すればよい
- ノート削除等でデータが変わった場合も同 SQL の再実行で復元できる（ただし trashed 状態の同 slug ノートがあると active 復元はされない点に注意）
