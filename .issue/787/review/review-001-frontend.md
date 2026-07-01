# PR #809 レビュー — Frontend 観点 (round-1)

**対象:** PR #809 / Issue #787（ノート詳細アクションツールバーのモバイル縮小: gap / margin / icon density）
**計画:** `.issue/787/plan.md`（AC-1〜AC-7）
**判定:** Blocker なし。実装は計画・ADR に忠実で、Frontend 観点の受け入れ基準（AC-1/3/4/5/6/7）を満たしている。

---

## Frontend

### Blockers

なし。

差分は計画（Step 1/3/4/5）とモック先行の順序を逐語的に踏襲しており、Frontend 観点の致命的な問題は検出されなかった。主要な技術的前提を以下のとおり個別検証した。

- **`max-sm:` 後勝ちの確実性（gap / margin）**: `MENU` は base `gap-2 my-4 mb-6` に対し `max-sm:gap-1 max-sm:my-3 max-sm:mb-4` を追加（`NoteActions.tsx:88-89`）。Tailwind v4 は `max-*`（max-width）バリアントを無印 base ユーティリティの**後**に emit するため、640px 未満では同 specificity (0,1,0) のうち後勝ちで `max-sm:` が確定的に勝つ。これは同ファイルの既存パターン（base `inline-flex flex-wrap` を `max-sm:flex max-sm:flex-nowrap` が上書き）と同一機構で、すでに実証済み。margin の `my-3`（margin-block）→ `mb-4`（margin-bottom）の上書き順も、既存の base `my-4 mb-6`（mb-6 が my-4 の bottom を上書きして 24px を出す）と同じ Tailwind ソート順に従うため mb=16px が出る。テスト結果（TC-2/TC-5）が mobile gap=4 / mt=12 / mb=16、desktop gap=8 / mt=16 / mb=24 を実測 PASS しており、後勝ちは経験的にも確認済み。
- **`size-[var(--icon-md)]` がアイコン寸法を上書きするか**: `Icon` ラッパは `size={20}` を lucide の `width="20" height="20"` **属性**（presentation attribute, specificity 0）として転送する。`max-sm:size-[var(--icon-md)]` は arbitrary value で CSS `width/height: var(--icon-md)`(=18px) を生成し、author CSS は presentation attribute に常に優先するため、sub-`sm` で確定的に 18px が勝つ。`sm` 以上では class 由来の width/height が出ないため属性の 20px が残る。`--icon-md` は `tokens.css:114` で 18px、`index.css:102` の `@theme inline` でブリッジ済み（ただし arbitrary value 参照なのでブリッジ非依存でも解決）。TC-2=18px(mobile) / TC-5=20px(desktop) で PASS。
- **className 結合の妥当性**: 5 箇所（Pencil/FolderInput/Download/UrlCopyButton/NoteActionsMenu）すべて静的文字列 `className="max-sm:size-[var(--icon-md)]"` を `Icon` に渡すのみ。`Icon` は className をそのまま lucide コンポーネントへ転送（`Icon.tsx:52,65`）。動的結合・条件分岐はなく JIT スキャン漏れの懸念なし。
- **コンポーネント設計・責務**: 変更は最小限・外科的。`Icon` 本体ロジックは不変で JSDoc カーブアウト追記のみ（`Icon.tsx:30-38`）。`MENU`/`MENU_RAIL` のローカル定数のみ拡張し、共有 `pillBtn`/`pillBtnIcon`/`TOUCH_TARGET`（`styles.ts`）には一切触れていない。波及範囲は `NoteActions` ツールバー内に閉じている。
- **デスクトップ非回帰（AC 範囲外だが重要）**: `size={20}` 据え置き、base `gap-2 my-4 mb-6` 据え置き。`max-sm:` 限定なので `sm` 以上は完全に不変。TC-5 で 800px/1280px とも据え置きを実測 PASS。
- **44px タッチ床維持（AC-4）**: 床は `pillBtn`(`TOUCH_TARGET`=`max-sm:min-h-[44px]`) と `pillBtnIcon`(`max-sm:min-w-[44px]`) = ボタン側にあり、グリフ寸法と独立。グリフ縮小はボタン box に影響せず、TC-3 で全 icon-only ピル 44×44px を実測 PASS。
- **アイコン密度の網羅性（AC-6）**: ツールバー内の icon-only グリフ（Pencil/FolderInput/Link2・Check/Download/MoreHorizontal）はすべて縮小適用。ラベル付き「公開状態」ピルの Globe（default 16px）は据え置きで、モックの 16px グリフ（変更対象外）と一致。漏れ・過剰適用なし。
- **既存 className との競合**: アイコンの width/height を設定する他クラスは存在しない（`pillBtn`/`pillBtnIcon` はボタン側の寸法・床のみ）。`mx-auto`/positioning 等との併用もなし。競合なし。

