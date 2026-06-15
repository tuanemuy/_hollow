# Plan Review — Issue #743 Round 2（アーキテクチャ整合性・実現可能性・リスク）

レビュー対象: `.issue/743/plan.md`（レビュー履歴含む）/ `.issue/743/adr.md`
視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

---

## 1周目指摘の解消確認

- **[P-001] cache 参照同一性 dedup**: 解消済み。plan のリスク欄・調査結果・設計(b)・ADR-003 がいずれも「`cache()` は引数の参照同一性（`Object.is`）でキー化される／構造同値の別リテラルでは dedup されない」を確定機構として記述し、`HomePage` で `treeQuery = { actorUserId: userId }` を1回作って `HeaderSection`/`FilterSection` に同一参照で配布する `notesQuery` パターンに統一されている。実コードで `loadDirectoryTreeFlat` は `cache()` ラップ済み（`loaders.ts` L309）かつ引数が `{ actorUserId: string }`（L315）なので、`treeQuery = { actorUserId: userId }` が**過不足ない完全な引数**で、これを同一参照で渡せば dedup が確実に成立する。round-1 の補強証拠（`SavedViewsList/Page.tsx` L67・L79 が別リテラルで二重 await）も実在を確認、参照同一性ルールの前提は正しい。
- **[P-002] 過剰設計**: 解消済み。新 async server component（`DirectoryLocationSection`）と専用 `<Suspense>`/`SectionErrorBoundary` 境界の新設を撤回し、既存 `HeaderSection`（async server component）内・`ViewSwitcher`(h1) 直前にパンくずを描画、既存「ツールバー」境界を再利用する方針へ全面改稿。round-1 案Y（1箇所生成・同一参照配布）に忠実。
- **[P-003] h1 境界整合**: 解消済み。`fallbackHeading` が静的 h1 を保持して #649 ADR-009 不変条件を維持する点、tree 失敗時に `HeaderSection` 全体が fallback に落ちるトレードオフを ADR-003 Consequences に明記、`directoryId` 未設定時に一覧だけパンくず行が消える非対称も ADR-001/002 Consequences と plan「対称性確認」節に記載。実コードでも h1 は `ViewSwitcher`（`HeaderSection` 内）が唯一保持し、fallback の静的 h1（`HomePage.tsx` L97–101）が存在することを確認。

---

#### 問題点（要修正）

問題点ゼロ。

更新後の設計は実装上正しく、新たな副作用・エッジケースも見当たらない。具体的に検証した点:

- **共有 treeQuery 参照による dedup**: `loadDirectoryTreeFlat` の引数は `{ actorUserId }` のみ。`treeQuery = { actorUserId: userId }` が完全一致の引数オブジェクトで、`HeaderSection`/`FilterSection` が同一参照で呼べば `Object.is` キーがヒットし I/O は1回。`FilterSection` 内の `BulkActionBar` 用 `flat`（L201）も同じ参照経由になるので、ステップ2の「`FilterSection` のインラインリテラルを共有 `treeQuery` へ差し替える」記述と整合する。確実。
- **HeaderSection の tree 依存**: 既存 `Promise.all`（`HomePage.tsx` L144–150）に `loadDirectoryTreeFlat(treeQuery)` を1要素足すだけで、`directoryAncestorSegments(flat, search.directoryId)` は `FilterSection`（L181–184）と同型に算出できる。`search` は既に `HeaderSection` に渡っている（L153 で `ViewSwitcher` に使用）ので追加 props も不要。実現性に問題なし。
- **見出し直前への描画**: `ViewSwitcher` は単独で `<div className="mb-[10px]"><h1>`（`ViewSwitcher.tsx` L116・L128）を返すので、その直前に `segments.length > 0` 条件で `<DirectoryBreadcrumb segments={...} />`（`nav` 自身が `mb-6`）を挿むと、詳細 `NoteDetail`（L126–128 `<header><NoteBreadcrumb mb-6/><h1 mb-[10px]/>`）と上下対称になる。AC-4 は実装可能。
- **DirectoryBreadcrumb の純表示化**: 現状 `onClear` props を受け `clearDirectory`（client optimistic）に依存するが、これを削除すれば state を持たない純表示コンポーネントになり、server component の `HeaderSection` から直接描画できる（`"use client"` 不要）。`NoteBreadcrumb`（L36–67）が同型の純表示で先例どおり。妥当。
- **末尾非リンク・root crumb 無しの最終形**: `NoteBreadcrumb` の末尾は `<span aria-current="page" className="text-ink-secondary">`（L62）、区切りは要素間のみ（L50 `index > 0`）+ 末尾前 separator（L61）、root crumb 無し、先頭アイコン無し。`directoryAncestorSegments` が root（`name === ""`）を落とす（`directoryTree.ts` L88–90）ので、`DirectoryBreadcrumb` を同型に書き換えれば末尾＝現在ディレクトリ名の非リンクで揃う。AC-1/2/3 の最終形は揃う先と一致。
- **フォールバックチップのみ残す FilterBar**: 現行 L443–464 は `optimisticDirectoryId !== undefined` で gating し、内側で `segments.length > 0 ? <DirectoryBreadcrumb> : <fallback chip>` を分岐。パンくずブランチを削れば、`optimisticDirectoryId !== undefined && segments.length === 0` のフォールバックチップだけが残る。`segments`（L311 `directorySegments ?? []`）は props 由来なので gating に使える。`directorySegments` props を残す plan の判断は正しい。実現性あり。
- **更新タイミング差**: ヘッダのパンくず（server props、optimistic 非経由）とフィルタ行のフォールバック（optimistic gating）は出現条件が排他（segments 解決可→ヘッダ／不可→フィルタ行）。`directoryId` の optimistic は「解除のみ」（#710 ADR-002）なので、解除遷移中にヘッダのパンくずが前の値で一瞬残っても、フォールバック側は `optimisticDirectoryId === undefined` で消えるだけ。両方同時表示や矛盾表示は起きない。plan のリスク欄・ADR-002 Consequences の整理どおりで、新たなエッジケースなし。

