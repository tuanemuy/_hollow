# Issue #735 計画レビュー — アーキテクチャ整合性・実現可能性・リスク（round 2）

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性 / 実現可能性 / リスク
対象: `.issue/735/plan.md` / `.issue/735/adr.md`
前回: `.issue/735/plan-review/round-1-arch-risk.md`（P-001〜P-004 / S-001〜S-003）

再確認した実コード:
- `app/routes/notes/public/$noteId.tsx`（現状の render server fn + meta loader + notFoundComponent/errorComponent 配線）
- `app/routes/u/$username/index.tsx` / `app/routes/u/$username/$noteSlug.tsx`（`useLoaderData()` + `<>{Rendered}</>`）
- `app/core/presentation/errorResponseMiddleware.ts`（catch 内でのみ `setResponseStatus`）
- `app/components/public/PublicNoteDetail.tsx`（`cache(serverData(...))` = `React.cache` を 36 行で確認）
- `app/core/presentation/__tests__/csrfMiddleware.test.ts`（`setResponseStatus` を `vi.fn()` でモックし `toHaveBeenCalledWith(403)`）
- `app/core/application/errors/index.ts`（`isNotFoundError` 型ガード）
- `react-start-rsc@0.1.24` の `renderServerComponent.d.ts`（`<TNode>(node) => Promise<RenderableServerComponentBuilder<TNode>>`）
- `start-server-core@1.169.14` の `request-response.d.ts`（`setResponseStatus(code?: number, text?: string): void`）
- `app/core/presentation/` 配下に `.tsx` ファイルが0件であること（`find` で確認）

総評: Round 1 の指摘 P-001〜P-004 / S-001〜S-003 は**すべて妥当に反映されている**。特に重点確認対象だった3点:

1. **共通ヘルパーの純 `.ts` 化 + renderable コールバック化（P-003/P-004 反映）** — 型安全に実装可能であることを実型定義で裏取りした。`setResponseStatus(code?: number)` は任意数値を取るため 410 が通る。`renderServerComponent<TNode>` の戻り値が `TNode` ごとに変わる問題は、ヘルパーが JSX を生成せず `renderNotFound: () => T` / `renderOk: () => T` を受け取り戻り値型を単一の `T` に統一することで解消する。これはジェネリック1本で型が通り、`app/core/presentation/` を `.tsx` 化せず・components 層への逆依存も作らずに済む。レイヤー規約（presentation は cross-cutting ユーティリティ、components を名指ししない）に正しく沿う。
2. **二重取得が構造上必発という記述修正（P-002 反映）** — plan リスク欄・ADR-001 Decision/Consequences とも「`React.cache` のスコープは `renderToReadableStream` の内側、server fn ハンドラ本体は外側、ゆえにメモ化は構造的に効かず正常系は必ず2回」と確定的に書き換え済み。実コード（`PublicNoteDetail.tsx:36` の `cache(serverData(...))`）の確認も明記。「メモ化が効けば回避」の楽観は撤回されている。技術的に正しい。
3. **PoC の本番ランタイム必須ゲート化（P-001 反映）** — ステップ1の判定基準が「dev と本番ランタイム（`pnpm build && pnpm start`、Cloudflare Workers）の**両方**で 410 が観測できたときのみ GO」の強制条件になり、ステップ5・リスク欄とも整合。本 Issue の本質（本番クローラ向けステータス）に照らして正しいゲート設計。

新たな致命的問題は見つからなかった。以下、軽微な確認点（改善提案）のみ。

---

#### 問題点（要修正）

問題点ゼロ。

Round 1 の P-001〜P-004 はすべて妥当に反映され、いずれも実型定義・実コードで実現可能性を再確認した。新たなアーキテクチャ違反・実現不能点・未評価リスクは検出されなかった。方式選定（ADR-001 (C) + ADR-002 (ii)）はレイヤー分離（presentation 完結 / domain・usecase 無改変 / エラーシリアライズ契約無改変 / 列挙耐性維持）を守っており、依存方向にも違反しない。

---

#### 改善提案（検討推奨）

- **[S-001] ヘルパー戻り値の `Promise<Promise<T>>` フラット化を擬似コードの注記で1行補足すると親切**
  - 理由: 擬似コードは `renderOk: () => T` を `return opts.renderOk()`（await せず return）する一方、ルート側は `renderOk: () => renderServerComponent(<...>)` を渡す。`renderServerComponent` は `Promise<RenderableServerComponentBuilder<TNode>>` を返すため、推論上 `T = Promise<...>` となり、`async` 関数の戻り値は `Promise<T> = Promise<Promise<...>>`。TS は `Promise<Promise<X>>` を `Promise<X>` に collapse し、ランタイムも async return で自動 await するため**実害はない**が、実装時に「`T` を renderable 本体（非 Promise）にして `renderOk: () => Promise<T>` で受けるか、`T` を Promise 込みにするか」の型設計をどちらかに寄せておくと、`exactOptionalPropertyTypes` 下でも素直に通る。どちらでも成立するので要修正ではないが、擬似コードに「`renderOk`/`renderNotFound` は Promise を返してよい（async return で吸収）」と1行あると実装者が迷わない。

