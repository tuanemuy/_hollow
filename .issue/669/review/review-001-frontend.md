# PR #676 レビュー — Round 1 / Frontend・UI 観点

レビュー対象: PR #676（Issue #669: P12 デザインモック整合 + 編集中フォーカス喪失の修正）
照合資料: `.issue/669/plan.md` / `.issue/669/adr.md` / `spec/design/pages/P12-editor.html` / CLAUDE.md スタイル規約

確認したファイル: `app/components/note/editor/styles.ts`, `NoteEditor.tsx`, `DirectoryPicker.tsx`, `WysiwygEditor.tsx`, `InlineEditor.tsx`, `HtmlEditor.tsx`, `EditLockBanner.tsx`, `app/components/directory/DirectorySelectField.tsx`, `app/components/common/routerInvalidate.ts`（+ テスト2件）, `app/styles/tokens.css` / `index.css`

## AC 検証（UI 系 AC-1〜AC-6）

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 ツールバー | 満たす | `editorToolbar`（styles.ts）= `sticky top-[calc(var(--header-height)+var(--space-2))] z-20 mb-4 inline-flex items-center gap-[2px] rounded-pill border-hairline bg-bg p-1 shadow-xs` — モック `.toolbar` の sticky/top/z/display/gap/padding/背景/radius/shadow/margin-bottom と全項目一致。`--radius-pill`/`--shadow-xs` は bridge 済み（index.css:93,103）。header は `z-50` なので `z-20` の重なり順も正しい。`max-sm` 横スクロールレール（#522）も維持 |
| AC-2 タイトル | 満たす | `titleInput` に `py-1 mb-5` 追加 = モック `padding: 4px 0; margin-bottom: var(--space-5)`。`titleInput` の利用箇所は NoteEditor のみで波及なし |
| AC-3 右寄せ | 満たす | `editorActions` の `ml-auto` 既存どおり（変更なし、検証のみで正しい） |
| AC-4 ディレクトリ行 | 概ね満たす | `variant="row"` で fieldset 撤去・`mb-3`・ラベルはモック `.dir-label`（12px/uppercase/0.06em/ink-tertiary）一致。新規名入力は pill 形状（h-30px/rounded-pill/bg-surface/13px）。ただし select 部はモックの `.dir-pill` ではなく既存の検索 input + 可視ラベルのまま（→ W-001）。Ingestion 側は default `"fieldset"` で凍結 ✓ |
| AC-5 タグ判断 | 満たす | adr.md ADR-001 に判断記録。実装はシンプル入力踏襲 + `mb-5`（モック `.tags-row` の `--space-5`）のみ |
| AC-6 min-height 480px | 満たす | Wysiwyg `min-h-[480px]`（内側 ProseMirror 440px に整合）、Inline `min-h-[480px]`、HtmlEditor textarea `min-h-[480px]`（共通 `fieldTextarea` は不変） |

要素順序（title → dir → tags → toolbar → editor）の並べ替えもモックと一致。form の `gap-4` 撤去に伴う余白移譲（EditLockBanner `mb-4` / topbar `mb-4` / submit error `mt-4` / unsupported バナー `mb-3` / FrontMatterEditor 既存 `mt-4` / MediaUploader 既存 `mt-4`）は form 直下の全子要素を確認し、付け漏れなし。

スタイル規約との整合: utility-first 準拠（新規 CSS ファイル / `@apply` なし）、`data-*` は既存パターン（`data-acked={isAcked || undefined}` 等）のまま、EditLockBanner は denied 以外 `null` を返すので `mb-4` の幽霊余白も発生しない。

### Frontend

#### Blockers

なし

#### Warnings

