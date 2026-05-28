# 実装計画 — Issue #299: router.invalidate() のフィルタ化で AppShell 持続化を強化する

**Issue:** #299
**作成日:** 2026-05-29
**複雑度:** 中〜大規模

---

## 目的

PR #297 (Issue #293) で `_app` に束ねた AppShell の持続化を、**mutation 後にも維持**できるようにする。
コード内に 57 箇所残る `router.invalidate()` ノーフィルター呼び出しが `_app.loader` を再評価させ、Sidebar の `loadDirectoryTree` が DB ヒットしている。
AppShell の依存データ（Sidebar の directory tree / Header の displayName / 認証状態）に影響しない mutation では `_app` を invalidate 対象から除外する。

## スコープ

### 含まれるもの

- `app/components/common/routerInvalidate.ts` の新設（`_app` を除外する薄いラッパー）
- `router.invalidate()` ノーフィルター呼び出し 57 箇所の分類と置換:
  - **AppShell 影響**（13 箇所）: 生 `router.invalidate()` のまま + WHY コメント追加
  - **AppShell 非影響**（44 箇所）: `routerInvalidate(router)` 経由に置換
- 既存テスト（`UploadDialog.test.tsx` 等）が引き続き通ることの確認

### 含まれないもの

- TanStack Router の cache 戦略全般の見直し
- `_app.loader` 自体のリファクタリング（`errorComponent`、payload 削減等）
- Sidebar に tag 一覧を表示する機能追加（将来の議論）
- `staleTime` の動的調整、SSR / SPA キャッシュ別戦略
- AccountDeleteForm の `router.clearCache` 化（フォローアップ）

## 調査結果

### 関連ファイル
**ラッパー新設先**: `app/components/common/routerInvalidate.ts`（新規）
**既存パターン参照**: `app/components/common/styles.ts`, `Dialog.tsx`, `ConfirmDialog.tsx`, `Icon.tsx`

**`router.invalidate()` 実コール箇所**: 57 件（39 ファイル）
コメント 1 件（`app/components/note/actions.ts:39`）と テストファイル内文字列は除外。

### あるべきアーキテクチャ
- `CLAUDE.md`「Utility-first / 共通プリミティブは `app/components/common/`」。`styles.ts` と並列で薄い helper を置くのが既存パターン
- `app/lib/` は「全レイヤーが依存する構造プリミティブ」のためフロントエンド固有の helper を入れるのは不適切
- `.issue/293/adr.md` ADR-010: `router.invalidate({ filter: r => r.routeId !== "/_app" })` の薄いラッパーを `app/components/common/` に追加する方針が明示
- `_app.loader` の `staleTime: Infinity`（本番）が「リーフ遷移時に AppShell を保持」唯一の保証。ノーフィルター `invalidate()` はこれを無効化する
- `_app.loader` は `loaderDeps` を持たず `staleTime: Infinity`。**認証状態が変わっても自動再評価されない**。`gcTime`（既定 30 分）内なら過去の cachedMatches が再利用される

### AppShell の依存データ（invalidate 必要性の判定軸）

1. **認証状態**: 未認証 ⇄ 認証の遷移（`_app.loader` の `userDto` が変わる）
2. **Sidebar の directory tree**: `loadDirectoryTree(user.id)` の構造（id / name / parentId / children）
3. **Header の displayName**: avatar initials / aria-label

これら 3 軸のいずれかに影響する mutation のみ `_app` を invalidate する。

### 既存実装の状態
**乖離あり**: `_app` 持続化を強化する不変条件が破られている。57 箇所のノーフィルター呼び出しが残存。本 Issue で解消する。

### 依存関係
- TanStack Router v1.169 の `InvalidateFn` 型: `(opts?: { filter?: (d: MakeRouteMatchUnion<TRouter>) => boolean; sync?: boolean; forcePending?: boolean }) => Promise<void>`
- `match.routeId` フィールドで `_app` を判定可能（`routeTree.gen.ts` で `id: '/_app'` を確認済み）

---

## `router.invalidate()` 呼び出し箇所の全件分類

### AppShellに影響する mutation（生 `router.invalidate()` のまま + WHY コメント — 13 箇所）

