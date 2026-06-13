# PR #684 レビュー — review-002（Frontend / 2周目）

- 対象 PR: #684
- 観点: Frontend
- 実装計画: `.issue/680/plan.md` / 設計判断: `.issue/680/adr.md`（ADR-004 まで）
- 1周目: `.issue/680/review/review-001-frontend.md` / 仕分け: `.issue/680/review/review-001.md`
- 結論: 計画・ADR の方針（コミット後 focus/selection 復元フック、3フォーム配線、invalidate 経路非介入）に忠実。AC-1〜AC-8 を満たす。1周目 Test 系修正（未コミット test ファイル）も反映済みで 9件 PASS。**Blocker なし。** 1周目 Frontend W-001 の見送り判断は概ね妥当だが、ADR-004 の「`onBlur` で arm 解除する案は本質的に成立しない」という論拠の一点に未検証の前提が残るため、論点を更新して Warning として再掲する（再掲であって新規 Blocker ではない）。

## 最新状態の確認

- フック本体 `app/components/common/useRestoreFieldFocusOnCommit.ts`・3フォーム配線・ADR-001〜003 はコミット済み（`47a4bdba`）。
- 未コミット差分: `.issue/680/adr.md`（ADR-004 追記）、`app/components/common/__tests__/useRestoreFieldFocusOnCommit.test.tsx`（1周目 Test 指摘の修正）。両方を Read で確認済み。
- `pnpm vitest run` で当該テスト 9件 PASS を実測（`ProbeNoHandlers` による snapshot=null フォールバック pin・isConnected ガード独立 pin・compositionend 後復元再開を含む）。

## 受け入れ基準の検証（2周目・再確認）

| AC | 判定 | 根拠 |
|----|------|------|
| AC-1 | 満たす | ADR-001 + フック JSDoc（L5-53）で機序を記録。`useRovingMenu`（L93-121）と同機序を突合。実機 before は TC-1/TC-E1 で `<body>` 落ちを観測。 |
| AC-2 | 満たす | `SavedViewsList/index.tsx:267,367,376`。`autoFocus` 維持（L366）、`onChange`（L372）と `{...handlers}`（L376）は別プロップで非干渉。 |
| AC-3 | 満たす | `admin/PromptsForm/index.tsx:107-108,196,203,220,227`。text=`<textarea>` / variables=`<input>` を別フックインスタンスで個別配線。型パラメータも要素に整合。 |
| AC-4 | 満たす | `identity/PromptsForm/index.tsx:148,231,239`。text `<textarea>` のみ。`PreviewPanel.sample` は未配線（スコープ外遵守）。 |
| AC-5 | 満たす | 復元は `activeElement === document.body` を見るだけで発生源非依存。TC-6 で raw invalidate を確認。 |
| AC-6 | 満たす | invalidate 経路（`UploadDialog.tsx` / `routerInvalidate.ts`）に変更なし（ソース変更は4ファイル）。TC-R1 で非退行確認。 |
| AC-7 | 満たす | `handlers` に `onChange` は含まれず、各フォームの `onChange`/`useState` seed は不変。value 保持。 |
| AC-8 | 満たす | `pnpm typecheck` 通過（1周目報告）、当該ユニット 9件 PASS を本周で実測。 |

## 見送り・解決済み指摘の処理は妥当か

- **1周目 Frontend W-001（受容リスクで見送り）**: ADR-004 Consequences に明記。発生条件の狭さ・実害の小ささ・完全解決の重さ（描画構造見直し）を理由に見送る判断自体は筋が通る。ただし論拠の一部に未検証前提が残る（下記 W-001 参照）。記録の所在・トレーサビリティは妥当。
- **1周目 Frontend W-002（autoFocus 無操作で復元されない）→ E-1 修正で解決**: post-commit `activeElement === el` 経路の arm（L129-131）で解消。ADR-004 に経緯記録、ユニットで `ProbeNoHandlers` により「snapshot=null だが arm → focus のみ復元・`setSelectionRange` 未呼出」を回帰防御として pin（test L186-229）。解決済みの仕分けは妥当で、再掲不要。

## Frontend

### Blockers

なし

### Warnings

