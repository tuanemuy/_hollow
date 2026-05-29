# PR Review #001 — feat(#283): UrlCopyButton コピー成功時に Check アイコンへ切替

**PR:** #325
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

複雑度: 小規模のため General Review 1本で実施。

---

## General Review

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** Issue #283 の完了条件をすべて満たす。`<Icon icon={state.kind === "copied" ? Check : Link2} />`（`UrlCopyButton.tsx:65`）で (1) 成功時 Check 表示、(2) aria-live ステータステキスト無変更、(3) アイコンは label 未指定で `aria-hidden` 装飾扱い継続（`Icon.tsx:52-59`）。
- **[N-002]** 状態管理が正しい。Check 表示は `state.kind === "copied"` の単一真実源に紐付き、既存 `setTimeout`（`UrlCopyButton.tsx:46-48`）がアイコンとステータスを同時に idle に戻す。追加タイマー state なし＝二重管理回避（plan.md と整合）。
- **[N-003]** エラー時挙動が正しい。error 状態では三項が false に倒れ Link2 据え置き。誤った成功フィードバックを出さない。TC-001 で実観測済み。
- **[N-004]** a11y 二重読み上げ懸念なし。Check/Link2 どちらも aria-hidden 経路。アイコン差し替えは aria-live 領域外で余計な通知なし。
- **[N-005]** 規約準拠。不要コメントなし、import は `{ Check, Link2 }` アルファベット順（Biome 整形一致）、styling/data-* 規約に違反なし。
- **[N-006]** 補足（対象外）: error 状態は自動クリア timeout を持たない既存仕様。本 PR で悪化なし。将来 Issue #231 系で扱う余地。

---

## Design Decisions

特になし（plan.md の設計判断「表示時間を新規タイマーでなく既存 state に同期」がそのまま実装され、レビューでも妥当と確認された）。
