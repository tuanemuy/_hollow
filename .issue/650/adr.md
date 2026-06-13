# ADR — Issue #650: 表示モードの前回値を永続化し、切り替え操作自体を減らす

本 Issue は #626 ADR-003（「前回値の永続化は採用方向、実装はフォローアップ Issue」）の実装フェーズである。

## ADR-001: 永続化先は localStorage を採用する（cookie / ユーザー設定は不採用）

### Status
Proposed

### Context
表示モード（list / tile / calendar）は #219 で「純粋なクライアント描画の関心事であり usecase に到達しない」と位置づけられ、loaderDeps からも除外されている（URL の `display` はサーバーへ転送されるが SavedView redirect 判定にのみ使われ、データ取得には影響しない）。この前提のもと、永続化先として 3 案がある。

- **(a) localStorage** — クライアント専用。ドメイン / ユースケース / アダプターに一切変更が不要。`display` の既存の位置づけ（クライアント描画の関心事）と完全に整合する。サーバー（RSC / loader）からは読めないため、初期描画はサーバーが既定値で描画し、クライアントが mount 後に永続値へ差し替える（ADR-004 で扱う）。
- **(b) cookie** — RSC / loader が初期描画前に読めるため、フラッシュ・hydration mismatch を回避できる。しかし `display` をサーバー結合させることになり、#219 の「display は loader に到達しない」設計を一部巻き戻す。cookie 読み取りを loader / server fn に持ち込むと、loaderDeps 除外（ADR-003 整合）を保ったままでも「display がサーバーの関心事になる」という設計上の後退が生じる。また cookie は全リクエストに付与されネットワークコストにも乗る。UI の表示設定 1 個のためにサーバー結合を増やすのは過剰。
- **(c) ユーザー設定（サーバー永続）** — Note / View ドメインに「ユーザーの表示設定」という新しい永続概念とポート・スキーマ・マイグレーション・ユースケースが必要になる。クライアント専用・端末ローカルで十分な関心事（同一ユーザーでも端末ごとに好みが違いうる）に対してドメイン変更は明確に過剰。#626 ADR-003 も「クライアント専用の関心事には過剰」と整理している。

プロジェクトには既存の localStorage / cookie による UI 設定永続化パターンは存在しない（grep 確認済み）。いずれを選んでも新規パターンの導入になる。

### Decision
- **(a) localStorage を採用する。** 永続化先キーは `hollow3:noteList:display`（名前空間プレフィックス付き）。値は `DISPLAY_MODES`（`"list" | "tile" | "calendar"`）のいずれか。
- 読み書きは SSR セーフな薄いラッパ（`app/components/note/list/displayPreference.ts`）に閉じ込める。`typeof window === "undefined"` / `try-catch`（プライベートブラウジング等で localStorage アクセスが throw する環境）でガードし、読み取り失敗・不正値は `undefined` を返す（既定 `"list"` にフォールバック）。値の検証は `DISPLAY_MODES.includes(...)` で行い、不正値は永続化されていないものとして扱う。
- 配置は現状 home route 専用（`DisplayModeSwitch` / `NoteListViews` が `getRouteApi("/_app/")` をハードコードしスコープが home に閉じている）ゆえ `app/components/note/list/` 配下に置く。P30 / 公開一覧へ横展開する際は、配置（`app/lib/` や共通フックへの昇格）を見直す。
- この選択は #219 の「display は usecase に到達しないクライアント描画の関心事」という位置づけを維持し、ドメイン / ユースケース / アダプター / loader に一切変更を加えない点で最も整合的。

### Consequences
- 良い点: 内側レイヤー（domain / application / adapter）への影響ゼロ。`display` のクライアント専用という位置づけが保たれる。端末ローカルで好みが分かれるケースにも自然に対応。
- トレードオフ: サーバーは永続値を知らないため初期描画は既定 `"list"` になり、永続値が `"list"` 以外のときクライアントで差し替えが発生する（フラッシュ／hydration の論点は ADR-004 で扱う）。端末間で同期されない（仕様として許容）。

---

## ADR-002: 優先順位は「URL `?display=` > SavedView の displayMode > 永続値 > 既定 `"list"`」とする

### Status
Proposed

### Context
表示モードの初期値を決めうる入力が複数ある。

- URL `?display=` の明示指定（共有リンク・ブックマーク・手動入力）
- SavedView 適用時（`viewId` あり）の `view.displayMode`
- localStorage の永続値（前回選択）
- 既定値 `"list"`

これらの優先順位を定義する必要がある。特に SavedView との関係は既存の `shouldRedirectForSavedView` / `viewQueryToSearch` のロジックと整合させる必要がある。