- **[W-001]** row variant のディレクトリ行に可視ラベルが二重に出る / `app/components/note/editor/DirectoryPicker.tsx:177-181` + `app/components/directory/DirectorySelectField.tsx:202-204` / 行頭に uppercase の「ディレクトリ」span を置いた直後に、`DirectorySelectField` が自前の可視ラベル「既存ディレクトリ」（`fieldLabel`）+ 検索 input + 「選択中: …」行を積むため、モックの「ラベル + pill 1行」に対して row variant でもラベル2段 + 複数行の佇まいになる。新規名入力だけ pill 化されており、行内で見た目の重さが不揃い。ADR-002 は「ドロップダウン内装の完全再現はしない」と言うが、ラベルの二重表示は内装ではなく「行の佇まい」側の差分 / 提案: `DirectorySelectField` に `labelHidden`（ラベルを `sr-only` 化）等の opt-in を足し、row variant では「ディレクトリ」span を唯一の可視ラベルにする（a11y 構造は label 関連付けのまま維持できる）
  → 対応済み: `DirectorySelectField` に `labelHidden` prop を追加し、row variant では sr-only 化
- **[W-002]** row variant の pill input スタイルがコンポーネント内の長い裸文字列 / `app/components/note/editor/DirectoryPicker.tsx:166-169`（`"h-[30px] w-full rounded-pill border border-transparent bg-surface px-3 text-[13px] …"`）/ editor の P12 準拠スタイルは `app/components/note/editor/styles.ts` に hoist して JSDoc でモック対応（`.dir-pill` 相当）を記録するのがこのリポジトリの確立パターン（`editorToolbar` / `titleInput` と同列）。今後タグ行や dir トリガーを pill 化する際の再利用点にもなる / 提案: `styles.ts` に `dirRowPillInput`（仮）として移し、`.dir-pill` 由来であることを JSDoc に書く
  → 対応済み: `styles.ts` に `dirRowPillInput` として hoist し JSDoc でモック対応を記録

#### Notes

- **[N-001]** `HtmlEditor.tsx:39` は `fieldTextarea` の中身（`font-mono text-mono resize-y`）を直書き複製している（ADR-005 の判断どおり競合回避としては正しい）。将来 `fieldTextarea` のフォント/挙動が変わったとき editor 側が追従しない drift リスクがあるので、気になるなら common/styles に min-h を含まない `fieldTextareaBase` を切り出して両者が参照する形も検討余地あり。現状はインラインコメントで出自が説明されており許容
- **[N-002]** `DirectoryPicker.tsx:158` row variant は `items-start`（モック `.dir-row` は `align-items: center`）。select 部が複数行のため妥当な選択だが、W-001 を解消して行が1行に痩せたら `items-center` に戻すとモックの垂直リズムに一致する
- **[N-003]** `InlineEditor` の effect 分離（ADR-007）は frontend 視点でも妥当: `rebuildRef` 経由の呼び出しは mount effect 完了後（effect 宣言順）なので TDZ/null の懸念なし、cleanup での `lastEmittedHtmlRef = null` リセットで StrictMode 再マウントの空ホスト化も防げている。round-trip でノード同一性を pin するテスト（`inlineEditor.test.tsx`）も契約として適切
- **[N-004]** `noteEditorSeedOnce.test.tsx` は `root.render` の再 render で「同一インスタンスへの props 更新」を正しくシミュレートしており、テストの JSDoc が「生 invalidate の再マウント経路は守れない」と保証範囲を明示している点が良い（plan AC-9 の文言と一致）
- **[N-005]** `gap-[2px]` / `tracking-[0.06em]` 等の arbitrary value はモック側も literal（2px / 0.06em）でトークン化されていないため、トークン追加せず literal で書く判断は tokens.md の SSOT 方針と矛盾しない

## 結論

Blocker なし。AC-1〜AC-6 はモック実値との突き合わせで満たされており（AC-4 のみ「近づく」基準に対し ADR-002 の範囲内で達成）、スタイル規約（utility-first / styles.ts hoist / data-* 規約）への重大な違反もない。W-001（二重ラベル）と W-002（pill スタイルの hoist）は対応推奨だがマージブロックには当たらない。
