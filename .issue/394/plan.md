# 実装計画 — Issue #394: 保存ビューの「適用」導線が未実装 / 一覧UIがMVP最小のまま

**Issue:** #394
**作成日:** 2026-06-01
**複雑度:** 中〜大規模

---

## 目的

保存ビュー（`/views`）に「適用（ビューでノート一覧を開く）」導線を追加し、選択したビューの絞り込み条件でノート一覧へ遷移・反映できるようにする。あわせて MVP 最小のスタイル未適用 UI を、デザイントークン／Tailwind ユーティリティに沿った見た目に整え、`brokenConditions`（壊れた条件）の取り扱いを明確化する。

## スコープ

### 含まれるもの

- 各保存ビュー行に「適用」導線を追加（クリックでそのビューの条件でノート一覧へ遷移）。
- `/views` ページ・一覧 UI を `spec/design/pages/P20-views.html` のデザイントークン／Tailwind ユーティリティに沿って整形。
- `brokenConditions` を持つビューの警告表示（適用は許可）。
- 既存の名前変更 / 既定設定 / 削除アクションは機能を維持しつつスタイルを整える。

### 含まれないもの

- ビューの「編集」「複製」「修復」アクション（対応する usecase / server function が存在しないため。P20 カンプには描かれているがスコープ外）。
- 「新しいビュー」作成導線（ビュー作成は既存の `SaveViewDialog`（ノート一覧側）が担う。`/views` への作成ボタン追加はスコープ外）。
- `kind` prop ベースのタブ切替（ページは個人/共有を両方表示済み。タブ作り込みはスコープ外）。
- ViewQuery → URL 変換の新規実装（既存のホーム loader が担うため不要）。

## 調査結果（裏取り済み）

- **適用メカニズムは既に実装済み。** `app/routes/_app/index.tsx` の `renderHome`（L73-103）が `search.viewId` を検出すると `loadSavedViewById` + `loadAllTags` でビューを解決し、`viewQueryToSearch(view, resolveTagNames)`（`app/components/note/list/listSelectors.ts` L224-262）で ViewQuery を URL search params へ展開、`{...restored, ...search}` で一覧へ反映する。`shouldRedirectForSavedView` が `display` を `view.displayMode` で正規化リダイレクトする。
- **参照実装。** `app/components/note/list/NoteListToolbar.tsx` L54-59 の `onSelectView` が `router.navigate({ to: "/", search: () => ({ viewId }) })` で同じ適用を行っている。つまり `/views` 側は `<Link to="/" search={{ viewId }}>` を張るだけでよい。
- **URL スキーマ。** `app/components/note/schema.ts` の `noteListSearchSchema` は全フィールド `optional().catch(undefined)` なので `{ viewId }` だけ渡しても `validateSearch` を通り型も通る（`page`/`limit` は出力上 optional）。
- **tag 名解決はホーム loader が担う。** SavedView スナップショットは tagId のみ保持。`viewQueryToSearch` は `resolveTagNames` 未注入だと `tagNames` を落とす。`/views` 側で独自変換すると tag 絞り込みが壊れるため、**必ず `viewId` のみを渡してホーム loader 経由で解決させる**。
- **brokenConditions の意味。** ViewQuery が参照する tag/directory/note が削除されたことを示すマーカー。削除済み id で絞り込むと結果が 0 件になるだけで例外は出ない。P20 カンプの broken-banner は「このビューを開いても結果は空になります」と明記し、適用ボタンは壊れた行にも存在する。
- **デザイントークン確認済み。** `text-warning` / `bg-warning-surface` / `text-accent` / `bg-accent-surface` / `text-accent-ink` / `text-status-public` / `bg-success-surface` / `rounded-pill` / `rounded-sm` / `rounded-md` は `app/styles/index.css` の `@theme inline` に実在。

## 実装ステップ

### 1. 行スタイル定数のホイスト先を用意する

- **対象ファイル:** `app/components/view/SavedViewsList/styles.ts`（新規）
- **変更内容:** P20 カンプ準拠の繰り返しユーティリティ文字列を module-scoped 定数として定義する（例: `viewList`, `viewRow`, `viewIconWrap`, `viewMain`, `viewHead`, `viewName`, `defaultMark`, `publicMark`, `viewChips`, `chipBroken`, `rowActions`, `textAction`, `textActionApply`, `textActionDanger`, `brokenBanner`）。`chip` は `common/styles.ts` の既存定数を再利用。
- **理由:** CLAUDE.md のスタイル文字列ホイスト規約。JSX を簡潔に保つ。

### 2. `SavedViewRow` に「適用」リンクを追加し行を整形する

