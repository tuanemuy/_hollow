# Issue #573 (P24 アカウント削除強化) — ブラウザ検証用シードデータ

ローカル D1 (`hollow-local-d1` / `pnpm dev` が読むのと同じ DB) に投入済み。

## 検証用ユーザー（パスワードログイン可能）

P24 はパスワード再検証 (`verifyPasswordForUser`) を実機で試す必要があるため、
**パスワード credential を持つユーザー**が必須。既存の `pnpm seed:dev-admin` は
session のみで credential を作らないので、代わりに `scripts/seed-dev-login.mjs`
（既存スクリプト・idempotent）を使った。

このスクリプトは `accounts` テーブルに `provider_id='credential'` の行を作り、
better-auth と同じ scrypt プロファイル（`$scrypt$ln=16,r=8,p=1$<salt>$<hash>`、
OWASP 2nd tier）でパスワードハッシュを生成する。`logIn` ユースケースが参照する形式と一致。

| 項目 | 値 |
|---|---|
| user id | `01950000-0000-7000-8000-000000000010` |
| username | `dev-login` |
| email（ログイン識別子） | `dev-login@example.com` |
| password | `DevPassw0rd!2024` |
| role / status | member / active (email_verified=1, banned=0, deleted_at=NULL) |

## ログイン手段（ブラウザ検証サブエージェント向け）

**UI ログイン方式を使うこと**（session cookie 注入ではない）。
理由: P24 はパスワード再検証が要点で、実 session を持つユーザーが必要。
`seed-dev-login` はパスワードを作るが session は作らないので、フォームでログインして
セッションを確立する。

手順:
1. `http://localhost:3000/login` を開く
2. email に `dev-login@example.com`、password に `DevPassw0rd!2024` を入力してログイン
3. ログイン後 `http://localhost:3000/settings/account-delete` を開く

> session cookie 名は `__Host-session`（Secure-only、`document.cookie` では設定不可、
> CDP 注入が必要）。ただし P24 検証では UI ログインで実セッションを作る方が確実なので
> cookie 注入は不要。

## 削除確認に使う認証情報

`/settings/account-delete` の多段確認で入力する値:

| ステップ | 入力 |
|---|---|
| ① 同意チェック | checkbox を ON |
| ② 確認語 | `DELETE`（厳密一致・大文字のみ通る） |
| ③ ユーザー名 | `dev-login` |
| ③ パスワード（正） | `DevPassw0rd!2024` |
| ③ パスワード（誤・異常系用） | 任意の誤値（例 `wrongpassword`） |

> 注意: 削除を**実際に実行すると dev-login ユーザーは soft-delete される**。削除実行系
> テスト（確認項目4・5）を行った後は再検証のため `node scripts/seed-dev-login.mjs` を
> 再実行してユーザーを再生成すること（idempotent）。集計データ（下記）も削除カスケードや
> ユーザー再生成で影響を受けるので、必要なら下記 SQL を再投入する。

## 投入した削除影響集計データ

owner = dev-login user (`01950000-0000-7000-8000-000000000010`) に紐付けて投入。
集計ロジック（`summarizeAccountDeletion`）の WHERE 条件に合わせて、カウントされる行と
されない行を両方用意した。

| 指標 | DB 実測値 | 内訳 |
|---|---|---|
| 所有ノート数 (active) | **3** | 投入した active 2件 + 既存 active 1件（ログイン由来）。trashed 1件は対象外 |
| 公開ノート数 (public+published) | **1** | active-1 を visibility=public, published_at設定 |
| 失効する限定公開リンク数 (revoked_at IS NULL) | **1** | active-1 に share_link 1本 |
| 添付メディア数 (status=attached) | **1** | attached 1件。pending 1件は対象外 |
| メディア総容量 (SUM byte_size) | **123456** バイト | attached 1件のみ合算 |

投入した行 id（再投入・クリーンアップ用）:

- media_assets: `...a01`(attached), `...a02`(pending)
- notes: `...e01`(active/public), `...e02`(active), `...e03`(trashed)
- publication_states: note `...e01`
- share_links: `...f01`
- directory: 既存の root directory `019ebf94-c84f-7330-8afa-28bd0808764b` を再利用
  （1 owner = 1 root の unique 制約のため新規作成は不可）

