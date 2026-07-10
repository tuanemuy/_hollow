# PR #828 テストレビュー（テスト網羅性・設計・品質）

対象テスト:
- `app/components/layout/__tests__/EditorTitleContext.test.tsx`
- `app/components/layout/__tests__/HeaderCenter.test.tsx`
- `app/components/note/editor/__tests__/useEditorTitleSync.test.tsx`

参照: `.issue/824/plan.md`（AC-1〜AC-8 / テスト方針）、既存規約
`UploadNavItem.test.tsx` / `noteEditorUnsavedFlag.test.tsx`。

総評: 3 本とも happy-dom + `createRoot`/`act`/`IS_REACT_ACT_ENVIRONMENT`
の規約に忠実で、クリーンアップも適切。plan の「テスト方針」に明記された
スコープ（HeaderCenter の title 有無分岐、setter 伝播＋参照安定、harness の
push/cleanup）は文言どおり満たしている。偽陽性・トートロジーの明確な欠陥は
なく、Blocker はなし。ただし plan が「唯一 churn を封じ込める load-bearing な
不変条件」と位置づける 2 つの再レンダー抑制機構（ADR-003 の value/setter 分離の
実効、ADR-006 の children-as-prop bailout）が、書かれたテストでは**実際には
検証できていない**点を Warning とする。

## Test

### Blockers

なし

### Warnings

- **[W-001]** ADR-003（value/setter context 分離）の「実効」が検証されていない
  / 場所: `EditorTitleContext.test.tsx:70-99`（"keeps the setter reference
  stable"）
  / 理由: このテストは `tick` を外部から変えて `Setter` を再レンダーさせ、
  読み取った setter が同一参照であることだけを確認する。しかし
  `useState` の setter は**単一の結合コンテキスト実装でも常に参照安定**なので、
  この assertion は「value と setter を分離した」ことを一切証明しない。
  分離を単一 context（`{title, setTitle}` を毎レンダー新規オブジェクトで
  提供）に退行させても本テストは**そのまま緑になる**。ADR-003 が実際に防ぎたい
  のは「title(value) の churn が setter だけを購読する consumer を再レンダー
  させないこと」だが、本テストは title を一度も動かしていないためその性質を
  突いていない。すなわち plan テスト方針の「setter 参照が安定」は満たすが、
  ADR-003 の設計目的そのものは無検証。
  / 提案: setter のみ購読する consumer にレンダーカウンタ（body で `count++`
  など）を仕込み、`useEditorTitle` 値を `push("X")` で変化させた後にその
  consumer が再レンダーされていないことを assert する。これで value churn が
  setter 側に波及しない＝分離の効き目を直接検証でき、単一 context への退行を
  捕捉できる（現状は捕捉できない）。

- **[W-002]** ADR-006（"children as prop" bailout）が未検証 / 場所: PR 全体
  （`EditorTitleProvider` に対する再レンダー抑制テストが存在しない）
  / 理由: plan/ADR-006 は「provider の自 state 再レンダーで `{header}` +
  `<main>{children}</main>` の巨大サブツリーが打鍵ごとに再 reconcile されない
  のは children を安定 element 参照として prop 渡ししているから。inline 化すると
  全 `/_app` が打鍵ごとに再レンダーする回帰」と、これを唯一の churn 封じ込め
  機構＝load-bearing な不変条件として繰り返し強調している。にもかかわらず、
  この不変条件を守るテストが 1 本もない。`EditorTitleProvider` に「安定参照の
  children」を渡し `setTitle` を叩いても children が再レンダーされないことは
  provider 単体でユニット検証可能（AppShellDrawer フル mount 不要）。将来
  provider 本体で children を inline 描画へ退行させても、現状のテスト群は全て
  緑のまま通過してしまう。
  / 提案: レンダーカウンタ付きの子を `EditorTitleProvider` の `children` prop
  として渡し、`useSetEditorTitle` の setter で title を複数回 push しても子の
  レンダー回数が増えないことを assert するテストを追加する（W-001 と同じ
  レンダーカウンタ手法で 1 ファイルに同居可）。plan が最重視する不変条件の
  唯一の自動回帰ゲートになる。

### Notes

- **[N-001]** AC-2 / AC-4 / AC-7 は CSS 由来（`sm:hidden` / `truncate` /
  `min-w-0` / `text-sm`・`font-medium`・`text-ink`・左寄せ）で happy-dom では
  レイアウト計算されず、現状これらは完全に manual-test 依存。
  `HeaderCenter.test.tsx` は長文タイトルを流しているのに `textContent` しか
  見ていない。低コストな補強として、`.header-doc` 要素の `className` が
  `HEADER_DOC`（少なくとも `sm:hidden` と `truncate`）を含むこと、root（中央
  grid アイテム）が `min-w-0` を持つことを assert しておくと、クラス誤削除に
  よる AC-2/AC-4/AC-7 退行を安価に捕捉できる。class 文字列 assertion は多少
  脆いが、plan がこれらを manual に丸投げしている現状の穴埋めとして有効。

- **[N-002]** `HeaderCenter` 自身の「title 有 → null への反応的復帰」が
  未検証 / 場所: `HeaderCenter.test.tsx`。3 ケース（null / 非空 / whitespace）は
  いずれも初期 render 一発で、同一マウント内で title を非空→null に戻したとき
  `data-doc` が外れ `.header-doc` が unmount されることを直接は突いていない
  （`render()` helper は provider を保持したまま再 render できる構造なので、
  `render("X")` → `render(null)` を続ける 1 ケースで容易に足せる）。AC-6 の
  検索復帰の反応性は `EditorTitleContext`（値の null 往復）と `useEditorTitleSync`
  （unmount で null）で間接カバーされているため軽微。

- **[N-003]** import パスの軽微な不統一: `useEditorTitleSync.test.tsx` は
  context を `@/components/layout/...` エイリアス、SUT を `../` 相対で参照する
  一方、`EditorTitleContext.test.tsx` / `HeaderCenter.test.tsx` は全て `../`
  相対。SUT 自身の import 慣習には沿っているため実害なしだが、`__tests__` 内で
  相対 `../` に揃えると 3 ファイルの一貫性が上がる。

## 良かった点（参考）

- title の null→値→null 往復（`EditorTitleContext.test.tsx:57-67`）、
  whitespace-only の trim 判定（`HeaderCenter.test.tsx:78-82`）、複数回 rerender
  での最新値追従（`useEditorTitleSync.test.tsx:73-83`）、mount 初期 push
  （edit）と unmount クリア（AC-6）を、タスク指定のエッジケースとして過不足なく
  カバーしている。
- `useEditorTitleSync` の unmount テスト（`:85-115`）は `Switcher` で harness
  サブツリーだけを unmount し、provider 配下に残した `Probe` で null 復帰を
  観測する構成で、cleanup effect の発火を偽陽性なく突いている。既存
  `UploadNavItem.test.tsx` のモジュールレベル可変フラグ（`linkActive`）の慣習に
  も一致。
- `mount`/`rerender` を「同一ツリー位置での re-render（remount ではない）」に
  してあるため、"pushes latest" が cleanup→null のフラッシュを挟まず純粋に
  update effect を検証できている（setter 安定に依存した正しい設計）。
