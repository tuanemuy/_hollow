# 実装計画 — Issue #732: セッション失効の leaf 観測時（useAuthGuardEffect）に未認証 UI が 1 フレーム見える

**Issue:** #732
**作成日:** 2026-06-14
**複雑度:** 中〜大規模

---

## 目的

`useAuthGuardEffect` がセッション失効の不整合（shell キャッシュに前ユーザー × leaf 観測は未認証）を観測したとき、`appShellInvalidate` が `useEffect` で fire-and-forget される間に `LandingPage`（未認証 UI）が最大 1 フレーム描画される問題を、`#293`/`#300` の不変条件を壊さずにゼロフレーム化（または明示的に再受容）する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | 不整合（`shellUserDto !== null && leafAuthenticated === false`）を観測した瞬間、`LandingPage`（未認証 UI）は 1 フレームも描画されない | Issue 本文「未認証 UI が 1 フレームも見えない」 | 1, 2 |
| AC-2 | fresh 未認証訪問者（`shellUserDto === null && leafAuthenticated === false`）では従来どおり `LandingPage` が描画される（誤抑制しない）。**検証手段:** ①hook 戻り値が `false`（ステップ 4 ユニット）、②`HomeRoute` のレンダリング分岐（フラグ `false`→`LandingPage`）をユニットでピン留め（ステップ 5）、③手動テスト「未ログインで初回 `/` → `LandingPage` 即表示」（主検証） | #300 ADR-001 (c2)、#293「初回 1 RPC」不変条件 | 1, 2, 4, 5 |
| AC-3 | 通常の認証済み表示（`leaf true`）では HomePage がそのまま描画され、余計な再評価・抑制が起きない | #300 ADR-001 | 1, 4 |
| AC-4 | `_app.loader`（`staleTime: Infinity`）の「初回 1 RPC、以降 0 RPC」が regression しない。**検証手段を 2 分割:** (a) `useAuthGuardEffect` の `useEffect` 発火条件・依存配列が本変更前後で等価（不整合時のみ `appShellInvalidate` 1 回、fresh/認証済みで 0 回）であることを `useAuthGuardEffect.test.tsx` の回数 assert でピン留め（純ユニットでは RPC 回数を直接数えにくいため invalidate 発火回数で代替担保）、(b) 実際の RPC 回数（初回 1・以降 0）と `staleTime: Infinity` 維持は testing.md の手動ブラウザ検証（DevTools Network で RPC 回数観測）で担保 | #293 / #300 不変条件 | 1, 4（(a)）/ 手動（(b)） |
| AC-5 | 不整合解消後（invalidate 完了 → AppShell が `userDto: null` で再評価 → leaf 再描画）は、未認証であれば正しく `LandingPage` に収束する。**検証手段:** 非同期収束（fire-and-forget 完了を待つ）であり**手動テストが主担当**（AC-1 と同一手順）。加えて「`shellUserDto` を user→null に変化させた再 render で hook 戻り値が `true→false` に遷移する」をユニットでピン留め（ステップ 6）し手動依存を減らす | #300 ADR-001 の最終状態 | 1, 2, 6 / 手動 |
| AC-6 | `useAuthGuardEffect` の不整合検出条件・発火点（`_app/index.tsx` 1 箇所）の規約は維持される | #300 ADR-002 | 1 |

## スコープ

### 含まれないもの
- `#300` の client hook 方式（leaf に留まり defensive redirect に任せる）の根本再設計（redirect ベースへの全面移行）。コスト過大で本 Issue（優先度: 低）の範囲を超える。ADR-001 で比較のうえ見送りを明文化する。
- `_app.errorComponent` の retry 動線（#300 ADR-003）への変更。本件と無関係。
- 他 leaf への hook 配布（現状 `_app/index.tsx` 1 箇所のまま）。発火点規約（#300 ADR-002）は維持。
- Sidebar RSC payload 肥大化（#300 ADR-004）など他フォローアップ。

## 調査結果

