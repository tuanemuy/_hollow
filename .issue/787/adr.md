# ADR — Issue #787: shrink note-detail action toolbar on mobile

## ADR-001: gap/margin/icon の縮小に新規トークンを追加せず既存トークンを再利用する

### Status
Proposed

### Context
モバイルでツールバーを縮小するには gap（8px）・縦マージン（上16/下24px）・アイコングリフ（20px）を下げる必要がある。Issue は「必要ならトークンを `tokens.css` に追加し `tokens.md` にミラー」と許容しているため、ツールバー専用トークン（例 `--toolbar-gap-mobile` 等）を新設する選択肢もある。

選択肢:
- 案A: 既存の `--space-*`（1=4 / 3=12 / 4=16px）と `--icon-md`(18px) を再利用する。
- 案B: ツールバー専用の新規トークン（gap / margin / icon の mobile 値）を `tokens.css` に追加し `tokens.md` にミラーする。

### Decision
案A を採用。縮小後の値（gap 4px / margin 上12・下16px / icon 18px）はすべて既存トークンの段階（`--space-1/3/4`, `--icon-md`）にちょうど一致する。新規トークンは二重管理（`tokens.css` ⇄ `tokens.md` のミラー、`@theme inline` ブリッジ）を増やすだけで意味的価値が無い。CLAUDE.md の「デザイントークンは SSOT、追加は必要時のみ」「utility-first」に沿い、既存トークンを `--space-*`→Tailwind `gap-1`/`my-3`/`mb-4`、`--icon-md`→`size-[var(--icon-md)]` として参照する。

### Consequences
- 良い点: トークン SSOT が肥大化しない。ミラー漏れ・ブリッジ漏れのリスクが無い。実装が既存ユーティリティのみで完結する。
- トレードオフ: 「ツールバーの mobile 寸法」という意味づけがトークン名に現れない（汎用 space/icon 段階の組み合わせとして表現される）。ただし縮小値はモック（SSOT）と `NoteActions.tsx` のローカル定数コメントで追跡でき、専用トークン化の便益は薄い。
- 将来同種の mobile 縮小が他ツールバーにも必要になり値を共有したくなった場合は、その時点で案B（専用トークン）へ昇格すればよい（YAGNI）。

---

## ADR-002: アイコングリフのモバイル縮小を `Icon` の size プロップ据え置き + `max-sm:` クラス上書きで実現する

### Status
Proposed

### Context
icon-only ピルのグリフをモバイルで 20→18px に縮小したい。しかし `Icon`（`app/components/common/Icon.tsx`）の `size` プロップは静的な型 `16 | 20 | 24` で、レスポンシブにできない。さらに JSDoc は「`w-*`/`h-*` を className で渡すな（`size` が寸法の SSOT）」と明記しており、素直なクラス上書きは契約違反になる。一方タッチ床（44px）はボタン側にあるためグリフ縮小は当たり判定に影響しない（視覚密度のみ）。

選択肢:
- 案A: グリフは縮小せず（20px 据え置き）、gap と縦マージンのみ縮小する。`Icon` 契約に一切触れない。
- 案B: 該当アイコンを `Icon` ラッパ非経由にし、raw lucide + `size-[var(--icon-lg)] max-sm:size-[var(--icon-md)]`（tokens.md が dense グリフ向けに案内する `size-[var(--icon-*)]` 方式）で描画する。新規 `--icon-lg:20px` トークンの追加を伴う。
- 案C: `Icon` ラッパを維持しつつ `className="max-sm:size-[var(--icon-md)]"` を渡す。`size={20}` はデスクトップ寸法の SSOT として残す。lucide の width/height は presentation attribute（specificity 0）なので、`max-sm` のクラス由来 width/height が確定的に勝つ。`Icon` の JSDoc に「レスポンシブ縮小に限り size 上書きクラスを許可」とカーブアウトを追記する。

### Decision
案C を採用。Issue がアイコン密度の縮小を明示的に挙げており（案A は density ゴールを部分的にしか満たさない）、かつ案B はラッパの a11y / `strokeWidth=1.5` 集約を捨てて描画を二重化し、さらに新規トークン（ADR-001 の方針に反する）を要するため不利。案C は `Icon` の a11y / stroke 契約と「`size` = デフォルト寸法 SSOT」原則を保ったまま、レスポンシブ縮小という限定された新ニーズだけを契約に明文化する。

### Consequences
- 良い点: デスクトップ寸法は `size` プロップに残り SSOT が保たれる。a11y / stroke はラッパに集約されたまま。新規トークン不要（ADR-001 と整合、`--icon-md` 既存を再利用）。実装はクラス追加のみで本体ロジック不変。
- トレードオフ: `Icon` の JSDoc 契約を緩める（共有コンポーネントの利用規約変更）。乱用防止のため「レスポンシブ縮小限定（`max-sm:size-[var(--icon-*)]`）」と用途を明記し、無印 `w-*`/`h-*` 直書きの禁止は維持する。
- presentation attribute 上書きに依存する（lucide が width/height を style ではなく属性で出す前提）。lucide-react の現行実装に合致し、既存の `size-[var(--icon-xs)]` 利用箇所でも同じ前提が成立している。
- **既存実績との差分を明示しておく（[arch S-001] 反映）**: 既存の `size-[var(--icon-md)]` / `size-[var(--icon-xs)]` 利用箇所（`SearchFilterDrawer` の `X` など）は **raw lucide（`Icon` ラッパ非経由・`size` プロップ無し・default 24）** に class を当てるパターン。一方 #787 は **`Icon` ラッパが `size={20}` を lucide の width/height **属性**として明示転送した上に** `max-sm:size-[var(--icon-md)]` を重ねる構図で、「class 由来の width/height が属性を上書きする」機構（specificity 0 の presentation attribute に対し class が常に勝つ）は前例と同一だが、上書き対象の属性値が明示 20 で入る分だけ前例より一段踏み込んだ利用になる。CSS の優先順位上は確実に成立する。
- 上記を踏まえ、`Icon` の JSDoc カーブアウトには「`size` プロップ = デスクトップ寸法（lucide の width/height **属性**として残る寸法の SSOT）、`max-sm:size-[var(--icon-*)]` の class が sub-sm 断面でのみその属性を上書きする」と明記する。`size` を消す／無印 `w-*`/`h-*` を併用すると意図が壊れる旨も添え、後続実装者が「両方残すと壊れる」等の誤解をしないようにする。
- もし案C の契約変更を避けたい判断になった場合のフォールバックは案A（グリフ据え置き、gap/margin のみ縮小）。その場合でも AC-3 のフットプリント縮小（gap/縦マージン）は満たせる。

---
