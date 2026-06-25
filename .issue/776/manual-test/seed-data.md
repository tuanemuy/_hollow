# シードデータ / 認証手段 — Issue #776 ブラウザ検証用

作成日: 2026-06-26
対象サーバー: http://localhost:3000 (ローカル D1, wrangler `hollow-local-d1` --local)

## 認証方式

- メール + パスワードによる独自認証（identity ドメイン）。better-auth 互換スキーマ（`users` / `accounts` / `sessions` / `verifications`）を使うが、better-auth 本体は未配線で、アダプターが `accounts` テーブルへ直接 scrypt ハッシュを書き込む（`app/core/adapters/d1/repositories/credentialStore.ts`、`app/core/adapters/security/scrypt.ts`）。
- パスワードハッシュ形式: `$scrypt$ln=16,r=8,p=1$<salt-b64>$<hash-b64>`（OWASP 第2ティア, dkLen=64, salt 16B）。
- ログイン手順:
  - URL: `http://localhost:3000/login`
  - 入力項目: メールアドレス + パスワード
  - 成功時に `__Host-session` クッキーへセッショントークンが設定される。
- サインアップ（`/signup`）は可能だが、新規ユーザーは `status=pending`（`email_verified=0`）で作成され、`logIn` が `unverified` で弾く。ローカルではメール送信が実質飛ばないため、ブラウザサインアップ単独ではログインできない。よって既存の専用シードスクリプトを使用した。

### status の DB マッピング（参考）

`users` テーブルに status カラムは無く、フラグから導出（`D1UserRepository.deriveStatus`）:
1. `deleted_at != null` → deleted
2. `banned = 1` → suspended
3. `email_verified = 0` → pending
4. それ以外 → active（ログイン可）

## テストアカウント

既存の専用スクリプト `scripts/seed-dev-login.mjs`（冪等）で投入される「パスワードログイン可能」なユーザーを採用した。

| 項目 | 値 |
| --- | --- |
| email（ログイン識別子） | `dev-login@example.com` |
| password | `DevPassw0rd!2024` |
| username | `dev-login` |
| role | member |
| status | active（`email_verified=1` / `banned=0` / `deleted_at=NULL`） |
| user_id | `01950000-0000-7000-8000-000000000010` |

投入コマンド（package.json に script 登録が無いため node で直接実行）:

```bash
node scripts/seed-dev-login.mjs
```

### セッションクッキー注入（ブラウザ自動化向けの代替ログイン）

`sessions.token` は平文一致で解決される（`SessionService.resolve`）ため、固定トークンのセッション行を投入して `__Host-session` クッキーに注入すればフォームログインを省略できる（dev-admin の `dev-admin-session-token` と同方式）。本検証用に投入済み:

- cookie 名: `__Host-session`
- トークン値: `dev-login-session-token`
- 対象 user: `01950000-0000-7000-8000-000000000010`（dev-login）
- 有効期限: 投入時 +30 日

agent-browser 例:

```bash
agent-browser --session <s> cookies set "__Host-session" "dev-login-session-token" \
  --url http://localhost:3000 --path / --secure --sameSite Lax
```

再投入が必要な場合の SQL は `/tmp/seed-776-session.sql` に出力済み（一時ファイル）。トークン値とユーザーIDは上記の通り。

## 投入したシードデータ

dev-login ユーザーには既にルートディレクトリ（depth 0）と既存ノート1件（`HTML整形テスト`, id `019ee7b2-4cd2-740a-a7a0-dfc22b87d147`）が存在。タグは0件だったため、タグを5件追加した（`/tags` の複数表示・並び替え軸テスト用）。

| タグ名 | name_normalized | note_count |
| --- | --- | --- |
| work | work | 1 |
| ideas | ideas | 0 |
| personal | personal | 0 |
| design | design | 1 |
| reference | reference | 0 |

- `tags` テーブルへ直接 INSERT（id は UUIDv7, version=0, name_normalized は NFKC+小文字 = `tagRepository.normalizeName` 準拠）。
- `work` と `design` は既存ノートへ `note_tags` で関連付け、noteCount / lastUsedAt 軸での並び替えが視認できるようにした（並び替え軸 segmented の検証目的）。
- ノートは既存1件で十分のため新規作成せず（`/notes/new` は追加データ不要で開ける）。

投入 SQL は `/tmp/seed-776-tags.sql`（一時ファイル）。本番データへの操作・既存行の削除は一切なし（ローカル D1 のみ、INSERT OR IGNORE）。

## 到達性の確認結果

`__Host-session=dev-login-session-token` クッキー付きで curl 実行（http://localhost:3000）:

- `/tags`: HTTP 200。本文に「タグ管理」「並び替え軸」とタグ名（design / ideas / personal / work / reference）が描画される（= 認証済み・タグ複数表示を確認）。
- `/notes/new`: HTTP 200、約70KB のノートエディタ本文（「新規ノートを保存」「ディレクトリ」等）を描画。クッキー無しでは 0 バイト（ログインへリダイレクト）= 認証ゲートが効いていることを確認。
  - 「編集モード」タブ自体はクライアントハイドレーション後に現れるコンポーネントのため SSR HTML には現れないが、エディタ画面への到達は確認済み。

## 詰まった点と対処

- ブラウザサインアップ単独ではメール認証未完了（pending）でログイン不可。→ 既存の `scripts/seed-dev-login.mjs`（active ユーザー + scrypt 資格情報を投入）を使用して解決。
- `seed:dev-login` は package.json に script 未登録だった（`seed:dev-admin` のみ存在）。→ `node scripts/seed-dev-login.mjs` で直接実行。
- フォームログインは TanStack Start のサーバー関数 POST で curl 検証が煩雑なため、平文セッショントークンを直接投入してクッキー注入で到達性を確認した（実ログインも上記 email/password で可能）。
