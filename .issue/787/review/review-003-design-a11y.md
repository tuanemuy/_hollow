# PR #809 レビュー round-3 — Issue #787（観点: Design System / Accessibility）

対象: `gh pr diff 809`
計画: `.issue/787/plan.md` / ADR: `.issue/787/adr.md`
レビュー観点: (1) SSOT 整合・新規トークン非追加・値マッピング, (2) モック先行/デスクトップ非改変, (3) 44px タッチ床(ADR-006/#633), (4) `role="toolbar"`/`aria-label`/レール隔離, (5) `Icon.tsx` JSDoc カーブアウトと `tokens.md` §5.5 の整合（前ラウンド W-001 の解消確認）。
本レビューはゼロベースのフル再レビュー。

---

## 検証サマリー（AC トレース）

| AC | 内容 | 判定 | 根拠 |
|---|---|---|---|
| AC-1 | モバイルモック `.action-toolbar` 縮小 | OK | `mobile/P11-note-detail.html` L436-437: gap `--space-2→--space-1`、margin `--space-4 0 --space-6 → --space-3 0 --space-4`。icon-only ピル svg 4本（移動/URLコピー/エクスポート/その他）20→18。`overflow-x`/`scrollbar-width`/`flex-shrink`/`padding-bottom` 維持。公開ピル内 16px グリフは据え置き。 |
| AC-2 | 新規トークン非追加（追加なし自体が基準） | OK | `tokens.css` は diff に登場せず無変更。`tokens.md` の変更は §5.5 へのカーブアウト**文**追記のみで、トークン行（値）の追加は無い。縮小値は全て既存段階に一致。SSOT 肥大化なし。 |
| AC-4 | 44px タッチ床維持 | OK | `styles.ts`/`pillBtn`/`pillBtnIcon`/`TOUCH_TARGET` 無変更。グリフ寸法のみ縮小、ボタン床不変。TC-3 で 44×44 実測 PASS。 |
| AC-5 | レール隔離 + `role="toolbar"`/`aria-label` 維持 | OK | `MENU_RAIL` の `max-sm:overflow-x-auto`/`flex-nowrap`/`[&>*]:shrink-0`/`scrollbarHidden` 維持（`max-sm:gap-1` 追加のみ）。`role="toolbar"`・各ピル `aria-label` 不変。TC-4 PASS。 |
| AC-6 | 実装とモック一致（3レバー限定） | OK | gap 4 / mt 12 / mb 16 / glyph 18 が実装・モックで一致。編集(Pencil) ロスター差は #787 以前からの既存乖離として正しく射程外扱い。 |

### 値マッピングの正確性（精査）

- `gap-1` = `--space-1` = **4px** ✓（`tokens.css` L81 で実測）
- `my-3` = `--space-3` = **12px** ✓（L83 で実測）
- `mb-4` = `--space-4` = **16px** ✓（L84 で実測）
- `max-sm:size-[var(--icon-md)]` = `--icon-md` = **18px** ✓（L114 で実測）
- 縦マージン: base `my-4 mb-6`（上16/下24）に対し `max-sm:my-3 max-sm:mb-4` が上→12/下→16 に上書き。Tailwind の `max-*` バリアントは base の後に emit され同 specificity 後勝ちで確定。モック shorthand `var(--space-3) 0 var(--space-4)`（上12/左右0/下16）と一致 ✓。
- `MENU_RAIL` に `max-sm:gap-1` 追加。レール内ピル間隔 8→4px。隔離挙動（overflow/nowrap/shrink）は無傷 ✓。
- 公開ピルの `Globe`（既定 size=16）はラベル付きピル内グリフのため縮小対象外で据え置き。モックの公開ボタン 16px グリフも無変更で一致 ✓。

### 前ラウンド W-001 の解消確認（今ラウンドの主眼）

- 前ラウンド（round-2）W-001 は「`tokens.md` §5.5 へのカーブアウト追記が未コミットで PR #809 に含まれていない」という指摘だった。
- 今ラウンドでは `gh pr diff 809` の変更ファイルに `spec/design/tokens.md` が**含まれている**（diff: §5.5 L213 直後にカーブアウト1段落を追加）。**W-001 は解消した。**
- 追記文言と `Icon.tsx` JSDoc の整合も確認（逐語照合）:
  - tokens.md L215「レスポンシブ縮小に限り `Icon` ラッパへ `max-sm:size-[var(--icon-*)]` を当てて glyph を縮小してよい」 ↔ Icon.tsx「CARVE-OUT (responsive shrink only): a `max-sm:size-[var(--icon-*)]` override class is permitted」 — 一致。
  - 「`size` prop はデスクトップ寸法の SSOT として据え置く（消さない）」 ↔ 「the `size` prop stays the desktop dimension … keep `size` set (do not drop it)」 — 一致。
  - 「無印 `w-*`/`h-*` と併用しない」 ↔ 「do not combine with bare `w-*` / `h-*`」 — 一致。
  - 両者とも `ADR-002` へポインタを貼る — 一致。
  - 矛盾・齟齬は無い。tokens.md は機構（presentation attribute / specificity 0）の詳細を省く分だけ簡潔だが、利用規約の内容は完全に整合している。
- 配置も適切: §5.5 は「これらのトークンは `Icon` ラッパを**介さず**参照する」「通常サイズ（16/20/24）はトークンを参照しない」と述べた直後に「例外として、レスポンシブ縮小に限りラッパへ当ててよい」と続き、前ラウンドが懸念した「ラッパに `--icon-*` を当てるのは禁止」という誤読リスクを正しく打ち消している。

---

## Design System / Accessibility

### Blockers

なし。

3レバー（gap/縦マージン/アイコン密度）が全て既存トークン段階に逐語一致し（`tokens.css` 実測で裏取り）、実装値とモック値が一致。新規トークン非追加は CLAUDE.md「Styling」の design-token SSOT・utility-first 規約と完全整合。44px タッチ床（ADR-006/#633）はボタン側 `pillBtn`/`pillBtnIcon`/`TOUCH_TARGET` に温存され、グリフ 20→18px の縮小は当たり判定に一切影響しない。`role="toolbar"`/`aria-label`/レール隔離も無傷。デスクトップモックは diff に含まれずモック先行原則を遵守。前ラウンド W-001（tokens.md §5.5 カーブアウト未反映）は今ラウンドで PR に含まれ解消し、追記文言は `Icon.tsx` JSDoc と整合している。機能・a11y・SSOT 整合に致命的問題なし。

### Warnings

なし。前ラウンドの唯一の Warning（W-001）は本ラウンドで解消した。新たな Warning も検出されない。

### Notes

- **[N-001]** （本 PR 起因ではない既存の軽微不整合 / 任意・スコープ外）`tokens.md` §5.5 の見出し「アイコン寸法（dense サブ 16px）」および本文 L204「これより小さい高密度 UI」は `--icon-md`(18px) を含む 4 トークンを「16px より小さい」と記述するが、`--icon-md` は 18px で 16 超。これは #787 以前からある doc 上の文言不整合で、本 PR の変更（カーブアウト追記）が新たに生んだものではない。ただし本 PR が §5.5 を編集対象に含めたため、ついでに見出し/本文の「サブ 16px」表現を「dense / 小グリフ」等へ緩めると doc の一貫性が増す。#787 のスコープ（ツールバー縮小）外であり必須ではない。
- **[N-002]** `Icon.tsx` JSDoc カーブアウト（L30-38）は過度な緩和になっておらず妥当。「レスポンシブ縮小限定」「`size` 据え置き（消すな）」「無印 `w-*`/`h-*` 併用禁止」を明示し、presentation attribute（specificity 0）を class が確実に上書きする機構まで根拠を残している。共有コンポーネントの契約変更として乱用防止の歯止めが効き、「`size` = デフォルト/デスクトップ寸法 SSOT」原則も保持されている。tokens.md §5.5 とも双方向に整合。
- **[N-003]** モック先行原則を厳守。`spec/design/pages/mobile/P11-note-detail.html` のみ変更し、デスクトップモック `P11-note-detail.html` は diff に登場しない。縮小対象を icon-only ピル svg 4本（20→18）に精密限定し、公開ステータスピル内の 16px グリフを巻き込んでいない。
- **[N-004]** グリフ 20→18px の縮小は 44px タッチ床の内側で完結し WCAG タッチターゲット下限を侵さない。視覚密度のみの調整で a11y 後退なし。TC-1〜TC-5 の手動テスト記録（gap/margin/glyph/床/role/aria/desktop 非回帰/公開ノート）が AC を網羅的に裏取りしており検証トレーサビリティが高い。`MENU` 共有による trashed 分岐への縦マージン波及も計画・テストで明示済み。
