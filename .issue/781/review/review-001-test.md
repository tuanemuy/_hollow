# PR #784 レビュー — Test 観点（review-001）

対象: Issue #781 / PR #784
レビュー軸: テストの網羅性・設計・信頼性
変更テスト: `app/components/common/__tests__/useRovingTablist.test.tsx`（新規）, `app/components/tag/__tests__/TagListToolbar.test.tsx`（1テスト追記）

## サマリ

- Blockers: 0 / Warnings: 1 / Notes: 3
- 追加テストは全 PASS（対象2ファイル 30 tests）。AC-3 consumer 3ファイル（DisplayModeSwitch / PublicTopControls / editorModeSwitch）も無改変 PASS（45 tests）。
- ミューテーション検証（実際にバグを仕込んで落ちるか）を5系統実施。計画が「最大の落とし穴」とした **早期フラグ解除**・**永続フラグ化**・**焦点横取り**・**復元そのものの欠落**・**キーボード意図フラグ欠落** はいずれも検出される（回帰防止は実効的）。検出されなかったのは「effect 先頭の opt-in 早期 return の単独除去」のみ（W-001。挙動は二重ガードで無害）。

## ミューテーション検証の結果（実測）

| # | 仕込んだバグ | 期待 | 実測 | 判定 |
|---|---|---|---|---|
| 1 | target 保持中にフラグを解除（計画リスク#1: 早期解除→commit-2 で復元不能） | 落ちる | 3 tests fail | 検出 |
| 2 | 復元後にフラグを倒さない（永続フラグ化） | 落ちる | 1 test fail（hook (b)） | 検出 |
| 4 | 「別所へ移動」ガード除去（焦点横取り） | 落ちる | 1 test fail（hook (c)） | 検出 |
| A | 復元 `focus()` 呼び出しを丸ごと無効化 | 落ちる | TagListToolbar 復元テスト fail | 検出（焦点アサートが load-bearing と確認） |
| C | `if (!restorePendingRef.current) return;` 除去（キーボード意図ガード） | 落ちる | 2 tests fail | 検出 |
| B | `if (!restoreFocusOnCommit) return;`（effect 先頭の opt-in 早期 return）のみ除去 | 落ちてほしい | **30/30 pass（検出されず）** | **未検出 → W-001** |

## Test

### Blockers

なし。

AC-1（連続矢印・2回目 navigate + 焦点保持）・AC-2（単発後の復元）・AC-4（非オプトイン非横取り）・フック3分岐（target 保持 / body 脱落 / 別所移動）・AC-5（既存 TagListToolbar 全テスト無改変）は実テストでカバーされ、主要回帰はミューテーションで検出可能であることを確認した。Blocker 相当の欠落・偽 PASS は無い。

### Warnings

- **[W-001]** AC-4 の「effect 本体を早期 return でガード」という *機構そのもの* は、どのテストでも固定されていない。
  - 場所: `app/components/common/useRovingTablist.ts:210`（`if (!restoreFocusOnCommit) return;`）に対する `useRovingTablist.test.tsx:181-191`（AC-4 テスト）/ `TagListToolbar.test.tsx:371-408`。
  - 理由: opt-in は二重にガードされている。(1) effect 先頭の `if (!restoreFocusOnCommit) return;`（210行）と、(2) `onKeyDown` 内 `if (restoreFocusOnCommit) restorePendingRef.current = true;`（192行）。`restore=false` のとき (2) によりフラグが立たないため、(1) を削除しても `if (!restorePendingRef.current) return;`（211行）で必ず止まる。実測（ミューテーション B）でも 210行を単独除去して **30/30 PASS = 未検出**。計画 AC-4 の文言は「復元コードパス（effect 本体）を実質的に通らない（早期 return でガード）」と *effect の早期 return* を名指ししているが、その早期 return を消しても落ちるテストが無い。
  - 影響度: 挙動は二重ガードで無害（単独除去では観測可能な差は出ない）。よって Blocker ではない。ただし「回帰防止の有効性」という観点では、存在する分岐の片方が一切ピン留めされておらず、AC-4 の *literal* な達成は未検証。
  - 提案（いずれか）:
    - 現状の二重ガードが意図的な冗長防御であることをコメントで明記し、テストは観測挙動（非横取り）の固定で十分とする立場を文書化する（最小対応）。または
    - opt-in でない経路を effect 単体で検証できないことを受け入れ、代わりに「`restore=true` だが矢印を一度も押さない → body 脱落 + commit で横取りしない」シナリオ（フラグ未挙上経路）を追加し、`restorePendingRef` ガード側を *consumer の意図に即した形* で正面から固定する。これは ADR-002 が flag を導入した理由（segmented は常時マウントで `open` ゲートが無い＝初期ロード/blur での横取り防止）の直接的な回帰テストにもなる。現状その「キーボード操作を一度もしていない opted-in 状態」のシナリオはどのテストも通っていない（全テストが必ず最初に `pressArrowRight` する）。なお該当ガードの *除去* 自体はミューテーション C で検出されるため、これは網羅の補完であって必須ではない。

