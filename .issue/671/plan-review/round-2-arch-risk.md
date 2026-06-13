# Round 2 レビュー（アーキテクチャ整合性・実現可能性・リスク） — Issue #671

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
対象: `.issue/671/plan.md` / `.issue/671/adr.md`（基点 `origin/main` = PR #674 反映後）
重点: 1周目で確定した AC-11 の DOM 構造再編（ADR-003 の確定 DOM、Props 拡張 `{facets, resultsCount, countIsLowerBound, children}`）の実現可能性・副作用

総評: 1周目で確定した AC-11 の構造再編は `origin/main` の実コードに照らして**実現可能で副作用がない**。件数のシリアライズ・backdrop/drawer の fixed 配置・SearchSortToggle の children 化のいずれも破綻しない。1周目で問題ゼロだった点（translate 記法・AUTHOR_AVATAR 消費者の網羅）も崩れていない。**問題点（要修正）はゼロ**。

---

## AC-11 構造再編の検証（実コード証拠つき）

### 現在の PublicSearch / SearchFilterDrawer の呼び出し構造

`git show origin/main:app/components/public/PublicSearch.tsx` の `hasKeyword` ブロック:

```tsx
<div className={FILTER_BAR}>
  <div className={FILTER_BAR_LEFT}>
    <div className={RESULTS_COUNT}>
      <strong …>{resultsCount}{countIsLowerBound ? "+" : ""} 件</strong>のノート
    </div>
  </div>
  <div className={FILTER_BAR_RIGHT}>
    <SearchFilterDrawer facets={facets} />
    <SearchSortToggle sort={sort} />
  </div>
</div>
```

`SearchFilterDrawer` は単一フラグメント `<>…</>` を返し、その中身は順に「フィルターボタン」「`activeCount>0` ガード付きチップ行（`ACTIVE_CHIPS`）」「backdrop」「drawer(aside)」。

→ 計画 / ADR-003 の現状診断は**正確**。チップ行が `FILTER_BAR_RIGHT`（`flex items-center gap-2`）の flex アイテムとして `SearchFilterDrawer`（=フィルターボタン）と `SearchSortToggle` の間に挟まり、`ACTIVE_CHIPS` の `pb-3 border-b border-hairline mb-1`（styles.ts:250-251 で確認）が同一行内で効いて上下ずれ・孤立下線が出る。AC-11 のバグは実在。

### Props 拡張で破綻しないか → 破綻しない

- 現 Props は `Readonly<{ facets: readonly PeriodFacet[] }>` のみ。`{ facets, resultsCount, countIsLowerBound, children }` への拡張は純粋な追加であり、`facets` の型・消費箇所（`facetByPeriod` Map 構築）は不変。
- `children` に `<SearchSortToggle sort={sort} />` を渡す形は、`"use client"` アイランドが children として要素を受ける標準パターンで、RSC 境界（サーバー要素を client コンポーネントの children として渡す）として正当。`SearchSortToggle` 自身も client island だが、props は `sort: SearchSort | null`（シリアライズ可能）のみなので RSC シリアライズで問題なし。
- 現状 `FILTER_BAR`/`FILTER_BAR_LEFT`/`FILTER_BAR_RIGHT`/`RESULTS_COUNT` は styles.ts に既存（231-236行）。アイランドはこれらを import して同じ DOM を組むだけで、新規スタイルは不要。`FILTER_BAR` 自体が `flex-wrap` を持つため、件数+ボタン群が横並びになり、チップ行を `FILTER_BAR` の**外（兄弟）**に出せばモック構造に一致する。実現可能。

### 件数表示（RESULTS_COUNT / FILTER_BAR_LEFT）をアイランドに移すことの可否 → 問題なし

