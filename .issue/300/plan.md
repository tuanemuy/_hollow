# 実装計画 — Issue #300: AppShell 持続化のフォローアップ: セッション失効・エラー時の体感改善

**Issue:** #300
**作成日:** 2026-05-29
**複雑度:** 中〜大規模

---

## 目的

PR #297 (Issue #293) で `_app` pathless layout に束ねた AppShell の持続化（`staleTime: Infinity`）について、レビュー `.issue/293/review/review-001.md` で指摘された 3 つのフォローアップ課題のうち、**実装で解消すべき 2 件**（セッション失効時の stale AppShell / errorComponent 発火時の shell 吹き飛び）を解消する。残る 1 件（Sidebar RSC payload 肥大化）は Issue #299 のラッパー整備で短期目標が達成済のため、本 Issue では「短期効果の確認 + 長期案のスコープ外宣言」のみ行う。

### DoD（完了判定）

- review-001 W-A-001 が解消される: セッション失効後の SPA 遷移で `_app` cached AppShell が再評価され、stale な前ユーザー識別情報が UI に表示されないこと
- review-001 W-P-002 が解消される: `_app.errorComponent` 発火時に retry ボタンで `_app.loader` のみを再実行できること
- review-001 W-P-003 は短期効果の regression なし: Issue #299 で築いた「mutation 後の AppShell 持続化」が破壊されていないこと
- Issue #293 の主目的（初回 `_app` 進入時 1 RPC、以降 SPA 遷移で 0 RPC）が regression していないこと — 特に fresh 未認証訪問者で `loadAppShell` が 2 回呼ばれないこと

## スコープ

### 含まれるもの

- **W-A-001 解消**: leaf 側で `user === null` を観測したタイミングで `_app` のみを invalidate するクライアント側フック (`useAuthGuardEffect`) を新設し、`_app/index.tsx` の `HomeRoute` で発火させる
- **W-P-002 解消**: `_app.errorComponent` を「retry 動線つきのエラー表示」に変更し、retry ボタン押下で `_app.loader` のみを再実行できるようにする
- `app/components/common/routerInvalidate.ts` に対称ヘルパー `appShellInvalidate(router)` を追加（`_app` のみを invalidate）
- 上記ヘルパー・フックの単体テスト
- ADR への設計判断記録（hook vs middleware、retry-only vs shell-keep、課題 3 のスコープ外宣言）

### 含まれないもの

- **W-P-003 長期案**: Sidebar の「shell の枠だけ RSC 固定 + tree は client lazy fetch」リファクタリング。`_app.loader` invalidate 頻度は Issue #299 で十分に下がっており、payload サイズの実測なしに踏み込むのは早計
- leaf 側 defensive redirect (`if (user === null) throw redirect(...)`) の構造変更 — ADR-009 の判断は維持
- 認証フォーム 7 箇所の生 `router.invalidate()`（rule 1）の置換 — Issue #299 で確定済の構造
- `_app.errorComponent` の「shell 残し / main だけエラー」構造への変更 — `Route.useLoaderData()` が errorComponent から呼べない TanStack Router の制約により実装コストに見合わない

## 調査結果

### 関連ファイル

- `app/routes/_app/route.tsx` — `_app` layout の loader / component / errorComponent。本 Issue の中心。`staleTime: Infinity`、`loadAppShell` server fn、`errorComponent: ({ error }) => <div role="alert">...</div>` で AppShellFrame ごと差し替え
- `app/routes/_app/index.tsx` — `/` の leaf。`renderHome` server fn が `authenticated: false` を返した場合 `<LandingPage />` を描画。本 Issue で hook 発火点を追加
- `app/components/layout/AppShellFrame.tsx` — `header / sidebar / children` を受ける枠。変更なし
- `app/components/layout/Sidebar.tsx` — `loadDirectoryTree(user.id)` を解決した async server component。RSC payload のサイズ要因（課題 3）
- `app/components/common/routerInvalidate.ts` — Issue #299 で導入済の `_app` 除外ラッパー。本 Issue で対称ヘルパー `appShellInvalidate` を同居追加
- `app/routes/_app/{notes,tags,trash,upload}/...` — 8 leaf すべてが defensive redirect (`if (user === null) throw redirect`) を持つ（ADR-009 で意図的）

