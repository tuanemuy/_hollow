# ADR — Issue #300: AppShell 持続化のフォローアップ

## ADR-001: 課題 1（セッション失効時の stale AppShell）の実装方式を client hook 方式とする

### Status
Proposed

### Context
W-A-001 では `_app.loader` の `staleTime: Infinity` により、leaf 側 server fn が `user === null` を観測して `/` に redirect しても `_app` の cached `userDto` が残り、前ユーザーの AppShell が継続表示される問題が指摘された。

実装位置の候補:

- **(a) leaf 側 server fn 内で invalidate**: server fn から `router.invalidate()` は呼べない（router は client side concept）。不可
- **(b) `_app.loader` に middleware 追加**: middleware は SSR / SPA 両方で走り、`loadAppShell` の handler 内 `getCurrentUser()` と意味が重複。`staleTime: Infinity` の前提を崩さずに「user が変わった時だけ再評価」は middleware では実現困難
- **(c) leaf component 側で client hook を発火**: `useEffect` で `user === null` を観測した瞬間に `router.invalidate({ filter: m => m.routeId === "/_app" })` を呼ぶ
- **(d) global event bus**: ログアウト・401 を pub/sub で配信し購読側で invalidate。本 Issue のスコープでオーバーキル

加えて、hook の発火条件設計にも 2 つの選択肢がある:

- **(c1)** 「`leafAuthenticated === false` を観測したら発火」: 単純だが fresh 未認証訪問者（cached も null、leaf も false）でも発火し、`_app.loader` を 2 回呼ぶ regression を生む
- **(c2)** 「`shellUserDto !== null && leafAuthenticated === false` の不整合時のみ発火」: stale な authenticated AppShell の前提を条件に組み込み、fresh 未認証訪問では no-op

### Decision
**(c) client hook 方式 + (c2) 不整合検出条件** を採用する。`app/components/common/useAuthGuardEffect.ts` を新設し、`useAuthGuardEffect({ leafAuthenticated, shellUserDto })` で「shell に user キャッシュあり × leaf 観測が unauthenticated」の不整合を検出したタイミングで `appShellInvalidate(router)` を fire-and-forget する。

### Consequences
- **良い点:**
  - server fn ↔ router の境界制約を回避できる
  - 副作用が `useEffect` 1 箇所に局所化される
  - leaf を増やしても hook を import するだけで波及せず、Issue 本文の「useAuthGuardEffect のような client wrapper」推奨案と整合
  - middleware と違い `staleTime: Infinity` の初回 1 RPC 構造を壊さない
  - **不整合検出条件 (c2)** により fresh 未認証訪問者で誤発火せず、Issue #293 の「初回 1 RPC、以降 0 RPC」が regression しない
- **トレードオフ:**
  - `useEffect` 経由の発火は redirect 完了後の rendering 1 cycle 遅延する。leaf redirect → ランディング描画 → `useEffect` 発火 → `_app` invalidate → 次の SPA 遷移時に再評価。この間（おそらく 1 フレーム）は cached AppShell が見える可能性が残る
  - fire-and-forget のため、invalidate 完了前に次の SPA 遷移が起きると stale な AppShell が一瞬見える可能性があるが、機密 RPC は leaf 側で fail-closed されているので情報露出は最大 1 フレーム
  - hook の引数が単純な boolean ではなく object 形になるが、誤用防止のため受容
  - Promise を await しない fire-and-forget のため、テストでは effect の発火を確認するだけで完了タイミングは保証しない

---

## ADR-002: hook の発火点を `_app/index.tsx` の `HomeRoute` 1 箇所に限定する

### Status
Proposed

### Context
`useAuthGuardEffect` をどの leaf に配置するかの選択肢:

- **(a) `_app/index.tsx` の `HomeRoute` のみ**: ランディング描画 (`<LandingPage />`) と並行して発火
- **(b) `_app` 配下の全 leaf component**: 各 leaf で `data.authenticated` 相当を見て発火
- **(c) `_app/route.tsx` の `AppLayout` で `userDto === null` を見て発火**: hook は `_app.loader` の data に依存

### Decision
**(a) `_app/index.tsx` の `HomeRoute` のみ** に hook を配置する。

