# PR Review #001 — 領域3「整理・公開管理」(P17/P18/P14) のモック実装追従

**PR:** #562
**Date:** 2026-06-07
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 5（うちコピーSR通知は frontend/a11y で重複 → 実質4テーマ）
- Notes: 多数（おおむね良好）
- Verdict: **BLOCKED**（Warning が残るため）

---

## Frontend 正当性・状態管理

#### Blockers
なし

#### Warnings
なし

#### Notes（要点）
- N-001〜N-005: ConfirmDialog 後方互換、useOptimistic 非干渉、ケバブ、props threading、link-card/コピーいずれも正当と確認。
- **N-006**: 新規インラインコピーボタンが既存 `UrlCopyButton` の成功フィードバック（アイコンスワップ + `aria-live`）を再利用していない。`copied` state が `aria-label`/`title` の切替のみで SR にアナウンスされない。→ a11y W-001 と同一テーマ。

## デザイン忠実度・スタイリング規約

#### Blockers
なし

#### Warnings
- **[W-001]** P18 タグ行アクションボタンの角丸がモックと不一致。場所: `app/components/tag/TagActions.tsx`（`pillBtn`+`pillBtnSm`）。モック `.btn-xs` は `rounded-sm`(6px) で base の `rounded-pill` を上書きするが、`pillBtnSm` は radius を base の `rounded-pill` のまま残す。→ 実装ピル型、モック角丸矩形。`pillBtnSm` は admin テーブル等で全社的にピル型として使われているため、本画面だけ変えると体系不整合。
- **[W-002]** P18 inline rename ブロックの操作ボタン配置がモックと異なる。場所: `app/components/tag/TagActions.tsx`（編集ブロックが見出し+input+ボタンを左寄せ1行）。モック `.tag-editing-block` は 2カラム（左=見出し+input、右端=保存/キャンセル）。
- **[W-003]** P18 タグ行の hover 背景（モック `.list-row:hover { background: surface }`）が未再現。場所: `app/components/tag/styles.ts` `TAG_ROW`。

#### Notes（要点）
- N-001〜N-004: トークン経由の寸法当て徹底、ConfirmDialog subject 設計、スコープ管理厳格、retention-note 忠実 — いずれも良好。

## アクセシビリティ

#### Blockers
なし

#### Warnings
- **[W-001]** コピー成功が SR に通知されない。場所: `PublishSettings/index.tsx`（onCopy / Copy ボタン）。`aria-label` 動的切替のみでライブリージョン無し。→ aria-label は固定にし、`role="status"`/`aria-live="polite"` の sr-only 領域で「コピーしました」を出す。
- **[W-002]** retention カードの `role="note"` は SR サポートが薄く実効性が低い。場所: `TrashList.tsx`。→ `aria-label="保存期間の案内"` 付与で意図を伝える。

#### Notes（要点）
- N-001〜N-009: ConfirmDialog の aria-describedby、二重アイコン回避、ケバブ keyboard/狭幅到達、focus 到達、タップターゲット44px、アイコンラベル、ラジオ fieldset、色のみ依存回避 — いずれも的確。

---

## 仕分け（メイン判断）

| 指摘 | テーマ | 対応 |
|------|--------|------|
| a11y W-001 / FE N-006 | コピー成功の SR 通知 | **このPRで修正**（sr-only `role="status"` 追加、aria-label 固定化） |
| a11y W-002 | retention `role="note"` 実効性 | **このPRで修正**（`aria-label` 付与） |
| design W-002 | 編集ブロック2カラム配置 | **このPRで修正**（`grid-cols-[1fr_auto]`） |
| design W-003 | タグ行 hover 背景 | **このPRで修正**（`hover:bg-surface` を TAG_ROW に） |
| design W-001 | ボタン角丸 pill vs rounded-sm | **ADR 化**（design-system 一貫性を優先しピル維持。ADR-005 参照）|

## Design Decisions

design W-001 はモック追従と shipped アプリの体系一貫性が衝突するケース。`pillBtnSm` は全社的にピル型の小型ボタンとして使われており、本画面だけ rounded-sm に変えると逆に不整合を生む。plan.md ステップ5 も `pillBtnSm` を指定済み。issue-implement のデザイン方針（既存に馴染ませる）にも沿うため、ピル維持を ADR-005 として記録する。
