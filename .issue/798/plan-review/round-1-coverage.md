# Plan Review — Issue #798 (Round 1)

**観点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/798/plan.md`, `.issue/798/adr.md`
**レビュー日:** 2026-06-28

---

## 結論

Issue 本文の3つの中核要件はすべて受け入れ基準に落ちており、スコープ外作業の紛れ込みもない。**問題点（要修正）はゼロ**。検証可能性とトレーサビリティを高める改善提案を数件挙げる。

要件 → 基準のマッピング（確認結果）:

| Issue 要件 | 落ちている基準 | 判定 |
|---|---|---|
| 画像ボタンクリックで MediaUploader のファイル選択をトリガー（hidden click もしくは scroll+focus） | AC-2 + ADR-002 | カバー済み |
| 連携方法の設計（ref / callback / 共有ハンドラ、`{contentHtml, onInsert, disabled}` を壊さない） | AC-4 + 設計章 + ADR-001 | カバー済み |
| HTML / inline モードのツールバー有無に応じた挙動の整理 | AC-5 | カバー済み |
| スコープ外: アップロードフロー自体（presign→PUT→finalize）の変更 | スコープ章「含まれないもの」 | 逸脱なし |

コードとの突き合わせ（要件カバレッジに影響する事実確認）:
- `WysiwygEditor.tsx` 現状ツールバーに画像ボタンは**無い**（Bold/Italic/Strike/H2/H3/UL/OL/Quote/Code + Link のみ）。よって本Issueは「追加 + 配線」の両方を要する。AC-1 が「追加」を、AC-2 が「配線」を担っており整合。
- `MediaUploader.tsx` の props は実際に `{contentHtml, onInsert, disabled}`、状態機械は `idle | uploading | error`（`done` 無し）、入力は可視 `<input type="file">` で `disabled || uploading` 時に無効。AC-4/AC-6 の前提と一致。
- `lucide-react` は `Image as ImageIcon` を export 済み（確認）。エイリアス方針は成立。
- `NoteEditor.tsx` は3モードそれぞれに `MediaUploader` をマウントし、`tiptapEditorRef` を ref-as-prop で渡す既存パターンあり。設計章の「親が ref を持ち子へ配る」踏襲は事実に基づく。
- P12 モック（~1072-1074）はリンクボタン直後に「画像」ボタン。AC-1 の順序記述と一致。

---

#### 問題点（要修正）

問題点ゼロ。

Issue の中核要件はすべて検証可能な基準に落ち、スコープ外（アップロードフロー本体・MediaUploader UI 刷新・html/inline へのツールバー追加）は明示的に除外されている。

---

#### 改善提案（検討推奨）

- **[S-001]** AC-5（html/inline 不変）に「退行を機械的に検出する手段」が無い。
  - 理由: 現状 AC-5 の検証は「既存テスト緑」+「手動でボタンが無いこと」のみ。`inputRef` を WYSIWYG の `MediaUploader` にのみ渡す設計（step 2）が将来うっかり崩れて html/inline にも渡る／画像ボタンが他モードへ漏れる退行を自動では捕まえられない。NoteEditor レベルで「html/inline では画像ボタンが描画されない」あるいは「html/inline の MediaUploader は inputRef を受け取らない」を軽く固定する1テストを足すと、AC-5 が検証可能基準として閉じる。コスト最小なら step 4 の MediaUploader テストに「inputRef 省略時も従来どおり描画される」ケースを併記する形でも可。

- **[S-002]** AC-2 の文言「ファイル選択ダイアログが開く」と、実際の自動テストで検証する内容（`onRequestImage` 発火 + `inputRef.current` が `<input>` を指す）に粒度差がある。
  - 理由: happy-dom ではダイアログ起動そのものは検証不能で、テストは「配線」を proxy として固定する（plan も step 4 でそう書いている）。AC-2 に「（自動テストでは onRequestImage 発火と inputRef 配線で代替検証、ダイアログ起動は手動）」と一言添えると、基準と検証手段の対応が明示され、レビュー時の解釈ブレが消える。

- **[S-003]** 「連携方法の設計」要件に対し、設計判断を固定する基準（例: 新規 `useImperativeHandle`/`forwardRef` を導入しない＝既存 ref-as-prop に揃える）が AC 表に無い。
  - 理由: Issue は「連携方法を設計する」ことを明示要求しており、ADR-001 で (A) ref-as-prop を採用済み。これを AC（例 AC-8: 「連携は既存 editorRef と同型の ref-as-prop で実装し、コードベースに無い imperative handle / forwardRef を新規導入しない」）として1行立てると、設計要件が検証可能な受け入れ基準として表に乗り、レビュー/実装間の合意が明確になる。現状は設計章本文のみで基準化されていない。

- **[S-004]** AC-3/AC-6 のステップ紐づけがやや緩い。
  - 理由: AC-3（挿入フロー不変）は実際にはどのステップも `onMediaInsert`/`mediaInsert.ts` を触らないことで成立する＝「無改修であること」が本質。対応ステップ「1,2」は配線ステップであり挿入フローそのものではない。「対応ステップ: なし（無改修・既存テストで担保）」と書く方が意図に忠実。AC-6 も「アップロード中 no-op」部分は step 3 ではなく既存 MediaUploader の disabled 挙動（step 1 で ref 接続するのみ）に依存するため、対応欄に注記があると正確。

#### 観察（合意事項との整合・要対応ではない）

- Issue 本文の前提（「ツールバーの画像ボタンは存在するが配線されていない」「hidden file input」「状態機械 idle|uploading|error|done」「dropzone は DROPZONE 共有定数」）は、未マージの #795/PR #797 を前提とした記述で、本リポジトリの現状コードとは食い違う。plan は調査章でこの乖離を正しく検出し「現状コードを正とする」と明記して整合を取っている。Issue コメント欄は空のため追加の合意事項は無く、plan は Issue 本文の意図（ボタン → 既存アップローダ起動）を現状コードに正しく翻訳できている。要件解釈の矛盾なし。

---

#### 良い点

- **Issue 前提と現状コードの乖離を検出し明示的に解消している。** Issue 本文が #795/#797（未マージ）の世界を前提に「ボタンは存在する／hidden input／done 状態／dropzone」と書いているのに対し、plan は実コードを読んで「ボタンは無い→追加が必要」「可視 input を hidden 化しない」「done 状態は無い」とスコープを現実に合わせ直している。要件カバレッジの土台が正確。
- **スコープ境界が明快。** 「含まれないもの」でアップロードフロー本体・MediaUploader UI 刷新・html/inline ツールバー追加を3点とも除外。Issue のスコープ外（フロー変更）と完全一致し、creep が無い。
- **受け入れ基準が a11y/モバイル要件まで具体的（AC-1, AC-7）。** `aria-label`/`title`/`type="button"`/`TOUCH_TARGET_SQUARE`/`role="toolbar"`、トグルでないため `aria-pressed`/`data-primary` を付けない、まで検証可能形で明記。既存リンクボタン実装パターンとも一致。
- **連携の所在（オーケストレーター集約）と契約非破壊（直交プロップ `inputRef`）が ADR で根拠付き。** ADR-001/002 が代替案（imperative handle / scroll+focus）と現状制約（dropzone 未導入）を踏まえて判断しており、Issue の「連携方法を設計する」要求にきちんと応えている。
