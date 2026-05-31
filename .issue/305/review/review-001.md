# PR Review #001 — fix(#305): AccountDeleteForm の router.invalidate を clearCache 化

**PR:** #367
**Date:** 2026-05-31
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
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

### Warnings
- なし

### 検証した事実
- **clearCache は同期 API**: `@tanstack/router-core` の型定義 `clearCache: (opts?: { filter?: (d) => boolean }) => void;` を確認。戻り値 `void` なので `await` 除去は正しい。
- **routeId `/_app` は実在**: `app/routes/_app/route.tsx` の `createFileRoute("/_app")` を確認。
- **順序**: clearCache（同期で _app match を物理破棄）→ navigate の順で、navigate 時に _app が新規 load され race を解消。
- **意図適合**: invalidate → clearCache の変更は Issue #305 の意図に正確に合致。

### Notes
- **[N-001]** コメントが clearCache の挙動（navigate との race 回避）に正しく更新され、CLAUDE.md の「WHY のみ」方針に合致。旧「rule 1」内部参照が消え self-contained に。
- **[N-002]** スコープは1ファイル2行に限定、余計な変更なし。`await router.navigate` は既存のまま保持。
- **[N-003]** filter 引数名 `match` は型の意味を表し可読性良好。

---

## Design Decisions

特になし。

---

## 完了

1ラウンドで Blocker 0 / Warning 0 のためレビュー完了（APPROVED）。