#### 改善提案（検討推奨）

- **[S-001]** ステップ2で `loadDirectoryTreeFlat(treeQuery)` を `HeaderSection` の `Promise.all` に足す際、tree 結果は**パンくず算出にしか使わない**点を明記しておくと良い / 理由: `FilterSection` 側は `flat` を `directoryAncestorSegments` と `BulkActionBar` の両方に使うが、`HeaderSection` 側は `segments` 算出のみ。実装者が「`HeaderSection` でも `flat` を他用途に使うのか」と迷わないよう、用途をパンくず限定と一言添えると実装の取り違いを防げる（設計上の欠陥ではなく、実装ガイドの明確化）。

- **[S-002]** AC-7c（HeaderSection 配置テスト）の検証手段が「テスト可能な範囲で」と曖昧なまま残っている / 理由: round-1 S-003 で分割した AC-7c は、`HeaderSection` が async server component かつ tree/savedViews loader に依存するため、単体での DOM 配置検証（パンくず nav が h1 より前）は loader モックが要りコストが高い。現状 `FilterBar.test.tsx` のような描画テストの先例が `HeaderSection` には無い可能性がある。実装段階で「DOM 順序テストが現実的に書けない」と判明した場合に備え、代替（DirectoryBreadcrumb 単体テスト＋手動ブラウザ確認で AC-4 を担保し、AC-7c は最小限に留める）を許容する逃げ道を plan に一言持たせておくと、テスト工数の読み違いを防げる。これは設計の問題ではなくテスト戦略の現実性に関する注記。

#### 良い点

- round-1 の3指摘（P-001 dedup 機構・P-002 過剰設計・P-003 h1 境界）すべてに対し、確定機構へ書き換え＋ADR Consequences への明記まで一貫して反映できている。特に dedup を `notesQuery` の「1箇所生成・同一参照配布」へ統一した点は、プロジェクト確立済みパターンに忠実で実装者の迷いが少ない。
- `loadDirectoryTreeFlat` の引数が `{ actorUserId }` 単体である事実と `treeQuery` の構成が完全一致しており、共有参照 dedup が確実に成立する（部分一致や追加フィールドによる参照ズレの余地がない）。
- 影響範囲を presentation 層内に正しく限定（ドメイン/ユースケース/アダプター不変、`directoryAncestorSegments`/`BreadcrumbSegment` 据え置き）。新 loader を作らず `loadDirectoryTreeFlat` を再利用する判断も最小スコープで妥当。
- location 語彙（ヘッダのパンくず）と filter 語彙（フィルタ行のフォールバックチップ）の棲み分け、出現条件の排他性、更新タイミング差の実害なし、までエッジを押さえている。#710 ADR-001/002 の supersede 記録も規約に忠実。
- 詳細との対称性が `directoryId` 有り時のみ成立し無い時は一覧だけパンくず行が消える非対称を、隠さず Consequences に受容として明記している（過度な対称化に走らない判断）。

---

#### 総評

1周目の中核指摘（cache dedup 機構の誤り・新 async component / 専用境界の過剰設計・h1 境界整合）はいずれも正しく解消され、更新後の設計は実コードと整合する。共有 `treeQuery` 参照による dedup は `loadDirectoryTreeFlat` の引数形状と一致して確実に成立し、`HeaderSection` への tree 依存追加というトレードオフ（tree 失敗時にツールバーも fallback、ただし `fallbackHeading` で h1 保持）も許容範囲として明記済み。新たな副作用・未整理エッジケースは見当たらない。**問題点ゼロ**。残る改善提案2件はいずれも実装ガイド／テスト戦略の現実性に関する軽微な注記で、設計の妥当性を損なうものではない。
