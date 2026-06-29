# PR #809 レビュー round-2 — Issue #787（観点: Design System / Accessibility）

対象: `gh pr diff 809`（head: `issue/787/shrink-note-actions-mobile` / base: `main`）
計画: `.issue/787/plan.md` / ADR: `.issue/787/adr.md`
レビュー観点: (1) SSOT 整合・新規トークン非追加・値マッピング, (2) モック先行/デスクトップ非改変, (3) 44px タッチ床(ADR-006/#633), (4) `role="toolbar"`/`aria-label`/レール隔離, (5) `Icon.tsx` JSDoc カーブアウトと tokens.md §5.5 の整合（前ラウンド W-001 の解消確認）。
本レビューはゼロベースのフル再レビュー。

---

## 検証サマリー（AC トレース）

| AC | 内容 | 判定 | 根拠 |
|---|---|---|---|
| AC-1 | モバイルモック `.action-toolbar` 縮小 | OK | `mobile/P11-note-detail.html` L436-437: gap `--space-2→--space-1`、margin `--space-4 0 --space-6 → --space-3 0 --space-4`。icon-only ピル svg 4本（移動/URLコピー/エクスポート/その他）20→18。`overflow-x`/`scrollbar-width`/`flex-shrink`/`padding-bottom` 維持。公開ピル内 16px グリフは据え置き。 |
| AC-2 | 新規トークン非追加（追加なし自体が基準） | OK | `tokens.css` は diff に登場せず無変更。縮小値は全て既存段階に一致（後述）。SSOT 肥大化なし。 |
| AC-4 | 44px タッチ床維持 | OK | `styles.ts`/`pillBtn`/`pillBtnIcon`/`TOUCH_TARGET` 無変更。グリフ寸法のみ縮小、ボタン床不変。TC-3 で 44×44 実測 PASS。 |
| AC-5 | レール隔離 + `role="toolbar"`/`aria-label` 維持 | OK | `MENU_RAIL` の `max-sm:overflow-x-auto`/`flex-nowrap`/`[&>*]:shrink-0`/`scrollbarHidden` 維持（`max-sm:gap-1` 追加のみ）。`role="toolbar"`・各ピル `aria-label` 不変。TC-4 PASS。 |
| AC-6 | 実装とモック一致（3レバー限定） | OK | gap 4 / mt 12 / mb 16 / glyph 18 が実装・モックで一致。編集(Pencil) ロスター差は #787 以前からの既存乖離として正しく射程外扱い。 |

### 値マッピングの正確性（精査）

- `gap-1` = `--space-1` = **4px** ✓（`tokens.css` L81）
- `my-3` = `--space-3` = **12px** ✓（L83）
- `mb-4` = `--space-4` = **16px** ✓（L84）
- `max-sm:size-[var(--icon-md)]` = `--icon-md` = **18px** ✓（L114）
- 縦マージン: base `my-4 mb-6`（上16/下24）に対し `max-sm:my-3 max-sm:mb-4` が上→12/下→16 に上書き。`my`+`mb` の組合せは base 段でも同パターンが既に機能しており（`my-4 mb-6`）、Tailwind の生成順で `mb` が `my` の bottom を上書きする挙動が踏襲される。モック shorthand `var(--space-3) 0 var(--space-4)`（上12/左右0/下16）と一致 ✓。TC-2/TC-5 が mt12・mb16（mobile）/ mt16・mb24（desktop）を実測し裏取り済み。
- `MENU_RAIL` に `max-sm:gap-1` 追加。レール内ピル間隔 8→4px。隔離挙動（overflow/nowrap/shrink）は無傷 ✓。
- 公開ピルの `Globe`（`NoteActions.tsx` 既定 size=16）は icon-only ではなくラベル付きピル内グリフのため縮小対象外で据え置き。モックの公開ボタン 16px グリフも無変更で一致 ✓。

### `Icon.tsx` カーブアウトの妥当性

`Icon.tsx` L30-38 の JSDoc カーブアウトは過度な緩和ではなく適切に範囲限定されている。`className` は両分岐（label 有/無）で lucide コンポーネントへ確実に転送されており（L55/L65）、`max-sm:size-[var(--icon-md)]`（class 由来 width/height、specificity 0 の presentation attribute を確実に上書き）が機構として成立する。「`size` を消すな・無印 `w-*`/`h-*` 併用禁止・レスポンシブ縮小限定」の歯止めも明記。`size` = デスクトップ寸法 SSOT 原則は保持。

---

## Design System / Accessibility

### Blockers

- **[B-001]** なし。

3レバー（gap/縦マージン/アイコン密度）が全て既存トークン段階に逐語一致し、実装値とモック値が一致。新規トークン非追加は CLAUDE.md「Styling」の design-token SSOT・utility-first 規約と完全整合。44px タッチ床（ADR-006/#633）はボタン側に温存され、グリフ 20→18px の縮小は当たり判定に一切影響しない。`role="toolbar"`/`aria-label`/レール隔離も無傷。デスクトップモックは diff に含まれずモック先行原則を遵守。機能・a11y・SSOT 整合に致命的問題なし。

### Warnings

- **[W-001]** 前ラウンド W-001（`tokens.md` §5.5 と `Icon.tsx` JSDoc の利用ポリシー齟齬）は **PR #809 では未解消**。doc 追記が PR に含まれていない。
  - 場所: `spec/design/tokens.md` §5.5（PR #809 では L202-213 のまま、カーブアウト追記なし）/ `app/components/common/Icon.tsx:30-38`
  - 事実関係: (a) `gh pr diff 809` の変更ファイル一覧に `spec/design/tokens.md` が**含まれない**。(b) `git show origin/issue/787/shrink-note-actions-mobile:spec/design/tokens.md` の §5.5 は「通常サイズ（16/20/24）は…これらのトークンは参照しない。」で終わり、レスポンシブ縮小のカーブアウト段落が存在しない。(c) 現在のローカル作業ツリー（`issue/803` ブランチ）の `tokens.md` L215 にはカーブアウト文が存在するが、`git blame` 上 **"Not Committed Yet"**（2026-06-30、未コミットの作業ツリー変更）であり、PR #809 のブランチにも main にも入っていない。つまり追記は **別ブランチの未コミット編集として宙に浮いており、レビュー対象の PR には反映されていない**。
  - 影響: PR #809 を取り込んだ時点では、`Icon.tsx` JSDoc にはカーブアウトが入る一方 `tokens.md` §5.5 は「`Icon` ラッパを介さずトークン参照」「通常サイズはトークン参照しない」と書かれたままになり、前ラウンド W-001 が指摘した doc 間の利用ポリシー食い違いがそのまま残る。§5.5 を読んだ後続実装者が「ラッパに `--icon-*` を当てるのは禁止」と誤読するリスクが解消されない。値は変わらないため機能・a11y への影響はなく Warning 据え置き。
  - 提案: `tokens.md` §5.5 へのカーブアウト追記を **PR #809 のブランチにコミットして含める**こと（現状の未コミット文 "例外として、レスポンシブ縮小に限り `Icon` ラッパへ `max-sm:size-[var(--icon-*)]` を当てて glyph を縮小してよい。…詳細は `Icon.tsx` JSDoc / `.issue/787/adr.md` ADR-002。" を当該ブランチに移送すれば足りる）。なお当該文言自体は `Icon.tsx` JSDoc（「`size` prop はデスクトップ寸法の SSOT として据え置く／消さない・無印 `w-*`/`h-*` と併用しない」）と整合しており、コミット先を PR ブランチに正せば W-001 は解消する。

### Notes

- **[N-001]** モック先行原則を厳守。`spec/design/pages/mobile/P11-note-detail.html` のみ変更し、デスクトップモック `P11-note-detail.html` は diff に登場しない。縮小対象を icon-only ピル svg 4本（20→18）に精密限定し、公開ステータスピル内の 16px グリフを巻き込んでいない。
- **[N-002]** `Icon.tsx` JSDoc カーブアウト（L30-38）は乱用防止の歯止め（レスポンシブ縮小限定・`size` 据え置き・無印 `w-*`/`h-*` 併用禁止）と presentation-attribute 上書き機構の根拠まで残しており、共有コンポーネント契約変更として模範的。`className` が両分岐で確実に転送される実装とも整合。
- **[N-003]** グリフ 20→18px 縮小は 44px タッチ床の内側で完結し WCAG タッチターゲット下限を侵さない。TC-1〜TC-5 の手動テスト記録（gap/margin/glyph/床/role/aria/desktop 非回帰/公開ノート）が AC を網羅的に裏取りしており検証トレーサビリティが高い。`MENU` 共有による trashed 分岐への縦マージン波及も計画・テストで明示済み。
- **[N-004]** （本 PR 起因ではない既存の軽微不整合）`tokens.md` §5.5 見出しは「dense サブ 16px」と謳うが `--icon-md` は 18px で 16 超。W-001 の追記を PR に取り込む際、この見出し文言も併せて見直すと doc の一貫性が増す。スコープ外のため任意。
