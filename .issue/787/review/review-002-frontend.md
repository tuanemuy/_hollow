# PR #809 レビュー — Frontend 観点 (round-2 / フル再レビュー)

**対象:** PR #809 / Issue #787（ノート詳細アクションツールバーのモバイル縮小: gap / margin / icon density）
**計画:** `.issue/787/plan.md`（AC-1〜AC-7）
**判定:** Blocker なし。コード本体は計画・ADR に忠実で Frontend 観点の AC（AC-1/3/4/5/6/7）を満たす。ただし round-1 W-001 の doc 修正が **未コミット**で PR に含まれておらず、このままでは PR レベルでは未解消（Warning）。

---

## Frontend

### Blockers

なし。

ゼロベースで差分（`Icon.tsx` / `NoteActions.tsx` / `NoteActionsMenu.tsx` / `UrlCopyButton.tsx` / `spec/design/pages/mobile/P11-note-detail.html`）を再検証し、致命的な問題は検出されなかった。主要な技術的前提を以下のとおり個別に裏取りした。

- **`max-sm:` 後勝ち（gap / margin）**: `MENU`（`NoteActions.tsx:88-89`）は base `gap-2 my-4 mb-6` に `max-sm:my-3 max-sm:mb-4 max-sm:gap-1` を追加。Tailwind v4 は `max-*`(max-width) バリアントを無印 base の**後**に emit するため、640px 未満では同 specificity の後勝ちで確定的に勝つ。`my-3`→`mb-4` の上書き順も既存 base `my-4 mb-6`（mb が my の bottom を上書きして 24px を出す）と同一のソート順に従い mb=16px が出る。`MENU_RAIL`（L93）の `max-sm:gap-1` も同機構。TC-2/TC-5 が mobile gap=4/mt=12/mb=16・desktop gap=8/mt=16/mb=24 を実測 PASS。
- **`size-[var(--icon-md)]` のグリフ上書き**: `Icon` は `size={20}` を lucide の `width="20" height="20"` **属性**（presentation attribute, specificity 0）として転送。`max-sm:size-[var(--icon-md)]` は arbitrary value で CSS `width/height: var(--icon-md)`(=18px) を生成し、author CSS は presentation attribute に常に優先するため sub-`sm` で 18px が確定的に勝つ。`sm` 以上では class 由来の width/height が出ず属性 20px が残る。`--icon-md` は `tokens.css:114`=18px・`index.css:102` の `@theme inline` でブリッジ済み（arbitrary value 参照なのでブリッジ非依存でも解決）。TC-2=18px / TC-5=20px で PASS。
- **className 結合**: 5 箇所（Pencil/FolderInput/Download/UrlCopyButton/NoteActionsMenu）すべて静的文字列 `className="max-sm:size-[var(--icon-md)]"` を `Icon` にそのまま渡すのみ（`Icon.tsx:55,65` で lucide へ転送）。動的結合・条件分岐なし、JIT スキャン漏れの懸念なし。
- **デスクトップ非回帰**: `size={20}` 据え置き・base `gap-2 my-4 mb-6` 据え置き。変更はすべて `max-sm:` 限定で `sm` 以上は完全に不変。TC-5 が 800px/1280px とも据え置きを実測 PASS。
- **44px タッチ床維持（AC-4）**: 床は `pillBtn`(`TOUCH_TARGET`=`max-sm:min-h-[44px]`) / `pillBtnIcon`(`max-sm:min-w-[44px]`) = ボタン側にあり、グリフ寸法と独立。`styles.ts` は不変。グリフ 20→18 は box に影響せず TC-3 で全 icon-only ピル 44×44px を実測 PASS。
- **アイコン密度の網羅性・過不足（AC-6）**: ツールバー内 icon-only グリフ（Pencil/FolderInput/Link2・Check/Download/MoreHorizontal）はすべて縮小適用。ラベル付き「公開状態」ピルの `Globe`（default 16px）は据え置きで、モックの 16px グリフ（変更対象外）と一致。漏れ・過剰適用なし。
- **既存 className との競合**: アイコンの width/height を設定する他クラスは存在しない（`pillBtn`/`pillBtnIcon` はボタン側の寸法・床のみ）。positioning 等との併用もなし。競合なし。
- **モック先行（AC-1）**: `spec/design/pages/mobile/P11-note-detail.html` の `.action-toolbar`（gap `--space-1` / margin `--space-3 0 --space-4`）と icon-only svg 18px を先に修正し、実装値が逐語一致。デスクトップモック `P11-note-detail.html` は未変更でスコープを正しく限定。

### Warnings

- **[W-001]** round-1 W-001 の修正（`tokens.md` への doc 追記）が **未コミット**で PR #809 に含まれていない
  - 場所: `spec/design/tokens.md`（working tree の `M` 状態。L213 付近に追記）
  - 理由: round-1 W-001 の提案どおりの文面（「例外として、レスポンシブ縮小に限り `Icon` ラッパへ `max-sm:size-[var(--icon-*)]` を当てて glyph を縮小してよい。…詳細は `Icon.tsx` JSDoc / `.issue/787/adr.md` ADR-002。」）が **working tree には存在するが、`git status` で `M spec/design/tokens.md`（未コミット）**であり、PR ブランチ HEAD（`cce20b80`）にも origin にも含まれていない。`git diff origin/main...HEAD` の変更ファイル一覧に `spec/design/tokens.md` は無く、PR の committed diff に反映されていない。つまり**文面自体は的確だが、コミット・プッシュされていないため PR レベルでは W-001 は未解消**。このままマージすると tokens.md SSOT は依然として実装とズレたまま残る。
  - 提案: `spec/design/tokens.md` の当該変更をコミットして PR #809 にプッシュする（`git add spec/design/tokens.md && git commit`）。文面は適切なので追加修正は不要。コミットされれば W-001 は完全に解消する。

### Notes

- **[N-001]** round-1 W-001 で指摘した doc 文面の中身（working tree 上）は的確。「`size` prop はデスクトップ寸法の SSOT として据え置く（消さない・無印 `w-*`/`h-*` と併用しない）」と `Icon.tsx` JSDoc カーブアウト（`Icon.tsx:30-38`）と整合し、`ADR-002` へポインタも貼られている。あとはコミットするだけ（W-001 参照）。
- **[N-002]** ADR-002（案C）の判断は妥当。`Icon` の a11y / `strokeWidth=1.5` 集約と「`size`=デフォルト寸法 SSOT」原則を保ったまま、レスポンシブ縮小という限定ニーズだけを JSDoc カーブアウトで明文化。「`size` を消すな / 無印 `w-*`・`h-*` と併用するな」の注意書き（`Icon.tsx:36-38`）が後続実装者の誤用を予防していて良い。
- **[N-003]** 既存の `size-[var(--icon-*)]` 利用箇所は raw lucide（ラッパ非経由・default 24）に class を当てるパターンで、本 PR は「ラッパの `size` 属性 + class 上書き」の初出。ただし CSS（property が presentation attribute に優先）上は前例と同じく確実に成立し、ADR-002 にも差分が明記済み。
- **[N-004]** モック内 icon-only svg の `stroke-width="1.7"/"2"` と実装 `Icon` の `strokeWidth=1.5` 固定という pre-existing なモック↔実装差があるが、本 Issue の 3 レバー（gap/縦マージン/グリフ寸法）には無関係でスコープ外。
- **[N-005]** AC-7（`pnpm typecheck && lint:fix && format`）は本 PR が純粋な className 文字列追加 + JSDoc 追記 + 複数行 JSX 整形のみで、型・lint 上のリスクは無い。TC サマリも全 PASS。
