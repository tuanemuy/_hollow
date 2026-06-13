# ADR — Issue #647: SectionErrorBoundary で捕捉したセクション失敗を本番で観測可能にする

## ADR-001: 観測経路は既存 `Logger` ポート（server fn 受け口）に乗せる — 専用計測エンドポイントは作らない

### Status
Proposed

### Context
client の `componentDidCatch` が捕捉したセクション失敗をサーバー側で観測する経路として、(a) 専用の計測エンドポイント／sink を新設する、(b) 既存の `Logger` ポート（`app/core/application/ports/logger.ts`、Cloudflare では `ConsoleLogger` → Workers Logs）に乗せる、の2択がある。CLAUDE.md は「Keep cross-cutting concerns (clock, id generation, logging) behind ports」と定め、`errorResponseMiddleware.logServerError` は既に `getContainer().logger.error(..., { kind, code, message, cause })` で構造化ログを出す確立パターンを持つ。

### Decision
(b) を採用。client→server は `createServerFn({ method: "POST" })` の server fn を正規導線とし、handler 内で `getContainer().logger.warn("Section render failed", { event: "section_failure", section, scope, path, count })` を出す。新規 sink・新規ポートは作らない。レベルは `warn`（局所失敗。server-fn システムエラーの `error` とは区別）。meta タグは `kind` ではなく `event` キーを使う（ADR-005 参照）。`count` は client が送る最小情報（境界インスタンスの累積発生回数。Issue「発生回数程度」）。

### Consequences
- 良い点: 既存の観測規約・redaction 境界・DI 供給をそのまま再利用。Cloudflare ランタイムでは追加インフラなしで Workers Logs に流れる。`errorResponseMiddleware` と同型で一貫。
- トレードオフ: 集計・ダッシュボード・アラートはログ基盤側（Cloudflare Logs / 外部転送）に委ねる。アプリ内では生ログのみ。Issue の「最小情報を構造化ログへ送る」には十分。

---

## ADR-002: `admin/metrics`（DB 由来ダッシュボード）には載せない

### Status
Proposed

### Context
既存の計測機構として `app/routes/admin/metrics.tsx` / `app/components/admin/Metrics/` がある。ここにセクション失敗の発生回数を載せる案が考えられる。

### Decision
載せない。`admin/metrics` は `loadUsageMetrics`（DB のユーザー数・ストレージ・LLM 呼び出し等）を読むだけの利用量ダッシュボードであり、イベント取り込み口ではない。セクション失敗をここに集計表示するには、発生イベントの永続化（新テーブル／ドメイン概念／usecase）と集計クエリが必要になり、Issue の核心（最小情報を構造化ログへ）を超える観測基盤の新設になる。

### Consequences
- 良い点: ドメイン／永続化に一切手を入れず、スコープを「ログ化」に限定できる。over-engineering を回避（Issue の重要原則）。
- トレードオフ: 管理画面でセクション失敗を可視化したい要望が将来出たら、別 Issue でイベント永続化＋集計を設計する必要がある。本 Issue では構造化ログがその一次データになる。

---

## ADR-003: 相関は「時刻近接＋route path＋section 名」で成立させる — 新規 request-ID 基盤は作らない

### Status
Proposed

### Context
本番では streaming 後の RSC エラー詳細が React により redact されるため、client から送れるのは「セクション名＋発生位置」程度に限られる（Issue の前提・`.issue/636/adr.md` ADR-003）。エラー詳細は「サーバー側ログとの突き合わせで追える設計」にせよ、というのが Issue の意図。突き合わせの相関キーとして (a) 全リクエスト横断の汎用 correlation-ID ミドルウェアを新設する、(b) Cloudflare が全ログ行へ自動付与する `cf-ray` を使う、(c) 時刻近接＋route path＋section 名で人手ブリッジする、が候補。

調査で判明した制約:
- アプリは RSC stream の `onError` をカスタムしておらず、原エラーはフレームワーク既定で `console.error` され Workers Logs に残る（これが突き合わせ対象の「サーバー側に既に出ている原エラーログ」）。
- client の `componentDidCatch` 報告は、stream を返したリクエストとは**別の HTTP POST** で届く。よって原エラーのリクエストと報告のリクエストは別スコープ＝`cf-ray` が一致しない。
- アプリには現状 request-ID 相関基盤が存在しない。

### Decision
(c) を採用。報告 server fn の `logger.warn` 行（`event: "section_failure"`, section, path, count）と、同一画面の RSC 原エラー（`console.error`）を、**発生時刻の近接（数秒以内）＋ section 名を主、route path を補助**として突き合わせる。`cf-ray` は同一リクエスト内のログをまとめる補助に使うが、報告が別リクエストである以上 主キーにはしない。汎用 correlation-ID 基盤の新設はスコープ外。突き合わせ手順を `docs/runtime_cloudflare.md` に明記する。

