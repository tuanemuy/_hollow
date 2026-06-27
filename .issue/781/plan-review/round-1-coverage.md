# Plan Review (Round 1) — Issue #781

**観点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/781/plan.md`, `.issue/781/adr.md`
**レビュー日:** 2026-06-27

## 前提確認

- `gh issue view 781 --json` で確認。**Issue にコメントは0件**（`"comments":[]`）。よって要件はすべて Issue 本文由来であり、コメント欄での追加合意・矛盾の検証対象は存在しない。
- `git show 15446b65:` で #776 適用後の `useRovingTablist.ts` / `TagListToolbar.tsx` / `routes/_app/tags/index.tsx` / `TagListToolbar.test.tsx` / `useRovingMenu.ts` を確認。plan.md の「調査結果」の記述（automatic がステートレスで `onKeyDown` の同期 focus が核心、`useRovingMenu.restoreFocusOnCommit` が先例、`loaderDeps: ({search})=>search` で `sort` 変化が loader 再実行を起こす）は実コードと一致している。

## Issue 本文の要件 → AC マッピング検証

| Issue 本文の要件 | 対応 AC | 状態 |
|---|---|---|
| 連続して矢印キーを押すと2回目以降が無視される（の解消） | AC-1 | カバー |
| データ駆動 RSC 再レンダー後のフォーカス脱落の復元 | AC-2 | カバー |
| automatic 経路でデータ駆動を伴う consumer のみ有効化 | AC-4 | カバー |
| `DisplayModeSwitch`（client-only）の後方互換を壊さない | AC-3 | カバー（さらに PublicTopControls / EditorModeSwitch まで拡張） |
| まず実ブラウザ（Chrome/Safari）で再現を確認 | AC-6 | カバー |
| #776 の受け入れ基準（単発選択・ARIA 契約・キーボード）維持 | AC-5 | カバー |

**漏れた要件は検出されず。** Issue 本文の全要件が AC に落ちている。

---

#### 問題点（要修正）

- **[P-001]** AC-4 の検証手段が計画内で矛盾しており、AC として「検証可能」になっていない。
  - 理由: 実装ステップ3は AC-4 の検証を「必要なら『opt-in しない automatic で body 脱落時に焦点を横取りしない』回帰を1本追加」と **optional**（「必要なら」）で記述する。一方「テスト方針」節は同じ項目を「opt-in しない automatic は body 脱落時に焦点を横取りしない（AC-4）」と **確定タスク**として列挙する。AC-4 は受け入れ基準である以上、その挙動的検証（焦点横取りしないこと）が optional だと「基準を満たしたか」を判定できない。既存 consumer のテスト（AC-3）は再レンダーを伴わないため AC-4 の「body 脱落時に横取りしない」挙動を実際には exercise しない可能性が高く、AC-3 の流用では AC-4 を代替検証できない。
  - 提案: AC-4 の回帰テスト（opt-in しない automatic で `<body>` 脱落＋再レンダーを模擬し、焦点が radiogroup へ戻らないことを assert）を **確定タスク**に格上げし、ステップ3の「必要なら」を削除してテスト方針と一致させる。これで AC-4 が観測可能な形で検証される。

#### 改善提案（検討推奨）

- **[S-001]** AC-1 / AC-2 の「対応ステップ」列が実装ステップ（1, 2）のみで、検証ステップ（3 の復元テスト・4 の実ブラウザ）を含まない。
  - 理由: ステップ3のテスト記述は「復元テスト（AC-1/AC-2）」と明記し、AC-6（ステップ4）も AC-1/AC-2 の挙動を実ブラウザで確認する。AC-5→3・AC-6→4 が「検証ステップ」を指すのに対し、AC-1/AC-2 だけ「実装ステップ」を指す混在状態。追跡性（どこで検証するか）を一貫させるため AC-1/AC-2 の対応ステップに 3, 4 を併記すると、各基準の検証地点が表だけで追える。

- **[S-002]** AC-3 の「フックのデフォルト挙動は #776 と byte 等価」という表現は厳密には不正確で、検証手段が曖昧。
  - 理由: 本変更は Rules of Hooks 上 `useEffect`（復元 effect）を **常時宣言**するため、非オプトイン consumer でも毎コミット後にこの effect が走り、先頭で `if (!restoreFocusOnCommit) return;` early-return する。したがって出力・挙動は等価だが「byte 等価」ではない（effect 呼び出しが1つ増える）。AC-4 自身が「実質的に通らない（早期 return でガード）」と early-return の存在を認めており、AC-3 の「byte 等価」と語感が衝突する。「ランタイム/挙動等価（= 既存3 consumer のテストが無改変で PASS することで検証）」と言い換えると、検証可能な基準として明確になる。

#### 良い点

- **要件カバレッジが完全。** Issue 本文の全要件（連続矢印・復元・opt-in 限定・後方互換・実ブラウザ再現・#776 基準維持）が AC-1〜AC-6 に過不足なく対応。コメント0件のため矛盾検証対象もなく、見落としリスクが低い。
- **スコープが明示的に境界付けられ、scope creep がない。** 「含まれないもの」で EditorModeSwitch への復元適用・DisplayModeSwitch/PublicTopControls の挙動変更・useRovingMenu 変更・RSC 再レンダー設計変更を、それぞれ「なぜ対象外か」の根拠（loaderDeps 外/client-only/別プリミティブ等）付きで除外。実装ステップにスコープ外作業の混入なし。
- **Issue の提案『例』を鵜呑みにせず吟味している。** Issue は「`selectedIndex` 変化を検知する effect で復元」を例示（要調査）したが、plan/ADR-002 はその案（案B）が optimistic で `selectedIndex` が body 脱落前に確定し取りこぼす点を分析し、dep 配列なし post-commit + キーボード意図フラグへ改善。Issue の方針と矛盾せず、より堅牢化している。
- **AC-6 が Issue の明示指示『まず実ブラウザで再現確認』を尊重。** agent-browser の偽陽性リスク（`.issue/776/manual-test/report.md` 参照）まで踏まえて実ブラウザ手動確認を AC の決め手に据えており、Issue 指示と完全整合。
- **後方互換の検証範囲を DisplayModeSwitch のみならず3 consumer 全て（+ manual の EditorModeSwitch）に拡張。** Issue が名指ししたのは DisplayModeSwitch だが、「全 consumer に影響する」という Issue の記述に沿って AC-3 で網羅しており、要件の意図を正しく汲んでいる。
</content>
</invoke>
