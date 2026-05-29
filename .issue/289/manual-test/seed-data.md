# E2E シードデータ / 認証済みディレクトリツリー画面のセットアップ

対象: issue #289 のブラウザ E2E テスト用に「認証済みのディレクトリツリー画面」を再現可能な形で開けるようにするためのシード情報と手順。

dev サーバー: `http://localhost:3000`（ローカル Cloudflare Workers + D1, `pnpm dev --port 3000`）

---

## 1. 認証の仕組みの要約

### ログイン方式
- メール + パスワードのクレデンシャル認証。better-auth は未配線で、アダプタが `accounts` テーブルを直接読み書きする。
- パスワードハッシュ: **scrypt**（`@noble/hashes/scrypt`）。エンコード形式は
  `$scrypt$ln=16,r=8,p=1$<saltBase64>$<hashBase64>`。
  - パラメータ: `N=2^16, r=8, p=1, dkLen=64, salt=16bytes`。
  - 実装: `app/core/adapters/security/scrypt.ts`, `app/core/adapters/security/passwordHasher.ts`。
  - クレデンシャル保存/検証: `app/core/adapters/d1/repositories/credentialStore.ts`（`providerId = "credential"`, `accountId = userId`）。
- ログインユースケース: `app/core/application/identity/logIn.ts`
  - `verifyPassword(email, password)` → ユーザーの status を確認 → セッション発行。
  - status は `users` 行から導出（`app/core/adapters/d1/repositories/userRepository.ts`）:
    `deleted_at NOT NULL → deleted` / `banned=1 → suspended` / `email_verified=0 → pending` / それ以外 → `active`。
    ログイン可能なのは `active` のみ（`pending` は `unverified` で拒否）。

### セッション / Cookie
- Cookie 名: **`__Host-session`**（`httpOnly, sameSite=lax, path=/, secure`）。
  - 発行: `app/core/presentation/authMiddleware.ts` の `setSessionCookie`。
  - 読み取り: `app/lib/server/currentUser.ts`。
- セッショントークンは `sessions.token` に **平文** で保存（`app/core/adapters/d1/repositories/sessionService.ts`）。32 byte ランダムを base64url 化。TTL 30 日。
- `__Host-` + `Secure` だが、Chromium は `localhost` をセキュアコンテキスト扱いするため http://localhost でも Cookie は受理される。

### メール認証トークンのローカルでの取得方法
- ローカル dev では `ConsoleEmailSender`（`app/core/adapters/cloudflare/identity/emailSender.ts`）が選択され、
  検証リンクを **dev サーバーの stdout にログ出力するだけ**（`logger.info("email.verification", { link })`）。実際の送信はしない。
- 本番は `RESEND_API_KEY` + `EMAIL_FROM` がある場合に `ResendEmailSender` に切り替わる。
- → ローカルで検証リンクを使うには dev サーバーのコンソール出力を読む必要がある。
  本セットアップではコンソール出力に依存せず、**DB で `email_verified=1` を直接立てる**方式を採用した（後述）。

---

## 2. テストユーザーの認証情報

| 項目 | 値 |
|------|-----|
| email | `e2e-test@example.com` |
| password | `E2eTest!2026` |
| username | `e2e-test` |
| 表示名 | `E2E Test User` |
| role | `member` |
| email_verified | `1`（active 状態でログイン可能） |

> 既存の本番/他テストデータは破壊していない。`e2e-test@example.com` 専用に upsert（既存があれば削除→再作成）するシード SQL を使用。

---

## 3. 作成したディレクトリツリー構造

ディレクトリツリーは `tree[0]`（暗黙の root, name=""）を描画せず、その children から描画する
（`app/components/directory/DirectoryTree.tsx`）。各行に `︙`（`DirectoryActionsMenu`）の操作ボタンが付く。

| 役割 | name | slug | depth | id |
|------|------|------|-------|-----|
| root（非表示） | (空) | (空) | 0 | `019e741a-7f03-735e-b58e-fe3f5a3f0bd1` |
| 親 | `Projects` | `projects` | 1 | `019e741a-7f03-735e-b58e-f9ddbda30246`(parent) → 実 id: `019e741a-7f03-735e-b58f-033eecd38191` |
| 子 | `Frontend` | `frontend` | 2 | `019e741a-7f03-735e-b58f-07b3ba5ee4de` |

> 正確な id は `.issue/289/manual-test/seed-ids.json` を参照（再生成すると変わる）。
> 親 `Projects` が子 `Frontend` を持つため、「子を持つ親」の要件を満たす。
> サイドバーには親 `Projects`（level 1, 展開済み）とその配下に子 `Frontend`（level 2）が表示される。