- **[W-001（1周目 W-001 の再掲・論点更新）]** ADR-004 の「`onBlur` で `hadFocusRef` を解除する案は本質的に成立しない」という論拠に、未検証の前提が含まれる
  - 場所: `.issue/680/adr.md` ADR-004 Consequences ／ `app/components/common/useRestoreFieldFocusOnCommit.ts:145-155`（`onBlur` が snapshot 退避のみで `hadFocusRef` を解除しない）
  - 再掲であることの明示: これは 1周目 Frontend W-001 と同じ「body へ意図的 blur 後、無関係 invalidate で focus を奪い返す」奪取余地の指摘。仕分けで受容リスクとして見送り済み。**新規 Blocker として上げ直すものではない。**
  - 新規の論点: 見送り根拠の core は ADR-004 の「`activeElement === document.body` だけでは『RSC detach の focus 落ち』と『ユーザーの意図的 body blur』を区別できない（本質的制約）」。だが 1周目提案の `onBlur` arm 解除案は、まさにこの2者を **React 合成 `onBlur` の発火有無で区別できる**という主張だった。フック JSDoc（L19-22 相当の記述）・`useRovingMenu`（L98-100）・#670 Step 0 はいずれも「RSC コミット由来の focus drop は `relatedTarget: null` の `focusout` であり、ノードは detach されるが remount ではない」と整理している。もしこの drop が React の合成 `onBlur` を発火させないなら、`onBlur` で arm 解除しても本来守りたい「RSC drop からの復元」は壊れず、意図的 blur のみ復元対象から外せる——つまり ADR-004 の「本質的に区別不能」は成り立たない可能性がある。逆に合成 `onBlur` が発火するなら ADR-004 の論拠は正しい。**どちらかは実機で 1 観測すれば確定するが、現状その観測がない。** 実害の小ささ（value 保持・再クリック可）を理由にした見送りは別途妥当だが、ADR-004 が「区別不能」を断定的に書いている点は実測の裏付けがないまま強い。
  - 未検証ケース: TC-E2-retest（`.issue/680/manual-test/results/TC-E2-retest.md`）は「別 input（`header-search`）へ focus 移動 → `activeElement !== body` で復元せず」を pin しているが、これは W-001 が問題視するケースとは別物。W-001 は「空白領域クリック等で `<body>` へ落とし、focus がそこに留まったまま無関係 invalidate」＝ `activeElement === body` のまま奪取条件が成立するケースで、これは未検証のまま。admin/identity の `<textarea>` は editing 中ずっと DOM 残留するため再現余地がある（views inline rename はキャンセル/保存で unmount されるので実害限定的、という1周目の整理は妥当）。
  - 提案: 見送り結論を変える必要はないが、ADR-004 Consequences の「`activeElement === document.body` だけでは区別できない（本質的制約）」を、実測で裏取りするか、あるいは「RSC drop が合成 `onBlur` を発火させるか未観測のため `onBlur` arm 解除案の可否は未確定。実害の小ささを主因に見送る」と論拠の重心を「区別不能」から「実害小」へ正す方が誠実。本フックの変更は不要。

### Notes

- **[N-001]** ハンドラ spread の非干渉が3フォームすべてで構造的に正しい。`handlers` は `onSelect/onKeyUp/onMouseUp/onInput/onFocus/onBlur/onCompositionStart/onCompositionEnd` のみで `onChange` を含まず、各 `<input>`/`<textarea>` の `onChange` は独立プロップとして共存（`SavedViewsList` L372 vs L376、admin L201 vs L203 / L224 vs L227、identity L233 vs L239）。AC-7 の value 保持が型・構造レベルで担保。
- **[N-002]** `capture()`（L94-106）が `document.activeElement !== el` で早期 return してから `hadFocusRef` を立てる順序のため、別要素 focus 中に発火したイベントで誤 arm しない。`selectionStart/End === null`（selection 非対応要素）では snapshot を更新せず null フォールバックへ倒れる安全設計も維持。
- **[N-003]** ADR-004 の修正（post-commit arm、L129-131）はフック JSDoc L43-48 に WHY 付きで反映済み（autoFocus が合成 onFocus を発火しない／arm 二経路）。happy-dom では programmatic focus が onFocus を発火させる差異もテスト冒頭コメント（L16-23）と `ProbeNoHandlers` の設計に明記され、ユニットが実機 E-1 経路を非トートロジーで pin。CLAUDE.md「library-level JSDoc に WHY」規約に沿う。
- **[N-004]** IME ガードは `composingRef` を `compositionstart`/`compositionend` で開閉、復元 effect 冒頭 `!composingRef.current` で抑制、`compositionend` で `capture()` 再実行（L159-162）。test L231-264 が「composition 中は body 維持 → compositionend 後に復元再開」を pin し、`composingRef` が永久に立ちっぱなしになる退行も防いでいる。
- **[N-005]** ユニット 9件が restore ハッピーパス / 別要素移動 / 未 focus / null ガード / isConnected ガード / snapshot 無しフォールバック / autoFocus arm / IME / window-blur 相当を網羅。1周目 Test B-001（フォールバック素通り偽陽性）・W-001（isConnected 未到達）・W-002（compositionend 後復元未検証）の修正がすべて反映され、実測で PASS を確認。
- **[N-006]** `identity/PromptsForm` の `PreviewPanel.sample` が未配線でスコープ境界を遵守。admin の text/variables 双方への個別フックインスタンス適用も計画どおりで、片方取りこぼしなし。