### あるべきアーキテクチャ

- `CLAUDE.md`: Tailwind utilities をそのまま `className` に、state は `data-*` で表現、`app/lib/` はクロスレイヤー構造プリミティブ専用。フロント固有 helper は `app/components/common/` に置く（Issue #299 ADR-001 と同じ）
- `.issue/293/adr.md` ADR-008 / ADR-009: `_app.loader` は `staleTime: Infinity` で初回 1 RPC。leaf は `getCurrentUser` + 1 行 defensive redirect を意図的に残す（fail-closed の唯一の保証）
- `.issue/293/adr.md` ADR-010 + `.issue/299/adr.md`: `_app` を invalidate する正当な mutation は 3 rule のみ（rule 1: 認証状態遷移 / rule 2: directory tree / rule 3: displayName）。本 Issue の W-A-001 解消で追加される invalidate は **rule 1 の一種**（leaf が user === null を観測した時点で AppShell を再評価させる）
- `.issue/299/adr.md` ADR-002: `match.routeId !== "/_app"` の厳密一致と定数 `APP_SHELL_ROUTE_ID` を使う。本 Issue の追加ヘルパーも同じ規約

### 既存実装の状態

- **W-A-001（課題 1）**: 乖離あり。leaf が `getCurrentUser` で null を観測しても `throw redirect({ to: "/" })` だけで `_app` cached match は invalidate されない。`_app.loader` の cached `userDto` が残り、ランディング → 別 leaf 遷移で AppShell が前ユーザーで一瞬見える。**本 Issue で解消**
- **W-P-002（課題 2）**: 乖離あり。`_app.errorComponent` は `<div role="alert">` で `AppShellFrame` 含む `_app` ツリー全体を置換。Header の検索値・Sidebar の展開状態・スクロール位置が消える。**本 Issue で解消**
- **W-P-003（課題 3）**: Issue #299 CLOSED により mutation 後 invalidate 頻度は大幅に下がった（44 箇所が `routerInvalidate(router)` 経由化）。残る `_app` invalidate は ADR-003 の 13 箇所（auth 7 + directory 5 + displayName 1）。これらは AppShell の依存データ自体が変わるので payload 再送は必要。**長期案（Sidebar client lazy fetch）は本 Issue ではスコープ外** として ADR で明文化

### 依存関係

- `_app` invalidate を増やすと、Issue #293/#299 で築いた持続化メリットが減る → 増やすのは必要最小限（leaf が user null を観測した時点だけ）
- 認証フォーム 7 箇所（`LoginForm` 等）は既に rule 1 で生 `router.invalidate()` を呼ぶ。新フックを認証フォームに追加する必要はない（ログイン直後は `_app` 外なので leaf 側 hook は発火しない）
- ADR-009 の leaf defensive redirect は残す。新 hook は redirect と並行して invalidate を発火するだけ

## 実装ステップ

### 1. 対称ヘルパー `appShellInvalidate(router)` を追加

- **対象ファイル:** `app/components/common/routerInvalidate.ts`
- **変更内容:** 同ファイル末尾に「`_app` のみを invalidate する」逆向きヘルパーを追加。`router.invalidate({ filter: (match) => match.routeId === APP_SHELL_ROUTE_ID })`。既存の `APP_SHELL_ROUTE_ID` 定数を共有する。JSDoc に「セッション失効・errorComponent retry など `_app.loader` のキャッシュを破棄して再評価したい場面で使う。AppShell の依存データ自体が変わる mutation（rule 1/2/3）には生 `router.invalidate()` を使う」と明記
- **理由:** 生 `router.invalidate({ filter: m => m.routeId === "/_app" })` を hook と errorComponent の 2 箇所に書くより、対称ヘルパーとして export し意味を固定する方が将来の routeId リネームに強い

