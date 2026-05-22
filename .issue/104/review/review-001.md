# PR Review #001 — feat(ui): Dialog プリミティブの背景クリック / × ボタンによる close オプション

**PR:** #151
**Date:** 2026-05-22
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 10
- Notes: 24
- Verdict: **APPROVED with non-blocking warnings**

レイヤー別:

| Layer | Blocker | Warning | Note |
|-------|---------|---------|------|
| Frontend / a11y | 0 | 3 | 8 |
| Test | 0 | 4 | 6 |
| Code Quality / Consistency | 0 | 3 | 10 |

---

## Frontend / a11y

#### Blockers
なし

#### Warnings
- **[W-A-001]** 閉じるボタンのタッチターゲット 32×32px（`w-8 h-8`）が WCAG 2.5.5 AAA の 44×44px に届かない
  - 場所: `app/components/note/styles.ts:65-66`
  - 理由: モバイル/タブレットの指タップでミスヒットの可能性。`absolute top-3 right-3` 配置で panel の `p-6` 内側に食い込み、タイトル右端と視覚的に近接する。
  - 提案: `w-10 h-10`（40px）に拡大、または JSDoc に「panel タイトルは閉じるボタンと重ならないよう `pr-10` 等の右余白を取ること」を注記。

- **[W-A-002]** `mousedownTargetRef` が click 後にクリアされない
  - 場所: `app/components/common/Dialog.tsx`（backdrop click ハンドラ）
  - 理由: 実害なし（次の click 前に mousedown が走るため）だが「最後の mousedown 起点」を保持し続ける状態は読み手の認知負荷。スクリプト経由 `element.click()` で「mousedown を伴わない click」が将来 backdrop に届いた場合の誤閉じが理論上残る。
  - 提案: `onClick` 末尾で `mousedownTargetRef.current = null` リセット、または JSDoc に「リセット不要な理由」注記。

- **[W-A-003]** `showCloseButton` + `role="alertdialog"` の組み合わせ挙動が ADR/JSDoc で未言及
  - 場所: `app/components/common/Dialog.tsx`、`.issue/104/adr.md`
  - 理由: alertdialog 枝は初期 focus を `panel.focus()` で行うため `INITIAL_FOCUS_SELECTOR` のフィルタが効かないが、× は Tab cycle 内で Esc も従来通り動くので実害なし。ただし「alertdialog で × を出すべきか」は WAI-ARIA Authoring Practices で議論あり。設計判断として記録する価値あり。
  - 提案: ADR-006 か JSDoc に「`role="alertdialog"` でも `showCloseButton` は動作する。consumer の UX 判断で採否を決める」を追記。

#### Notes
(原文参照 — 良い点・実装妥当性確認 8 件)

---

## Test

#### Blockers
なし

#### Warnings
- **[W-T-001]** origin guard テストが panel の `stopPropagation` の有無を実効的に検証できていない
  - 場所: `app/components/common/__tests__/Dialog.test.tsx`（origin guard テストケース）
  - 理由: panel に mousedown → backdrop に click を発火するが、`stopPropagation` を削除しても `mousedownTargetRef.current` は panel になるだけで `!== backdrop` で reject されるため、テストは依然 PASS する。ADR-001 で謳う「panel 起点 drag → backdrop release」の保護を検証できていない。
  - 提案: panel 内 mousedown → backdrop mousedown → backdrop click の順で発火し、`stopPropagation` が機能している場合のみ「backdrop mousedown が記録されない」結果を観察できるテストを追加。

- **[W-T-002]** `fireMouseDownClick` の第二引数 `currentTarget` が未使用（dead parameter）
  - 場所: `app/components/common/__tests__/Dialog.test.tsx:45-58`
  - 理由: `void currentTarget` のみ、関数本体で一切使われていない。コメントで「intent 表現」とあるが、呼び出し側でも `currentTarget` を渡していない。読み手のノイズ。
  - 提案: 引数を削除し、コメントだけ残す。

