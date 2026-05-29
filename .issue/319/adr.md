# ADR — Issue #319: 既存ジョブ起点の waiting ポーリング fatal 時はキュー誘導する

## ADR-001: 既存ジョブ起点の poll fatal は専用「キュー誘導」view を新設する（`failed` view 相当は再利用しない）

### Status
Accepted（実装時の設計判断）

### Context
Issue 本文は遷移先の案として「`/upload` リンク表示 or `failed` view 相当」を挙げている。`failed` view（`FailedView`）の再利用可否を検討した。

`FailedView` は `job: IngestionJobWire` を必須 prop に取り、`job.originalFileName` / `job.errorCode` を表示し、再試行（`ownerRetryIngestionJobFn`）・破棄（`discardIngestionPreviewFn`）を `job.id` で呼ぶ。一方、`waiting` ポーリングの fatal は `getJob` が reject したケースであり、その時点で手元にあるのは `jobId`（waiting view が保持）と serialized error だけで、**新鮮な `job` オブジェクトが無い**。`status === "failed"` を観測した正常な terminal 遷移（→ `failed` view）とは別物。

### Decision
既存ジョブ起点の poll fatal 専用に `{ kind: "queueGuidance" }` view を新設する。表示は「待機中にエラーが発生したが、ジョブはキューに残っており `/upload` から続行できる」旨 ＋ 発生エラーの `displayError` ＋ キュー画面リンク。これは既存の `timedOut` view（ジョブ永続化＋キュー誘導）の様式を踏襲し、エラー文言だけ加えた構成。

### Consequences
- 良い点: job 不在でも成立する。`timedOut` と一貫した「キューに残っている」メンタルモデルを提示。リンクで編集対象（ジョブ）へ確実に戻れる。
- トレードオフ: view が1種類増える。ただし `failed` view を無理に流用して job をでっち上げるより素直で、責務が明確。

---

## ADR-002: fatal だけでなく transient 上限超過の terminal failure も起点別に出し分ける

### Status
Accepted（実装時の設計判断）

### Context
`waiting` ポーリングが `select` へ戻る経路は2つある: (a) fatal error（`isPollFatalError` true）、(b) transient（system/unknown）失敗が `POLL_MAX_TRANSIENT_FAILURES` に到達。Issue 本文は (a) を主眼に書かれているが、(b) も「ポーリングを諦めて編集コンテキストを失う」点で (a) と同一の UX 欠陥を持つ。

### Decision
(a)(b) 両方の terminal failure を起点別に出し分ける。起点判定ヘルパーを effect 内に1つ用意し、`origin === "existingJob"` のとき両経路とも `queueGuidance` へ、`"upload"` のとき従来通り `select` へ遷移させる。

### Consequences
- 良い点: 既存ジョブ起点で「編集コンテキストを失わない」という Issue の意図を、terminal failure の全経路で一貫して満たす。分岐ロジックの重複も1ヘルパーに集約される。
- トレードオフ: Issue 本文の明示範囲（fatal）をわずかに超えるが、同一動線の同一欠陥でありその場で直すのが自然（スコープは Issue の意図＝編集コンテキスト保持）。
