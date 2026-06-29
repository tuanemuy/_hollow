# Frontend レビュー — PR #806 Issue #803

## 概要

PR #806 は Issue #803（ノート編集タグ入力：候補パネルの viewport クランプ / 外側クリッククローズ）を実装しています。計画・ADR に対する実装の整合性、React 19 / TanStack Start のベストプラクティス、a11y の非干渉、メモリリーク対策を中心にレビューしました。

**結論**: 実装は計画・ADR-001〜005 を正確に実装しており、設計に問題はありません。React hooks の使用法も厳密です。

---

## Blockers

なし。

---

## Warnings

### [W-001] ADR-005 のステータスが "Proposed" のままだが、実装で「確定」していることを反映すべき
- 場所: `.issue/803/adr.md` L107
- 理由: ADR-005 は「実装時に確定する ADR」と明記されており、実装（TagsInput.tsx の `shiftYRef` + deps 設計）が完成した時点で status を "Accepted" へ更新するのが惯例
- 提案: comment-cleanup フェーズで ADR-005 の status を "Accepted" に変更し、確定理由を簡潔に記載（「happy-dom の零 rect では shiftY 依存により無限ループが発生するため、ref 経由で依存から除く設計に確定した」等）
- **メイン仕分け（round-1）: 対応不要（事実誤認）。** ADR-005 の status は既に `Accepted（実装時に確定）`（adr.md L107-108）。リポジトリ慣習（#789 adr.md と同様）では計画/レビュー時 ADR は `Proposed`、実装時確定の ADR のみ `Accepted（実装時に確定）` とし、803 もこれに準拠済み。変更しない。

### [W-002] Window resize 中にパネルが開きっぱなしの場合、window.innerHeight の値が変わっても re-clamp しない
- 場所: `TagsInput.tsx` L143-159、useLayoutEffect の依存配列
- 理由: 依存が `[panelOpen, candidates.length, isNewDraft]` のみなので、viewport 高さが変わっても effect は再走しない。`usePopover` も同じパターン（[open, clampToViewport] のみ）なので確立実装だが、edge case として認識必要
- 影響度: 低（通常は：①パネル開く → ②measure → ③close で候補済み、または ④resize 後ユーザーが操作して再度開く時点で新 innerHeight で測定）
- 提案: plan に明記済みなら追加対応不要。future enhancement として記録
- **メイン仕分け（round-1）: 見送り。** 確立パターンである `usePopover` も open 時のみクランプ（resize 中の再クランプは持たない）であり、本 Issue の AC（画面下部でフォーカス＝open 時に viewport 内へ収める）の範囲外の edge case。実害低・パターン整合のためこの PR では対応せず記録に留める。将来 resize 追従要件が出れば `usePopover` 側と合わせて対応する。

---

## Notes

### [N-001] ADR-005 の ref wiring が正確で、happy-dom の零 rect への対策が完璧
- 場所: `TagsInput.tsx` L95（`shiftYRef` 宣言）、L151-158（natural 復元補正）
- 良い点: 
  - `shiftYRef` を state `shiftY` と別管理することで、layout effect の依存から `shiftY` を除き、happy-dom 環境での「transform を反映していない零 rect」が毎回 spurious な +8 を算出する無限ループを構造的に排除
  - 補正ロジック `{ top: rect.top - applied, bottom: rect.bottom - applied }` は数学的に正確（natural 値の不変性を復元）
  - コメント（L93-94, L133-141）が ADR-004/005 を参照し、非自明さを明確化

### [N-002] P-001（transform フィードバック二重計上）の回帰検出力が最大化されている
- 場所: `app/components/note/editor/__tests__/TagsInput.test.tsx` L501-530（`stubRect`）、L564-584（P-001 テスト）
- 良い点:
  - `stubRect()` の mock 実装が現在の `style.transform` を読んで offset を反映する形で、「fixed rect では P-001 を検出できない」ことを回避
  - 候補件数の変化でパネル高さが変わり、「前回シフト値が効いた rect からの natural 復元」がきちんと検証できる
  - テスト失敗時に「natural 復元補正が無い場合、二重計上で誤った shiftY になる」バグを確実に検出

### [N-003] biome-ignore コメント（L142）が intentional design を正確に説明
- 場所: `TagsInput.tsx` L142-143
- コメント: `"candidates.length / isNewDraft are not read in the body; they are intentional re-measure triggers (both change the panel height)."`
- 評価: dependency 警告を抑圧する理由が正確。「body では読まれず、height change signal のためだけに存在」という design intent が明確

### [N-004] outside-click listener の churn 回避が完全
- 場所: `TagsInput.tsx` L165-183
- 良い点:
  - state setter を直接呼ぶ（`setOpen(false); setActiveIndex(-1);`）のみで、`closePanel` を経由しない → deps に callback を入れる必要なし
  - deps を `[panelOpen]` に最小化 → draft keystroke のたび listener が再attach される churn を回避
  - cleanup で `removeEventListener` → memleak 無し
  - `usePopover.onDocMouseDown` と同形の実装 → consistency

