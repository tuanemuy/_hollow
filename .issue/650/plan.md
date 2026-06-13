# 実装計画 — Issue #650: 表示モード（リスト/タイル/カレンダー）の前回値を永続化し、切り替え操作自体を減らす

**Issue:** #650
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

ホーム（P10）の表示モード（list / tile / calendar）の前回**選択**値を端末ローカルに永続化し、URL / SavedView で明示指定が無い初期表示に適用することで、訪問のたびの切り替え操作を不要にする。#219 の loaderDeps 除外設計と #626 ADR-003 の方向性を保ったまま実装する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `DisplayModeSwitch` でモードを選択すると、その値が localStorage（キー `hollow3:noteList:display`）に保存される（検証はキー書き込み＝`DisplayModeSwitch.test` と list/tile/calendar の round-trip＝`displayPreference.test` に書き分け） | Issue「前回値を永続化」/ ADR-005 | 1, 2 |
| AC-2 | URL に `?display=` も `viewId`（SavedView の displayMode）も無いホーム初期表示で、永続値があればそのモードで表示される | Issue「初期表示に適用」/ ADR-002 | 3, 4 |
| AC-3 | URL `?display=tile` 等の明示指定は永続値より優先される（永続値が calendar でも URL が tile なら tile） | Issue「URL 明示指定は永続値より優先」/ ADR-002 | 3, 4 |
| AC-4 | SavedView 適用（`viewId` あり・URL に display 無し）時は view.displayMode が永続値より優先される（既存 redirect 経路を変えず成立） | Issue「SavedView との優先順位」/ ADR-002 | 4 |
| AC-5 | 永続値の適用・モード切替のいずれも loader を再実行しない（#219 維持。`homeLoaderDeps` の display 除外を変えない） | Issue「#219 整合」/ ADR-003 | 1, 4 |
| AC-6 | 永続値が list 以外でも React の hydration mismatch 警告が出ない（サーバーは既定 list を描画、mount 後に差し替え） | Issue/ADR-004 | 3, 4 |
| AC-7 | localStorage が利用不可（throw / 不正値）の環境でもクラッシュせず既定 list にフォールバックする | ADR-001 | 2, 3 |

## スコープ

### 含まれないもの
- **cookie / サーバー永続（ユーザー設定）での永続化** — ADR-001 で localStorage を採用。ドメイン変更は行わない。
- **SavedView 由来・URL 由来の表示モードの永続化** — ADR-005 によりユーザーの明示選択のみ保存。
- **`SaveViewDialog.tsx` の実効モード化** — `SaveViewDialog.tsx`（L48 で `homeRoute.useSearch({ select: selectDisplay })` を使用）は `selectDisplay`（URL 素直値）を**維持し、永続値オーバーレイ（`useEffectiveDisplayMode`）を適用しない**。理由: SavedView 保存は明示的な URL 状態を保存する操作であり、端末ローカルの前回値を焼き付けるのは ADR-005 の意図に反する（URL 無指定 + 永続値 calendar の状態で「保存」した SavedView に意図せず calendar が焼き付くのを防ぐ）。**実装は変更なしで正しい**（記述漏れの是正のみ）。
- **P30 や公開一覧など home 以外の表示モード永続化** — `DisplayModeSwitch` / `NoteListViews` は home route 専用（`getRouteApi("/_app/")` ハードコード）。波及はフォローアップ。
- **端末間同期** — localStorage は端末ローカル（仕様として許容）。
- **永続値を URL に書き戻す** — ADR-002/003 により URL は汚さない。

## 調査結果

