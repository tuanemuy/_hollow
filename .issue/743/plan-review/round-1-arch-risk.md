# Plan Review — Issue #743 Round 1（アーキテクチャ整合性・実現可能性・リスク）

レビュー対象: `.issue/743/plan.md` / `.issue/743/adr.md`
視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

---

#### 問題点（要修正）

- **[P-001] ADR-003 / plan の「`loadDirectoryTreeFlat` は cache() dedup で二重 I/O にならない」前提は誤りである可能性が高い**
  - 理由: React の `cache()` は引数を `Object.is`（オブジェクトは**参照同一性**）でキー化する。HomePage 自身の JSDoc（`app/components/note/HomePage.tsx` L49–54）が「React `cache` keys by argument *reference identity*」「a structurally-equal literal per section would double the query」と明記しており、まさにこの理由から `notesQuery` を 1 箇所で生成して同一参照を 2 セクションに渡している。一方 `loadDirectoryTreeFlat` の引数 `{ actorUserId }` は `FilterSection`（L168）で**インラインリテラル**として生成されており、新設する `DirectoryLocationSection` も別のインラインリテラルを生成することになる。両者は構造同値だが**別参照**なので、`Object.is` キーでは dedup されず実 I/O が二重化する。plan のリスク欄は「構造同値でキー化される実装か確認すること」と保留しているが、ADR-003 の Decision/Consequences は「二重 I/O は発生しない」と確定事項として記述しており、前提と結論が食い違っている。
  - 補強証拠: `app/components/view/SavedViewsList/Page.tsx` は既に `loadDirectoryTreeFlat({ actorUserId: userId })` を `NewViewButtonSection`（L67）と `ViewsSection`（L79）の 2 つの別 Suspense セクションからそれぞれインラインリテラルで呼んでおり、参照同一性ルールに従えば**この既存コードも既にツリーを二重 fetch している**。つまり「同一レンダー dedup が効くから二重 await して良い」という ADR-003 の前提は、少なくとも `loadDirectoryTreeFlat` の現状の呼ばれ方では成立していない。
  - 提案: 次のいずれかで根拠を確定させてから ADR-003 を確定すること。
    1. 実際に `cache` のキー挙動を検証する（同一参照でないと dedup しないなら、ツリーをページ最上位で 1 回 await して同一参照 or 算出済みセグメントを props で各セクションへ渡す。`notesQuery` と同じ「1 箇所生成・同一参照配布」パターン）。
    2. そもそも別境界で再 await する設計自体を見直す（P-002 と連動）。新セクションを廃し、既に tree を持っている箇所でセグメントを算出して渡せば二重 I/O 問題は消える。

- **[P-002] ADR-003 の新 async server component（DirectoryLocationSection）＋専用 Suspense/ErrorBoundary 境界の新設は過剰設計の疑いが強い**
  - 理由: 実コードを確認した結果、`directoryAncestorSegments` によるセグメント算出は `FilterSection`（`app/components/note/HomePage.tsx` L181–184）で既に行われており、tree も同セクションで既に await 済み。要件 AC-4 は「パンくずを `<h1>` の**上**に出す」ことであり、これは「新たな async/loader/境界を増やす」こととは独立。新境界の唯一の動機は「tree loader 失敗で見出しを巻き込まない」だが、これは新たな二重 await（P-001）を導入してまで守るほどの不変条件ではない。ヘッダ（`HeaderSection`）は tree を読んでおらず、パンくず描画を `HeaderSection` 内に取り込むと逆に tree 依存をヘッダ境界へ持ち込み、境界の意味（saved views + owned notes）を汚す。一方で独立境界を切れば P-001 の二重 I/O を抱える。どちらに倒しても新規 async 化はコストが先行する。
  - より単純な代替（要件を満たしつつ二重 I/O・新境界を回避）:
    - **案X（推奨）**: パンくず描画を引き続き `FilterSection` の責務に置いたまま、**描画位置だけ** `<h1>` の上に出す。`FilterSection` は既に tree を await しセグメントを算出しているので、ここで `DirectoryBreadcrumb`（onClear 廃止後は純表示で server から直接描画可）を返し、`HomePage` のレイアウト順で「フィルタ境界の出力のうちパンくず部分を見出し上に置く」よう構成する。ただし現状の `HomePage` 合成は「境界＝縦の並び」なので、位置を見出し上にするにはパンくずを別出力にする必要がある点は残る。
    - **案Y**: tree を `HomePage` 本体（`HeaderSection`/`FilterSection` の外、`notesQuery` と同じ場所）で 1 回 await し、`directoryAncestorSegments` でセグメントを算出して、見出し上のパンくずと `FilterBar` の両方へ**同じ算出済みセグメントを props で渡す**。これは `notesQuery` の「1 箇所生成・同一参照配布」と完全に同型で、プロジェクトの確立パターンに最も忠実。ただし `HomePage` 本体での await はページ全体のストリーミング粒度を下げる（tree 失敗が全体に波及）ため、#649 の境界方針とのトレードオフを ADR で明示する必要がある。
  - 提案: ADR-003 を「新 async server component + 専用境界を新設する」で確定する前に、案X/案Y と比較し「なぜ新境界が必要か」を二重 I/O 解消とセットで論証すること。P-001 が解消できない限り、新境界案は二重 I/O を確定的に抱えるため不採用が妥当。要件（見出し上配置・語彙統一）は新 loader/境界なしで満たせる。

