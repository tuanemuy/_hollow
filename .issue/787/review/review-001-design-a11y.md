# PR #809 レビュー — Issue #787（観点: Design System / Accessibility）

対象: `gh pr diff 809`
計画: `.issue/787/plan.md` / ADR: `.issue/787/adr.md`
レビュー観点: (1) 新規トークン非追加と SSOT 規約の整合・値マッピング正確性, (2) モバイルモック縮小値の実装一致・モック先行/デスクトップ非改変, (3) 44px タッチ床(ADR-006/#633), (4) `role="toolbar"`/`aria-label`, (5) `Icon.tsx` JSDoc カーブアウトの妥当性。

---

## 検証サマリー（AC トレース）

| AC | 内容 | 判定 | 根拠 |
|---|---|---|---|
| AC-1 | モバイルモック `.action-toolbar` 縮小 | OK | `mobile/P11-note-detail.html` L436-437 で gap `--space-2→--space-1`、margin `--space-4 0 --space-6 → --space-3 0 --space-4`。icon-only ピル svg 4本 20→18。`overflow-x/scrollbar-width/flex-shrink` 維持。 |
| AC-2 | 新規トークン非追加（追加なし自体が基準） | OK | `tokens.css`/`tokens.md` に変更なし（diff に登場せず）。縮小値は全て既存段階に一致。 |
| AC-4 | 44px タッチ床維持 | OK | `styles.ts`/`pillBtn`/`TOUCH_TARGET` 無変更。グリフ寸法のみ縮小、ボタン床は不変。TC-3 で 44×44 実測 PASS。 |
| AC-5 | レール隔離 + `role="toolbar"`/`aria-label` 維持 | OK | `NoteActions.tsx` L186 `role="toolbar" aria-label`、`MENU_RAIL` の `max-sm:overflow-x-auto` 等は維持。各ピルの `aria-label` 不変。 |
| AC-6 | 実装とモック一致（3レバー限定） | OK | gap 4 / mt 12 / mb 16 / glyph 18 が実装・モックで一致。編集(Pencil) ロスター差は既存乖離として正しく対象外扱い。 |

### 値マッピングの正確性（精査）

- `gap-1` = `--space-1` = **4px** ✓（`tokens.css` L81）
- `my-3` = `--space-3` = **12px** ✓（L83）
- `mb-4` = `--space-4` = **16px** ✓（L84）
- `max-sm:size-[var(--icon-md)]` = `--icon-md` = **18px** ✓（L114）
- `my-4 mb-6` の base（上16/下24px）に対し `max-sm:my-3 max-sm:mb-4` が上→12/下→16 に上書き。Tailwind variant 後勝ちで確定。モック shorthand `var(--space-3) 0 var(--space-4)`（上12/左右0/下16）と一致 ✓
- 公開ピルの `Globe`（`NoteActions.tsx` L215, 既定 size=16）は縮小対象外で据え置き。モックの 公開ボタン svg(16) も無変更 — 一致 ✓
- icon-only グリフ縮小は実装側 5 個（編集/移動/URLコピー/エクスポート/その他）、モック側 4 個（編集なし）。編集の不在は #787 以前からの既存ロスター差で AC-6 射程外。整合的。

---

## Design System / Accessibility

### Blockers

なし。

3レバー（gap / 縦マージン / アイコン密度）すべてが既存トークン段階にちょうど嵌まり、実装値とモック値が逐語一致している。新規トークンを足さない判断は CLAUDE.md「Styling」の design-token SSOT・utility-first 規約と完全に整合。44px タッチ床（ADR-006/#633）はボタン側 `pillBtn`/`pillBtnIcon`/`TOUCH_TARGET` に温存され、グリフ縮小は当たり判定に一切影響しない。`role="toolbar"`/`aria-label`/レール隔離も無傷。デスクトップモックは diff に含まれずモック先行原則を遵守している。

### Warnings

- **[W-001]** `--icon-md`（18px）を `Icon` ラッパに `max-sm:size-[var(--icon-*)]` で適用する新しい利用パターンが、トークン doc `tokens.md` §5.5 の記載と齟齬を残している
  - 場所: `spec/design/tokens.md:202-213`（§5.5）/ `app/components/common/Icon.tsx:30-38`
  - 理由: §5.5 は `--icon-*` トークンを「16px より小さい高密度 UI のみ」「`Icon` ラッパを**介さず**トークン参照で寸法を揃える」用途と定義し、さらに「通常サイズ（16/20/24）は `Icon` ラッパの `size` prop を使い、これらのトークンは参照しない」と明記している。本 PR はこの方針に対し (a) `Icon` ラッパ**経由**で `--icon-md` を参照し、(b) sub-16 ではない 18px を使う、という二点で踏み込んでいる。カーブアウトは `Icon.tsx` の JSDoc には追記されたが、トークンの利用規約の SSOT である §5.5 側は無更新で、ドキュメント間で利用ポリシーが食い違って読める。ADR-002 でも「前例より一段踏み込んだ利用」と自認している通り、ここはトークン doc にも反映すべき新パターン。
  - 提案: `tokens.md` §5.5 に一文追記する。例:「例外として、`Icon` ラッパ経由でも `max-sm:size-[var(--icon-*)]` によるレスポンシブ縮小に限り参照を許可する（デスクトップ寸法は `size` prop が SSOT。詳細は `Icon.tsx` JSDoc / Issue #787）」。`tokens.css`⇄`tokens.md` のミラーは値の変更が無いため不要だが、利用規約の記述だけ整合させる。これにより「§5.5 を読んだ後続実装者が『ラッパに `--icon-*` を当てるのは禁止』と誤読する」リスクを潰せる。

### Notes

- **[N-001]** `Icon.tsx` の JSDoc カーブアウト（L30-38）は過度な緩和になっておらず妥当。「`max-sm:size-[var(--icon-*)]` のレスポンシブ縮小**限定**」「`size` は据え置き（消すな）」「無印 `w-*`/`h-*` との併用禁止」を明示し、presentation attribute（specificity 0）を class が確実に上書きする機構まで根拠を残している。共有コンポーネントの契約変更として乱用防止の歯止めが効いており、「`size` = デフォルト/デスクトップ寸法 SSOT」原則も保持されている。
- **[N-002]** モック先行原則が正しく守られている。`spec/design/pages/mobile/P11-note-detail.html` のみ変更し、デスクトップモック `P11-note-detail.html` は diff に登場しない。モック側で縮小対象を icon-only ピル 4本の svg(20→18) に限定し、公開ステータスピル内の 16px グリフを巻き込んでいない精密さも良い。
- **[N-003]** アイコングリフ 20→18px の縮小は 44px タッチ床の内側で完結し、WCAG タッチターゲット下限を侵さない。視覚密度のみの調整で a11y 後退なし。TC-1〜TC-5 の手動テスト記録（gap/margin/glyph/床/role/aria/desktop 非回帰）が AC を網羅的に裏取りしており、検証トレーサビリティが高い。
- **[N-004]** （参考・本 PR 起因ではない）`tokens.md` §5.5 のセクション見出しは「dense sub-16px line-art glyphs」と謳うが `--icon-md` は 18px で 16 超。W-001 の追記を行う際、この見出し文言も合わせて見直すと doc の一貫性が増す（既存の軽微な不整合）。