### Decision
優先順位を次のとおり定義する（上が強い）。

1. **URL `?display=` 明示指定** — 最優先。共有・ブックマークされた URL は意図された表示であり、永続値で上書きしてはならない。
2. **SavedView の `displayMode`（`viewId` あり かつ URL に `display` 無し）** — 既存実装どおり。`shouldRedirectForSavedView` が `viewId` あり・`display` 無し・view 解決済みのとき `redirect({ to:"/", search:{ ...search, display: view.displayMode } })` で URL に `display` を載せる。redirect 後は URL に `display` が乗るため、以降は (1) の経路に合流する。永続値は SavedView の意図に優先しない。
3. **localStorage の永続値** — URL にも SavedView にも `display` が無い「素のホーム」初期表示でのみ適用する。
4. **既定 `"list"`** — 永続値も無い初回訪問時。

実装上の要点:
- **永続値の適用は URL を書き換えない。** ADR-003 の制約（loader 再実行を起こさない）と、(1)(2) の優先順位を両立させるため、永続値はクライアントの mount 後に「URL に `display` が無いときだけ」表示用 state にオーバーレイする（ADR-004）。永続値で URL に `?display=` を書き込むと、それが「明示指定」と区別できなくなり (1) と衝突するため、URL には載せない。
- `shouldRedirectForSavedView` / `viewQueryToSearch` / loader（`app/routes/_app/index.tsx`）は**変更しない**。SavedView の displayMode が永続値より優先される、という (2) > (3) の関係は「SavedView 経路では URL に display が乗る → 永続値オーバーレイは URL に display が無いときのみ発火 → 発火しない」という形で自動的に成立する。

### Consequences
- 良い点: 既存の SavedView 正規化ロジックに手を入れずに優先順位が成立する。共有 URL の意図が壊れない。
- トレードオフ: 永続値が URL に反映されないため、リロードしても URL は素のまま（`display` 無し）で、表示はクライアント側オーバーレイで復元される。URL を直接コピーして他者に共有すると永続値は伝わらない（これは「個人の前回値」の性質上むしろ正しい）。

---

## ADR-003: #219 整合 — 永続値の適用は loader 再実行を一切起こさない

### Status
Proposed

### Context
#219 で `display` は home route の loaderDeps から除外され、表示切り替えが loader を無効化しない設計になっている。永続値の適用がこの設計を壊さないことを保証する必要がある。

### Decision
- 永続値は **loaderDeps にも URL にも干渉しない経路**でのみ適用する。具体的には、クライアントコンポーネントが mount 後に localStorage を読み、表示用の値にオーバーレイするだけ（ADR-004）。
- `homeLoaderDeps` は変更しない（`display` 除外を維持。既存テスト `app/routes/__tests__/index.loaderDeps.test.ts` がこれを pin している）。
- 永続値で URL を `router.navigate` しない（ADR-002 のとおり）。仮に URL を書き換えても loaderDeps から除外済みなので loader は再実行されないが、URL を汚さず (1) の明示指定との区別を保つため、そもそも書き換えない。
- 保存（書き込み）は `DisplayModeSwitch` の select ハンドラ内で行う（ADR-005）。これも `router.navigate`（既存の URL 更新のみ・loader 再実行なし）に副作用として localStorage 書き込みを足すだけで、loader には触れない。

### Consequences
- 良い点: #219 の設計（display は loader に到達しない）が完全に保たれる。表示切り替え・永続値復元のいずれも 1 React レンダーパスで完結し、サーバー往復ゼロ。
- トレードオフ: なし（既存設計の制約内に収まる）。

---

## ADR-004: 初期描画のフラッシュ / hydration mismatch は「mount 後 useEffect で適用」して回避する

### Status
Proposed

### Context
localStorage はサーバーから読めないため、サーバーは既定 `"list"` を描画する。永続値が `"list"` 以外のとき、クライアントが永続値へ差し替えると (a) 一瞬 `"list"` が見える「フラッシュ」と (b) サーバー HTML とクライアント初回レンダーが食い違う「hydration mismatch 警告」が起きうる。

選択肢:
- 許容する（差し替えを初回レンダーで行う）→ hydration mismatch 警告が出るため不可。
- **useEffect で mount 後に適用** → 初回クライアントレンダーはサーバーと一致（`"list"` 既定）させ、mount 後に永続値へ切り替える。hydration mismatch は起きない。フラッシュは「URL/SavedView に display があれば最初からその値・無いときだけ既定→永続値の 1 フレーム差し替え」に限定される。
- cookie で回避 → ADR-001 で不採用。

