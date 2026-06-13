# 実装計画 — Issue #647: SectionErrorBoundary で捕捉したセクション失敗を本番で観測可能にする

**Issue:** #647
**作成日:** 2026-06-14
**複雑度:** 中〜大規模

---

## 目的

`SectionErrorBoundary`（client）が捕捉した RSC ストリーミングのセクション失敗を、本番でも観測できるようにする。クライアントから送れるのは redaction 前提の最小情報（セクション名＋発生位置）だけなので、それをサーバー側ログへ流し、同一リクエストで既に出ているサーバー側の原エラーログと突き合わせて追える設計にする。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `SectionErrorBoundary` に `componentDidCatch` が実装され、境界がエラーを捕捉したときにサーバーへ報告が送られる | Issue やること1 | ステップ2, 3 |
| AC-2 | 報告にはセクション名＋発生位置（route path）＋発生回数程度の最小情報のみが含まれ、redact 済みエラー詳細（message/stack/error）は送らない。テストで「送信ペイロードが許可キーのみで `message`/`stack`/`error` を含まない」ことを assert する | Issue「最小情報」「redaction 前提」 | ステップ1, 2, 4 |
| AC-3 | 報告がサーバー側で構造化ログ（既存 `Logger` ポート経由）として出力され、Cloudflare のログに `event`/`section` 相当のタグ付きで残る | Issue「構造化ログへ送る」 | ステップ3 |
| AC-4 | 報告ログと、サーバー側に既に出ている RSC 原エラーログを突き合わせる**手段**（時刻近接＋route path＋section 名による人手突き合わせ手順。`cf-ray` は別 POST のため主キーにしない）が成立し、`docs/runtime_cloudflare.md` にその手順と注記が書かれている | Issue「サーバー側ログとの突き合わせで追える設計」 | ステップ1, 3, 5 |
| AC-5 | 報告の多重送信（リトライ連打・StrictMode 二重 mount・境界の再 throw ループ）に対する重複抑止があり、ログがフラッディングしない。同一セクションの失敗回数（境界インスタンスの捕捉累積回数。捕捉ごとに +1 し、送信が丸められても増分する＝実送信回数ではない）を `count` としてペイロードに含め、テストで「2回目以降は `count` が増えること」を検証する | Issue「発生回数程度」＝最小情報として発生回数を送る／送りすぎない | ステップ1, 2, 4 |
| AC-6 | 既存の `SectionErrorBoundary` の UX（汎用文言・リトライ・fallbackHeading・resetKey・scope）と a11y 契約は不変。報告送信失敗が UI を壊さない | ADR-003 / 既存テスト | ステップ2, 4 |

## スコープ

### 含まれないもの
- フル APM / メトリクス集計基盤（ダッシュボード集計・時系列保存・アラート）。Issue は「最小情報を構造化ログへ送る」が核心であり、永続化・集計は過剰。既存 `admin/metrics` は DB 由来の利用量ダッシュボードで、イベント取り込み口ではないため、ここにセクション失敗を載せるのはドメイン概念・永続化の新設を伴い対象外（ADR-002 参照）。
- 全リクエストに横断する汎用 correlation-ID ミドルウェア基盤・機械的な自動相関（分散トレーシング）の新設（本 Issue では「時刻近接＋route path＋section 名」の人手突き合わせで成立させる。`cf-ray` は同一リクエスト内ログをまとめる補助に留め、報告が別 POST である以上 主キーにはしない。ADR-003 参照）。
- redact 済みエラー詳細（message/stack）をクライアントから送る経路。本番では無意味（redacted）であり、送ること自体が情報漏えい面でも非推奨。
- サーバー側での発生回数の集計・時系列保存。Issue「発生回数程度」は、境界インスタンスが観測した**発生イベントを最小情報（section + scope + path + その境界での累積 count）で都度送る**意味と解釈する。横断的な集計値の算出・保存はログ基盤側（Cloudflare Logs / 外部転送）に委ねる（ADR-002）。client が送る `count` はあくまで「その境界インスタンスで何回目の捕捉か」を示す局所カウンタであり、全境界横断の総回数ではない。
- server-fn の `errorResponseMiddleware` 経由で既に観測できる「通常のサーバー関数失敗」への変更（既に N-003 の対象外）。

