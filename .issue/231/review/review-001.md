# PR Review #001 — feat(#231): introduce lucide-react icons for action buttons

**PR:** #281
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 9（重複統合後）
- Notes: 多数
- Verdict: **BLOCKED**（Warning 対応必要）

---

## Frontend

### Blockers
- なし

### Warnings
- **[W-F1]** `Icon` ラッパーの JSDoc と実態が乖離（`className` に位置決めユーティリティが入る）
  - 場所: `app/components/common/Icon.tsx:22-24` / 使用箇所 `Header.tsx`, `PublicLayout.tsx`, `PublicSearch.tsx`, `UserPublicTop.tsx`, `ErrorPage.tsx`
  - 理由: JSDoc は「color 継承のみ」と書いてあるが実コードでは `absolute left-[…] top-1/2 -translate-y-1/2 pointer-events-none …` を渡している
  - 提案: JSDoc を「color と位置決め系（absolute / left / top / translate / pointer-events 等）に使ってよい。ただし `w-*`/`h-*` は size の SSOT を尊重するため禁止」に書き換え

- **[W-F2]** `block mx-auto mb-3 text-ink-tertiary` の繰り返しを定数化していない
  - 場所: `IngestionQueue.tsx`, `TagManager.tsx`, `TrashList.tsx` で 3 回完全一致
  - 提案: `app/components/layout/styles.ts` に `EMPTY_STATE_ICON` を追加して 3 箇所参照

- **[W-F3]** lucide の `size` prop を使わず `width`/`height` を個別に渡している
  - 場所: `app/components/common/Icon.tsx:38-55`
  - 提案: `<IconComponent size={size} strokeWidth={1.5} ... />` に置き換え（lucide が内部で展開）

## Test

### Blockers
- なし

### Warnings
- **[W-T1]** `label=""`（空文字列）が無効な accessible name を生成（`role="img" aria-label=""`）
  - 場所: `app/components/common/Icon.tsx:36`
  - 提案: 実装側で `label !== undefined && label !== ""` に変えるか、空文字列を装飾扱い（aria-hidden）に正規化。テスト追加。

- **[W-T2]** 単一の lucide コンポーネント（Search）のみでテスト
  - 場所: `__tests__/Icon.test.tsx`
  - 提案: `it.each([Search, Trash2])` で aria-hidden ケースを 2 アイコン回す（優先度低）

- **[W-T3]** `className` での `w-*`/`h-*` 上書き禁止がテストでも守られていない
  - 場所: `Icon.tsx` / `Icon.test.tsx`
  - 提案: 「`className="w-10"` を渡しても `getAttribute("width") === "16"` を維持」テストを 1 ケース追加

## Accessibility

### Blockers
- なし

### Warnings
- **[W-A1]** `className` 経由の `w-*`/`h-*` 上書き禁止が型・テストで担保されていない（W-F1/W-T3 と重複）
  - 提案: ガイドラインに明文化（spec/design §7.1）か dev-only `console.warn` ガード

- **[W-A2]** `UrlCopyButton` コピー成功時のアイコン切替（`Link2` → `Check`）は本 PR スコープ外だが、将来検討のため Issue 起票推奨
  - 提案: フォローアップ Issue 起票（Phase 4）

### Notes（抜粋）
- ConfirmDialog の accessible name 設計（`role=alertdialog` + `aria-labelledby={titleId}` + `AlertTriangle` aria-hidden）が模範的
- 全 33 件の `<Icon>` 利用で `className` に `w-*`/`h-*` 直書きは 0 件
- size taxonomy（16/20/24）が用途と一貫

## Design / Styling

### Blockers
- なし

### Warnings
- **[W-D1]** `EMPTY_LIST`（公開側ユーザートップの空状態）にアイコンが入っていない
  - 場所: `UserPublicTop.tsx:137` / `public/styles.ts:57`
  - 提案: §7.1 に「authenticated 側の `EMPTY_STATE` 利用箇所のみ対応、公開側 `EMPTY_LIST` は将来対応」と1行明記、または該当箇所にも `Inbox` 等を追加

- **[W-D2]** `Icon` ラッパーの `className` 契約と実装の矛盾（W-F1 と重複）
  - 提案: JSDoc / spec §7.1 を実態に合わせて緩める

- **[W-D3]** `USER_SEARCH_ICON` (`left-3.5`) が `SEARCH_ICON` (`left-[11px]`) と整合しない
  - 場所: `app/components/public/styles.ts:76-77`
  - 提案: `USER_SEARCH_ICON` は未参照のため削除（小さな変更）

### Notes（抜粋）
- ADR-004 #2 の文言「`dialogTitle` 定数撤去」は不正確（実態は「ConfirmDialog からの利用停止」）。後続レビュー時の誤解防止に ADR を 1 行修正可。

---

## Design Decisions

- **重複指摘の統合**: Icon の className 契約問題は Frontend / Test / Accessibility / Design の 4 視点すべてで指摘あり。JSDoc + spec §7.1 を「color + 位置決め系を許容、`w-*`/`h-*` のみ禁止」に書き換える方針で一本化。
- **`size` prop への変更**: lucide の内部 API に沿う方が将来互換性が高く、W-F3 を採用。

## 修正アクション一覧（次ラウンドで対応）

1. **Icon.tsx**:
   - lucide の `size` prop に書き換え（W-F3）
   - `label !== undefined && label !== ""` で空文字列を装飾扱いに正規化（W-T1）
   - JSDoc を「color + 位置決め系を許容、`w-*`/`h-*` のみ禁止」に書き換え（W-F1, W-D2, W-A1）
2. **Icon.test.tsx**:
   - 空文字列ラベル → 装飾扱いになるテスト追加（W-T1）
   - 複数 lucide コンポーネントでの aria-hidden テスト 1 ケース追加（W-T2）
   - `className="w-10"` を渡しても `width` 属性が size 由来を維持するテスト追加（W-T3）
3. **`layout/styles.ts`**:
   - `EMPTY_STATE_ICON = "block mx-auto mb-3 text-ink-tertiary"` を追加（W-F2）
4. **`IngestionQueue.tsx` / `TagManager.tsx` / `TrashList.tsx`**:
   - `EMPTY_STATE_ICON` 参照に書き換え（W-F2）
5. **`spec/design/index.md` §7.1**:
   - className 契約を実態に合わせて緩める文言修正（W-D2, W-A1）
   - 「公開側 `EMPTY_LIST` は本 PR では対象外、フォローアップ候補」と1行明記（W-D1）
6. **`app/components/public/styles.ts`**:
   - 未参照の `USER_SEARCH_ICON` を削除（W-D3）
7. **`adr.md` ADR-004 #2 の文言補正**: 「`dialogTitle` 定数撤去」→「`ConfirmDialog` での利用停止」（Note 扱い、軽微）
8. **Phase 4 でフォローアップ Issue 起票**:
   - UrlCopyButton コピー成功時のアイコン切替（W-A2）
   - 公開側 `EMPTY_LIST` のアイコン化（W-D1、§7.1 への明記と合わせて）
