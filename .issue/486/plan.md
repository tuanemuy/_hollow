# 実装計画 — Issue #486: 設定画面のレイアウトが他画面と一貫していない（Headerと外枠を共有・Sidebarは設定専用を維持）

**Issue:** #486
**作成日:** 2026-06-05
**複雑度:** 中〜大規模

---

## 目的

設定画面（`/settings/*`）を認証後の他画面（`/_app` 配下）と同じ共通シェル（共通 `Header` + 外枠 `APP_MAIN` の幅・padding・sticky）に寄せ、ナビゲーション体験の断絶（手書き「← Home」Header・独自外枠）を解消する。ただし左サイドバーは設定専用サブナビ（profile / security / prompts / account-delete）のまま維持する。

## スコープ

### 含まれるもの
- 設定ルートを `/_app` 配下にネストし、共通 `Header` と外枠（`APP_MAIN` の幅・padding・sticky）を継承させる
- 設定画面の手書き Header（「← Home」Link + `SETTINGS_HEADER`/`SETTINGS_TITLE`/`SETTINGS_SUBTITLE`）を廃止
- 設定専用サブナビを `SettingsSidebarNav` として切り出し、共通シェルの `<aside>` スロットに差し込む（ライブラリ Sidebar とは差し替え）
- `_app` loader の固定 chrome（ライブラリ Sidebar の RSC + `staleTime: Infinity`）を一切変更しない
- `app/components/identity/styles.ts` の `SETTINGS_*` レイアウト系を整理し、共通レイアウトトークン（`layout/styles.ts`）に寄せる

### 含まれないもの
- 左サイドバーをライブラリ Sidebar と共通化すること（明示的に禁止）
- `/settings` 直アクセス時の空白・サブページ遷移の遅延（→ #487 の領分）。本Issueでは bare `/settings` の挙動を現状より悪化させないことのみ担保。bare `/settings`（index ルートなし）への遷移は移動後も「共通 chrome + 設定サイドバー + 空 main」になる（現状の空 Outlet と同等で悪化しない）。index redirect 追加は #487 で扱う
- `_app` loader のクエリ最適化（設定セクションでディレクトリツリーを読まない最適化など）。固定 chrome 前提を崩すため対象外
- フォーム本体（`ProfileForm`/`SecurityForm`/`PromptsForm`/`AccountDeleteForm`）のロジック・スタイル変更

## 実装ステップ

### 1. 設定専用サブナビを `SettingsSidebarNav` として切り出す

- **対象ファイル:** 新規 `app/components/identity/SettingsSidebarNav.tsx`
- **変更内容:** 現 `settings/route.tsx` の `NAV` 配列と `<nav>` 描画を独立コンポーネント化する。ライブラリ `Sidebar.tsx` の内部構造（`SIDEBAR_SECTION` + `SIDEBAR_SECTION_TITLE` + `<ul>` + `<Link activeProps={ACTIVE_NAV_PROPS}>`）を踏襲し、共通レイアウトトークン（`NAV_ITEM` / `SIDEBAR_SECTION` / `SIDEBAR_SECTION_TITLE`）を使う。`<aside>` 自体は共通シェルが提供するので、本コンポーネントは「サイドバー内側」だけを描画する（`Sidebar.tsx` と同じ責務分担）。active 判定は手書き `useLocation` をやめ、`<Link activeProps={ACTIVE_NAV_PROPS}>` に寄せる（ライブラリ Sidebar と完全に揃える）。設定サブナビ各項目は子ルートを持たないため、ライブラリ Sidebar の `/views` と同様に `activeOptions` は付けず素の前方一致でよい（`/` のような exact 指定は不要）。
- **理由:** 設定サブナビは RSC データ不要の純ナビ。ライブラリ Sidebar の RSC ペイロードと差し替え可能な要素として独立させ、見た目も共通サイドバーと完全に揃える。

### 2. `_app` レイアウトで設定サブナビを共通シェルに差し込む

