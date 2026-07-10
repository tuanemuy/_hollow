# Plan Review — Issue #818（Round 1 / アーキテクチャ整合性・実現可能性・リスク）

**対象:** `.issue/818/plan.md` / `.issue/818/adr.md`
**視点:** プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
**日付:** 2026-07-10

参照ファイルを実際に開いて検証した。全体として、プレゼンテーション層に閉じたスコープ設定・既存プリミティブの流用方針・スタイリング規約（新規CSS/@apply禁止、トークンSSOT、module-scoped 定数、`max-sm:` ブレークポイント方針）への適合は非常に良好。トークン・z値・含有ブロック前提はコードと突き合わせて概ね正確。ただし disclosure の `data-*` 開閉に 1 件の実装上の破綻がある。

---

#### 問題点（要修正）

- **[P-001]** メタ折りたたみの `data-[open]:` バリアントが親要素の `data-open` に反応しない（開閉が効かない）
  - 該当: plan L93 / L106 / L126。`metaBody` を `max-sm:hidden data-[open]:max-sm:block sm:block` とし、`data-open={metaOpen || undefined}` は**外側の** `<div className={metaDisclosure}>`（L126）に付与する設計になっている。
  - 理由: Tailwind の `data-[open]:` は「その要素自身が `[data-open]` を持つとき」に効くセレクタ（`&[data-open]{...}`）にコンパイルされる。`data-open` を親（`metaDisclosure`）に置き、子（`metaBody`）で `data-[open]:` を使っても**親属性は参照されない**ため、mobile で開いても `metaBody` は `max-sm:hidden` のまま表示されない。既存の同型パターン `APP_SIDEBAR`（`app/components/layout/styles.ts:92` の `data-[open]:max-lg:translate-x-0`）も、`data-open` は**バリアントを持つ要素自身**（`AppShellDrawer.tsx:200` の `<aside>`）に付与されており、この規則を裏づける。加えて `metaDisclosure` のクラス列（plan L106）には `data-[open]:` 消費が一切無く、`data-open` の唯一の消費者は `metaBody` である。したがって `data-open` は `metaDisclosure` ではなく `metaBody` に置くのが正しい。
  - 提案: 次のいずれか。(a) 最も単純: `data-open={metaOpen || undefined}` を `metaBody` の `<div>` に付ける（`metaDisclosure` の枠/surface スタイルは `data-open` 非依存なので影響なし）。(b) 親主導にしたいなら `metaDisclosure` に `group` を足し、`metaBody` を `group-data-[open]:max-sm:block` にする（キャレット回転など複数子で親状態を共有したい場合に有利）。ADR-003 は「単一 DOM 再配置」を掲げているので (a) が方針と整合し最小。加えて summary のキャレット回転を入れるなら (b) を選ぶと `group-data-[open]:` で統一できる旨を実装ステップに明記すること。

---

#### 改善提案（検討推奨）

- **[S-001]** ツリー行キャレットの `TOUCH_TARGET_SQUARE` 化は行選択タップを奪うおそれ
  - 該当: plan S6（L139）「キャレットボタンにタップ領域（… mobile で `TOUCH_TARGET_SQUARE` 相当）を付与」。
  - 理由: キャレットは `absolute left:${indent}px`（`DirectoryTreeSelect.tsx:310-311`）で、選択ボタンのラベル開始は `paddingLeft: indent+22`（同 333）。キャレットの当たり判定を 44px 角に広げると、ラベル開始（＋22px）を大きく跨いで**選択行の左側 ~22px 以上に重なる**。z-10 のためキャレットが上に来て、フォルダ名の左端付近タップが「選択」ではなく「展開」に化ける。モックは行（`.dir-tree-item`）側に `min-height:44px` を与えて行全体のタップ床を確保しており、キャレット自体を 44px 角にはしていない。
  - 提案: 行（`dirTreeItem` の `TOUCH_TARGET` = `max-sm:min-h-[44px]`）でタップ床を満たす方針に寄せ、キャレットは**縦方向のみ**の当たり拡大（例: `py` で縦を稼ぎ幅は据え置き、`top-1/2 -translate-y-1/2`）に留める。`TOUCH_TARGET_SQUARE`（min-w も 44px）はキャレットには付けない。

