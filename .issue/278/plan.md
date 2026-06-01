# 実装計画 — Issue #278: test(ingestion): IngestionQueue polling 専用テストの追加

**Issue:** #278
**作成日:** 2026-06-02
**複雑度:** 小規模（新規テストファイル 1 本）

---

## 目的

Issue #221 で導入された `app/components/ingestion/IngestionQueue.tsx`（client-side polling のメインコンポーネント）に専用のコンポーネントテストを追加し、polling 制御パスのリグレッションを自動検出できるようにする。

## スコープ

### 含まれるもの

- `app/components/ingestion/__tests__/IngestionQueue.test.tsx` を新規作成
- Issue 本文が列挙する 6 シナリオを Vitest + happy-dom + `react-dom/client` で検証
  1. active ジョブがあるとき間隔が短く（4s 系）、idle のとき長く（16s 系）切り替わる
  2. `visibilitychange` で hidden → visible になった瞬間に即時 tick が走る
  3. `unauthorized` を受け取ったあと polling が完全停止し、effect 再実行で復活しない
  4. `notFound` は fatal にならず、failures カウンタ経由で扱われる（3 回連続で UI 通知）
  5. 同時 tick を `inflightRef` で抑止
  6. unmount で timer が確実に clear される
- 既存 `UploadForm.test.tsx` / `IngestionJobRow.test.tsx` のスタイル（`@vitest-environment happy-dom` + `serverFnMock` ユーティリティ）に合わせる
- 本テスト特有の `vi.useFakeTimers()` による時計固定を導入

### 含まれないもの

- `IngestionQueue.tsx` 本体の挙動変更（テストのみ追加。テストで本体バグが判明した場合のみ別途検討）
- 子コンポーネント `IngestionJobRow` の描画詳細テスト（既存 `IngestionJobRow.test.tsx` の担当）
- E2E / ブラウザ実機テスト（本 Issue はコンポーネント単体テストに限定）

## 実装ステップ

### 1. テストファイルの骨組み（モック構成）

- **対象ファイル:** `app/components/ingestion/__tests__/IngestionQueue.test.tsx`（新規）
- **変更内容:**
  - 先頭に `// @vitest-environment happy-dom` を置く
  - `IS_REACT_ACT_ENVIRONMENT = true` を設定
  - `getIngestionJobsFn` を `vi.fn()` (`fetchJobsMock`) でモックし、`vi.mock("../actions", ...)` と `vi.mock("@tanstack/react-start", ...)`（`useServerFnRouter` 経由）で配線する。`actions.ts` を直接 import すると `createServerFn` チェーンが走るため `serverFnChainStub` を使う既存パターンを踏襲
  - `IngestionJobRow` は描画依存を断つため軽量モック（`vi.mock("../IngestionJobRow", ...)`）に差し替え、`job.id` を含む単純な要素を返す。これにより本テストは polling 制御だけに集中できる
  - `lucide-react` / `Icon` 等の周辺依存は実物のままで問題ないか確認し、描画に支障があればモックする
- **理由:** 既存テストインフラ（`serverFnMock`）を再利用し、ネットワーク・子描画から切り離して polling ロジックのみを検証するため

### 2. fake timer + helper の整備

- **対象ファイル:** 同上
- **変更内容:**
  - `beforeEach` で `vi.useFakeTimers()`、`afterEach` で `root.unmount()` → `vi.useRealTimers()` → `fetchJobsMock.mockReset()`
  - `act` でラップした `advanceTimersByTimeAsync(ms)` ヘルパを用意し、タイマー発火 → fetch 解決 → state 反映 → 再 schedule の一連を flush する
  - `document.visibilityState` を差し替えるヘルパ（`Object.defineProperty(document, "visibilityState", ...)` + `document.dispatchEvent(new Event("visibilitychange"))`）を用意
  - ジョブ fixture（active: `pending`/`processing`、idle: `previewing`/`failed` 等）を `IngestionJobWire` 形で定義
- **理由:** 可変ポーリング間隔・visibilitychange・inflight ガードはすべてタイマー駆動なので、決定論的に検証するには fake timer 制御が必須

### 3. 6 シナリオの実装