- 関連ファイル:
  - `app/components/common/useAuthGuardEffect.ts` — leaf 側で不整合を観測し `appShellInvalidate` を fire-and-forget する hook。発火条件 `shellUserId !== null && leafAuthenticated === false`。
  - `app/routes/_app/index.tsx` — `HomeRoute`。hook を無条件呼び出し（rules of hooks 準拠）した後、`if (!data.authenticated) return <LandingPage />` で未認証 UI を描画する。**ちらつきの実際の発生箇所はこの分岐**。
  - `app/routes/_app/route.tsx` — `_app` layout。`loadAppShell`（`staleTime: Infinity`）が `userDto` をキャッシュ。`AppLayout` は `userDto === null` で `<Outlet />` のみ返す。
  - `app/components/common/routerInvalidate.ts` — `_app` キャッシュ制御の SSOT。`appShellInvalidate`（`_app` のみ invalidate / in-place 再評価）・`clearAppShellCache`（clearCache / 破棄のみ）・`routerInvalidate`（`_app` 除外）の 3 API の意味分担。
  - `app/components/common/__tests__/useAuthGuardEffect.test.tsx` — 不整合検出契約（fresh 未認証で no-op、不整合で 1 回発火、id 変化で再発火等）をピン留め。
  - `app/components/auth/links.ts` — `HOME_SEARCH = {}`。`/` への navigate/redirect の共有 search payload。
- あるべきアーキテクチャ:
  - フロントエンドの router/rendering 制御の問題であり、ドメイン/ユースケース/アダプター層への影響は無い（CLAUDE.md「依存方向は内向き」に照らしても本件は presentation 層内部に閉じる）。
  - `_app` キャッシュ制御は `routerInvalidate.ts` を SSOT とし、invalidate（再評価）と clearCache（破棄）の意味分担を JSDoc/ADR で明示する設計（#293 ADR-010 / #299 / #300 ADR-005 / #728 ADR-001）。新規ヘルパーを増やすより既存の `appShellInvalidate` をそのまま使うのが整合的。
  - 不変条件: ①初回 1 RPC・以降 0 RPC（`staleTime: Infinity`）、②fresh 未認証訪問者で誤発火しない（c2 不整合検出条件）、③hook 発火点は `_app/index.tsx` 1 箇所。
- 既存実装の状態:
  - `useAuthGuardEffect` の不整合検出ロジック自体は #300 ADR の意図どおりで正しい。invalidate を `useEffect` で呼ぶこと自体は、router を client side でしか触れない制約（#300 ADR-001 (a) 不可）に対する妥当な解。
  - 乖離は「不整合が成立している間 `HomeRoute` が `LandingPage` を描画してしまう」レンダリング側にある。invalidate 発火と LandingPage 描画が同一 cycle で並走し、invalidate が解決して AppShell が再評価されるまでの 1 フレーム、未認証 UI が露出する。この露出は #300 ADR-001 のトレードオフ欄で受容済みだが、**hook が知っている不整合フラグを HomeRoute のレンダリング分岐に反映していない**点が改善余地。
- 依存関係:
  - `HomeRoute` のレンダリング分岐のみが影響を受ける。`AppLayout`（`_app/route.tsx`）・`appShellInvalidate`・`HOME_SEARCH` は変更不要。
  - `useAuthGuardEffect.ts` の戻り値を `void` から「不整合中フラグ」を返す形に変更する場合、唯一の呼び出し元は `HomeRoute` のみ（JSDoc の発火点規約より）なので波及は局所。

## 設計

レイヤーの内側から外側へ確認した結果、**ドメイン / ユースケース / アダプター層はいずれも影響なし**（本件は TanStack Router の rendering 制御に閉じた presentation 層の問題）。以下 UI / プレゼンテーションのみ。

### ドメインモデルへの影響
なし。本件は認証状態の表示制御であり、ドメインの不変条件・ポートには触れない。

### ユースケース / アプリケーションロジック
なし。`loadAppShell` / `renderHome` の server fn は不変。`appShellInvalidate` の挙動も不変。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

採用案（ADR-001 で比較・決定）: **レンダリングガード方式**。`useAuthGuardEffect` が観測する「不整合中（= 再評価待ち）」状態を `HomeRoute` のレンダリング分岐へ伝え、その間は `LandingPage`（未認証 UI）ではなく中立プレースホルダ（`null` を返す）を描画する。invalidate が解決すると AppShell が `userDto: null` で再評価され、leaf が再描画されて未認証であれば `LandingPage` に収束する。

中立プレースホルダは **`null` に確定**する（arch-risk S-002）。過渡フレームは `AppLayout` が `userDto === null` で `<Outlet />` のみを返す＝AppShell（frame chrome）が未マウントの状態であり、`<div aria-hidden />` 等を置いてもレイアウトを占有する明示寸法が無い限りレイアウトシフト抑制効果が無い。したがって `null` を返すのが最小かつ正しく、`aria-hidden` div を追加するのはデッドコードになる。

