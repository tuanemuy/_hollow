# PR Review #002 — feat(ingestion): アップロード時のカスタムプロンプト欄に既定値を可視化

**PR:** #373
**Date:** 2026-05-31
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（良好）
- Verdict: **APPROVED**

---

## Application / Use Case

### Blockers
なし

### Warnings
なし

### Notes
- W-A-001（非原子性 JSDoc）の修正は意図どおりで新たな問題なし。
- isUserOverride 述語パリティ厳密一致。Hexagonal 依存・UoW read-only・UserId VO 二重構築・入力検証2点・server-fn 先例準拠すべて正しい。

## Frontend

### Blockers
なし

### Warnings
なし

### Notes
- W-F-001（aria-describedby）: `resolved===null` 時 `badgeId` のみ、非null時 `${badgeId} ${sourceId}`。バッジ／ソースの存在条件と参照条件が完全一致、dangling 参照なし。
- W-F-002（不変条件）: `sourceLabel` 抽出 + コメントで `isUserOverride ⇒ text 非空` 明記。到達不能な組合せ（上書き中×空）を踏まない。
- useId 追加は React 規約準拠。data-*/トークン規約・nested details 非干渉・fetch 失敗時安全・状態リセット漏れなし。

## Test

### Blockers
なし

### Warnings
なし

### Notes
- W-T-001: per-field assert は完全一致フィルタ + 固定 JSX 順で決定論的・脆くない。`data-overriding` の true/null をフィールド個別検証し取り違えを検出可能。
- W-T-002: 空 resolved で「プロバイダ組み込み」を pin。
- N-005（軽微・非ブロッカー）: wire 変換の専用テスト無し（自明コピー・間接カバー）、aria 配線アサーション無し（任意）、source-layer と override-state の独立軸の個別検証は薄い（実装上別変数で取り違えリスク低）。いずれも対応不要と判断。

---

## Design Decisions

特になし。