- **対象ファイル:** 同上
- **変更内容:** 各シナリオを `it(...)` で実装する。検証観点：
  1. **間隔切替:** active fixture でマウント → `POLL_INTERVAL_MS`(4000) 経過で 1 回 fetch。fetch が active を返し続ける限り次も ~4000 で発火。idle を返したら次は ~16000 まで発火しない（4000〜16000 の間では呼ばれない、16000 で発火）ことを `fetchJobsMock.mock.calls.length` で確認
  2. **visibility 即時 tick:** マウント後 hidden に切替（次 tick は idle 再スケジュール）→ visible に戻す → `schedule(0)` 起因で即時に fetch が走ることを `advanceTimersByTimeAsync(0)` 後の呼び出し回数で確認
  3. **fatal 永久停止:** fetch を `AppServerError({kind:"unauthorized"})` で reject → tick 後 `pollErrorMessage` 表示、以降いくら時計を進めても追加 fetch が走らない。さらに `root.render` で再レンダー（effect 再実行を模す）しても復活しないことを確認
  4. **notFound は failures 経由:** fetch を `AppServerError({kind:"notFound"})` で 3 回連続 reject → fatal にならず（polling 継続）、3 回目で `pollErrorMessage`（「進捗の自動更新に失敗しました」）が表示されることを確認。間隔が backoff(12000) に乗ることも軽く確認
  5. **inflight 抑止:** fetch を解決保留の Promise にしておき、in-flight 中に visibility 復帰等で `schedule(0)` を誘発 → 二重 tick が走らない（`fetchJobsMock` が 1 回しか呼ばれない）ことを確認
  6. **unmount で clear:** マウント → `root.unmount()` → 時計を十分進めても fetch が走らないことで timer 解放を確認。`clearTimeout` spy で確認してもよい
- **理由:** Issue が要求する代表シナリオを過不足なくカバーし、`IngestionQueue.tsx` の非自明な制御パス（fatalRef / inflightRef / 可変間隔 / visibilitychange / failures カウンタ / unmount cleanup）を保護する

### 4. 検証

- **対象ファイル:** —
- **変更内容:** `pnpm test:unit`（または特定ファイル指定）で全シナリオ PASS、`pnpm typecheck`、`pnpm lint:fix`、`pnpm format` を通す
- **理由:** CLAUDE.md「After changes: typecheck && lint:fix && format」に従う

## 設計判断

- **`IngestionJobRow` をモックする:** 本テストの対象は polling 制御であり子の描画ではない。子をモックすることでテストの意図が明確になり、子の変更に対して脆くならない。（adr.md ADR-001 に記録）
- **`getIngestionJobsFn` は `useServerFnRouter` 経由でモック:** `IngestionQueue` は `useServerFn(getIngestionJobsFn)` で取得した関数を呼ぶため、既存 `UploadForm.test.tsx` と同じ identity-dispatch モックを用いる。
- **fatal 種別の生成:** `new AppServerError({ kind: "unauthorized" | "notFound", code, message, retryable })` を直接構築すると `extractSerializedError` がその kind を返す（`errorResponse.ts` の `AppServerError` 分岐より）。`forbidden` も同経路だが、代表として `unauthorized` を fatal、`notFound` を非 fatal に用いる。

## リスクと注意点

- **fake timer と async fetch の interplay:** `setTimeout(tick)` の `tick` は async で内部に `await fetchJobs(...)` がある。`vi.advanceTimersByTimeAsync` を使い、各ステップで `act(async () => {...})` により microtask を flush しないと state 反映前にアサートして flaky になる。`UploadForm.test.tsx` の「10 回 `await Promise.resolve()`」パターンも併用候補。
- **`document.visibilityState` の上書き:** happy-dom 既定は `"visible"`。`Object.defineProperty` で getter を差し替え、テスト間で確実に元に戻す（`afterEach`）。
- **初回 schedule は `POLL_INTERVAL_MS`(4000) 固定:** マウント直後の最初の tick は active/idle に関わらず 4000ms 後（`schedule(POLL_INTERVAL_MS)`）。間隔切替の検証は「2 回目以降の間隔」で行う点に注意。
- **happy-dom で `document` が存在する:** コンポーネントは `typeof document !== "undefined"` ガードを持つが happy-dom 下では常に真。SSR ガードのテストは対象外。
- **テスト環境差し替え:** 既存コンポーネントテストはファイル先頭 `// @vitest-environment happy-dom` で個別指定（グローバルは `node`）。これを必ず付ける。

## テスト方針

- 本 Issue 自体がテスト追加。新規テストが全 PASS することをもって完了とする。
- `pnpm test:unit` でユニット全体がグリーンであること（既存テストへの副作用が無いこと）も確認する。
- ブラウザ実機検証は不要（ランタイム UI を変更しないテストのみの追加。testing.md 参照）。