- 関連ファイル:
  - `app/routes/_app/index.tsx` — home route。`homeLoaderDeps` が `display` を deps から除外（#219）。loader は URL の display を server fn に転送し SavedView redirect 判定（`shouldRedirectForSavedView`）にのみ使用。**本 Issue では変更しない。**
  - `app/components/note/list/DisplayModeSwitch.tsx` — "use client"。`select(mode)` で `router.navigate({ to:"/", replace:true, search: prev => homeSearchUpdater(prev,{display:mode}) })`。ここに永続化書き込みを足す（ステップ 2）。
  - `app/components/note/list/NoteListViews.tsx` — "use client"。`homeRoute.useSearch({ select: selectDisplay })` で display を読みビュー切替。実効モード算出を新フックに置き換える（ステップ 4）。
  - `app/components/note/list/listSelectors.ts` — `selectDisplay = (s) => s.display ?? "list"`。永続値オーバーレイ用に「URL 値そのまま（undefined 可）」を返す薄い selector を追加（ステップ 3）。`shouldRedirectForSavedView` / `viewQueryToSearch` は変更しない。
  - `app/components/note/list/SaveViewDialog.tsx` — L48 で `homeRoute.useSearch({ select: selectDisplay })` を使い「ビューとして保存」時の `displayMode` を URL から読む。`selectDisplay`（URL 素直値）を**据え置き**、実効モード化しない（スコープ「含まれないもの」参照）。
  - `selectDisplay` の現状利用箇所は `DisplayModeSwitch` / `NoteListViews` / `SaveViewDialog` の 3 箇所。実効モードへ揃えるのは前 2 つ、`SaveViewDialog` は据え置き。
  - `app/components/note/list/homeSearch.ts` — `homeSearchUpdater`。変更不要。
  - `app/components/note/constants.ts` — `DISPLAY_MODES` / `DisplayMode`。値の検証に使う。
  - `app/components/note/list/CalendarView.tsx` — `typeof Intl !== "undefined"` ガードでクライアント環境差を render 内から読む既存の流儀（ADR-004 の割り切りの先例）。
  - `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx` — `@tanstack/react-router` を mock し navigate 契約を pin。localStorage 書き込みのテストを追加（ステップ 6）。
  - `app/routes/__tests__/index.loaderDeps.test.ts` — `homeLoaderDeps` の display 除外を pin。**壊さないこと。**
- あるべきアーキテクチャ（CLAUDE.md / #219）: `display` は「純粋なクライアント描画の関心事で usecase に到達しない」。表示モードの永続化はフロントエンド / クライアント描画の関心事であり、ドメイン / ユースケース / アダプター層には影響しない。クロスカット（localStorage アクセス）は SSR セーフな薄いモジュールに閉じ込め、コンポーネントは純粋に保つ。
- 既存実装の状態: 永続化は未実装。localStorage / cookie による UI 設定永続化パターンは**プロジェクトに存在しない**（grep 確認済み）。本 Issue が新規パターンを導入する。`display` は現在 URL ⇔ クライアント render の往復のみで管理されており、永続層を足すだけで他レイヤーへの波及はない。
- 依存関係: home route のクライアントコンポーネント群（`DisplayModeSwitch` / `NoteListViews`）のみ。サーバー / loader / DTO / ドメインへの影響なし。

## 設計

### ドメインモデルへの影響
なし。`display` は #219 で usecase に到達しないクライアント描画の関心事と位置づけ済み。ADR-001 で localStorage を採用したため、エンティティ・値オブジェクト・ポート・スキーマいずれも変更しない。

### ユースケース / アプリケーションロジック
なし（同上）。

### アダプター / 永続化 / 外部連携
ブラウザ localStorage への薄いラッパを新設するのみ。これは「クライアント描画の関心事の端末ローカル永続」であり、ヘキサゴナルのアダプター層（サーバー側の外部リソース）とは別物。`app/components/note/list/` 配下に閉じ込める。

### UI / プレゼンテーション
- 新規: `app/components/note/list/displayPreference.ts` — SSR セーフな read/write ラッパ（ADR-001）。
- 新規: `app/components/note/list/useEffectiveDisplayMode.ts` — URL 値 + 永続値オーバーレイで実効モードを返すクライアントフック（ADR-004）。
- 変更: `DisplayModeSwitch.tsx` — select 時に `writeDisplayPreference(mode)` を呼ぶ（ADR-005）。current の算出も実効モードフックに揃える（segmented の active 表示が初期表示と一致するように）。
- 変更: `NoteListViews.tsx` — `selectDisplay` の代わりに `useEffectiveDisplayMode()` を使う。
- 変更: `listSelectors.ts` — URL の `display` を素通し（`undefined` 可）で返す selector を追加。