参考: `CalendarView.tsx` は `typeof Intl !== "undefined"` ガードで render 内からブラウザ環境差を読んでおり、クライアント差を許容する流儀が既にある。ただし Intl はサーバー / クライアントで同じ既定（UTC ベース）に倒せるのに対し、localStorage は値そのものがクライアント固有のため、hydration を割らないには mount 後適用が必要。

### Decision
- 表示モードの実効値を `NoteListViews`（および表示モードの実効値に依存する箇所）で決める際、次のロジックにする。
  - **URL / SavedView 由来で `display` が URL に存在するとき**（`useSearch` の `selectDisplay` が `s.display` を返すとき、すなわち `s.display !== undefined`）はそれをそのまま使う。永続値・hydration の論点は発生しない。
  - **URL に `display` が無いとき**のみ、永続値オーバーレイを行う。初回レンダーは既定 `"list"`（= サーバーと一致）、mount 後に `useEffect` で localStorage を読み、永続値があれば実効モードをそれに更新する。
- このため、表示モードの実効値を返す小さなクライアントフック `useEffectiveDisplayMode()`（`app/components/note/list/useEffectiveDisplayMode.ts`）を新設する。内部で `homeRoute.useSearch({ select: (s) => s.display })`（URL 値、`undefined` 可）と `useState`/`useEffect`（mount 後の永続値）を組み合わせ、`s.display ?? persisted ?? "list"` の優先で実効値を返す。`NoteListViews` はこのフックを使う。
- フラッシュは「URL 無指定 かつ 永続値が list 以外」のときのみ、mount 直後の 1 フレームに限定される。`CalendarView` のクライアント差許容の流儀と同等の割り切りであり、許容する。視覚的影響を抑えるため、差し替えは `useEffect` の同期的初回実行（paint 前）に寄せられる範囲で行う（React は `useEffect` を paint 後に走らせるため厳密にはゼロにはできないが、対象はリスト⇔タイル⇔カレンダーのレイアウト差のみで、データ再取得は伴わないため瞬時）。

### Consequences
- 良い点: hydration mismatch 警告を確実に回避できる。サーバー結合を増やさない（ADR-001 と整合）。
- トレードオフ: 永続値が `"list"` 以外の初回表示で 1 フレームのフラッシュが残る。cookie 採用なら消せるが、そのコスト（サーバー結合）に見合わないと判断。`prefers-reduced-motion` 等の配慮は不要（アニメーションではなくレイアウト切替の即時差し替えのため）。

---

## ADR-005: 保存タイミングは `DisplayModeSwitch` の select 時（ユーザーの明示選択時のみ）

### Status
Proposed

### Context
永続値をいつ書き込むかには「ユーザーが明示的に切り替えたとき」と「表示されたモードを常に（SavedView 由来や URL 由来も含めて）書き込む」の二択がある。

### Decision
- **`DisplayModeSwitch` の `select(mode)` ハンドラ内、`router.navigate` と同じタイミングで localStorage に書き込む。** ユーザーが segmented を操作して明示的に選んだモードだけを「前回値」として記録する。
- URL `?display=` 由来や SavedView 由来の表示は**永続化しない**。理由: SavedView を一時的に開いただけ・共有リンクを踏んだだけで個人の既定が書き換わるのは意図に反する。「前回**選択**した表示モード」という Issue の文言にも忠実。
- 書き込みは ADR-001 の SSR セーフラッパ（`displayPreference.ts` の `writeDisplayPreference(mode)`）経由。
- **`DisplayModeSwitch` 内では 2 つの関心を分離する。**
  - **navigate / 書き込みの要否判定は URL の生 display 値（`selectDisplayRaw`）と mode の一致で行う**（「URL を実際に変える必要があるか」で判定）。早期 return ガードはこの URL 生値を見る。
  - **segmented の active 表示は実効モード（`useEffectiveDisplayMode()`）を使う**（URL 無指定 + 永続値ありのとき active が初期表示モードと一致するように）。
  - WHY: 早期 return に実効モードを使うと、「URL 無指定・永続値 calendar」で `current === "calendar"` になり、URL にまだ `display` が無いのに calendar クリックが early return して URL が更新されず、URL と表示がズレる（例: tile を経由して calendar に戻すと URL の `display` が tile のまま残る）。navigate 要否＝URL 生値・active 表示＝実効モードと参照値を切り分けてこのズレを防ぐ。

### Consequences
- 良い点: 「前回選択値」のセマンティクスが明確。SavedView / 共有 URL が個人の既定を汚染しない。
- トレードオフ: SavedView の displayMode を「次回の既定」にしたいユーザーには対応しないが、それは SavedView 自体を開く運用でカバーされ、本 Issue のスコープ外。
