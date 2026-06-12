# Review 004 — Test（ラウンド4: フルレビュー）

対象: PR #659（head `15dd94b8`）/ 計画: `.issue/649/plan.md`（ステップ8 = テスト更新、AC-11）/ 前回: `review-003-test.md`

総評: R3 指摘（W-001: testing.md の旧期待値）は正しく修正されている。`pnpm test:unit` 全件グリーン（225 files / 3577 tests）をローカル（PR head と同一コミット）で確認。R3→R4 のコード差分は testing.md の3箇所更新・フォールバック `h1` の `[overflow-wrap:anywhere]` 追加・ViewSwitcher パネルの `max-h-[min(60vh,400px)] overflow-y-auto` 追加のみで、既存の契約テスト（aria 契約 / ナビゲーション契約 / skeleton aria）に影響する変更はない。新規の Blocker / Warning はなし。

## R3 修正の検証

- **W-001（testing.md の旧 aria-label / disabled 期待値）→ 修正確認 OK**
  - `:73`: `aria-label="すべてのノート — ビューを切り替え"`（{可視見出し} — ビューを切り替え 形式、ADR-005 参照付き）— 実装 `viewSwitcherAriaLabel`（`` `${homeHeadingText(q, viewName)} — ビューを切り替え` ``）および `listSelectors.test.ts` の固定値と一致。
  - `:84`: 検索時「「test」の検索結果 — ビューを切り替え」（可視見出しが先頭）— 実装・単体テストと一致。
  - `:97`: 「`aria-disabled="true"`（native `disabled` ではない）+ `aria-describedby` で sr-only の理由提示、title 文言が従来どおり（ADR-010）」— `NoteListToolbar.test.tsx` の契約テスト（`disabled` 属性なし / `aria-disabled="true"` / `aria-describedby` の参照先テキスト「条件が設定されていません」/ クリック無視）と完全に整合。
  - 提案どおり3箇所すべて反映されており、手順書を信じて再実行しても誤判定は起きない。

### Test

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]**（新規・低優先）R3 で追加された ViewSwitcher パネルの `max-h-[min(60vh,400px)] overflow-y-auto` は、保存ビューが多数あるときの roving focus（矢印キー移動時に focus 対象がスクロール内に見えるか — happy-dom ではレイアウトがないため unit 化不可）を持つが、testing.md のエッジケースに「保存ビュー多数時の listbox スクロール + キーボード移動」の手順がない。再実行時の回帰面として1項目追記しておくと将来のスタイル変更（max-h 削除等）に気づける（場所: `app/components/note/list/ViewSwitcher.tsx` PANEL / `.issue/649/testing.md` エッジケース節）。
- **[N-002]**（新規・低優先）R3 で追加されたフォールバック `h1` の `[overflow-wrap:anywhere]`（`HomePage.tsx` fallbackHeading）は `SectionErrorBoundary.test.tsx` の文書順序契約の対象外（クラスのみの変更）で回帰検出手段がないが、視覚スタイルのためテスト不要と判断。testing.md エッジケース4（一覧クエリ失敗）の手順で長い検索語を併用すれば手動カバーできる。
- 持ち越し Notes（選択トグルの `aria-pressed="true"` 側、保存ボタンの q-only enabled 分岐、空白のみ q + viewName、ViewSwitcher の isPending 未使用、ADR-002 デデュープ契約の無テスト）は R1〜R3 で記録済みのため再指摘しない。いずれも状況に変化なし。

## 検証ログ

- `gh pr diff 659` で全差分確認（head `15dd94b8`、ローカル HEAD と一致）。
- `pnpm test:unit`: 225 files / 3577 tests passed（12.13s）。

## 判定

Test 観点: **承認**（Blocker 0 / Warning 0 / Notes 2（いずれも低優先・修正必須でない））。
