# PR #812 レビュー（3周目・収束確認） — Frontend

対象: PR 812 / 実装計画 `.issue/506/plan.md`
参照: `app/components/common/__tests__/Popover.test.tsx`（close→reopen テスト）/ `app/components/common/usePopover.ts`

## 2周目 W-001 の反映確認

2周目 Frontend/Test W-001（close→reopen テストのコメントが過大主張）の是正を確認した。`Popover.test.tsx:613-622` の "re-arms initial focus on close→reopen (rising-edge reset, W-001)" のコメントは、実装（`usePopover.ts:239-243`）と一致し正確になっている。

検証内容:

- 「plain re-render では effect deps 不変（`[open, moveInitialFocus]`）で再実行されないが、`open` false→true では initial-focus effect が再実行される」— `usePopover.ts:243` の deps と一致。正確。
- 「守る失敗モード = "fire once, never re-arm"。`if (open) prevOpenRef.current = true` 化すると reopen が rising edge と読まれず本テストが落ちる」— 実装は `prevOpenRef.current = open`（L240）＋ `rising = open && !prevOpenRef.current`（L239）。指摘の変異体では close 時に `prevOpenRef` が false へ戻らず、reopen 時 `rising=false` となり L645 が失敗する。主張どおり。過大主張は解消。
- 「リセット行を丸ごと削除する変異は検出できない（`prevOpenRef` が初期 false のまま毎回 rising と読まれ focus が着地する）。happy-dom の deps 安定性ゆえ分離検証不能」— 正確。削除しても close→reopen テストは緑のまま。リセット行の真の目的（open のまま他 dep 変化で effect が再評価される RSC シナリオでの再発火抑止）は happy-dom では deps が動かず分離できない旨の但し書きも実態と一致。

コメントは「テストが実際に守る失敗モード」に整合し、限界（何を検出できないか）も明記されており、過大主張はない。実装コード無変更も確認。

## 収束判断

2周目までに提起された Frontend 指摘は解消済み。今周の差分（コメント文言のみ）に起因する新規の Frontend 上の懸念はない。

### Frontend

#### Blockers
- **[B-001]** なし

#### Warnings
- **[W-001]** なし

#### Notes
- **[N-001]** close→reopen テストのコメントは、守る失敗モード（fire once/never re-arm ＝ `if(open) prevOpenRef.current=true` 変異）と、検出できない失敗モード（リセット行の丸ごと削除は happy-dom の deps 安定性で分離不能）の両方を正確に記述しており、実装（`usePopover.ts:239-243`）と一致する。収束を確認。
