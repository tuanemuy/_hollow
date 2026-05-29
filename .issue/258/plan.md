# 実装計画 — Issue #258: UploadDialog ポーリング effect の view 依存による re-mount を解消する

**Issue:** #258
**作成日:** 2026-05-29
**複雑度:** 小規模（単一ソースファイル `UploadDialog.tsx` のリファクタ + 既存テストのリグレッション確認）

---

## 目的

`app/components/ingestion/UploadDialog.tsx` のポーリング `useEffect`（Perf-H1）は依存配列に `view` オブジェクト全体を含んでいる。transient 失敗時に `setView({ kind: "waiting", ..., transientFailures: nextFailures })` で `view` の identity が変わるたびに effect が cleanup → 再 setup（実質 re-mount）され、ポーリングタイマーが作り直される。

この re-mount セマンティクスを解消し、ポーリングループが「1 つの waiting セッション中は安定して mount されたまま」になるようにする。`transientFailures` カウンタは view の discriminant から外して `useRef` に保持し、effect 依存を `waiting` セッションを一意に決めるスカラー（jobId / startedAt）に絞る。

## スコープ

### 含まれるもの

- ポーリング `useEffect`（`UploadDialog.tsx:206-267`）のリファクタ
  - `View` の `waiting` variant から `transientFailures: number` を除去
  - `transientFailures` を `useRef<number>` で保持
  - effect 依存を `[waitingJobId, waitingStartedAt, getJob, onClose]` のスカラーに絞る
  - transient 失敗時は `setView` で view を作り直さず、ref をインクリメントして同一ループ内で次の tick を直接スケジュール
- `waiting` view を構築する 2 箇所（`submitFiles` 単一ファイル成功時 / `onRegenerated`）から `transientFailures: 0` を除去し、ref を 0 にリセット
- 既存テスト `UploadDialog.test.tsx` のリグレッション確認（全 21 ケース緑のまま）
- re-mount しないこと・transient 失敗でポーリング間隔が縮まないことのリグレッションガード追加

### 含まれないもの

- **Perf-M1**（editing tree-load effect も `view` 全体に依存）— 別の audit 指摘（Medium）。本 Issue の「やること」は polling effect (Perf-H1) のみを対象とするため触らない。`.issue/226/design-review/audit.md` で既にバックログ管理されている
- ポーリング間隔・タイムアウト・最大リトライ回数（`POLL_INTERVAL_MS` / `POLL_TIMEOUT_MS` / `POLL_MAX_TRANSIENT_FAILURES`）の値変更
- ポーリング以外の view 遷移ロジック（fatal error 判定 `isPollFatalError`、status text、各 View コンポーネント）

## 実装ステップ

### 1. `View` の `waiting` variant から `transientFailures` を除去

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:** `type View` の `waiting` から `transientFailures: number;` を削除する。これにより、失敗カウントの更新が view object を作り直す唯一の理由が消える。
- **理由:** view の identity 変化＝effect 再走の原因。カウンタを discriminant から外すことが re-mount 解消の根幹。

### 2. `transientFailuresRef` を追加

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:** `pollTimerRef` の隣に `const transientFailuresRef = useRef(0);` を追加。
- **理由:** 失敗カウントを render を伴わない可変状態として保持し、view から切り離す。

### 3. ポーリング effect をスカラー依存に書き換える

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:**
  - effect の直前で waiting セッションを一意に決めるスカラーを導出する:
    ```ts
    const waitingJobId = view.kind === "waiting" ? view.jobId : null;
    const waitingStartedAt = view.kind === "waiting" ? view.startedAt : null;
    ```
  - effect の guard を `if (waitingJobId === null || waitingStartedAt === null) return;` に変更し、内部で `waitingJobId` / `waitingStartedAt` を使う（`waitingView.jobId` 等の参照を置き換え）。
  - transient 失敗の catch 分岐から `setView({ kind: "waiting", ... })` を削除し、代わりに:
    ```ts
    transientFailuresRef.current += 1;
    if (transientFailuresRef.current >= POLL_MAX_TRANSIENT_FAILURES) {
      setError(serialized);
      setView({ kind: "select" });
      return;
    }
    pollTimerRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    ```
  - 依存配列を `[waitingJobId, waitingStartedAt, getJob, onClose]` に変更。
