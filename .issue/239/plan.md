# 実装計画 — Issue #239: feat(auth): UI にログアウト導線を追加

**Issue:** #239
**作成日:** 2026-05-30
**複雑度:** 中〜大規模

---

## 目的

ログイン後のアプリ UI からセッションを破棄できるログアウト導線を追加する。現状ヘッダーのアバターは `/` への単なる `<Link>` で、UI からログアウトする経路が存在しない。ヘッダーアバターをドロップダウンメニュー化し、ユーザー情報表示・`/settings` 導線・ログアウトアクションを提供する。既存の `logOut` usecase を再利用する。

## スコープ

### 含まれるもの
- ヘッダーアバターをクリック式ドロップダウンメニューに変更（`UserMenu` クライアントコンポーネント新設）
- メニュー項目: ユーザー情報（表示名 / メール / ロール）の表示、`/settings` への導線、「ログアウト」アクション
- ログアウト用 server function（`logOut` usecase 呼び出し + セッション cookie クリア）
- ログアウト後にクライアントでルートキャッシュを破棄し `/login` へ遷移
- 既存の `DirectoryActionsMenu` の WAI-ARIA メニュー（roving tabindex / キーボード操作 / 外側クリックで閉じる）パターンを踏襲

### 含まれないもの
- 汎用 Popover / Menu プリミティブの抽出（フォローアップ。本 Issue は単一箇所での利用に留める）
- `logOut` usecase 本体の変更（既に存在し、ロジックは揃っている）
- 「全セッション破棄」など追加のセッション管理機能（`/settings/security` で別途提供済み）
- アバター画像（`avatarMediaId`）の表示対応（現状の頭文字イニシャル表示を踏襲）

## 実装ステップ

### 1. ログアウト server function の新設

- **対象ファイル:** `app/components/layout/action.ts`（新規）
- **変更内容:**
  - `createServerFn({ method: "POST" })` + `.middleware([errorResponseMiddleware])` で `logOutFn` を定義
  - `getCurrentSessionToken()`（`@/lib/server/currentUser`）でセッショントークンを取得
  - トークンが存在する場合のみ `loadServerDeps(() => import("@/core/application/identity/logOut"))` で usecase を解決して `module.logOut({ container, input: { sessionToken } })` を呼ぶ。`revoke` は冪等だが、トークンが `null`（cookie 無し＝未認証）のときは破棄すべきセッションが無いため usecase 呼び出しをスキップする。`UserMenu` はログイン済みでのみ描画されるためこの分岐は実運用ではほぼ発生しないが、`AuthenticationError` を投げるのは過剰なので静かにスキップして cookie クリアのみ行う（防御的すぎない選択）
  - `clearSessionCookie()`（`@/core/presentation/authMiddleware`）で cookie を破棄
  - 戻り値は `{ ok: true } as const` 程度。リダイレクトはクライアント側で行う（後述の設計判断 ADR-001）
- **`inputValidator` の扱い:** `logOutFn` は POST body を一切受け取らず cookie のみ参照する。`inputValidator` は付けない（`.middleware([errorResponseMiddleware])` のみ）。クライアントからは `logout({ data: undefined })` 相当で呼ぶ。
- **参考実装イメージ:**
  ```typescript
  export const logOutFn = createServerFn({ method: "POST" })
    .middleware([errorResponseMiddleware])
    .handler(async () => {
      const token = getCurrentSessionToken();
      if (token !== null) {
        const { container, module } = await loadServerDeps(
          () => import("@/core/application/identity/logOut"),
        );
        await module.logOut({ container, input: { sessionToken: token } });
      }
      clearSessionCookie();
      return { ok: true } as const;
    });
  ```
- **理由:** mutation は presentation 層の server-function エントリポイント（`loadServerDeps` + `errorResponseMiddleware`）を経由するのがプロジェクト規約。cookie 操作は presentation 層の `authMiddleware` ヘルパーに集約されている。

### 2. アバターのドロップダウン化（UserMenu コンポーネント新設）

- **対象ファイル:** `app/components/layout/UserMenu.tsx`（新規, `"use client"`）
- **変更内容:**
  - props は `{ user: UserDTO }`
  - `DirectoryActionsMenu` のメニュー実装パターン（`open` / `activeIndex` state、roving tabindex の `useEffect`、`onMenuKeyDown` で Arrow/Home/End、document-level の mousedown / Escape で閉じる、`onBlur` で focus が外れたら閉じる）を踏襲
  - トリガーはアバター（`<button>`、`className={AVATAR}`、`initials(user.displayName)`、`aria-haspopup="menu"` / `aria-expanded` / `aria-label`）
  - パネル冒頭にユーザー情報セクション（表示名・メール・ロール）を非インタラクティブな表示として配置する。`<div>`（role なし、または `role="presentation"`）+ plain text（`<span>` 等）とし、`role="menuitem"` も `tabIndex` も付けない（roving tabindex / キーボードナビゲーションの対象から外す）。ロールは「メンバー」「管理者」のように日本語ラベルに変換して表示
  - メニュー項目:
    1. 「設定」→ `/settings` への遷移（`useRouter().navigate` か、項目自体を `<Link>` ベースにする。メニューの roving tabindex と整合する形で実装。後述 ADR-002）
    2. 「ログアウト」→ `logOutFn` を `useServerFn` 経由で呼び、成功後 `router.invalidate()` → `router.navigate({ to: "/login" })`（`LoginForm` の確立パターンと対称）。`data-danger` でスタイル付け
  - `initials()` ヘルパーは Header から移動 or 共有