## 実行したコマンド / SQL

```sh
# 1. パスワードログイン可能ユーザー作成
node scripts/seed-dev-login.mjs

# 2. 集計データ投入（下記 SQL を一時ファイルに書いて実行）
pnpm db:execute:local <p24-aggdata.sql>
```

集計データ投入 SQL（idempotent: 子→親順に DELETE してから INSERT。directory は既存 root を参照）:

```sql
DELETE FROM share_links WHERE id IN ('01950000-0000-7000-8000-000000000f01');
DELETE FROM publication_states WHERE note_id IN (
  '01950000-0000-7000-8000-000000000e01','01950000-0000-7000-8000-000000000e02','01950000-0000-7000-8000-000000000e03');
DELETE FROM notes WHERE id IN (
  '01950000-0000-7000-8000-000000000e01','01950000-0000-7000-8000-000000000e02','01950000-0000-7000-8000-000000000e03');
DELETE FROM media_assets WHERE id IN (
  '01950000-0000-7000-8000-000000000a01','01950000-0000-7000-8000-000000000a02');

INSERT INTO media_assets (id, owner_id, kind, mime_type, byte_size, backend, storage_key, ref_count, status, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000a01','01950000-0000-7000-8000-000000000010','image','image/png',123456,'r2','media/p24/attached-1.png',1,'attached','2026-06-14T00:00:00.000Z','2026-06-14T00:00:00.000Z'),
       ('01950000-0000-7000-8000-000000000a02','01950000-0000-7000-8000-000000000010','image','image/png',999999,'r2','media/p24/pending-1.png',0,'pending','2026-06-14T00:00:00.000Z','2026-06-14T00:00:00.000Z');

INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000e01','01950000-0000-7000-8000-000000000010','019ebf94-c84f-7330-8afa-28bd0808764b','p24-active-1','P24 Active 1','<p>a1</p>','{}','active',0,'2026-06-14T00:00:00.000Z','2026-06-14T00:00:00.000Z'),
       ('01950000-0000-7000-8000-000000000e02','01950000-0000-7000-8000-000000000010','019ebf94-c84f-7330-8afa-28bd0808764b','p24-active-2','P24 Active 2','<p>a2</p>','{}','active',0,'2026-06-14T00:00:00.000Z','2026-06-14T00:00:00.000Z'),
       ('01950000-0000-7000-8000-000000000e03','01950000-0000-7000-8000-000000000010','019ebf94-c84f-7330-8afa-28bd0808764b','p24-trashed-1','P24 Trashed 1','<p>t1</p>','{}','trashed',0,'2026-06-14T00:00:00.000Z','2026-06-14T00:00:00.000Z');

INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version)
VALUES ('01950000-0000-7000-8000-000000000e01','01950000-0000-7000-8000-000000000010','public','2026-06-14T00:00:00.000Z','2026-06-14T00:00:00.000Z',0);

INSERT INTO share_links (id, note_id, owner_id, token_hash, status, failed_attempts, created_at, updated_at, version)
VALUES ('01950000-0000-7000-8000-000000000f01','01950000-0000-7000-8000-000000000e01','01950000-0000-7000-8000-000000000010','hash_p24_active_link_0001','active',0,'2026-06-14T00:00:00.000Z','2026-06-14T00:00:00.000Z',0);
```

## 制限・注意

- ノート数は既存の 1 件があるため期待値 2 ではなく **3**。集計が DB 実データと一致するか
  検証する際は上表の実測値を基準にすること（虚偽表示でなく実値一致が AC）。
- 削除実行系テスト後はユーザーが soft-delete されるため `node scripts/seed-dev-login.mjs`
  を再実行して復元する。集計データは削除カスケードで失われるので必要に応じ SQL 再投入。
- 集計値ゼロのユーザー検証（エッジケース1）が必要なら、別途まっさらな新規ユーザーを
  signup UI で作るか、データを持たないユーザーでログインして確認する。
