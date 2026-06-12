# PR #659 レビュー — アクセシビリティ観点 (review-001)

対象: feat(ui): #626 確定デザインの実装反映 — P10 ツールバー再設計
参照: `.issue/649/plan.md`（AC-3/4/5/7/8/9/11/12）、`.issue/649/adr.md` ADR-001〜005、`.issue/626/adr.md` ADR-001〜008

### A11y

#### Blockers

- **[B-001]** 検索中の見出しトリガーが WCAG 2.5.3 (Label in Name, Level A) に違反する
  / 場所: `app/components/note/list/listSelectors.ts:736-743`（`viewSwitcherAriaLabel`）、`app/components/note/list/ViewSwitcher.tsx:180`
  / 理由: `q` 有効時、可視テキストは「「memo」の検索結果」だが `aria-label` は「ビューを切り替え」となり、アクセシブルネームに可視テキストが一切含まれない。音声操作ユーザーが見えているテキストでボタンを呼べず、SR の見出しジャンプでも h1 が「ビューを切り替え」とだけ読まれ、検索結果ページであるという最重要情報が支援技術から消える。ADR-005 は「現在 {ビュー名} を付けると矛盾する」ことを理由に裸のアクションに落としたが、「ビュー名を落とす」と「可視テキストを落とす」は別問題であり、後者は Level A の適合性失敗。
  / 提案: 検索時のラベルを可視テキスト先頭含みで合成する。例: `「memo」の検索結果 — ビューを切り替え`（`` `${headingText} — ビューを切り替え` ``）。非検索時も同型（`すべてのノート — ビューを切り替え` 等）に揃えると h1 の読み上げ順（内容→操作）も自然になる（N-002 も同時解消）。テスト（`ViewSwitcher.test.tsx` / `listSelectors.test.ts` の ADR-005 ケース）と adr.md の追記が必要。

#### Warnings

- **[W-001]** ツールバー境界のエラー時にページから `<h1>` が恒久的に消える
  / 場所: `app/components/note/HomePage.tsx:62-71`（`SectionErrorBoundary section="ツールバー"` 内に `ViewSwitcher` = 唯一の h1）
  / 理由: 旧構造では h1 は同期レンダーで常在だった。本 PR で h1 が async 境界へ移動した結果、(a) ローディング中は `aria-hidden` スケルトンのみで h1 不在（過渡的・ADR-002 で許容済み）、(b) `loadSavedViewsByKind` / `loadOwnedNotes` が失敗すると境界のフォールバックに置き換わり **再試行まで h1 が存在しないページ** になる（WCAG 2.4.6/1.3.1 の後退、SR の見出しナビゲーション起点喪失）。plan-review S-002 が「トレードオフ明記」までで止まっており、エラー時の救済がない。
  / 提案: `SectionErrorBoundary` のフォールバック側に静的な h1（例: 「すべてのノート」固定文言、トリガー機能なし）を含める、またはツールバー境界のエラーフォールバックを「h1 + エラー表示」の構成にする。

- **[W-002]** `role="tablist"` / `role="tab"` 契約が ARIA Tabs パターンとして不完全なまま spec/テストに固定化されている
  / 場所: `app/components/note/list/DisplayModeSwitch.tsx:55-77`、`spec/design/pages/P30-user-public-top.html`（新コメントで契約を明文化）、`__tests__/DisplayModeSwitch.test.tsx`（契約ロックテスト追加）
  / 理由: APG の Tabs パターンは (1) tab 間の矢印キー移動（roving tabindex）、(2) 各 tab の `aria-controls` → `tabpanel`、(3) 非選択 tab の `tabindex="-1"` を要求する。現実装は 3 ボタンとも Tab 順に並び矢印キー非対応・tabpanel 不在。これは既存（PR 起因ではない）が、本 PR が P30 モックとユニットテストで「tablist/tab/aria-selected 契約維持」を確定表現として固定したため、不完全なパターンが規範化される。SR は「タブ 1/3」と告知するのに矢印キーが効かず、ユーザーの操作モデルと食い違う。
  / 提案: 本 PR の範囲では Issue 起票で可（#626 ADR-001 の適用範囲全体に関わるため）。修正方向は「`useRovingMenu` 相当の roving tabindex + ArrowLeft/Right を付ける」か、tabpanel が実体として存在しない以上 `radiogroup`/`radio`（`aria-checked`）への置き換えが意味的に正確。

- **[W-003]** disabled「ビューとして保存」の理由説明が `title` のみで支援技術・タッチに届かない
  / 場所: `app/components/note/list/NoteListToolbar.tsx`（`disabled={...}` + `title="条件が設定されていません"`）
  / 理由: `disabled` なネイティブボタンはフォーカス不能のため、キーボード/SR ユーザーは存在も理由も知覚できない。タッチ環境では `title` ツールチップ自体が表示されない。アイコンのみ化（可視ラベル削除）で手掛かりがさらに減った。既存挙動の踏襲ではあるが、本 PR がこの形をテストで固定している。
  / 提案: `disabled` → `aria-disabled="true"` + クリック無効化（フォーカス可能のまま）にし、`aria-describedby` か `aria-label` 内で理由を伝える。最低限でも Issue 化を推奨。

#### Notes

- **[N-001]** segmented ボタンのモバイル当たり判定は横 40px（36 + `-inset-x-0.5`×2）で「44×44px 相当」(AC-8) に対し横方向のみ未達。隣接干渉回避のための意図的トレードオフとして plan に明記済みであり、WCAG 2.5.8 (24px, AA) は満たすため許容。場所: `app/components/note/list/styles.ts:824`。
- **[N-002]** 非検索時の h1 アクセシブルネームが「ビューを切り替え: 現在 {ビュー名}」と操作文言先行になり、SR の見出し一覧でページ内容よりアクションが先に読まれる。2.5.3 は満たす（可視テキスト含有）が、B-001 の提案形（内容→操作）に揃えると解消する。
- **[N-003]** 良好な点（確認済み）: listbox パターンは正しい — トリガー `aria-haspopup="listbox"`/`aria-expanded`/`aria-controls`（`usePopover`）、パネル `role="listbox"` + `aria-label`、項目 `role="option"` + `aria-selected`、roving tabindex（`useRovingMenu` 流用、選択中項目へ初期フォーカス、Arrow/Home/End、ネイティブ button による Enter/Space 活性化）、Esc でクローズ + トリガーへフォーカス復帰、選択時は `closeAndRestoreFocus` → navigate の順でフォーカス復帰が保証される。menu/listbox/dialog の JSX 分岐を literal role で分けた判断も lint 互換として妥当。
- **[N-004]** 良好な点: スケルトンのアナウンス集約は計画どおり — `ToolbarSkeleton` は `aria-hidden` の純装飾、`role="status"` は FilterBar / NoteList の 2 箇所に維持され三重アナウンスなし。`NoteListSkeleton` の件数バー削除で二重表示も回避。アイコンのみ化した全コントロール（segmented・選択・保存・クリア×・見出しトリガー）に `focus-visible:outline-2 outline-accent` が明示されている（AC-9 充足）。`ink-tertiary`(#86868b) は surface(#f5f5f7) 上で約 3.3:1、白地で約 3.5:1 と非テキストコントラスト 3:1 を満たす。
