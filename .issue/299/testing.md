# 動作確認計画 — Issue #299: router.invalidate() のフィルタ化で AppShell 持続化を強化する

**Issue:** #299
**作成日:** 2026-05-29

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動（本番ビルド必須）

```bash
pnpm build
pnpm start
```

- `pnpm build` は `vite build --config vite.config.cloudflare.ts`、`pnpm start` は `wrangler dev` を実行（package.json `scripts.build` / `scripts.start` で確認）
- 本 Issue の効果は `_app.loader` の `staleTime: Infinity` 経路でしか観測できない。`_app/route.tsx` は dev で `staleTime: 0` なので `pnpm dev` では効果検証不可
- `pnpm preview` でも本番ビルドのプレビューは可能だが、wrangler 配下の D1 / Queues / KV を使う本プロジェクトでは `wrangler dev` (`pnpm start`) の方が本番ランタイムに近い

### 静的検証

```bash
pnpm typecheck
pnpm lint:fix
pnpm format
pnpm test
```

### 完全性チェック

```bash
rg "await router\.invalidate\(\);" app/components/
```

期待: AppShell 影響 13 箇所のみがヒット
- directory 系 5 箇所（CreateDirectoryDialog / DeleteDirectoryDialog / RenameDirectoryDialog / MoveDirectoryDialog / DirectoryTree）
- identity 系 2 箇所（ProfileForm:40 / AccountDeleteForm:34）
- auth 系 6 箇所（LoginForm / SignUpForm / AdminSignUpForm / VerifyEmail / EmailChangeConfirm / PasswordResetConfirmForm）

### デプロイ方法

本 Issue の変更は frontend 専用（DB スキーマや関数境界に変更なし）。
- ステージング: `pnpm deploy:staging`
- 本番: `pnpm deploy:production`

ローカル検証 (`pnpm build && pnpm start`) でも本番と同じ `staleTime: Infinity` 経路を踏むため、デプロイ前検証は基本的にローカルで完結する。

---

## 確認項目

各項目は **本番ビルド（`pnpm build && pnpm start`）で実行**。dev モードでは `_app` の `staleTime: 0` のため効果差異が観測できない。

### 1. ベースライン: AppShell の初回マウントと持続化

- **目的:** ログイン直後に AppShell（Header / Sidebar）が正しく描画され、リーフ遷移時に再マウントされないこと（Issue #293 で確立した不変条件のリグレッション確認）
- **手順:**
  1. `pnpm build && pnpm start` で起動
  2. ログイン → `/` に遷移
  3. ブラウザの DevTools → React Components で `<AppShellFrame>` を選択し、内部 fiber id をメモ
  4. Sidebar のディレクトリリンク → `/_app/notes/$noteId` → `/_app` に戻る、を 3 回繰り返す
- **期待結果:**
  - `<AppShellFrame>` の fiber id が変わらない（同一マウント）
  - Network タブで `loadAppShell` RPC が **1 回のみ**呼ばれ、以降のリーフ遷移では呼ばれない
- **確認ポイント:** Sidebar の directory tree が DB から再フェッチされない（server log で `loadDirectoryTree` が 1 回のみ）

### 2. AppShell 非影響 mutation: Sidebar が再フェッチされないこと

各 mutation 後に `_app.loader` が再評価されないことを確認する（本 Issue の主目的）。

#### 2-1. note 編集
- **手順:**
  1. `/_app/notes/$noteId/edit` で本文を編集 → 保存（`NoteEditor.tsx:263` 経路）
  2. Network タブで `loadAppShell` が呼ばれないこと
  3. note 詳細 leaf loader は再評価される（note 本文の更新が反映される）
- **期待結果:** Sidebar の directory tree が DOM 上で変化なし、Network に `loadAppShell` のリクエストなし