**directory 構造変更（Sidebar tree に影響）**
| ファイル | 行 | mutation | WHY コメント |
|---|---|---|---|
| `app/components/directory/CreateDirectoryDialog.tsx` | 73 | ディレクトリ作成 | Sidebar の directory tree を更新するため `_app` も invalidate（rule 2） |
| `app/components/directory/DeleteDirectoryDialog.tsx` | 40 | ディレクトリ削除 | 同上 |
| `app/components/directory/RenameDirectoryDialog.tsx` | 70 | ディレクトリ改名 | 同上 |
| `app/components/directory/MoveDirectoryDialog.tsx` | 99 | ディレクトリ移動 | 同上 |
| `app/components/directory/DirectoryTree.tsx` | 496 | インライン改名 | 同上 |

**Header 表示に影響**
| ファイル | 行 | mutation | WHY コメント |
|---|---|---|---|
| `app/components/identity/ProfileForm/index.tsx` | 40 | `updateProfile`（displayName） | Header の displayName / avatar を更新するため `_app` も invalidate（rule 3） |

**認証状態が変わる**
| ファイル | 行 | mutation | WHY コメント |
|---|---|---|---|
| `app/components/identity/AccountDeleteForm/index.tsx` | 34 | アカウント削除 | 過去訪問の cached `_app` match に残る旧 `userDto` を破棄するため `_app` も invalidate（rule 1） |
| `app/components/auth/LoginForm/index.tsx` | 75 | ログイン | cached `_app` match の `userDto: null` を破棄し、`/` 遷移後に AppShell を再評価させるため（rule 1） |
| `app/components/auth/SignUpForm/index.tsx` | 72 | サインアップ | 同上 |
| `app/components/auth/AdminSignUpForm/index.tsx` | 81 | admin サインアップ | 同上 |
| `app/components/auth/VerifyEmail/index.tsx` | 71 | メール確認後の認証 | 同上 |
| `app/components/auth/EmailChangeConfirm/index.tsx` | 57 | メール変更確認 | `_app` の `userDto.email` キャッシュを破棄するため（rule 1 / rule 3 にも該当する可能性） |
| `app/components/auth/PasswordResetConfirmForm/index.tsx` | 96 | パスワードリセット完了 | 認証状態確立後の AppShell 再評価のため（rule 1） |

### AppShellに影響しない mutation（`routerInvalidate(router)` 経由に置換 — 44 箇所）

**note 操作**
- `app/components/note/list/MoveNoteDialog.tsx:73` — note の所属ディレクトリ変更（tree 構造は不変、note 一覧のみ更新）
- `app/components/note/list/BulkActionBar.tsx:54` — bulk trash
- `app/components/note/list/BulkVisibilityDialog.tsx:64` — bulk visibility
- `app/components/note/editor/NoteEditor.tsx:263` — saveNote
- `app/components/trash/TrashRowActions.tsx:34,46` — restore / purge

**ingestion**
- `app/components/ingestion/UploadDialog.tsx:321,532` — upload 完了 / FailedView discard（upload は job 作成のみで directory を作らない）
- `app/components/ingestion/UploadForm.tsx:40`
- `app/components/ingestion/IngestionPreviewForm.tsx:210` — discard（commit パスは invalidate 不使用）
- `app/components/ingestion/IngestionJobRow.tsx:96,108` — discard / regenerate

**publication**
- `app/components/publication/PublishSettings/index.tsx:55,71,182,197` — visibility / share link 発行 / revoke / rotate password

**identity（プロフィール表示・認証状態以外）**
- `app/components/identity/PromptsForm/index.tsx:100,114` — ユーザー prompts
- `app/components/identity/SecurityForm/index.tsx:43,60,77` — password / email-change request / session 一括失効
- `app/components/identity/ProfileForm/index.tsx:54` — changeUsername（username は Header に表示されない）

**admin（`_app` 外の admin layout）**
- `app/components/admin/UsersTable/index.tsx:230`
- `app/components/admin/PromptsForm/index.tsx:122,137,264`
- `app/components/admin/DesignTokensForm/index.tsx:92,107,139`
- `app/components/admin/RegistrationForm/index.tsx:43,59`
- `app/components/admin/LLMSettingsForm/index.tsx:145`
- `app/components/admin/Jobs/index.tsx:462`

**view / export（`_app` 外）**
- `app/components/view/SavedViewsList/index.tsx:53,70,87`
- `app/components/export/ExportForm/index.tsx:116`
- `app/components/export/ExportJobsList/index.tsx:54`
- `app/components/export/ExportJobDetail/index.tsx:52,72`

**tag（Sidebar のタグセクションは静的 Link のみで一覧表示なし）**
- `app/components/tag/TagActions.tsx:45,58`
- `app/components/tag/CreateTagForm.tsx:34`
- `app/components/tag/MergeTagDialog.tsx:62`

