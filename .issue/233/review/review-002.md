# PR Review #002 — feat(editor): add inline mode for editing existing notes

**PR:** #282
**Date:** 2026-05-28
**Round:** 2回目

---

## Summary

- Blockers: 1（修正済み）
- Warnings: 3（修正済み）
- Notes: 多数
- Verdict: **BLOCKED → 修正済み**

---

## Frontend

### Blockers
なし

### Warnings
なし（W-F-001〜W-F-007 全て1周目で対応済み）

### Notes
- W-F-001 解消: `onInitFailed` JSDoc に副作用契約明示
- W-F-002 解消: ADR-003 Consequences に装飾範囲ペースト制約を追記
- W-F-003 解消: `serializeHostContent` で contenteditable 属性除去
- W-F-004: 計画通り見送り
- W-F-005 解消: `structureSignature` JSDoc 追記
- W-F-006 解消: stateRef パターン採用（ADR-008）
- W-F-007 解消: `<section aria-label="ノート本文">` への変更（Biome の useSemanticElements 規約に合致）

**Verdict (Frontend)**: APPROVE

---

## State / Logic

### Blockers
なし

### Warnings

- **[W-S-004]** ADR-008 の Consequences の主張が不正確 → **修正済み**
  - 場所: `.issue/233/adr.md` ADR-008 Consequences
  - 修正内容: 「1 マイクロタスク内で完了」の不正確な記述を削除。`useEffect` は同イベントハンドラ内では実行されず commit phase で走るため、同一イベント内で blur 由来の dispatch を捕捉するには `flushSync` が必要であることを明示。本パターンは「別イベントで dirty 化 → モード切替」のメイン経路を解決し、blur 由来の差分は次の autosave で拾われるため実用上影響限定的、と整理

### Notes
- W-S-001（blur stale read）: 部分解消。「別イベントで dirty → モード切替」のメイン経路はテスト 3 ケースで pin、「同一イベント内 blur 由来」のエッジは ADR-008 Consequences で明示
- W-S-002, W-S-003: 1周目通り現状維持

**Verdict (State/Logic)**: APPROVE

---

## Test

### Blockers

- **[B-T-001]** `noteEditorModeChange.test.tsx` が untracked → **修正済み**
  - 場所: `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx`
  - 修正内容: 後続コミットでステージング・コミット・push する

### Warnings

- **[W-T-011]** `autosave error 単独` ケース名が実態と乖離 → **修正済み**
  - 場所: `noteEditorModeChange.test.tsx`
  - 修正内容: テスト名を `"confirms when autosave entered an error state via the dirty path"` に変更し、実態と一致させる

- **[W-T-012]** paste テストが挿入点 (`<p>`) を構造で検証していない → **修正済み**
  - 場所: `inlineEditor.test.tsx`
  - 修正内容: `host.querySelector("p")?.textContent` での確認を追加

### Notes
- W-T-001〜W-T-010 のうち W-T-001〜W-T-009 は inlineEditor.test.tsx に組み込み済み・PASS
- W-T-010 は noteEditorModeChange.test.tsx 3 ケースで pin（B-T-001 修正後にPR反映）

**Verdict (Test)**: APPROVE（B-T-001 修正後）

---

## Design Decisions

このラウンドで見つかった設計判断:

- ADR-008 の Consequences を技術的に正確な記述に修正（W-S-004 対応）。「`flushSync` が必要なケースがある」「本パターンは別イベント経路を解決する」「blur 由来の差分は autosave で拾われる」を明文化
