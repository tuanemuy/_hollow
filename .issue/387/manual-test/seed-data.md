# Issue #387 ブラウザ検証用シードデータ

ディレクトリフィルタ（サイドバー選択 → ノート一覧反映）の検証に必要な
ログイン済み状態 + ディレクトリ階層 + ノートを local D1 に直接投入した記録。

## 実行した準備作業

1. スキーマ / 認証実装の調査
   - `app/core/adapters/d1/schema.ts`: `users` / `sessions` / `directories` / `notes` のカラム・制約を確認。
   - `app/core/adapters/d1/repositories/sessionService.ts`: セッショントークンは **平文** で `sessions.token` に保存される（better-auth 慣習、ハッシュなし）。`resolve(token)` は `token` 完全一致 + `expires_at > now` + ユーザー未削除で解決。→ **既知のトークンを直接 INSERT すればそのまま cookie 値として使える**。
   - `app/core/adapters/d1/repositories/userRepository.ts`: ステータスは `deleted_at IS NULL` かつ `banned = 0` で `active`。
   - `app/core/application/ports/idGenerator.ts`: 全 id は **UUIDv7** 形式（`validate` で正規表現チェック）。`uuid` の `v7()` で生成した値を使用。
   - ディレクトリ階層: 各ユーザーに「暗黙のルート」（`parent_id IS NULL`, `name=''`, `slug=''`, `depth=0`）が 1 つ。`app/components/directory/DirectoryTree.tsx` は `tree[0]`（=ルート）の `children` を最上位として描画する。→ **ルートの作成が必須**。
   - フィルタの仕様: home loader（`app/components/note/loaders.ts` → `listNotesByOwner`）の `directoryId` は `eq(notes.directory_id, ?)` で**直下のみ**を抽出（サブツリー走査なし）。「Parent 直下 0 件」で直下のみ仕様を確認できる。

2. 認証方式の確定
   - DB 直接投入路を採用（agent-browser からの server-function POST は 403 FORBIDDEN_CROSS_ORIGIN リスクがあるため signup/login UI は使わない）。
   - パスワードは `scrypt`（`credentialStore.ts`）でハッシュ化が必要だが、**セッションを直接投入するためログインは不要**。`accounts` 行は作っていない（パスワードログインしないため）。

3. シード SQL を作成・適用
   - ファイル: `.issue/387/manual-test/seed.sql`（冪等。先頭で既存 test-387 ユーザーを DELETE → cascade で sessions/directories/notes も消える → 再 INSERT。再実行安全）。
   - 適用: `pnpm db:execute:local .issue/387/manual-test/seed.sql`
   - SELECT で全行投入を確認済み。

## 投入したシードデータ

### users（1 件）

| id | email | username | role | status |
|----|-------|----------|------|--------|
| `019e7e96-395e-748f-a6a3-14f548134b6a` | `test-387@example.com` | `test387` | member | active |

### sessions（1 件）

| token（= cookie 値） | user_id | expires_at |
|----|----|----|
| `seed387-tEsTsEsSiOnToKeN-aaaaaaaaaaaaaaaaaaaaaaaa` | `019e7e96-395e-748f-a6a3-14f548134b6a` | `2030-01-01T00:00:00.000Z` |

### directories（5 件、ルート含む）

| id | name | slug | parent | depth |
|----|------|------|--------|-------|
| `019e7e96-395f-72f5-914f-8409b534dd18` | (root, 空) | (空) | NULL | 0 |
| `019e7e96-395f-72f5-914f-8b61c13466ab` | DirA | dira | root | 1 |
| `019e7e96-395f-72f5-914f-8d44bd3f92ff` | DirB | dirb | root | 1 |
| `019e7e96-395f-72f5-914f-91ef436ae042` | Parent | parent | root | 1 |
| `019e7e96-395f-72f5-914f-954a554043dc` | Child | child | Parent | 2 |

サイドバーには DirA / DirB / Parent が最上位、Parent を展開すると Child が表示される。

### notes（4 件、全 active）

| title | id | directory | dir 名 |
|-------|----|-----------|--------|
| NoteA1 | `019e7e96-395f-72f5-914f-994eb5509043` | `019e7e96-395f-72f5-914f-8b61c13466ab` | DirA |
| NoteA2 | `019e7e96-395f-72f5-914f-9c40782b3be3` | `019e7e96-395f-72f5-914f-8b61c13466ab` | DirA |
| NoteB1 | `019e7e96-395f-72f5-914f-a0c2e3b3886b` | `019e7e96-395f-72f5-914f-8d44bd3f92ff` | DirB |
| NoteChild1 | `019e7e96-395f-72f5-914f-a5ee6e2e35a7` | `019e7e96-395f-72f5-914f-954a554043dc` | Child |

