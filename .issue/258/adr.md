# ADR — Issue #258: UploadDialog ポーリング effect の view 依存による re-mount を解消する

## ADR-001: `transientFailures` を `useRef` に移し、再帰 `setTimeout` ループを 1 つに集約する

### Status
Accepted

### Context

ポーリング `useEffect` の依存に `view` 全体が入っており、transient 失敗時の `setView({ kind: "waiting", ..., transientFailures: nextFailures })` で view object の identity が変わるたびに effect が cleanup → 再 setup される。Issue #258 はこの再 mount セマンティクスの解消を求めている。Issue 本文の提案は 2 案:

1. effect 依存を `[view.kind, view.jobId, view.startedAt]` のような必要最小限のスカラーに絞り、`transientFailures` を `useRef` で保持する
2. tick ループを `setInterval` 1 つに集約し、`useRef` でカウンタを持つ

### Decision

**`transientFailures` を `useRef<number>` に移し、`waiting` variant の discriminant から外す。effect 依存は waiting セッションを一意に決めるスカラー（`waitingJobId` / `waitingStartedAt`）+ `getJob` / `onClose` に絞る。transient 失敗時は view を作り直さず、ref をインクリメントして同一ループ内で再帰 `setTimeout(tick, POLL_INTERVAL_MS)` を直接スケジュールする。**

`setInterval` ではなく既存の**再帰 `setTimeout`** を維持する。各 tick は `getJob` を await する非同期処理であり、`setInterval` だと前の tick が未完のまま次が発火しうる。再帰 setTimeout は「await 完了後に次をスケジュール」するため重複発火を構造的に防げる。これは案 1 と案 2 の良いとこ取り（依存スカラー化 + 単一ループ + ref カウンタ）に相当する。

### Consequences

- 良い点:
  - waiting セッション中、effect は 1 回だけ mount され、transient 失敗でタイマーが作り直されない（re-mount セマンティクス解消）
  - 失敗カウントの更新が render を伴わなくなり、無駄な再レンダーが消える
  - ループのスケジュール経路が pending パスと transient パスで同形になり、コード意図と実装の距離が縮む（audit Perf-H1 の可読性指摘の解消）
- トレードオフ:
  - 失敗カウンタが ref になることで「現在の失敗回数」が React state として観測できなくなる（ただし UI に出していないので影響なし）
  - カウンタのリセットを明示的に行う必要がある（ADR-002 参照）

---

## ADR-002: 失敗カウンタのリセットを waiting セッション開始の call site で行う

### Status
Accepted

### Context

`transientFailuresRef` を `useRef` にすると component インスタンス生存期間で値が共有される。新しい waiting セッション（アップロード成功 / 再生成）に入るたびに 0 にリセットしないと、前セッションの失敗が持ち越される。リセット位置の選択肢:

1. **effect setup 内**（`if (waitingJobId === null) return;` の直後で `transientFailuresRef.current = 0;`）
2. **waiting view へ遷移する call site**（`submitFiles` 成功時 / `onRegenerated`）

案 1 は effect の依存（`getJob` / `onClose`）が変わるたびにリセットされる。`useServerFn` は `useCallback([router, serverFn])` で安定なので実害は薄いが、将来 waiting 中に再レンダーを誘発する変更が入り、かつ依存の identity が揺れた場合、セッション途中でカウンタが 0 に戻り 3 連続失敗での `select` フォールバックが壊れるリスクがある。

### Decision

**カウンタのリセットは waiting セッションを開始する 2 つの call site（`submitFiles` の単一ファイル成功時 / `onRegenerated`）で `setView({ kind: "waiting", ... })` の直前に `transientFailuresRef.current = 0;` を実行する。** effect setup ではリセットしない。

### Consequences

- 良い点:
  - 失敗バジェットが effect ライフサイクルから完全に独立し、依存 identity の揺れに対して頑健
  - 「新しい waiting セッションが失敗バジェットをリセットする」という意味が call site に明示される
- トレードオフ:
  - リセットを 2 箇所に書く必要がある（waiting への遷移経路が増えたら追従が必要）。現状 waiting への遷移はこの 2 経路のみ

---