#### 2-2. bulk visibility 変更
- **手順:**
  1. note 一覧で複数 note を選択 → bulk visibility（`BulkVisibilityDialog.tsx:64` 経路）
  2. note 一覧 leaf は再評価される
- **期待結果:** `loadAppShell` 呼ばれず、note 一覧の visibility 表示のみ更新

#### 2-3. publish settings 変更
- **手順:**
  1. note 詳細 → publish settings → visibility 変更 / share link 発行（`PublishSettings/index.tsx:55,71,182,197` 経路）
- **期待結果:** `loadAppShell` 呼ばれず、publication leaf のみ更新

#### 2-4. tag 操作
- **手順:**
  1. `/tags` でタグ作成（`CreateTagForm.tsx:34`）/ rename（`TagActions.tsx:45`）/ remove（`TagActions.tsx:58`）/ merge（`MergeTagDialog.tsx:62`）
- **期待結果:** `loadAppShell` 呼ばれず（Sidebar にタグ一覧が出ないため）、tag 一覧 leaf のみ更新

#### 2-5. saved view CRUD
- **手順:**
  1. saved view の作成・編集・削除（`SavedViewsList/index.tsx:53,70,87`）
- **期待結果:** `loadAppShell` 呼ばれず、view 一覧 leaf のみ更新

#### 2-6. export / ingestion
- **手順:**
  1. export ジョブ作成（`ExportForm/index.tsx:116`）/ キャンセル
  2. ingestion upload（`UploadDialog.tsx:321`、`UploadForm.tsx:40`）/ discard
- **期待結果:** `loadAppShell` 呼ばれず、export / ingestion 関連 leaf のみ更新

#### 2-7. プロフィール変更（changeUsername のみ）
- **手順:**
  1. `/settings/profile` で username のみ変更（`ProfileForm/index.tsx:54` 経路）
- **期待結果:** `loadAppShell` 呼ばれない（username は Header に表示されない）

#### 2-8. trash / security / prompts
- **手順:**
  1. trash で restore / purge（`TrashRowActions.tsx:34,46`）
  2. security でパスワード変更 / セッション一括失効（`SecurityForm/index.tsx:43,60,77`）
  3. user prompts 編集（`PromptsForm/index.tsx:100,114`）
- **期待結果:** `loadAppShell` 呼ばれず、それぞれの leaf のみ更新

### 3. AppShell 影響 mutation: Sidebar / Header / 認証が更新されること

#### 3-1. directory tree 改変（rule 2）
- **手順:**
  1. `/` で Sidebar の directory tree を操作:
     - ディレクトリ作成（`CreateDirectoryDialog.tsx:73`）
     - 改名（`RenameDirectoryDialog.tsx:70` / `DirectoryTree.tsx:496`）
     - 移動（`MoveDirectoryDialog.tsx:99`）
     - 削除（`DeleteDirectoryDialog.tsx:40`）
- **期待結果:**
  - `loadAppShell` が **1 回呼ばれる**
  - Sidebar の directory tree DOM に変更が反映される
  - 全体 AppShell の fiber id は維持される（`_app.component` 自体は再評価されない）

#### 3-2. displayName 更新（rule 3）
- **手順:**
  1. `/settings/profile` で displayName を変更（`ProfileForm/index.tsx:40` 経路）
- **期待結果:**
  - `loadAppShell` が呼ばれる
  - Header の avatar initials / aria-label が新しい displayName を反映

#### 3-3. 認証状態遷移（rule 1）— ログイン
- **手順:**
  1. 未ログイン状態で `/` を訪問（ランディング表示）→ `loadAppShell` が `userDto: null` でキャッシュされる
  2. `/login` に遷移 → ログイン成功（`LoginForm/index.tsx:75` 経路）
  3. `/` に navigate された後、AppShell が描画されること
- **期待結果:**
  - ログイン直後に `loadAppShell` が再評価され、`userDto` が新しい値で更新される
  - 未認証時の cached `userDto: null` が再利用されず、AppShell が **正しく表示**される（ランディングのままにならない）

