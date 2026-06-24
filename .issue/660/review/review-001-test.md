# PR #774 レビュー — Test 観点（review-001-test）

対象 PR: #774 / 計画: `.issue/660/plan.md`（AC-8 中心）
観点: テストの網羅性・設計・回帰価値
レビュー対象ファイル:
- `app/components/common/useRovingTablist.ts`（実装・新規）
- `app/components/note/list/DisplayModeSwitch.tsx`（実装）
- `app/components/public/PublicTopControls.tsx`（実装）
- `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx`（テスト）
- `app/components/public/__tests__/PublicTopControls.test.tsx`（テスト）

実行確認: 上記2テストファイル **29 tests passed**（`pnpm vitest run`）。

---

## Test

### Blockers

なし。

role 契約の移行（旧 → 新）・矢印キー回帰・既存挙動の不変はいずれも回帰として固定されており、計画 AC-8 が要求する最低ラインは満たしている。Blocker 相当の欠落は検出されなかった。

### Warnings

- **W-001: 矢印キー roving の DOM フォーカス移動（`.focus()` 副作用）がユニットで一切アサートされていない**
  - 場所: `DisplayModeSwitch.test.tsx`（矢印キー系テスト群 290-402行）/ `useRovingTablist.ts:76-78`
  - 理由: `useRovingTablist.onKeyDown` は「`onSelect(next)` 呼び出し」と「`containerRef` 配下 `[role="radio"]` への `.focus()`」の2つを副作用として持つ。ユニットテストは前者（navigate / aria-checked 移動）を厚く固定する一方、**後者（フォーカスが移動先 radio に追従する = roving tabindex の本体挙動）を全く検証していない**（`grep` で `.focus` / `activeElement` ヒットゼロ）。roving の存在意義は「Tab で1停止、矢印でフォーカス移動」なので、フォーカス追従が壊れても（例: `querySelector` セレクタの typo、`radios?.[next]` のインデックスずれ）ユニットは緑のまま素通りする。実機 manual-test（TC-002/004 で `focused=タイル(tabindex=0)` 等）が拾ってはいるが、manual-test は手動かつ非自動回帰なので将来のリファクタを守らない。
  - 提案: 矢印キー後に `expect(document.activeElement).toBe(tabByLabel("タイル"))` を1ケース足す。happy-dom は `HTMLElement.focus()` / `document.activeElement` を実装しているので低コストで追加でき、「移動 = 選択 + フォーカス追従」の不可分性（ADR-004 の主張そのもの）を回帰として閉じられる。

- **W-002: ArrowUp / ArrowDown 分岐がどのテストでも実行されていない（デッドに近い網羅漏れ）**
  - 場所: `useRovingTablist.ts:56-72`（`nextKey`/`prevKey` と `ArrowDown`/`ArrowUp` 判定）/ `DisplayModeSwitch.test.tsx`・`PublicTopControls.test.tsx`
  - 理由: フックは ArrowRight/Left に加えて ArrowDown/Up も「次/前」として受理する（67・69行、横並びでも縦キーを通す設計）。しかしユニットで押されるのは ArrowRight / ArrowLeft / Home / End / Tab のみ（`grep ArrowUp|ArrowDown` ヒットゼロ）。`orientation: "vertical"` の呼び出し元も存在しない（両コンポーネントとも default horizontal）。結果、`orientation==="vertical"` 分岐と `ArrowDown`/`ArrowUp` 受理分岐は**テストで一度も通らない未検証コード**になっている。計画 AC-3／重点項目は「ArrowRight/ArrowLeft/Up/Down/Home/End」を網羅対象に挙げており、Up/Down が抜けている。
  - 提案: `pressKey("ArrowDown")` が ArrowRight と同じ結果（次へ）、`pressKey("ArrowUp")` が ArrowLeft と同じ結果（前・ラップ）になる回帰を各1ケース追加する。フック単体の振る舞いとして安価に固定できる。`orientation: "vertical"` 分岐は現状コンシューマー不在なので、未使用なら型から落とすか、後述 N-001 のフック単体テストで担保するかの二択。