## 調査結果

- 関連ファイル:
  - `app/components/common/SectionErrorBoundary.tsx` — 捕捉対象の本体。`Boundary`（class）は `getDerivedStateFromError` のみで `componentDidCatch` を持たず、現状ロギングはゼロ（N-003）。
  - `app/core/application/ports/logger.ts` — `Logger` ポート（`info/warn/error(message, meta?)`）と `ConsoleLogger`。`meta.cause` に原因を入れる規約。
  - `app/core/application/di/types.ts` / `serverCloudflare.ts` — DI コンテナが `logger: ConsoleLogger` を供給。`getContainer().logger` がサーバー側ログの唯一の正規 sink。
  - `app/core/application/di/containerStore.ts` — `getContainer()` は client-graph safe。`errorResponseMiddleware` もこれ経由で logger を取得している。
  - `app/core/presentation/errorResponseMiddleware.ts` — server-fn パイプライン全体の唯一の redaction 境界。`kind === "system" | "unknown"` のとき `logServerError` で `logger.error(... , { kind, code, message, cause })` を出している。**streaming 後の RSC エラーはここを通らない**（Issue の前提どおり）。
  - `app/core/presentation/serverAction.ts` / `validator.ts` — server fn の確立パターン（`createServerFn().middleware([errorResponseMiddleware]).inputValidator(validateInput(schema)).handler(...)`）。`validateInput` が transport 境界。
  - `app/components/*/action.ts`（例: `layout/action.ts` `logOutFn`、`export/ExportForm/action.ts`）— client から呼ぶ POST server fn の典型。`loadServerDeps` でコンテナ＋usecase を解決する。
  - `app/server.cloudflare.ts` — リクエストごとに `createRequestContainer` → ALS スコープ。RSC stream の error ハンドラ（`renderServerComponent` / `renderToReadableStream` の `onError`）はアプリ側でカスタムしておらず、フレームワーク既定（`console.error`）に委ねている。これが「サーバー側に既に出ている原エラーログ」の実体。
  - `app/components/common/__tests__/SectionErrorBoundary.test.tsx` — happy-dom + `createRoot` で境界挙動を検証する確立済みテスト。`console.error` を spy で握りつぶしている。
  - `docs/runtime_cloudflare.md` — 運用ドキュメント。ログの突き合わせ手順を追記する先。
- あるべきアーキテクチャ:
  - 観測（ロギング）は cross-cutting concern であり `Logger` ポートの背後に隠す（CLAUDE.md「Keep cross-cutting concerns … behind ports」）。専用エンドポイント／sink を新設するのではなく、既存ポートに乗せるのが正。
  - client → server の到達は server function（`createServerFn`）が正規の導線。透過な `@tanstack/react-start` の RPC を使い、`server-only` モジュールは handler 内 dynamic import で client graph に漏らさない（既存 `authGuard.ts` / `action.ts` の規約）。
  - transport 境界（client-posted payload）は `inputValidator(validateInput(schema))` で必ず検証する（CLAUDE.md「Input validation」）。本報告 payload も外部入力なのでスキーマ検証必須。
  - 報告 server fn は新規ドメイン概念・usecase を持たない「観測の transport 受け口」なので presentation 層相当の transport 受け口として `app/components/common/sectionFailureReport.ts` に置き（既存 `action.ts` 慣習＝client が呼ぶ POST fn はコンポーネント直下に同居）、`getContainer().logger` を直接呼ぶ（`errorResponseMiddleware` の `logServerError` と同型。ビジネスロジックではないため usecase 層は作らない）。client は `useServerFn` 経由で取得する（raw 直接 import しない＝B-001 規約）。
- 既存実装の状態:
  - `Logger` ポート・`getContainer()`・server fn パターンはすべて「あるべき姿」と一致。乖離は「`SectionErrorBoundary` にロギングフックが無い（N-003）」点のみ。これを Issue 範囲で埋める。
  - 相関基盤（request-ID）は未整備だが、Cloudflare では `cf-ray`（リクエスト単位の一意 ID）が全ログ行に自動付与され、同一リクエストのログを束ねられる。新規基盤を作らずこれを相関キーに使う（ADR-003）。
