# PR Review #001 — feat(note): #824 P12 編集中のヘッダー簡略タイトル（モバイル orientation）

**PR:** #828
**Date:** 2026-07-10
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 3（Frontend 1 / Test 2）
- Notes: 18
- Verdict: **BLOCKED**（Test の再レンダー回帰ゲート未整備を修正するため）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 1）
- Styling / A11y: review-001-styling-a11y.md（B: 0 / W: 0）
- Test: review-001-test.md（B: 0 / W: 2）

## 指摘一覧と仕分け

- [Frontend W-001] 共有中央 grid アイテムへの `min-w-0` が全 `/_app` のヘッダー縮小挙動に波及 — `HeaderCenter.tsx:30`
  → **見送り（コード変更不要）**。truncation に必須かつ overflow 防止方向の改善で実害なし、manual-test 済み。AC-5 の caveat 補足のみ（adr.md ADR-004 に追記）。
- [Test W-001] setter 安定性テストがトートロジー（`useState` setter は結合 context でも安定＝分離を退行させても緑） — `EditorTitleContext.test.tsx:70-99`
  → **このPRで修正**。value churn が setter 購読側を再レンダーさせないことをレンダーカウンタで直接検証（ADR-003 の実効ゲート）。
- [Test W-002] children-as-prop bailout（ADR-006）の自動回帰ゲートが無い
  → **このPRで修正**。安定 children を prop 渡しした状態で title を push しても子が再レンダーされないことを provider 単体で検証。
- [Test N-001] AC-2/AC-4/AC-7 の CSS クラス（`sm:hidden`/`truncate`/root `min-w-0`）を assert してクラス誤削除を安価に捕捉
  → **このPRで修正**。
- [Test N-002] `HeaderCenter` の title 有→null 反応的復帰（data-doc 除去・`.header-doc` unmount）未検証
  → **このPRで修正**（`render("X")→render(null)`）。
- [Test N-003] `useEditorTitleSync.test.tsx` の import が `@/` と `../` 混在
  → **このPRで修正**（`../` 統一）。
- [Frontend N-007] `AppShell.tsx` が未使用 dead code（本 PR で悪化なし）
  → **見送り**。#824 と無関係の既存 dead code、スコープ外。

その他 Notes（Frontend 7 / Styling 7）は設計・規約準拠を確認した positive な所見。
