# PR Review #002 — feat(#204): メタタグ・SEO 設定の整備

**PR:** #390
**Date:** 2026-06-01
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 1周目4指摘すべて解消を確認
- Verdict: **APPROVED**

---

## 再レビュー結果（全観点）

### Blockers
- なし

### Warnings
- なし

### 1周目指摘の修正検証
- **Pres-W-001（Article JSON-LD の image）**: 解消。両公開ノートルートに `image: joinUrl(config.appUrl, DEFAULT_OG_IMAGE_PATH)` 追加。export/import 正常、絶対 URL で schema.org 適合。
- **Pres-W-002（ProfilePage Person.url）**: 解消。Person に profile URL を設定。
- **Arch-W-001（空 description）**: 解消。`PublicNoteMeta.description` を optional 化し空なら省略、ルート側も truthy ガード。サイト既定フォールバック経路が機能。
- **Arch-W-002（二重 RPC）**: 記録のみで確定。ADR-003 Consequences に「cache() 見送り確定・読み取り専用 UoW で機能影響なし」と追記。

### 退行チェック
- typecheck クリーン、unit 2945 テスト全 PASS。
- description optional 化の全参照箇所でガード漏れなし。
- AppConfig.locale 追加で surface テスト無改修通過。
- Security 退行なし（JSON-LD エスケープ・validateInput・NotFound 一律化を維持）。

---

## Design Decisions
- 特になし（ADR-003 の更新は1周目で記録済み）。
