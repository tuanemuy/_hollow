# Plan Review — Issue #697 (Round 1: 要件カバレッジ・スコープ整合性)

レビュー観点: Issueの受け入れ条件カバレッジ・スコープ整合性
レビュー対象: `.issue/697/plan.md` / `.issue/697/adr.md`
ベース: origin/main（PR #715 / Issue #696 取込済み）の実コードに対して検証

## 検証サマリ

main の実コードに対して plan.md の調査結果・行参照・実装ステップ・テスト計画を突き合わせた。主要な点はすべて正確だった:

- `EditorModeSwitch.tsx`（main）: `TABS_NEW` = wysiwyg/frontMatter/html、`TABS_EDIT` = inline(ビジュアル)/wysiwyg/frontMatter/html。plan の記述と一致。
- `editorState.ts`（main）: `EditorMode = "html" | "frontMatter" | "wysiwyg" | "inline"`（48 行）、`EditorSurface` JSDoc（50-57 行）、`DirtyKey` に `"frontMatter"` あり。plan の行参照と一致。
- `NoteEditor.tsx`（main）: `state.mode === "frontMatter"` 排他分岐（488 行付近）、`onModeChange`（192 行〜）の blur→confirm→WYSIWYG ゲート→`setMode`、`confirmWysiwygSwitch`（252 行〜）、`ConfirmDialog`（515 行付近）。plan / ADR-001 の記述と一致。`saveDisabled` に `state.frontMatterJsonError !== null`（286 行）あり — リスク欄の指摘どおり。
- `FrontMatterEditor.tsx`（main）: ルート要素 `mt-4 rounded-lg border border-hairline bg-surface-elevated p-5`。plan と一致。
- `editorState.test.ts:271`「setMode switches between html and frontMatter」、`autosaveLogic.test.ts:160`「returns true in FrontMatter mode...」に `setMode mode:"frontMatter"` あり — 要更新箇所として plan が捕捉済み。
- `editorModeSwitch.test.tsx` は **main で git 追跡済み**。期待値は edit `["ビジュアル","WYSIWYG","FrontMatter","HTML"]` / new `["WYSIWYG","FrontMatter","HTML"]` で、plan / ADR-003 の更新後期待値（FrontMatter のみ除去）と完全一致。
- `noteEditorModeChange.test.tsx`: モード切替は全て `tabByLabel("HTML")` / `tabByLabel("WYSIWYG")` で起こしており、`tabByLabel("FrontMatter")` は一度も使われていない。FrontMatter タブ除去の影響を受けないという plan の判断は正確。
- `FrontMatterEditor.test.tsx`: レイアウトクラス（mt-4/border 等）のアサート無し。plan の「見た目調整の影響を受けにくい」は正確。

## 受け入れ基準カバレッジ（AC-1〜AC-7 vs Issue 本文）

Issue 本文の受け入れ条件 7 項目はすべて AC-1〜AC-7 に 1:1 で対応しており、漏れなし。各 AC は検証可能な形（タブ表示有無・DOM 常設・トグル動作・シリアライズ不変・状態保持・品質ゲート・テスト）で記述され、実装ステップとの紐づけ（対応ステップ列）も整合している。

| Issue 受け入れ条件 | 対応 AC | 検証可能性 | ステップ紐づけ |
|---|---|---|---|
| 1. タブに FrontMatter が出ない | AC-1 | 可（TABS 内容 / タブ列挙） | 1,2 ✓ |
| 2. 本文モード問わず下部で追加/編集/削除 | AC-2 | 可（常時マウント） | 3 ✓ |
| 3. 構造⇔生の切替 | AC-3 | 可（frontMatterMode トグル） | 3 ✓ |
| 4. バリデーション/シリアライズ維持 | AC-4 | 可（reducer/JSON.stringify 不変） | 1,3 ✓ |
| 5. モード切替で編集内容が失われない | AC-5 | 可（状態保持） | 1,4 ✓ |
| 6. typecheck/lint/format パス | AC-6 | 可 | 全 ✓ |
| 7. テスト更新・パス | AC-7 | 可 | 5 ✓ |

## スコープ整合性

