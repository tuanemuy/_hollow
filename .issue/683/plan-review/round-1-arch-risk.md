# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク

**対象:** Issue #683 / `.issue/683/plan.md` / `.issue/683/adr.md`
**視点:** プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
**日付:** 2026-06-13

レビュー観点 (1)〜(6) を実コードで検証した結果を記す。

#### 問題点（要修正）

問題点ゼロ。

計画・ADR の主要な技術的主張はすべて実コードで裏付けが取れ、CLAUDE.md の規約（presentation 層に閉じる／定数の hoist／既存慣用パターンへの追従）に沿っている。設計判断ファイルの記述（特に supersede の表現と RSC 再 suspend のメカニズム）も正確で、過剰な粗探しを要する破綻は見当たらなかった。下記は任意検討の改善提案のみ。

#### 改善提案（検討推奨）

- **[S-001]** ADR-001 の「#293 の決定を部分撤回（supersede）」という見出し表現を、本文どおり「de-facto 状態の方針転換」に統一すると、過去 ADR の読者の混乱を防げる
  - 理由: `.issue/293/adr.md` を全 ADR 見出し（ADR-001〜010）まで確認したが、「leaf route は `staleTime: 0` を基本とする」という**明示的な Decision は存在しない**。#293 が positively 決めたのは AppShell の `staleTime: Infinity`（ADR-008）・leaf の defensive `getCurrentUser` ガード（ADR-009）・`router.invalidate` 整理の別 Issue 化（ADR-010）であり、leaf の `staleTime: 0` は ADR 化されていない de-facto 値。plan.md の AC-9 と ADR-001 本文（28行目「de-facto」）は正しくこのニュアンスを捉えているが、ADR-001 の**見出し**と plan の一部記述（「#293 の決定を部分撤回」）が「#293 が明示決定した」かのように読める。`supersede` という語は厳密には「過去 ADR の Decision を置き換える」操作を指すため、「#293 に該当 Decision は無い／本 ADR で初めて leaf の staleTime 方針を明文化し de-facto 値を変更する」と書く方が #487 の supersede 記法（過去 ADR を破壊編集しない方式）と整合し、将来の読者が #293 を開いて該当 Decision を探して迷うことを防げる。実装ブロッカーではない。

- **[S-002]** `routeCache.ts` という新規モジュール名・配置を ADR に 1 行で正当化しておくと、`searchPeriod.ts` / `publicDateRange.ts` との並びの一貫性が明示できる
  - 理由: `app/components/public/` の既存 framework-free 定数モジュール（`searchPeriod.ts` / `publicDateRange.ts` / `schema.ts`）はいずれも「ファイル冒頭に WHY コメント＋`export const`」という型を持つ（`searchPeriod.ts` を確認）。`routeCache.ts` は配置・命名ともこの慣習に合致しており**問題ない**。ただし既存モジュールが「period facet」「date range」といったドメイン語彙の名前なのに対し `routeCache` は横断的関心事（キャッシュ方針）の名前で毛色がやや異なる。plan ステップ 4 は WHY コメント付与を明記済みなので実害はないが、ADR-002 に「単一定数のための focused module を `public/` 配下に置く根拠＝4 公開ルートが共有する唯一の調整点」と 1 行添えると、レビュアーが「なぜ `app/lib/` でなく `components/public/` か」を即判断できる。

- **[S-003]** (B) 公開ルートの「`gcTime` 超でクリーン再ロード＝フラッシュ無し」の主張に、実装後の手動確認手順を 1 つ固定で紐づけておくと安心度が上がる
  - 理由: 観点 (3) の検証。`gcTime: 60_000` 超の再訪は「キャッシュ破棄済み → loader を fresh 実行 → RSC ペイロード初回取得」となり、これは初回フルロードと同じ経路。plan の「補足（スコープ外）」が認める**初回フルロード時の per-section Suspense streaming** がここでも一瞬出る可能性があり、「背景再検証由来のフラッシュ」とは別物として残りうる。plan/ADR の論理（背景再検証は起きない＝ADR-001/002 で消したフラッシュは出ない）は正しいが、「`gcTime` 超再訪のスケルトン体験」と「初回フルロードのスケルトン」は同一現象なので、テスト方針の「(B) 60s 超でサーバー側更新が反映」確認時に「このときの per-section Suspense は初回ロード相当の別問題（スコープ外）」と明記しておくと、受け入れ判定で AC-2/AC-6 と混同しない。論理的破綻ではなく、観察結果の解釈ブレ防止。

#### 良い点

