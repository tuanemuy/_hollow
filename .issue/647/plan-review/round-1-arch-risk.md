# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク

**対象:** `.issue/647/plan.md` / `.issue/647/adr.md`
**視点:** プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
**日付:** 2026-06-14

---

## 総評

計画はレイヤーの内側（observability は cross-cutting concern → `Logger` ポート）から正しく考えられており、CLAUDE.md の「Keep cross-cutting concerns behind ports」「Input validation は transport 境界と value-object 構築の2点」「client→server は server fn が正規導線」「不要な application 抽象を増やさない」という規約に忠実。ADR 4本も each トレードオフが明示され、過剰設計（APM/metrics 集計・request-ID 基盤）を正しくスコープ外に切っている。実装ファイルの配置・既存パターン（`logServerError` と同型、`action.ts` 慣習）の踏襲も妥当。Issue の要件（AC-1〜AC-6）を満たす設計になっている。

問題点（要修正）として挙げるのは、**実現可能性に関わる技術的詰めの甘さ**が中心であり、設計方針そのものへの異議ではない。

---

#### 問題点（要修正）

- **[P-001]** 報告 server fn の client からの呼び出し方法が「直接呼び出し」想定だが、クラスコンポーネント内での呼び出し可否・`useServerFn` 不使用の妥当性が計画で詰められていない
  - 理由: 既存の client→server 呼び出しは全て関数コンポーネントで `useServerFn(fn)`（`UserMenu.tsx` / `NoteActions.tsx` 等）を経由している。一方 `Boundary` は class component であり hooks を使えないため `componentDidCatch` 内で `useServerFn` は呼べない。計画は `void reportSectionFailure(payload).catch(() => {})`（直接呼び出し）を想定しているが、`useServerFn` を経由しない直接呼び出しが本プロジェクトの実コードに前例がない（grep した限り全 client 呼び出しが `useServerFn` 経由）。`createServerFn` は isomorphic で、`useServerFn` は主にルーターコンテキスト注入（redirect 追従）のためのラッパーなので、redirect を扱わない fire-and-forget 報告なら直接呼び出しで動作する見込みだが、これは前例のない経路であり「想定どおり動く」保証が計画段階で確認されていない。
  - 提案: (a) `componentDidCatch` を持つ class `Boundary` ではなく、`SectionErrorBoundary`（関数コンポーネント）側で `useServerFn(reportSectionFailure)` を取得し、`onCatch` コールバック（計画でも好ましいとされている注入形）経由で class へ渡す設計を明記する。これなら既存の `useServerFn` 慣習に完全に乗る。(b) もし直接呼び出しを採るなら、「`useServerFn` を経由しない直接 RPC 呼び出しが client で成立すること」を実装ステップで明示的に検証項目に加える。現状の計画ステップ2は「`reportSectionFailure(...)` を fire-and-forget で投げる関数を渡す」とだけ書かれ、取得経路（hook か直接 import か）が曖昧。

- **[P-002]** 報告 server fn のテスト可能性・モック方法が計画に欠落しており、既存テストハーネスとの整合が未確認
  - 理由: 既存の client server fn テストは `app/components/_test-utils/serverFnMock.ts` で `createServerFn` チェーンをモックし、各 `*.test.tsx`（例 `UserMenu.test.tsx` は `logOutFn: logOutMock` で `vi.mock`）で fn 自体を差し替えている。計画のステップ4は「報告 fn（mock）が section/scope/path 付きで1回呼ばれること」を検証するとあるが、`SectionErrorBoundary.test.tsx` は現状 `createRoot` + happy-dom で `@tanstack/react-router` のみ `vi.mock` している。報告 fn を import すると `createServerFn` チェーンが module top-level で評価されるため、`serverFnMock` 相当のモックを test 側に追加する必要がある。この依存が計画に書かれておらず、「既存テストが不変で通る」という AC-6 の前提（テストファイル拡張で新規 import が増える）と整合確認が甘い。
  - 提案: ステップ4に「`sectionFailureReport` モジュールを `vi.mock` し（`serverFnMock` パターン踏襲）、報告 fn を spy で差し替える」「class へ報告経路を注入する設計（[P-001] の (a)）なら `onCatch` を直接 spy で渡せてモックが不要になり、よりテストしやすい」ことを明記する。テスト容易性の観点でも [P-001] の (a)（注入形）が優位。

- **[P-003]** `componentDidCatch` で `window.location.pathname` を読む前提だが、サーバー側ログとの突き合わせ（AC-4）で使う `path` の意味論が route path と一致しない可能性
  - 理由: 計画は発生位置として `window.location.pathname`（client）を送り、サーバー側の RSC 原エラー（`console.error`）と「route path」で突き合わせるとする。しかし RSC 原エラーは stream を返した**ナビゲーション時点の URL**で出る一方、`componentDidCatch` 報告の `window.location.pathname` は**境界が catch した時点の URL**。SPA 遷移途中・retry 後の再 throw・遷移直後の境界 catch では両者がズレうる。AC-4 の相関は「route path 一致」を主キーの一つにしているため、pathname のタイミング依存は相関の信頼性を直接損なう。さらに `pathname` はクエリ・動的セグメント（`/notes/$noteId`）の実値を含むため、ログに note ID 等の実 path が乗る＝redaction 前提（最小情報のみ）とわずかに緊張する。
  - 提案: (a) `path` の取得タイミングを「境界 mount 時点で固定」する（catch 時点ではなく、props として親が確定 path を渡すか、初回レンダー時にキャプチャ）方が原エラーの URL と揃いやすい。(b) ログに乗せる `path` は raw pathname ではなく、相関に足る粒度（route pattern / pathname のままでも良いがその判断を ADR-003 に明記）に揃える方針を決める。最小情報原則と相関精度のトレードオフを ADR-003 に1行追記したい。

