# ADR — Issue #460: §7.1 ボタン形態を規範から原則ベースへ見直す

## ADR-001: §7.1 の bare ADR 参照は「正しい出典(#292)への namespace 付きリンク」に直す

### Status
Proposed

### Context
`spec/design/index.md` §7.1 は、ボタン形態の例外を bare な「ADR-002」(L142, DisplayModeSwitch のタブ/トグル例外) と「ADR-005」(L146, admin `BTN_SM_CLASS h-7` 例外) で参照している。一方 `CLAUDE.md` の styling 節は ADR 番号を `.issue/70/adr.md`（ADR-002=`@apply` 不使用 / ADR-003=`data-*` 規約 / ADR-005=backdrop-filter）に紐付けて運用している。

調査の結果、§7.1 が指している決定の実体は `.issue/292/adr.md`（タイトル「ボタンの『テキストのみ／アイコンのみ／アイコン+ラベル』使い分けガイドライン」）にある:
- #292 ADR-002 = DisplayModeSwitch はテキストのみで維持し「タブ/セグメントは混在ルールの例外」と明記
- #292 ADR-003 = Dialog 閉じるボタンは `max-sm:min-*` でモバイル時 44px（タッチターゲットの文脈に直結）
- #292 ADR-005 = admin `BTN_SM_CLASS` (`h-7`) は §3 44px 要件の例外

選択肢:
- A. §7.1 の参照を壊れたものとみなし削除する
- B. `.issue/292/adr.md` 本文を §7.1 に合わせて改訂する
- C. bare 番号を、L179 の `[#221 ADR-003](../../.issue/221/adr.md)` と同じ「issue namespace + 相対リンク」形式へ直す

### Decision
**C を採用**。§7.1 が指す決定は #292 の ADR-002/003/005 と内容的に一致しており、参照自体は正しい。問題は同一ファイル内で ADR を引くときに issue namespace を省いたことで、CLAUDE.md が同番号で紐付ける #70 の ADR（`@apply` / backdrop-filter）と誤読される運用リスクだけ。最小修正で誤読源を解消するため、`[#292 ADR-002](../../.issue/292/adr.md)` 形式へ直す。ADR の新規起票・削除・本文変更はしない。`.issue/70/adr.md` と CLAUDE.md styling 節（#70 anchor）にも手を入れない。

### Consequences
- 良い点: 読者が ADR 番号を #70 のものと取り違えなくなる。本文内の ADR 引用作法（#221 ADR-003 の前例）に統一される。最小差分。
- トレードオフ: `.issue/70` と `.issue/292` が同じ ADR-002/005 番号を別内容で持つ二重運用は残る。namespace 明示で実害は消えるが、番号の global 一意化はしない（スコープ外）。

---

## ADR-002: a11y タップ領域は「AA(24×24) を床・AAA(44×44) を目標」の二段で明文化する

### Status
Proposed

### Context
現状 §3 L56 / §7.1 L139 はタップ領域 44×44px を一律 MUST として適用しており、ボタン単体への硬直適用がデザイン崩れの一因になっている（Issue #460 要件2）。一方で a11y を完全に「文脈判断任せ」にすると WCAG 準拠が緩むリスクがある、という留意点が Issue 本文で明示されている。

WCAG の該当成功基準:
- 2.5.5 Target Size (Enhanced) **AAA** = 44×44px
- 2.5.8 Target Size (Minimum) **AA** = 24×24px

つまり現行の 44×44 は AAA 相当の目標値であり、AA の最低ラインは 24×24。プロジェクトには既に `spec/design/review/004.md` L259-264 で `(pointer: coarse)` を用いた文脈別整理の前例がある。

### Decision
44×44 を一律 MUST にする代わりに、**24×24(AA 最低)を譲れない床、44×44(AAA)を本プロジェクトの既定目標**とする二段で書く。適用は文脈で判断する:
- タッチ主体（モバイル / `pointer: coarse`）では 44 を確保する
- デスクトップ専用でマウス精度が前提の密度優先 UI（admin 等）は 24 を床に密度を取る判断を許す

意図（「タッチで押し間違えない」）と床(24)は明文化し、判断余地は AA(24) と AAA(44) の間にのみ置く。AA 未満は許さない。`aria-label` 等のスクリーンリーダー契約は本 ADR の対象外で、§8 と一体のまま緩めない。

### Consequences
- 良い点: WCAG AA 準拠を保ったまま、文脈に合わない 44 の硬直適用を解消できる。既存実装が原則の妥当な適用例として説明できる: base `pillBtn` の `max-sm:min-h-[44px]`（タッチ床 44 / デスクトップ自由）は新原則そのもの、admin の `pillBtnSm`（`data-[sm]:h-7`=28px、床を `max-sm:min-h-0` で解除）は 24 床を満たすデスクトップ密度優先の例、`Dialog` の `dialogCloseButton`（デスクトップ 32px / `max-sm:min-44`=タッチ 44）は文脈判断の例。なお §7.1 に書く実装名は現存する `pillBtnSm` を使い、廃止済みの `BTN_SM_CLASS` は書かない（#292 ADR-005 本文の旧名改訂は #460 スコープ外）。
- トレードオフ: 「床と目標の間で判断」という幅が生まれるため、レビュー時に「この文脈で目標(44)未達は妥当か」を都度判断する必要がある。条文一発判定より思考コストは上がるが、それが Issue の狙い（規範→判断）。

---
