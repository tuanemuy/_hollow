# 実装計画 — Issue #305: AccountDeleteForm の router.invalidate を clearCache 化する

**Issue:** #305
**作成日:** 2026-05-31
**複雑度:** 小規模

---

## 目的

アカウント削除フローで `await router.invalidate()` を使うと、削除直後に `_app` の loader（`loadAppContext`）が user 不在の状態で再実行され、その後の `router.navigate({ to: "/" })` と race を起こしうる。意味的に正しいのは「`_app` のキャッシュを完全に破棄する」操作なので、`router.clearCache` でフィルタ指定して `_app` match を捨てる。これにより直後の navigate で `_app` が新規マウントされ、過去 cached `userDto` の race が発生しない。

## スコープ

### 含まれるもの
- `app/components/identity/AccountDeleteForm/index.tsx` の `await router.invalidate();` を `router.clearCache({ filter: (match) => match.routeId === "/_app" });` に置換
- 直前の説明コメント（旧 `invalidate` 前提）を clearCache の挙動に合わせて更新

### 含まれないもの
- `await router.navigate(...)` の挙動変更（既存のまま残す）
- 他箇所の `router.invalidate()` 呼び出し（`_app` route の loader 等）

## 現状（実コード）

`app/components/identity/AccountDeleteForm/index.tsx` の `onConfirm` 内 `startTransition` ブロック（line 50-54 付近）:

```ts
await deleteAccount({ data: { confirmation: draft } });
// 過去訪問の cached _app match に残る旧 userDto を破棄するため _app も invalidate（rule 1）
await router.invalidate();
await router.navigate({ to: "/", search: HOME_SEARCH });
setError(null);
```

- ルート `_app` のファイルは `app/routes/_app/route.tsx`、routeId は `/_app`。
- Issue 本文は `index.tsx:33` で `router.navigate` に await が無い前提だが、実コードは `onConfirm`/`startTransition` 構造で navigate に await が付く。Issue の意図（invalidate → clearCache）は同一なので、対象行のみ置換する。

## 実装ステップ

### 1. router.invalidate を clearCache に置換

- **対象ファイル:** `app/components/identity/AccountDeleteForm/index.tsx`
- **変更内容:**

  ```ts
  // 過去訪問で cached された _app match に残る旧 userDto を破棄する（navigate との race 回避）
  router.clearCache({ filter: (match) => match.routeId === "/_app" });
  await router.navigate({ to: "/", search: HOME_SEARCH });
  ```

  - `clearCache` は同期 API なので `await` を外す。
  - コメントは clearCache の意図（match 破棄による race 回避）に更新する。
- **理由:** `invalidate` は match を `invalid: true` にして再 load を促すため、user 不在状態での `_app` loader 再実行と navigate が race しうる。`clearCache` は match を物理破棄し、直後の navigate で新規マウントさせるため意味的に正確。

## 設計判断

特になし（Issue の指示どおりの 1 行置換 + コメント更新）。

## リスクと注意点

- routeId `/_app` のハードコード文字列が実在の routeId と一致している必要がある（`app/routes/_app/route.tsx` の `createFileRoute("/_app")` で確認）。
- `clearCache` の型シグネチャ（`{ filter }` を受け、同期で void）を typecheck で担保する。

## テスト方針

- `pnpm typecheck` / biome lint・format が通ること。
- ブラウザでアカウント削除を実行し、`/` へ正常遷移・エラー/チラつき/無限リダイレクトが無いことを確認する。
