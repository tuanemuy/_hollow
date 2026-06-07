# Issue #544 ブラウザ検証用シードデータ

対象: 領域5「公開・共有で読まれる体験」(P30/P31/P32/P33) のモック追従。
バックエンド変更は無く、UI 追従の確認用に公開ノートと共有リンクをローカル D1 へ投入した。

## 実行した準備作業

1. `pnpm db:migrate` — `No migrations to apply!`（適用済み。スキーマは最新）
2. `pnpm seed:dev-admin` — dev-admin ユーザー + 固定セッションを冪等投入
3. `pnpm db:execute:local .issue/544/manual-test/seed.sql` — 本検証用の公開ノート2件・共有リンク3件を投入

シード SQL の本体は `.issue/544/manual-test/seed.sql`。固定テスト ID（`…000020`〜`…000032`）を
DELETE してから INSERT する冪等構成で、既存ユーザー・既存ノート・dev-admin の他データには触れない。

## アカウント情報

| 項目 | 値 |
|------|----|
| username | `dev-admin` |
| role | admin (active) |
| USER_ID | `01950000-0000-7000-8000-000000000001` |
| セッション cookie 名 | `__Host-session`（Secure-only。document.cookie 不可、CDP 注入が必要） |
| セッション token | `dev-admin-session-token` |

agent-browser での cookie 注入例:

```
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```

注意: 本 Issue の確認項目（P30/P31/P32/P33 の公開・共有面）は**ログイン不要**で確認できる。
ログインが要るのは「既存機能への影響確認」で管理側を見たい場合のみ。

## 投入したデータ概要

### 公開ノート（dev-admin 所有 / visibility=public）

| note_id | slug | 用途 |
|---------|------|------|
| `01950000-0000-7000-8000-000000000020` | `issue-544-long-public` | 本文長め。検索スニペット 2 行 clamp 確認（TC3） |
| `01950000-0000-7000-8000-000000000021` | `issue-544-short-public` | 本文短め。clamp が悪さしない確認（エッジケース2） |

両ノートとも `publication_states.visibility='public'` + `search_documents.visibility='public'` で投入済み。
`search_documents` への INSERT で FTS トリガー（`search_documents_ai`）が発火し、`search_documents_fts` も同期される。
`MATCH '"テスト"'` で 2 件ともヒットすることを確認済み。両ノートとも本文に「テスト」を含む。

### 共有リンク（3 件 / すべて note `…000020` に紐付け）

| id | token（URL に使う生トークン） | 状態 | パスワード |
|----|------------------------------|------|-----------|
| `…000030` | `test-share-passworded-0001` | active + password | `test1234`（平文） |
| `…000031` | `test-share-revoked-0002` | revoked | なし |
| `…000032` | `test-share-expired-gone-0003` | revoked | なし |

token は SHA-256(base64url, no padding) 化して `token_hash` に格納（生トークンは DB に無い）。
パスワードは scrypt エンコード文字列を `password_hash` に格納。`test1234` で verify が通ることを
プロジェクトの scrypt 実装と同一ロジックで確認済み。

## テストで使う URL

開発サーバの起動: `pnpm dev`（表示された `http://localhost:<port>` を基点に以下を開く）

| 確認項目 | URL |
|----------|-----|
| P30 公開トップ | `/` |
| P30/プロフィール | `/u/dev-admin` |
| P31 公開ノート詳細（長文） | `/u/dev-admin/issue-544-long-public` |
| P31 公開ノート詳細（短文） | `/u/dev-admin/issue-544-short-public` |
| P32 検索（未検索 hero） | `/search` |
| P32 検索（スニペット 2 行 clamp / hero-sub）TC3,TC4 | `/search?q=テスト` |
| P33 共有リンク STATE1（パスワードゲート） | `/share/test-share-passworded-0001` |
| P33 共有リンク STATE3（失効 / トップへ戻る CTA） | `/share/test-share-revoked-0002` |
| P33 共有リンク STATE3（gone / 別トークン） | `/share/test-share-expired-gone-0003` |
| P33 STATE2（解錠成功の遷移先） | パスワード正解後に `/notes/public/01950000-0000-7000-8000-000000000020` へ自動遷移 |