- **理由:** Header は server component として `renderServerComponent` 経由でレンダリングされる（`app/routes/_app/route.tsx`）ため、クリック/キーボードのインタラクションを持つメニューは `"use client"` の別コンポーネントに切り出す必要がある。

### 3. Header からの UserMenu 利用

- **対象ファイル:** `app/components/layout/Header.tsx`
- **変更内容:**
  - 現状の `<Link to="/" ...>` アバターを `<UserMenu user={user} />` に置き換え
  - 不要になった `AVATAR` / `HOME_SEARCH` / `initials` の import を整理（`UserMenu` 側へ移譲した分）
- **理由:** Issue の中心要件。アバタークリックでメニューが開くようにする。

### 4. メニュー用スタイルの追加

- **対象ファイル:** `app/components/layout/styles.ts`
- **変更内容:**
  - メニューパネル / メニュー項目 / ユーザー情報セクションのユーティリティ文字列定数を追加（`directory/styles.ts` の `ACTIONS_MENU_PANEL` / `ACTIONS_MENU_ITEM` 相当を layout 文脈で定義。アバター位置に合わせ `right-0` 配置）
  - 既存トークン（`border-hairline`, `bg-bg`, `text-ink`, `text-error`, `data-[danger]:` 等）のみ使用し、新規 CSS / `@apply` は追加しない
- **理由:** styling 規約（utility-first、繰り返し文字列はモジュールスコープ定数に集約）に従う。`directory/styles.ts` の定数を直接 import するのはレイヤー外参照になるため、layout 文脈で定義する。

## 設計判断

詳細は `adr.md` を参照。

- **ADR-001:** ログアウト後のリダイレクトを server function の `throw redirect` ではなくクライアント側 `router.invalidate()` + `navigate` で行う（`LoginForm` パターンとの対称性、ルートキャッシュの確実な破棄）。
- **ADR-002:** 「設定」項目の遷移方式（`<Link>` か `router.navigate` か）— roving tabindex のメニューパターンと整合する形を選ぶ。

## リスクと注意点

- **cookie 操作のタイミング:** `clearSessionCookie()` は `setCookie`（`@tanstack/react-start/server`）に依存。server function ハンドラ内（レスポンス組み立て前）で呼ぶ必要がある。`setSessionCookie` がログインで同様に機能している実績があるため踏襲する。
- **`getCurrentUser` の `cache()`:** ログアウト後に同一リクエストで `getCurrentUser` が呼ばれてもキャッシュは効かない（別リクエスト）。クライアントの `router.invalidate()` で `_app` の loader が再評価され、未認証として扱われる。
- **二重送信防止:** ログアウトボタンは `useTransition` / `isPending` で多重クリックを防ぐ。
- **focus 復帰:** メニューを閉じる際の focus 復帰（trigger に戻す）を `DirectoryActionsMenu` 同様に実装。ログアウト時はページ遷移するため focus 復帰は不要。
- **アクセシビリティ:** `role="menu"` / `role="menuitem"` / `aria-haspopup` / `aria-expanded` を正しく付与。ユーザー情報の表示行は `menuitem` にせず、キーボードナビゲーションの対象から外す。
- **既存挙動の喪失:** 現状アバターは `/`（ホーム）リンク。ドロップダウン化で「アバター = ホームへ」の動線は失われるが、ロゴ（`Hollow`）が `/` へのリンクとして残るため代替がある。
- **RSC 境界（server component 内の client component）:** Header は `app/routes/_app/route.tsx` で `renderServerComponent(<Header user={userDto} />)` として RSC 化される。その内部に `"use client"` の `UserMenu` を埋め込むのは標準的な RSC boundary パターンで、TanStack Start の compiler が client bundle として登録する。実装後のブラウザ検証で hydration mismatch やインタラクション不全が無いことを確認する（リスクが顕在化したら Header 全体を client component 化する代替案がある）。

## テスト方針

- ブラウザ検証（manual-test）でアバタークリック → メニュー開閉 → ログアウト → `/login` 遷移 → 認可リソース再アクセスで `/login` リダイレクト、を確認する。
- キーボード操作（Tab / Arrow / Escape / Enter）でメニューが WAI-ARIA に沿って操作できることを確認する。
- 既存の Header 表示（検索ボックス・新規作成・アップロード）に影響がないことを確認する。
- 型チェック (`pnpm typecheck`) / lint (`pnpm lint:fix`) / format (`pnpm format`) を通す。

## レビュー履歴

### 1周目（両視点 → 終了）
**要件カバレッジ視点**: 問題点ゼロ（完了条件5項目すべてが実装ステップに1:1対応、スコープ画定も適切）。

**アーキ・リスク視点**: 設計の矛盾なし。言語化不足の指摘3件を反映:
- P-001（usecase スキップ条件の意図が不明確）→ Step 1 に「トークン null＝未認証なのでスキップ、AuthenticationError は過剰」と明記＋参考実装を追加。
- P-002（`inputValidator` の扱い未記載）→ Step 1 に「POST body 無し、`inputValidator` は付けない」と明記。
- P-003（RSC 内 client component の互換性未検証）→ リスクセクションに RSC 境界の項目を追加（標準パターンだがブラウザ検証で hydration を確認）。

**取り込んだ改善提案**:
- S-002（ユーザー情報セクションの markup）→ Step 2 に「role なし `<div>` + plain text、`role="menuitem"` を付けない」と明記。

**見送った提案**: なし（指摘はすべて反映）。

両視点とも設計の根本問題はゼロのため1周で終了。