#### 収束経路（AC-5 の検証根拠）

`appShellInvalidate` は `routeId === "/_app"` **のみ** を invalidate する（filter の指定）。したがって収束は次の依存連鎖で起きる:

1. `appShellInvalidate(router)` が `_app` のみ invalidate → `_app.loader`（`loadAppShell`）が再走し `userDto: null` を返す。
2. **leaf（`/_app/`）の loader（`renderHome`）は invalidate されない** → `data.authenticated` は元の `false` のまま保たれる（これが収束の必要条件）。
3. `AppLayout` が再 render（`userDto === null`）→ 子の `<Outlet />` 配下の `HomeRoute` も再 render → `shellUserDto` が `null` 化。
4. hook の `isAuthMismatch` が `shellUserId === null` により `false` に落ちる → ガード解除。
5. 結果として `shellUserDto === null × data.authenticated === false`（= fresh 未認証と同形）に収束し、`HomeRoute` は `LandingPage` を描画する。

この「leaf loader が再走しないから `data.authenticated === false` が保たれ、shell だけ null 化してフラグが落ちる」連鎖が AC-5（収束）の構造的根拠であり、ガード条件が hook と SSOT 一致である限り（fresh 未認証と同形に落ちるため）保証される。依存配列（`[shellUserId, leafAuthenticated, router]`）は不変なので、再 render で invalidate が再発火することはなく（既存「同一 id で非再発火」テストが担保）、単調収束で振動・無限ループは起きない。

判断のポイント:
- なぜ navigate 案ではないか: 失効を観測する leaf は `_app/index.tsx`（= `/`）であり、不整合時ユーザーは既に `/` に居る。`/` へ navigate しても同一ルートで AppShell loader は `staleTime: Infinity` のため再評価されず、ちらつきは消えない。`clearAppShellCache` も navigate を伴わないため目的を達成できない（Issue 本文・#728 ADR-002 の指摘どおり）。
- なぜレンダリングガードか: ちらつきの実体は「不整合が成立している 1 フレームに `LandingPage` を描いてしまう」レンダリング判断。hook は既にその不整合を検出しているので、同じ判定を描画分岐に渡せばゼロフレーム化できる。#300 client hook 方式（leaf に留まる）を温存したまま、invalidate 解決までの過渡 UI を未認証 UI から中立に差し替えるだけで、不変条件①②③をいずれも壊さない。

hook の戻り値設計（ADR-002）: `useAuthGuardEffect` を `void` から `boolean`（`isResolvingAuthMismatch` 相当）を返す形に拡張する。`true` = 不整合観測中（invalidate を fire 済み、AppShell 再評価待ち）。`HomeRoute` は `data.authenticated === false` のとき、このフラグが `true` なら中立プレースホルダ、`false`（= fresh 未認証）なら従来どおり `LandingPage` を返す。判定式は hook 内部の発火条件と完全に一致（`shellUserId !== null && leafAuthenticated === false`）させ、SSOT を hook に置く。これにより `HomeRoute` 側に不整合判定ロジックが二重化しない。

## 実装ステップ

### 1. `useAuthGuardEffect` を「不整合中フラグ」を返す形に拡張

- **対象ファイル:** `app/components/common/useAuthGuardEffect.ts`
- **変更内容:**
  - 戻り値を `void` → `boolean` に変更。`const isAuthMismatch = shellUserId !== null && leafAuthenticated === false;` を算出し、`useEffect` の発火条件をこの定数に置き換え（重複式を排除、SSOT 化）、最後に `return isAuthMismatch;` する。
  - JSDoc を更新: 戻り値の意味（`true` = 不整合観測中・AppShell 再評価待ち。呼び出し側は未認証 UI ではなく中立 UI を描画して 1 フレームちらつきを防ぐべき）と、本変更の背景（Issue #732）を追記。`useEffect` は中立 UI が描かれている間に invalidate を解決し、AppShell 再評価で正規 UI に収束する旨を明記。発火点規約（`_app/index.tsx` 1 箇所、#300 ADR-002）はそのまま残す。
- **理由:** 不整合判定の SSOT を hook に集約し、レンダリングガードに必要なフラグを唯一の呼び出し元へ最小インターフェースで渡す。