- **対象ファイル:** `app/routes/_app/route.tsx` / `app/components/layout/AppShellFrame.tsx` / `app/components/layout/AppShellDrawer.tsx`
- **変更内容:**
  - `AppShellDrawer`（`"use client"`）に `settingsSidebar?: ReactNode` プロパティを追加。既存の `pathname`（`useLocation` で購読済み）を使い、`const inSettings = pathname.startsWith("/settings")` を算出。`<aside>` の中身を `{inSettings && settingsSidebar ? settingsSidebar : sidebar}` で切り替える。`APP_SIDEBAR` / drawer 挙動 / focus trap / `aria-label` はそのまま共有。
  - `AppShellFrame` に `settingsSidebar?: ReactNode` を追加し、`AppShellDrawer` へ素通しする（passthrough）。
  - `_app/route.tsx` の `AppLayout` で `<AppShellFrame header={header} sidebar={sidebar} settingsSidebar={<SettingsSidebarNav />}>` のように設定サブナビ要素を渡す。
- **理由:** sidebar スロットを「ルート対応の差し替え可能スロット」にする最小手段。`_app` loader（ライブラリ Sidebar の RSC + `staleTime: Infinity`）を一切変更せず、client 側のレンダリング分岐だけで設定サブナビへ切り替える。ライブラリ Sidebar の RSC ペイロードは設定セクションで描画されないだけで、loader/キャッシュ機構は無傷（他画面へ戻ればそのまま表示される）。`settingsSidebar` を prop で受け取ることで、汎用シェルが identity を直接 import する結合を避ける（`/settings` という pathname 判定のみがシェルに残る — Issue 本文が案として明示的に許容している方式）。

### 3. 設定ルートを `/_app/settings/` 配下へ移動

- **対象:** `app/routes/settings/{route,profile,security,prompts,account-delete}.tsx` → `app/routes/_app/settings/{route,profile,security,prompts,account-delete}.tsx`
- **変更内容:**
  - `route.tsx`: `createFileRoute("/settings")` → `createFileRoute("/_app/settings")`。手書き Header（`SETTINGS_HEADER`/`SETTINGS_BACK_LINK`/`SETTINGS_TITLE`/`SETTINGS_SUBTITLE`/「← Home」Link）と `SETTINGS_WRAP`/`SETTINGS_GRID`/`<nav>` を全廃。`SettingsLayout` は `<Outlet />` をそのまま返すだけにする（外枠は共通シェルの `<main className={APP_MAIN}>` が提供）。`beforeLoad: requireAuthenticatedRoute` は `/_app` の認証ガードと二重化するため削除（`_app` loader が未認証時 `/` へ redirect する。後述リスク参照）。`head`（設定タイトル）・`errorComponent`（`SETTINGS_ERROR_*`）・form action の side-effect import（`ProfileForm/action` 他4本）は維持。
  - 各サブルート: `createFileRoute("/settings/xxx")` → `createFileRoute("/_app/settings/xxx")`。`internalRouteHead` の第3引数（canonical パス）は**公開 URL の `/settings/xxx` のまま維持**（`_app` は pathless なので公開 URL は不変）。それ以外は変更不要。
- **理由:** file-based routing で `_app` レイアウトの共通 chrome（Header + 外枠 + sticky）を継承させる。`_app` は pathname を持たない pathless layout なので**公開 URL `/settings/...` は不変**。

### 4. 設定サブナビのリンク参照を確認

- **対象ファイル:** `app/components/identity/SettingsSidebarNav.tsx`
- **変更内容:** `<Link to="/settings/profile">` 等は公開 URL 不変のため文字列は同一。ただし TanStack Router の型生成が `/_app/settings/profile` を解決するので、`to` の型整合を typecheck で確認する。`app/components/layout/UserMenu.tsx` の `router.navigate({ to: "/settings" })` も型整合を確認（公開 URL `/settings` は不変）。
- **理由:** サブナビは設定専用のまま維持（Issue 必須制約）。リンク切れ・型エラーを防ぐ。