### 2. クライアント側フック `useAuthGuardEffect` を新設

- **対象ファイル:** `app/components/common/useAuthGuardEffect.ts`（新規）
- **変更内容:**
  - シグネチャ: `useAuthGuardEffect(input: { leafAuthenticated: boolean; shellUserDto: UserDTO | null }): void`
  - `useEffect` で「`shellUserDto !== null && leafAuthenticated === false`」の **不整合** を観測した瞬間に `appShellInvalidate(router)` を fire-and-forget で呼ぶ
  - `useRouter()` で router 取得
  - JSDoc に「**authenticated/unauthenticated 両 branch を持つ leaf に必ず配置すること**。leaf 側 server fn で `user === null` だった時、defensive redirect とは独立に `_app` の cached AppShell を破棄して再評価させる。`_app.loader` の `staleTime: Infinity` により redirect 先（同一 `_app` 配下）でも cached match が再利用されてしまう問題への対処。発火条件は『shell キャッシュに user あり × leaf 観測が未認証』の不整合時のみ。fresh 未認証訪問者（両方 null）では発火しない。発火点は authenticated/unauthenticated の両 branch を持つ leaf（現状は `_app/index.tsx`）に限定すること。**対象 leaf を追加した場合はこの JSDoc にも追記すること**」と明記
- **理由:**
  - server fn から `router.invalidate()` は呼べない（Issue 本文の制約）。client 側で「leaf が user === null を観測した瞬間」を捕捉する hook が最も自然
  - **「観測が unauthenticated だから発火」だと不適切**: fresh 未認証訪問者（cached も null、observed も false）でも毎回発火し、`_app.loader` を 2 回呼ぶ regression が入る。Issue #293 の「初回 1 RPC、以降 0 RPC」の半分が壊れる
  - **「shell キャッシュに user あり × leaf 観測が未認証」の不整合検出に絞る**: stale な authenticated AppShell が観測されている前提を条件に組み込むことで、fresh 未認証訪問では no-op、セッション失効シナリオでのみ発火、と意味的に正しい挙動になる

### 3. `_app/index.tsx` の `HomeRoute` で hook を発火

- **対象ファイル:** `app/routes/_app/index.tsx`
- **変更内容:**
  - `HomeRoute` 内で `getRouteApi("/_app").useLoaderData().userDto` 経由で兄弟 layout (`_app`) の cached `userDto` を読み出し、hook に渡す
  - `useAuthGuardEffect({ leafAuthenticated: data.authenticated, shellUserDto })` を呼ぶ
- **理由:** `_app/index.tsx` は `renderHome` が `authenticated: false` を返したときに `<LandingPage />` を描画する唯一の leaf。他の leaf は user === null で `throw redirect({ to: "/" })` され `_app/index.tsx` に着地するため、ここ 1 箇所で全 leaf 経由の fallout を捕捉できる。複数 leaf に hook を撒くと rule 1 invalidate が二重発火するリスクがある。`getRouteApi("/_app")` は同プロジェクト内で既に複数の leaf component（`DisplayModeSwitch`, `NoteListViews` 等）で利用されている確立されたパターン

### 4. `_app.errorComponent` を「retry 動線つきのエラー表示」に変更

- **対象ファイル:** `app/routes/_app/route.tsx`
- **変更内容:**
  - `errorComponent` を別関数 `AppErrorFallback({ error })` に切り出す
  - 内部で `useRouter()` を取得し、「再読み込み」ボタンを描画
  - `useTransition` の `[isPending, startTransition]` を取得し、ボタン押下時に `startTransition(async () => { await appShellInvalidate(router); })` を呼ぶ
  - `isPending === true` の間はボタンを `disabled` 表示。retry が失敗（`_app.loader` が再 throw）した場合は同じ errorComponent が再描画され、ボタンが再活性化する
  - 既存の `sanitizeRouteError(error)` 表示は維持（情報露出防止）
  - エラー表示自体は `<div role="alert" className="p-6">` の Tailwind utility ベース。Button は既存パターン（`app/components/common/` の Button があれば再利用、なければ素の `<button>` + 既存 className 定数）