### 2. `HomeRoute` のレンダリング分岐をガードする

- **対象ファイル:** `app/routes/_app/index.tsx`
- **変更内容:**
  - `useAuthGuardEffect(...)` の戻り値を受け取る（例: `const isResolvingAuthMismatch = useAuthGuardEffect({ ... });`）。
  - `if (!data.authenticated)` 分岐を「不整合中なら中立プレースホルダ、そうでなければ `LandingPage`」に変更する。中立プレースホルダは **`return null;` に確定**する（arch-risk S-002）。過渡フレームは AppShell 未マウントで frame chrome が無く、`aria-hidden` div を置いてもレイアウトシフト抑制効果が無いため。なぜ中立かを 1 行の why コメントで残す（「不整合中は invalidate 解決待ち。LandingPage を描くと 1 フレーム未認証 UI が露出する — #732」）。
  - `data.authenticated === true` のときは従来どおり `data.Home` を返す（不変）。
- **理由:** ちらつきの実発生箇所。hook の不整合フラグをレンダリングに反映し、未認証 UI の 1 フレーム露出を消す。

### 3. （任意・手動目視のみ）中立プレースホルダの過渡フレーム確認

- **対象ファイル:** `app/routes/_app/index.tsx`
- **変更内容:** `null` 返却済みのため追加要素は置かない（YAGNI、arch-risk S-002）。手動テストで過渡フレームに未認証 UI が描かれず、体感的なちらつき・レイアウトシフトが無いことを目視確認するのみ。コード変更は伴わない（`aria-hidden` div 等のデッドコードを足さない）。
- **理由:** ゼロフレーム化の目的が「未認証 UI を見せない」ことであり、AppShell 未マウントの過渡フレームでは `null` が最小かつ正しい。

### 4. テスト更新・追加

- **対象ファイル:** `app/components/common/__tests__/useAuthGuardEffect.test.tsx`
- **変更内容:**
  - 既存の `invalidate` 呼び出し契約テスト（fresh 未認証 no-op / 不整合で 1 回発火・filter shape / 認証済み no-op / id 変化で再発火等）は**無改修で維持**。既存 `Probe` は invalidate 呼び出し契約用に温存し、戻り値を捨てたままにする（arch-risk S-003: 戻り値検証を既存 `Probe` に混ぜると無改修方針と衝突するため）。
  - 戻り値契約のテストは**別の薄いラッパー/テストハーネス**（例: `BoolProbe` — hook の戻り値を DOM/ref に反映する最小コンポーネント）を新設して検証する（arch-risk S-003）: ①不整合（shell user × leaf false）で `true`、②fresh 未認証（shell null × leaf false）で `false`、③認証済み（leaf true）で `false`。
- **理由:** AC-4(a) の invalidate 発火回数契約を既存テストで、hook 戻り値契約（不整合フラグの真偽）を新 `BoolProbe` で回帰ピン留めする。既存 `Probe`（invalidate 契約用）と戻り値検証用ハーネスを分けることで無改修方針を保つ。

### 5. `HomeRoute` のレンダリング分岐の向きをユニットでピン留め（AC-2 自動化）

- **対象ファイル:** `app/routes/_app/index.tsx`（必要なら分岐選択を純関数として切り出す）/ 対応テスト
- **変更内容:** 「不整合フラグ → 描画選択」のマッピング（`true`→中立プレースホルダ(`null`) / `false`→`LandingPage`）を最小テストで固定する。`HomeRoute` の `!data.authenticated` 分岐は server component の都合でフルレンダリングが重いので、**分岐選択を純関数（例: `selectUnauthenticatedView(isResolvingAuthMismatch)`）として切り出し**、その純関数の入出力をユニットテストする。これにより「フラグ `false`（fresh 未認証）で確実に `LandingPage` を選ぶ／分岐の向きを取り違えない」ことを自動で担保する。**最重要リスク（AC-2）の自動担保のため、この純関数切り出し＋ユニットは原則必須で実施する**（手動テストは併用するが代替にはしない）。純関数化が技術的に不可能と判明した場合のみ、その理由を progress.md/adr.md に明記したうえで手動テスト主担当に倒す。
- **理由:** 最重要リスク（fresh 未認証の誤抑制 = AC-2）を hook 戻り値テストだけでは捕まえられない（分岐の向きの取り違えは戻り値テストの範囲外）ため、分岐マッピングを自動テストでピン留めする（coverage P-002）。