#### 改善提案（検討推奨）

- **[S-001]** ログレベル `warn` の選択は妥当だが、`errorResponseMiddleware.logServerError` が `kind: "system" | "unknown"` のみ `error` で出している既存ポリシーとの「観測上の見え方」を運用ドキュメントで対比させると良い
  - 理由: 運用者は Workers Logs で `error` を主に追う。セクション失敗は `warn` で出るため、`error` だけ見ていると見落とす。ADR-001 の「`warn`（局所失敗）」判断は正しいが、`docs/runtime_cloudflare.md`（ステップ5）に「セクション失敗は `warn`/`kind: "section_failure"` で出る（`error` ではない）」と明記し、突き合わせ手順のクエリ例に level も含めると運用が確実になる。

- **[S-002]** `kind: "section_failure"` という meta キー名が、既存の `SerializedError` の `kind` 語彙（`system`/`unknown`/`validation` 等、`*ErrorCode` 命名規約に紐づく）と衝突的に見える
  - 理由: `errorResponseMiddleware` は `meta` に `kind`（SerializedError の kind）と `code` を入れる規約。報告ログの `kind: "section_failure"` は SerializedError の kind 列挙ではない別概念だが、同じ `kind` キー名・同じ `lower_snake_case` 値形式を使うため、ログ消費側で両者を混同しうる。CLAUDE.md の `*ErrorCode` 命名規約（kind/code は SerializedError 由来）とは別物であることを意図的に区別したい。
  - 理由（続き）: 機能上は問題ないが、`event: "section_failure"` や `kind: "client_section_failure"` 等、SerializedError の kind と区別できる命名にするか、少なくとも ADR-001 に「この `kind` は SerializedError の kind とは別の観測タグ」と1行注記すると、将来ログをパースする際の混乱を防げる。

- **[S-003]** フラッディング抑止が「同一 section+resetKey の連続報告を1回に丸める」インスタンスローカル方式だが、複数の独立境界が同時多発で落ちるケース（全画面のデータ層障害等）への上限がない
  - 理由: 計画でもサーバー側レート制限を持たないことは明記済み（リスク欄）で、最小実装としては妥当。ただし1ページに多数の `SectionErrorBoundary` があり（home の toolbar/list/sidebar 等）、バックエンド全断時に各境界が1回ずつ＝十数件の POST が同時に飛ぶ。AC-5 の「フラッディングしない」は満たすが、`section` 単位の重複抑止のみでは「同時多発の総量」は抑えられない。完全自動抑止はスコープ外で良いが、ペイロード上限（スキーマ）＋ `warn` レベルで1件あたりコストが小さいことが緩和策である旨を、リスク欄の現記述に加えて「1ページあたりの上限件数 = 境界数で bounded」と明記すると、運用判断の材料になる。

- **[S-004]** `scope` enum を `["page","shell"]` でスキーマ検証する設計は良いが、`SectionErrorBoundary` の `scope` prop は `scope?: Scope`（デフォルト `"page"`）であり、報告 payload 構築時に default 解決済みの値を送ることをステップ2で明示すると、スキーマの `z.enum` が undefined を弾く事故を防げる。
  - 理由: client 側で `scope ?? "page"` を解決してから送る必要がある（`SectionErrorBoundary` のデフォルトは関数引数デフォルトなので、class へ渡す経路次第で undefined が漏れうる）。些細だが [P-001] の注入経路設計と一緒に固めると安全。

#### 良い点

- 観測を `Logger` ポートに乗せ、専用 sink・新規ポート・usecase・ドメイン概念を一切作らない判断（ADR-001/002/004）は CLAUDE.md の cross-cutting concern 規約と over-engineering 回避原則に完全に合致。`errorResponseMiddleware.logServerError` と同型に揃えた点が一貫性として優秀。
- 報告受け口を presentation 層の transport 受け口と位置づけ、`inputValidator(validateInput(schema))` で transport 境界検証を必須化（ADR-004 / ステップ1,3）。CLAUDE.md「Input validation は2点」「外部入力は schema 検証」に正しく従っている。zod で長さ上限・enum を厳格化し DoS/ログ汚染を防ぐ意図も明確。
- `componentDidCatch` を fire-and-forget（`void report().catch(() => {})`）にし、`render`/fallback/a11y を不変に保つことで AC-6（既存 UX/a11y 契約不変）を構造的に守る設計。報告失敗が UI を壊さない不変条件を型・実装両面で担保しようとしている。
- 相関の弱さ（client 報告が別 POST で `cf-ray` 一致しない）を ADR-003 で正直に直視し、「時刻近接＋route＋section の人手照合」に留めて完全自動トレーシングをスコープ外に切った判断は、Issue 範囲（最小情報の構造化ログ化）に対して適切。`server.cloudflare.ts` が RSC stream の `onError` をカスタムせずフレームワーク既定 `console.error` に委ねている実体も正しく把握している。
- `componentDidCatch` が SSR で発火しない React 仕様を理解し、本 Issue 対象が「streaming 後に client 境界へ届く失敗」であることと整合している点（リスク欄末尾）。スコープの自己認識が正確。
- `getContainer()` が client-graph safe（`containerStore.ts` 注記）で、handler 内で直接呼べることを正しく把握。報告 POST も `app/server.cloudflare.ts` の `storage.run` 内を通るため ALS スコープが確立し、`getContainer()` が request scope を解決できる（別 POST でも fetch handler 経由なので成立）— この前提は技術的に妥当。