### Warnings

- **[W-001]** `tokens.md` の `--icon-*` 利用ガイダンスが新しい「`Icon` ラッパ経由」利用を反映していない
  - 場所: `spec/design/tokens.md:204`
  - 理由: tokens.md は `--icon-2xs`〜`--icon-md` を「`Icon` ラッパ**を介さず**（stroke 集約をバイパスする dense グリフ）`size-[var(--icon-*)]` で参照する」用途として明記している。本 PR はこの方針を一段踏み越え、`Icon` ラッパが `size={20}` を出した上に `max-sm:size-[var(--icon-md)]` を重ねる新パターンを導入した（ADR-002 自身も「前例より一段踏み込んだ利用」と認める）。エンジニアリング根拠は `Icon.tsx` JSDoc カーブアウトと ADR-002 に記録済みだが、デザイントークン SSOT のミラーである tokens.md には反映されていない。計画 Step 2 は「tokens.css/tokens.md 変更なし」を選択しており値の追加は不要だが、利用ガイダンス文（L204）は実態とズレる。
  - 提案: tokens.md L204 付近に一文（例: 「レスポンシブ縮小に限り `Icon` ラッパ経由でも `max-sm:size-[var(--icon-*)]` 上書きを許可。詳細は `Icon.tsx` JSDoc / `.issue/787/adr.md` ADR-002」）を追記し、トークン利用の SSOT と実装を整合させる。低優先（doc のみ・挙動影響なし）。

### Notes

- **[N-001]** ADR-002（案C）の判断は妥当。`Icon` の a11y / `strokeWidth=1.5` 集約と「`size`=デフォルト寸法 SSOT」原則を保ったまま、レスポンシブ縮小という限定ニーズだけを JSDoc カーブアウトで明文化している。「`size` を消すな / 無印 `w-*`・`h-*` と併用するな」の注意書き（`Icon.tsx:37-38`）が後続実装者の誤用を予防していて良い。
- **N-002** 既存の `size-[var(--icon-*)]` 利用箇所（`DisplayModeSwitch.tsx:103` / `FilterBar.tsx:449` / `SearchFilterDrawer.tsx:414` 等）はいずれも **raw lucide（`Icon` ラッパ非経由・`size` プロップなし・default 24）** に class を当てるパターンであることを確認。本 PR は「ラッパの `size` 属性 + class 上書き」の初出だが、CSS（property が presentation attribute に優先）上は前例と同じく確実に成立する。
- **N-003** モック先行が守られている。`spec/design/pages/mobile/P11-note-detail.html` の `.action-toolbar`（gap `--space-1` / margin `--space-3 0 --space-4`）と icon-only svg 18px を先に修正し、実装値が逐語一致（TC-1↔TC-2）。デスクトップモック `P11-note-detail.html` は未変更で AC-1 のスコープを正しく限定。
- **N-004** モック内 icon-only svg は `stroke-width="1.7"/"2"`、実装の `Icon` は `strokeWidth=1.5` 固定という pre-existing なモック↔実装差があるが、本 Issue の 3 レバー（gap/縦マージン/グリフ寸法）には無関係でスコープ外。
- **N-005** `gap-1`(4px) の円形ピル間隔が窮屈に見えないかは計画リスク欄で挙げられていたが、モック（SSOT）を 4px に確定し TC-1 目視 PASS で design 受容済み。