route path を補助に格下げする理由（arch P-003）: client は `window.location.pathname` を**報告送信時点**で取得する。しかし RSC 原エラーは stream を返した**ナビゲーション時点の URL**で出るため、SPA 遷移途中・retry 後の再 throw・遷移直後の境界 catch では両者がズレうる。よって route path は相関の足がかり（補助）に留め、主キーは時刻近接＋section 名とする。加えて `pathname` は動的セグメント実値（note ID 等）を含みうるため、最小情報原則（client は最小しか送らない）とわずかに緊張する。相関の足がかり以上の意味は持たせない。

### Consequences
- 良い点: 既存ランタイムのログ機構だけで Issue の「突き合わせで追える」を満たし、横断基盤の新設を避ける。redaction 前提（client は詳細を送らない）と整合。
- トレードオフ: 機械的な自動相関ではなく、運用者が時刻＋section（＋route 補助）で人手照合する設計。高頻度同時失敗時は照合が曖昧になりうる。完全自動の分散トレーシングが必要になれば別 Issue。

---

## ADR-004: 報告受け口は presentation 層に置き、usecase 化しない

### Status
Proposed

### Context
報告を受ける server fn の handler が `getContainer().logger` を呼ぶ処理を、(a) application 層の usecase として切り出す、(b) presentation の transport 受け口として server fn 内に直接書く、のどちらにするか。

### Decision
(b)。セクション失敗の報告は「ビジネス操作」ではなく「transport から observability ポートへの転送」であり、ドメイン不変条件も状態遷移も持たない。`errorResponseMiddleware.logServerError` が usecase を介さず logger を直接呼んでいるのと同型。transport 境界の検証（`inputValidator(validateInput(schema))`）は presentation の責務として server fn に置く。

**ファイル配置の確定（coverage S-003）**: `app/components/common/sectionFailureReport.ts`（新規）に一意確定。`app/core/presentation/` 配下との二択を解消する。既存の `action.ts` 慣習（client が呼ぶ POST server fn はそれを使うコンポーネント直下に同居。例 `app/components/layout/action.ts` の `logOutFn`）に合わせ、利用元 `SectionErrorBoundary.tsx` と同じ `app/components/common/` に置く。

