# テスト実行サマリー — Issue #680

**実行日時**: 2026-06-13
**テストソース**: .issue/680/testing.md
**サーバー**: http://localhost:3000（pnpm dev / DEV staleTime:0）
**検証ビルド**: フック `useRestoreFieldFocusOnCommit` 有り（3フォーム配線済み）

invalidate 発火・focus/caret 観測はすべて focus を動かさない `eval` で実施。

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | 修正前 focus→body 再現（AC-1） | 前提確証 | N/A | 修正後ビルドのため実機再現不可。#670 の既存実証を引用、解消は TC-2〜6 で確認 |
| TC-2 | /views inline rename の focus・caret 保持（AC-2） | 正常系 | PASS | caret 39→39 一致、focus 復帰、value 保持 |
| TC-3 | /admin/prompts text textarea（AC-3/text） | 正常系 | PASS | caret 11→11 一致 |
| TC-4 | /admin/prompts variables input（AC-3/variables） | 正常系 | PASS | caret 8→8 一致 |
| TC-5 | /settings/prompts text textarea（AC-4） | 正常系 | PASS | caret 18→18 一致。PreviewPanel.sample は除外 |
| TC-6 | raw invalidate() 発生源非依存（AC-5） | 正常系 | PASS | caret 39→39 一致 |
| TC-7 | 文中 caret が末尾に飛ばない（S-002） | 横断 | PASS | 全 TC で after caret が文中位置と一致 |
| TC-8 | IME 変換中 invalidate（S-003） | 異常系 | PASS（代替確認） | composition 中は復元抑制で caret 不動。compositionend 後に復元再開 |
| TC-9 | caret スナップショット実測ゲート（S-001） | ゲート | PASS | 全 TC で退避値存在＋復元後 selection が退避値と数値一致 |
| E-1 | 無操作 autoFocus 後 invalidate で focus のみ復元 | 異常系 | PASS（修正後） | 初回は focus 復元されず（バグ）→ フック修正後に focus 復元を確認（TC-E1-retest） |
| E-2 | 別要素へ focus 移動後は復元しない | 異常系 | PASS | focus は移動先に留まり奪い返さない（TC-E2-retest で回帰確認） |
| R-1 | 保存→invalidate→最新値再表示の非退行（AC-6） | 既存影響 | PASS | 編集値反映・編集モード解除・エラーなし |
| R-2 | 入力 value 保持の非退行（AC-7） | 既存影響 | PASS | admin の onChange + 新ハンドラ同居でも壊れず |
| R-3 | 品質ゲート（AC-8） | 既存影響 | PASS | typecheck PASS、lint エラー0（既存 warning のみ）、format クリーン |

**合計**: 14 件（PASS: 13 / N/A: 1）。FAIL なし。

## E-1 の経緯（修正実施）

初回検証で E-1（autoFocus で開いた直後・未操作のまま invalidate が来ると focus が `<body>` に落ちたまま復元されない）が判明。原因は held-focus フラグが React 合成 `onFocus` 経由でしか arm されず、autoFocus マウント時には発火しないこと。

修正: コミット後 effect 末尾で `activeElement === 当該要素` なら held-focus フラグを arm する処理を追加（`useRestoreFieldFocusOnCommit.ts`）。これにより autoFocus / programmatic focus でも held-focus が正しく立つ。

再検証（TC-E1-retest / TC-E2-retest / TC-2-retest）:

- E-1: before `{INPUT, start:27}` → after `{INPUT, start:27}`（修正前は after `{BODY}`）。focus 復元、caret は snapshot 未取得のため強制移動なし。**PASS**
- E-2 回帰: 別要素（header-search）へ focus 移動後 invalidate → focus は移動先に留まる。focus 奪取の増加なし。**PASS**
- TC-2 回帰: caret 25（文中）→ invalidate → after も 25。末尾に飛ばず。**PASS**

フォールバック条件（focus 戻らない／caret 不一致）への該当は全項目でなし。

## 検証の限界

- TC-1（修正前再現）: 修正後ビルドのため実機再現不可。#670 Step 0 の既存実証を引用。
- TC-8（IME）: 実 IME の駆動は agent-browser で行えず、`CompositionEvent` の dispatch で composition フラグを再現して代替確認。フックの責務「composition 中は setSelectionRange を呼ばない」は確認済み。