合計: 44 箇所

---

## 実装ステップ

### 1. ラッパー関数を新設

- **対象ファイル:** `app/components/common/routerInvalidate.ts`（新規）
- **変更内容:**
  ```ts
  import type { AnyRouter } from "@tanstack/react-router";

  export const APP_SHELL_ROUTE_ID = "/_app";

  type InvalidateOpts = NonNullable<Parameters<AnyRouter["invalidate"]>[0]>;
  type InvalidateFilter = NonNullable<InvalidateOpts["filter"]>;

  /**
   * `router.invalidate()` のラッパー。デフォルトで `_app` layout route を
   * 除外し、AppShell loader の `staleTime: Infinity` を mutation 後にも
   * 維持する。
   *
   * 以下のいずれかに該当する mutation でのみ生の `router.invalidate()`
   * を直接呼ぶこと（AppShell を再評価させたいケース）:
   *   rule 1. 認証状態が変わる（未認証 ⇄ 認証）
   *   rule 2. Sidebar の directory tree を改変する
   *   rule 3. Header の `displayName` を改変する
   *
   * `sync` / `forcePending` を必要とする場合はラッパーを拡張するか
   * 生の `router.invalidate()` を使う。経緯は `.issue/293/adr.md`
   * ADR-010 と `.issue/299/adr.md` を参照。
   */
  export function routerInvalidate(
    router: AnyRouter,
    filter?: InvalidateFilter,
  ): Promise<void> {
    return router.invalidate({
      filter: filter ?? ((match) => match.routeId !== APP_SHELL_ROUTE_ID),
    });
  }
  ```
- **理由:** ADR-010 の合意 API。型シグネチャは `AnyRouter["invalidate"]` の引数型から導出することで `MakeRouteMatchUnion<TRouter>` と `AnyRouteMatch` のミスマッチを回避

### 2. AppShell 非影響の 44 箇所を一括置換

- **対象ファイル:** 上記分類の「AppShellに影響しない mutation」群（44 箇所、ファイル数 30）
- **変更内容:** `await router.invalidate();` → `await routerInvalidate(router);` + `routerInvalidate` の import を追加
- **理由:** ノーフィルター呼び出しが `_app.loader` を再評価して Sidebar を再 fetch する問題を排除

### 3. AppShell 影響の 13 箇所はそのまま残す（WHY コメント追加）

- **対象ファイル:** directory 系 5 箇所 + ProfileForm:40 + AccountDeleteForm:34 + auth 系 6 箇所
- **変更内容:** 既存 `router.invalidate()` の直前に短い WHY コメント（上の表の通り）を追加
- **理由:** ラッパー導入後、レビュアー・将来の自分が「なぜここだけ生 invalidate か」を即座に判断できるようにする（CLAUDE.md「コメントは WHY が非自明な時のみ」に合致）

### 4. テスト確認

- **対象ファイル:** `app/components/ingestion/__tests__/UploadDialog.test.tsx`
- **変更内容:** 既存 assertion がラッパー経由でも引き続き通ることを確認。`router.invalidate` mock は内部呼び出し（`router.invalidate({ filter })`）でもヒットするため、修正不要の想定
- **理由:** 既存 mock の整合性確認

### 5. 完全性チェック

- **実行:** `rg "await router\.invalidate\(\);" app/components/`
- **期待:** 上記の AppShell 影響 13 箇所のみ残っていること
- **理由:** 機械的置換の見落とし防止（33 ファイルに分散）

### 6. 品質ゲート

- **実行:** `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test`
- **理由:** CLAUDE.md 規約

---

## 設計判断

詳細は `.issue/299/adr.md` を参照。

- **ラッパー配置:** `app/components/common/routerInvalidate.ts`（独立ファイル）
- **命名:** `routerInvalidate`、定数 `APP_SHELL_ROUTE_ID = "/_app"`
- **フィルタ:** `match.routeId !== "/_app"`（厳密一致で layout match のみ除外、leaf match は invalidate 対象に残す）
- **AppShell 影響 mutation:** 生 `router.invalidate()` のまま + WHY コメント
- **`_app` を invalidate すべきルール（3 軸）:** ① 認証状態が変わる / ② Sidebar の directory tree を改変 / ③ Header の displayName を改変

## リスクと注意点