### 5. `identity/styles.ts` の `SETTINGS_*` レイアウト定義を整理

- **対象ファイル:** `app/components/identity/styles.ts`
- **変更内容:**
  - 削除: `SETTINGS_WRAP`, `SETTINGS_HEADER`, `SETTINGS_BACK_LINK`, `SETTINGS_TITLE`, `SETTINGS_SUBTITLE`, `SETTINGS_GRID`（外枠・手書き Header は共通 chrome に寄せるため不要）。
  - 削除（共通トークンへ寄せる）: `SETTINGS_NAV`, `SETTINGS_NAV_ITEM` — `SettingsSidebarNav` が `layout/styles.ts` の `NAV_ITEM` / `SIDEBAR_SECTION` / `SIDEBAR_SECTION_TITLE` を再利用するため不要になる。
  - 残す: `SETTINGS_CONTENT`（本文の読みやすさ幅 `max-w-[720px]`、設定固有）、`SETTINGS_ERROR_*`（errorComponent 用、設定固有）、フォーム系（`SECTION` 以降すべて）。
  - 冒頭コメント「`/settings` is a top-level surface that does not inherit the app shell」を実態（`_app` 配下で共通シェルを継承する）に合わせて更新。
- **理由:** Issue の「`SETTINGS_*` 重複定義を整理し共通レイアウトトークンに寄せる（設定サブナビ固有のスタイルのみ残す）」要件。サブナビを共通サイドバートークンで描画することで重複を解消する。

### 6. 型・lint・整形・ブラウザ検証

