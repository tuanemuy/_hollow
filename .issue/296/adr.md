# ADR — Issue #296: DEVモードで __root.tsx の loadAppContext が画面遷移ごとに発火する

## ADR-001: `loadAppContext` を `loader` へ移さず、`beforeLoad` のクライアントキャッシュで抑止する

### Status

Accepted

### Context

root route の `beforeLoad: () => loadAppContext()` がナビゲーションごとに `_serverFn` を発火する（`beforeLoad` は `staleTime` の影響を受けず毎回走る）。これを止めたい。

ADR-008（Issue #293）の方針に素直に従うなら「重い server fn は `loader` に寄せ、`staleTime: Infinity` で1回化」だが、root では適用できない:

- `loadAppContext` の戻り値 `config` は root の `beforeLoad` が context に積み、**context 継承**で root + 子ルート計18個の `head()`（`match.context?.config`）に配られている。
- TanStack Router の **loaderData は子ルートに継承されない**。config を root の loader 戻り値にすると、子ルートの head が config を取得できず、全ルートの meta/OG/canonical が欠落する。
- コードベースに head が loaderData を読む前例は無く、root loader が子の head 計算時点で解決済みである保証も無い。

選択肢:
1. config を loader に移し、18個の head を loaderData 参照へ書き換える → 影響範囲が広く、head×loaderData の前例も無く不確実。Issue スコープ（対象: `__root.tsx`）も超える。
2. config を context に積み続け、`beforeLoad` の server fn 呼び出しだけをクライアントで1回化する → `__root.tsx` 内に閉じ、head 群を一切変更しない。

### Decision

選択肢2を採る。`beforeLoad` は引き続き `{ config }` を context に積むが:

- **SSR（`import.meta.env.SSR`）:** 毎リクエスト `loadAppContext()` を実行（リクエストスコープで正しい `appUrl` を取得、in-process でネットワーク RPC なし）。モジュールキャッシュは使わない（ワーカーのモジュールスコープはリクエスト間共有のためクロスリクエスト汚染になる）。
- **クライアント:** モジュールスコープのプロミスキャッシュを介し、最初のナビゲーションで1回だけ `loadAppContext()` を呼び、以降は同じプロミスを再利用。

root には loader が無く `staleTime` は no-op のため、誤解を招く `staleTime` 行は削除する。

### Consequences

- 良い点:
  - per-navigation の `loadAppContext` 発火が「ナビゲーションごと N 回」→「クライアントセッション中 最大1回」に減る（Issue の主訴のデバッグノイズを解消。本番のパフォーマンスにもプラス）。
  - 18個の head 関数を一切変更しない。変更は `__root.tsx` のみ（Issue スコープに収まる）。
- トレードオフ:
  - クライアント専用のモジュールスコープ可変状態（memoization キャッシュ）を1つ持つ。`import.meta.env.SSR` ガードでサーバーでは使わず、config はセッション中不変なので無効化も不要。
  - 初回クライアントナビゲーションで1回の RPC は残る（完全0回化は SSR 値のシリアライズ機構新設が必要でスコープ過大）。

---

## ADR-002: クライアントの `appUrl` は `window.location.origin` ではなくサーバー値のキャッシュ再利用とする

### Status

Accepted

### Context

クライアントで config を組み立てる別案として「静的 `content` + `window.location.origin` を `appUrl` に」する手もある（RPC を完全に0回化できる）。だが `appUrl` は SSR 時に `env.APP_URL` で確定し、initial HTML の `og:url` / `canonical` に焼かれている。クライアントで `window.location.origin` を使うと:

- DEV では `APP_URL`（例: `http://localhost:8787`）と実際の dev サーバー origin（例: `http://localhost:3000`）が食い違い、hydration 時に meta タグの不一致（React hydration mismatch warning）を招く恐れがある。
- 本番でも代替ドメイン経由アクセス時に canonical/OG がブレる。

### Decision

クライアントでも SSR と同一の `appUrl` を使うため、`window.location.origin` フォールバックは採らず、`loadAppContext()`（サーバー値）をクライアントで1回 fetch してキャッシュ再利用する（ADR-001 の方式）。

### Consequences

- 良い点: server/client で `appUrl` が一致し hydration mismatch を回避。canonical/OG が常に `APP_URL` 基準で一貫する。
- トレードオフ: 完全な0回 RPC は諦め、初回クライアントナビゲーションで1回の RPC を許容する（ADR-001 と同じトレードオフ）。

---