実際に確認した accessibility tree:
```
- treeitem "折りたたむ Projects Projects の操作" [level=1, expanded=true]
  - button "Projects の操作"        ← ︙ ボタン（DirectoryActionsMenu トリガー）
  - treeitem "Frontend Frontend の操作" [level=2]
    - button "Frontend の操作"      ← ︙ ボタン
```
`︙` を押すと「子ディレクトリを作成 / リネーム / 移動 / 削除」の 4 メニューが開くことを確認済み。

---

## 4. agent-browser で新規セッションをログイン済みにする再現手順

> ⚠️ ログインフォームは React 19 `useActionState` のフォームアクション。**ボタンの `click` では submit が発火しない**ことがある。
> パスワード欄にフォーカスして **Enter キーで submit** するのが確実（下記手順はこれを使用）。
> ref（`@e4` 等）は `snapshot -i` のたびに振り直されるので、必ず snapshot で確認してから使うこと。
> 下記の ref はログインページの典型値（email=@e4, password=@e6）だが、念のため snapshot で照合すること。

セッション名は任意（例 `mytest`）。コピペ可能なコマンド列:

```bash
SESSION=mytest

agent-browser --session $SESSION open http://localhost:3000/login
agent-browser --session $SESSION snapshot -i      # email=@e4 / password=@e6 を確認
agent-browser --session $SESSION fill @e4 "e2e-test@example.com"
agent-browser --session $SESSION fill @e6 "E2eTest!2026"
agent-browser --session $SESSION focus @e6
agent-browser --session $SESSION press Enter
agent-browser --session $SESSION wait 3000
agent-browser --session $SESSION get url           # => http://localhost:3000/ ならログイン成功
```

ログイン成功後はサイドバーにディレクトリツリー（Projects > Frontend）が表示される。
`︙` メニューを開く例:
```bash
agent-browser --session $SESSION snapshot -i       # "Projects の操作" ボタンの ref を確認
agent-browser --session $SESSION click @<ref>      # メニューが開く
```

### 代替: Cookie 注入（セッショントークン直挿し）
セッションは平文トークン。DB に直接行を入れて Cookie をセットしても良いが、agent-browser での Cookie 注入よりも
上記 UI ログインの方が確実なので UI ログインを推奨する。

---

## 5. スクリーンショット

- 認証済みホーム + ディレクトリツリー:
  `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/289/manual-test/screenshots/seed/home-directory-tree.png`
- `︙` DirectoryActionsMenu を開いた状態:
  `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/289/manual-test/screenshots/seed/directory-actions-menu-open.png`

---

## 6. シードの再適用方法 / 詰まった点・既知の制約

### 再適用
```bash
# 値（id, scrypt ハッシュ）を再生成して seed.sql / seed-ids.json を書き出す
node .issue/289/manual-test/gen-seed.mjs            # password 引数省略時は E2eTest!2026
# ローカル D1 に適用（既存 e2e-test ユーザーを削除→再作成）
npx wrangler d1 execute hollow-local-d1 --local --file .issue/289/manual-test/seed.sql
```
- `gen-seed.mjs` は `@noble/hashes/scrypt`（本体と同一実装）でハッシュを生成し、`uuid` v7 で id を採番するので、
  本体のクレデンシャル検証・id バリデーション（UUIDv7 正規表現）と完全に整合する。

### 詰まった点・制約
1. **signup / login のボタン `click` で submit が発火しない**: React 19 の `useActionState` フォームに対して
   agent-browser の `click` ではアクションが起動しないケースがあった（signup を click で 2 回試行しても DB に行が作られなかった）。
   ログインは「password 欄に focus → Enter」で確実に submit できた。signup を UI で行いたい場合も同様に Enter を試すこと。
2. **メール認証トークンはコンソール出力のみ**: ローカルでは検証リンクが dev サーバー stdout にログされるだけ。
   本セットアップは stdout 依存を避け、DB で `email_verified=1` を直接立てた。
   → signup フロー全体（メール認証込み）を E2E で通したい場合は、dev サーバーのログをキャプチャしてリンクを取り出す必要がある。
3. **`__Host-` Cookie + http**: `__Host-session` は `Secure` 必須だが localhost はセキュアコンテキスト扱いのため問題なし。
   別ホスト名（127.0.0.1 等）では挙動が変わる可能性があるので `localhost` を使うこと。
4. **directories のスキーマ制約**: SQL レベルで `uniq_directories_owner_root`（owner ごと root 1つ）、
   `uniq_directories_owner_parent_name`（兄弟名ユニーク, LOWER(name)）、`parent_id` 自己参照 FK(ON DELETE RESTRICT) がある。
   シードは root→親→子の順に depth/slug/version を正しく埋めて挿入している。
5. **seed セッションは開いたまま**: 後続テスト引き継ぎ確認用に agent-browser の `seed` セッションは閉じていない
   （認証済みホーム表示中）。後続テストは別セッション名 + 上記ログイン手順を使うこと。