## 実装ステップ

依存方向の順（純粋ロジック → フック → コンポーネント → テスト）に並べる。内側レイヤー（domain/application/adapter/loader）への変更は無い。

### 1. URL display の素通し selector を追加（純粋ロジック）

- **対象ファイル:** `app/components/note/list/listSelectors.ts`
- **変更内容:** 既存の `selectDisplay`（`?? "list"` で既定に倒す）は残しつつ、永続値オーバーレイ用に URL の `display` をそのまま返す selector を追加する。例: `selectDisplayRaw = (s: { display?: DisplayMode | undefined }): DisplayMode | undefined => s.display`。`shouldRedirectForSavedView` / `viewQueryToSearch` は一切触らない。
- **理由:** 実効モードフック（ステップ 3）が「URL に display があるか / 無いか」を判定して永続値を適用するか決めるため、`?? "list"` で潰す前の生値が必要。`useSearch` の referential-equality を壊さないよう単純な値返しに留める。

### 2. localStorage SSR セーフラッパを新設

- **対象ファイル:** `app/components/note/list/displayPreference.ts`（新規）
- **変更内容:**
  - `const DISPLAY_PREFERENCE_KEY = "hollow3:noteList:display"`。
  - `readDisplayPreference(): DisplayMode | undefined` — `typeof window === "undefined"` で早期 `undefined`。`try { const v = window.localStorage.getItem(KEY) } catch { return undefined }`。値が `DISPLAY_MODES` に含まれなければ `undefined`。
  - `writeDisplayPreference(mode: DisplayMode): void` — 同様に SSR / throw ガード。`DISPLAY_MODES.includes(mode)` を満たす値のみ書く。
  - ライブラリレベル JSDoc に「なぜ localStorage か（#650 ADR-001）」「SSR / プライベートブラウジングで throw しうるためガード必須」の WHY を残す。
- **理由:** ADR-001。localStorage アクセスの全分岐（SSR・throw・不正値）を 1 箇所に閉じ込め、コンポーネントを純粋に保つ。

### 3. 実効表示モードフックを新設

- **対象ファイル:** `app/components/note/list/useEffectiveDisplayMode.ts`（新規）
- **変更内容:**
  - `"use client"`。
  - `homeRoute.useSearch({ select: selectDisplayRaw })` で URL 値（`DisplayMode | undefined`）を取得。
  - URL 値が定義済みなら**それをそのまま返す**（永続値・hydration の論点なし。ADR-002 の (1)(2)）。
  - URL 値が `undefined` のときのみ永続値オーバーレイ: `const [persisted, setPersisted] = useState<DisplayMode | undefined>(undefined)`、`useEffect(() => { setPersisted(readDisplayPreference()); }, [])`。初回レンダーは `undefined` → 実効 `"list"`（= サーバーと一致、hydration mismatch なし。ADR-004 / AC-6）。mount 後に永続値で再レンダー。
  - 実効値: `urlDisplay ?? persisted ?? "list"`。
  - ライブラリレベル JSDoc に優先順位（#650 ADR-002）と hydration 回避（ADR-004）の WHY を記す。
- **理由:** ADR-002/003/004。URL/SavedView 明示指定の優先・loader 非干渉・hydration 回避を 1 フックに集約し、`NoteListViews` と `DisplayModeSwitch` の current 表示を一致させる。

### 4. `NoteListViews` を実効モードフックに切り替え