### Consequences
- **良い点:**
  - 他 leaf は `user === null` で `throw redirect({ to: "/", search: HOME_SEARCH })` され `_app/index.tsx` に着地する（ADR-006 / ADR-009 の構造で 9 leaf 全てが統一）→ 1 箇所配置で全 leaf 経由 fallout を捕捉できる
  - `_app/index.tsx` は「authenticated/unauthenticated 両 branch を持つ唯一の leaf」であり、ここでの不整合検出が最も意味的に妥当
  - 多 leaf 配布によるコード重複・二重発火リスクを回避
- **トレードオフ:**
  - 将来 `_app` 配下に「leaf で direct unauthenticated state を表示する別 route」を追加した場合、その leaf にも hook を配置する必要がある（規約として ADR に残す）
  - `_app/route.tsx` 側で `userDto === null` を見る (c) 案より発火位置がやや遠い（leaf 経由）

### Note (将来の Issue 候補)
hook 配布漏れを防ぐための lint rule 化（grep ベースで `_app/**/*.tsx` のうち `data.authenticated` を読む箇所が `useAuthGuardEffect` を呼んでいるか確認）は本 Issue のスコープ外。将来 `_app` 配下の leaf が増えた時点で検討する。

---

## ADR-003: 課題 2（errorComponent 発火で shell が吹き飛ぶ）を「retry 動線のみ」で解消する

### Status
Proposed

### Context
W-P-002 では `_app.errorComponent` の `<div role="alert">` が `AppShellFrame` 含む `_app` ツリー全体を置換し、Header の検索値・Sidebar の展開状態・スクロール位置が消える問題が指摘された。Issue 本文の対応案は 2 つ:

- **(a) shell 残し / main だけエラー**: errorComponent 内で cached `_app.loader` data を読み出し、shell は前回の RSC payload で描画
- **(b) retry 動線**: errorComponent 内に retry ボタンを置き、押下で `_app.loader` のみ再実行

(a) は errorComponent から `Route.useLoaderData()` が呼べない TanStack Router の制約により、`router.getMatch("/_app")?.loaderData` 経由になる。error 発生時の cached match は `undefined` の可能性が高く、別キャッシュ機構（context 経由・global state 等）が必要で実装コストが大きい。

### Decision
**(b) retry 動線のみ** を採用する。`AppErrorFallback({ error })` 関数を切り出し、`sanitizeRouteError(error)` の表示 + 「再読み込み」ボタンを描画する。ボタン押下で `appShellInvalidate(router)` を `useTransition` で pending 管理しながら呼ぶ。

**API 制約の整理（重要）**:
- errorComponent 内で **`useRouter()` は呼べる** — TanStack Router の `<Match>` ツリー内で render されるため context は利用可能
- errorComponent 内で **`Route.useLoaderData()` は呼べない** — loader が throw した状態なので "loaded" 状態を期待する hook は使えない
- **`_app.errorComponent` 発火時、leaf は mount されていない** — `_app.loader` が throw した時点で leaf までは到達しないため、retry 時に「leaf も再評価される」リスクは現状ない

**`appShellInvalidate(router)` を選ぶ理由**:
1. `_app` のみを狙うことで意図を明示できる（生 `router.invalidate()` でも実害はないが API の意味的対称性が崩れる）
2. 将来 `_app.errorComponent` 内で leaf 状態を保持する設計（例: cached match の lazy 読み出し）に変更した場合、hook 側を変えずに済む
3. 既存の `routerInvalidate(router)` と対称な API として読み手が理解しやすい

### Consequences
- **良い点:**
  - 実装が局所的（`_app/route.tsx` の errorComponent 関数のみ）
  - retry 成功時に `_app.loader` のみ再評価で通常の AppShell が復帰
  - Issue 本文も「簡易案として retry 動線」を提示しており要件を満たす
  - `useTransition` で retry 中の重複クリックを防止
- **トレードオフ:**
  - エラー発生の瞬間は依然として Header / Sidebar / スクロール位置が消える
  - retry 成功後も Header の検索入力値・Sidebar の展開状態は完全には復元されない（cached client state は失われている）
  - 完全な「shell 同一性」維持には別 Issue で context 経由のキャッシュ機構を検討する余地が残る
  - retry 失敗時（`_app.loader` が再 throw）は同じ errorComponent が再描画される。`useTransition` の `isPending` は新マウントでリセットされるため、ボタンは再活性化し再試行可能

---

## ADR-004: 課題 3（Sidebar RSC payload 肥大化）の長期案を本 Issue のスコープ外とする

### Status
Proposed

