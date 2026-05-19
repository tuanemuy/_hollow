# シードデータ — Issue #42 マニュアルテスト

**作成日:** 2026-05-20
**最終更新:** 2026-05-20 (UUID v7 化に伴う再シード)
**対象 dev server:** http://localhost:3001/
**DB:** ローカル D1 (`tanstack-start-template-d1`)
**全パスワード共通:** `Password123!`

> **注意:** 当初は `mt42-user-a-...` のような独自テキスト ID で seed していたが、
> `userRepository.toUser` が `IdGenerator.validate` で **UUID v7** 形式を要求するため
> ログイン時に `SystemError(DATA_INTEGRITY_ERROR: malformed id)` が発生していた。
> 全エンティティの ID を UUID v7 (suffix-tagged) に切り替えて再シード済み。
> ID の suffix（末尾 12 文字）に意味的タグを埋め込んで識別しやすくしてある。

---

## 投入方針

このプロジェクトには `pnpm seed` 等の seed script は存在しない。
HTTP signup (`signUpFn` server-fn) は curl からの直接呼び出しが
TanStack Start の compiled URL convention（`createClientRpc(functionId)` で
コンパイル時に注入される）の関係でやりづらかったため、
**`wrangler d1 execute --local --file` で直接 SQL INSERT した**。

- パスワードハッシュは `app/core/adapters/d1/repositories/credentialStore.ts`
  と同じ PBKDF2-SHA256 / 600,000 iter / 16 byte salt / 32 byte derived key を
  Node.js (`crypto.pbkdf2Sync`) で再現。
- `users.email_verified = 1` を直挿しすることで email-verification を skip。
  （ローカルの `ConsoleEmailSender` は stdout にしか吐かないので、
  実 verify token フローを通すと dev server ログから token を拾う必要がある）
- 既存の本番テストユーザー（`testuser`, `tc-*` など）は触っていない。
  全て `mt42-` プレフィックスで分離。

生成スクリプト: `/tmp/seed-42.cjs`
発行 SQL: `/tmp/seed-42.sql`

---

## 投入ユーザー

| キー | username | email | password | user.id (UUID v7) | 用途 |
|---|---|---|---|---|---|
| A | `mt42-alice` | `mt42-alice@example.com` | `Password123!` | `019e4114-5869-78f4-a846-0000000a0001` | TC-1 オーナー（unlisted ノート + 添付メディア保持） |
| B | `mt42-bob`   | `mt42-bob@example.com`   | `Password123!` | `019e4114-5869-78b9-9edc-0000000b0001` | TC-1 閲覧者（他人として download URL にアクセス） |
| C | `mt42-carol` | `mt42-carol@example.com` | `Password123!` | `019e4114-5869-78e8-9634-0000000c0001` | TC-2 trashed ノート所有者（複製拒否確認） |
| D | `mt42-dave`  | `mt42-dave@example.com`  | `Password123!` | `019e4114-5869-7d9e-9914-0000000d0001` | TC-3 slug 衝突復元拒否確認 |

各 user.id の **末尾 12 文字**（suffix）に識別タグが埋め込んである:
- `0000000a0001` = user A
- `0000000b0001` = user B
- `0000000c0001` = user C
- `0000000d0001` = user D

ルートディレクトリ（各ユーザー所有、`name=""`, `slug=""`, `depth=0`）:

| owner | directory.id |
|---|---|
| A | `019e4114-5869-7c64-8958-04200d061001` |
| B | `019e4114-5869-7ad1-bb3f-04200d062001` |
| C | `019e4114-5869-7192-9e53-04200d063001` |
| D | `019e4114-5869-7d3b-9ee4-04200d064001` |

全員:
- `email_verified = 1`（ログイン可）
- `role = member`
- `banned = 0`
- 各自の root ディレクトリ (`name=""`, `slug=""`, `depth=0`) を所有

---

## 投入ノート / publication / メディア

### TC-1: DownloadMedia 他人 unlisted 拒否

