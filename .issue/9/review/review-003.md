# PR Review #003 — feat(note): P12 WYSIWYG editor with TipTap (Issue #9)

**PR:** #35
**Date:** 2026-05-17
**Round:** 3回目（最終）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 13（Frontend 7 + Test 6）
- Verdict: **APPROVED**

Round 2 で挙げた Warning 4 件はすべて適切に処理された:
- FE-W-101（初回マウント正規化擦り抜け）: `onCreate` で `lastEmittedHtmlRef` を post-parse HTML で seed + value 同期 effect で `setContent` 後に再同期、で完全解消
- FE-W-102（toolbar 高頻度再 render）: progress.md に将来 Issue 候補として記録
- TS-W-009（`setTimeout(50)` flaky リスク）: `flushTipTapMount` ヘルパーで rAF 2 ティック明示 flush に変更、解消
- TS-W-010（ポジティブケース欠落）: `editor.commands.insertContent` 経由のユーザー編集回帰テスト追加、解消

修正による新たな問題は両レビューで検出されなかった。1 ラウンドクリーン達成。

---

### Frontend

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[FE-N-201]** FE-W-101 は適切に解消。`onCreate` で `lastEmittedHtmlRef.current = instance.getHTML()` を seed + value 同期 effect で `setContent` 後に `editor.getHTML()` で再 pin。提案以上に堅牢
- **[FE-N-202]** value 同期 effect の順序が「`setContent` → `getHTML()` で post-parse 形に pin」の正しい順序に
- **[FE-N-203]** FE-W-102 は progress.md セクション 4b に記録済み
- **[FE-N-204]** 新規テスト 4 件で `lastEmittedHtmlRef` ガードの過剰一致 regression も検出可能
- **[FE-N-205]** non-canonical な初期 value 時に `setContent` が二度呼ばれる微小な冗長性。`emitUpdate: false` で onChange 発火なし、受入条件外
- **[FE-N-206]** Round 1 / 2 で解消した指摘の再発なし
- **[FE-N-207]** 修正による新たな副作用（無限ループ・stale-closure・useEffect 依存漏れ）なし

---

### Test

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[TS-N-201]** TS-W-009 解消: `flushTipTapMount` で rAF 2 ティック明示 flush。CI jitter による偽 PASS リスクが構造的に消えた
- **[TS-N-202]** TS-W-010 解消: ポジティブケースで `lastEmittedHtmlRef` ガード過剰一致を検出可能
- **[TS-N-203]** `editorRef` 注入の `as never` 型キャストは妥当な test seam
- **[TS-N-204]** 正規化ケース網羅性: canonical / empty / 大文字タグ / 外部更新 / ユーザー編集の 5 ケースで FE-W-101 経路すべてに観測点
- **[TS-N-205]** Round 1 / 2 の Test 指摘（TS-W-001〜TS-W-010）はすべて解消、`pnpm test:unit` で 1368 テスト all green
- **[TS-N-206]** ポジティブケースの assertion が `toContain("typed")` で緩めだが、意図は満たしている

---

## Design Decisions

- 全ラウンド完了。残存課題（FE-W-102 toolbar 最適化）は progress.md セクション 4b に記録済み、将来 Issue 候補として保留
