# Issue #231 Manual Test — Summary

**Date:** 2026-05-28
**Tool:** agent-browser 0.27.0
**Dev server:** http://localhost:3001/
**Test source:** `.issue/231/testing.md`

## Totals: 11 PASS / 0 FAIL / 0 SKIP

| # | Test | Result | Evidence |
|---|---|---|---|
| TC-001 | Header search icon (#217 同時解消) | PASS | `lucide-search`, currentColor, aria-hidden, 16x16, path+circle shape, in "ノート検索" form |
| TC-002 | Public page search icon | PASS | PublicLayout header + USER_SEARCH_INPUT 両方 `lucide-search` 16x16 aria-hidden, currentColor |
| TC-003 | Header / toolbar action buttons | PASS | Header: Plus / Upload; Toolbar: Bookmark / Plus / Upload — all 16x16 aria-hidden |
| TC-004 | BulkActionBar | PASS | FolderInput / Globe / Download / Trash2 / X — all 16x16 aria-hidden |
| TC-005 | IngestionJobRow | PASS | Check / RefreshCw / Trash2 + ArrowRight (ノートを開く ×4) — all 16x16 aria-hidden |
| TC-006 | NoteActions / UrlCopyButton | PASS | Pencil / Globe / FolderInput / Link2 / Copy / Download / History / Trash2 — 16x16 aria-hidden |
| TC-007 | TrashRowActions | PASS | RotateCcw (復元) + Trash2 (完全削除) — 16x16 aria-hidden |
| TC-008 | ConfirmDialog eyecatch | PASS | `lucide-triangle-alert text-warning` 20x20 aria-hidden; alertdialog accessible name = title text only |
| TC-009 | Empty state eyecatches | PASS | `/upload` Inbox 24x24, `/trash` Trash2 24x24, `/tags` Hash 24x24 — all `block mx-auto mb-3 text-ink-tertiary` aria-hidden |
| TC-010 | Admin section headers | PASS | `/admin/jobs` 4 sections: 取り込みジョブ→Upload, エクスポートジョブ→Download, 検索インデックス→Search, クリーンアップ→Sparkles |
| TC-011 | Design guideline §7.1 | PASS | `spec/design/index.md` §7.1 に 6 項目 + Icon ラッパー強制 + barrel import 禁止 |

## Edge cases
- EC-1 (theme follow): SKIP — `currentColor` + `text-ink-tertiary` token によりトークン経由で担保
- EC-2 (disabled): partial — `ビューとして保存` disabled でレイアウト崩れなし
- EC-3 (keyboard / focus ring): SKIP — time budget

## Key invariants confirmed
- 全アイコンが個別 lucide import（`lucide-*` クラス、個別命名）
- 全アイコンに `aria-hidden="true"`、accessible name はボタンテキストまたは `aria-labelledby` タイトル経由
- size taxonomy 遵守: text-paired = 16px / ConfirmDialog eyecatch = 20px / empty-state eyecatch = 24px
- `currentColor` 統一、親の `text-*` トークンで配色（`w-*`/`h-*` の上書きなし）

## 失敗なし — 全 11 項目が期待動作を満たした