共有リンクのパスワード（平文）: **`test1234`**

ロックアウト再現手順（TC2 / エッジ1）: `/share/test-share-passworded-0001` で誤ったパスワードを
**5 回連続**入力すると `failed_attempts >= 5` で `locked_until` が arm. 5 回目以降の試行で
`share_link_locked` となり案D アラート（`role="status"`）が表示される。それ未満の失敗は
インラインエラー（`share_link_password_invalid`）。

## スキーマ調査で判明した共有リンクの状態管理方式

`share_links` テーブル（`app/core/adapters/d1/schema.ts` / 移行 `0001_hollow_schema.sql`）:

- `status` … `CHECK IN ('active','revoked')`。**「expired（時限失効）」という独立状態は存在しない。**
- `revoked_at` … 失効時刻。revoked 行は NOT NULL が要求される（ドメイン `ShareLink.reconstruct` の不変条件）。
- `password_hash` … scrypt エンコード文字列（`$scrypt$ln=..,r=..,p=..$<saltB64>$<hashB64>`）。NULL ならパスワード無し。
  検証は `app/core/adapters/security/scrypt.ts` / `passwordHasher.ts`。レガシー pbkdf2 形式も verify は対応。
- `token_hash` … SHA-256 を base64url(no padding) 化した値（`app/core/application/publication/token.ts`）。生トークンは保存されない。`uniq_share_links_token_hash` で一意。
- ロックアウト（lockout）は **DB 管理**:
  - `failed_attempts`（INTEGER, `CHECK >= 0`）… 失敗試行カウント。
  - `locked_until`（TEXT, ISO8601, nullable）… ロック解除時刻。
  - ドメイン規則（`PublicationService.DEFAULT_LOCKOUT_POLICY`）: `maxAttempts=5`, `lockDurationSec=900`(15分)。
    `recordFailedAttempt` で `failed_attempts+1`、`>= maxAttempts` 到達時に `locked_until = now + 15分`。
    `isOpen` は `locked_until` が未来なら閉（= `share_link_locked`）。成功で `failed_attempts=0 / locked_until=NULL` にリセット。

### UI STATE3 (`isExpiredOrGone`) の発火条件

`app/components/public/ShareLinkGate/index.tsx` 上、STATE3（「リンクは無効です」+「トップへ戻る」CTA）は
次のいずれかで発火する:

- `share_link_revoked`（business / status='revoked' のリンクを開いた）
- `notFound`（`token_hash` が DB に無い = 削除済み or 不正トークン）

ロックアウト（`share_link_locked`）は STATE3 ではなく、ゲート上の案D 警告アラートとして別表示される。

## seed 困難だった状態とその理由

- **「期限切れ（expired）」専用状態は seed 不可能（スキーマ上存在しない）。**
  `share_links` に時限失効フィールドは無く（`locked_until` は一時ロック専用で恒久失効ではない）、
  `status` は `active`/`revoked` の 2 値のみ。UI の「リンクは無効です」(STATE3) は実装上
  `revoked` か `notFound` でしか発火しない。
  → テスト計画 (c)「期限切れ」は **revoked リンクで代替**した（token を `test-share-expired-gone-0003`
  に変えて (b) と区別）。挙動・表示は (b) と同一になる。
  - 「notFound 経由の STATE3」も確認したい場合は、DB に無い任意トークン
    （例 `/share/no-such-token-xxxx`）を開けば `notFound` で同じ STATE3 が出る。
- **ロックアウト状態の事前 seed は行わなかった。**
  `locked_until` を未来時刻にした行を直接作れば即ロック状態を再現できるが、本検証では
  「連続失敗 → ロックアウト遷移」の UI フロー自体（インラインエラー → 案D アラートへの切替）を
  見たいので、UI で 5 回失敗させて再現するのが適切。即ロック行が必要なら次を追加投入できる:

  ```sql
  UPDATE share_links
  SET failed_attempts = 5,
      locked_until = '2999-12-31T23:59:59.000Z'
  WHERE id = '01950000-0000-7000-8000-000000000030';
  ```

  （検証後は `pnpm db:execute:local .issue/544/manual-test/seed.sql` を再実行すれば
  active/未ロックに戻る。冪等。）
