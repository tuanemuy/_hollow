# ADR — Issue #743: ノート一覧ディレクトリパンくずの末尾 × 廃止・現在地非リンク化・配置統一

## ADR-001: 末尾を `aria-current="page"` 非リンク化し、先頭 Folder アイコンを撤去・`nav` に `mb-6` を内包する（root crumb は採用しない）（#710 ADR-001 の一部 supersede）

### Status
Proposed

### Context
#710 ADR-001 は `DirectoryBreadcrumb` を「末尾に『ディレクトリフィルタ解除 ×』を持ち、全セグメントがリンク、先頭に Folder アイコン、余白は呼び出し側が持つ」という形で新設した。これは詳細 `NoteBreadcrumb`（末尾 = `aria-current="page"` の非リンクタイトル、× 無し、先頭アイコン無し、`nav` 自身が `mb-6`、root crumb 無し）と非対称で、末尾 × は #710 ADR-002 自身が認めた「チップ語彙の名残」である。本 Issue #743 はこの非対称を解消する。

論点:
1. 末尾（現在ディレクトリ）をリンクのままにするか、非リンク化するか。
2. 末尾 × を廃止すると「directory のみ解除」導線が失われる。どう担保するか。
3. 先頭 Folder アイコンと `nav` の余白（`mb-*`）を詳細とどこまで揃えるか。

導線担保の選択肢:
- (A) 末尾 × を廃止し、フルリセット「フィルタをすべてクリア」（既存のグローバル clear-all）だけに導線を委ねる。
- (B) 末尾 × を廃止し、先頭に root crumb「すべてのノート」（`<Link search={HOME_SEARCH}>`）を足す。

### Decision
- 末尾セグメントを `<Link>` から `aria-current="page"` の `text-ink-secondary` 非リンク `<span>` に変更し、祖先セグメントはリンクのまま据え置く。`NoteBreadcrumb` の末尾表現に揃える。
- 先頭 Folder アイコン（`LEADING_ICON`）を撤去し、詳細 `NoteBreadcrumb`（先頭アイコン無し）と揃える。
- 余白は `nav` 自身が `mb-6` を持つ方式へ寄せ、詳細の現在地アンカーと対称化する（「余白は呼び出し側が持つ」とした #710 ADR-001 の前提を上書き）。フォールバックチップ側の余白は `FilterBar`（フィルタ行）が別途持つ。
- 導線担保は **(A)** を採用し、**root crumb「すべてのノート」は追加しない**。理由:
  - 揃える先 `NoteBreadcrumb` に root crumb は無く、「`NoteBreadcrumb` パターンに揃える」という本 Issue の方針と最も整合する（root crumb を一覧だけ足すと逆に非対称になる）。
  - root crumb のリンク先 `HOME_SEARCH`（={}) は directory に限らず**他フィルタも全部落とす**ため、既存のグローバル「フィルタをすべてクリア」と機能的に冗長。
  - 「全ノートに戻る」フルリセット導線は既存の clear-all（`NoteListToolbar`）で担保済み。`directoryId` が設定されているとき `hasAnyHomeFilter(search)` が true になるため clear-all は必ず表示される。
- 結果、最終形は実質 `NoteBreadcrumb` と同型（末尾が `noteTitle` ではなく現在ディレクトリ名）。
- これにより #710 ADR-001 の「末尾 × ボタン」「全セグメントリンク」「先頭 Folder アイコン」「余白は呼び出し側」の各前提を本 ADR が supersede する。コンポーネントを新設する（詳細と共有しない）という #710 ADR-001 の中核判断自体は維持する。

### Consequences
- 良い点: 一覧と詳細でパンくずの語彙・末尾表現・先頭表現・配置が一致。location 語彙に統一され、チップ語彙の名残が消える。root crumb を足さないぶんスコープが最小で、Issue 要件（詳細と揃える）に忠実。
- トレードオフ: 「directory だけ外して他フィルタは残す」というピンポイント操作は提供されない。これは Issue 方針3 が許容する範囲で、フルリセットは既存 clear-all で担保済み。`directoryId` 未設定時は一覧だけパンくず行が消える（詳細は常に NoteBreadcrumb がある）非対称が残るが受容する。

---

## ADR-002: 表示位置を `HeaderSection` 内・見出し（`ViewSwitcher` の h1）直前へ移し、location（パンくず）と filter（フォールバックチップ）を分離する（#710 ADR-002 の一部 supersede）

### Status
Proposed

### Context
#710 ADR-002 は「パンくずはチップ列とは別行に置く（フィルタ行内）」と決めた。結果、現在地パンくずがフィルタ群（タグ/日付/公開状態チップ）の下の独立行に埋もれ、詳細の「見出し上の現在地アンカー」と非対称になっている。本 Issue #743 はこの配置を見直す。

問題は「同じ現在地表現なのに、一覧ではフィルタの下＝場所インジケータとして不自然な位置にある」こと。一方、id 解決不能時のフォールバックチップは filter 語彙（×で解除）であり、location 位置に置くと語彙が混じる。

選択肢:
- (A) パンくず・フォールバックチップを丸ごと見出し上へ移す。
- (B) パンくず（location 語彙）だけ見出し上へ移し、フォールバックチップ（filter 語彙）はフィルタ行に残す。

