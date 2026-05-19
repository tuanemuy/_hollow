# PR Review #001 — feat(exports): /exports/$jobId 詳細ルート + 一括エクスポート完了通知

**PR:** #83
**Date:** 2026-05-20
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 11（Frontend 3 / Security 3 / Performance 5）
- Notes: 26
- Verdict: **APPROVED**（修正適用済み）

---

## Frontend / Presentation

### Blockers
なし

### Warnings
- **[W-001]** `inFlightRef` がデッドコード気味でレース防御として効きにくく、意図が読めない
  - 場所: `app/components/export/ExportJobDetail/index.tsx:40-66`
  - 提案: `useRef` をやめて effect スコープのローカル `let inFlight = false` に。
  - **対応**: ローカル変数化で適用。Performance W-001 と同根のため統合修正。
- **[W-002]** `Page.tsx` の `try/catch` スコープが広め
  - 場所: `app/components/export/ExportJobDetail/Page.tsx:16-44`
  - 提案: `try` を `loadExportJob` の 1 行に絞る。
  - **対応**: `try` を `loadExportJob` 呼出しだけに狭め、`return <main>...</main>` は catch の外に移動。
- **[W-003]** brand キャスト責務境界（`as unknown as ExportJobId` を Page で受けて domain 型を import）が `notes/$noteId` パターンと厳密一致しない
  - 場所: `app/routes/exports/$jobId.tsx:20` / `app/components/export/ExportJobDetail/Page.tsx:15`
  - **対応**: 見送り。実害なし、依存方向は維持されている（presentation → domain の型 import は CLAUDE.md 上問題ない）。一貫性を全体的に整える場合は別 Issue で `notes/$noteId` 含めて再検討。

### Notes
良い点 10 件（ADR-002 完全準拠、a11y 3点セット完備、bulkExportNotesFn 戻り値型整合、routeTree.gen.ts 自動生成、ADR-004 落とし所妥当、JSDoc 適切、etc.）

---

## Security

### Blockers
なし

### Warnings
- **[W-001]** `errorComponent` で `BusinessRuleError` の生 message を画面表示する潜在経路
  - 場所: `app/routes/exports/$jobId.tsx:29-34`
  - 理由: `Page.tsx` catch は whitelist（NotFound/Unauthorized のみ neutral）。他の `business` code が将来追加された場合、`sanitizeRouteError → renderErrorMessage` 経路で `error.message` がそのまま表示される。深層防御として弱い。
  - 提案: `errorComponent` を `error.message` を一切経由しないハードコード文言にする。
  - **対応**: `errorComponent` を引数なしの固定文言「エラーが発生しました／時間をおいて再度お試しください。」に変更。`sanitizeRouteError` import も削除。ADR-005 を追加。
- **[W-002]** poll 中の認可チェックが毎回走る side-channel
  - 場所: `app/components/export/ExportJobDetail/index.tsx:42-66`
  - **対応**: Note 寄りの指摘。実害なしのため見送り。
- **[W-003]** `errorReason` の生表示
  - 場所: `app/components/export/ExportJobDetail/index.tsx:159-164`
  - **対応**: 別 Issue 候補。`runExportJob` 側の `errorReason` 組み立て（presentation 層スコープ外）と合わせて整理が必要。Phase 4 でスコープ外 Issue 起票を検討。

### Notes
良い点 8 件（ADR-004 達成確認、深層防御確認、未認可で poll 起動せず、HTTP ステータスからもオラクル不能、`sanitizeRouteError` の DEV 限定 console、入力検証、etc.）

---

## Performance

### Blockers
なし

### Warnings
- **[W-001]** `inFlightRef` を effect ローカルに変える提案
  - 場所: `app/components/export/ExportJobDetail/index.tsx:47-59`
  - **対応**: Frontend W-001 と統合してローカル `let inFlight = false` に修正済み。
- **[W-002]** `Date.parse` 毎レンダ評価
  - **対応**: 見送り（指摘者も推奨せず）。
- **[W-003]** `failedNoteIds` 全件表示に上限がない
  - 場所: `app/components/export/ExportJobDetail/index.tsx:166-177`
  - **対応**: `FAILED_NOTE_IDS_DISPLAY_LIMIT = 50` で頭打ちにし、「他 N 件」表記を追加。
- **[W-004]** poll で `requireCurrentUser` が毎回走る
  - **対応**: スコープ外。将来の負荷軽減策（軽量 server fn 分離 / backoff / session キャッシュ）として記録のみ。
- **[W-005]** 複数タブ重複ポーリング
  - **対応**: スコープ外。`BroadcastChannel` パターンは実装コストが大きく、`1 ユーザ・1 タブ` 前提（ADR-001）でカバー。

### Notes
良い点 8 件（setTimeout 自己呼出し再帰の停止経路完全、visibilityState 設計合致、getExportJob O(1)、downloadFn はクリック時のみ、STATUS_LABEL 共有でバンドル境界増えず、etc.）

---

## 修正サマリー

1. `inFlightRef` (useRef) → effect 内ローカル `let inFlight` に置換（Frontend W-001 / Perf W-001）
2. `Page.tsx` の `try` スコープを `loadExportJob` の 1 行のみに縮小（Frontend W-002）
3. `errorComponent` をエラー message を経由しない固定文言に置換（Security W-001 → ADR-005）
4. `failedNoteIds` 表示に 50 件の上限と「他 N 件」表記を追加（Perf W-003）

## 静的検査

- `pnpm typecheck`: PASS（0 errors）
- `pnpm exec biome check --write`: 0 issues

## Design Decisions

- **ADR-005 を追加**: `errorComponent` で `error.message` を画面に出さず固定文言にする（深層防御）。詳細は `.issue/12/adr.md`。

## Verdict

**APPROVED** — Blocker 0 件、修正可能な Warning はすべて即時対応済み。残った Warning は (a) 別 Issue 起票推奨（Security W-003）、(b) スコープ外（Perf W-004/W-005）、(c) コスト見合わず見送り（Perf W-002 / Frontend W-003）。
