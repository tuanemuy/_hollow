# PR #828 テストレビュー（2周目 / テスト網羅性・設計・品質）

対象テスト:
- `app/components/layout/__tests__/EditorTitleContext.test.tsx`
- `app/components/layout/__tests__/HeaderCenter.test.tsx`
- `app/components/note/editor/__tests__/useEditorTitleSync.test.tsx`

参照: `.issue/824/plan.md`（AC-1〜AC-8 / ADR-003 / ADR-006 / テスト方針）、
1周目 `review-001-test.md`（W-001/W-002/N-001/N-002/N-003）。

総評: **Blocker/Warning ゼロ**。1周目の 2 つの Warning（ADR-003 value/setter
分離の「実効」未検証、ADR-006 children-as-prop bailout 未検証）は、いずれも
レンダーカウンタ方式の新規テストで**弁別的に**解消された。単一結合 context へ
の退行・provider inline 化への退行のそれぞれで確実に赤になることを実装
（`EditorTitleContext.tsx`）と突き合わせて確認した。1周目 Notes（className
assert / title→null 反応 / import）も反映済み。12 tests 全て green。
happy-dom + `createRoot`/`act`/`IS_REACT_ACT_ENVIRONMENT` の規約遵守、
クリーンアップも適切で、偽陽性・新規の抜けは検出されなかった。

## Test

### Blockers

なし

### Warnings

なし

（1周目 W-001 / W-002 とも解消。以下、弁別性の検証記録。）

- **W-001（解消）** ADR-003 の分離の実効 —
  `EditorTitleContext.test.tsx:101-148`「re-renders value subscribers but not
  setter-only subscribers on title churn」で解消。`ValueConsumer` /
  `SetterConsumer` の render body にカウンタを仕込み、`push("Q2 計画")` /
  `push("Q3 計画")` で value 側は 2→3 と増える一方、setter 側は 1 のまま不変を
  assert している。**退行判定を確認済み**: 単一結合 context（`{title,setTitle}`
  を毎レンダー新規オブジェクトで供給）へ退行させると、両 consumer が同一 context
  を購読するため push 時に context value 変化で setter 側も再レンダーし
  `setterRenders===1` が破れて赤になる。1周目に指摘したトートロジー
  （`useState` setter は結合 context でも参照安定）を、値 churn を実際に流して
  「churn が setter 購読側へ波及しない」性質そのものを突く形へ正しく差し替えて
  いる。既存の「keeps the setter reference stable」テスト（:70-99）は据え置き
  だが、強いテストの補助として無害（N-001 参照）。

- **W-002（解消）** ADR-006 children-as-prop bailout —
  `EditorTitleContext.test.tsx:150-191`「does not re-render stable children when
  the title is pushed」で解消。context を一切購読しない `CountedChild` を含む
  `children` 要素を**一度だけ生成**して provider に prop 渡しし、`push("A")` /
  `push("B")` を叩いても `childRenders===1` 不変を assert。**退行判定を確認済み**:
  provider が `{header}`/`{children}` を自 body で inline 描画へ退行すると、
  provider 再レンダーごとに要素参照が作り直され `CountedChild` が再レンダーして
  カウンタが増え赤になる。context 非購読の子で純粋に element 参照安定 bailout を
  隔離しており、plan が「唯一 churn を封じ込める load-bearing な不変条件」と位置
  づける ADR-006 の自動回帰ゲートとして機能する。子要素をテストスコープで一度
  だけ生成する構図は、実 `AppShellDrawer`（title push で再レンダーしない親）が
  children を生成する構造を正しくモデル化している。

### Notes

- **[N-001]** `EditorTitleContext.test.tsx:70-99`「keeps the setter reference
  stable」は、W-001 で追加した :101-148 の強いテストに事実上包含される（後者が
  参照安定＋churn 非波及を同時に検証する）。単体では 1周目指摘どおり結合 context
  でも緑になる弱い assertion のまま。害はなく（決定論的・数ミリ秒）、「setter が
  再レンダーで参照不変」の意図をドキュメントする価値もあるため削除必須ではない
  が、重複と割り切って残す/畳むはどちらでも良い。実害なし。

- **[N-002]** import パスのクロスファイル不統一（1周目 N-003 の残り）:
  `useEditorTitleSync.test.tsx` は context/SUT とも `@/` エイリアス、他 2 ファイル
  は `../` 相対。**ファイル内では統一済み**で、かつ SUT 自身（`useEditorTitleSync.ts`
  が `@/components/layout/EditorTitleContext` を import）の慣習に沿っており実害
  なし。3 ファイル横断の一貫性を求めるなら `../` 相対へ寄せられるが、任意。

- **[N-003]** AC-2/AC-4/AC-7 の**実レイアウト**（`minmax(auto,1fr)` が伸びない・
  実際に ellipsis する・desktop で非表示）は happy-dom ではレイアウト計算されない
  ため依然 manual-test 依存。ただし 1周目 N-001 を受けた className assert
  （`HeaderCenter.test.tsx:86-98`: root に `min-w-0`、label に `sm:hidden` /
  `truncate`）がクラス誤削除に対する安価なガードとして追加済みで、退行検知の下限は
  確保されている。実レイアウト検証は plan テスト方針どおり manual-test で担保する
  前提で妥当。

## 良かった点（参考）

- W-001/W-002 の解消がいずれも「退行させたら赤になる」弁別性を備えており、
  コメントにも退行シナリオ（単一 context 化 / inline 化）が明記されている。
  レンダーカウンタを render body で 1 回だけ増やす手法は、context 購読起因の
  再レンダーを偽陽性なく数える正攻法。
- `HeaderCenter.test.tsx:100-111`（title 有→null 反応復帰、AC-6）が、同一 mount
  で provider state を保持したまま `render("X")→render(null)` する構図になっており、
  `TitleSeed` の effect 再実行 → `data-doc` 脱落 → 検索復帰、を remount せずに
  反応性として突いている。
- `useEditorTitleSync.test.tsx` の unmount クリア（:85-115）は `Switcher` で
  harness サブツリーのみ unmount し provider 配下の `Probe` で null 復帰を観測、
  cleanup effect の発火を偽陽性なく検証。`mount`/`rerender` を「同一位置での
  update（remount ではない）」に保ち、"pushes latest" が cleanup→null を挟まず
  純粋に update effect を検証している設計も適切（setter 安定に依存）。
