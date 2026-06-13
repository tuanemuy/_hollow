# PR Review #001 — feat: #689 P12エディターをデザインモックに揃える

**PR:** #712
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 7（重複1組あり → 実質6件）
- Notes: 21
- Verdict: **BLOCKED**（Warning を全件修正してから再レビュー）

## レイヤー別ファイル

- Frontend / UX / a11y: review-001-frontend.md（B: 0 / W: 1）
- 状態管理 / ロジック: review-001-state.md（B: 0 / W: 2）
- テスト: review-001-test.md（B: 0 / W: 4）

## 指摘一覧と仕分け

すべてこのPRで直す（スコープ内・同一ファイル/機能内）:

- [Frontend W-001 = State W-001] `role="option"` の `aria-selected` が「選択中ディレクトリ」でなく「矢印 active」を反映 — `DirectoryTreeSelect.tsx:272,322` → **修正**（aria-selected=選択中、active は data-active/aria-activedescendant で表現）
- [State W-002] 検索クエリ変更時に `activeIndex` がリセットされず無関係 option に active が残る — `DirectoryTreeSelect.tsx:92-94` → **修正**（query 変更で activeIndex を 0 リセット）
- [Test W-001] DirectoryTreeSelect のインタラクション無検証 — `DirectoryTreeSelect.tsx` → **テスト追加**（testing-library、`ViewSwitcher.test.tsx` に倣う）
- [Test W-002] TagsInput のキーボード/IME/blur 無検証 — `TagsInput.tsx` → **テスト追加**
- [Test W-003] directoryTreeModel の検索モード時 expanded/hasChildren 算出が無検証 — `directoryTreeModel.ts:122` → **テスト追加**
- [Test W-004] 空名ディレクトリの表示ラベルフォールバック無検証 — `directoryTreeModel.ts:130` → **テスト追加**

軽微で併せて対応:
- [Frontend N-002] combobox に `aria-labelledby` と `aria-label` 併存（前者デッド） — `DirectoryTreeSelect.tsx:244,251` → **整理**（一方に統一）

見送り（Note・対応不要）:
- [Frontend N-001] ゼロ件 listbox ゲートが create option 常時 append で実質デッド — 仕様通りの挙動（create 導線は常に出す）。記録のみ
- [Test N-003] `removeTag` が name 指定のみ（計画は「index または name」）→ 実装は name のみで十分・テストも整合。現状維持
- その他 Notes は良い点・参考情報
