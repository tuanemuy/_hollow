# ADR — Issue #636: 主要画面を <Suspense> ＋スケルトンで分割描画

## ADR-001: route-level deferred loader ではなく RSC 内 Suspense を採用

### Status
Proposed

### Context
TanStack Router には `pendingComponent` / deferred loader による遅延描画手段もある。一方、本プロジェクトの loader は RSC bridge（server fn → `renderServerComponent`）であり、`@tanstack/react-start-rsc` は flight stream のデコードを `<Suspense>` 要素で打ち切る実装になっている。

### Decision
RSC ツリー内に `<Suspense>` を張り、データ取得を子の async サーバーコンポーネントへ押し下げる方式を採用。route の `errorComponent` は「shell すら出せない失敗」（auth/validation）用として残す。

### Consequences
- 良い点: 現行の「loader = server fn bridge」構成を変えずに streaming 分割描画を実現できる。シェルは即解決され、境界内は後から埋まる。
- トレードオフ: handler 内で await してから props で渡す既存パターンを各ルートで解体する必要がある。

---

## ADR-002: セクション間のデータ共有は cache 済みローダーの直接 await で行う

### Status
Proposed

### Context
ホームでは tree / tags / savedViews を複数の client 子コンポーネント（Toolbar / FilterBar / BulkActionBar）が共有しており、props 持ち回りだと境界分割できない。

### Decision
各 async セクション RSC が `cache(serverData(...))` でメモ化済みのローダーを直接 await する。同一 RSC レンダー内では dedup されるため重複 fetch は発生しない。

### Consequences
- 良い点: 境界を独立させつつ重複取得を回避。
- トレードオフ: cache() の同一レンダー内 dedup に依存する（レンダーを跨ぐと再取得）。
- 注記: handler 実行（renderToReadableStream 開始前）と RSC レンダーでは React の cache スコープが分かれ、dedup されない可能性がある（home の viewId 分岐で handler が `loadAllTags` を await するケース）。重複 fetch 1回で実害は小さいが、実装時に確認する。

---

## ADR-004: ホームの境界はローダー単位を基本、Toolbar のみ合流境界を許容

### Status
Proposed

### Context
Issue は「5系統を個別の Suspense 境界へ分割」と明記し、モック P10 も ③タグ ④referencing title ⑤ノート一覧を独立境界として描く。一方、Toolbar は tags / tree / savedViews の3データを単一の client コンポーネントとして必要とする構造的制約がある。

### Decision
タグチップ群（境界③）・referencing title（④）・ノート一覧（⑤）はローダー単位の独立境界とする。Toolbar のみ3ローダーを await する合流境界 `ToolbarSection` とし、cache dedup によりタグ境界③との重複取得は発生しない。

### Consequences
- 良い点: Issue の「1系統の失敗が他境界を巻き込まない」要件をタグチップ群レベルで満たしつつ、Toolbar の構造を壊さない。
- トレードオフ: Toolbar は tree / savedViews いずれかの失敗でも丸ごとエラー表示になる（構造的制約として許容）。

---

## ADR-003: セクション失敗はクライアント ErrorBoundary＋汎用文言＋リトライに留める

### Status
Proposed

### Context
streaming 後に RSC 内で throw されたエラーは server fn の `errorResponseMiddleware` を通らず、flight stream 経由でクライアント境界に届く。本番では React により詳細が redact される。

### Decision
共通 `SectionErrorBoundary`（client）で受け、kind 別メッセージ分岐はせず「セクション名＋汎用文言＋再読み込みボタン（`router.invalidate()`）」とする。

### Consequences
- 良い点: redaction 前提でも一貫した UX。規約4のリトライ導線を満たす。
- トレードオフ: セクション単位ではエラー種別ごとの細かい案内ができない（全画面エラーは従来どおり `errorComponent` が担う）。

---

## ADR-005: ホーム境界③④（タグ／referencing title）は FilterBar の構造的制約により合流境界とする

### Status
Accepted

### Context
計画では ③タグチップ群（`loadAllTags`）と ④referencing title（`loadReferencingNoteTitle`）を独立境界とする想定だった。しかし実装上、タグチップ群・directory チップ（tree 由来の `directoryName`）・referencing チップは単一の client コンポーネント `FilterBar` 内にあり、`useOptimistic` のフィルタ状態（toggleTag / clearAll 等）を共有している。独立境界化には FilterBar の client 分解（楽観状態の分割）が必要で、計画自身の制約「client 子コンポーネントはそのまま」および既存テスト（`FilterBar.test.tsx` のタグチップ検証）と衝突する。