### Notes

- **N-001: `useRovingTablist` フック単体テストは無いが、コンポーネント経由で「概ね」十分。ただし上記 W-001/W-002 の穴はフック単体テストがあれば自然に塞がる**
  - 場所: `app/components/common/`（`useRovingTablist.test.*` 不在）
  - 既存プリミティブ `useRovingMenu` も専用テストを持たず consumer 経由で検証する**プロジェクト先例に沿っている**ため、フック単体テスト不在そのものは妥当（`docs/test.md` の「Frontend: 必要最小限」とも整合）。ただし consumer 経由テストは consumer が踏む経路（horizontal / Right/Left/Home/End）しかカバーせず、フック固有の分岐（vertical・Up/Down・`count===0` early return・`getTabIndex` の境界）は素通りする。W-001/W-002 を consumer 側で足すなら現状方針のままで良い。`orientation`・`count===0` まで含めて締めたいならフック単体テスト1本の方が見通しが良い、という選択の問題。どちらでも AC-8 は満たすため Note 留め。

- **N-002: role 契約の旧→新移行は正しく、かつ「旧マークアップ非存在」を明示的に固定できている（良い点）**
  - 場所: `DisplayModeSwitch.test.tsx:99-129`
  - `radiogroup`/`radio`/`aria-checked` への更新に加え、`[role="tablist"]`・`[role="tab"]`・`[aria-selected]` が **null であることを3本の expect で明示**している。単に新 role を足すだけでなく旧契約の残存を検出する作りで、移行漏れ（片方だけ radio 化等）を確実に捕まえる。`aria-checked` の `"true"`/`"false"` 文字列シリアライズ（getAttribute ベース）も計画リスク欄の指摘どおり厳密にアサートされており、boolean→属性文字列の取り違えを防げている。`tabByLabel` のセレクタも `[role="radio"]` へ更新済み。

- **N-003: happy-dom 上のキーボード発火方法は flaky になりにくい**
  - 場所: `DisplayModeSwitch.test.tsx:86-91`（`pressKey`）
  - `act(() => group.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })))` で React 合成 onKeyDown を発火する流儀は、同ファイルの既存 `act(render)`/`act(click)` と一貫し、計画リスク欄・docs/test.md の方針どおり。`bubbles: true` で container の onKeyDown まで確実に伝播し、`act` ラップで state 反映を待つため、非同期待ち（fake timers 等）を要しない同期検証で安定している。flaky 要因（未ラップの dispatch、microtask 待ち漏れ）は見当たらない。

- **N-004: 未処理キー（Tab）の preventDefault 非介入が固定されている（良い点）。ただし Space/Enter は未固定**
  - 場所: `DisplayModeSwitch.test.tsx:388-402`
  - 計画ステップ1（2周目 arch S-002）が要求した「未処理キーで preventDefault しない／フォーカスが segmented から離れる」を、`event.defaultPrevented === false` + navigate 非発火で固定できている。これはネイティブ button の Tab 離脱を矢印 roving が奪っていないことの回帰として価値が高い。一方、計画の重点で並記されていた **Space / Enter** は「未処理キーで preventDefault されない」ケースとしては固定されていない（Tab のみ）。Space/Enter はネイティブ button の onClick 経由 select に委ねる設計（ADR-001/ADR-005）なので、これらで preventDefault が走ると活性化が壊れる。Tab で代表させた判断は許容範囲だが、`key:"Enter"`/`" "` でも `defaultPrevented===false` を1アサート足すと、フックが button 既定活性化を奪っていない保証がキー網羅として完結する。N 留め（Tab で同等経路を通過済み・onKeyDown の分岐構造上 Enter/Space も同じ early return に落ちるため実害確率は低い）。

