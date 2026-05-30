# PR Review #002 — security(admin): add Origin/Referer header verification for admin server functions

**PR:** #359
**Date:** 2026-05-30
**Round:** 2回目（再レビュー）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（Round 1 指摘の解消確認 + 回帰チェック）
- Verdict: **APPROVED**

Round 1 の修正（Origin/Referer ロジック変更 + テスト 15→20 件 + コメント明確化）を Security+Presentation / Test の 2 視点で再レビュー。両視点とも Blocker・Warning ゼロ。

---

## Security + Presentation (Round 2)

### Blockers
- なし

### Warnings
- なし

### Notes（要点）
- Round 1 Sec/Pres W-001 完全解消。`origin ? isSameOrigin(origin, appUrl) : isSameOrigin(getRequestHeader("referer"), appUrl)` で冗長 header read と空文字 Origin フォールバック不発を一手で解決。
- Origin 優先が維持（forged truthy Origin で Referer フォールバックしない）。空文字 Origin フォールバックは fail-closed を崩さない。`Origin: null` も truthy → parse 失敗 → 403。
- safe-method スキップは無傷。Security W-002（APP_URL 起動時検証）のスコープ外判断は妥当（fail-closed・DI 配線の別責務）。

## Test (Round 2)

### Blockers
- なし

### Warnings
- なし

### Notes（要点）
- W-001（射程の但し書き）正確。W-002（ポート正規化 `:443`⇔暗黙 / `:8787` 明示）期待値を WHATWG URL 実測で確認。W-003（`Origin: null` → false）解消。W-004（forged Origin + same Referer → 403、Origin 優先）本質的に検証。
- 空文字 Origin フォールバック回帰ガードも追加。全 20 件 PASS、フレーク要因・重複なし、アサーション本質的。

---

## Design Decisions

新規 ADR なし。

## 完了

1 ラウンドクリーン（Round 2）で APPROVED。PR を Ready for review に切り替える。Security W-002 は Phase 4 で別 Issue 化を検討。
