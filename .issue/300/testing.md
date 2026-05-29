# 動作確認計画 — Issue #300: AppShell 持続化のフォローアップ: セッション失効・エラー時の体感改善

**Issue:** #300
**作成日:** 2026-05-29

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev
```

`pnpm dev` は `vite dev --config vite.config.cloudflare.ts` を実行し、Cloudflare Workers の dev サーバーを立ち上げる（package.json `scripts.dev` で確認済）。

### 静的検証

```bash
pnpm typecheck
pnpm lint:fix
pnpm format
pnpm test
```

- `pnpm typecheck` (`tsgo`) — `useAuthGuardEffect` のシグネチャ、`getRouteApi("/_app").useLoaderData()` 型整合
- `pnpm lint:fix` (`biome check --write`) — コード規約
- `pnpm format` (`biome format --write`) — フォーマット
- `pnpm test` — `pnpm test:unit && pnpm test:integration`。`routerInvalidate.test.ts` / `useAuthGuardEffect.test.tsx` の新規テストが緑、既存テストに regression なし

### デプロイ方法

なし（検証環境のみで確認できる）。

---

## 確認項目

### 1. W-A-001: セッション失効時の stale AppShell 解消

- **目的:** セッション失効後の SPA 遷移で `_app` cached AppShell が再評価され、stale な前ユーザー情報が UI に表示されないこと
- **前提:** ローカル DB に 2 ユーザー以上、または cookie 削除でセッションを破壊できる環境
- **手順:**
  1. ユーザー A でログインし、`/notes` を開く
  2. Sidebar に Directory tree が表示され、Header に A の identials が出ていることを確認
  3. **以下のいずれかでセッション失効を再現**:
     - **手段 A（推奨）**: 同タブの DevTools → Application → Cookies → セッション cookie を削除
     - **手段 B**: 別タブで DB の `sessions` 行を直接削除（権限がある場合）
  4. 元タブで `/tags` などの別 leaf に SPA 遷移する（`<Link>` 経由）
  5. leaf 側 server fn が `user === null` を観測し `/` に redirect → ランディング着地
  6. **数百ミリ秒以内に** AppShell が剥がれ、`<LandingPage />` 単独が描画されることを確認
- **期待結果:**
  - 最終状態: AppShell が消え `<LandingPage />` のみ表示
  - Header / Sidebar に旧ユーザー A の identials / display name / directory tree が残らないこと
- **確認ポイント:**
  - Network タブで `loadAppShell` server fn が再実行されていること（hook が `appShellInvalidate` を発火した証拠）
  - 1 フレーム程度の stale 表示は許容（ADR-001 トレードオフ）

### 2. W-P-002: errorComponent 発火時の retry 動線

- **目的:** `_app.loader` 一過性失敗時に retry ボタンで `_app.loader` のみ再実行し、AppShell が復帰できること
- **手順:**
  1. ログイン状態で `/notes` を開く（AppShell が表示済）
  2. DevTools の Network タブで「Request blocking」を有効化し、`loadAppShell` server fn のリクエスト URL をブロック対象に追加
  3. `/tags` に SPA 遷移を試みる
  4. `_app.errorComponent` (`AppErrorFallback`) が描画されることを確認: エラーメッセージ + 「再読み込み」ボタンが表示される
  5. 「再読み込み」ボタンを押下 → ボタンが `disabled` 表示になることを確認（`useTransition` の `isPending`）
  6. retry 中もまだブロック中なので失敗 → errorComponent が再描画され、ボタンが再活性化することを確認
  7. **連続 2 回失敗** → 3 回目に Block ルールを解除した状態で retry → 成功して AppShell が復帰
- **期待結果:**
  - retry 押下中に重複クリックが防止される（`isPending` で `disabled`）
  - retry 失敗時に errorComponent が再描画され、ボタンが再活性化する
  - retry 成功で `_app.loader` のみが再実行され、leaf は再フェッチされない（Network タブで leaf 側 server fn が走らないこと）
- **確認ポイント:**
  - retry button の `disabled` 切替挙動
  - `useTransition` の `isPending` リセット動作
  - Header の検索値・Sidebar の展開状態は完全には復元されないことが期待（ADR-003 トレードオフ）

### 3. AppShell 同一性の regression 確認（Issue #293 主目的非 regression）

- **目的:** Issue #293 / Issue #299 で築いた「リーフ遷移時の AppShell 持続化」が本変更で破壊されていないこと
- **手順:**
  1. ログイン状態で `/notes` を開く
  2. Sidebar の DirectoryTree を 1 つ展開し、Header の検索入力に文字列を入れる（client state を作る）
  3. `/tags` → `/trash` → `/notes` と SPA 遷移を繰り返す
  4. 各遷移で Sidebar の展開状態・Header の検索入力値・scroll position が保持されることを確認
- **期待結果:**
  - SPA 遷移で AppShell が再マウントされない
  - Header / Sidebar の client state が保持される
- **確認ポイント:**
  - Network タブで `loadAppShell` server fn が再フェッチされない（初回 1 回のみ）
  - mutation 系（note 編集、tag 操作）後に `_app.loader` が再評価されないこと（Issue #299 効果の regression なし）

### 4. fresh 未認証訪問者で `loadAppShell` が 1 回のみ（hook 誤発火 regression 防止）

- **目的:** 改訂後の hook 発火条件（`shellUserDto !== null && leafAuthenticated === false`）が fresh 未認証訪問者で誤発火しないこと
- **手順:**
  1. シークレットウィンドウ（または cookie 全削除）で `/` を開く
  2. Network タブで `loadAppShell` server fn のリクエスト回数を確認
- **期待結果:**
  - `loadAppShell` が **1 回のみ** 呼ばれること
  - 2 回呼ばれた場合は hook が誤発火している → P-001 regression
- **確認ポイント:**
  - hook 内 `useEffect` のログ等で発火しないことを直接確認できればなお良い

---

## エッジケース・異常系

### 1. ログイン直後フローでの二重 invalidate 検証

- **目的:** `LoginForm` の rule 1 生 `router.invalidate()` と新 hook の二重発火がないこと
- **手順:**
  1. 未認証で `/` ランディングを開く
  2. `/login` に遷移しログイン成功 → `/` に戻る
  3. Network タブで `loadAppShell` の呼び出し回数を確認
- **期待結果:**
  - `loadAppShell` の呼び出し回数が増えていない（最大 2 回まで許容: ログイン前の 1 回 + ログイン後の rule 1 invalidate による 1 回）
  - `_app/index.tsx` HomeRoute の `useAuthGuardEffect` は `leafAuthenticated: true` を観測するため発火しないこと

### 2. errorComponent retry の連続失敗

- **目的:** retry を複数回失敗しても UI が壊れないこと（カバー: 確認項目 2 の手順 7 と同じ動線で別観点）
- **手順:**
  1. `loadAppShell` を Block した状態で retry を 3 回連続失敗させる
- **期待結果:**
  - 毎回 errorComponent が再描画され、ボタンが活性 → 押下 → pending → 失敗 → 再描画のサイクルが安定して回る
  - メモリリーク・無限ループなし
- **確認ポイント:**
  - Console エラーが retry 失敗以外で出ないこと

---

## 既存機能への影響確認

- **Issue #299 で導入された `routerInvalidate(router)` 経由 mutation（44 箇所）**: 本変更は `routerInvalidate.ts` への純粋追加（`appShellInvalidate` の export 追加）。既存 API シグネチャに変化なし → 影響なし。代表的なシナリオ:
  - note 編集（`NoteEditor`）→ `routerInvalidate` 経由で `_app` を除外して invalidate → AppShell 持続
  - bulk action（`BulkActionBar`, `BulkVisibilityDialog`）→ 同上
  - publish settings → 同上
- **rule 1/2/3 例外の生 `router.invalidate()` 13 箇所**: 認証フォーム / directory CRUD / displayName 更新 → 引き続き `_app` を含む全 match invalidate → 想定動作維持
- **leaf 側 defensive redirect**: `if (user === null) throw redirect({ to: "/" })` は ADR-009 に従い残置 → 動作変化なし

## 確認チェックリスト

- [ ] W-A-001 セッション失効シナリオ: stale AppShell が剥がれること
- [ ] W-P-002 errorComponent 発火 → retry 成功で AppShell 復帰
- [ ] W-P-002 retry 連続失敗 → 3 回目成功（`useTransition` リセット挙動）
- [ ] Issue #293 主目的非 regression: SPA 遷移で AppShell client state 保持
- [ ] Issue #299 非 regression: mutation 後の AppShell 持続
- [ ] fresh 未認証訪問者で `loadAppShell` が 1 回のみ
- [ ] ログイン直後フローで二重 invalidate なし
- [ ] `pnpm typecheck` / `pnpm lint:fix` / `pnpm format` / `pnpm test` がすべて緑