- **N-005: PublicTopControls の SSR harness 制約（静的契約のみ）は妥当。動的回帰の欠落も許容範囲**
  - 場所: `PublicTopControls.test.tsx:142-150`
  - `renderToStaticMarkup` ベースのため `dispatchEvent` による KeyboardEvent 発火・`.focus()` 検証ができないのは事実で、矢印キー動的回帰を DisplayModeSwitch 側に集約した判断は計画どおり妥当。public 側の更新が **`aria-checked="true"` を含む静的アサート1本のみ**（旧 `aria-selected="true"` からの置換）に留まる点は、role 契約の最小確認としては機能するが、(a) `role="radiogroup"`/`role="radio"` 自体の存在、(b) 旧 `tablist`/`tab`/`aria-selected` の非存在、(c) roving tabindex（選択中のみ 0）が **静的マークアップ上でも検証可能なのに未アサート**である。DisplayModeSwitch と PublicTopControls は別実装（別ファイル・別 roving 配線）なので、public 側の静的契約も DisplayModeSwitch 並みに `html` 文字列で `role="radiogroup"`/`tabindex="0"` 等を確認しておくと、public 固有の配線ミス（例: SEGMENTED_BTN への tabIndex 付け忘れ、role 取り違え）を SSR harness の範囲内で安価に拾える。SSR harness 新設を要する動的キーボードテストの欠落は妥当だが、静的に拾えるものを `aria-checked` 1本に絞ったのはやや薄い。N 留め（manual-test TC-001 が実機で radiogroup/tabindex/旧 role 不在を確認済みのため最低限の担保はある）。

- **N-006: 既存挙動の不変（#219 navigate replace:true / #650 localStorage 永続 / search payload）の回帰は完全に維持されている（良い点）**
  - 場所: `DisplayModeSwitch.test.tsx:132-288`
  - role/roving 化に伴いセレクタ（`[role="tab"]`→`[role="radio"]`）と aria 属性名（selected→checked）のみ差し替え、navigate guard・write-before-guard 順序（#650 ADR-005）・effective mode による active 判定・#215 prev pass-through・空 prev でのクリーン URL といった既存契約テストは**全て温存**されている。計画が「select ハンドラに触れない」とした設計が、テスト差分上も「契約テストはセレクタ更新のみ」で裏取りできており、AC-5 の不変性が回帰でロックされている。矢印キー経路が click と同じ `select` に収束する設計のため、これら既存契約が矢印経路にもそのまま効くのも妥当。

- **N-007: テストは振る舞い検証寄りで過剰結合していない（良い点）**
  - role/aria-checked/tabIndex という**公開 ARIA 契約**と navigate 呼び出し引数（`replace`/`search` の出力）を見ており、フック内部実装（`querySelector` の呼び方、内部変数）には結合していない。`useRovingTablist` を別実装に差し替えても、ARIA 契約と navigate 出力が保たれる限りテストは緑のままで、リファクタ耐性がある。唯一 W-001 のフォーカス追従だけが「振る舞いとして重要なのに未検証」で、これは過剰結合ではなく**網羅不足**の側の問題。

---

## 総評

role 契約の旧→新移行（radiogroup/radio/aria-checked、旧 tablist/tab/aria-selected の非存在明示）、矢印キー回帰（Right/Left/Home/End・両端ラップ・連続矢印→連続 navigate・選択中のみ tabIndex=0・Tab 素通し）、既存挙動の不変（#219/#650/#215）はいずれも回帰として的確に固定されており、AC-8 の要求水準を満たす。Blocker なし。

ただし Test 観点で2つの実質的な網羅穴がある:
- **W-001**: roving の本体である **DOM フォーカス追従（`.focus()`）がユニットで一切検証されていない**。manual-test が拾うのみで自動回帰が無く、セレクタ/インデックスのリグレッションを緑のまま通す。
- **W-002**: **ArrowUp/ArrowDown 分岐が全テストで未実行**。計画が網羅対象に挙げた Up/Down が抜けており、`orientation:"vertical"` ともども未検証コードになっている。

いずれも consumer 側に各1〜2ケース足すか、フック単体テスト1本で安価に塞げる。Space/Enter の preventDefault 非介入（N-004）と public 側静的契約の薄さ（N-005）は許容範囲だが、足すと網羅が完結する。
