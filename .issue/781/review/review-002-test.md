# PR #784 レビュー — Test 観点（review-002 / 2周目フルレビュー）

対象: Issue #781 / PR #784
レビュー軸: テストの網羅性・設計・信頼性
変更テスト: `app/components/common/__tests__/useRovingTablist.test.tsx`（新規 + AC-4 effect guard テスト追加）, `app/components/tag/__tests__/TagListToolbar.test.tsx`（1テスト追記）

## サマリ

- Blockers: 0 / Warnings: 0 / Notes: 3
- 対象2ファイル 31 tests PASS。AC-3 consumer 群（DisplayModeSwitch / PublicTopControls / editorModeSwitch 他）含む 17 files / 141 tests も無改変 PASS。
- **[W-001]（1周目）は解消**。追加テスト「(AC-4 effect guard) does not restore after the opt-in is switched off while the intent flag is already raised」が effect 先頭の opt-in 早期 return（`useRovingTablist.ts:210`）を**単独でピン留め**することを実機ミューテーションで確認。210行のみ除去 → **当該テストのみ FAIL（1 failed | 30 passed）**、他テストは不変。

## W-001 解消の検証（実測ミューテーション）

| 仕込んだバグ | 1周目結果 | 2周目結果 | 判定 |
|---|---|---|---|
| `if (!restoreFocusOnCommit) return;`（210行 = effect 先頭 opt-in 早期 return）のみ除去 | 30/30 pass（未検出） | **1 failed | 30 passed**（新 AC-4 effect guard テストのみ FAIL） | **検出（解消）** |

ロジック検証（実フローと一致）:

1. `render(0, true)`（opt-in）→ `pressArrowRight`：automatic 経路で `restorePendingRef=true` を立て、`onSelect(1)`→`setSelectedIndex(1)` が commit-1 を発火。commit-1 の effect は `restore=true / flag=true / activeElement===items[1]`（同期 focus 保持）で **217行 return（フラグ維持）**。→ フラグは raised のまま。
2. `dropToBody()` → `commit(0, false)`（opt-out）：この commit の effect では **211行のフラグガードは flag が依然 raised なので素通り**する。よって **210行の opt-in 早期 return だけ**が復元の横取りを止める唯一のガードになる。
3. 210行あり → 即 return → focus は `<body>` のまま（assert `toBe(document.body)` PASS）。210行除去 → 211行素通り → `selectedIndex=1` へ復元 focus → 横取り → assert FAIL。

これは 1周目の既存 AC-4 テスト（181–191行）が**一度もフラグを立てない**経路（`restore=false` で `pressArrowRight` → 192行が flag を立てない → 211行で停止）であり 210行を exercise できなかった盲点を、**フラグを立てた状態で opt-out に切り替える**ことで正面から塞いでいる。設計意図（二重ガードの片側 = opt-in 早期 return）を literal に固定できており、計画 AC-4 の文言「effect 本体を早期 return でガード」を充足する。

## Test

### Blockers

なし。

AC-1〜AC-5 とフック3分岐（target 保持 / body 脱落 / 別所移動）は実テストでカバーされ、計画が「最大の落とし穴」とした早期フラグ解除・永続フラグ化・焦点横取り・復元欠落・キーボード意図ガード欠落・**opt-in 早期 return** の全系統がミューテーションで検出可能であることを確認した。偽 PASS・Blocker 相当の欠落は無い。

### Warnings

なし（1周目 W-001 は解消）。

### Notes

- **[N-001]** 新 AC-4 effect guard テストによる 210行の単独ピン留めは、**フラグ永続化ロジック（commit-1 で target 保持中はフラグを倒さない＝217行 return）が正しいこと**を前提に成立する。仮に「210行除去」と「commit-1 でフラグを早期解除する」変異が**同時に**入ると、commit-2 で 211行が flag=false で停止し本テストは PASS してしまう（マスキング）。ただしフラグ永続化は hook (a)/(b) と 1周目ミューテーション#1/#2 が独立に固定しており、単一故障仮定（mutation testing の標準）下では 210行の検出は健全。二重変異耐性までは要求しない範囲なので情報共有に留める。

- **[N-002]**（1周目 N-001 を継続）`TagListToolbar.test.tsx:401-402` の2回目 navigate アサートは roving 継続を**独立には**証明しない。`pressSortKey` は keydown を `[role="radiogroup"]` へ直接 dispatch するため、実焦点位置に依らずハンドラへ届く。真に load-bearing なのは直前の `expect(document.activeElement).toBe(getSortButtons()[1])`（397行）で、復元欠落は焦点アサート（1周目ミューテーション A で検出済み）が捕捉する。AC-1 の焦点保持側は堅牢で、navigate 回数は補助。実ブラウザ確認（plan step 4 / `.issue/781/manual-test/`）が結合の決め手。

- **[N-003]**（1周目 N-002 を継続）`TagListToolbar.test.tsx` 復元テストの `routerNavigate.mockImplementation`（pending Promise）は2回目 `pressSortKey` でも有効で、`resolveNav` が上書きされ末尾の `resolveNav?.()` は2回目のみ解決する。reject されず flaky/警告には至らない（実測 clean）。テスト衛生上、`mockReset`／`mockResolvedValue` への復帰で pending を残さない方が意図が明快。軽微。

## AC カバレッジ判定（ゼロベース再検証）

| AC | 検証手段 | 判定 |
|---|---|---|
| AC-1（連続矢印で2回目も navigate・焦点保持） | TagListToolbar 復元テスト（焦点保持 397行 / 2回目 navigate 402行）+ hook (a) | 充足（焦点保持が load-bearing。navigate 独立証明は N-002 留保） |
| AC-2（単発後の復元） | TagListToolbar 復元テスト + hook (b) | 充足 |
| AC-3（consumer 無改変 PASS） | 差分は対象2テストのみ。consumer 群 141 tests 中含め全 PASS | 充足 |
| AC-4（非オプトイン非横取り） | hook (AC-4)（フラグ未挙上経路 = 211行）+ **新 hook (AC-4 effect guard)（opt-in 早期 return = 210行）** | **充足（二重ガード両分岐を固定。W-001 解消）** |
| フック3分岐（保持/脱落/別所） | hook (a)/(b)/(c)。ミューテーション #1/#2/#4/C で検出確認 | 充足 |
| AC-5（TagListToolbar 既存全テスト回帰なし） | 差分は純追加のみ。既存テスト削除・改変なし、全 PASS | 充足 |

## 信頼性・忠実度

- **忠実度（2コミット遅延の再現）**: hook テストは commit-1（`pressArrowRight` 内 `onSelect→setState`）で同期 focus が target を保持 → commit-2（`dropToBody`+`commit`）で body 脱落 → 復元、という #781 の2コミット構造を正しく模擬。新 AC-4 effect guard テストも同構造上でフラグを raised に保ったまま opt-out commit を差し込み、忠実。
- **アサーション厳密さ**: 焦点アサート（`activeElement` 同一性）は全テストで load-bearing。新テストの `toBe(document.body)` も 210行除去で FAIL することを実測（偽 PASS でない）。
- **回帰防止の有効性**: 計画の全リスク系統 + opt-in 早期 return が検出可能。
- **既存テスト非破壊**: diff は純追加（`@@ ... +N @@`）。AC-3 consumer / TagListToolbar 既存テストは無改変で 141 tests PASS。
- **flaky リスク**: タイマー非依存・マイクロタスク flush のみ・決定的なコミット順序。低い。
