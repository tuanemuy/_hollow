# 実装計画 — Issue #296: DEVモードで __root.tsx の loadAppContext が画面遷移ごとに発火する

**Issue:** #296
**作成日:** 2026-05-31
**複雑度:** 中〜大規模（当初「小規模」と判断したが、ブラウザ検証で真因が判明し格上げ）

---

## 目的

`__root.tsx` のルートコンテキストロード（`loadAppContext`）が画面遷移・URL 更新のたびに `_serverFn` を発火する。これを抑止し、ナビゲーションごとの不要な RPC（DEV のデバッグノイズ＝Issue の主訴。加えて本番のパフォーマンスにも影響）を解消する。

## 真因（検証で判明）

Issue 本文・想定方針は「DEV の `staleTime: 0` が原因で、本番は `Infinity` だから発火しない」という前提だったが、ブラウザ検証（`.issue/296/.manual-test/`）でこれが**誤り**と判明した:

- `loadAppContext()` は `loader` ではなく **`beforeLoad`** で呼ばれている（`__root.tsx:47`）。
- TanStack Router では **`beforeLoad` はナビゲーションごとに必ず再実行され、`staleTime` の影響を受けない**。`staleTime` は loader データの鮮度を制御するもの。
- root route には `loader` が存在しないため、元の `staleTime: import.meta.env.DEV ? 0 : Infinity` は **DEV/本番ともに no-op** だった。
- 実測（`staleTime: Infinity` に変更後も）: ビュー切替・フィルタ・SPA 遷移のたびに `loadAppContext` 由来の `_serverFn` リクエストが発火（遷移によっては2回）。本番も `Infinity` だが同様に発火する。

→ `staleTime` の調整では解決しない。`beforeLoad` での server fn 呼び出し自体を見直す必要がある。

## スコープ

### 含まれるもの

- `app/routes/__root.tsx`: ナビゲーションごとの `loadAppContext` 発火を抑止する

### 含まれないもの

- 18個の `head()` 関数（root + 子ルート）の変更 — config を context 経由で配り続けるため不要
- `_app/route.tsx` 等の他ルートの `beforeLoad`/`staleTime` 見直し
- `config.appUrl` のランタイム env → ビルド時定数化のような大きなアーキテクチャ変更

## 調査結果

- **`context.config` の消費:** root + 子ルート計18個の `head()` が `match.context?.config` を参照（`login.tsx`, `u/$username/$noteSlug.tsx`, `_app/index.tsx` ほか）。React コンポーネント・loader・`useRouteContext` からの参照は皆無。config は **root の `beforeLoad` が積み、context 継承で全ルートの head に届く**構造。
- **loader へ移せない理由:** loaderData は子ルートに継承されない。config を root の loader 戻り値にすると、子ルートの head が `match.context?.config` で取れなくなり、全ルートの meta/OG タグが欠落する（クラッシュではないが SEO 劣化）。コードベースに head が loaderData を読む前例も無い。
- **config の構成:** `app/config.ts` の静的 `content`（siteName/defaultTitle/defaultDescription/themeColor/optional twitterHandle）+ `appUrl`（`env.APP_URL`、ランタイム env 由来）。`content` はクライアント graph からも import 可能。`appUrl` のみサーバー専用。
- **`appUrl` の用途:** `buildHead` での `og:url` / `og:image`（絶対URL）/ `canonical`。クライアントの SPA 遷移時の head 更新はクローラーに見えない（クローラーは SSR HTML のみ取得）ため、SEO 上の重要度は SSR 初期描画に集中する。
- **`loadAppContext` の外部参照:** 無し（定義と beforeLoad 呼び出しのみ、`__root.tsx` 内に閉じている）。
- **ADR-008（Issue #293）の方針:** `beforeLoad` はクライアントでも走る前提で軽い同期計算に留め、重い server fn は `loader` 経由にする。root の現状はこれに反する（beforeLoad で server fn を直叩き）。

## 実装ステップ

### 1. `beforeLoad` の `loadAppContext` をクライアントで1回だけに抑止

- **対象ファイル:** `app/routes/__root.tsx`
- **変更内容:**
  - SSR では従来どおり毎リクエスト `loadAppContext()` を実行（リクエストスコープで正しい `appUrl` を取得、in-process でネットワーク RPC なし）。
  - クライアントではモジュールスコープの**プロミスキャッシュ**を介し、最初のナビゲーション時の1回だけ `loadAppContext()` を呼び、以降のナビゲーションはキャッシュ済みプロミスを再利用する。
  - `import.meta.env.SSR` で分岐し、サーバー側ではモジュールキャッシュを使わない（ワーカーのモジュールスコープはリクエスト間で共有されるため、キャッシュ利用はクロスリクエスト汚染になる。SSR は毎回 fresh に取得する）。
  - root には loader が無く `staleTime` は no-op のため、誤解を招く `staleTime` 行を削除する。
- **理由:** `config` は env 由来でセッション中不変なので、クライアントで1回取得すれば十分。これにより per-navigation の `_serverFn` 発火が「ナビゲーションごと N 回」→「セッション中 最大1回」に減る。`appUrl` を server/client で同一値に保てるため hydration mismatch も起きない。全 head 関数は context.config を従来どおり受け取れる。

## 設計判断

詳細は `adr.md` 参照。

- **ADR-001:** loader 移設ではなく beforeLoad キャッシュを選んだ理由（context 継承制約）。
- **ADR-002:** クライアントの appUrl 不整合を避けるため `window.location.origin` フォールバックではなくサーバー値のキャッシュ再利用を選んだ理由。

## リスクと注意点

- **モジュールスコープの可変キャッシュ:** クライアント専用の memoization。`import.meta.env.SSR` ガードでサーバー側では使わないため、クロスリクエスト汚染は起きない。config はセッション中不変なのでキャッシュ無効化も不要。
- **初回クライアントナビゲーションで1回 RPC が残る:** 「ナビゲーションごと」が解消できれば Issue の主訴（デバッグノイズ）は満たせる。0回化には SSR 値のクライアントへのシリアライズ機構の新設が必要で、スコープ過大のため見送る。
- **本番挙動の変化:** 本番でも従来は per-nav 発火していた（Issue の前提と異なる）。本修正で本番も改善する（パフォーマンス上はプラス、UX 上の後退なし）。

## テスト方針

- `pnpm dev`（DEV）でブラウザの `network requests --filter "_serverFn"` を観測し、ビュー切替・フィルタ・SPA 遷移の各操作で `loadAppContext` 由来のリクエストが**再発火しない**（初回以降0回）ことを確認する。
- SSR head/meta（タイトル・OG・canonical）が初期描画で正しいことを確認する。
- hydration warning（meta タグの不一致）が DEV コンソールに出ないことを確認する。

## レビュー履歴

### 当初判断の訂正
- 当初「小規模（staleTime 統一）」と計画したが、Phase 2 のブラウザ検証で `staleTime` 変更が無効（beforeLoad は staleTime 非対象）と実証され、真因の `beforeLoad` 発火に基づき計画を全面改訂。複雑度を「中〜大規模」に格上げした。
