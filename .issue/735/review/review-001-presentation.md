# PR #768 レビュー — Presentation / アーキテクチャ整合性

対象: Issue #735（公開系エラーページの HTTP ステータスを非200にする）
観点: Presentation 層・アーキテクチャ規約・計画/ADR との整合性
レビュアー視点: Presentation / アーキテクチャ
日付: 2026-06-21

## 結論サマリー

`ensurePublicResourceExists` + `throw notFound()` 方式は、計画・ADR-004 の設計判断どおりに実装されており、アーキテクチャ規約（依存方向、レイヤー責務、presentation での HTTP ステータス専管）にも違反していない。3ルートの実装は一貫しており、二重防御（コンポーネント側 #599 方式(d) + ルート `notFoundComponent`）も温存されている。Blocker はなし。改善余地として軽微な Warning / Note を挙げる。

## Presentation

### Blockers

なし

### Warnings

- **[W-001]** ヘルパー JSDoc が「リテラルな Issue #735 の要件は 410」と書く一方、コード上は note ルートで `ErrorPage kind="gone"` を描画している点の整合性が一見分かりにくい
  - 場所: `app/core/presentation/publicStatusBridge.ts:27-32` / `app/routes/notes/public/$noteId.tsx:113` / `app/routes/u/$username/$noteSlug.tsx:121`
  - 理由: HTTP ステータスは 404 一律（ADR-004）だが、note ルートの `notFoundComponent` は `kind="gone"`（画面表示は「Gone」）のまま残している。これは ADR-003/ADR-004 の「列挙耐性のためステータスは 404 一律、画面は #599 のまま温存」という意図的決定どおりで**実態と矛盾はしていない**。ただし「HTTP=404／画面=gone(410相当の見た目)」という意図的な乖離が、コードだけ読むと「404 なのに gone 画面？」と誤読されうる。ADR を読まない将来の実装者がステータスと画面 kind を揃えようとして壊す（例: `kind="gone"` を `kind="notFound"` に変えてしまう／逆に 410 を再導入しようとする）リスクがある。
  - 提案: `$noteId.tsx` / `$noteSlug.tsx` の `notFoundComponent: () => <ErrorPage kind="gone" />` 行に「HTTP は 404 だが gone 画面は #599 の表示判断を温存（ADR-003/004）」の 1 行コメントを添える。あるいは現状の `publicStatusBridge.ts` JSDoc で十分と判断するなら Note 降格でも可。

- **[W-002]** `loadProfileMeta`（`$username/index.tsx`）は `getPublicProfile` を try/catch + `isNotFoundError` で自前判定しているのに、`$noteId`/`$noteSlug` の meta loader は `loadPublicNoteMeta`（内部で同等処理）に委譲しており、meta 取得の NotFound 握り潰しパターンが 3 ルートで非対称
  - 場所: `app/routes/u/$username/index.tsx:97-125`（手書き try/catch）vs `app/routes/notes/public/$noteId.tsx:48-60` / `$noteSlug.tsx:53-66`（`loadPublicNoteMeta` 委譲）
  - 理由: これは本 PR の差分ではなく既存コードだが、本 PR が「3ルートの一貫性」を強く意識した変更であるため指摘しておく。`publicNoteMeta.ts` に相当する `publicProfileMeta` ヘルパーが無いため `$username` だけ meta 取得が手書きになっている。動作上の問題はないが、列挙耐性（NotFound→null フォールバック）の実装が 1 箇所だけインラインなのは保守上の非対称。
  - 提案: スコープ外（本 Issue は render server fn のステータス付与に閉じる方針）。将来 `publicProfileMeta.ts` への抽出を別 Issue 化する程度で可。今回の対応は不要。

### Notes

- **[N-001]** `ensurePublicResourceExists` + `throw notFound()` の伝播経路は正しい。server fn ハンドラの await 経路内で throw された `notFound()` は `errorResponseMiddleware`（`errorResponseMiddleware.ts:32` の `if (isRedirect(error) || isNotFound(error)) throw error;`）を**素通り**で再 throw され、`server-functions-handler.js` → loader → router の `load()` が notFound を検出してドキュメントを 404 に確定する。ADR-004 の「事実3」「router 専管」記述と実装が完全に一致しており、`setResponseStatus` を一切使わない点も正しい。middleware を読んで「成功 return 時はステータスに触れない／catch 節でのみ `setResponseStatus`」という ADR-002 の前提条件も実コードで確認できた。