Issue の「スコープ外」3 項目（FrontMatter データ構造、構造/生トグル機能そのもの、`FrontMatterPanel`）はすべて plan の「含まれないもの」に明記され、加えて P12-editor.html モック追従とバックエンド全レイヤーを除外として記録。スコープ外作業の紛れ込みは無し。WYSIWYG 装飾消失ゲート（#696）温存の方針は、調査結果・実装ステップ3・リスク欄・ADR-001・テスト方針のすべてに反映されており、計画全体で一貫している。

---

#### 問題点（要修正）

問題点ゼロ

(main の実コードに対する行参照・テスト捕捉・AC マッピング・スコープ境界のいずれにも、要件カバレッジ／スコープ整合性の観点で修正を要する欠落・誤りは見つからなかった。)

#### 改善提案（検討推奨）

- **[S-001]** AC-5 の検証粒度を「本文モード切替 × FrontMatter 値保持」だけでなく「未保存状態での confirm を経た切替後も保持される」まで踏み込んで pin することを検討
  - 理由: Issue 本文の文言は「未保存の変更がある状態でモード切り替えしても」であり、`onModeChange` の confirm 分岐（dirty 時に `window.confirm` → discard で `abortInFlight`）を通過した後に FrontMatter 値が残ることが本来の核心。plan ステップ5(b)・テスト方針(b) は「FrontMatter 編集 → 本文モード切替で値が保持」までは明記しているが、「dirty で confirm を通した経路」での保持確認が明示されていない。常設化により値は保持されるはずだが、ここを 1 ケースで pin しておくと AC-5 の受け入れ条件文言に対する追従がより厳密になる。

- **[S-002]** AC-4 の「シリアライズ挙動が従来どおり」を回帰テストで pin することを検討
  - 理由: plan は AC-4 を「reducer の FrontMatter アクション群・`snapshotForSubmit`・`onSubmit` の `JSON.stringify` を変更しない」という非変更宣言で担保しているが、テスト方針の AC-4 は reducer アクションの動作確認に留まり、`onSubmit` の送出ペイロード（`frontMatterJson`）が常設化前後で不変であることを直接 pin する記述が薄い。常設化は送出経路（`snapshotForSubmit`）に手を入れないため挙動は変わらない見込みだが、Issue 受け入れ条件4が「保存時のシリアライズ挙動」を明示しているため、結合テストで保存ペイロードを 1 点確認しておくと安心。なお、これは plan が宣言する非変更方針の範囲内であり、新規スコープの追加ではない。

#### 良い点

- main（#715 取込済み）を正とする方針が、調査結果・実装ステップ・リスク・全 ADR で徹底されており、現在の作業ブランチ（issue/692、#715 未取込）との混同を明示的に警告している（リスク欄・ADR-003）。実装ブランチを main から切る前提が全体で一貫。
- `EditorMode` 型から `frontMatter` を消すことで型エラーとして参照箇所を網羅的に可視化する戦略（ステップ1・リスク欄）は、「make illegal states unrepresentable」に沿い、かつ修正漏れ防止として有効。波及箇所（TABS / `state.mode === "frontMatter"` 分岐 / 2 テストの `setMode mode:"frontMatter"`）を具体的に列挙済み。
- 削除してはいけないもの（`DirtyKey` の `"frontMatter"`、FrontMatter アクション群、`frontMatterMode`/`frontMatterRawJson`/`frontMatterJsonError`、WYSIWYG ゲート一式）を「削除対象外」として明示し、過剰削除のリスクを抑えている。EditorMode の `frontMatter`（削除）と DirtyKey の `"frontMatter"`（保持）の混同を明確に切り分けている点が特に良い。
- WYSIWYG 装飾消失ゲート温存が ADR-001 でゲートの動作原理（blur→`stateRef.current` 読取→`detectUnsupportedTags`）まで踏まえて論じられており、温存方針が単なる「触らない」宣言でなく根拠を伴っている。
- リスク欄の `saveDisabled`（`frontMatterJsonError !== null`）常時化の UX 指摘は、main の実コード（286 行）と一致し、機能的に正しい副作用認識。スコープ内で対処不要としつつ認識を残す判断も妥当。
- P12-editor.html モック乖離をスコープ外として記録し `spec-sync` に委ねる判断が、ドキュメント追従の取りこぼし防止として適切。