- `resultsCount` は `number`（`facetTotal ?? hits.length`）、`countIsLowerBound` は `boolean`（`facetTotal === undefined && nextCursor !== null`）。いずれもサーバーで算出済みのプリミティブで、**RSC → client island の props として完全にシリアライズ可能**。関数・Date・クラスインスタンスを渡すわけではない。
- 件数の算出ロジック（`facets.find(f => f.period === (period ?? "all"))?.count`）はサーバー（`PublicSearch`）に残り、アイランドは確定済みの数値を表示するだけ。サーバー算出値の「受け渡し」に問題は出ない。責務分担（値の供給=サーバー / DOM 組み立て=アイランド）も ADR-003 で明文化済みで整合。
- 補足: アイランドは別途 `useOptimistic` でフィルタ楽観状態を持つが、`resultsCount` はそれと独立した props なので二重管理にならない（件数はローダー確定後に新しい props として降ってくる。これは現状デスクトップ挙動と同一の「件数は確定値・チップは楽観値」という既存トレードオフを維持する）。

### backdrop/drawer の fixed 配置・z-index への影響 → 影響なし

- `DRAWER_BACKDROP = "fixed inset-0 … z-[90] …"`（styles.ts:262-263）、`DRAWER = "fixed top-0 right-0 bottom-0 … z-[100] …"`（styles.ts:264-265）。**両者とも `fixed` + 明示 z-index**。
- `fixed` 要素はビューポート基準で配置され、DOM 上の親（`FILTER_BAR_RIGHT` 内 → アイランドのフラグメント直下）が変わっても視覚位置・スタッキングは不変。ステップ6 で backdrop/drawer をフラグメント末尾に置く構造（ADR-003 の DOM 3,4 番）は現状と同じ「アイランドのフラグメント直下」であり、DOM 位置の実質的な移動すらない。計画「リスクと注意点」の「backdrop/drawer は従来どおり `fixed` で body 直下相当」という注記は正しい。z-index の衝突も発生しない。

---

## 1周目で問題ゼロだった点が崩れていないかの再確認

### translate 記法 / max-sm: バリアント方式（ADR-002）→ 崩れていない

- 1周目で `tailwindcss@4.3.1` 実機コンパイル検証済み（translate 系は CSS 変数で軸独立合成、`max-sm:translate-x-0` 併記必須、`max-sm:data-[open]:translate-y-0` の後勝ち）。2周目では plan/ADR の当該記述に変更がなく、`DRAWER = "… translate-x-full … data-[open]:translate-x-0"`（styles.ts:264-265）という改変対象の現状も 1周目時点と同一。前提は維持されている。

### AUTHOR_AVATAR 消費者の網羅（ADR-001）→ 崩れていない

`origin/main` の実コードで全消費者を再確認:
- `styles.ts:158` `AUTHOR_AVATAR`（定義元、`w-7 h-7` 込み）
- `styles.ts:254` `ACTIVE_CHIP_AVATAR`（`w-4 h-4 text-[8px]`）
- `styles.ts:292` `TOKEN_AVATAR`（`w-4 h-4 text-[8px] shrink-0`）
- `styles.ts:307` `SUGGESTION_AVATAR`（`w-5 h-5 text-[9px] shrink-0`）
- `PublicSearch.tsx` 検索ヒット行（`${AUTHOR_AVATAR} w-[18px] h-[18px] text-[9px]`）
- `PublicNoteDetail.tsx:112`（直接 `AUTHOR_AVATAR` = 28px 期待）

計画ステップ1-2 の列挙（4 + 詳細1）と完全一致。漏れなし。`AUTHOR_AVATAR_MD` 新設で詳細の 28px を維持する方針も妥当。1周目評価は維持。

### テスト Props 拡張への追従（ステップ7）→ 計画に織り込み済み・整合

`SearchFilterDrawer.test.tsx`（origin/main）は 3 ケースとも `<SearchFilterDrawer facets={FACETS} />` で render している。Props を `{facets, resultsCount, countIsLowerBound, children}` に拡張すると、`children` を必須にした場合は 3 箇所すべての render 呼び出し更新が必要。計画ステップ7 は「Props 拡張に合わせて render 呼び出しを更新する」と明記しており、織り込み済み。実装時に `children` を optional にするか必須にするかで更新範囲が変わる点のみ S-001 で補足する。

---

## 問題点（要修正）

問題点ゼロ。

AC-11 の構造再編は `origin/main` 実コードに対して実現可能で、件数のシリアライズ・fixed 配置・children 化のいずれにも副作用は見つからなかった。1周目で問題ゼロだった点の崩れもなし。実装不能な記法・アーキテクチャ違反・見落とされた消費者は存在しない。