### 6. 不整合フラグの `true → false` 遷移（収束）をユニットでピン留め（AC-5 自動化）

- **対象ファイル:** `app/components/common/__tests__/useAuthGuardEffect.test.tsx`
- **変更内容:** `BoolProbe`（ステップ 4）を再 render する形で、`shellUserDto` を user→null に変化させた再 render（既存「id 変化で再発火」テストと同じ再 render パターン）で hook 戻り値が `true → false` に遷移することを assert する。収束（fire-and-forget 完了後の AppShell 再評価）を直接は待てないが、再評価後に shell が null 化したときフラグが落ちる遷移そのものは hook 単体で確定できる。
- **理由:** AC-5 の収束を手動テストのみに委ねず、`true→false` 遷移を再 render ユニットでピン留めして手動依存を減らす（arch-risk S-001）。

## 設計判断

- **ADR-001:** ゼロフレーム化の方式として「レンダリングガード方式（不整合中は中立 UI を描画）」を採用し、navigate 案 / redirect 再設計案 / 現状受容案を比較のうえ退ける。
- **ADR-002:** `useAuthGuardEffect` のインターフェースを `void` → `boolean`（不整合中フラグ）に拡張し、不整合判定の SSOT を hook 内部に保つ（`HomeRoute` 側に判定を二重化しない）。

詳細は `.issue/732/adr.md` を参照。

## リスクと注意点

- **fresh 未認証訪問者の誤抑制リスク（最重要）:** ガード条件を hook の発火条件（`shellUserId !== null && leafAuthenticated === false`）と完全一致させること。ズレると fresh 未認証で `LandingPage` を抑制してしまい AC-2 を破る。SSOT を hook に置くことで構造的に防ぐ。
- **収束保証:** `appShellInvalidate` は `_app` のみを invalidate し、**leaf（`/_app/`）の loader（`renderHome`）を再走させない**ため、再評価後は `shellUserDto === null × data.authenticated === false`（fresh 未認証と同形）に落ちて不整合フラグが `false` になり `LandingPage` に収束する（詳細な依存連鎖は「設計 > 収束経路」を参照）。fire-and-forget の完了タイミングは保証しないが、解決後の再評価で必ず収束する（cookie が無い限り `userDto: null`）。この遷移はステップ 6 のユニット（`true→false`）と手動テスト（AC-1/AC-5 同一手順）の両方で確認する。
- **過渡フレームの無表示:** 中立プレースホルダがレイアウトシフトやちらつき（白画面の点滅）を生まないか確認。`null` 返却が最も安全だが、AppShell 未マウント状態なので背景が一瞬出る程度。手動テストで体感を確認。
- **`staleTime: Infinity` 不変条件:** 本変更は invalidate の発火条件・回数を一切変えない（hook の `useEffect` ロジックは等価）。RPC 回数の regression は無いはずだが、テストで「不整合時のみ invalidate 1 回」を維持していることを確認。
- **hook 戻り値の使用漏れ:** 発火点が `_app/index.tsx` 1 箇所のため波及は局所だが、将来 leaf を増やす際は戻り値を使ってガードする必要がある旨を JSDoc の発火点規約に追記しておく。

## テスト方針

- ユニット（`useAuthGuardEffect.test.tsx`）:
  - 既存の invalidate 呼び出し契約（fresh no-op / 不整合 1 回 / 認証済み no-op / 不可能ケース no-op / 同一 id 再レンダーで非再発火 / id 変化で再発火）を**無改修で維持**（既存 `Probe` は温存 — arch-risk S-003）。これが AC-4(a) の発火回数契約を担保。
  - 戻り値契約を**別ハーネス `BoolProbe`** で追加（不整合 → `true`、fresh 未認証 → `false`、認証済み → `false`）。
  - 収束遷移を `BoolProbe` の再 render で追加（`shellUserDto` user→null で `true → false`）— AC-5 の自動ピン留め（arch-risk S-001）。
- ユニット（`HomeRoute` 分岐 / `app/routes/_app/index.tsx`）:
  - 「不整合フラグ → 描画選択」純関数のマッピング（`true`→`null` / `false`→`LandingPage`）をピン留め — AC-2 の分岐の向きを自動担保（coverage P-002）。**原則必須**。純関数化が技術的に不可能と判明した場合のみ理由を明記して手動テスト主担当に倒す。