- **オーナー A の note**
  - id: `019e4114-5869-71c5-8666-420074631001`
  - slug: `tc1-unlisted`
  - title: `TC1 Unlisted Note`
  - status: `active`
  - publication: `visibility = unlisted`, `published_at = 2026-05-20T10:00:00Z`
- **添付メディア**
  - id: `019e4114-5869-776b-a627-42006d6431a1`
  - kind: `image`, mime: `image/png`, status: `attached`, ref_count: 1
  - storage_key: `media/019e4114-5869-776b-a627-42006d6431a1.png`
  - `note_media_refs` で TC-1 note に紐付け済み
  - **注意:** 実ファイルは R2 (Miniflare local) に置いていない。
    UI 上で download URL を踏むと 404 (R2) または `media_not_viewable` (権限) が出る。
    本テストの確認対象は **権限拒否 (`BusinessRuleError(media_not_viewable)`)** の方なので、
    B でログイン → A のノート download URL に share-link 無しでアクセスし、
    **403 相当のエラー表示**が出れば PASS。
  - share-link は **未作成**（テスト本体が「share-link 無し」を確認するため）

### TC-2: DuplicateNote trashed 拒否

- **オーナー C の note**
  - id: `019e4114-5869-7142-ab6b-420074632001`
  - slug: `tc2-to-duplicate`
  - title: `TC2 Trashed Note`
  - status: `trashed`, `trashed_at = 2026-05-20T10:00:00Z`
  - publication: `private`
  - ゴミ箱画面から「複製」を実行すると `note_already_trashed` で拒否される

### TC-3: RestoreNote slug 衝突拒否

- **オーナー D の note B (trashed, slug=sample)**
  - id: `019e4114-5869-7caf-8ff7-420074633b01`
  - slug: `sample`, status: `trashed`, `trashed_at = 2026-05-20T10:00:00Z`
- **オーナー D の note C (active, slug=sample)**
  - id: `019e4114-5869-73f5-854d-420074633c01`
  - slug: `sample`, status: `active`
- D でログインし、ゴミ箱から **note B を restore** すると
  `slug_conflict` で拒否される（partial unique index `WHERE status='active'` で
  active 同士衝突するため）

  確認ポイント:
  - 復元前に active な C の slug を別の値にすれば B の復元が通る（衝突なしケース）
  - active 同士で `sample` を増やそうとすると DB レベルで `UNIQUE` 違反

---

## ID 一覧（テスト agent 用クイックリファレンス）

| エンティティ | ID (UUID v7) | suffix tag |
|---|---|---|
| user A (mt42-alice) | `019e4114-5869-78f4-a846-0000000a0001` | `0000000a0001` |
| user B (mt42-bob)   | `019e4114-5869-78b9-9edc-0000000b0001` | `0000000b0001` |
| user C (mt42-carol) | `019e4114-5869-78e8-9634-0000000c0001` | `0000000c0001` |
| user D (mt42-dave)  | `019e4114-5869-7d9e-9914-0000000d0001` | `0000000d0001` |
| directory A (root)  | `019e4114-5869-7c64-8958-04200d061001` | `04200d061001` |
| directory B (root)  | `019e4114-5869-7ad1-bb3f-04200d062001` | `04200d062001` |
| directory C (root)  | `019e4114-5869-7192-9e53-04200d063001` | `04200d063001` |
| directory D (root)  | `019e4114-5869-7d3b-9ee4-04200d064001` | `04200d064001` |
| note TC-1 (unlisted, owner A) | `019e4114-5869-71c5-8666-420074631001` | `420074631001` |
| media TC-1 (attached) | `019e4114-5869-776b-a627-42006d6431a1` | `42006d6431a1` |
| note TC-2 (trashed, owner C) | `019e4114-5869-7142-ab6b-420074632001` | `420074632001` |
| note TC-3 B (trashed sample, owner D) | `019e4114-5869-7caf-8ff7-420074633b01` | `420074633b01` |
| note TC-3 C (active sample, owner D) | `019e4114-5869-73f5-854d-420074633c01` | `420074633c01` |