- **対象ファイル:** `app/components/view/SavedViewsList/index.tsx`
- **変更内容:**
  - `@tanstack/react-router` の `Link` を import。非編集表示の `row-actions` 先頭に `<Link to="/" search={{ viewId: view.id as unknown as string }} className={...}>適用</Link>` を追加。`display` はあえて URL に載せない（ホーム loader が「viewId あり + display なし」を検出して `view.displayMode` で正規化リダイレクトするため。Issue #219 ADR-002）。参照実装は `NoteListToolbar.onSelectView`。
  - 行を P20 カンプの `view-row` グリッド（`view-icon-wrap` / `view-main` / `row-actions`）へ。`displayMode` に応じた lucide アイコン（`list`→`List`, `tile`→`LayoutGrid`, `calendar`→`Calendar`）を icon-wrap に表示。`view-head` に name・`default-mark`（既定）・`public-mark`（kind=public）。`view-chips` で表示モード等の要約チップ。
  - `brokenConditions.length > 0` のとき `broken-banner`（`role="alert"`、warning トークン、`AlertTriangle` アイコン）を `view-main` 配下に表示。**既存の壊れた条件表示（`index.tsx` L143-147 の `<span role="alert">壊れた条件: N 件</span>`）はこのバナーに置き換える（重複表示させない）。** 適用リンクは無効化しない。
  - 既存の rename インライン編集 / setDefault / delete ボタンと `ConfirmDialog` は機能維持。`text-action` / `text-action destructive` スタイルへ。
- **理由:** Issue の「適用導線追加」「broken 取り扱い明確化」「styling」を満たす中心。

### 3. `SavedViewsList` の空状態・リストコンテナを整形する

- **対象ファイル:** `app/components/view/SavedViewsList/index.tsx`
- **変更内容:** 空状態文言を `text-ink-secondary` 等で整え、`<ul>` を `view-list`（上border + 行間border）コンテナへ。
- **理由:** MVP 最小からの脱却。

### 4. `Page.tsx` をページヘッダ + セクション構成に整形する

- **対象ファイル:** `app/components/view/SavedViewsList/Page.tsx`
- **変更内容:** P20 カンプの `main` / `page-header`（タイトル + サブタイトル）/ `section-block`（個人ビュー・共有ビュー、`section-head` に説明 + 件数）に沿って Tailwind ユーティリティで整形。個人/共有の両表示は維持。
- **理由:** Issue の「一覧 UI を整える」を満たす。

### 5. 型チェック・lint・format

- **対象:** プロジェクト全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format`。
- **理由:** CLAUDE.md の after-changes 規約。

## 設計判断

詳細は `adr.md` を参照。

- **適用 = クライアント `Link` 遷移**（server function 不要）。`<Link to="/" search={{ viewId }}>` で既存ホーム loader に委ねる。
- **broken view も適用可・警告併記。** 適用リンクは無効化せず `role="alert"` 警告バナーを併記。
- **「編集/複製/修復」は実装しない**（裏付けとなる usecase が無く、Issue 要件外）。

## リスクと注意点

- フロント側で ViewQuery → URL を独自変換すると tagId→tagName 解決が抜けて絞り込みが壊れる。**必ず `viewId` のみ渡す。**
- `view.id` は branded 型（`SavedViewId`）。`Link` の `search` には既存 `NoteListToolbar` / `listSelectors` と同じく `id as unknown as string` で渡す。
- styling では `tokens.css` / `index.css` に実在するトークンのみ使用。新規トークンは作らない。
- `Page.tsx` は個人/共有を両方表示しているため、`kind` prop ベースのタブ切替を新規実装しない（既存挙動維持、スコープ膨張を避ける）。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。
- 既存ユニットテスト（`listSelectors.test.ts` の `viewQueryToSearch` / `shouldRedirectForSavedView`）が緑のまま（本実装は変更しない）。
- 手動: `/views` で各行に「適用」が表示され、クリックで `/?viewId=...` へ遷移し一覧がそのビューの条件で絞り込まれる。tag を含むビューでも絞り込みが効く。broken ビューで警告バナーが出て適用可。rename/既定/削除が従来どおり動作。レスポンシブで row-actions が折り返す。

## レビュー履歴

### 1周目: 両視点でレビュー → 終了

- **視点1（要件カバレッジ）: 問題点ゼロ。** ①適用導線 ②スタイル整備 ③broken 取り扱いをすべてカバー、スコープ外（編集/複製/修復/タブ）は明示除外と評価。
- **視点2（アーキ・リスク）: 4点指摘。** 対応:
  - **[P-003] 採用** — 既存の壊れた条件表示（`index.tsx` L143-147）と新 broken-banner の重複を防ぐため、「既存表示をバナーに置き換える」旨を Step 2 に明記した。
  - **[P-004] 却下（事実誤認）** — `--color-warning` / `--color-warning-surface` / `--color-status-public` / `--color-success-surface` / `--color-accent-surface` / `--color-accent-ink` はいずれも `app/styles/index.css` の `@theme inline`（L24-36）に登録済みで、対応する Tailwind ユーティリティは生成される（実ファイル確認済み）。指摘の grep が不完全だった。
  - **[P-002] 採用** — `display` を URL に載せない理由を Step 2 に明記した。
  - **[P-001] 軽微** — plan は型キャスト付き、adr は散文。実装はキャスト付きで統一するため対応不要。
  - **[S-001] 採用** — displayMode アイコンを `List`/`LayoutGrid`/`Calendar` と具体化（`DisplayModeSwitch` はラベル表示でアイコン未使用のため lucide から選定）。

両視点の実質的な指摘（P-003）を反映し、残りは却下/軽微/反映済みのため 1 周で収束。