- **理由:**
  - Issue 本文の「shell 残し」案は errorComponent から `Route.useLoaderData()` が呼べない TanStack Router の制約により実装コストが高すぎる（`useRouter()` は使えるが `useLoaderData()` は不可。これは `<Match>` ツリー内で render される errorComponent が loader 結果に依存できないため）
  - 「retry 動線」案は実装が局所的で、retry 成功時に `_app.loader` の再評価のみで通常レンダリングに戻れるため Issue の意図を満たす
  - **`appShellInvalidate(router)` を選ぶ理由（生 `router.invalidate()` ではなく）**: `_app.loader` が throw した時点で leaf までは未到達のため leaf 側 loader は実害なく走らないが、retry 時に `_app` のみを狙うことで意図を明示し、API の意味的対称性を保つ。将来 `_app.errorComponent` 内で leaf 状態を保持する設計に変更しても hook 側を変えずに済む

### 5. テスト追加

- **対象ファイル:**
  - `app/components/common/__tests__/routerInvalidate.test.ts`（新規。Issue #299 でも単体テストは追加されていないため、本 Issue で `routerInvalidate` と `appShellInvalidate` の両方を一括で覆う）
  - `app/components/common/__tests__/useAuthGuardEffect.test.tsx`（新規）
- **変更内容:**
  - `routerInvalidate(router)`: mock router の `invalidate` が「`_app` を除外する filter」を渡すこと
  - `routerInvalidate(router, additionalFilter)`: 追加 filter と `_app` 除外が AND 合成されること
  - `appShellInvalidate(router)`: mock router の `invalidate` が「`_app` のみを通す filter」を渡すこと。`{ routeId: "/_app" }` は通し、`{ routeId: "/_app/notes" }` のような prefix 一致 leaf は **通さない** こと（厳密一致の保護網）
  - `useAuthGuardEffect`: 以下の発火条件マトリクスを確認:
    - `{ shellUserDto: null, leafAuthenticated: false }` → 発火しない（fresh 未認証訪問者）
    - `{ shellUserDto: { id, ... }, leafAuthenticated: false }` → 発火する（W-A-001 セッション失効）
    - `{ shellUserDto: { id, ... }, leafAuthenticated: true }` → 発火しない（通常 authenticated）
    - `{ shellUserDto: null, leafAuthenticated: true }` → 発火しない（理論上ありえないが safety）
  - 依存配列: 同一値で再レンダリングされても空打ちしないこと（`shellUserDto.id` を依存に含める）
- **理由:** Issue #299 の routerInvalidate と同じ粒度の単体テストで API 契約を固定する。特に「fresh 未認証訪問で発火しない」ケースは regression を防ぐ要

### 6. ADR への設計判断記録

- **対象ファイル:** `.issue/300/adr.md`（新規）
- **変更内容:** 以下の ADR を記録:
  - ADR-001: 課題 1 の実装位置を hook 方式に決めた経緯（middleware / server fn 内 invalidate を不採用とした理由）
  - ADR-002: hook の発火点を `_app/index.tsx` の `HomeRoute` 1 箇所に限定する判断（多 leaf 配布で二重発火を避ける）
  - ADR-003: 課題 2 を「retry 動線のみ」で解消する判断（shell 残し案を不採用とした理由）
  - ADR-004: 課題 3 の長期案（Sidebar client lazy fetch）を本 Issue のスコープ外とする宣言（Issue #299 で短期目標達成 + 実測なしの踏み込み回避）
  - ADR-005: 対称ヘルパー `appShellInvalidate` を `routerInvalidate.ts` に同居させる判断（定数共有 + API 表面の意味的対称性）

