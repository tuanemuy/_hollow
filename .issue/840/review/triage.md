# 指摘台帳 — Issue #840 PR #845

| Key | 判定 | 理由 | 再指摘 | 初出 |
|---|---|---|---|---|
| test:4-T8-reconcile-false-green | fixed | 4-T8 の onChange 引数 assert が span 注入直後の 80ms flush で rollback 前に通常 emit を確定させてしまい、rollback 時 `changed===false` で reconcile onChange が発火しない。reconcile 削除の変異でも green のまま（false green）。flush を除いて emit を pending のまま rollback させ reconcile 発火を pin する。**R2 で解消確認（コミット 310122a6、変異注入で red 化裏取り）** | 0 | R1 (Frontend W-001 / Test W-001) |
| fe:disabled-toggle-pending-emit-window | wont-fix(scope-out) | disabled トグル時に pending emit が早期 return される窓。**本 PR 変更起因ではない既存挙動**でスコープ外。Phase 5 の起票基準で判断（実害・再現性を確認して必要なら別 Issue） | 0 | R2 (Frontend N-010) |

## メモ
- R1: 両レイヤーとも Blocker ゼロ。実装本体（InlineEditor.tsx）は plan/ADR に忠実で AC-1〜AC-7・AC-3′ を満たすと両視点で確認。#233 の保守的 rollback 安全機構は基準点前進のみで無効化されていない。Test 側は変異注入で各 pin の実効性を裏取り済み（false green は 4-T8 の 1 点のみ）。
