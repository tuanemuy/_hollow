# PR #676 Review Round 3 — Frontend / UI

ゼロベースフルレビュー。`gh pr diff 676` の app/ 配下全差分を plan.md AC-1〜6・`spec/design/pages/P12-editor.html`・CLAUDE.md スタイル規約と照合した。

### Frontend

#### Blockers

なし

#### Warnings

なし

#### Notes

- **N-001: `noteEditorSeedOnce.test.tsx` のファイル JSDoc が TC-009 実測補正前の文言のまま**
  `app/components/note/editor/__tests__/noteEditorSeedOnce.test.tsx:14-16` — 「the raw `router.invalidate()` path where the RSC tree swap remounts the editor」と断定形のまま。Round 2 N-001 の修正対象だった `routerInvalidate.ts` 側の JSDoc は TC-009 の補正（props 更新で済み編集は維持された）を正しく織り込んで弱められており **修正は適切**だが、テスト側の同趣旨文言には反映されていない。ADR-003 への参照があり読者は補正に辿り着けるため Note 止まり。次回コミット時に「may remount」程度に弱めると一貫する。

- **N-002: モック照合の確認結果（指摘なし、記録のみ）**
  - AC-1 `editorToolbar`（styles.ts）: `sticky top-[calc(var(--header-height)+var(--space-2))] z-20 mb-4 inline-flex items-center gap-[2px] p-1 rounded-pill bg-bg shadow-xs border-hairline` — モック `.toolbar` の全プロパティと一致。`max-sm` の横スクロールレール（#522）も `self-stretch` 切替で維持（ADR-004 どおり）。`--radius-pill` / `--shadow-xs` / `--spacing-2` は `@theme inline` で bridged 済みを確認。
  - AC-2 `titleInput`: `py-1`（4px）+ `mb-5`（20px）= モック `.title-input` の `padding: 4px 0; margin-bottom: var(--space-5)` と一致。
  - AC-3 `editorActions` の `ml-auto` 維持を確認。
  - AC-4 `DirectoryPicker` row variant: `mb-3` + uppercase 小ラベル + `dirRowPillInput`（h-30px / pill / surface→focus で bg-bg + accent border）はモック `.dir-row` / `.dir-label` / `.dir-pill` の佇まいに一致。fieldset variant（Ingestion 側）は挙動・見た目とも不変（JSX 抽出のリファクタのみ）。
  - AC-5 タグ行: シンプル入力踏襲 + `mb-5` のみ（ADR-001 どおり、「見せかけチップ」を作らなかった判断は妥当）。
  - AC-6 min-height 480px: WYSIWYG（`EditorContent` 480 / ProseMirror 440）・inline（host 480）・HTML（textarea 480、`fieldTextarea` 参照をやめ utility 直書き = ADR-005、共有定数 `font-mono text-mono resize-y` と同値を確認）の3モードとも対応。

- **N-003: a11y 配慮の確認（指摘なし）**
  row variant の可視ラベル「ディレクトリ」は装飾 `span` だが、`DirectorySelectField` の `labelHidden`（sr-only、`htmlFor` 関連付け維持）と新規名入力の sr-only `<label>` により各コントロールのアクセシブルネームは保たれている。二重ラベル回避（Round 1 W-001 対応）の実装として適切。

- **N-004: 余白戦略（ADR-006）の整合確認（指摘なし）**
  form の `gap-4` 撤去に伴う `mb-*`/`mt-*` の移譲（EditLockBanner `mb-4`・topbar `mb-4`・unsupported バナー `mb-3`・submitError `mt-4`・各エディター wrapper の `mt-4` 撤去）は漏れなく、間隔の SSOT が「各行の margin」に統一されている。`data-*` / utility-first / styles.ts hoist の CLAUDE.md 規約にも準拠。

- **N-005: テスト実行確認**
  `noteEditorSeedOnce.test.tsx` / `inlineEditor.test.tsx` / `routerInvalidate.test.ts` の 46 件すべて green をローカルで確認。InlineEditor の effect 分離（ADR-007: mount-once + value リシンク）は self-emit round-trip で DOM 同一性が保たれることがテストで pin されており、TC-007 の再検証 PASS とも整合する。