- **対象ファイル:** `app/components/note/list/NoteListViews.tsx`
- **事前確認:** 実装前に `grep -rn selectDisplay app/` を実行し、実効モードへ揃えるべき箇所の漏れを再確認する（現状は `DisplayModeSwitch` / `NoteListViews` / `SaveViewDialog` の 3 箇所。`SaveViewDialog` はスコープ「含まれないもの」のとおり据え置き）。`HomePage` 側の display 参照やツールバーのモード依存分岐など、想定外の実効モード依存箇所が無いことを確認する。
- **変更内容:** `const display = homeRoute.useSearch({ select: selectDisplay })` を `const display = useEffectiveDisplayMode()` に置き換える。残り（`isLoading` の dim 処理・ビュー分岐）はそのまま。
- **理由:** AC-2/3/4/6。永続値の適用点。loaderDeps には一切触れないため #219 維持（AC-5）。

### 5. `DisplayModeSwitch` で選択時に永続化 + 2 つの関心を分離する

このステップでは **2 つの異なる関心を明確に切り分ける**。混同すると URL と表示がズレる（arch [P-001]）。

- **(A) navigate / 書き込みの要否判定 = URL の生 display 値ベース**
- **(B) segmented の active 表示 = 実効モードベース**

- **対象ファイル:** `app/components/note/list/DisplayModeSwitch.tsx`
- **変更内容:**
  - **(A) navigate 要否ガード（URL 生値）:** 早期 return ガード（現状 `if (mode === current) return;`）の比較対象を、**URL の生 display 値**（`homeRoute.useSearch({ select: selectDisplayRaw })`、`DisplayMode | undefined`）にする。これは「URL を実際に変える必要があるか」で判定するため。`selectDisplayRaw(s) === mode` のときだけ early return し、それ以外は `router.navigate(...)` を呼ぶ。`select(mode)` 内で `router.navigate(...)` と並べて `writeDisplayPreference(mode)` を呼ぶ（ADR-005 / AC-1）。
  - **(B) segmented の active 表示（実効モード）:** active 判定に使う `current` には `useEffectiveDisplayMode()` を使う（URL 無指定 + 永続値ありのとき active が初期表示モードと一致するように）。
  - **WHY 分離するか:** early return に実効モード（`useEffectiveDisplayMode()`）を使うと、「URL 無指定・永続値 calendar」で `current === "calendar"` になり、URL にはまだ `display` が無いのに calendar クリックが early return して URL が更新されず、URL と表示がズレるバグになる（例: tile を経由して calendar に戻すと URL の `display` が tile のまま残る）。navigate 要否は URL 生値、active 表示は実効モードと、参照する値を分けることでこのズレを防ぐ。
  - 既存の URL-only navigation 契約（`replace:true` / `homeSearchUpdater`）・aria 契約は維持。
- **理由:** AC-1 / arch [P-001]。書き込みは URL 更新と同じ同期パスに乗せるだけで loader には触れない（AC-5 維持）。active 表示を実効モードに揃えないと「永続値で calendar 表示なのに segmented は list がアクティブ」というズレが出る一方、navigate 要否を実効モードで判定すると URL と表示がズレるため、両者を分離する。

### 6. テスト追加・更新

- **対象ファイル:**
  - `app/components/note/list/__tests__/displayPreference.test.ts`（新規） — read/write の SSR ガード・throw 耐性・不正値 → undefined・round-trip を検証（AC-7）。happy-dom 環境。
  - `app/components/note/list/__tests__/useEffectiveDisplayMode.test.tsx`（新規） — (a) URL display ありはそれを返し永続値を無視（AC-3）、(b) URL 無し + 永続値ありは mount 後に永続値（AC-2）、(c) 初回レンダーは "list"（hydration 整合・AC-6）、(d) URL 無し + 永続値無しは "list"。`@tanstack/react-router` を既存テストと同じ要領で mock し localStorage をスタブ。
  - `app/components/note/list/__tests__/NoteListViews.test.tsx`（更新） — ステップ 4 で `NoteListViews` が `homeRoute.useSearch` を直接呼ばず `useEffectiveDisplayMode()` 経由になるため、現行の `useSearch({ select })` 直接スタブでは `display` を制御できなくなる。`useEffectiveDisplayMode` 導入後も list/tile/calendar 分岐（および undefined→list / notes forward）が検証できるよう mock を調整する。方針: **`useEffectiveDisplayMode` フックを直接 mock して各モードを注入する**か、**URL 値 + localStorage スタブで実効モードを制御する**。どちらでも可だが、フック直接 mock のほうが分岐検証が単純で推奨。
  - `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx`（更新） — 既存の navigate 契約に加え、select 時に localStorage キーへ書き込まれることを検証（AC-1）。`useEffectiveDisplayMode` 導入に伴う mock 調整（`getRouteApi().useSearch` の select 関数互換を確認）。テスト方針: **`useEffectiveDisplayMode` は実コードのまま通し、happy-dom の `window.localStorage` スタブで初期値を制御する**（arch [S-004]）。navigate 要否ガードが URL 生値ベース・active 表示が実効モードベースで分離されている（ステップ 5）ことも併せて検証する。
  - `app/routes/__tests__/index.loaderDeps.test.ts`（確認のみ・変更なし） — display 除外が維持されること（AC-5）を回帰で担保。