- **[S-002]** 本文 `min-h` を `min-h-[480px] max-sm:min-h-[52vh]` にする向きは生成CSSの並び順に依存する
  - 該当: plan S7（L146-148）。base `min-h-[480px]` に `max-sm:min-h-[52vh]` を重ねる。
  - 理由: base（無条件）と `max-sm:`（max-width メディア）は**同一プロパティ・同一詳細度**。メディアクエリは詳細度を上げないため、mobile ビューポート内でどちらが勝つかは**生成CSSの出現順**次第。このリポジトリは過去に同種の source-order 事故を踏んでおり、`app/components/layout/styles.ts:19-21` の `HEADER_CTA_COLLAPSE` は同じ理由で `!` を要している。`max-sm:min-h-[52vh]` が base より後に出れば意図どおりだが、暗黙前提を残すのは脆い。
  - 提案: 上書き方向を**確実に効く `sm:` 側**へ反転する: `min-h-[52vh] sm:min-h-[480px]`（min-width `sm:` は base を確実に上書きする）。挙動は同じで並び順依存が消える。3 ファイル（`WysiwygEditor.tsx:594` / `HtmlEditor.tsx:45` / `InlineEditor.tsx:863`）で統一。

- **[S-003]** 下部固定保存バー（z-40）がメタ内 Popover / タグ候補パネル（z-30）を遮蔽しうる
  - 該当: plan L78 の z 設計、`dirDropdownPanel`/`tagSuggestPanel` は z-30（`styles.ts:166,130`）。
  - 理由: 保存バーは `max-sm:z-40 fixed bottom-0`、ディレクトリドロップダウン/タグ候補は z-30 で `top-[calc(100%+6px)]` に下向き展開。メタが画面下寄りに来て候補パネルが下端に達すると、z-40 の保存バーが上に被る。実運用ではメタ折りたたみが本文（52vh）より上＝画面上部寄りに位置するため実害は小さいが、plan のリスク項（L171）は `display:none` 相互作用のみで**z 遮蔽には触れていない**。
  - 提案: 検証項目（Phase 3）に「メタ展開中にディレクトリ/タグ候補を開いたとき、候補の末尾が保存バーに隠れないこと」を明記。必要なら候補パネルを `max-sm` でボトムシート化（既存 `popoverSheetPanel`, `common/styles.ts:414` を流用）する退避策も一言添える。

- **[S-004]** `filterChipRemove` は白オン濃色専用のため「直接流用（import）」はできない — 定数は別立てのままにする旨を明示
  - 該当: plan L52 / L107。「`filterChipRemove` 相当のボックス化」。
  - 理由: `filterChipRemove`（`note/list/styles.ts:93-94`）は `text-white/85 hover:bg-white/[0.18]` で、`filterChip[data-active]`（`bg-ink text-white`）の濃色チップ内側専用。タグチップ（`tagChip` = `bg-surface`, `styles.ts:102-103`）は淡色 surface なので、そのまま import すると × が視認不能。plan は「相当」と表現し ink 系色（`text-ink-tertiary hover:text-ink hover:bg-surface-hover`）を指定しており**判断は正しい**が、実装者が誤って共有 import に流れないよう、`tagChipRemove` は**形（`inline-flex w-4 h-4 rounded-full`）だけ揃えて色は独立**と明記しておくと安全。
  - 提案: S1 の記述に「`filterChipRemove` は色が濃色前提なので import せず、`tagChipRemove` を独立定数として box 化する」と一文追加。

- **[S-005]** タグチップ × 自体はタップ床（44px）未満のまま — 意図の明文化を
  - 該当: AC-4（L20）はタップ床を「ツリー行/検索入力」に限定。タグ × は `w-4 h-4`(16px) のまま。
  - 理由: AC-4 の「操作対象行はタップ床を満たす」に照らすと、削除 × は 16px で床未満。モックの `.tag-chip .x` も小さいので**意図的な非適用**と読めるが、`filterChipRemove` の設計コメント（`note/list/styles.ts:81-85`）同様「bare chip の × は床を膨らませない」という明示的判断を plan にも残すと、レビュー/実装間の齟齬を防げる。
  - 提案: S5 に「タグ × は他チップ同様タップ床を適用しない（チップを肥大させないため。行側で担保）」と一文。

- **[S-006]** disclosure に `aria-controls` を付けて summary↔body を関連づける
  - 該当: plan L126（summary に `aria-expanded` のみ）。
  - 理由: `aria-expanded` はあるが `aria-controls` が無い。折りたたみ本体に id を振り `aria-controls` で結ぶと支援技術での関連が明確になる。低コストな a11y 改善。
  - 提案: `metaBody` に id を付与し summary に `aria-controls` を追加。

