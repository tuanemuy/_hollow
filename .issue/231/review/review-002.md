# PR Review #002 — feat(#231): introduce lucide-react icons for action buttons

**PR:** #281
**Date:** 2026-05-28
**Round:** 2回目（review-001 対応の確認）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 4（Frontend 1 / Test 2 / Accessibility 7 / Design 1、軽微・参考情報）
- Verdict: **APPROVED**（全 4 視点とも問題点ゼロ）

---

## Frontend

### Blockers
- なし

### Warnings
- なし

### Notes
- 軽微: spec §7.1 では `size-*` も禁止と明記しているが、JSDoc は `w-*`/`h-*` のみ書かれている。Tailwind の `size-*` ショートハンドが今後使われ始めるなら JSDoc 側も並べると親切（実害なし）

### review-001 対応確認
- W-F1 / W-D2 / W-A1（JSDoc 乖離） → JSDoc + spec §7.1 を実態に合わせて緩和、完了
- W-F2（EMPTY_STATE_ICON 定数化） → `layout/styles.ts:47` 追加・3 箇所参照、完了
- W-F3（lucide の size prop 使用） → `Icon.tsx:44,54` 統一、テスト 12/12 PASS

---

## Test

### Blockers
- なし

### Warnings
- なし

### Notes
- `it("keeps width/height from size even if className includes w-*/h-*", ...)` は SVG 属性レベルの不変条件を確認。実ブラウザでの Tailwind CSS の上書きまでは取らないが、契約レベルでは十分（ADR-005 #3 のガイドラインと二段構え）
- 空文字列 label テストは Search のみで検証。コードパスが label 分岐後で IconComponent によらず同一なので十分

### review-001 対応確認
- W-T1（空文字列ラベル正規化） → `Icon.tsx:36` で `label !== undefined && label !== ""`、テスト追加
- W-T2（複数 lucide コンポーネント） → `it.each([Search, Trash2])` 追加
- W-T3（className w-*/h-* 不変条件） → 1 ケース追加で size 由来の width/height 維持を確認

---

## Accessibility

### Blockers
- なし

### Warnings
- なし

### Notes
- `label !== undefined && label !== ""` で `role="img" aria-label=""` を構造的に防止
- `className` 契約緩和は位置決め系のみで a11y 中立（role/name/aria-* に影響しない）。`pointer-events-none` は装飾アイコンが hit target を奪わない方向でむしろプラス
- 検索アイコンは全箇所 decorative、accessible name は `<input type="search">` の sr-only label / `htmlFor` 経由
- ConfirmDialog の `role="alertdialog"` + `aria-labelledby={titleId}` パターンは引き続き模範的
- 全 33 件の `<Icon>` 利用で accessible name は可視テキスト側に集約、アイコンのみボタンは PR 内に存在しない
- UrlCopyButton のコピー時アイコン切替 / 公開側 EMPTY_LIST は Phase 4 へフォローアップ Issue 起票（妥当）
- 空白のみ文字列 `label="  "` は AT 実装で挙動が分かれる可能性。PR 内に該当経路なし、将来追加で十分（Note 扱い）

### review-001 対応確認
- W-A1（className 寸法上書き禁止のガイドライン明文化） → ADR-005 #3 + spec §7.1 で対応
- W-A2（UrlCopyButton コピー時アイコン切替） → Phase 4 でフォローアップ Issue 起票予定

---

## Design / Styling

### Blockers
- なし

### Warnings
- なし

### Notes
- `SEARCH_ICON` 定数が `layout/styles.ts:16` と `public/styles.ts:40` に同一文字列で重複定義（pre-existing、スコープ外）。各レイヤー独立 export の構造を尊重して本 PR ではノータッチ

### review-001 対応確認
- W-D1（公開側 EMPTY_LIST） → §7.1 にスコープ明文化、Phase 4 で起票
- W-D2（className 契約矛盾） → JSDoc + §7.1 緩和済み
- W-D3（USER_SEARCH_ICON 削除） → 完全削除、grep で参照 0 件

---

## 検証結果

- `pnpm typecheck` — 0 errors
- `pnpm exec biome lint` / `format` — No issues
- `pnpm test:unit` — 133 files / **2635 tests passed**（Icon.test.tsx は +4 件追加で計 12 件 PASS）
- `grep` で USER_SEARCH_ICON / 空状態 inline 文字列の残存ゼロ確認
- ADR-001 の規約遵守: lucide-react は全箇所が個別 named import（barrel なし）

## Design Decisions

- **JSDoc / spec の文言整合**: 実態と乖離していた「color 継承のみ」を「色 + レイアウト補助、寸法のみ禁止」に緩めた判断は妥当（ラッパーの寸法 SSOT を守りつつ、現実の利用パターンを許容）
- **`label=""` 装飾化**: WAI-ARIA 仕様上 `role="img" aria-label=""` が invalid なため、正規化対応は正しい
- **`EMPTY_STATE_ICON` 定数化**: CLAUDE.md の Repeated utility strings 規約に素直に沿う

---

## 結論

**全 4 視点（Frontend / Test / Accessibility / Design / Styling）とも Blocker 0 / Warning 0、APPROVED。**

review-001 の Warning 9 件（重複統合後）はすべて適切に解消された。新たな問題は検出されず。Phase 4（スコープ外 Issue 起票）と PR Ready for review への切替に進める状態。