- **理由:** 受け入れ基準を検証可能にする。`docs/test.md` の層分割（フロントは fake/happy-dom で純粋ロジック・フックを単体検証）に従う。

### 7. 仕上げ

- **対象:** リポジトリ全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実行。`pnpm test:unit` で新規・更新テストが通ることを確認。
- **理由:** CLAUDE.md の必須後処理。

## 設計判断

詳細は `.issue/650/adr.md` を参照。

- ADR-001: 永続化先は **localStorage**（cookie / ユーザー設定は不採用）。内側レイヤーへの影響ゼロ、`display` のクライアント描画の関心事という位置づけと整合。
- ADR-002: 優先順位 **URL `?display=` > SavedView displayMode > 永続値 > 既定 list**。永続値は URL を書き換えず、URL 無指定時のみオーバーレイ。SavedView 優先は既存 redirect 経路で自動成立。
- ADR-003: **#219 整合** — `homeLoaderDeps` 不変、永続値適用も書き込みも loader に触れない。
- ADR-004: **hydration mismatch 回避** — サーバーは既定 list を描画、`useEffect` で mount 後に永続値へ差し替え。list 以外の初期表示で 1 フレームのフラッシュは許容（`CalendarView` のクライアント差許容と同等の割り切り）。
- ADR-005: **保存タイミング** — `DisplayModeSwitch` の select 時のみ（ユーザー明示選択のみ永続化。SavedView/URL 由来は永続化しない）。

## リスクと注意点

- 新規パターン（localStorage UI 永続化）の初導入。ラッパに閉じ込めて他箇所が直接 localStorage を触らない規律を保つこと。今後の同種要求はこのモジュールを拡張する。
- hydration mismatch: 初回クライアントレンダーを必ずサーバーと同じ既定 list に倒すこと。`useState(readDisplayPreference())` のように初期化子で localStorage を読むと SSR/CSR で値が割れて警告が出るため、必ず `useState(undefined)` + `useEffect` 後適用にする。
- フラッシュ: URL 無指定 + 永続値 list 以外で 1 フレームのちらつきが残る。ADR-004 で許容と判断済みだが、レビュー時に体感を確認する。
- `useEffectiveDisplayMode` の `useSearch` selector は referential-equality を壊さない単純値返しに保つ（不要な再レンダー防止）。
- `DisplayModeSwitch.test.tsx` の既存 mock は `useSearch({ select })` を直接呼ぶ簡易スタブ。フック導入後も互換が保たれるか確認し、必要なら localStorage スタブを足す。

## テスト方針

