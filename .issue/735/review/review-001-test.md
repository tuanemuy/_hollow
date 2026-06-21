# レビュー: Test 観点 — PR #768 (Issue #735)

**レビュー対象:** `app/core/presentation/__tests__/publicStatusBridge.test.ts`
**レビュー日:** 2026-06-21
**レビュアー:** Claude Code（Test 専門レビュー）

## 概要

`publicStatusBridge.ts`（`ensurePublicResourceExists`）に対するユニットテスト 3 件。実物の `NotFoundError`/`isNotFound` を使い、モックなしで純関数として検証する設計。`pnpm test:unit publicStatusBridge` で 3/3 PASS を確認済み。docs/test.md の Unit 層（fake 最小限・モック回避）方針に整合し、ルートハンドラの HTTP ステータスは手動 curl 検証に委ねる判断も plan/testing と一貫している。

---

## Test

### Blockers

なし。

3 ケース（resolve / NotFoundError→notFound 変換 / 非 NotFound 再 throw）はヘルパーの全分岐（`try` 成功・`catch` 内 `if` 真・`if` 偽）を完全に網羅しており、ブロッカー級の漏れはない。

### Warnings

- **[W-001]** `check()` の戻り値を捨てている挙動が未検証
  - 場所: `app/core/presentation/__tests__/publicStatusBridge.test.ts:7-11` / 対象 `publicStatusBridge.ts:36-38`
  - 理由: ヘルパーの契約は「`check` を呼び出して成功時は `void` を返す（結果は破棄）」だが、テストは `resolves.toBeUndefined()` で戻り値が `undefined` であることしか見ていない。`check` が「実際に呼び出されたか」「呼び出し回数」を assert していない。仮に将来 `await check()` が誤って削除されても、`Promise<void>` を返す限りこのテストは緑のまま通ってしまう（存在チェックが skip される重大なリグレッションを検出できない）。plan/testing.md「正常系で usecase が呼ばれること」を最低限ユニットでも担保したい。
  - 提案: `const check = vi.fn(async () => ({ id: "exists" }))` で渡し、`expect(check).toHaveBeenCalledTimes(1)` を成功ケースに追加する。NotFound ケース・非 NotFound ケースでも `check` が 1 回呼ばれていることを確認すると、`check` の評価有無まで固定できる。

- **[W-002]** `NotFoundError` のサブクラス（`isNotFoundError` が true を返す派生クラス）に対する分岐の代表検証がない
  - 場所: `publicStatusBridge.test.ts:13-25`
  - 理由: `isNotFoundError` は `instanceof NotFoundError`（errors/index.ts:57-59）であり、現状 `NotFoundError` には公開サブクラスが無いため実害は小さい。一方 `UnauthorizedError` には `AuthenticationError` というサブクラスが存在する前例があり、`isNotFoundError` の判定が `instanceof` ベースである以上「`NotFoundError` を継承した型でも 404 に倒れる」ことは契約の一部。ただしこれは現時点で過剰要件のため Warning 止まり。
  - 提案: 必須ではない。気になるなら 1 ケース追加するか、`NotFoundError` がサブクラス化されないという前提をコメントで明示する程度で十分。

### Notes

- **[N-001]** モックなしの純関数テスト方式は適切
  - `@tanstack/react-router` の実物 `notFound()`/`isNotFound()` を使い、`renderServerComponent`/`setResponseStatus` をモックしない設計は docs/test.md の「fake は最小限・in-memory モックで本質を偽装しない」方針に正しく沿っている。`isNotFound(thrown) === true` の検証は、フレームワークが「この標識オブジェクトを 404 ドキュメントに変換する」という外部契約への代理検証として妥当。ヘルパー自身は HTTP を持たないため、ユニットで検証できる責務の境界（NotFoundError → router notFound への変換）にテストが正しく閉じている。

- **[N-002]** ルートハンドラ（3 ルート）の自動テスト不在は妥当
  - HTTP ドキュメントステータスは TanStack Router が `router.stores.statusCode` で専管し、RSC ストリーム decode 経路を含む初回 SSR でしか観測できない（plan.md ADR-001/ADR-004）。これはユニット/integration で再現困難なため、`manual-test/result.md` の curl 検証（dev + 本番相当の両ランタイム・6 ケース全 PASS）に委ねる判断は合理的。docs/test.md「Manual / browser verification」の趣旨にも合致する。ヘルパーが純 `.ts` に切り出されたことで「変換ロジック=ユニット / ステータス反映=手動 curl」と検証境界が綺麗に分離できている点も良い。

- **[N-003]** カバレッジの穴は「代理検証の限界」に限定され、設計上許容範囲
  - ユニットが担保するのは「ヘルパーが `notFound()` を投げる」ところまで。「その `notFound()` が実際に HTTP 404 を生む」「3 ルートが正しく `getPublicNote`/`getPublicProfile` を前段で呼ぶ配線になっている」は手動 curl のみが担保する。後者（ルート配線）はユニットでもカバーされず手動 1 回限りだが、ハンドラのコードが単純（`ensurePublicResourceExists(() => getPublicXxx(...))`）であり、result.md の 6 ケースが全経路（byId/bySlug/profile × 異常/正常）を網羅しているため、穴は実質的に塞がれている。W-001 を解消すれば「前段チェックが呼ばれる」保証がユニット側にも入り、より堅牢になる。

- **[N-004]** 命名・配置・ランタイムが規約準拠
  - ファイル名 `publicStatusBridge.test.ts`、配置 `__tests__/`、Node プール（unit）で実行されることは docs/test.md の Unit 命名規約（`**/__tests__/<target>.test.ts`）どおり。テスト名も Given-When-Then 風で意図が明確。

---

## 検証メモ

- `pnpm test:unit publicStatusBridge` → 3 passed を実機確認。
- 実装 `publicStatusBridge.ts` の全分岐（try 成功 / catch→isNotFoundError 真 / catch→偽）がテスト 3 件と 1:1 対応。
- ルートハンドラ 3 箇所（`$noteId.tsx:35`, `$noteSlug.tsx:36`, `u/$username/index.tsx:75`）でヘルパーが `getPublicNote`/`getPublicProfile` をラップして呼ぶ配線を確認。テストの `check` コールバック形は実使用と一致。
- `manual-test/result.md` の 6 ケース（404×3・200×3、dev + 本番相当）は testing.md の確認項目（410 → 404 へ ADR-004 で変更済み）と整合し、再現手順も記載されている。