- **対象:** プロジェクト全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`。`routeTree.gen.ts` は dev/build で自動再生成（手動編集しない）。`pnpm dev` で起動し testing.md に沿って確認。
- **理由:** ルート移動の型追随（`createFileRoute` ID 変更・`to` 型・テストの型参照）を検出し、見た目を実機確認する。

## 設計判断

- **共通 chrome 再利用 + 設定 sidebar 差し替えの実現方式（案A）:** `/settings` を `/_app/settings` にネストし、共通シェルの `<aside>` スロットを client 側 pathname で差し替える。`_app` loader（ライブラリ Sidebar RSC + `staleTime: Infinity`）を温存できる。差し替えは「sidebar が `ReactNode` の純粋スロット」かつ「設定サブナビが RSC データ不要」だから成立する。詳細・代替案との比較は `adr.md` 参照。
- **差し替えを `AppShellDrawer`（client）で行う + 設定ナビは prop 渡し:** pathname 判定にはクライアントフックが必要で、`AppShellFrame` はサーバ側に side-effect import を閉じ込めるサーバコンポーネント（ADR-002）。確実に client なのは `AppShellDrawer` なのでそこで判定する。設定ナビ要素は prop で受け取り、汎用シェルが identity を直接 import する結合を避ける。詳細は `adr.md` 参照。

## リスクと注意点

- **`routeTree.gen.ts` の再生成:** ルート移動後は dev/build で再生成。型 ID（`/settings/profile` → `/_app/settings/profile`）が変わるので、`createFileRoute` 文字列・`<Link to>`・`UserMenu` の `navigate`・テストの型参照に追随漏れがないか typecheck で確認。
- **公開 URL 不変の担保:** `_app` は pathless（route id `/_app`）なので `/_app/settings/profile` の実 URL は `/settings/profile` のまま。`internalRouteHead` の canonical パス・リンク・redirect がずれないこと。
- **`beforeLoad: requireAuthenticatedRoute` 削除の妥当性と挙動変化:** `requireAuthenticatedRoute` は未認証時 `/login` へ redirect する（`authGuard.ts:32`、確認済み）。一方 `_app` loader は未認証 + 非 landing path のとき `/`（landing）へ redirect する（`_app/route.tsx:58`、確認済み）。設定 route 側のガードを削除すると未認証時の遷移先が **`/login` → `/`（landing）に変わる**。ただし `_app` 配下の他ルート（notes/tags/trash/upload 等）はいずれも個別ガードを持たず `_app` loader の `/` redirect に統一されているため、削除は `_app` の規約に揃える**意図的な挙動統一**であり、Issue の「他画面と一貫させる」目的にも沿う。さらに個別 `beforeLoad` を残すと設定遷移ごとに追加の認証 RPC が走る（他 `_app` リーフにはない）ため、削除が `staleTime: Infinity` の追加 RPC ゼロ方針とも整合する。
- **モバイル サブナビ UX 変化:** 旧サブナビは「モバイルで横スクロール strip、lg で縦 rail」。新構成では共通 `<aside>`（モバイル=drawer、lg=縦カラム）の中の縦リストに変わる。Issue は「設定専用サブナビ維持」が要件でレイアウト形態の固定までは求めていないが、実機で見た目・active 表示・drawer 内表示を確認する。
- **bare `/settings`（index なし）:** UserMenu は `to: "/settings"` で遷移する。現状 index ルートがなく空 Outlet。移動後も共通 chrome + 設定サイドバー + 空 main になる（現状より悪化はしない）。index redirect 追加は #487 の領分なので本Issューでは行わない。
- **共通 Header のボタン表示:** 共通 Header には検索・新規作成・アップロードが出る。設定画面でも出るが、これは「他画面と同じ chrome＝断絶しない」という Issue 意図どおり。違和感がないか実機確認。
- **`SETTINGS_*` 削除の波及:** 削除対象トークンの import 元は現状 `route.tsx` のみ（grep 済み）。移動後の `route.tsx` から参照を除去すれば未使用 export 警告も解消する。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` で型・lint・整形を通す（ルート移動の型追随を検出）。
- 既存テスト `app/routes/_app/__tests__/` がルート移動で壊れないか確認。
- `pnpm dev` 起動後、`testing.md` に沿って手動 / manual-test スキルで確認:
  - `/settings/profile` 等で共通 Header（ロゴ・ユーザーメニュー）が表示され、左が設定専用サブナビ（ライブラリ/管理ナビが出ない）
  - `/`（ホーム）等の `/_app` 画面ではライブラリ Sidebar が従来どおり表示される（差し替えが設定限定）
  - 設定 ↔ ホーム往復で Header が消えず loader 追加 RPC が出ない（`staleTime: Infinity` 温存）
  - モバイル幅で drawer に設定サブナビが出る / active 表示 / route 変更で drawer が閉じる
  - コンテナ幅・padding（`pb-20`・`px-6`）・sticky オフセットが他画面と一致

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク の2視点並列）

**修正した点**:
- [P-001（アーキ視点）] `beforeLoad: requireAuthenticatedRoute` 削除で未認証リダイレクト先が `/login` → `/`(landing) に変わる副作用を明記。`authGuard.ts:32` / `_app/route.tsx:58` を確認し、`_app` 配下の規約統一・追加 RPC ゼロの観点から削除が妥当である旨をリスク欄に追記。

**取り込んだ改善提案**:
- [S-001（アーキ視点）] `SettingsSidebarNav` の active 判定方針（`activeProps` 素の前方一致、`activeOptions` 不要）をステップ1に明記。
- [S-002（要件視点）] bare `/settings` の扱いと #487 との境界をスコープ「含まれないもの」にも明記。

**見送った提案とその理由**:
- [S-001（要件視点）] 「期待する挙動」の1対1受け入れチェックリスト化 — testing.md の確認項目で同等にカバーするため plan 側の重複記載は見送り。
- [S-002（アーキ視点）] canonical 出力の確認メモ追記 — 公開 URL 不変で文字列リテラルをそのまま渡すだけのため、リスク欄の既存記載で十分と判断。

両視点とも要修正の設計上の破綻はなし（[P-001] は副作用の明記、設計自体は妥当）。ドキュメント追記で解消したため1周で終了。