- **[P-003] 「見出し上」配置と既存境界構成の整合が plan/ADR で詰め切れていない（h1 の所在との衝突）**
  - 理由: 現状 `<h1>` は `HeaderSection`（ツールバー境界）が唯一保持し、その境界の error fallback も静的 `<h1>` を出して「ページが h1 を失わない」不変（`.issue/649/adr.md` ADR-009、`app/components/note/HomePage.tsx` L94–102）を守っている。パンくずを「`<h1>` の上」に置くには `HeaderSection` の内側か、その境界の外側上方に置くことになる。ADR-003 の案A（ツールバー境界内に取り込む）は tree 依存をツールバー境界に混入させ、案B（独立境界）は P-001 の二重 I/O を抱える。どちらも plan は「ADR-003 で確定」と先送りしているが、h1 不変条件・error fallback の見出し位置・パンくずと h1 の上下関係（fallback 時にパンくずが消えると h1 だけ残る）といったエッジが未整理。
  - 提案: ADR-003 で「パンくず境界が失敗した場合、見出し（h1）と件数/ツールバーは正常表示されるか」「`directoryId` 未設定時は何も描画しない＝高さ 0 で h1 が繰り上がるレイアウトで良いか（詳細は常に NoteBreadcrumb があるが一覧は条件付き）」を明示すること。詳細との「対称性」は directoryId がある時のみ成立し、無い時は一覧だけパンくず行が消える非対称が残る点も Consequences に記載すべき。

---

#### 改善提案（検討推奨）

- **[S-001] root crumb「すべてのノート」の追加は Issue 要件の必須ではなく、ADR-001 で「採るかどうか」自体を選択肢として明示すべき**
  - 理由: Issue 本文の対応方針3は「ディレクトリのみの解除を残したい場合は…root crumb を足す案も**検討**」と条件付きで、フルリセット導線（既存「フィルタをすべてクリア」）で AC は満たせる。ADR-001 は root crumb 採用を確定し、かつ「他フィルタも落とす」挙動にして Issue 方針3 の「directory のみ解除」とは別物になっている。これは「× 廃止で失う directory 単独解除導線」を厳密には代替しておらず（祖先リンクと同じく他フィルタを落とす）、機能的には「フルリセットへの導線が 1 つ増える」だけに近い。揃える先の `NoteBreadcrumb` は root crumb を持たない（先頭セグメントが最上位）ので、「詳細と揃える」目的とも厳密には一致しない。
  - 提案: root crumb を入れない（祖先セグメント先頭＝最上位ディレクトリへのリンクで location 起点は足りる、`NoteBreadcrumb` と完全対称）案も天秤にかけ、ADR-001 で「なぜ詳細にない root crumb を一覧だけ足すのか」を要件由来で正当化するか、落とすこと。スコープ最小化の観点では落とす方が Issue 要件に忠実。