- **[N-002]** レイヤー規約遵守は良好。
  - presentation 層が `@tanstack/react-router` の `notFound` を import するのは適切（同層の `authGuard.ts` が `redirect`、`errorResponseMiddleware.ts` が `isNotFound/isRedirect` を既に import 済みで、フレームワーク境界ユーティリティとして確立済みのパターン）。
  - 依存方向 presentation → application（`@/core/application/errors` の `isNotFoundError`）は正しくインワード。
  - ヘルパーは純 `.ts` で JSX を持たず、`components/` への逆依存が無い。renderable（`<PublicNoteDetail/>` 等）の生成は各ルート `.tsx` 側に残っており、presentation → components の逆依存回避という ADR-002/計画 P-003 の設計どおり。
  - HTTP ステータスマッピングが presentation に閉じ、ドメイン/usecase/エラーシリアライズ契約（`errorResponse.ts` の `HTTP_STATUS_BY_KIND`）が無改変なのも CLAUDE.md「HTTP status mapping is presentation-only」に合致。

- **[N-003]** 3ルートの実装が一貫している。3ルートとも (1) `Promise.all` で `getContainer`/usecase/コンポーネントを動的 import、(2) `ensurePublicResourceExists(async () => { const container = await getContainer(); return usecase(...); })`、(3) `renderServerComponent(...)` を return、の同一構造。コメントも同趣旨で揃っている。`$username/index` で `getPublicProfile` 1 本で存在判定が完結する根拠（一覧/タグ 0 件は NotFound を投げない）は `index.tsx:71-74` のコメントに明記されており、usecase 実装（`getPublicProfile.ts` は user 不在/deleted/suspended のみ NotFound、`getPublicNote.ts` の listing 系は別経路）とも整合。正しい。

- **[N-004]** 動的 import（`Promise.all`）の使い方は適切でエラーハンドリングの漏れは無い。`ensurePublicResourceExists` の `check` コールバック内で `getContainer()` を await しており、コンテナ解決の失敗（非 NotFound）はそのまま再 throw されて `errorResponseMiddleware` の 500/system 経路に乗る。NotFound のみ `notFound()` に変換される分岐は `try/catch` 内に正しく閉じている。`check()` の結果を捨てて RSC 内で再取得する二重取得は ADR-001/004 で「`React.cache` のスコープ差により正常系で構造上必発、read-only 単一行取得で許容」と正当化されており、コードのコメント（`publicStatusBridge.ts:24-25`「`check`'s result is discarded; the body is fetched again during RSC render」）とも一致。

- **[N-005]** 二重防御が温存され矛盾していない。`notFoundComponent`（前段 `notFound()` 時に描画）・`errorComponent`（非 NotFound system 時）・コンポーネント側 #599 方式(d)（TOCTOU・前段で漏れたケースの内部捕捉）の三層が全ルートで残存。前段チェックが正常系・異常系の主経路を担い、方式(d) は TOCTOU 等の極稀ケース（このとき画面は出るが HTTP=200、AC-5 で許容済み）の保険として機能する。役割分担に矛盾なし。

- **[N-006]** 410→404 の割り切りは ADR-004（Accepted）に「router がドキュメントステータスを専管、`setResponseStatus` 不達、notFound は 404 固定」と決定的事実つきで正当に記録され、`progress.md` に残存課題・将来フォローアップ（フレームワークが任意ドキュメントステータスをサポートしたら `ensurePublicResourceExists` を拡張）も記載されている。`publicStatusBridge.ts:27-32` のコメントも「literal #735 ask was 410 ... 404 is the achievable non-200 status」と実態に一致。`errorResponse.ts` に 410 kind を足さない（notFound 全般への副作用回避）という計画のスコープ除外も守られている。

- **[N-007]** テスト（`publicStatusBridge.test.ts`）は計画 AC-6 / ステップ4 の 3 検証点（解決→resolve、NotFoundError→`isNotFound(thrown)===true`、非 NotFound→re-throw）を過不足なくカバー。`renderServerComponent`/`setResponseStatus` をモックしない純関数テストで、実 HTTP ステータスは manual-test の curl（`manual-test/result.md`）で担保するという二段構えも妥当。
