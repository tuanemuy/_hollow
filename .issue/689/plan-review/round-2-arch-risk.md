# Round 2 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #689）

レビュー対象: `.issue/689/plan.md` / `.issue/689/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク
前提: Round 1 の指摘（P-001 / P-002 / S-001〜S-004）が反映済みかを実コードで再確認。確定済みユーザー判断（タグのチップ化・ディレクトリ完全移行）は蒸し返さない。

---

#### 問題点（要修正）

問題点ゼロ。

Round 1 の2つの要修正は、いずれも計画・ADR に正しく反映され、実コードと整合することを確認した。

- **[Round1 P-001 = 解消]** ディレクトリ行の a11y モデルが「combobox（`aria-activedescendant` 仮想フォーカス）+ popup listbox」に確定し、`useRovingMenu`（実フォーカス roving）非使用が ADR-003・AC-4・設計（UI）・ステップ6b・リスク欄に一貫して明記された。「6bで確定」の先送り記述は削除済み。実装リファレンスとして挙げる `DirectorySelectField`（`app/components/directory/DirectorySelectField.tsx`）が実際にこのパターンで実装されていることを確認した:
  - 検索 input に `role="combobox"` / `aria-autocomplete="list"` / `aria-expanded` / `aria-controls` / `aria-activedescendant` を付与（238-261行）。
  - 自前の `activeIndex` state（88行）を `aria-activedescendant`（`${optionIdBase}-${activeIndex}`、135-137行）が指す。`useRovingMenu` は import すらしていない。
  - option の `onMouseDown` で `e.preventDefault()`（296-299行）して**実フォーカスを検索 input に固定**。ArrowUp/Down は `setActiveIndex` のみ動かし DOM focus は移さない（164-203行）。
  - フィルタで可視数が減るたび `activeIndex` をクランプ（128-132行）— 計画ステップ6の「可視 option フラット列と activeIndex を一致・クランプ」の前提と一致。
  - IME-safe Enter（`event.nativeEvent.isComposing` ガード、197行）も計画の記述どおり。
  - `role="listbox"` コンテナは検索 input の**兄弟**として描画され（269-312行）、combobox を listbox の子にしていない。計画の「兄弟配置」設計の実在リファレンスとして妥当。
  計画がこれを「実装参照（部品 import ではない）」と位置づけている点も正確で、`DirectorySelectField` は `fieldset`・他サーフェスで使い続けるため本Issueでは削除しない、という切り分けも実コード（`row`/`fieldset` 双方が利用）と整合する。

- **[Round1 P-002 = 解消]** 未確定 draft 確定が submit/autosave 共通の純粋ヘルパー `resolveTagNames(state)` を通る設計に確定し、`useAutosave` の `useMemo` deps 更新が計画に明記された。実コードと突き合わせて妥当性を確認した:
  - 現状 `useAutosave.ts:182-194` は `snapshotForSubmit({ ..., tagInput, ... })` を `useMemo`（deps に `tagInput`、193行）で構築し、304行の effect deps に `snapshot` が入る。計画が指す行・構造と完全一致。
  - 現状 `editorState.ts:570-585` の `EditorSnapshotInput` は `tagInput` を Pick し、`snapshotForSubmit` が `parseTagInput(input.tagInput)` を呼ぶ（582行）。`NoteEditor.tsx:240` の submit も `parseTagInput(state.tagInput)` を直接呼んでおり、二経路が別々にトークナイズしている現状を計画は正しく把握している。
  - 計画はこの二経路を `resolveTagNames(state)` 単一ヘルパーへ集約し、`EditorSnapshotInput` の `tagInput` 依存を除去、`useMemo` deps を `tagNames` + `tagDraft` に更新する、と ADR-001・ステップ1/4・依存関係・リスク欄・テスト方針に具体化済み。lockstep の根拠（同一関数を両経路が通る）と vitest 単体検証も明記。設計として実装可能で、現状コードの非対称（submit と autosave が別々に parse する）を解消する正しい打ち手。

#### S 指摘の反映確認

- **[Round1 S-002 = 反映]** `IngestionPreviewForm.tsx` の `parseTagInput` 依存を実コードで再確認: `import { parseTagInput } from "../note/editor/editorState"`（33行）、独自 `tagInput` useState（162行）、`parseTagInput(tagInput)`（195行）、`value={tagInput}`（310行）。計画の調査結果・依存関係・ステップ8 grep 対象（`app/components/ingestion/` 含む）に明記済み。`parseTagInput` のシグネチャ不変につき Ingestion 無影響、という結論も正しい（`parseTagInput` は editorState.ts に export されたまま残る設計）。
- **[Round1 S-003 = 反映]** `FlatDirectory` のインポート元を実コードで再確認: `loaders.ts:307` が `directoryTree.ts` から `FlatDirectory` を re-export（SSOT は `directoryTree.ts`）。既存 `DirectoryPicker.tsx:15` / `NoteEditor.tsx:35` はともに `../loaders` からインポート。計画は新コンポーネントも `../loaders` に合わせる旨を調査結果・リスク欄に統一明記済み。
- **[Round1 S-004 = 反映]** Rename/Delete の close→open 順序を実コードで再確認: 共有 `Dialog.tsx` が `previousActiveRef`（192行）に open 時の `document.activeElement` を捕捉し（215-221行）close 時に復帰させる。Popover 非モーダル下でアクションを押した瞬間にダイアログを開くと、消える option を `previousActiveRef` が掴むという S-004 の懸念は実装上実在する。計画は「`close()`（フォーカスをトリガーに戻す）→ ダイアログ open の順序」を設計（UI）・ステップ6b/6c・リスク・テスト方針に明記済みで、正しい緩和策。

#### 改善提案（検討推奨）

- **[S-001]** `DirectorySelectField` の listbox は「マッチが1件以上ある時だけ描画（`hasListbox`）」で、空のときは `aria-controls` / `aria-activedescendant` を**出さない**設計になっている（134-137, 245-249行）。新 `DirectoryTreeSelect` も同型の「候補ゼロ時は listbox 要素自体を非描画」にするか、計画の `aria-activedescendant` 駆動と整合させる必要がある。
  - 理由: combobox パターンでは「listbox が存在しないのに `aria-activedescendant` が存在しない id を指す」状態を避けるのが要点。`DirectorySelectField` はこれを `hasListbox` ゲートで実現している。計画ステップ6b は「検索でゼロ件」「全折りたたみで可視 option ゼロ」のときの listbox/activedescendant の扱いを明示していない。リファレンス（`DirectorySelectField`）の `hasListbox` ゲート相当を踏襲する一文をステップ6b に添えると、実装時の a11y 不整合（dangling activedescendant）を未然に防げる。実害は実装で吸収できる範囲なので任意。

- **[S-002]** 「新規ディレクトリを作成…」option を listbox の `role="option"` として含めるか、listbox の**外**（区切り線の下のアクション領域）に置くかを明確化すると安全。
  - 理由: モックは末尾に区切り線 + 「新規作成…」を置く。これを `role="option"` に含めると ArrowUp/Down の可視フラット列（ステップ6 純粋関数の算出対象）に「ディレクトリでない特殊 option」が混ざり、`activeIndex` クランプ・選択ハンドラの分岐が必要になる。計画は「末尾に option」とも「兄弟として区切り線 + 新規作成 option」とも読める記述が混在している。`directoryTreeSelect.ts` の純粋関数が返すフラット列に新規作成行を含めるか否か（＝矢印移動で到達するか）を1文で確定すると、ステップ6（純粋関数のテスト対象）とステップ6b（activeIndex 駆動）の境界が締まる。Round 1 で確定した combobox モデルの範囲内の細部で、設計判断レベルではないため改善提案に留める。

#### 良い点

- Round 1 の P-001 / P-002 がいずれも「先送り（6bで確定 / 非対称許容）」を排し、計画段階で単一モデルに**確定**された。最難点（roving モデル選択・lockstep）の不確実性が実装前に解消されており、ADR-003/ADR-001 の Decision が実コードのリファレンス（`DirectorySelectField` の combobox 実装・`editorState.ts` の `snapshotForSubmit` lockstep 契約）と矛盾しないことを確認できた。
- 計画が参照する実装リファレンスがすべて実在し、記述と一致:
  - `DirectorySelectField`（combobox + `aria-activedescendant` + IME-safe + クランプ + 実フォーカス固定）がそのまま `DirectoryTreeSelect` の駆動モデルの生きた手本になる。
  - `Dialog.tsx` の `previousActiveRef` フォーカス復帰機構が S-004 の close→open 順序要件の実在根拠。
  - `loaders.ts:307` の `FlatDirectory` re-export がインポート元統一（S-003）の実在根拠。
  - `IngestionPreviewForm.tsx` の独立した `parseTagInput`/`tagInput` 利用が「Ingestion 非回帰」（S-002）の実在根拠。
- ドメイン/ユースケース/アダプター影響ゼロ（`tagNames: readonly string[]` / `directoryId` XOR `pendingDirectoryName` サーバー契約不変）が実コード（`NoteEditor.tsx:240/254/268`、`editorState.ts` の `setDirectory`/`setPendingDirectoryName` の相互排他、427-440行）と一致。プレゼン層に閉じる範囲設定は引き続き正確。
- 二層化の波及範囲（`editorState.ts` の `tagInput`→`tagNames`+`tagDraft`、`setTagInput`→`addTag`/`removeTag`/`setTagDraft`、`createInitialEditorState`、`snapshotForSubmit`/`EditorSnapshotInput`、`useAutosave` deps、`NoteEditor` submit）が、実コードの該当箇所（`editorState.ts:115/140/201/445-448/570-585`、`useAutosave.ts:182-194`、`NoteEditor.tsx:240/380`）すべてと対応づいており、計画の依存グラフに漏れがない。
- スコープ境界（#688 最大幅 / #692 フォーカス表現 / Ingestion `fieldset` 除外）と ADR-004 の「border/rounded 撤去のみ・`p-4`/`focus-within` 温存」が引き続き明確で、責務分界が崩れていない。

---

## 返答サマリー

- 問題点: 0 / 改善提案: 2
- Round1 P-001（ディレクトリ a11y モデル）: 解消。`DirectorySelectField` が combobox + aria-activedescendant + 実フォーカス固定で実装済みであることを実コード確認、計画の参照は妥当。
- Round1 P-002（draft 確定 lockstep）: 解消。`resolveTagNames` 単一ヘルパー集約と `useAutosave` useMemo deps 更新（`tagInput`→`tagNames`+`tagDraft`）が計画に明記、現状コード（snapshotForSubmit/useAutosave:193/304）と整合。
- S-002/S-003/S-004 反映確認済み（Ingestion parseTagInput 依存・FlatDirectory は ../loaders・Dialog previousActiveRef による close→open 順序、いずれも実コードで裏取り）。
- `[S-001]` 候補ゼロ時の listbox/aria-activedescendant 非描画（DirectorySelectField の hasListbox ゲート相当）をステップ6b に明記すると dangling activedescendant を防げる。
- `[S-002]` 「新規ディレクトリを作成…」を矢印移動の可視フラット列に含めるか否かを1文で確定すると、ステップ6/6b の境界が締まる。