- `displayPreference.ts`: SSR ガード（`window` 未定義）・throw 耐性・不正値除去・round-trip（happy-dom 単体）。
- `useEffectiveDisplayMode.ts`: URL 優先 / 永続値オーバーレイ / 初回 list / 既定 list の 4 ケース（happy-dom + react mock）。
- `NoteListViews`: `useEffectiveDisplayMode` 経由で list/tile/calendar 分岐が描画されることを検証（フック直接 mock 推奨。coverage [P-001]）。
- `DisplayModeSwitch`: 既存 navigate 契約維持 + select 時 localStorage 書き込み（AC-1）。`useEffectiveDisplayMode` は実コードのまま通し localStorage スタブで制御（arch [S-004]）。
- `homeLoaderDeps`: 既存テストで display 除外維持を回帰確認（AC-5、変更なし）。
- **AC-1 の検証は 2 つに書き分ける（coverage [S-001]）**: (1)「キー書き込み」= `DisplayModeSwitch.test.tsx`（select 時に `hollow3:noteList:display` へ書き込まれること）、(2)「list/tile/calendar の round-trip」= `displayPreference.test.ts`（各値が `DISPLAY_MODES` バリデーションを通って正しく read/write される）。前者は書き込み点、後者は値ごとの永続性を保証する。
- **AC-4（SavedView 優先）と `useEffectiveDisplayMode.test.tsx` ケース (a) の対応（coverage [S-002]）**: AC-4 は「`viewId` あり時は既存 redirect で URL に display が乗る → 永続値オーバーレイは URL 無指定時のみ発火 → 発火せず view.displayMode が優先」という間接成立。これを能動的に検証するのがケース (a)「URL display あり → 永続値無視」であり、SavedView 文脈（AC-4）= redirect 後に URL display が乗った状態 = ケース (a) の前提と等価。新規テストは不要で、ケース (a) が AC-4 の不変条件を実質カバーする。
- 手動確認: 永続値あり/なし、URL `?display=` 明示、SavedView 適用の各初期表示を `pnpm dev` で目視（フラッシュ・mismatch 警告の有無）。

## レビュー履歴

### 1周目

**修正した点**:
- arch [P-001]: ステップ 5 で「navigate / 書き込み要否判定 = URL 生 display 値（`selectDisplayRaw`）と mode の一致」と「segmented の active 表示 = 実効モード（`useEffectiveDisplayMode()`）」の 2 つの関心を分離して記述。早期 return に実効モードを使うと URL と表示がズレるバグを WHY とともに明記。ADR-005 にも同分離を追記。
- coverage [P-001]: ステップ 6 の更新対象に `NoteListViews.test.tsx` を追加。`useEffectiveDisplayMode` 導入後も list/tile/calendar 分岐を検証できる mock 調整方針（フック直接 mock 推奨 / URL 値＋localStorage スタブ）を明記。
- coverage [P-002]: スコープ「含まれないもの」と調査結果に `SaveViewDialog.tsx`（L48 で `selectDisplay` 使用）は URL 素直値を維持し永続値オーバーレイを適用しないこと（実装変更なしで正しい）を明記。

**取り込んだ改善提案**:
- arch [S-001]: ADR-001 に「現状は home 専用ゆえ `note/list/` 配下に配置、P30/公開一覧へ横展開時は配置を見直す」を追記。
- arch [S-004]: テスト節に「`DisplayModeSwitch.test.tsx` は `useEffectiveDisplayMode` を実コードのまま通し localStorage スタブで制御」を明記。
- arch [S-005]: ステップ 4 に「実装前に `grep -rn selectDisplay app/` で実効モード依存箇所の漏れを再確認」を追加。
- coverage [S-001]: テスト方針で AC-1 の検証を「キー書き込み（`DisplayModeSwitch.test`）」と「list/tile/calendar の round-trip（`displayPreference.test`）」に書き分け。AC 表の AC-1 行にも反映。
- coverage [S-002]: AC-4（SavedView 優先）と `useEffectiveDisplayMode.test.tsx` ケース (a)「URL display あり → 永続値無視」の対応関係を補足。

**見送った提案とその理由**:
- arch [S-002][S-003]: いずれも「実現可能・問題なし」の確認系のため修正不要（メイン判断）。

**総括**: arch / coverage 両視点とも要修正（arch P-001 / coverage P-001・P-002）は本反映で解消。改善提案も全件取り込み済み。