### Decision
**(B)** を採用。
- 現在地パンくず（`DirectoryBreadcrumb`）を、既存の `HeaderSection`（async server component）内で、ページ見出し `<h1>` を内包する `<ViewSwitcher>` の**直前**へ描画する。詳細 `NoteDetail` の `<header><NoteBreadcrumb/><h1/>` 配置と対称化する。
- `segments.length > 0` のときだけ描画し、`directoryId` 未設定や解決不能（空配列）のときは何も描画しない。
- フォールバックチップ（`segments.length === 0`＝削除済み等で id をパンくずに展開できない場合）は filter 語彙なので `FilterBar`（フィルタ行）に残す。`×` 解除も妥当（Issue 方針4）。
- これにより「location は見出し上、filter はフィルタ行」という棲み分けが成立し、#710 ADR-002 の「パンくずをフィルタ行に置く」前提を本 ADR が supersede する。「チップ語彙とナビ語彙を別表現にする」という #710 ADR-002 の中核判断は維持・強化する。

### Consequences
- 良い点: 現在地が場所インジケータに相応しい位置に出て、詳細と一貫する。フィルタ行から location 語彙が抜け、フィルタ行はチップ語彙で統一される。新しい async component や境界を増やさず既存 `HeaderSection` に収まる。
- トレードオフ: directory に関する UI が「ヘッダ上のパンくず」と「フィルタ行のフォールバックチップ」の2箇所に分かれる。ただし両者は出現条件が排他（解決可 vs 不可）で同時には出ないため、ユーザーが混乱する場面は無い。解除遷移中はヘッダのパンくず（server props 由来）とフォールバック（optimistic gating）の更新タイミングがずれうるが、排他なので片方が前の値で残っても実害は無い。

---

## ADR-003: 新 async component / 専用境界は設けず `HeaderSection` に取り込み、tree は共有 `treeQuery` 参照で dedup する

### Status
Proposed

### Context
ADR-002 でパンくずを見出し上へ移すと、セグメント算出に必要な directory tree（`loadDirectoryTreeFlat`）を、これまで `FilterSection` でしか await していなかった位置（ヘッダ）でも参照する必要が出る。

当初案では「現在地専用の薄い async server component を新設し、専用の `<Suspense>` + `SectionErrorBoundary` 境界に置く」「`loadDirectoryTreeFlat` は `cache()` の同一レンダー dedup で二重 I/O にならない」と想定していたが、これは**誤り**だった:

- React `cache()` は引数を**参照同一性**（`Object.is`）でキー化する。`HomePage` 自身の JSDoc が「React `cache` keys by argument *reference identity*」「a structurally-equal literal per section would double the query」と明記しており、まさにこの理由で `notesQuery` を1箇所で生成し同一参照を各セクションへ配っている。
- `loadDirectoryTreeFlat({ actorUserId })` を各セクションが別々のインラインリテラルで呼ぶと、構造同値でも別参照なので dedup されず実 I/O が二重化する。新セクションを別境界で再 await する案は二重 I/O を確定的に抱える。
- 専用境界の唯一の動機（tree 失敗で見出しを巻き込まない）も、新たな二重 I/O を導入してまで守るほどの不変条件ではない。

### Decision
- **新しい async server component も、専用の `<Suspense>` / `SectionErrorBoundary` 境界も設けない。** パンくず描画を既存の `HeaderSection`（async server component）内に取り込み、`ViewSwitcher`(h1) の直前で描画する。
- tree の dedup は **`notesQuery` と同じ「1箇所生成・同一参照配布」パターン**で行う。`HomePage` 本体で `const treeQuery = { actorUserId: userId }` を1回だけ作り、`HeaderSection` と `FilterSection` の双方に同一参照で props として渡す。両セクションが同一参照で `loadDirectoryTreeFlat(treeQuery)` を呼ぶことで `cache()` がヒットし、I/O は1回になる（構造同値の別リテラルでは dedup されない点に注意）。
- `HeaderSection` は既存の `Promise.all` に `loadDirectoryTreeFlat(treeQuery)` を追加 await し、`directoryAncestorSegments(flat, search.directoryId)` でセグメントを算出。`segments.length > 0` のときのみ `DirectoryBreadcrumb` を描画する。
- 境界は既存の「ツールバー」`SectionErrorBoundary` を再利用する。
- `DirectoryBreadcrumb` は `onClear` 廃止後にクライアント状態を持たない純表示コンポーネントになるため、`HeaderSection`（server component）から直接描画でき `"use client"` は不要。

### Consequences
- 良い点: 二重 I/O が発生しない（共有参照で dedup）。新しい境界・async component を増やさず、合成の複雑さが上がらない。プロジェクト確立済みの `notesQuery` パターンに忠実。
- トレードオフ: heading 境界（`HeaderSection`）が新たに tree 依存を含むことになり、tree loader 失敗時は `HeaderSection` 全体（見出し + 件数 + ツールバー）が fallback に落ちる。ただし「ツールバー」`SectionErrorBoundary` の `fallbackHeading` が静的 h1 を保持するため、#649 ADR-009 の「ページが h1 を失わない」不変条件は維持される。この「tree 失敗時にツールバーも fallback に落ちる」挙動変化はトレードオフとして受容する。