- **[S-002] フォールバックチップの gating（`optimisticDirectoryId !== undefined && segments.length === 0`）と「パンくずは別場所」分離後の過渡表示を実コードで再確認**
  - 理由: 現 `FilterBar` は `segments = directorySegments ?? []`（L311）と `optimisticDirectoryId`（L284）の組み合わせで分岐している。パンくずを `FilterBar` 外へ出すと、`FilterBar` 側は「optimistic で directory 解除 → props の `directorySegments` はまだ前の値」という過渡で、`optimisticDirectoryId === undefined` により非表示になる前提。これは現行の `directoryId` optimistic が「解除のみ」である前提（#710 ADR-002）に依存する。一方ヘッダ側の新パンくずは server props（optimistic を経由しない）でレンダーされるため、解除ナビ中はヘッダのパンくずが前の値で残り、`FilterBar` のフォールバックは消える、という**2 箇所の更新タイミング差**が生じうる。plan はフォールバック側の過渡しか論じていない。
  - 提案: 「ヘッダのパンくず（server props 由来、optimistic 非経由）」と「フィルタ行のフォールバック（optimistic gating）」が解除遷移中にどう見えるかを 1 ケース書き出して、過渡で両方消える/両方残る/片方だけ残るのどれになるか確認し、許容できることを明記する。

- **[S-003] テスト移設の検証漏れ防止のため、AC ↔ テストの対応表を plan に持たせる**
  - 理由: `FilterBar.test.tsx` の #710 パンくず群（L709–827）は「nav 存在」「セグメントリンク」「separator」「行配置（chip cloud の兄弟）」「× で navigate」を検証している。これらの主軸が新規 `DirectoryBreadcrumb.test.tsx` と（位置検証は）HomePage 側へ分散する。特に「行配置（L790–803、chip cloud の sibling）」テストは配置が変わるので**そのまま移せない**（移設先＝見出し上配置の検証は HomePage か新セクションが必要だが、plan のテスト方針には HomePage 配置テストが明記されていない）。`clearDirBtnInNav`（L719）系・separator 数え（Folder アイコン除外ロジック L774–778）は Folder アイコン撤去で前提が変わる。
  - 提案: 「行配置」検証の移設先（見出し上に出ることをどのテストで担保するか）を明記。Folder アイコン撤去に伴い separator カウントの「Folder 除外」前提が消える点を新テストに反映。

---

#### 良い点

- 影響範囲を presentation 層内に正しく限定し、ドメイン/ユースケース/アダプターに波及しないと判断できている（`directoryAncestorSegments` / `BreadcrumbSegment` 不変、データ供給ロジック据え置き）。実コードと一致。
- `DirectoryBreadcrumb` を `onClear` 廃止後に純表示 server component 化し `"use client"` 不要、という判断は正しい（現 `FilterBar` が client なのは optimistic のため。パンくず自体は state を持たない）。
- 「location 語彙（nav + aria-current）と filter 語彙（チップ + ×）を混ぜない」という #710 ADR-002 の方向性を踏襲・強化し、フォールバックチップだけ filter 行に残す棲み分けは語彙的に筋が通っている（AC-6）。出現条件が排他（解決可/不可）で同時に出ない点も正しく押さえている。
- #710 ADR-001/002 の該当部分を supersede 記録する方針（AC-8）を明示し、過去の意図的判断の上書きを「盲目的模倣でなく ADR を伴う」形で扱っているのは規約に忠実。
- 末尾を `aria-current="page"` 非リンク `<span className="text-ink-secondary">` に揃える点は、揃える先 `NoteBreadcrumb`（L62）の実装と完全一致しており、対称化の核心は正確。

---

#### 総評

要件（末尾 × 廃止・現在地非リンク化・見出し上配置・語彙統一）を満たす方向性は妥当で、AC-1/2/3/6/8 系の設計は実コードと整合する。**ただし配置移動（AC-4）の実現手段＝ADR-003 が中核的に依拠する「`cache()` の同一レンダー dedup」前提は、HomePage 自身の JSDoc が明言する「reference identity キー」と矛盾しており、現状の呼ばれ方では二重 I/O を確定的に招く（P-001）。** その結果、新 async server component + 専用境界の新設（ADR-003/P-002）は二重 I/O を抱えた過剰設計になりかねない。`notesQuery` で既に確立している「1 箇所生成・同一参照配布」パターンに倣い、tree/セグメントを 1 回算出して見出し上パンくずと FilterBar の双方へ props で渡す案（P-002 案Y、または FilterSection 内でセグメント算出済みの現状を活かす案X）を本命にし、ADR-003 を再構成することを強く推奨する。