- 手動テスト（`docs/test.md` 方針に沿ったブラウザ確認、`.issue/732/.manual-test/` 等）:
  - ログイン済みで `/` 以外の認証ルートを開く → DevTools で session cookie を手動削除 → `/` へ SPA 遷移（または失効を観測する leaf 経由で `/` 着地） → **未認証ランディングが 1 フレームも見えず**、最終的に `LandingPage` に収束することを確認（AC-1 / AC-5）。
  - 未ログインで初回 `/` 訪問 → `LandingPage` が即座に表示される（抑制されない）ことを確認（AC-2 の主検証）。
  - ログイン状態で `/` 表示 → HomePage が変わらず表示される（AC-3）。
  - **AC-4(b)（RPC 回数）:** DevTools Network で fresh 未認証の `/` 訪問時に `_app.loader` の server fn が初回 1 回のみ呼ばれ、レンダリングガード追加で追加 RPC が発生しないこと・以降 0 RPC（`staleTime: Infinity` 維持）を観測する。
- 既存テスト全体: `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test:unit` が green であること。`routerInvalidate.test.ts` は無改修で green（`appShellInvalidate` の挙動は不変）。

## レビュー履歴

### 1周目
**修正した点**:
- coverage P-001（AC-4 の検証可能性）: AC-4 を (a) invalidate 発火回数等価をユニットでピン留め／(b) 実 RPC 回数・`staleTime: Infinity` 維持を手動ブラウザ検証、の 2 分割に明文化。純ユニットでは RPC 回数を直接数えにくい旨と代替担保（invalidate 発火回数）を AC 表・手動テストに明記。
- coverage P-002（AC-2 の自動検証欠落）: 最重要リスク AC-2 に対し、`HomeRoute` の「不整合フラグ → 描画選択」分岐を純関数として切り出してユニットでピン留めする実装ステップ 5 を追加。fresh 未認証で `LandingPage` を選ぶ（フラグ `false`→描画抑制しない）ことを自動担保。AC-2 表に検証手段①②③を明記。
- arch-risk P-001（収束経路の言語化）: 設計セクションに「収束経路」小節を追加。`appShellInvalidate` が `_app` のみ invalidate → leaf loader 非再走で `data.authenticated=false` 維持 → AppShell 再評価で `shellUserDto` null 化 → フラグ `false` → `LandingPage` 収束、の依存連鎖を明記し AC-5 の検証根拠とした。リスク欄「収束保証」もこの連鎖を参照する形に更新。
- arch-risk S-002（中立プレースホルダの確定）: 中立プレースホルダを `null` に確定（過渡フレームは AppShell 未マウントで chrome が無く `aria-hidden` div はレイアウトシフト抑制効果が無いため）。設計・ステップ 2・ステップ 3・adr.md ADR-001 を `null` 返しに更新し、デッドコード追加を防止。

**取り込んだ改善提案**:
- coverage S-001: AC-5 表に検証手段（手動テスト主担当・非同期収束である旨）を明記。
- arch-risk S-001: AC-5 の「フラグ `true→false` 遷移」を再 render ユニットでピン留めする実装ステップ 6 を追加し手動依存を低減。
- arch-risk S-003: 戻り値（boolean フラグ）検証を既存 invalidate 契約用 `Probe` とは別の薄いハーネス（`BoolProbe`）で行う旨をステップ 4・テスト方針に明記（既存 6 ケースは無改修温存）。
- coverage S-002: ADR-001 Consequences に「(D) 現状トレードオフ再受容」への撤退条件（レンダリングガードで収束しない／レイアウトシフトが許容できない等の場合は #300 ADR-001 の受容に戻す）を追記。

**見送った提案とその理由**:
- なし（両視点の指摘をすべて取り込み）。

### 2周目
**修正した点**:
- coverage S-001（ステップ 5 の純関数切り出しの「条件付き・見送り可」トーンを固定）: ステップ 5・テスト方針の該当箇所を「最重要リスク AC-2 の自動担保のため原則必須。純関数化が技術的に不可能と判明した場合のみ理由を明記して手動主担当に倒す」に更新し、最重要リスクの自動検証を確実化。

**取り込んだ改善提案**:
- coverage S-001（上記）。

**終了**: 2周目で両視点とも問題点ゼロ。レビューループを終了する。