ID は **再シードのたびに timestamp 部 (先頭 48bit) が変わる**。
末尾の suffix tag は固定なので、テスト中に対象を特定する場合は
`WHERE id LIKE '%420074631001'` のように suffix で検索すると安定する。
（最新値は `/tmp/seed-42.sql` の末尾コメントブロックにも書かれている）

---

## ブラウザ操作で使うログイン情報（メイン agent 用）

| シナリオ | URL | email | password |
|---|---|---|---|
| TC-1 オーナー A としてログイン | http://localhost:3001/login | `mt42-alice@example.com` | `Password123!` |
| TC-1 閲覧者 B としてログイン   | http://localhost:3001/login | `mt42-bob@example.com`   | `Password123!` |
| TC-2 オーナー C としてログイン | http://localhost:3001/login | `mt42-carol@example.com` | `Password123!` |
| TC-3 オーナー D としてログイン | http://localhost:3001/login | `mt42-dave@example.com`  | `Password123!` |

ログイン手順:
1. ブラウザを起動して `http://localhost:3001/login` を開く
2. email / password を入力して送信
3. リダイレクト先が `/` または `/notes` 等になれば成功

---

## 詰まった点 / 注意事項

1. **HTTP signup が curl で叩けなかった**
   TanStack Start v1.169 の server-fn は compile-time に `functionId` を埋め込み、
   client RPC は `createClientRpc(functionId)` 経由で fetch するため、
   curl で `/_serverFn/<name>` のような URL を当てても 500 (`HTTPError`) になる。
   ブラウザフォーム経由なら問題なく動く。
   → メイン agent は **ブラウザでログインする前提** で動かしてよい。

2. **email verification を skip した**
   `ConsoleEmailSender` (`app/core/adapters/cloudflare/identity/emailSender.ts`)
   は verification リンクをログに吐くだけで実送信しない。
   今回は `users.email_verified = 1` を直接立てて bypass した。
   `logIn.ts` は `User.status === 'pending'` の場合に `unverified` を返すが、
   `users.email_verified = 1` の場合 status は `active` 扱いになる。

3. **TC-1 メディアの実バイト列は R2 に無い**
   テスト本体は「他人 unlisted への download アクセスが
   `media_not_viewable` で拒否される」を確認するもので、
   downloadMedia usecase 内の **権限チェック（assertViewableBy）が
   R2 アクセスより先に走る** 想定。
   もし権限チェックを通った後に R2 fetch で 404 が出るような UI の場合は、
   先に media に対する権限拒否エラーが表示されるかどうかで判定する。

4. **share-link は意図的に作成していない**
   TC-1 の確認ポイントは「share-link 無しでアクセス → 拒否」なので
   share-link 行は seed していない。
   share-link 経由の正常系も確認したい場合は、A でログインして
   ノート詳細から share-link を発行する手順を追加すること。

5. **既存の本番風データに非干渉**
   `mt42-` プレフィックスを全エンティティに付けているので、
   既存の `testuser` / `tc-*` 等のデータと混ざらない。
   削除する場合は `DELETE FROM users WHERE username LIKE 'mt42-%';` で
   ON DELETE CASCADE により関連行も全消去できる。

6. **再シード手順**
   ```bash
   pnpm exec wrangler d1 execute tanstack-start-template-d1 --local \
     --command "DELETE FROM users WHERE username LIKE 'mt42-%';"
   node /tmp/seed-42.cjs > /tmp/seed-42.sql
   pnpm exec wrangler d1 execute tanstack-start-template-d1 --local \
     --file=/tmp/seed-42.sql
   ```

---

## 次フェーズへの引き継ぎ

- dev server は **停止しない**（http://localhost:3001/ で稼働中）
- ブラウザは `agent-browser` 等で `http://localhost:3001/login` から開始
- 各 TC のオーナーで個別にログインし、それぞれのシナリオを実行する
- スクリーンショットは `.issue/42/.manual-test/screenshots/` に保存
- 結果レポートは `.issue/42/.manual-test/results/` 配下に格納予定