- **観点 (1)** 定数の置き場所: `PUBLIC_ROUTE_GC_TIME` を `app/components/public/routeCache.ts` に置く判断は、既存の `searchPeriod.ts` / `publicDateRange.ts` / `schema.ts`（いずれも `export const` を持つ framework-free public モジュール）の慣習と一致しており、CLAUDE.md「定数は 1 箇所に hoist」「focused module」の方針に正しく沿っている。`app/lib/`（全レイヤー共有の構造プリミティブ）でなく presentation 寄りの `components/public/` に置くのも、本定数が「公開ルートの presentation 関心事」である以上適切。

- **観点 (2)** 親ルート直交性: `app/routes/_app/route.tsx:82` が既に `staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY` であることを確認。leaf を同値化しても #293 ADR-008 の「初回 1 RPC・以降 SPA 遷移 0 RPC」前提は崩れず、親子の staleTime は独立に各 match の再検証要否を決めるため副作用は無い。plan の「直交」主張は正確。

- **観点 (3)** 公開ルートの gcTime 設計: 「有限 staleTime は再訪で背景再検証＝RSC 再 suspend を招きフラッシュを先送りするだけ」「`Infinity` + `gcTime` 60s で gcTime 内=キャッシュ再利用・gcTime 超=クリーン再ロード（背景再検証ではない）」という ADR-002 の論理は TanStack Router の staleTime/gcTime セマンティクスとして正しい。匿名閲覧者に invalidate 経路が無い（mutation しない）ため `gcTime` で陳腐化を bound する必要があるという問題設定も妥当。

- **観点 (4)** SavedView リダイレクト: `app/routes/_app/index.tsx` の `shouldRedirectForSavedView` → `throw redirect` は **loader handler 内**にあり（76-81行）、loader は cache-miss（初回 / `loaderDeps` 変化）で必ず実行される。`staleTime` は「既にキャッシュ済みの deps 組み合わせを再訪時に再実行するか」だけを制御するため、`Infinity` 化してもリダイレクトの発火条件（初回 `viewId` 到達時のキャッシュミス）は不変。`display` は `homeLoaderDeps` で deps から除外済み（#219、`index.loaderDeps.test.ts` で contract 固定済み）で staleTime と直交。AC-5 の「初回ロードで従来どおり発火」は成立する。

- **観点 (5)** supersede 表現: 「`.issue/293/adr.md` 本体を破壊編集せず、`.issue/683/adr.md` 側で supersede を宣言」は #487 で確立済みの追記方式に合致。過去 ADR を不変に保つ慣習を尊重している（表現の精緻化は S-001 参照）。

- **観点 (6)** 見落とし依存・副作用の網羅: 徹底確認したが重大な漏れは無い。
  - admin mutation の `routerInvalidate` 配線: DesignTokensForm / RegistrationForm / LLMSettingsForm / UsersTable / PromptsForm の 5 コンポーネントすべてで `routerInvalidate` import を確認（AC-12 充足）。(A) 群への組み入れは安全。
  - `loaderDeps` による fresh fetch: `search.tsx`（`({search}) => search`）・`u/$username/index.tsx`（`display` 除外の deps）ともに、検索/ページング/フィルタの param 変化で deps が変わり fresh fetch される。`staleTime: Infinity` 化は「同一 deps の再訪キャッシュ」だけを保持するので、param 変化時の再取得は阻害しない。
  - editor 除外との非干渉: `routerInvalidate.ts` の `EDITOR_ROUTE_IDS` 除外（#669 ADR-003）は editor が `staleTime: 0` であることを invariant として明記（28-29行コメント）。plan は editor 系（new/edit）を ⛔ 据え置きにしており、この invariant を壊さない。
  - ライブ要件ルート（ダッシュボード/メトリクス/ジョブ進捗/エクスポート進捗）の据え置きも明示され、誤って Infinity 化しない旨をリスク欄に記載済み。

- **検証の質**: plan「既存実装の状態」表の現状 staleTime 値（A 群 12 本 + フォーム 3 本 = `0`、search/u-index = `0`、noteSlug/notes-public = `10_000`、about/terms/privacy = `60_000`）を全 22 ルートで実コードと突合し、**全件一致**を確認した。計画の事実認識に乖離が無い。

- 変更が presentation 層（ルート設定の 1 行リテラル）のみに閉じ、domain/application/adapter に一切触れない点が CLAUDE.md の hexagonal 方針と整合。テスト方針も「loader ロジックは不変なので既存テストは壊れない／過剰なテストは足さない」と適切な粒度。