### Decision
ADR-004 の原則（複数データを要する単一 client コンポーネント＝最小限の合流境界）を FilterBar にも適用し、ホームの境界は ①ツールバー（savedViews）②フィルタ（tags + tree + referencing title、`BulkActionBar` 含む）③ノート一覧（owned）の 3 境界＋シェル側 2 境界とする。

### Consequences
- 良い点: client コンポーネントを温存し、楽観更新まわりのリグレッションリスクを避けつつ「1系統の失敗・遅延の局所化」は維持。
- トレードオフ: tags / tree / referencing title のいずれかの失敗でフィルタ境界が丸ごとエラー表示になる。Issue の「5系統を個別境界へ」との差分なので、必要なら Issue #636 にスコープ調整をコメントで記録する。

---

## ADR-006: SectionErrorBoundary に scope（page / shell）を持たせる

### Status
Accepted

### Context
リトライの `router.invalidate()` は `routerInvalidate.ts` の不変条件により `_app` 除外（`routerInvalidate`）と `_app` 専用（`appShellInvalidate`）に分かれている。Sidebar の境界①②は `_app` シェル loader 由来のため、`routerInvalidate` ではデータが再取得されない。

### Decision
`SectionErrorBoundary` に `scope?: "page" | "shell"`（既定 `"page"`）を持たせ、ページ内セクションは `routerInvalidate`、Sidebar セクションは `scope="shell"` で `appShellInvalidate` を使う。

### Consequences
- 良い点: `_app` の `staleTime: Infinity` 運用（ADR-010 系）を崩さずに両方のリトライ導線が成立する。
- トレードオフ: 呼び出し側が境界のデータ源（leaf loader か shell loader か）を意識する必要がある。

---

## ADR-007: 件数見出し「N 件のノート」はノート一覧境界内へ移動

### Status
Accepted

### Context
件数は `owned.count` 依存のためシェルでは即描画できない。h1 直下の位置を保つには同一ローダーを await する小境界を追加する必要があるが、エラー境界・アナウンスが二重になる。

### Decision
計画ステップ4どおり `NotesSection` 側へ移し、ノート一覧境界の先頭で描画する（視覚位置は h1 直下 → フィルタ下へ変わる）。フォールバックは `NoteListSkeleton` 先頭の小バーが件数行を兼ねる。

---

## ADR-008: ストリーミング対象データが無いルートには Suspense 境界を設けない

### Status
Accepted

### Context
ステップ6の対象ルートのうち、`export`（ExportForm はクライアントコンポーネントでデータ取得なし）、`settings/profile`・`settings/account-delete`（auth とコンフィグのみ。いずれも redirect を投げうるため handler に置く必要がある）は、handler から props を渡した時点で RSC 内に await すべき非同期データが残らない。また `exports/$jobId` は単一ローダーで「存在確認＝全データ取得」であり、存在確認を handler に残す以上、Suspense 用に同じローダーを境界内で再 await すると重複 fetch と毎ポーリングのスケルトン点滅（フリッカー）だけが増える。

### Decision
- `export` / `settings/profile` / `settings/account-delete`: auth（＋コンフィグ解決）を handler に移し、Page は同期レンダー。Suspense 境界・スケルトンは設けない（サスペンドし得ない境界は無意味なため）。`export` は `ExportFormPage` が `notes/$noteId/export` と共用のため Page 側の `requireCurrentUser` を維持し、変更しない。
- `exports/$jobId`: handler が `loadExportJob` を await（存在確認＝not-found 判定）し、取得済み DTO を props で渡す。Suspense 適用外（計画ステップ6の選択肢 (b)）。エラーは従来どおり route の `errorComponent` が受ける。

### Consequences
- 良い点: 無意味な境界・重複 fetch・ポーリング時のフリッカーを回避。redirect/auth は handler に残るという計画の不変条件も満たす。
- トレードオフ: これらのルートは「初回分割描画」の DoD 対象から外れる（描画すべき静的シェルとデータの分離が存在しない／単一ローダー詳細ページのため）。Issue #636 へのスコープ調整コメントの対象。

---

## ADR-009: ノート詳細は単一 Suspense 境界とし、not-found は境界内の JSX 返却を維持

### Status
Accepted