- **[S-002] ルートの `loader` 戻り値型がユニオン化することと `useLoaderData()`/`<>{Rendered}</>` の描画整合を1行確認しておくと盤石**
  - 理由: P-003(a) 採用後、ルートの render server fn の戻り値は「成功 renderable」と「NotFound renderable」の**ユニオン**になる（`RenderableServerComponentBuilder<PublicNoteDetail> | RenderableServerComponentBuilder<ErrorPage>`）。3ルートとも `const Rendered = Route.useLoaderData(); return <>{Rendered}</>;`（`$noteId.tsx:106-109` / `$username/index.tsx:176` / `$noteSlug.tsx:115`）で描画しており、renderable は JSX 子として埋め込むだけなのでユニオンでも描画上は問題ない見込み。ただし `useLoaderData()` の型がユニオンを正しく担保するか（`{Rendered}` が `ReactNode` として受かるか）は型チェックで初めて分かる。ステップ5 の `pnpm typecheck` で必ず捕捉できる範囲だが、plan に「loader 戻り値がユニオン化するため typecheck で renderable ユニオンが `ReactNode` に収まることを確認」と1行入れておくと、実装時の型エラーを想定済みにできる（要修正ではない）。

- **[S-003] `errorResponseMiddleware` がハンドラ成功時にステータスを上書きしないことを ADR-002 に明示しておくと安全**
  - 理由: 実コード（`errorResponseMiddleware.ts:28-47`）を確認したところ、`setResponseStatus` を呼ぶのは**catch 節のみ**。ヘルパーがハンドラ本体で `setResponseStatus(410)` を呼んで正常 return する経路では middleware は何もしないため、410 は上書きされない。これは本方式が成立する前提そのものだが、ADR-002 には「NotFoundError 以外の例外は middleware が 500 に倒す」とは書かれているものの「**正常 return 時は middleware がステータスに触れない**（だからハンドラ内 `setResponseStatus(410)` が生き残る）」という肝心の前提が明示されていない。1行入れておくと、将来 middleware を触る人が誤って成功時にもステータスを書く改修を入れるのを防げる（要修正ではないが堅牢性が上がる）。

---

#### 良い点

- **Round 1 指摘の反映が網羅的かつ正確。** P-001（本番ゲート）/ P-002（二重取得確定）/ P-003（純 `.ts` + コールバック）/ P-004（戻り値型統一）/ S-001（ADR-004 上書き）/ S-002（TOCTOU を AC-5 に固定）/ S-003（テスト簡素化）がすべて plan・adr の本文に落ちており、レビュー履歴欄でも対応が追跡可能。指摘の「文面だけ直して設計が伴わない」類の浅い反映ではなく、設計（純 `.ts` 化）・型（戻り値統一）・検証（本番ゲート）まで一貫して整合している。
- **P-003 の設計変更が実型定義で裏取りできる。** `renderServerComponent<TNode> => Promise<RenderableServerComponentBuilder<TNode>>` と `setResponseStatus(code?: number)` を実 `.d.ts` で確認。ヘルパーを「JSX を持たず renderable コールバックを受ける純粋ジェネリック関数」にする設計は、(1) presentation 層に初の `.tsx` を持ち込まない（実際 `app/core/presentation/` は `.tsx` 0件）、(2) components 層への逆依存を作らない、(3) 戻り値型を単一 `T` に統一して型安全、の3点をすべて満たす。レイヤー規約（presentation = cross-cutting ユーティリティ、特定コンポーネントを名指ししない）に厳密に沿っている。
- **二重取得の根拠記述が実コードと一致。** `PublicNoteDetail.tsx:36` の `cache(serverData(...))`（`React.cache`）を確認。`React.cache` のスコープが `renderToReadableStream` の内側／ハンドラ本体が外側、という説明は React のキャッシュセマンティクスとして正しく、「正常系は構造上必発で2回」という確定記述は妥当。「read-only 単一行取得（D1 O(1) 寄り）で許容」という結論も適切で、最適化を試みて時間を浪費しない誘導になっている。
- **テスト方針が既存パターンに正しく接地。** `csrfMiddleware.test.ts` が `setResponseStatus` を `vi.mock` し `toHaveBeenCalledWith(403)` を検証する既存パターンを確認。純 `.ts` ヘルパー化により `renderServerComponent` のモックが不要になり、`ensureExists`/`renderNotFound`/`renderOk` のコールバック DI + `setResponseStatus` モックだけでユニットが完結する、という簡素化（ステップ4・テスト方針）は実コードのパターンと整合する。
- **リスク駆動の進め方とスコープ規律が維持されている。** 最大の不確実点（`setResponseStatus` の SSR 反映）を本番ランタイム必須 PoC で潰し、不成立時は ADR-001 (D) へ退避し Issue を open 据え置く終端条件（AC-6）まで固定。認証系・usecase 変更・kind マップ変更を正しくスコープ外に置いており、Issue 範囲を超えていない。
