# PR Review #002 — feat(ingestion): make upload modal-driven from header/sidebar/toolbar

**PR:** #243
**Date:** 2026-05-27
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 8
- Verdict: **APPROVED**

---

## General

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001]** `UploadDialogMount` の `useLocation({ select })` 分割は TanStack Router v1 の selector パターンに準拠し、参照等価で短絡されるため `pathname` / `hash` 単独変化のみ再レンダーする。AppShell 直下の常時マウントとして妥当な実装。
- **[N-002]** `normalizePathname` は trailing slash 除去 → lowercase 化 →空文字を `/` にフォールバック。`/upload`, `/upload/`, `/Upload`, `/UPLOAD/` のいずれもサプレッションされる。`/uploadx` 等の prefix 衝突は完全一致なので問題なし。
- **[N-003]** `UploadButton` の active state は `data-active={active || undefined}` (CLAUDE.md ADR-003 準拠) と `aria-current={active ? "page" : undefined}` の両方を出す。Sidebar の他リンクの `ACTIVE_NAV_PROPS` と意味的に揃っており、SR / 視覚スタイル双方の整合性復元として完成度が高い。
- **[N-004]** `onClose` の `navigate(...).then(...)` パターン化は前回 N-003 の対応として正しい順序。`navigate` の Promise 解決後に `window.location.hash` を再確認するため、router 側のクリア成功時は冗長な history エントリを作らない。SSR ガード (`typeof window !== "undefined"`) も維持。
- **[N-005]** `UploadDialog` フッターの `<Link to="/upload" hash={() => ""}>` は `onClick={onClose}` のレースを排除し、pathname-guard に自然にバトンを渡す。`hash` を関数形式で渡すのは TanStack Router で「現在 hash に依存せず空にする」明示的な書き方として適切。
- **[N-006]** `routes/index.tsx` の `import "@/components/ingestion/actions"` 残置にコメントで安全弁の意図を明示済。AppShell 集約後の意図的な冗長性として読み手に伝わる。
- **[N-007]** `spec/design/index.md` 9 節に upload-modal 方針が追記され、`P13-upload.html` 非更新の正当化が spec 側で完結している。
- **[N-008]** `pnpm typecheck` / `pnpm format:check` ともに pass。Architecture W-001（search 必須ルートでの `Link to="."` 実用性）は manual-test 8 PASS / 0 FAIL で間接的に補強されており、追加対応不要との判断は妥当。

---

## Design Decisions

新規追加なし。review-001 で記録した内容（routes/index.tsx の安全弁化）はコメントとして実装側に反映済。