## 改善提案（検討推奨）

- **[S-001]** ステップ6 の Props 拡張で `children`（および `resultsCount`/`countIsLowerBound`）を**必須**にするか optional にするかを 1 行で確定しておくと、テスト更新（ステップ7）とアイランドの分岐が一発で揃う
  - 理由: `SearchFilterDrawer` は `hasKeyword` 時にしか描画されない（`PublicSearch` 側ガード）ため、件数・children は常に供給される。よって 3 props とも必須にして型で欠落を防ぐのが素直で、`children` 欠落時のフォールバック分岐も不要になる。ただし必須化するとテストの 3 render 呼び出しすべてに `resultsCount`/`countIsLowerBound`/`children`（`<SearchSortToggle>` のモック含む）を渡す必要が出る。テストは `@tanstack/react-router` を `vi.mock` しているので `SearchSortToggle` を children として渡すには同コンポーネントの依存もモック圏内かを確認しておくとよい（`SearchSortToggle` は client island で router 依存のはずなので、`getRouteApi`/`useRouter` の既存モックでカバーされる見込みだが、render エラーを避けるため一度確認推奨）。設計の欠陥ではなく、実装着手時のブレ防止のための粒度確定。

- **[S-002]** ステップ6 のアイランド再編後、`FILTER_BAR_LEFT` を import する所有者が `PublicSearch` から `SearchFilterDrawer` に移る点を、import の付け替え漏れが起きないよう実装メモに残すとよい
  - 理由: 現状 `FILTER_BAR`/`FILTER_BAR_LEFT`/`RESULTS_COUNT` は `PublicSearch.tsx` が import し、`FILTER_BAR_RIGHT` も同様。アイランドに DOM 組み立てを移すと、これらの import は `SearchFilterDrawer.tsx` 側に必要になり、`PublicSearch.tsx` 側からは（チップ行・filter-bar を持たなくなるため）不要になる。`RESULTS_COUNT` の `<strong className="text-ink font-semibold">` のインラインユーティリティもアイランドへ一緒に移動する点を忘れない。biome の未使用 import 検出で気付けるが、ステップに一言あると安全。設計上の問題ではなく作業漏れ防止。

## 良い点

- **AC-11 の確定 DOM が実コードと正確に対応している。** ADR-003 の確定 DOM（filter-bar 行 → 兄弟チップ行 → backdrop → drawer の縦並び）は、現状アイランドが返すフラグメントの要素順（ボタン → チップ行 → backdrop → drawer）と `PublicSearch` の `FILTER_BAR` 構造をそのまま統合した形で、最小の構造移動で実現できる。新規スタイル定数ゼロ・既存定数の再配置のみ。
- **件数のシリアライズ境界を正しく扱っている。** `resultsCount`(number)/`countIsLowerBound`(boolean) という確定済みプリミティブだけを props で渡し、算出ロジックはサーバーに残す責務分担は RSC の原則（serializable props only）に厳密に従っている。`serverData` 経由のローダー値をそのまま client に流すわけではなく、`PublicSearch` で算出した派生値を渡す点も明確。
- **fixed 配置の不変性を根拠つきで担保。** backdrop/drawer がともに `fixed` + 明示 z-index であることを実コードで確認でき、DOM 位置の移動が視覚・スタッキングに影響しないという計画の主張が裏付けられた。チップ行移動による z-index リグレッションの懸念は構造上発生しない。
- **楽観状態の単一アイランド保持を維持。** チップ行を別アイランド化（楽観二重管理）や portal（SSR 煩雑）を退け、件数のみ props で受けてフィルタ楽観状態は従来どおりアイランド内に保つ設計は、`useOptimistic` のちらつき回避という非機能要件と件数のシリアライズ要件を両立させており、1周目評価を維持できる。
- **1周目で問題ゼロだった技術前提が 2周目でも崩れていない。** translate 記法・AUTHOR_AVATAR 消費者の網羅は実コード再確認でも維持されており、構造再編の確定によって新たな破綻が生じていない。