- 依存関係:
  - 影響範囲は `SectionErrorBoundary.tsx`（全主要画面が利用）＋新規 presentation report fn ＋ そのスキーマ。UX/レンダリングロジックは変えない。
  - `SectionErrorBoundary` は client component かつ多数の境界で多用されるため、報告送信は描画パスを一切ブロックしない fire-and-forget であること（`componentDidCatch` は副作用専用、`render` は不変）。

## 設計

レイヤーの内側から外側へ。client の `componentDidCatch` が「セクション名＋発生位置」をどこへ送り、それを presentation 層がどう受けてサーバー側ログ（`Logger` ポート）へ流すか、を責務に沿って設計する。

### ドメインモデルへの影響
なし。セクション失敗の「観測」は cross-cutting concern であり、ビジネス不変条件でもエンティティでもない。ドメイン／application のドメインロジックには一切手を入れない。新しいドメイン概念（SectionFailure エンティティ等）は作らない（Issue は最小情報のログ化が核心であり、永続化・集計は ADR-002 でスコープ外）。

### ユースケース / アプリケーションロジック
新規 usecase は作らない。`Logger` ポートは application 層が定義済みで、cross-cutting concern の正規の窓口。報告受け口は「ビジネス操作」ではなく「transport から logger への転送」なので usecase 化しない（`errorResponseMiddleware.logServerError` と同じ判断）。

### アダプター / 永続化 / 外部連携
なし。`ConsoleLogger`（Cloudflare では `console.*` → Workers Logs）をそのまま sink とする。新規アダプター・スキーマ・マイグレーションなし。

### UI / プレゼンテーション

