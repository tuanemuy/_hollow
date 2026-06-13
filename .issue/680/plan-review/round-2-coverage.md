# Round 2 レビュー — Issue #680 計画（視点: 要件カバレッジ・スコープ整合性）

レビュー日: 2026-06-13
対象: `.issue/680/plan.md` / `.issue/680/adr.md`（1周目修正後）
前提資料: Issue #680 本文、`.issue/680/plan-review/round-1-coverage.md`、実コード（admin/identity の各 PromptsForm、SavedViewsList、useRovingMenu、routerInvalidate）

---

## 総評

1周目（coverage）の指摘1件・改善提案3件はすべて正しく反映されている。Issue 本文の全要件（原因特定 → focus/selection 復元、3フォーム横断、発生源非依存、最新値再表示の非退行、value 保持の維持）が AC-1〜AC-8 に網羅され、各 AC と実装ステップの紐づけも妥当。スコープ外（PreviewPanel.sample、Dialog 系、value 再マウント耐性、invalidate 抑制、#669）は根拠付きで明示されており、混入リスクは解消された。計画に残る要件カバレッジ・スコープの問題はゼロと判断する。

### 1周目指摘の反映確認

- coverage [P-001]（PreviewPanel.sample のスコープ外明記）: 反映済み。スコープ「含まれないもの」L29、調査結果 L44、ステップ6 L117、AC-4 L20、ADR-001 適用範囲 L56 に明記。さらに「#680 の復元対象は loader-seed か否かではなく invalidate コミットで focus が落ちるか否か」という #670 ADR-002 とのズレ（1周目で懸念点として挙げた箇所）まで ADR L56 に取り込まれており、線引き根拠が正確化されている。
- coverage [S-001]（AC-3 検証単位を両フィールドに明示）: 反映済み。AC-3 L19「両フィールドそれぞれ」、ステップ7 L125「両フィールドで個別に確認（片方だけの取りこぼし防止）」。
- coverage [S-002]（AC-5 raw invalidate の検証フォーム指定）: 反映済み。AC-5 L21・ステップ7 L127 で views inline `<input>` を代表に指定。AC-6 確認フォームも views と明記（L128）。
- coverage [S-003]（AC-1 の対応ステップに 7 を追加）: 反映済み。AC-1 L17 の対応ステップが「1, 2, 7」になり、ステップ7 L124 に修正前 focus→body 再現が AC-1 実機確証として記載。

### 実コードとの整合（再確認）

- admin/PromptsForm: text=`<textarea>`（L189）、variables=`<input type="text">`（L211, value={variables}）の2フィールド構成を実コードで確認。plan の記述と一致。
- identity/PromptsForm: text `<textarea>`（L224）と PreviewPanel.sample `<textarea>`（L362, useState("")）が同一ファイルに同居。plan のスコープ線引きと一致。
- SavedViewsList: inline rename `<input value={draft} autoFocus>`（L360/L366）。plan の記述と一致。
- 計画が引用する行番号がいずれも実コードと一致しており、検証単位がコードに正しく接地している。

---

#### 問題点（要修正）

問題点ゼロ。

#### 改善提案（検討推奨）

- **[S-001]** AC-7（value 保持の維持）の検証が、テスト方針・ステップ7では views で確認する記述（L128「入力 value 保持を確認」）に留まり、admin の variables `<input>` のように onChange/useState 配線を新規に触る箇所での value 保持確認が明示されていない。
  - 理由: 本フックは onChange/value ロジックを変更しない前提（ステップ4-6で明記）なので退行リスクは低く、AC-7 を views 代表で確認するのは妥当。ただしステップ5で admin の2フィールドに新規イベントハンドラ（onSelect/onKeyUp/onMouseUp 等）を追加するため、ハンドラ追加が既存 onChange と干渉しないことを admin でも軽く確認すると、検証の網羅性がわずかに上がる。必須ではない（フックは value に触れない設計が ADR で担保されている）。

#### 良い点

- 1周目の全指摘（P-001 + S-001/S-002/S-003）を見送りゼロで取り込み、レビュー履歴（plan L161-179）に反映内容を具体的に記録している。トレーサビリティが高い。
- AC ⇄ ステップの紐づけが1対1で明確。AC-2→ステップ4（views）、AC-3→ステップ5（admin 両フィールド）、AC-4→ステップ6（settings text のみ）、AC-5→ステップ3+7（発生源非依存）、AC-6/AC-7→各 consumer ステップ。実コードの該当行と検証単位が一致。
- スコープ外の線引きが網羅的かつ根拠付き: PreviewPanel.sample（誤配線防止のため明示）、Dialog 系（portal+focus-trap の別構造／#670 ADR-002 整合）、value 再マウント耐性（#670 no-repro）、invalidate 抑制（AC-6 退行防止）、#669（別経路）。Issue の3箇所限定スコープを逸脱する作業の混入は見当たらない。
- 新規成果物がフック1本＋ユニットテスト1本＋検証記録のみで、`useRovingMenu`/`routerInvalidate` の既存配置慣行に沿う。スコープ膨張がない。
- AC-1 の「特定してから方針決定」要求に対し、コードリーディング（ステップ1）＋既存前例（useRovingMenu）＋実機 before 再現（ステップ7前半）の三層で確証する構成になっており、Issue 本文の流れに忠実。

---

## 結論

要件カバレッジ・スコープ整合性の観点で要修正の問題点はゼロ。改善提案1件は任意。計画は実装着手可能な水準にある。