- **理由:** transient 失敗で view を作り直さず、pending パスと同じく同一ループ内で次の tick を直接スケジュールすることで、effect が waiting セッション中ずっと mount されたままになる。Issue 提案の「tick ループを 1 つに集約し useRef でカウンタを持つ」案に相当（再帰 setTimeout は async 処理の重複を避けられるため setInterval ではなく現行の再帰 setTimeout を維持）。

### 4. waiting セッション開始時にカウンタをリセット

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:** `waiting` view へ遷移する 2 箇所で `setView` の直前に `transientFailuresRef.current = 0;` を置き、`setView` 呼び出しから `transientFailures: 0` を除去する:
  - `submitFiles` の単一ファイル成功時（`upload` resolve 後）
  - `onRegenerated`
- **理由:** 失敗バジェットは waiting セッション単位。セッション開始点でリセットすることで effect ライフサイクルから独立させ、`getJob` / `onClose` の identity 変化（実際は `useServerFn` の `useCallback` で安定）に左右されずカウンタが意図通り累積する。

### 5. コメントの更新

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:** effect 上部の JSDoc 風コメントを、re-mount しない新しいセマンティクス（カウンタは ref、依存はセッションスカラー）に合わせて更新する。
- **理由:** audit が「コード意図と実装の認知的距離が大きい」と指摘した点の解消。

### 6. 振る舞いテストの追加

- **対象ファイル:** `app/components/ingestion/__tests__/UploadDialog.test.tsx`
- **変更内容:** waiting 中に cap 未満（2 回）の transient 失敗を挟んでも、同一 waiting セッションが維持され `POLL_INTERVAL_MS` ごとに 1 回 `getJobMock` が呼ばれ（フェイクタイマーで進めた interval 数 = 呼び出し回数）、最終的に editing に到達することを assert する。既存の W-T-002（3 連続 transient → select）は仕様不変。
- **理由:** Issue の「既存テストのリグレッション確認」。transient 失敗でループが脱落・重複しない振る舞いを固定する。**注意:** 旧実装（view 全体依存）も同期フェイクタイマー上では同一ケイデンスを示すため、このテストは re-mount（timer churn）そのものを検知するガードではなく、ループが transient 障害を生き延びる振る舞いの回帰テストである（review-001 W-001 を反映）。

## 設計判断

詳細は `.issue/258/adr.md` を参照。

- **ADR-001:** `transientFailures` を `useRef` に移し、再帰 `setTimeout` ループを 1 つに集約する（`setInterval` 化はしない）。
- **ADR-002:** 失敗カウンタのリセットを effect setup ではなく waiting セッション開始の call site で行う。

## リスクと注意点

- **失敗カウンタの累積/リセット境界:** ref は component インスタンス生存期間で共有される。セッション開始の 2 箇所で確実に 0 リセットしないと、前セッションの失敗が次セッションに持ち越される。ステップ 4 を厳守する。
- **`cancelled` フラグとの整合:** effect cleanup の `cancelled = true` と再帰 `setTimeout` の関係は現行どおり維持。transient catch で直接 `setTimeout(tick, ...)` する場合も、cleanup の `clearTimeout(pollTimerRef.current)` が最後にスケジュールしたタイマーを確実に掴むよう、スケジュール時に必ず `pollTimerRef.current` へ代入する（pending パスと同形）。
- **exhaustive-deps:** Biome の `useExhaustiveDependencies` に従い `getJob` / `onClose` を依存に残す。両者は `useServerFn`（`useCallback`）/ 親由来で実質安定なので mount は waiting セッションごとに 1 回に収まる。
- **`saved` / `discarded` で onClose を呼ぶ分岐**・**timeout 分岐**は現行ロジックを維持（スカラー参照への置換のみ）。

## テスト方針

- `pnpm test:unit`（`UploadDialog.test.tsx` を含む）が全緑。
- 追加したリグレッションガードが、view 全体依存へ戻すと失敗することを実装中に手元で確認。
- `pnpm typecheck && pnpm lint:fix && pnpm format`。
- ブラウザ手動検証（manual-test）: waiting 中のネットワークタブで、transient 失敗を挟んでもポーリングが ~1.8s 間隔を保ち、バースト（短時間に複数連続）しないことを目視。Workers サブリクエストの「前後比較」はこの間隔の安定性で代替確認する（定常状態の請求回数自体は不変で、re-mount 起因の余計な timer churn が消えるのが本変更の効果）。

## レビュー履歴

（Phase 3 で追記）