### Context
W-P-003 で Sidebar の RSC payload が `loadDirectoryTree(user.id)` の解決結果を含むため、ディレクトリ階層が深い・大量のユーザーで payload 肥大化リスクが指摘された。Issue 本文は対応案を 2 段で示している:

- **短期**: Issue #299 を先に解消すれば `_app` invalidate 頻度が下がり自然に頻度が下がる
- **長期**: Sidebar を「shell の枠だけ RSC で固定、tree は client 側で `useServerFn` 経由 lazy fetch」に切り替える

Issue #299 は既に CLOSED で 44 箇所の `routerInvalidate(router)` 置換が完了済 → 短期目標は達成。長期案を本 Issue で実施するかは判断が分かれる。

### Decision
本 Issue では **長期案を実施しない**。短期効果（Issue #299 による invalidate 頻度減少）の確認のみ動作確認に含め、長期案は ADR で「将来の Issue 候補」として明文化する。

### Consequences
- **良い点:**
  - 本 Issue のスコープを「W-A-001 / W-P-002 の解消 + 課題 3 短期効果確認」に絞れる
  - 長期案は Sidebar の SSR/CSR 切替・`useServerFn` 経由 fetch・loading 状態追加など影響範囲が広く、payload サイズの実測なしに踏み込むのは早計
  - Issue 本文の段階対応案（短期 → 長期）と整合
- **トレードオフ:**
  - 実 payload サイズが問題化した時に別 Issue 起票が必要
  - 残る `_app` invalidate 13 箇所（auth 7 + directory 5 + displayName 1）では依然として全 payload 再送が発生する。これらは AppShell の依存データ自体が変わるため再送は必然

### Note (将来の Issue 候補)
長期案の検討タイミング: (i) 実 payload サイズが計測で 100KB 超える等の閾値到達、または (ii) directory tree の深さ・件数が UX を損なうレベル（例: 初回ロード時間が 500ms 超える）に達した時。本 ADR を参照可能にしておくことで容易に追跡できる。

---

## ADR-005: 対称ヘルパー `appShellInvalidate` を `routerInvalidate.ts` に同居させる

### Status
Proposed

### Context
W-A-001 解消と W-P-002 retry 動線の双方で「`_app` のみを invalidate する」操作が必要。実装方式の選択肢:

- **(a) 生 `router.invalidate({ filter: m => m.routeId === "/_app" })` を hook と errorComponent の 2 箇所に書く**
- **(b) `app/components/common/routerInvalidate.ts` に対称ヘルパー `appShellInvalidate(router)` を追加し export する**
- **(c) 別ファイル `app/components/common/appShellInvalidate.ts` を新設する**

### Decision
**(b) 対称ヘルパーを同ファイル同居** を採用する。`routerInvalidate.ts` の末尾に追加し、既存の `APP_SHELL_ROUTE_ID` 定数を共有する。

### Consequences
- **良い点:**
  - 同ファイル同居により `APP_SHELL_ROUTE_ID` 定数共有が自然に成立（Issue #299 ADR-007 の「export せず module-local に留める」判断と整合）
  - API 表面の意味的対称性: `routerInvalidate` = 「`_app` を常に除外して invalidate」、`appShellInvalidate` = 「`_app` を狙って invalidate」
  - JSDoc に「両者は補完関係。3 rule 例外（auth / directory / displayName mutation）は生 `router.invalidate()` を引き続き使う」と明記することで規約が一目で読める
  - 将来 routeId をリネームする際に 1 ファイル 1 定数を変えるだけで両方更新
- **トレードオフ:**
  - 1 ファイルに 2 つの公開 API が同居する（YAGNI 的にはサイズが許容範囲）
  - 別ファイル化（(c)）に比べて命名の階層性は薄い
  - ファイル名（`routerInvalidate.ts`）と中身（`routerInvalidate` + `appShellInvalidate`）の対応が崩れる懸念があるが、ファイル先頭の JSDoc で「`_app` AppShell に対する invalidate 制御を集約する」と責務を明示することで読み手の grep 性を補う

### Note (regression なしの根拠)
本変更は `routerInvalidate.ts` への **純粋な追加**（既存 `routerInvalidate` 関数のシグネチャ・挙動は不変、定数 `APP_SHELL_ROUTE_ID` は module-local のまま、`appShellInvalidate` を新規 export）。Issue #299 で `routerInvalidate(router)` 経由化された 44 箇所の call site への影響はない。
