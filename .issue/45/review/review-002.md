# PR Review #002 — fix(adapters/d1): apply selectInChunks to remaining inArray callsites (#45)

**PR:** #164
**Date:** 2026-05-23
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

---

## Re-review (Round 1 → Round 2)

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** W-001 修正済み — `tagRepository.integration.test.ts` のローカル `TZ` 再宣言は削除されている。モジュールトップの `const TZ` (line 14) のみが残り、新規 `D1TagRepository.findByIds — D1 bind limit regression` describe からも参照されている。他リポジトリ test 群と一貫
- **[N-002]** W-002 修正済み — `noteRepository.integration.test.ts` の新規 `findByOwner({ tagIds })` ケースは `T-bind-007` にリネームされた（コメント・`it()` タイトル両方）。同一 describe 内に重複する `T-bind-005` は存在しない。`.issue/45/plan.md` と `.issue/45/testing.md` の番号も同期されている
- **[N-003]** W-003 修正済み — `tagRepository.integration.test.ts` に `it("returns [] for an empty id list without querying", ...)` が追加されている。`mediaAssetRepository.integration.test.ts` の空配列ケースと同形・同 assertion でエッジケース 1（`ids = []`）を網羅
- **[N-004]** 副作用なし — `pnpm typecheck` クリーン、`pnpm format:check` クリーン。`pnpm lint` で残る 4 warnings はすべて本 PR 範囲外の既存ファイル
- **[N-005]** 動作確認済み — `pnpm test:integration` を 3 ファイル分（`tagRepository`, `mediaAssetRepository`, `noteRepository`）で実行し、47 テスト全 pass を確認
- **[N-006]** Round 1 で挙げた 13 件の Notes (N-001〜N-013) は本 Round で再確認しても引き続き妥当。新たに発生した懸念はない

---

## Design Decisions

特になし（Round 1 と同じく、新規 ADR は不要）。