- **leaf 配下の `_app/notes/$noteId` 等は除外されない**: フィルタは `=== "/_app"` の厳密一致なので、leaf route の loader は invalidate される（意図通り — note 編集後に詳細ページ loader を再評価したい）
- **dev mode の `staleTime: 0`**: `_app.route.tsx` は dev で `staleTime: 0`。フィルタ効果は production build で確認すべき。dev で「効いてる」と誤判定するパターンは Issue #293 で踏んでいるため testing.md で本番ビルド検証を必須化
- **auth 状態遷移時の cached `_app` match**: `_app.loader` は `loaderDeps` を持たず `staleTime: Infinity`。`/` ランディング（未認証）→ `/login` → 再ログイン → `/` 復帰のフローで cached `userDto: null` が `gcTime`（30 分）内に残り再利用される。auth 系 6 箇所を「AppShell 影響あり」に分類する根拠
- **tag 操作の判定**: 実コードでは Sidebar にタグ一覧が出ないため非影響と判定。将来 Sidebar にタグセクションを追加する場合は tag 系 4 箇所を「影響あり」へ移す（ADR-004 参照）
- **ProfileForm 内で扱いが分岐**: `updateProfile`（40 行）は AppShell 影響、`changeUsername`（54 行）は非影響。両者を混同しないよう WHY コメント必須

## テスト方針

- **typecheck:** `pnpm typecheck` で新ラッパーの型解決を確認
- **既存テスト:** `pnpm test` 全 pass
- **完全性確認:** `rg "await router\.invalidate\(\);" app/components/` で残箇所が AppShell 影響 13 箇所のみであること
- **manual-test（本番ビルド必須）:** 詳細は `.issue/299/testing.md`
  - dev mode（`staleTime: 0`）では効果検証できないため本番ビルドで確認
  - `_app.loader` 呼び出し回数を Network タブまたは server log で計測
  - 各 mutation 後に「Sidebar が再フェッチされない」「該当 leaf loader は再評価される」ことを定量的に確認

---

## レビュー履歴

### 1周目（2026-05-29）
**修正した点（要件カバレッジ視点）**:
- **P-001 / P-001（両視点共通）**: auth 系 6 箇所（LoginForm:75, SignUpForm:72, AdminSignUpForm:81, VerifyEmail:71, EmailChangeConfirm:57, PasswordResetConfirmForm:96）を「AppShell 非影響」→「影響あり」に再分類。理由: `_app.loader` の cached `userDto: null` が `gcTime` 内に再利用されるリスク
- **P-002（要件カバレッジ）**: 実コール数を 56→57 に訂正、影響あり 7→13、影響なし 49→44 に再集計

**修正した点（アーキ・リスク視点）**:
- **P-002（アーキ）**: ラッパーの型シグネチャを `Parameters<AnyRouter["invalidate"]>[0]` から導出する形に修正（`MakeRouteMatchUnion<TRouter>` と `AnyRouteMatch` のミスマッチを回避）
- **P-003（アーキ）**: testing.md で「本番ビルド必須」を明示し、`_app.loader` の呼び出し回数を Network タブ / server log で定量的に確認する手順を組み込む

**取り込んだ改善提案**:
- **S-001（アーキ）**: JSDoc に「`_app` を invalidate すべき 3 つのルール」を明文化
- **S-002（アーキ）**: `sync` / `forcePending` は意図的にサポートしない旨を JSDoc に記載
- **S-002（要件）**: ADR-004 に「Issue 本文の tag 例示は Sidebar 旧仕様を仮定。実コードでは非影響」と経緯を追記
- **S-003（要件）**: 完全性チェックステップ（`rg "await router\.invalidate\(\);"`）を実装ステップに追加

**見送った提案とその理由**:
- **S-003（アーキ）**: AccountDeleteForm を `router.clearCache` 化する提案は本 Issue のスコープ外（mutation キャッシュ管理戦略の別議論）。フォローアップ Issue 候補として記録
- **S-004（アーキ）**: ProfileForm:54 への将来耐性コメント追加は本 Issue では見送り。WHY コメントは「invalidate を残した理由」に限定する原則を維持
- **S-003（要件）**: leaf loader 期待マッピング表は冗長になりすぎるため、testing.md のチェックリストで代替

### 2周目（2026-05-29）
**両視点とも問題点ゼロで終了**

**改善提案（フォローアップ候補として記録、本 Issue では見送り）**:
- **S-001（アーキ 2周目）**: ラッパー導入後の lint ガードレール（生 `router.invalidate(` を新規追加した際の検出機構）。本 Issue スコープ外
- **S-002（アーキ 2周目）**: `routerInvalidate.ts` の単体テスト。薄いラッパーへの過剰投資の可能性もあり任意。本 Issue では見送り