- **[S-007]** メタ preview のパス解決ロジックが `DirectoryTreeSelect` と重複する
  - 該当: plan S4（L127）「`props.tree` から … パス … `triggerLabel` 導出ロジックと整合」。
  - 理由: ディレクトリ id→ラベル/パス解決を orchestrator 側で再実装すると、`DirectoryTreeSelect`/`DirectoryPicker` 内のラベル導出と二重管理になり、将来のパス表記変更で片方だけ古くなるリスク。
  - 提案: 既存のラベル導出を小さな純関数（例: `resolveDirectoryPath(tree, id)`）として抽出・共有し、preview と trigger の両方から呼ぶ。もしくは preview 生成を `DirectoryPicker` 側の責務に寄せて props で受け取る。実装時に重複を避ける方針を一言。

---

#### 良い点

- **含有ブロック前提の検証が正確。** `position: fixed` の祖先に transform/backdrop-filter/filter が無いという主張（plan L78 / ADR-003）を実コードで確認: `main`（`APP_MAIN`）は `AppShellDrawer.tsx:208` で `div.APP_LAYOUT_WITH_SIDEBAR`（grid, transform/filter なし）→ Provider fragment の下にあり、`APP_HEADER` の backdrop-filter（`layout/styles.ts:6`）とドロワー `<aside>` の `transition-transform`（同 92）はいずれも `main` の**兄弟**。含有ブロックはビューポートで正しい。
- **z-index の主張が実値と整合。** 保存バー z-40 は scrim `z-[90]`（`SIDEBAR_BACKDROP`, `layout/styles.ts:97`）/ drawer `z-[100]`（`APP_SIDEBAR`, 同 92）より下で、ドロワー展開時に背後へ隠れる意図どおり。ヘッダー z-50 とは上下で空間衝突しない。`BulkActionBar` も z-40 だが編集画面と一覧画面は排他なので競合なし。
- **プリミティブ流用が的確。** `BulkActionBar` の下部固定パターン（`max-sm:fixed inset-x-0 bottom-0 rounded-t-lg pb-[calc(…+env(safe-area-inset-bottom))]`, `BulkActionBar.tsx:46`）、ADR-005 の backdrop（`APP_HEADER`）、`scrollbarHidden` / `TOUCH_TARGET` / `popoverSheetPanel`（`common/styles.ts`）いずれも実在を確認。参照は正確。
- **ADR-003（単一 DOM 再配置）が妥当。** 保存/キャンセルは `NoteEditor.tsx:434-458` の単一ブロックで、`editorActions` にコンテナ側から `max-sm:fixed` を当てる方式は二重描画（状態不整合・二重 submit）を確実に避ける。`isPending`/`saveDisabled`/ラベル分岐が一箇所に留まる点も良い。
- **トークン追加不要の判断が正確。** `--header-bg`/`--header-blur`/`--space-3`/`--space-4` は `tokens.css` に存在、`bg-surface-elevated`/`bg-surface-hover`/`border-hairline` は `index.css` の `@theme inline`（L16-21）でユーティリティ化済み。plan の「無ければ `bg-[var(--color-surface-elevated)]`」ヘッジも不要なほど揃っている（＝そのまま `bg-surface-elevated` で可）。
- **スコープ切りが健全。** ヘッダー簡略タイトル（ADR-001）は共有シェル横断＝Issue 粒度超と正しく判断し、`aria-hidden` 装飾ゆえ機能欠落でない点も的確。WYSIWYG ツールバー圧縮・ネイティブダイアログ置換の別 Issue 化も妥当。
- **ADR-002（APP_MAIN 全 /_app 波及）のリスク評価は妥当。** 負マージンハック回避＋SSOT 原則で共有定数を直す判断は理にかなう。波及の目視検証を plan リスク項に明記済み。`APP_MAIN` は `AppShellDrawer`/`AppShell` 双方で共有され、変更は一貫して両経路に効く（片手落ちがない）。

---

#### 総評

方針・アーキ整合・リスク認識は高品質。**要修正は P-001（disclosure の `data-open` 参照先）1 件**で、これは実装時に開閉が全く効かない実害がある一方、修正は「`data-open` を `metaBody` へ移す」だけで軽微。残りは実装細部の堅牢化（S-001〜S-007）。P-001 を反映すれば実装着手可。