### [N-005] a11y 契約が完全に non-breaking
- 既存の combobox a11y（`role="combobox"` / `aria-autocomplete="list"` / `aria-expanded={panelOpen}` / `aria-controls` / `aria-activedescendant`）、IME ガード（`isComposing` チェック）、キーボード操作（↑↓/Enter/Escape）、blur コミットが全て unchanged
- 新規の clamp / outside-click は UI/state 層のみで、aria ロジックに非干渉

### [N-006] Tailwind utility-first + inline transform の使い分けが厳密
- 場所: `TagsInput.tsx` L306-308
- `style={shiftY ? { transform: ` + "`translateY(${shiftY}px)`" + ` } : undefined}`
- 評価: 
  - paint 前（useLayoutEffect）に当てるため inline style は妥当（CLAUDE.md 規約準拠）
  - `tagSuggestPanel` の class は Tailwind utilities で、transform は computed state なので inline style で分離 → clean architecture
  - コメント無し（WHY は layout effect コメントと JSDoc で説明済み）

### [N-007] container / panel / shiftY の state 管理が厳密
- 場所: `TagsInput.tsx` L85, L91-95
- `shiftY` state と `shiftYRef` の二重管理が desync なし（常に同値で更新）
- `containerRef` / `panelRef` は用途が明確に分離（container: outside-click / panel: rect 測定）
- null ガード完備（`el === null return` / `containerRef.current !== null check`）

---

## Summary

| Category | Count | 詳細 |
|----------|-------|------|
| Blockers | 0 | revert 対象なし |
| Warnings | 2 | ADR-005 status update / window resize edge case 認識 |
| Notes | 7 | 設計・実装・テストが完璧。特に ADR-005 + happy-dom 対策と P-001 テストが秀逸 |

**クリアすべき actionable items**:
- [W-001] ADR-005 status を Proposed → Accepted に更新（comment-cleanup フェーズ）
- その他: 指摘対象なし

---

## Technical Deep-Dive: ADR-004 / ADR-005 の数学的正当性

### ADR-004: Natural 復元補正の理論

`computeShiftY` の不変条件: **測定 rect は natural（未シフト）位置であり、算出する補正値は絶対値**。

```typescript
const next = computeShiftY(
  { top: rect.top - applied, bottom: rect.bottom - applied },
  window.innerHeight,
);
```

- **初回** (`applied = 0`): `rect - 0` = rect（natural 値そのまま） → `computeShiftY` が正しい絶対値 shift を返す
- **再測定** (`applied ≠ 0`): 前回シフトが style に適用済みなので、`getBoundingClientRect()` は shifted rect を返す → `rect - applied` で natural に復元 → `computeShiftY` が正しい新しい絶対値を返す

**無限ループ無し**: 依存配列 `[panelOpen, candidates.length, isNewDraft]` には `shiftY` を含めないため、`setShiftY` は effect を再走させない。effect は「height change signal」（candidates.length / isNewDraft 変化）のときだけ走る。

### ADR-005: happy-dom 環境での spurious 値対策

happy-dom は layout engine を持たないため、`getBoundingClientRect()` は常にゼロ rect `{ top: 0, bottom: 0, ... }` を返す。

**シナリオ: ADR-004 の `shiftY` 依存ありバージョンを happy-dom で走した場合**

1. 初回 open: `getBoundingClientRect()` → `{ top: 0, bottom: 0, ... }` → `computeShiftY({ top: 0, bottom: 0 }, 633)` → 0（in-range） || margin による補正 → `shiftY = +8`（spurious）
2. `setShiftY(+8)` → re-render
3. effect 再走（依存 `[..., shiftY]` が変わった）→ `getRect()` → `{ top: 0, bottom: 0 }` → `computeShiftY(...)` → +8 → `setShiftY(+8)` 
4. ... **Maximum update depth exceeded** ❌

**ADR-005 による解決:**

1. `shiftYRef` で ref から applied を読む
2. 依存配列から `shiftY` を除く
3. effect は height change signal のときだけ走る（1 パス）
4. spurious +8 が出ても、effect は再走しない → happy-dom 環境での既存テスト緑のまま
5. 実ブラウザでは spurious 値が出ない（natural top は input 直下で margin 内に無い）

**結論**: ADR-005 の ref wiring は happy-dom での無限ループを構造的に排除しながら、実ブラウザでの正確性を保つ完璧な設計。

---

## 追記: Review Checklist

- [x] 計画との整合性: AC-1 ～ AC-5 全て実装済み確認
- [x] ADR 適合性: ADR-001 ～ ADR-005 全て反映済み
- [x] React 19 / RSC: "use client" directive 正確、state/ref/effect の正確な使用
- [x] a11y 非干渉: aria-expanded/controls/activedescendant/ IME ガード unchanged
- [x] メモリリーク: listener cleanup / ref 管理完備
- [x] Tailwind / inline style: utility-first 規約準拠、state style は inline transform
- [x] コメント: CLAUDE.md のコメント慣習（WHY のみ）準拠
- [x] テスト: outside-click / clamp / P-001 / 非回帰 全て実装済み

すべてクリア。