### Context
計画は「本文/メタ/バックリンクを独立境界に — 既存ローダーが分かれている場合」とする。実際にはタイトル・本文・メタ・バックリンクはすべて単一の `loadNoteDetail` 由来で、publishState / tree / tags は `NoteActions`・`NoteMetaPanel` という単一コンポーネントに合流する（ADR-004 の構造的制約と同型）。P11 モックも単一フォールバック（1 つの aria-busy コンテナ）で描かれている。また非存在ノートの not-found は `throw notFound()` ではなく JSX を直接返す既存方式（`.issue/12/adr.md` ADR-004）のため、Suspense 境界内でも安全に成立する（境界内で機能しないのは redirect / notFound の throw のみ）。

### Decision
`NoteDetail` を「同期シェル（SectionErrorBoundary + Suspense + `NoteDetailSkeleton`）＋ async `NoteDetailContent`」に再構成し、境界は 1 つとする。not-found JSX 返却は `NoteDetailContent` 内に残し、handler への移動はしない（handler で `loadNoteDetail` を await すると本文ストリーミング自体が無効化されるため）。

### Consequences
- 良い点: P11 モック準拠の skeleton を即描画しつつ、ローダー構成と client コンポーネントを温存。
- トレードオフ: メタ・バックリンクが本文と同時にしか解決しない（同一ローダーなので実質差なし）。

---

## ADR-010: ハイドレーション停止（TC-A / TC-A2 ブロッカー）はライブラリのレースが原因 — @tanstack/react-router / react-start のアップグレードで解消

### Status
Accepted

### Context
Suspense 分割導入後、初回 SSR ロードでクライアントのハイドレーションがルートコンテンツ全体で suspend したまま commit されず、ページが非インタラクティブになった（TC-A / TC-A2）。計測の結果:

- クライアント側 `createServerComponentFromStream` の flight デコード（`createFromReadableStream`）が root すら resolve しない。HTML に埋め込まれた RSC ストリームは先頭チャンク（`:N...`）1 つだけで、後続チャンクも終端（`$_TSR.e()`）も HTML に存在しなかった。
- サーバー側では flight 全チャンクの pump・seroval `onDone`・serialization 完了まで正常に走っていた。落ちていたのは「シリアライズ済みスクリプトの HTML への注入」。
- 原因は `@tanstack/router-core@1.169.2` のレース: Suspense 分割により SSR decode が root で早期 return し flight ストリームが React レンダー中も open のままになると、seroval ストリームの後続チャンクは `<Scripts>`（バリアスクリプト）レンダー後に `ScriptBuffer` へ enqueue される。データ解決が速い場合（localhost）、serialization が HTML transform 開始前に完了し、transform は「serializationAlreadyFinished かつ buffered html なし」の fast path に入り、バリア未リフトのまま `ScriptBuffer` のキュー（flight 後続チャンク＋`$_TSR.e()`）を全て破棄して HTML を閉じる。クライアントは永遠に来ないチャンクを待ち続け、ルートマッチ全体（Suspense 外の同期 JSX 含む）のハイドレーションが suspend し続ける。
- `@tanstack/router-core@1.171.13` で transform / ScriptBuffer が書き直され（fast path 廃止、`setRenderFinished` 時に serialization 完了済みなら `scriptBuffer.flush()`）、このレースは解消されている。

### Decision
node_modules への独自パッチではなく、上流修正を取り込む: `@tanstack/react-router` を `^1.170.15`（router-core 1.171.13 を固定参照）、`@tanstack/react-start` を `^1.168.25`（react-start-rsc 0.1.24）へアップグレードする。プロジェクトコード（Suspense 分割構成）は変更しない — 構成自体はライブラリの想定パターンに合致しており、問題は純粋に上流のバグだった。

### Consequences
- 良い点: ホームのタグチップ・表示形式タブ・選択モード（BulkActionBar/チェックボックス）・クライアントナビゲーションが dev サーバーで全て動作することを確認。SSR HTML に flight 全チャンクと `$_TSR.e()` が含まれるようになった。`pnpm typecheck` / `test:unit`（3516 件）も通過。
- トレードオフ: TanStack Start のマイナーバージョン複数分の更新を含む。RSC パッケージは 0.0.44 → 0.1.24 と alpha 系列のジャンプであり、本番ビルド（wrangler）での streaming 動作の再確認（計画のリスク項目）は引き続き必要。