- **[W-T-003]** × ボタンが Tab cycle 内に含まれることを検証するテストがない（ADR-004 の契約の半分が未検証）
  - 場所: `app/components/common/__tests__/Dialog.test.tsx`
  - 理由: 初期 focus 除外は検証されているが「× が Tab で到達できる」側は未検証。`FOCUSABLE_SELECTOR` 経由で自動的に含まれる実装のため一見自明だが、`INITIAL_FOCUS_SELECTOR` の `:not([data-dialog-close])` フィルタを誤って `FOCUSABLE_SELECTOR` 側にも適用するリグレッションが起きた場合に検知できない。
  - 提案: `showCloseButton=true` + 他 focusable がある状態で Tab キーを押下し × ボタンに focus が到達するケースを追加。

- **[W-T-004]** body scroll lock counter のリーク検知ガードがない
  - 場所: `app/components/common/__tests__/Dialog.test.tsx:23-28`
  - 理由: `bodyScrollLockCount` は module-scope mutable state。テストが render 後の同期処理中に throw した場合 useEffect cleanup が走らず counter が drift する可能性。優先度低。
  - 提案: afterEach 末尾で `expect(document.body.style.overflow).toBe("")` を追加。

#### Notes
(原文参照 — 良い点 6 件)

---

## Code Quality / Consistency

#### Blockers
なし

#### Warnings
- **[W-C-001]** テスト `fireMouseDownClick` の dead parameter（W-T-002 と重複）
  - 場所: `app/components/common/__tests__/Dialog.test.tsx:45-58`
  - 提案: 第二引数を削除。

- **[W-C-002]** `dialogCloseButton` の `disabled` 中に `hover:bg-surface` / `hover:text-ink` が効く
  - 場所: `app/components/note/styles.ts:65-66`
  - 理由: 既存 `pillBtn` も同じ問題を持つ（横断的な改修案件）。本 PR スコープに含めるかは判断。
  - 提案: `not-disabled:hover:bg-surface not-disabled:hover:text-ink` で改善可能。横断改修として別 Issue 化も可。

- **[W-C-003]** 初期 focus テストの直接アサーションが弱い
  - 場所: `app/components/common/__tests__/Dialog.test.tsx`（初期 focus テスト）
  - 理由: DOM 順での副次効果に依存しており、`INITIAL_FOCUS_SELECTOR` から × が除外されている事実を直接アサートしていない。優先度低。
  - 提案: 内部 selector を export して `expect(panel.querySelectorAll(INITIAL_FOCUS_SELECTOR)).not.toContain(closeBtn)` 相当を追加（trade-off あり）。

#### Notes
(原文参照 — 良い点 10 件)

---

## Design Decisions

特になし（既存 ADR-001〜008 で網羅）。

ただし修正方針として:
- **W-A-001（タッチターゲットサイズ）**: 既存 `pillBtn` との一貫性のため本 PR では現状維持（32px）し、JSDoc に「panel タイトルは `pr-10` で右余白を取る」注記のみ追加。
- **W-A-002（ref クリーンアップ）**: コスト極小で defensive 価値あり → 採用、`onClick` 末尾でリセット。
- **W-A-003（alertdialog + showCloseButton）**: JSDoc 一行追記。
- **W-T-001（origin guard 強化）**: テスト追加で実効性を担保。
- **W-T-002 / W-C-001（dead parameter）**: 削除。
- **W-T-003（Tab で × 到達）**: テスト追加。
- **W-T-004（scroll lock リーク検知）**: afterEach に assertion 追加。
- **W-C-002（disabled hover）**: 既存 `pillBtn` 等を含む横断改修案件のため本 PR スコープ外。Phase 4 で別 Issue 起票を検討。
- **W-C-003（selector アサーション）**: 内部 selector の export trade-off があるため本 PR では見送り。