## 設計判断

詳細は `.issue/300/adr.md` 参照。要点:

- **課題 1 の実装方式: hook 方式**
  - server fn から `router.invalidate()` は呼べない
  - middleware は SSR/SPA 両方で走り `loader` 内の server fn 再実行と意味が重複
  - hook なら `_app/index.tsx` 1 箇所に局所化でき、leaf を増やしても波及しない

- **課題 1 の発火点: `_app/index.tsx` の `HomeRoute` のみ**
  - 他 leaf は `user === null` で redirect され `_app/index.tsx` に着地する
  - 1 箇所配置で全 leaf 経由 fallout を捕捉できる
  - 多 leaf 配布は rule 1 invalidate の二重発火リスク

- **課題 2 の解消: retry 動線のみ**
  - 「shell 残し」案は `Route.useLoaderData()` が errorComponent で呼べない制約で実装コスト過大
  - retry 動線案は実装局所、復帰可能、Issue 本文も簡易案として推奨

- **課題 3 のスコープ: 本 Issue では長期案を扱わない**
  - Issue #299 で短期目標達成済
  - 長期案は影響範囲広 + payload サイズの実測なし

- **対称ヘルパー `appShellInvalidate` を同ファイル同居**
  - `APP_SHELL_ROUTE_ID` 定数共有
  - API 表面の意味的対称性（`routerInvalidate` = `_app` 除外、`appShellInvalidate` = `_app` 専用）

## リスクと注意点

- **二重 invalidate**: ログイン直後フロー（未認証 `/` → `/login` → `/` 復帰）で、`LoginForm` の rule 1 生 `router.invalidate()` と新 hook が両方発火する可能性
  - 想定: `LoginForm` の `await router.invalidate(); await router.navigate({ to: "/" })` の順序で navigate 完了時点で AppShell は最新。`/` 着地時の `useAuthGuardEffect` は `authenticated: true` を見て発火しないはず
  - 実機で要確認

- **`router.invalidate` Promise の扱い分け**:
  - **hook 内（useEffect, ステップ 2/3）**: `void appShellInvalidate(router)` で fire-and-forget。`useEffect` 内では await できないため自然な選択
  - **errorComponent retry button（ステップ 4）**: `startTransition(async () => { await appShellInvalidate(router); })` で **Promise を await する**。プロジェクト既存パターン（`startTransition(async () => await ...)`）に揃え、`isPending` で `disabled` 表示と連動させる

- **hook の依存配列**: `[shellUserDto?.id ?? null, leafAuthenticated]`。`shellUserDto` が `null` のときに `.id` 評価で TypeError にならないよう optional chaining + nullish coalescing で組む。同一値で再レンダリングされても発火しない React の標準挙動に任せる

- **errorComponent retry ボタン**: 生 `router.invalidate()` ではなく `appShellInvalidate(router)` を使う。生 invalidate だと leaf も再評価され、retry 時に leaf 側 server fn まで二重実行されてしまう

- **leaf 側 defensive redirect は残す**: ADR-009 の判断を変更しない。新 hook は redirect と並行して invalidate を発火する補強

- **`_app/index.tsx` の hook 配置位置**: `HomeRoute` は client component。`useAuthGuardEffect` を **`if (!data.authenticated) return <LandingPage />` の前** で呼ぶ（React rules of hooks に従い条件付きフック呼び出しを避ける）。`data.authenticated` の値は loader の戻り値から取り、`data.authenticated === false` のときランディング描画と並行して hook が invalidate を発火する

