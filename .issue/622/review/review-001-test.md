# PR #661 (Issue #622) レビュー — Test 観点

レビュー対象: `app/components/public/__tests__/PublicNoteDetail.test.tsx`（モック拡張＋新規テスト）、計画 `.issue/622/plan.md` ステップ5 / AC-3・AC-4・AC-8 との整合。
検証実行: `pnpm vitest run app/components/public/__tests__/PublicNoteDetail.test.tsx` → 3 件 PASS（既存 2 + 新規 1）を手元で確認済み。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** タグが 1 件しかないフィクスチャでは「各タグが自分のタグだけで `search` を持つ」ことを検証できない
  / 場所: `app/components/public/__tests__/PublicNoteDetail.test.tsx:86`（`tagNames: ["cloudflare"]` 固定）、新規テスト 146-161 行
  / 理由: AC-3 の本質は「クリックしたタグでフィルタされる」こと。実装が誤って `search={{ tags: tagNames }}`（全タグの配列を全リンクに付与）と書かれる回帰が起きても、タグ 1 件のフィクスチャでは `{ tags: ["cloudflare"] }` と区別がつかず検出できない。`tagNames.map((t) => ... search={{ tags: [t] }})` の per-tag 性こそ回帰が入りやすいポイント。
  / 提案: `serverData` スタブの `tagNames` を `["cloudflare", "react"]` 等の複数件にし、`data-search="{&quot;tags&quot;:[&quot;cloudflare&quot;]}"` と `...[&quot;react&quot;]...` がそれぞれ独立した `<a>` に付くことをアサートする（既存テストの `#react`（relatedNotes 由来）と紛れないようタグ名は別にするか、新規テスト内に限定する）。

- **[W-002]** AC-4 のアサーション `toContain('<span class="text-accent">#cloudflare</span>')` は「リンクでない」ことの証明として不完全
  / 場所: `app/components/public/__tests__/PublicNoteDetail.test.tsx:160`
  / 理由: span の存在は確認できるが、「その span が `<a>` に包まれていない」ことまでは保証しない。span を `<Link>` でラップする形の回帰（`<a ...><span class="text-accent">#cloudflare</span></a>`）では緑のまま通過する。現在のテストで relatedNotes/backlinks は空なので `data-search` 付き `<a>` はメタ行タグの 1 件だけのはず — それを利用すれば安価に閉じられる。
  / 提案: 補助アサーションとして `expect(html.match(/data-search=/g)).toHaveLength(1)`（タグ 1 件時）を追加する。W-001 の複数タグ化と併せれば `toHaveLength(tagNames.length)` で「リンクはメタ行タグのみ」が構造的に保証される。

- **[W-003]** 新規アサーションが React の属性出力順・エスケープ表現への厳密一致で、壊れやすさと検出力のトレードオフが暗黙
  / 場所: `app/components/public/__tests__/PublicNoteDetail.test.tsx:155-159`
  / 理由: `<a href="..." class="..." data-search="...">` の完全一致は、モック側の JSX props 並び順（`href` → `className` → `data-search`）と React の `&quot;` エスケープに依存する。モックの props を並べ替えるだけの無関係な変更でこのテストが落ち、失敗メッセージ（長い HTML の toContain 不一致）から原因が読み取りにくい。検出力自体は十分なので Blocker ではない。
  / 提案: 文字列一致を維持するなら現状でも可。より頑健にするなら正規表現（`/<a[^>]*href="\/u\/tuanemuy"[^>]*data-search="[^"]*cloudflare[^"]*"[^>]*>#cloudflare<\/a>/`）か、`linkedom` 等を使わない方針なら属性ごとの部分一致 2 本（`href="/u/tuanemuy"` を含む同一タグ内に `data-search` がある）に分解する。

#### Notes

- **[N-001]** `Link` モックの `search` 対応は計画ステップ5の要件（2周目 S-001 含む）を正確に満たしている。`search && Object.keys(search).length > 0` のガードにより、既存の breadcrumb / author-mini の `search={{}}`（`PublicNoteDetail.tsx:95,109`）では `data-search` が `undefined` → 属性非出力となり、既存テスト「renders both sections...」のアサーション（href 部分一致）を一切壊さない。実際に 3 件すべて緑であることを実行確認した。
- **[N-002]** 回帰検出力のミューテーション確認（机上）: (a) `search` prop を Link から削除 → `data-search` 消失で新規テスト FAIL、(b) 遷移先を `/search` に変更 → href 不一致で FAIL、(c) メタ行タグを span に戻す → `<a ...>#cloudflare</a>` 不在で FAIL、(d) 末尾メタを単純に `<a>` 化 → span リテラル消失で FAIL。AC-3/AC-4 の主要な回帰経路は捕捉できている（残る穴は W-001/W-002 の 2 つ）。
- **[N-003]** AC-4 のセレクタ精度は現状のフィクスチャ構成で担保されている: `RELATED_TAGS` は `text-accent mr-1.5`、メタ行リンクは `text-accent mr-1` で、`<span class="text-accent">`（修飾なし）に一致するのは bottom-meta のタグのみ。さらに新規テストでは `relatedNotes = []` のため偽陽性の余地がない。ただしこの一意性は className 文字列の偶然の差に依存しており、W-002 の補助アサーションがあるとより安全。
- **[N-004]** AC-1（`ml-auto`）・AC-2（hover/transition）・AC-5〜7（トークン）はユニットテスト未追加だが、これは計画のテスト方針（ユニットは AC-3/AC-4 のみ、スタイルはブラウザ確認）どおりであり、docs/test.md のフロントエンド検証方針（見た目はマニュアル/ブラウザ検証）とも整合。`.issue/622/manual-test/results/` に TC-001〜008 全 PASS の証跡があり、タグ 0 件（TC-006）・390px 折返し（TC-007）・ID ベース URL / P30 デグレ（TC-008）までエッジが押さえられている。
- **[N-005]** モックの `search?: Record<string, unknown>` という緩い型は、検証目的（「渡ったこと」の確認）に対して適切な抽象度。実ルーターの JSON シリアライズを再現しない判断は計画ステップ5の明記どおりで、テストの意図がモック実装に書かれているのも良い。

### サマリー

Blocker なし。新規テストは計画ステップ5を忠実に実装し、既存テストを壊さずに AC-3/AC-4 の主要回帰を検出できる。残る検出漏れは「複数タグ時の per-tag search」（W-001）と「span をリンクでラップする形の回帰」（W-002）の 2 経路で、いずれもフィクスチャ拡張＋アサーション 1 本で閉じられる。