#### 3-4. 認証状態遷移（rule 1）— サインアップ / メール確認 / パスワードリセット
- **手順:**
  1. `/signup` 経由（`SignUpForm/index.tsx:72`）/ `/admin-signup`（`AdminSignUpForm/index.tsx:81`）/ メール確認リンク（`VerifyEmail/index.tsx:71`）/ メールアドレス変更確認（`EmailChangeConfirm/index.tsx:57`）/ パスワードリセット完了（`PasswordResetConfirmForm/index.tsx:96`）
- **期待結果:** いずれも完了後の遷移先で AppShell が正しく表示される

#### 3-5. 認証状態遷移（rule 1）— アカウント削除
- **手順:**
  1. `/settings/account-delete` でアカウント削除実行（`AccountDeleteForm/index.tsx:34` 経路）
- **期待結果:**
  - `/` に navigate され、未認証用のランディングが表示される
  - 過去 cached `_app` match に残る旧 `userDto` が再利用されない

---

## エッジケース・異常系

### 1. 連続 mutation 時の `loadAppShell` 呼び出し回数

- **目的:** AppShell 影響 mutation を連打したときに `loadAppShell` が必要以上に呼ばれないこと
- **手順:**
  1. ディレクトリ作成を連続 3 回実行
- **期待結果:** `loadAppShell` は概ね 3 回（mutation ごと 1 回）。同時実行で重複する場合は TanStack Router の dedupe に従う

### 2. cached `_app` match の gcTime 内再利用

- **目的:** auth 6 箇所を「影響あり」に分類した根拠の検証
- **手順:**
  1. `/` ランディング（未認証）を訪問 → `loadAppShell` キャッシュに `userDto: null` が入る
  2. すぐに `/login` → ログイン成功 → `/` 復帰
- **期待結果:** ログイン後の `/` で AppShell が正しく表示される（ランディングが表示されたら本 Issue の意図に反する回帰）
- **確認ポイント:** ログイン後の `loadAppShell` が再評価されていること（Network タブで確認）

### 3. dev mode での挙動（補助確認）

- **目的:** dev mode（`staleTime: 0`）では本 Issue の効果が観測できないことを確認し、本番ビルド検証の必要性を確認
- **手順:**
  1. `pnpm dev` で起動
  2. note 編集 → 保存
- **期待結果:** dev では `loadAppShell` が呼ばれる（`staleTime: 0` のため）。これは想定通り

---

## 既存機能への影響確認

- **Issue #293 の不変条件**: リーフ遷移時に AppShell が再マウントされないこと（リグレッション確認 — 確認項目 1）
- **Issue #219**: view toggle の挙動が router.invalidate を使わない経路でも維持されること（SavedViewsList の変更が view 表示に影響しない）
- **既存テスト**: `app/components/ingestion/__tests__/UploadDialog.test.tsx` の `router.invalidate` mock 呼び出しアサーションが pass し続けること（ラッパー経由でも `router.invalidate({ filter })` を呼ぶため mock はヒットする）

---

## 確認チェックリスト

- [ ] 静的検証（`pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test`）全 pass
- [ ] 完全性チェック（`rg "await router\.invalidate\(\);" app/components/`）が AppShell 影響 13 箇所のみ
- [ ] 確認項目 1: AppShell 持続化のリグレッション確認
- [ ] 確認項目 2-1〜2-8: 各 AppShell 非影響 mutation で `loadAppShell` 呼ばれず leaf のみ更新
- [ ] 確認項目 3-1〜3-5: 各 AppShell 影響 mutation で `loadAppShell` 呼ばれ AppShell が更新
- [ ] エッジケース 2: cached `_app` match の auth 状態遷移時の正常動作
- [ ] エッジケース 3: dev / production の挙動差異を理解した上で本番ビルドで検証完了
