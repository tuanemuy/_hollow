# PR Review #001 — fix(#305): AccountDeleteForm の router.invalidate を clearCache 化

**PR:** #368
**Date:** 2026-05-31
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2（いずれも下記のとおり解決／要対応なしと判断）
- Notes: 3
- Verdict: **APPROVED**

---

## General Review

対象: `app/components/identity/AccountDeleteForm/index.tsx`（1ファイル2行）

```diff
-        // 過去訪問の cached _app match に残る旧 userDto を破棄するため _app も invalidate（rule 1）
-        await router.invalidate();
+        // 過去訪問で cached された _app match に残る旧 userDto を破棄する（navigate との race 回避）
+        router.clearCache({ filter: (match) => match.routeId === "/_app" });
         await router.navigate({ to: "/", search: HOME_SEARCH });
```

### Blockers
- なし

### Warnings（レビュアーが提起 → メインの検証と判断）

- **[W-001]** 「`invalidate`→`clearCache` が race を本当に解消するか」はコード・型からは静的に立証できず、実機検証が必須、という指摘。
  - **判断: 妥当。実機検証で解決済み。** 本ブランチのソースで起動した dev サーバー（http://localhost:51735）に対し、signup した使い捨てアカウントで削除フローを実行。削除 → `/` 遷移、ログアウト状態表示、チラつき/無限リダイレクト/コンソールエラー無しを確認した（`.issue/305/manual-test/result.md`）。clearCache が cached `_app` match を破棄し、直後の navigate で `_app` が新規 load される挙動が期待どおり動作することを確認。

- **[W-002]** 「`_app` を狙う router 操作の表現が分散している。`AccountDeleteForm` だけ生の `clearCache` + `routeId` ハードコードになる。既存ヘルパ（`appShellInvalidate` / `routerInvalidate` / `appShellClearCache`）に集約すべき」という指摘。
  - **判断: 指摘の前提が事実誤認。要対応なし。** レビュアーが挙げたヘルパ（`appShellInvalidate`・`routerInvalidate`・`appShellClearCache`）は**リポジトリに実在しない**（`grep -rn` で確認、ハルシネーション）。実際の `_app` 系 router 操作は他に `app/components/identity/ProfileForm/index.tsx:42,56` と `app/routes/_app/route.tsx:36` の素の `router.invalidate()` のみ。集約先の共通ヘルパは存在せず、本変更は Issue #305 が明示的に指定した形（`router.clearCache({ filter: (m) => m.routeId === "/_app" })`）であり、ヘルパ新設は 1 行修正という Issue スコープを超える。`routeId` のハードコードは TanStack Router の慣習どおり。よって本 PR では変更しない。

### Notes
- **[N-001]** `@tanstack/router-core@1.169.2` の `clearCache` は `(opts?) => void` の同期 API（型定義で確認、`pnpm typecheck`=tsgo EXIT 0）。`await` 除去は正しい。
- **[N-002]** routeId `/_app` は実在（`app/routes/_app/route.tsx:13` `createFileRoute("/_app")`）。filter 引数 `match` の `routeId` アクセスも型上有効（typecheck 通過）。
- **[N-003]** コメントは CLAUDE.md「WHY のみ」方針に適合。旧コメントの内部参照「（rule 1）」が消え、「navigate との race 回避」という WHY が簡潔・self-contained に。スコープは対象行＋コメントのみで余計な変更なし。

---

## Design Decisions

特になし（Issue 指示どおりの 1 行置換 + コメント更新）。

---

## 完了

Blocker 0。Warning は W-001（実機検証で解決）/ W-002（前提が事実誤認・要対応なし）として処理済み。1ラウンドで完了（APPROVED）。
