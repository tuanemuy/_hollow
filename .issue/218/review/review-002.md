# PR Review #002 — feat(issue/218): admin prompts/design tokens override model with reset

**PR:** #260
**Date:** 2026-05-28
**Round:** 2 回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6（参考のみ）
- Verdict: **APPROVED**

---

## Round 2 verification

Round 1 で挙げた 8 件の Warning と関連 Notes に対する修正反映を全レイヤ横断で再確認。

### Round 1 の指摘 → 反映状況

| ID | 指摘 | 反映 |
|----|------|------|
| D-W-001 | `updatePrompt` 非空ガード | `entity.ts:184-188` で `BusinessRuleError` 投入、新 errorCode `UpdatePromptRequiresNonEmptyText` 追加 ✅ |
| D-N-006 | `promptResolver` JSDoc 古い | Partial<Record<>> 記述に更新 ✅ |
| U-W-001 | `updatePromptTemplate` の no-op skip 余地 | 本 PR では見送り、Phase 4 で別 Issue 候補 |
| U-W-002 | reset 2 種に admin 拒否テストなし | member 拒否ケース 2 件追加 ✅ |
| U-W-003 | resetAll の no-op テストなし | bootstrap 行を書かない idempotency テスト追加 ✅ |
| F-W-001 | `purpose` が `z.string()` 止まり | `PROMPT_PURPOSES_TRANSPORT` + `z.enum` 化 ✅ |
| F-W-002 | リセット時に "保存しました" 表示 | `feedback: { kind, at }` で文言切替 ✅ |
| F-W-003 | override + 空 textarea 案内なし | 補助テキスト「空にしたい場合は『この項目をリセット』を使ってください」追加 ✅ |
| S-W-001 | UI ヒント文言と spec の不一致 | spec を実装の "既定値: （プロバイダ既定指示）" に統一 ✅ |
| S-N-003 | ADR-001 末尾の古い文言 | ADR-006 整合に修正 ✅ |

### 自動検証

- `pnpm typecheck`: クリーン
- `pnpm test:unit`: 2501 passed / 125 files
- `pnpm test:integration`: 436 passed / 39 files
- `biome lint` / `biome format`: クリーン

### Notes

- **[R2-N-001..N-006]** すべて参考情報・観察コメント。修正不要。
- 見送り済みの **[U-W-001]** は Phase 4 で別 Issue 起票候補。

---

## Design Decisions

このラウンドで新規 ADR は不要。

---

## Verdict

**APPROVED.** マージ可能。
