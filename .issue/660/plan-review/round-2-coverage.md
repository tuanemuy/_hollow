# Round 2 レビュー — Issue #660 計画（観点: 要件カバレッジ・スコープ整合性）

レビュー対象: `.issue/660/plan.md` / `.issue/660/adr.md`
観点: Issue 本文・コメントで合意された要件のカバレッジ、各受け入れ基準の検証可能性、基準と実装ステップの紐づけ、スコープ整合性。
前提: 1周目指摘（coverage P-001 / S-001 / S-002 / S-003）の反映確認。

---

## 結論サマリー

1周目で要修正とした **P-001（`TAG_ADD_OPTION_ITEM` の所在誤り）は正しく反映済み**。改善提案 S-001 / S-002 / S-003 もすべて取り込まれている。要件カバレッジ（W-002 本筋 + コメント要件）・スコープ整合性の観点で **残課題はゼロ**。重大・軽微いずれの問題点も検出されなかった。

---

#### 問題点

問題点ゼロ。

#### 改善提案

改善提案ゼロ。

#### 良い点

- **[G-001]** 1周目 P-001 が正確に反映された。AC-6（22行）・調査結果（49行）・ステップ4（117行）すべてで `TAG_ADD_OPTION_ITEM` を「`PublicTopControls.tsx` 653行・ファイル内ローカル定数（テンプレートリテラル、`${TOUCH_TARGET}` 内挿）、`public/styles.ts` には**無い**」と明記。コード照合でも `TAG_ADD_OPTION_ITEM` は `public/styles.ts` に grep ヒットせず、`PublicTopControls.tsx:653` のローカル const（`${TOUCH_TARGET}` 内挿のテンプレートリテラル）で実在を確認。`SORT_MENU_ITEM` は `public/styles.ts:119` に実在し、3定数の所在が正しく区別されている。テンプレートリテラル特有の追記位置（`focus-visible:bg-surface` の直後）もステップ4で明示されており、実装者が迷う余地が消えた。

- **[G-002]** 1周目 S-001 が反映された。ステップ6（132-134行）とテスト方針（164-165行）で「矢印キー動的回帰は DisplayModeSwitch.test のみ。PublicTopControls.test は `renderToStaticMarkup`（SSR 静的マークアップ）のため `createRoot`/`dispatchEvent` が使えず、契約アサーション更新（`aria-selected="true"`→`aria-checked="true"`）に留める」と明記。コード照合で PublicTopControls.test が `renderToStaticMarkup`（1, 104-156行）+ `aria-selected="true"` 静的アサート（148行）、DisplayModeSwitch.test が `createRoot`/`act`（3-4, 62-66行）harness であることを確認。SSR harness 制約の判断は事実と一致し、実装者が PublicTopControls 側で過剰な harness 改修に着手するのを防げている。

- **[G-003]** 1周目 S-002 が反映された。AC-3（19行）に「home では矢印移動が navigate（`replace: true`）を伴う」を追記し、ステップ6（133行）の「連続矢印 → 連続 navigate（home `replace: true`）の回帰を固定」と整合。基準（即選択 = navigate 副作用）とテスト（navigate 呼び出し検証）の対応が完結した。

- **[G-004]** 1周目 S-003 が反映された。AC-5（21行）の対応ステップが「2,3,6」となり、テスト（ステップ6）が紐づいた。「既存挙動の不変」を主張する AC-5 が回帰テストでロックされて初めて検証可能になる、という基準と検証手段の対応が閉じた。

- **[G-005]** Issue の二大要件のカバレッジが過不足なく維持されている。W-002 本筋（radiogroup 化 + 矢印キー roving）が AC-1〜5、コメント要件（menuItem focus-visible 統一 / ADR-011）が AC-6 に「由来」列付きで落ちている。コメントで「合わせて検討してほしい」とされた menuItem 統一を見送らずスコープに含めた判断（ADR-003）は妥当のまま。`gh issue view 660` のコメント本文（共通 `menuItem` の `focus-visible:bg-surface` のみ・WCAG 2.4.7・ADR-011 参照）と AC-6 / ADR-003 の対応も再確認した。

- **[G-006]** スコープ外判断（TagListToolbar 並び替え軸 segmented / EditorModeSwitch / 永続化方式 / ビュー本体 tabpanel 付与）が具体的根拠付きで維持されている。EditorModeSwitch は「実体パネルが存在する」ため ADR-001 の判断軸（実体 tabpanel の有無）と一貫して見送り、TagListToolbar は #626 ADR-001 の境界（非表示モード用途の .segmented は対象外）に沿って見送り。過剰拡大を正しく抑止しており、Issue title「**表示モード** segmented」のスコープと厳密に整合。

- **[G-007]** レビュー履歴（170-172行）に1周目の反映内容が ID 単位で記録されており、何がどう取り込まれたか追跡可能。arch S-001（`useRovingTablist` の onSelect 内包の是非）を実装時評価としてステップ1に残した扱いも、AC を満たす範囲で実装者の裁量に委ねる妥当な処理。

---

## 検証メモ（コード照合の裏取り）

- `TAG_ADD_OPTION_ITEM`: `public/styles.ts` に grep ヒットなし。`PublicTopControls.tsx:653` のローカル const（`${TOUCH_TARGET}` 内挿テンプレートリテラル、`focus-visible:bg-surface` のみ）→ P-001 反映が正しい。
- `SORT_MENU_ITEM`: `public/styles.ts:119` に実在 → 3定数の所在区別が正確。
- `PublicTopControls.test.tsx`: `renderToStaticMarkup`（1行 import / 104-156行使用）+ `aria-selected="true"` 静的アサート（148行）→ S-001 の SSR harness 制約は事実。
- `DisplayModeSwitch.test.tsx`: `createRoot`/`act` harness（3-4, 62-66行）、現状 `[role="tab"]` セレクタ（75, 97行）→ ステップ6のセレクタ更新（`[role="tab"]`→`[role="radio"]`）対象が正確。
- Issue #660 コメント: 共通 `menuItem` の `focus-visible:bg-surface` のみ・WCAG 2.4.7・ADR-011 参照を確認 → AC-6 / ADR-003 と整合。
