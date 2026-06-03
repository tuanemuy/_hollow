# PR Review #001 — refactor(ui): admin の surface ローカルボタン定義を common pill へ統一 (#446)

**PR:** #451
**Date:** 2026-06-04
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

---

## General Review

複雑度: 小規模（機械的リファクタ）のため、レイヤー分割せず General Review 1 本で実施。

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** スコープと計画の整合性は完全。変更は計画の 4 ファイル（UsersTable / Jobs / LLMSettingsForm / admin route.tsx）＋ `.issue/446/` ドキュメントのみ。`common/styles.ts` は無改変、関係ないファイルへの波及なし。
- **[N-002]** `data-sm=""` の付与は全 small call site で漏れなし。UsersTable 4 箇所・Jobs 5 箇所すべてに `${pillBtn} ${pillBtnSm}` と `data-sm=""` がペアで付与済み。h-9 surface 側（LLM 接続テスト・admin route の 2 Link）は `data-sm` 非付与で正しい。
- **[N-003]** import の過不足なし。削除し忘れた定数（`BTN_SM_CLASS` / `BTN_CLASS` / `ADMIN_BTN_CLASS`）はリポジトリ全体で 0 件。`pillBtnPrimary` の未使用化もなし。
- **[N-004]** 視覚同値性をトークン差分で機械検証し、計画の主張（duration/ease 落ちは許容・active/aria/mobile-min は gain・shrink size は `data-[sm]:` で後勝ち）と完全一致を確認。
- **[N-005]** 対象 `<button>` は aria-disabled 不使用のため hover ガード強化は挙動不変。admin route の `<Link>` への aria-disabled 系追加はむしろ正の改善。
- **[N-006]** `pnpm typecheck` パス。機械的リファクタとして正確。

総評: 計画に忠実な純粋 UI リファクタとして完成度が高い。指摘事項なし。

---

## Design Decisions

特になし（新規の設計判断はなく、#442/#416/#273 の ADR を踏襲）。