Parent 直下のノートは **0 件**（直下のみ仕様の確認用）。

## テスト用ログイン手段

パスワードログインは不要。**セッション cookie を直接ブラウザに設定**する。

- cookie 名: `__Host-session`
- cookie 値: `seed387-tEsTsEsSiOnToKeN-aaaaaaaaaaaaaaaaaaaaaaaa`
- domain: `localhost`
- path: `/`
- secure: true（`__Host-` プレフィックス要件。ブラウザは `localhost` を secure context として扱うため http://localhost でも受理される）
- httpOnly: 設定可（読み取りは Cookie ヘッダ経由なので任意）
- sameSite: lax

### agent-browser での設定方法（推奨）

CDP の `Network.setCookie` で投入する（`__Host-` プレフィックスは `name` をそのまま指定し、`secure: true` / `path: '/'` / `domain` 無指定が要件）:

```
Network.setCookie({
  name: "__Host-session",
  value: "seed387-tEsTsEsSiOnToKeN-aaaaaaaaaaaaaaaaaaaaaaaa",
  url: "http://localhost:3100/",
  path: "/",
  secure: true,
  sameSite: "Lax"
})
```

設定後に `http://localhost:3100/` を開けばログイン済み状態になる。

### 動作確認（サーバー側でのセッション解決は検証済み）

- `curl http://localhost:3100/`（cookie なし）→ 200・約 20KB（未認証シェル）
- `curl --cookie "__Host-session=seed387-tEsTsEsSiOnToKeN-aaaaaaaaaaaaaaaaaaaaaaaa" http://localhost:3100/` → 200・約 65KB（認証済み home 全体）

バイト数差からサーバー側でセッションが解決されログイン済み描画になることを確認済み。

## 期待マッピング（テストエージェント用）

サイドバーで各ディレクトリを選択 = URL に `?directoryId=<id>` が付与され、一覧は**そのディレクトリ直下のノートのみ**に切り替わる。

| 選択ディレクトリ | directoryId | 表示されるべきノート | 件数 |
|------------------|-------------|----------------------|------|
| DirA | `019e7e96-395f-72f5-914f-8b61c13466ab` | NoteA1, NoteA2 | 2 |
| DirB | `019e7e96-395f-72f5-914f-8d44bd3f92ff` | NoteB1 | 1 |
| Parent | `019e7e96-395f-72f5-914f-91ef436ae042` | （なし） | 0 |
| Child | `019e7e96-395f-72f5-914f-954a554043dc` | NoteChild1 | 1 |
| 未選択（全件） | （なし） | NoteA1, NoteA2, NoteB1, NoteChild1 | 4 |

検証ポイント（Issue #387 の本体）:
- ディレクトリ選択が一覧に反映される。
- 選択中ディレクトリが FilterBar のチップ等で可視化される。
- フィルター解除（チップ / clearAll）で `directoryId` が適切に扱われる。
- Parent 選択時に Child のノート（NoteChild1）が**出ない**こと（直下のみ）。

## 問題と対処

- **`__Host-` cookie の Secure 要件 vs http://localhost**: `__Host-` プレフィックスは `Secure` 必須。dev サーバーは plain HTTP（HTTPS 未提供）だが、Chrome/Edge は `localhost` を secure context とみなすため http でも受理される。CDP `Network.setCookie` で `secure: true` を指定すれば確実。万一ブラウザが拒否する場合の代替は次項。
- **代替案（cookie が食えない場合）**: 同一オリジン（ブラウザ UI）からの signup → login は server-function POST だが**ブラウザ同一オリジン**なので CSRF 検証を通過しログイン cookie が正規発行される可能性が高い（記憶の 403 は agent-browser からのクロスオリジン POST が対象）。ただしこの場合 DB のディレクトリ/ノートは本シードと別ユーザーに紐づくため、その新規ユーザー id で再シードが必要。まずは本セッション cooki 路を試すこと。
- 既存データ（21 ユーザー）は破壊していない。テスト用は `test-387@example.com` / `test387` と判別可能な値のみ使用。冪等 DELETE 対象は seed の固定ユーザー id のみ。
