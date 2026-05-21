# PR Review #001 — fix(views): apply SavedView tag filter to home note list

**PR:** #137
**Date:** 2026-05-22
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2（いずれも下記のとおり「修正不要 / 妥当な設計」と判定）
- Notes: 7
- Verdict: **APPROVED**

---

## General Review

### Blockers

なし

### Warnings

- **[W-001]** `loadSavedViewById` のリジェクトが `Promise.all` で全体崩しを誘発する懸念
  - 場所: `app/routes/index.tsx:56-62`
  - 理由: `Promise.all([loadSavedViewById, loadAllTags])` のいずれかが reject した場合、もう一方の Promise の結果は捨てられる。ループ走者の Promise が orphan になり unhandled rejection を起こす可能性があるという指摘。
  - 提案: `Promise.allSettled` に切り替えるか、`loadSavedViewById` の結果を見てから条件付きで `loadAllTags` を呼ぶ。
  - **判定: 修正不要**。`Promise.all` は内部で両 Promise に subscriber を attach するため、後続の rejection も `Promise.all` が consume する（MDN: "subsequent rejections are ignored"）。unhandled rejection にはならない。同ファイル `app/routes/index.tsx:69-106` の既存 `Promise.all`（5 件）も同様のパターンを採用しており、本修正で新しい技術的リスクを導入していない。

- **[W-002]** `viewId` 指定時に view=null の場合も `loadAllTags` が先取り実行される
  - 場所: `app/routes/index.tsx:56-62`
  - 理由: 不正な `viewId` を渡された場合、`view === null` 分岐で `restored` は使われないが、`loadAllTags` は既に発火している。「無駄な await」のレイテンシ寄与がゼロではない。
  - 提案: `loadSavedViewById` を先に await して `view !== null` のときだけ `loadAllTags` を呼ぶ。
  - **判定: 修正不要**。`loadAllTags` は `app/routes/index.tsx:98` で無条件に呼ばれており、React `cache()` で同一リクエスト内のヒットは無料。先取りしても捨てた結果は cache に乗ったままで後続呼び出しが恩恵を受けるため「無駄」にはならない。提案の直列化は view ヒット時のレイテンシを悪化させ、現状の並列化のほうがネット利得が高い。

### Notes

- **[N-001]** 根本原因の特定と修正アプローチが的確。`listSelectors.ts:138-187` の JSDoc が定めた「caller が resolver を提供する」契約に対して、home loader 側で契約を履行する形を取っており、`viewQueryToSearch` のシグネチャを破壊的に変えていない。
- **[N-002]** `Promise.all` で `loadSavedViewById` と `loadAllTags` を並列化したのは適切な設計。SavedView がヒットする happy path でレイテンシが直列化しない。
- **[N-003]** resolver の実装 `(tagIds) => tagIds.map((id) => tagNameById.get(id)).filter((name): name is string => name !== undefined)` は型ガード付きで未知 id を安全に drop しており、`brokenConditions` への影響もない。
- **[N-004]** 単体テスト追加なしは妥当。`viewQueryToSearch` のシグネチャ・契約は不変で、resolver 経路の挙動は既存 `listSelectors.test.ts` でカバー済み。home loader 全体は manual test TC-001〜TC-004 で網羅的に検証。
- **[N-005]** Manual test の網羅性は十分。TC-001（修正対象）、TC-002（解除）、TC-003（URL > SavedView 優先順位の回帰確認）、TC-004（不正 viewId のフォールバック）と本変更で気になる観点を全て押さえている。
- **[N-006]** `searchToViewQuery` 側（保存時）も既に caller 責任で tag 名→id 解決を行っており、対称的な責任分担。本修正で両方向が揃った。
- **[N-007]** TAG_RESOLVE_LIMIT 超過時の取りこぼしリスクは plan.md「リスクと注意点」で明示済み、別領域として切り離す判断は妥当。

---

## Design Decisions

特になし（adr.md への追記は不要）。