- **設計の前提依存性（重要）**: 本 hook の不整合検出は次の 2 条件に依存する:
  1. **`_app.loader` の `staleTime: Infinity`**: `_app` 親 loader は SPA 遷移で再評価されない → セッション失効後も親の cached `userDto` は authenticated 時の値のまま残る。`getRouteApi("/_app").useLoaderData()` で読む `userDto` がまさにこの cached value
  2. **`_app/index.tsx` の `staleTime: 0`**: leaf loader はランディング着地時に再評価される → fresh `getCurrentUser() === null` を観測して `{ authenticated: false }` を返す

  この 2 つの組み合わせが「shell cached あり × leaf 観測 unauthenticated」の不整合を構造的に保証する。将来 `_app` または `_app/index.tsx` の `staleTime` を変更する場合、本 hook の検出挙動が変わるため ADR-001 を参照すること

## テスト方針

実機（manual-test）で確認すべき観点:

1. **W-A-001 セッション失効シナリオ**
   - 現状の UI に「ログアウトボタン」は存在しないため、以下のいずれかでセッション失効を再現する:
     - **手段 A**: ユーザー A でログイン → 別タブで `/settings/security` を開き「他のすべてのセッションをログアウト」を実行（自セッション以外を無効化するため自身は残る → この手段は使えない場合あり）
     - **手段 B（推奨）**: ユーザー A でログイン → DevTools の Application タブで session cookie を削除 → 元タブで SPA 遷移を試みる
     - **手段 C**: DB の sessions 行を直接削除（適切な権限がある場合）
   - ユーザー A でログイン → `/notes/$noteId` を開く → 上記手段でセッション失効を再現 → 元タブで `/notes` 等他 leaf に遷移 → leaf が `/` に redirect → ランディング着地後 1 フレーム以内に `_app` が再評価されて未認証 AppShell（LandingPage 単独）に切り替わることを確認
   - Sidebar / Header に旧ユーザー A の情報が残らないこと

2. **W-P-002 errorComponent 発火 + retry シナリオ**
   - Chrome DevTools で `loadAppShell` server fn を意図的に 500 にする → SPA 遷移を発生させる → errorComponent が表示されることを確認
   - retry ボタン押下で `_app.loader` のみ再実行され、leaf は再フェッチされないことを Network タブで確認
   - retry 成功で通常の AppShell が復帰すること
   - **retry 2 回連続失敗 → 3 回目に成功** のシナリオ: 失敗のたびに同じ errorComponent が再描画され `useTransition` の `isPending` がリセットされ、ボタンが再活性化することを確認

3. **W-P-003 Sidebar payload 短期効果（regression）**
   - directory CRUD 以外の mutation（note 編集、tag 操作、publish settings 等）後に `_app.loader` が再評価されないこと（Network タブで `loadAppShell` の RPC が走らない）

4. **AppShell 同一性の regression**
   - Header の検索入力値、Sidebar の DirectoryTree 展開状態、scroll position が SPA 遷移で保持されること（Issue #293 の主目的）
   - ログイン / ログアウトの rule 1 動作（既存挙動の regression なし）

5. **二重 invalidate の検証**
   - 未認証 `/` → `/login` → ログイン → `/` 復帰で `loadAppShell` RPC が複数回走らないこと
   - **fresh 未認証訪問者で `loadAppShell` RPC が 1 回のみ**（hook が誤発火しないことの確認）

## レビュー履歴

### 3周目

両視点とも問題点ゼロで終了。軽微な改善提案を 2 件取り込み:

- **[S-001 → 取込]** manual-test 2 に「retry を 2 回連続失敗 → 3 回目に成功」シナリオを追加（`useTransition` の `isPending` リセット挙動確証）
- **[S-002 → 取込]** ステップ 2 の `useAuthGuardEffect` JSDoc に「対象 leaf 追加時はこの JSDoc を更新すること」のサインを記載

### 2周目

**修正した点**:

