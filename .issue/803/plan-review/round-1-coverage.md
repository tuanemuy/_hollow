# Plan Review — Issue #803 round-1（視点: 要件カバレッジ・スコープ整合性）

レビュー対象: `.issue/803/plan.md` / `.issue/803/adr.md`
照合した実装（origin/main、PR #802 マージ済み commit 8d9e5a6e）:
`app/components/note/editor/TagsInput.tsx`, `app/components/note/editor/styles.ts`(`tagSuggestPanel`/`tagsRow`/`tagsField`),
`app/components/common/usePopover.ts`(`computeShiftY`/`computeShiftX`/`VIEWPORT_MARGIN`/`POPOVER_SHEET_BREAKPOINT`),
`app/components/note/editor/__tests__/TagsInput.test.tsx`, `app/components/common/__tests__/Popover.test.tsx`

> 注: 現在の作業ブランチ `issue/798/...` の `TagsInput.tsx` は combobox 化前の旧版だが、plan は明示的に origin/main を対象としており、origin/main には PR #802 の combobox 版が入っている。plan の調査記述（`panelOpen`/`tagSuggestPanel`/`tagSuggestModel.ts`/`activeIndex` 等）は origin/main の実体と一致しており、対象選定は正しい。

---

#### 問題点（要修正）

問題点ゼロ。

Issue #803 が挙げる2要件（(1) 縦 viewport クランプ、(2) 明示的外側クリッククローズ）はいずれも受け入れ基準（AC-1/AC-3、AC-2）に落ちており、各 AC は検証可能、AC↔ステップの紐づけも正しい。Issue 本文が明記する「横方向は実害小」を根拠にした横クランプのスコープ外化、Issue が「要検討」とした Popover 移行の再評価（ADR-001 で不採用結論）も、いずれも Issue の文言に整合している。スコープ外作業の混入も無い（domain/usecase/adapter 無変更、`tagSuggestModel.ts`/reducer/autosave 不可侵を明記）。

特に、Issue が改善方向性として挙げる「上方向反転（flip）」を shift クランプに置き換える判断は要件を満たすと評価できる。Issue の表現は「クランプ／上方向反転（上方向に開く等）」であり flip は手段の一例として併記されているにすぎず、優先度セクションの主目的は「画面下部での縦はみ出しの体験改善」=「パネルが viewport 内に収まり見える」こと。shift クランプ（`computeShiftY` 再利用）はこのゴールを達成する。アプリ全体が shift 方式で統一されている（`usePopover.clampToViewport`）点とも一貫し、flip 固有の複雑度（アンカー切替・activedescendant の `scrollIntoView` 基準再考）を避ける ADR-002 の判断は妥当。

---

#### 改善提案（検討推奨）

- **[S-001]** AC-1 / ADR-002 の shift トレードオフ（最下部フォーカス時にパネルが入力フィールドに被さる）を AC かテスト観点として明示し、「画面下部」シナリオで *visible だが入力が一部隠れる* 状態が受容範囲であることを確認しておくとよい。
  理由: Issue の主目的は「画面下部でフォーカスしたケース」の改善だが、まさにそのケースで shift は下に開いたパネルを上へ押し上げるため、結果として入力中の input/chips がパネルに被さる（ADR-002 が「候補が入力フィールドの一部に被さる可能性／visible は保たれる」と明記している通り）。flip ならフィールドを避けられる差分がここに集中する。AC-1 は「viewport 内に収まる」とだけ書いており delivered 内容に対して正直だが、この被さりを「バグ」として後段レビュー/手動テストで誤検知されないよう、AC かテスト方針に一行（被さりは許容・visible が合格条件）あると安全。要件未達ではなく、合格条件の明確化。

- **[S-002]** AC-5（クランプ計算ロジックの純粋関数単体テスト）は本 Issue の新規成果物ではなく、既存 `Popover.test.tsx` の `computeShiftY` テスト（`describe("computeShiftY")`、bottom はみ出し・top はみ出し・viewport より高い場合の4ケース）で既に充足済みの「制約」である点を AC 表に明記すると、AC とステップの対応がより明瞭になる。
  理由: AC-5 は対応ステップ 1（読むのみ）・5（math テストは追加しない）に紐づくが、いずれも新規 math テストを生まない。plan のテスト方針には「本 Issue では追加不要」と正しく書かれているものの、AC 表だけ見ると「AC-5 を満たす新テストはどれか」が一瞬曖昧。AC-5 を「既充足の前提制約」と位置づければ、TagsInput 側の新規テストは『配線が効いているか』（AC-1/2/3 の DOM 検証）に集中する意図が読み手に伝わる。

---

#### 良い点

- 受け入れ基準が Issue の改善方向性 1/2 に明確に紐づき、各 AC が検証可能な形で書かれている（縦クランプ: `Element.prototype.getBoundingClientRect` を spy で下端はみ出す rect に差し替え＋`window.innerHeight` 上書きで `transform: translateY(...)` 配線確認、外側クリック: `document.body` への `mousedown` dispatch で閉じる／コンテナ内は閉じない）。これは `Popover.test.tsx` 既存の clamp テスト手法（spy + innerHeight 上書き + `translate(...)` 完全一致）と同形で、再現性が高い。
- 主要な設計判断（flip→shift / 横クランプ・`max-sm` スコープ外 / `usePopover` 全面移行不採用）がいずれも Issue 本文と ADR を引用して正当化されている。とりわけ Issue が「要検討」とした『Popover 移行の再評価』要求に ADR-001 で `usePopover` の trigger(button)+panel モデルと ADR-003 の実フォーカス input 固定 combobox の契約衝突（`aria-expanded=panelOpen` 直結不可・Escape→button 復帰先 button が無い等）を具体列挙して応えており、再評価の質が高い。
- AC-3（動的高さ再クランプ）は Issue に明記されていないが、typing で候補件数＝パネル高さが変わる以上、縦クランプが正しく機能するために必須の補完であり、スコープ creep ではなく必要な追加。依存に `candidates.length`・`isNewDraft` を含める指示も height-affecting な入力を正しく網羅している（validation error は panel 外＝`tagsField` 下に出るため height 非影響、で依存に含めないのも正しい）。
- 非回帰（combobox a11y / IME ガード / ↑↓・Enter・`,`・Escape・Backspace / blur での valid draft コミット）を AC-4 として全ステップに紐づけ、ADR-003 の a11y 契約・コミット経路に一切触れない方針を明記。既存 `TagsInput.test.tsx` は32本の網羅的テストがあり、AC-4 の非回帰基準として十分機能する。
- outside-click を `tagsRow`（`relative` 済み・パネルの親）に `containerRef` を張って実装する設計は、パネルが `tagsRow` の子要素である実体と整合し、option クリック（`onMouseDown preventDefault`＋コンテナ内）が誤って閉じない挙動を正しく保証している。`panelOpen` 時のみ購読＋cleanup でリークも無い。
- blur コミットと outside `mousedown` の相互作用（mousedown→blur 順、`closePanel` は open のみ変更でコミット可否は不変）をリスクとして明示し、テストで固定する方針まで含めている。

---

### サマリー
- 問題点: 0 / 改善提案: 2
- `[S-001]` shift トレードオフ（最下部で入力にパネルが被さる）を AC/テスト観点に明示
- `[S-002]` AC-5 は既存 `computeShiftY` テストで既充足の制約である旨を AC 表に明記
