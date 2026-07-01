# Plan Review — Issue #787 (Round 1)

**視点:** プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
**対象:** `.issue/787/plan.md` / `.issue/787/adr.md`
**判定:** 問題点ゼロ（要修正なし）。改善提案 3 件。

---

#### 問題点（要修正）

**問題点ゼロ。** 計画は CLAUDE.md「Styling」規約（utility-first / design-token SSOT / `@theme inline` ブリッジ / `max-sm:` variant の後勝ち）に整合しており、実現可能性・リスク面に致命的な懸念は見当たらない。コード調査で計画の前提をすべて裏取りできた:

- **(1) 新規トークン非追加の SSOT 整合**: 縮小値（gap 4 / margin 上12・下16 / icon 18px）は既存トークン段階（`--space-1`=4, `--space-3`=12, `--space-4`=16, `--icon-md`=18px。`tokens.css` L81-114 で確認）にちょうど一致。専用トークンを足さない判断は CLAUDE.md「追加は必要時のみ」「二重管理（tokens.css⇄tokens.md⇄@theme inline）を増やさない」と一致。ADR-001 妥当。
- **(4) `size-[var(--icon-md)]` の実在性**: `--icon-md` は `tokens.css` L114・`spec/design/tokens.md` L211/531・`index.css` `@theme inline` L102 の三点で揃っており、`SearchFilterDrawer.tsx` L414 が `className="size-[var(--icon-md)]"` を**逐語で**使用済み。記法は確実に機能する。
- **(3) `max-sm:` 追加がレール隔離・タッチ床を壊さない**: 44px 床は `pillBtn`/`pillBtnIcon`/`TOUCH_TARGET`（`styles.ts` L25/45/202-203）= ボタン側にあり、グリフ寸法と独立。計画は `MENU`/`MENU_RAIL` ローカルの gap/margin と `Icon` の glyph のみ触り、床・`overflow-x-auto`・`role="toolbar"` には触れない。波及なし。
- **依存範囲**: `UrlCopyButton` / `NoteActionsMenu` は `NoteActions` からのみ消費（grep 確認、他画面利用なし）。step 4 の `max-sm:size-[var(--icon-md)]` 追加はツールバー外に波及しない。

#### 改善提案（検討推奨）

- **[S-001]** ADR-002 の「presentation attribute 上書き」前提を、既存実績との差分も含めて明示する
  - 理由: 既存の `size-[var(--icon-md)]` 実績（`SearchFilterDrawer` L414 の `X`）は **raw lucide（`size` プロップ無し・default 24）** に class を当てるパターン。一方 #787 は **`Icon` ラッパが `size={20}` を lucide の width/height **属性**へ転送した上に** `max-sm:size-[var(--icon-md)]` を重ねる構図で、「class 由来の width/height が属性を上書き」する点は同じだが、属性値が明示 20 で入る分、前例とは一段違う。機構自体は CSS（specificity 0 の presentation attribute を class が常に上書き）で確実に成立するが、ADR-002 と Icon JSDoc カーブアウトに「`size` プロップ＝デスクトップ寸法（width/height 属性として残る）、`max-sm:` の class が sub-sm でのみ寸法を上書きする」と一文で書き切ると、後続実装者の誤解（size を消す/両方残すと壊れる等）を防げる。テスト方針の「実装 vs モック一致」目視に sub-sm/desktop 両断面の確認を加えるとなお良い。

- **[S-002]** trashed 分岐（`NoteActions.tsx` L173-182）も `MENU` を共有する点を計画に明記する
  - 理由: ゴミ箱状態のツールバー（単一ラベル付きピル）も同じ `MENU` 定数を使うため、`max-sm:my-3 max-sm:mb-4 max-sm:gap-1` は自動的にここにも適用される。フットプリント縮小として整合的で害は無いが、計画の step 3 は active 分岐の話に終始しており trashed 分岐への波及が言及されていない。「trashed 分岐の縦マージンも縮むが意図通り（gap は単一ピルにつき無影響）」と一言添え、AC 検証に trashed ツールバーも含めると抜けが無くなる。

- **[S-003]** AC-6「実装とモックが一致」の射程を、アイコン**ロスター**ではなく**3レバー（gap/縦マージン/icon 寸法）の意図値**に限ると明記する
  - 理由: モバイルモックの `.action-toolbar` markup（`mobile/P11-note-detail.html` L889-905）は先頭が Globe(16px) で Pencil（編集）ピルが見当たらず、実装の rail 先頭（Pencil primary, size 20）と**構成・順序が既に乖離**している（本Issue以前からの差分）。step 1 で 20→18 に直す対象（L896/899/902/905）と Globe 据え置き（L892, 16）は実装側の glyph 寸法と一致させられるが、ピルの顔ぶれ自体は揃わない。計画は AC-6 を「gap・縦マージン・アイコン寸法が同じ意図値」と既に正しく限定しているので、その射程を ADR か step 1 に再掲し、実装者が roster 不一致を本Issueで直そうとして scope（構造不変）を踏み越えないようにする。

#### 良い点

- **モック先行 → トークン → 実装の順序**を Issue スコープ通りに踏襲し、各ステップを AC にトレースしている（受け入れ基準表が検証可能な形）。
- **新規トークンを足さない判断（ADR-001）が SSOT 最小化原則と完全に整合**。縮小値が既存 `--space-*` / `--icon-md` 段階にちょうど嵌まることをコード上の値で裏取りでき、二重管理リスクを正しく回避している。
- **44px タッチ床の不可侵を構造的に説明**できている（床はボタン側 `pillBtn`/`pillBtnIcon`、glyph はピル内視覚密度のみ）。ADR-006/#633 の制約を侵さない論理が明快。
- **`Icon` 契約変更を最小カーブアウト（レスポンシブ縮小限定）に留め**、`size` プロップ＝デフォルト寸法 SSOT 原則と a11y/stroke 集約を保持する判断（ADR-002 案C）が、共有コンポーネントへの影響を最小化していて妥当。代替案 A/B も記録済み。
- **`max-sm:` 後勝ちの確実性**と #633 specificity 衝突との切り分け（min-h/min-w 床に触れないので衝突しない）をリスク欄で正しく説明。
- 依存波及（`MENU`/`MENU_RAIL` は `NoteActions` ローカル、共有 `pillBtn` の床は不変）の分析が正確で、コード調査と一致した。