### Notes

- **[N-001]** `TagListToolbar.test.tsx` の連続操作アサート（`TagListToolbar.test.tsx:400-402`: 2回目 ArrowRight で `routerNavigate` が1回呼ばれる）は、ローピング継続を *独立には* 証明しない。`pressSortKey`（同ファイル 81-87行）は keydown を `[role="radiogroup"]` 要素へ直接 dispatch するため、実際の焦点位置に関わらずハンドラへ届く。実ブラウザの本バグ（焦点が `<body>` にあると矢印イベントがグループに届かない）はこの経路では再現されない。このテストで真に load-bearing なのは直前の `expect(document.activeElement).toBe(getSortButtons()[1])`（397行）であり、ミューテーション A でこの焦点アサートが復元欠落を検出することを確認済み。navigate 回数アサートは補助に留まる旨を理解しておけば現状で問題ない（コメントに一言あると親切）。同じ dispatch 方式は hook 直叩きにもあるが、そちらは焦点 `activeElement` の固定が主眼で分岐判定は決定的なので影響なし。

- **[N-002]** `TagListToolbar.test.tsx:371-408` の復元テストは `routerNavigate` の `mockImplementation`（pending Promise 返却）が2回目の `pressSortKey` でも有効で、1回目の navigate Promise が未解決のまま残る（`resolveNav` は最後の呼び出しで上書きされ、末尾の `resolveNav?.()` は2回目だけを解決）。reject はされないため flaky/警告には至らず（実測 clean）テスト衛生上の軽微事項。`mockClear()` ではなく `mockReset()`／`mockResolvedValue` への戻しで pending を残さない方が意図は明快。

- **[N-003]** 既存に `useRovingMenu` のフック直叩きテストは存在しない（`app/components/common/` に `useRovingMenu.test.*` 無し）。よって新規 `useRovingTablist.test.tsx` が当該プリミティブ初のフック直叩きハーネスだが、`@vitest-environment happy-dom` + `IS_REACT_ACT_ENVIRONMENT` + `createRoot`/`act` という既存 consumer テスト（`TagListToolbar.test.tsx` / `DisplayModeSwitch.test.tsx` 等）の流儀に忠実で、命名（(a)/(b)/(c)/(AC-4)）・JSDoc での意図説明・3分岐の網羅も明快。タイマー非依存・マイクロタスク flush のみで flaky リスクは低い。`body 脱落 + 再レンダー` の2コミット構造（`pressArrowRight` 内の `onSelect→setState` が commit-1、`dropToBody`+`commit` が commit-2）も実フローを正しく模擬できており、忠実度は妥当。

## AC カバレッジ判定

| AC | 検証手段 | 判定 |
|---|---|---|
| AC-1（連続矢印で2回目も navigate・焦点保持） | TagListToolbar 復元テスト（焦点保持=397行 / 2回目 navigate=402行）+ hook (a) | 充足（navigate の独立証明は N-001 の留保あり、焦点保持は load-bearing） |
| AC-2（単発後の復元） | TagListToolbar 復元テスト + hook (b) | 充足 |
| AC-4（非オプトイン非横取り） | hook (AC-4)。観測挙動は固定 | 観測挙動は充足。effect 早期 return 機構の単独固定は未達（W-001） |
| フック3分岐（保持/脱落/別所） | hook (a)/(b)/(c)。ミューテーション 1/2/4/C で検出確認 | 充足 |
| AC-3（consumer 無改変 PASS） | diff は対象2テストのみ。consumer 3ファイルは差分外、実行 45 tests PASS | 充足 |
| AC-5（TagListToolbar 既存全テスト回帰なし） | diff は `@@ -363,6 +363,50 @@` の純追加のみ。既存テスト削除・改変なし、全 PASS | 充足 |
