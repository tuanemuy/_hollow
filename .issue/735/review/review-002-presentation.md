# PR #768 レビュー (Round 2) — Presentation / アーキテクチャ整合性

対象: Issue #735（公開系エラーページの HTTP ステータスを非200にする）
観点: Presentation 層・アーキテクチャ規約・計画/ADR との整合性
レビュアー視点: Presentation / アーキテクチャ
日付: 2026-06-21
種別: Round 2（再レビュー）

## 結論サマリー

Round 1 の W-001（HTTP=404／画面=gone の意図的乖離が誤読されうる）は、両 note ルートの `notFoundComponent` に明示コメントを添える形で妥当に解消された。W-002 はスコープ外・既存コードとして見送りで適切。新たな Blocker / Warning は検出されなかった。`ensurePublicResourceExists` + `throw notFound()` 方式は ADR-004 どおりに実装され、依存方向・レイヤー責務・HTTP ステータス専管・二重防御の温存・3ルートの一貫性すべて問題なし。

## Presentation

### Blockers

なし

### Warnings

なし

- **[W-001 (Round 1) — 解消確認]** Round 1 で指摘した「HTTP=404／画面=gone(410相当の見た目) の意図的乖離が、コードだけ読むと『404 なのに gone 画面？』と誤読されうる」点は、提案どおり両 note ルートの `notFoundComponent` 行に明示コメントが追加され解消された。
  - 確認箇所: `app/routes/notes/public/$noteId.tsx:113-116` / `app/routes/u/$username/$noteSlug.tsx:121-124`
  - 内容: `// HTTP 404 (router-fixed) but a 'gone' screen on purpose: the document status can only be 404, while the screen keeps #599's gone wording for missing/private notes. See publicStatusBridge / .issue/735 ADR-004.` という同一文面が両ルートに付与されている。
  - 評価: 妥当。(1) 「404 固定はフレームワーク制約」「gone 画面は #599 の表示判断の温存」という WHY を明示し、(2) `publicStatusBridge` / ADR-004 への参照で一次情報源に辿れる。Round 1 で懸念した「将来の実装者が kind="gone" を notFound に揃えようとして壊す／410 を再導入しようとする」リスクを的確に潰している。CLAUDE.md「Add a comment only when the WHY is non-obvious — a hidden constraint」にも合致する適切なコメント追加。`$username/index.tsx` は元々画面 kind が notFound でステータス 404 と一致するため、同種コメントが不要なのも正しい判断。

- **[W-002 (Round 1) — 見送り確認]** `loadProfileMeta`（`$username/index.tsx`）の meta 取得 NotFound 握り潰しが手書き try/catch で、note 2ルートの `loadPublicNoteMeta` 委譲と非対称、という指摘の見送りは妥当。
  - 確認箇所: `app/routes/u/$username/index.tsx:97-125`（`getPublicProfile` を try/catch + `isNotFoundError` でインライン判定）
  - 評価: これは本 PR の差分外の既存コード（`git diff` 上、当該 loader ブロックは変更されていない）であり、本 Issue のスコープ（render server fn のステータス付与）にも含まれない。`publicProfileMeta.ts` 抽出は別 Issue 相当という Round 1 の結論どおりで、今回の対応は不要。

### Notes

- **[N-001]** notFound 伝播経路が正しいことを再確認。`ensurePublicResourceExists` が server fn ハンドラの await 経路内で投げる `notFound()` は、`errorResponseMiddleware.ts:32`（`if (isRedirect(error) || isNotFound(error)) throw error;`）を素通りで再 throw され、router の `load()` がドキュメントステータスを 404 に確定する。`setResponseStatus` を一切使わず、ADR-004 の「事実3／router 専管」と完全一致。middleware が成功 return 時にステータスを上書きしないこと（catch 節でのみ `setResponseStatus` を呼ぶ）も `errorResponseMiddleware.ts:29-47` で再確認した。

- **[N-002]** レイヤー規約遵守は良好（Round 1 から不変）。`publicStatusBridge.ts` は `@tanstack/react-router` の `notFound`（フレームワーク境界）と `@/core/application/errors` の `isNotFoundError`（インワード依存）のみを import。純 `.ts` で JSX を持たず `components/` への逆依存が無く、renderable 生成は各ルート `.tsx` に残っている。`isNotFoundError` は `error instanceof NotFoundError`（`errors/index.ts:57-59`）で、`NotFoundError` は `kind: "notFound"`（同 :44-55）にシリアライズされ、`httpStatusFor` で 404 にマップされる契約も無改変。HTTP status mapping is presentation-only に合致。

- **[N-003]** 3ルートの実装が一貫している。3ルートとも (1) `Promise.all` で `getContainer`/usecase/コンポーネントを動的 import、(2) `ensurePublicResourceExists(async () => { const container = await getContainer(); return usecase(...); })`、(3) `renderServerComponent(...)` を return、という同一構造。`$username/index` は `getPublicProfile` 1 本で存在判定が完結する根拠（一覧/タグ 0 件は NotFound を投げない）が `index.tsx:71-74` のコメントに明記され正しい。

- **[N-004]** 二重防御が温存され矛盾していない。`notFoundComponent`（前段 notFound 時）・`errorComponent`（非 NotFound system 時）・コンポーネント側 #599 方式(d)（TOCTOU の保険）の三層が全ルートで残存。前段チェックが主経路を担い、方式(d) が極稀ケース（画面は出るが HTTP=200、AC-5 で許容済み）の保険として機能する役割分担に矛盾なし。

- **[N-005]** テスト（`publicStatusBridge.test.ts`）は AC-6 / ステップ4 の 3 検証点（解決→resolve、NotFoundError→`isNotFound(thrown)===true`、非 NotFound→re-throw）を過不足なくカバー。`isNotFound`（router 由来の notFound であること）で検証している点が、ADR-004 の「`notFound()` だけがドキュメントを 404 にする」という方式の本質を正しく突いている。

- **[N-006]** Round 1 → Round 2 で新規導入された差分は無く（追加されたのは notFoundComponent のコメント 2 箇所のみ）、退行は確認されなかった。410→404 の割り切り・errorResponse.ts への 410 kind 不追加といった計画のスコープ除外も引き続き守られている。