- **[P-001 req → 対応]** 「リスクと注意点」の `[observedAuthenticated]` 古名残記述を `[shellUserDto?.id ?? null, leafAuthenticated]` に修正し、ステップ 5 のテスト記述と整合
- **[P-001 arch → 対応]** ステップ 4 の retry button を `startTransition(async () => { await appShellInvalidate(router); })` パターン明示に変更。fire-and-forget は hook 内限定であることを「リスクと注意点」で切り分け
- **[P-002 arch → 対応]** テスト依存配列を `[shellUserDto?.id ?? null, leafAuthenticated]` に修正（`shellUserDto === null` の TypeError 回避）
- **[P-003 arch → 対応]** 「リスクと注意点」末尾に「設計の前提依存性」セクションを追加。`_app.staleTime: Infinity` と `_app/index.tsx` の `staleTime: 0` の組み合わせが本 hook の不整合検出を構造的に保証することを明文化

**取り込んだ改善提案**:

- **[S-002 arch → 取込]** retry 失敗時の挙動（同 errorComponent 再描画、ボタン再活性化）をステップ 4 に明記
- **[S-004 arch → 取込]** マニュアルテスト 1 の手順を「ログアウトボタンが UI に存在しない」事実に合わせ、DevTools cookie 削除 / DB sessions 行削除 / SecurityForm の手段を選択肢として明示
- **[S-002 req → 取込]** ステップ 3 の hook 呼び出し位置「`if (!data.authenticated) return <LandingPage />` の前」を「リスクと注意点」に明記
- **[S-003 req → 取込]** ADR-005 Consequences に「既存 `routerInvalidate` 利用箇所 44 箇所への regression なし」の根拠を追加（次の adr.md 編集で反映）

**見送った提案とその理由**:

- **[S-001 req → 見送り]** SSR / hydration 時の発火タイミング詳述は ADR-001 の「1 フレーム stale」記載でカバー済と判断
- **[S-001 arch → 取込]** `appShellInvalidate` の filter が `_app` 厳密一致（prefix で `_app/notes` を通さない）テストケースを追加（ステップ 5 反映）
- **[S-003 arch → 取込済]** `staleTime` 前提への依存性は P-003 対応で明文化済

### 1周目

**修正した点（要件カバレッジ / アーキテクチャ両視点）**:

- **[P-001 → 対応]** `useAuthGuardEffect` のシグネチャを `(observedAuthenticated: boolean)` から `({ leafAuthenticated, shellUserDto })` に変更。発火条件を「観測 unauthenticated」から「shell cached あり × leaf 観測 unauthenticated の不整合」に絞る。fresh 未認証訪問者で `loadAppShell` が 2 回呼ばれる regression を回避（ステップ 2 / 3 / 5 反映）
- **[P-002 → 対応]** テストファイル存在前提の文言を「Issue #299 でも単体テストは追加されていないため、本 Issue で `routerInvalidate` と `appShellInvalidate` の両方を一括で覆う」に修正（ステップ 5 反映）

**取り込んだ改善提案**:

- **[S-001 → 取込]** DoD セクションを目的直下に追加し、Issue #293 の主目的非 regression（特に fresh 未認証訪問での 1 RPC）を完了判定に明示
- **[S-002 → 取込]** `useTransition` で retry ボタンを pending 管理する旨をステップ 4 に追加
- **[S-003 → 取込]** ADR-003 の理由欄に「`useRouter()` は OK、`useLoaderData()` は不可」の対比を追記、retry 時 leaf 未到達の論拠も整理（次の adr.md 編集で反映）
- **[S-005 → 取込]** hook の JSDoc に「authenticated/unauthenticated 両 branch を持つ leaf に必ず配置すること」を明記（ステップ 2 反映）

**見送った提案とその理由**:

- **[S-004 → 見送り]** `routerInvalidate.ts` のファイル名 rename は ADR-005 の同居判断と矛盾するため見送り。JSDoc のファイル責務記載で代替（ADR-005 で対応）
- **[S-005 後半 → 見送り]** lint rule による完全性チェック追加は本 Issue のスコープ外。ADR-002 の Note として将来候補に残す
