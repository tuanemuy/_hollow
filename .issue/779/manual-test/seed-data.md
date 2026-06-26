# Issue #779 ブラウザ検証用シードデータ

P32 公開検索の結果タイトルへの `<mark>` ハイライト適用、および P30 自ノート検索で生マーカーが漏れないことを確認するためのシード。

## 準備作業

1. `CLAUDE.md` / `docs/test.md` / `app/core/adapters/d1/schema.ts` / `app/core/adapters/d1/searchIndex.ts` / FTS 移行 `migrations/0008_search_documents_fts_trigram.sql` を確認。
2. `pnpm seed:dev-admin` を実行（冪等）。dev-admin ユーザー＋固定トークンセッションを投入。
3. シード SQL `/tmp/seed-779.sql` を作成し `pnpm db:execute:local /tmp/seed-779.sql` で投入（users → directories → notes → search_documents の順）。
4. 投入後に `search_documents` の行確認、FTS5 `search_documents_fts` の MATCH / `highlight()` 同期確認、AI の LIKE フォールバック確認を実施。

## 検索キーワード

- `デザイン` — 4 codepoint。trigram MATCH 経路 → `highlight()` で `<mark>` 付与（AC-1/2/3/5）。
- `AI` — 2 codepoint。trigram 下限（3 codepoint）未満のため LIKE フォールバック経路 → ハイライト無し（AC-4）。

## 公開ノート owner

- username: `test-author`（P32 結果カードに表示される）
- ※ Username 値オブジェクトは `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`（アンダースコア不可）。`toHit` が hit ごとに `Username.create` で検証するため、当初案の `test_author` は使えず `test-author` を採用。
- user id: `01950779-0000-7000-8000-000000000001` / email: `test-author@example.com` / email_verified=1 / role=member
- root directory: `01950779-0000-7000-8000-000000000010`

## dev-admin ログイン情報（P30 自ノート検証用）

- email: `dev-admin@example.com`
- role: admin（active）
- セッショントークン: `dev-admin-session-token`
- cookie 注入（`__Host-session` は Secure-only のため CDP 経由）:

  ```bash
  agent-browser cookies set "__Host-session" "dev-admin-session-token" \
    --url http://localhost:<port> --path / --secure --sameSite Lax
  ```

## 投入した search_documents 一覧

| 用途 | note_id | visibility | title | 検索語の在り処 |
|---|---|---|---|---|
| A: タイトルハイライト (AC-1) | `01950779-…-00000000000a` | public | `デザインシステムの設計` | title に `デザイン`（body は別文言） |
| B: 本文のみ一致 (AC-3) | `01950779-…-00000000000b` | public | `週次レビューのまとめ` | body_plain `今週はデザインレビューを実施した` のみ |
| C: XSS エスケープ (AC-2) | `01950779-…-00000000000c` | public | `<script>alert(1)</script>デザイン強化` | title に HTML 特殊文字＋`デザイン` |
| D: 短キーワード LIKE (AC-4) | `01950779-…-00000000000d` | public | `AI 活用メモ` | title / body に `AI` |
| 自ノート (AC-5) | `01950779-…-0000000000e1` | private | `デザイン草稿メモ` | title・body に `デザイン`（owner=dev-admin） |

（note_id の `…` は `0000-7000-8000` を省略）

owner: A〜D は `test-author`、private は dev-admin（`01950000-0000-7000-8000-000000000001`、既存の root directory `019e9845-7d00-76d2-9276-b1771d744df1` を再利用）。

## 検証結果

`search_documents_fts MATCH '"デザイン"'` を host へ join し `highlight(...,0,'<mark>','</mark>')` を確認:

- A: `<mark>デザイン</mark>システムの設計`（タイトルにマーカー付与）
- B: `週次レビューのまとめ`（タイトル無マーカー＝本文一致のみ）
- C: `<script>alert(1)</script><mark>デザイン</mark>強化`（生 HTML が保存され、フロントでのエスケープ確認が可能）
- private(e1): `<mark>デザイン</mark>草稿メモ`（FTS 上はマーク可能だが、P30 自ノート面は `highlight=false` で生タイトルを描画する想定 → 生 `<mark>` が漏れないことを検証）

`AI` の LIKE: D（`AI 活用メモ`）が一致。FTS は INSERT トリガー `search_documents_ai` で同期されており、直接 FTS へ insert していない。

## 詰まった点と対処

- 初回投入で `UNIQUE constraint failed: directories.owner_id`。dev-admin 用に root directory を新規 INSERT しようとしたが、`uniq_directories_owner_root`（owner_id, parent_id IS NULL の部分ユニーク）に違反。dev-admin は既に root directory `019e9845-7d00-76d2-9276-b1771d744df1` を保有していたため、新規作成をやめて既存 root を private ノートの `directory_id` に再利用して解決。バッチはロールバックされ部分コミットは無し。
- note_id / owner_id は `toHit` で UUIDv7 形式（`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`）を `idGenerator.validate` で検証されるため、`01950779-0000-7000-8000-…` という有効な UUIDv7 を採用（`note-779-a` 等の文字列は不可）。
- 公開検索は dateRange 無しでは `publication_states` を join しない（visibility フィルタは `search_documents.visibility`）ため、publication_states 行は不要と判断し投入せず。