1. クライアント側（`SectionErrorBoundary.tsx`）
   - **報告 fn の取得経路（arch P-001 確定）**: 既存コードは「hooks/components は raw server fn を直接 import せず必ず `useServerFn(...)` の戻り値を使う」という確立済み規約を持つ（`useEditLock.ts` の JSDoc「the hook never imports the raw server fns directly (PR #7 Round 1 Blocker B-001)」、`releaseLock` 等すべて `useServerFn` 経由）。class component の `componentDidCatch` 内では hooks を呼べないため、**関数コンポーネント `SectionErrorBoundary` 側で `useServerFn(reportSectionFailure)` を取得し、`onCatch` コールバックとして class `Boundary` へ注入する**。class は観測を一切知らないまま（`onCatch?.()` を呼ぶだけ）に保つ。これにより既存の `useServerFn` 慣習・wrapper のセッション/redirect 処理に完全準拠し、raw 直接呼び出しという前例のない経路を避ける。
   - 内部の `Boundary` class に `componentDidCatch(error, info)` を追加し、`this.props.onCatch?.()` を呼ぶだけにする（描画はブロックしない）。`SectionErrorBoundary` 側で `onCatch` を「section/scope/path/count を集めて `reportSectionFailure({ data })` を fire-and-forget で投げる」関数として渡す。
   - 送る情報は redaction 前提の最小情報のみ（section・scope・path・count）。`error.message`/stack/error 自体は本番で redacted＝無意味なので**送らない**（AC-2）。
   - `scope` は送信ペイロード構築時に `scope ?? "page"` で default 解決してから渡す（arch S-004。`SectionErrorBoundary` のデフォルトは関数引数デフォルトのため、注入経路で undefined が漏れて `z.enum` が弾く事故を防ぐ）。
   - `count`（AC-5・coverage P-001）: 境界インスタンス内のカウンタ（`useRef` 等、class へ注入する `onCatch` クロージャ側で保持）を**捕捉ごとに +1**（送信が丸められても増分する）し、その値をペイロードの `count` に載せる。`count` は「境界インスタンスの捕捉累積回数」であって実送信回数ではない（arch S-002）。Issue「発生回数程度」を「その境界での捕捉累積回数」として最小情報で送る。
   - 多重送信抑止（AC-5）: 同一境界インスタンス内で「直近に報告した section+resetKey の組」を覚え、同一キーの連続報告（StrictMode 二重 mount・リトライ後の再 throw）を1回に丸める。`componentDidCatch` は描画をブロックしないので、送信は `void report(...).catch(() => {})`。
   - `path` のタイミング（arch P-003）: 送信は `window.location.pathname` を**送信時点で**取得する。これは原エラーを出した stream リクエスト時点の URL とズレうる（SPA 遷移途中・retry 後の再 throw 等）。よって相関では route path は**補助**とし、主は「時刻近接＋section 名」とする（ADR-003 に反映）。pathname は動的セグメント実値（note ID 等）を含みうるため、相関の足がかり以上の意味は持たせない。
   - `render`／fallback／a11y は不変（AC-6）。報告はあくまで副作用。

2. プレゼンテーション側（報告受け口の server fn）
   - **配置の確定（coverage S-003 / arch P-001）**: `app/components/common/sectionFailureReport.ts`（新規）に確定。ADR-004 で「presentation の transport 受け口」と判断済み。既存の `action.ts` 慣習（client が呼ぶ POST server fn はコンポーネント直下に同居、例 `layout/action.ts` `logOutFn`）に合わせ、`SectionErrorBoundary.tsx` と同ディレクトリにファイル同居させる。class component が利用する都合上 `app/components/common/` に置くのが import 経路上も自然。二択は解消する。
   - POST server fn を定義:
     - `.middleware([errorResponseMiddleware])`
     - `.inputValidator(validateInput(sectionFailureReportSchema))` — transport 境界。`section`（短い文字列・長さ上限）、`scope`（`"page" | "shell"` enum）、`path`（短い文字列・長さ上限）、`count`（正の整数・上限あり）を検証。DoS/巨大ペイロードを弾く。
     - `.handler` 内で `getContainer()` から `logger` を取り、`logger.warn("Section render failed", { event: "section_failure", section, scope, path, count })` を出力（`errorResponseMiddleware.logServerError` と同型の構造化メタ）。**meta タグは `kind` ではなく `event` キーを使う**（arch S-002。`errorResponseMiddleware` の `meta.kind` は `SerializedError` の kind 語彙であり、これとは別概念の観測タグなので混同しないキー名にする）。`warn` レベル＝「ユーザー影響はあるが server-fn システムエラーほど致命ではない局所失敗」。
     - 返り値は最小（`{ ok: true }`）。client は結果を使わない。
   - スキーマは zod で長さ上限・enum・count 上限を厳格化（観測ノイズ・ログ汚染・DoS 防止）。

3. 相関の成立（AC-4）
   - 本番では RSC stream の原エラーがフレームワーク既定で `console.error` され、Cloudflare Workers Logs に残る。報告 fn の `logger.warn`（`event: "section_failure"`）も Workers Logs に出る。
   - client の `componentDidCatch` 報告は**別 HTTP リクエスト**で届く（stream を返したリクエストとは別 POST）。よって `cf-ray` は一致せず、機械的な自動相関はできない。突き合わせは「**時刻近接（報告 timestamp と原エラー timestamp が数秒以内）＋ section 名**を主、route path を補助」とする人手照合で行う（route path は送信時点取得のためズレうる＝補助。arch P-003）。`cf-ray` は同一リクエスト内ログをまとめる補助に留め、報告が別 POST である以上 主キーにはしない。この運用手順を `docs/runtime_cloudflare.md` に明記する（AC-4）。
   - これが Issue の「サーバー側ログとの突き合わせで追える設計」の具体。client からは詳細を送れない前提で、サーバー側に既にある原エラーログを time+section（+route 補助）でブリッジする。

## 実装ステップ

内側（observability ポートは既存）→ transport 受け口 → client フック → 運用ドキュメント の順。

### 1. 報告 payload のスキーマ定義

- **対象ファイル:** `app/components/common/sectionFailureReport.ts`（新規。スキーマと server fn を同居させる。client からは fn のみ import）
- **変更内容:** zod スキーマ `sectionFailureReportSchema` を定義。`section: z.string().min(1).max(100)`、`scope: z.enum(["page","shell"])`、`path: z.string().max(2048)`、`count: z.number().int().positive().max(1000)`。許可キーは `{section, scope, path, count}` の4つに限定（`message`/`stack`/`error` を持たせない＝AC-2 の構造的担保）。
- **理由:** transport 境界の検証（CLAUDE.md Input validation）。巨大／不正ペイロードを弾き、ログ汚染・DoS を防ぐ（AC-2, AC-5）。`count` は Issue「発生回数程度」を最小情報として運ぶフィールド（coverage P-001）。

### 2. クライアント `componentDidCatch` の追加と多重抑止

- **対象ファイル:** `app/components/common/SectionErrorBoundary.tsx`
- **変更内容:**
  - `BoundaryProps` に `onCatch?: () => void` を追加し、class は観測非依存のまま保つ（`onCatch` 注入形に確定。arch P-001 (a)）。`Boundary` 自身は section/scope/path/count を知らない。
  - `componentDidCatch(error, info)` で `this.props.onCatch?.()` を呼ぶだけ（描画ブロックなし）。
  - 関数コンポーネント `SectionErrorBoundary` 側で `const report = useServerFn(reportSectionFailure)` を取得し、`onCatch` を「section/`scope ?? "page"`/`window.location.pathname`/count を集めて `void report({ data: payload }).catch(() => {})` を投げる」関数として渡す（arch P-001。raw 直接 import はせず `useServerFn` 経由＝B-001 規約準拠）。
  - `count`: 境界インスタンスごとのカウンタ（`useRef<number>` 等）を捕捉ごとに +1 し、ペイロードの `count` に載せる（AC-5・coverage P-001）。
  - `scope` は `scope ?? "page"` で default 解決済みの値を送る（arch S-004。undefined 漏れ防止）。
  - 同一 `section`+`resetKey` の連続報告は1回に丸める（直近キーを `useRef` で保持。StrictMode 二重 mount・retry 後の再 throw を抑止）。`count` は「境界インスタンスの捕捉累積回数」であり、捕捉ごとに +1 する（送信が丸められても増分する）。つまり `count` は捕捉回数であって実送信回数ではない。送信抑止（丸め）と `count` の増分は独立した別概念。
  - 送信は `void report({ data: payload }).catch(() => {})` で UI を絶対にブロックしない。
- **理由:** N-003 を埋める唯一のフック。`render` を変えないので UX・a11y 不変（AC-1, AC-6）。多重抑止で「発生回数程度」に収め、`count` で発生回数を最小情報として運ぶ（AC-5, coverage P-001）。

### 3. 報告受け口 server fn の実装（logger 転送）

- **対象ファイル:** `app/components/common/sectionFailureReport.ts`
- **変更内容:** `reportSectionFailure = createServerFn({ method: "POST" }).middleware([errorResponseMiddleware]).inputValidator(validateInput(sectionFailureReportSchema)).handler(async ({ data }) => { const { logger } = await getContainer(); logger.warn("Section render failed", { event: "section_failure", section: data.section, scope: data.scope, path: data.path, count: data.count }); return { ok: true } as const; })`。meta タグは `event`（`kind` ではない＝arch S-002）。
- **理由:** client→server の正規導線は server fn。`Logger` ポート経由で構造化ログを出す（AC-3）。usecase ではなく presentation の transport 受け口（`logServerError` と同型）なのでここに置く。

### 4. テスト

- **対象ファイル:** `app/components/common/__tests__/SectionErrorBoundary.test.tsx`（拡張）、必要なら `sectionFailureReport` のスキーマ単体テスト
- **モック方法（arch P-002）:** 既存 `SectionErrorBoundary.test.tsx` は `@tanstack/react-router` のみ `vi.mock` しており、報告 fn を import すると `createServerFn` チェーンが module top-level で評価される。`UserMenu.test.tsx` の確立パターンを踏襲し、`app/components/_test-utils/serverFnMock.ts` の `serverFnChainStub`（`createServerFn`/`createMiddleware` のスタブ）と `useServerFnRouter`（`useServerFn` の identity-dispatch mock）で `@tanstack/react-start` を `vi.mock` し、`vi.mock("../sectionFailureReport", () => ({ reportSectionFailure: reportMock }))` で fn 自体を spy に差し替える。`onCatch` 注入形（arch P-001 (a)）のため、`useServerFn(reportSectionFailure)` が `reportMock` を返すよう `useServerFnRouter([[reportMock, reportMock]], reportMock)` を渡す。
- **変更内容:**
  - 子が throw したとき報告 fn（mock）が `{ data: { section, scope, path, count } }` で1回呼ばれることを検証。
  - **AC-2 の negative assertion（coverage S-001）**: 報告 fn 呼び出し引数の `data` が `section`/`scope`/`path`/`count` の許可キーのみで、`message`/`stack`/`error` を**含まない**ことを assert する。
  - **count（AC-5・coverage P-001）**: 同一境界インスタンスで（resetKey を変えて）2回捕捉させ、2回目の `count` が 1 増えていることを検証。
  - **count セマンティクスの一意固定（arch S-002）**: 同一 `resetKey` のまま再 throw させたとき、送信は1回に丸められる（report fn は追加で呼ばれない）一方で `count` は捕捉ごとに増分する（＝`count` は「境界インスタンスの捕捉累積回数」であり実送信回数ではない）ことを1ケースで明示検証する。これにより「count が捕捉回数なのか実送信回数なのか」の曖昧さを実装者が一意に読めるよう固定する。
  - **error/info を送らない意図の念押し（arch S-001）**: `componentDidCatch(error, info)` のシグネチャ上 `error`/`info` がスコープ内に見えるため、これらを送信ペイロードに含めない意図をコードコメントで明示する。AC-2 negative assertion（payload が許可キー4つのみで `message`/`stack`/`error` を含まない）が `error.message`/stack の混入を構造的に弾くことをテストで担保する旨も合わせて記す（将来の改変で「ついでに stack も送る」事故を構造的に防止）。
  - 同一 resetKey での再 throw が重複報告しない（1回に丸まる）こと、報告 fn が reject しても fallback UI が壊れないことを検証。
  - `scope` 未指定時に `"page"` が送られること（arch S-004）。
  - 既存 a11y/リトライ/resetKey テストが不変で通ることを確認（AC-6）。
  - スキーマ単体: `sectionFailureReportSchema` が長さ上限・enum・`count` の正整数/上限・必須・余剰キーを弾く。
- **理由:** 報告フックの契約・多重抑止・耐障害性・最小情報（送らないものを送らない）を固定。

### 5. 運用ドキュメントへの突き合わせ手順追記

- **対象ファイル:** `docs/runtime_cloudflare.md`
- **変更内容:**
  - Workers Logs での `event: "section_failure"` の `logger.warn` 行と、RSC 原エラー（`console.error`）を **時刻近接＋section 名（主）＋route path（補助）** で突き合わせる手順を追記。`cf-ray` は報告が別 POST のため一致しない（機械的相関不可）点も注記。
  - **`warn` レベルの見え方（arch S-001）**: セクション失敗は `warn`/`event: "section_failure"` で出る（`error` ではない）ことを明記。`errorResponseMiddleware.logServerError` は `kind: "system" | "unknown"` のみ `error` で出すため、`error` だけ追っていると見落とす旨を `error` 系との対比で書く。突き合わせクエリ例に log level（`warn`）と `event` タグを含める。
- **理由:** AC-4 の「突き合わせで追える設計」はログだけでなく運用手順までで成立する。redaction 前提の設計意図と `warn` レベルの運用上の見え方を残す。

## 設計判断

- ADR-001: 観測経路は専用計測エンドポイントではなく既存 `Logger` ポート（server fn 受け口）に乗せる。
- ADR-002: `admin/metrics`（DB 由来ダッシュボード）には載せない。永続化・集計は本 Issue スコープ外。
- ADR-003: 相関手段は新規 request-ID 基盤ではなく「時刻近接＋section 名（主）＋route path（補助）」の人手突き合わせ（Cloudflare ログの `cf-ray` は別 POST のため主キーにしない補助）。client からは redacted 詳細を送らない。`path` は送信時点取得でズレうるため補助に留める。
- ADR-005: 観測 meta タグは `event: "section_failure"` を使う（`SerializedError` の `kind` 語彙と区別）。

詳細は `.issue/647/adr.md`。

## リスクと注意点

- 報告 fn の配置（確定）: `app/components/common/sectionFailureReport.ts` に確定（二択解消。coverage S-003）。client component（class）が `useServerFn` 経由で利用する都合上、同ディレクトリ同居が import 経路上自然。server fn のハンドラ本体は Start コンパイラが client バンドルから除去する前提に依存するが、これは既存 `action.ts` と同じパターン。`getContainer` は client-graph safe（`containerStore.ts` 注記）。
- 報告 fn の取得経路（確定）: raw 直接 import ではなく `useServerFn(reportSectionFailure)` 経由（B-001 規約・`useEditLock.ts` 前例）。class は `onCatch` 注入で観測非依存に保つ（arch P-001）。前例のない raw 直接 RPC 経路を避ける。
- 報告自体が失敗する／無限ループ化するリスク: 報告 fn の呼び出しが新たなエラーを境界に投げ返さないよう、`componentDidCatch` → `onCatch` は完全に try/non-throw（fire-and-forget + `.catch`）にする。報告 fn 内で throw しても client は無視する。
- フラッディングと総量上限（arch S-003）: リトライ連打・StrictMode 二重 mount で多重送信しうる。同一 section+resetKey の抑止で実用上は収まるが、サーバー側でのレート制限は持たない（最小実装）。1ページに多数の境界がある（home の toolbar/list/sidebar 等）ためバックエンド全断時は各境界が1回ずつ POST するが、**1ページあたりの送信件数は境界数で bounded**（無限増殖しない）。ペイロード上限スキーマ＋`warn` レベルで1件あたりコストも小さい。完全自動の総量抑止はスコープ外。
- `path` のタイミング（arch P-003）: `window.location.pathname` は送信時点で取得するため、原エラーを出した stream リクエスト時点の URL とズレうる（SPA 遷移途中・retry 後の再 throw 等）。よって相関で route path は補助に留め、主は時刻近接＋section 名（ADR-003）。pathname は動的セグメント実値を含みうる点も最小情報原則とわずかに緊張するため、相関の足がかり以上の意味は持たせない。
- 相関の弱さ: client 報告は別リクエストなので `cf-ray` で機械的に結合できない。時刻＋section（＋route 補助）の人手突き合わせに留まる。Issue の「突き合わせで追える」要件は満たすが、完全自動の相関ではない（スコープ外）。
- `componentDidCatch` は SSR では発火しない（React の仕様）。本 Issue の対象は「streaming 後にクライアント境界へ届く」失敗なので、これは正しい挙動（SSR 段階の失敗は別経路）。

## テスト方針

- モック: `serverFnMock.ts` の `serverFnChainStub` で `createServerFn`/`createMiddleware` をスタブし、`useServerFnRouter` で `useServerFn(reportSectionFailure)` を `reportMock` にディスパッチ。`vi.mock("../sectionFailureReport", …)` で fn を spy 化（`UserMenu.test.tsx` パターン踏襲。arch P-002）。
- 単体（happy-dom）: 子 throw 時に報告 fn が `{ data: { section, scope, path, count } }` で1回呼ばれる／引数に `message`/`stack`/`error` を**含まない**（AC-2 negative assertion、coverage S-001）／同一境界で2回捕捉時に `count` が増える（AC-5、coverage P-001）／同一 resetKey 再 throw で重複しない／`scope` 未指定で `"page"` が送られる（arch S-004）／報告 reject で UI 不変／既存リトライ・a11y・resetKey テストが不変で通る。
- `error`/`info` を送らない意図の念押し（arch S-001）: `componentDidCatch(error, info)` の `error`/`info` は「受け取るが送信ペイロードには含めない」ことをコードコメントで明示し、テストの AC-2 negative assertion（許可キー4つのみ・`message`/`stack`/`error` を含まない）で二重に守る。将来の改変で安易に `error.message`/stack を payload へ足す事故を構造的に防止する。
- count セマンティクスの一意固定（arch S-002）: `count` は「境界インスタンスの捕捉累積回数」であり実送信回数ではない、というセマンティクスを1ケースで明示固定する。同一 `resetKey` で再 throw したとき、送信は1回に丸められる（report fn は追加で呼ばれない）一方で `count` は捕捉ごとに増分することを検証し、「捕捉回数か実送信回数か」の曖昧さを残さない。
- スキーマ単体: `sectionFailureReportSchema` が長さ上限・enum・`count` 正整数/上限・必須・余剰キーを弾く。
- 型・lint: `pnpm typecheck && pnpm lint:fix && pnpm format`。
- 手動（任意）: dev サーバーで意図的にセクションを throw させ、Workers Logs（`pnpm start` のコンソール）に `warn`/`event: "section_failure"` 構造化ログが出ること、同一画面の RSC 原エラーと時刻近接で並ぶことを確認。

## レビュー履歴

### 1周目

**修正した点（要修正）**:
- coverage P-001: Issue 文言「発生回数程度」を AC に明示的に落とした。ペイロードに `count`（境界インスタンスごとの累積発生回数）を追加し、AC-5 を「`count` を含め、2回目以降に増えることをテスト検証」と検証可能化。由来欄に Issue 文言「発生回数程度」を併記し、スコープ「含まれないもの」に「`count` は局所カウンタ／横断集計はログ基盤に委ねる」という解釈宣言を追記（ステップ1/2/4 に紐づけ）。
- arch P-001（最重要）: 報告 fn の client 呼び出し経路を確定。既存規約（`useEditLock.ts` JSDoc「the hook never imports the raw server fns directly (B-001)」、全 client 呼び出しが `useServerFn` 経由）を調査し、class の `componentDidCatch` から hooks は使えないため、関数コンポーネント `SectionErrorBoundary` 側で `useServerFn(reportSectionFailure)` を取得し `onCatch` コールバックで class へ注入する形に確定（arch P-001 (a)）。配置も `app/components/common/sectionFailureReport.ts` に一意確定（既存 `action.ts` 慣習＝client が呼ぶ POST fn はコンポーネント直下に同居）。設計・ステップ2/3・リスク・調査結果すべてに反映。

**取り込んだ改善提案**:
- coverage S-001: AC-2 の negative assertion をテスト方針・ステップ4・AC 表に明記（送信ペイロードが許可キーのみで `message`/`stack`/`error` を含まないことを assert）。
- coverage S-002: AC-4 の文言を「相関**手段**（時刻近接＋route path＋section 名の人手突き合わせ。`cf-ray` は主キーにしない）」へ修正し、設計本文・ADR-003 と一致させた。
- coverage S-003: 報告 fn の配置の二択を解消（arch P-001 と統合して `app/components/common/sectionFailureReport.ts` に確定）。リスク欄の二択記述も削除。
- arch P-002: 報告 fn のテスト/モック方法を追加（`serverFnMock.ts` の `serverFnChainStub`/`useServerFnRouter`＋`vi.mock` で fn を spy 化。`UserMenu.test.tsx` パターン踏襲）。ステップ4・テスト方針に明記。
- arch P-003: `window.location.pathname` の取得タイミングのズレに対処。送信時点取得である旨と意味論的限界を明記し、相関は「route path は補助、主は時刻近接＋section 名」へ設計（ADR-003）・リスク欄に反映。
- arch S-001: `warn` レベルの見え方（`error` 系との対比で見落としうる点、クエリ例に level/event を含める）を運用ドキュメント追記項目（ステップ5）に追加。
- arch S-002: meta タグを `kind: "section_failure"` → `event: "section_failure"` に変更（`SerializedError` の `kind` 語彙との混同回避）。設計・ステップ3・AC-3・新規 ADR-005 に反映。
- arch S-003: 同時多発失敗時の総量が「1ページあたり境界数で bounded」である点をリスク欄に明記。
- arch S-004: `scope` のデフォルト解決（`?? "page"`）を送信ペイロード確定時に行い undefined 漏れを防ぐ旨をステップ2・設計に明記。テストに検証項目を追加。

**見送った提案とその理由**:
- なし（要修正・改善提案ともすべて取り込んだ）。

### 2周目

2周目: 両視点とも問題点ゼロで終了。arch 視点の改善提案2件（S-001/S-002）をテスト方針へ取り込み。

**取り込んだ改善提案**:
- arch S-001: `componentDidCatch(error, info)` の `error`/`info` を「受け取るが送信ペイロードには含めない」意図を、コードコメント＋テスト（AC-2 negative assertion）で念押しする旨をテスト方針・ステップ4に追加（将来 stack 等を足す事故の構造的防止）。
- arch S-002: `count` のセマンティクスを「境界インスタンスの捕捉累積回数（実送信回数ではない）」に一意化し、plan 本文（AC-5・設計・ステップ2）の文面の揺れを解消。同一 `resetKey` 再 throw 時に送信は1回に丸めつつ `count` は増分することを1ケースで明示検証する旨をテスト方針・ステップ4に追加。

**見送った提案とその理由**:
- なし（改善提案2件をすべて取り込んだ）。