**client からの取得経路の確定（arch P-001）**: raw server fn を直接 import するのではなく、関数コンポーネント `SectionErrorBoundary` 側で `useServerFn(reportSectionFailure)` を取得し、`onCatch` コールバックとして class `Boundary` へ注入する。理由: 本プロジェクトには「hooks/components は raw server fn を直接呼ばず必ず `useServerFn(...)` 経由」という確立済み規約があり（`app/components/note/editor/useEditLock.ts` の JSDoc「the hook never imports the raw server fns directly (PR #7 Round 1 Blocker B-001)」、grep した全 client 呼び出しが `useServerFn` 経由）、class の `componentDidCatch` 内では hooks を呼べない。注入形なら既存慣習に完全準拠し、テストでも `onCatch`／`useServerFn` 戻り値を spy で差し替えられて容易（arch P-002）。

### Consequences
- 良い点: 不要な application 層の抽象を増やさない。既存の「ログ転送は presentation で直接」パターン・`useServerFn` 経由規約・`action.ts` 配置慣習すべてと一貫。前例のない raw 直接 RPC 経路を避ける。
- トレードオフ: 将来この報告を永続化・集計するなら、その時点で usecase 化が必要（ADR-002 の将来シナリオと同じ）。本 Issue の最小実装では不要。

---

## ADR-005: 観測 meta タグは `event: "section_failure"` を使う — `SerializedError` の `kind` 語彙と区別する

### Status
Proposed

### Context
報告ログの構造化 meta に「これはセクション失敗イベントだ」と分かるタグを載せる。当初案は `kind: "section_failure"` だった。しかし `errorResponseMiddleware.logServerError` は `meta` に `kind`（`SerializedError` の kind 語彙＝`system`/`unknown`/`validation` 等。CLAUDE.md の `*ErrorCode` 命名規約に紐づく）と `code` を入れる規約を持つ。`kind: "section_failure"` は SerializedError の kind 列挙ではない別概念だが、同じ `kind` キー名・同じ `lower_snake_case` 値形式を使うため、ログ消費側（突き合わせクエリ・パーサ）で両者を混同しうる（arch S-002）。

### Decision
meta タグのキー名を `event` にする（`logger.warn("Section render failed", { event: "section_failure", section, scope, path, count })`）。`errorResponseMiddleware` が出す `meta.kind`（SerializedError 由来）とは別の「観測イベント分類タグ」であることをキー名で明示し、ログパース時の混同を防ぐ。

### Consequences
- 良い点: SerializedError の `kind` 語彙とログ上で衝突しない。将来ログを機械パースする際、`event` タグでセクション失敗イベントだけを一意に抽出できる。
- トレードオフ: なし（純粋な命名の明確化。機能影響なし）。

---

## ADR-006: 報告 server fn は未認証・無制限の公開ログ書き込み口として受ける — リクポートレート制限は本 Issue では持たない（review-001 W-001）

### Status
Proposed

### Context
`reportSectionFailure`（`app/components/common/sectionFailureReport.ts`）は `createServerFn` の handler が `errorResponseMiddleware` のみを通し、認証ミドルウェアを噛ませない。つまり外部から直接叩ける未認証の公開 POST エンドポイントであり、誰でも `{section, scope, path, count}` を投げて `logger.warn("Section render failed", ...)` を発火できる。レビュー（review-001 W-001）は、この攻撃面が ADR で正面から評価されていない点を指摘した。想定される悪用は (a) 連続 POST による Workers Logs 容量・コストの押し上げ、(b) 本物のセクション失敗の埋没（観測ノイズ）、(c) `section`/`path` フィールドへの任意 UTF-8 文字列注入によるログ汚染（改行/制御文字を含みうる）である。

### Decision
本 Issue では (1) **未認証で受ける**、(2) **1リクエストあたりは schema で bounded**、(3) **リクエストレート制限は持たない**、を採る。

- 未認証で受ける理由: セクション失敗は未認証ページ（公開ノート `u/*`・`notes/public/*`、ログイン前の画面など）でも起きうり、`SectionErrorBoundary` はそれら public ルートからも到達する（B-001 / ADR-006 登録範囲参照）。認証必須にすると未認証ページの失敗を観測できず、Issue の核心目的（本番でセクション失敗を観測可能にする）が未認証経路で達成されない。既存の他の未認証 server fn（`auth/LoginForm/action`・`SignUpForm/action`・`PasswordResetRequestForm/action`・`EmailChangeConfirm/action` 等）と同列の「未認証で受ける公開 POST」であり、この fn が突出して危険なわけではない。それらと違い副作用が「ログ1行の追記」に限られるため、むしろ攻撃価値は低い。
- 1リクエストの bounded 性: `sectionFailureReportSchema` が `.strict()`（余剰キー拒否）＋ `section≤100` / `path≤2048` / `scope` enum / `count` int positive ≤1000 で、1リクエストあたりのペイロードサイズは上限が効く。注入面は長さと `scope` enum で縛られるが、`section`/`path` の中身は任意 UTF-8 を許容するため、改行/制御文字を含む文字列がログに構造化メタとして出る可能性は残る。この消費側注意点は `docs/runtime_cloudflare.md` の triage 節に注記する（N-004 / W-001(2)）。
- リクエストレート制限を持たない理由: 実効的なレート制限には KV / Durable Object カウンタ等の新基盤が必要で、本 Issue の最小スコープ（最小情報を構造化ログへ送る）を超える。リクエスト頻度の制御は当面ログ基盤側（Cloudflare の WAF / レート制限ルール、Workers Logs の流量制御・サンプリング）に委ね、アプリ層では持たない。

### Consequences
- 良い点: 未認証ページのセクション失敗も観測でき、Issue の目的を全経路で満たす。新基盤を増やさず最小スコープに収まる。1リクエストは schema で bounded。
- トレードオフ: リクエスト頻度は無制限なので、悪意ある相手が連続 POST でログを汚染・膨張させる余地が残る。緩和はログ基盤側の流量制御に依存する。アプリ層でのレート制限・`section` の許可リスト enum 化（注入面・容量面の縮小）が必要になれば、別 Issue で KV/DO ベースのレート制限基盤として検討する。

---

## ADR-007: `path`（`window.location.pathname` 生値）の平文ログ保存を許容する — 動的セグメント実値の redaction はしない（review-001 N-005）

### Status
Proposed

### Context
`SectionErrorBoundary` は報告送信時に `window.location.pathname` の生値を `path` として送る（ADR-003）。これは note ID 等の動的セグメント実値を含みうり、サーバーログ（Workers Logs）に平文で残る。レビュー（review-001 N-005）は、最小情報原則・redaction 原則とのわずかな緊張（ADR-003 で既に認識済み）に加え、識別子がサーバーログに平文で長期保存される点を、ログ保持ポリシー次第ではプライバシー観点の留意事項として ADR に記録すべきと指摘した。

### Decision
`path` の生値を redact せず平文でログ保存することを許容する。理由: (1) URL パスは元々 client 側で可視であり、サーバーが新たに機微情報を生成・露出するわけではない。(2) 含まれうる識別子は主に「自分の note ID 程度」で PII 性は低い。(3) `path` は相関の補助キーであり（ADR-003、主キーは時刻近接＋section 名）、redact すると突き合わせの足がかりとしての価値を失う。動的セグメントのマスキング（例 `/notes/:id` へ正規化）は実装コストに見合わず、本 Issue のスコープ外とする。

### Consequences
- 良い点: 相関の足がかりとして `path` をそのまま使え、ADR-003 の突き合わせ手順が機能する。実装を増やさない。
- トレードオフ: note ID 等の識別子がサーバーログに平文で残る。ログ保持期間が長い／外部転送する運用に変わった場合は、保持ポリシー側で対処するか、別 Issue で `path` の動的セグメント正規化（マスキング）を検討する。

---
