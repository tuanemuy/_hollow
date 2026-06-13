# Round 2 レビュー — アーキテクチャ整合性・実現可能性・リスク

**対象:** `.issue/647/plan.md` / `.issue/647/adr.md`
**視点:** プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
**日付:** 2026-06-14
**前提:** 2周目。Round 1 の指摘（P-001〜P-003, S-001〜S-004）の解消確認と新規問題の検出。

---

## 総評

Round 1 の指摘はすべて、実コードに照らして妥当な形で解消されている。特に最重要だった P-001（class component から server fn を呼ぶ経路）は、`onCatch` 注入＋関数コンポーネント側 `useServerFn(reportSectionFailure)` という形に確定し、`useEditLock.ts` の B-001 規約（「the hook never imports the raw server fns directly」）と完全に整合する。前例のない raw 直接 RPC 経路を避けた判断は正しい。配置・テスト・相関・命名の各論点も実コードの確立パターンに乗っている。新たなブロッカーは検出されなかった。

---

## Round 1 指摘の解消確認（実コード照合済み）

- **P-001（解消）**: 計画ステップ2・設計1・ADR-004・リスク欄すべてで「関数コンポーネント `SectionErrorBoundary` で `useServerFn(reportSectionFailure)` を取得し `onCatch` で class `Boundary` に注入。class は観測非依存（`onCatch?.()` のみ）」に確定。実コード `app/components/note/editor/useEditLock.ts` の JSDoc（37行目「the hook never imports the raw server fns directly (PR #7 Round 1 Blocker B-001)」）と引数注入形（`acquireLock`/`extendLock`/`releaseLock` を `useServerFn(...)` 戻り値として受け取る）に完全準拠。現状 `Boundary` は `getDerivedStateFromError`/`getDerivedStateFromProps`/`render` のみで `componentDidCatch` を持たず（実コード57-82行目で確認）、`onCatch?: () => void` を `BoundaryProps` に足して `componentDidCatch` で呼ぶだけ、という最小差分も実コードと矛盾しない。

- **P-002（解消）**: ステップ4・テスト方針に「`serverFnMock.ts` の `serverFnChainStub`/`useServerFnRouter`＋`vi.mock('@tanstack/react-start', …)`＋`vi.mock('../sectionFailureReport', …)` で fn を spy 化（`UserMenu.test.tsx` パターン踏襲）」を明記。実コード `app/components/layout/__tests__/UserMenu.test.tsx`（27-36行目）が同パターンを実証しており、`serverFnMock.ts` の API（`serverFnChainStub`/`useServerFnRouter` のオーバーロード）とも一致。現行 `SectionErrorBoundary.test.tsx` は `@tanstack/react-router` のみ mock（14-16行目）で react-start を mock していないため、boundary に `useServerFn` import が増える分の追加 mock が必要、という計画の認識は正確。

- **P-003（解消）**: `window.location.pathname` を送信時点で取得しズレうる点を ADR-003（53行目）とリスク欄（163行目）に明記し、相関主キーを「時刻近接＋section 名」、route path を補助に格下げ。動的セグメント実値が乗る最小情報原則との緊張も明示。AC-4 の文言も「時刻近接＋route path＋section 名の人手突き合わせ。`cf-ray` は主キーにしない」へ整合済み。

- **S-001（取込）**: `warn` レベルの見え方を運用ドキュメント追記項目（ステップ5・145行目）に追加。`errorResponseMiddleware.logServerError` が `kind: "system"|"unknown"` のみ `error` で出す（実コード39-48行目で確認）ことと対比し、`error` だけ追うと見落とす旨をクエリ例に level/event 込みで書く方針。妥当。

- **S-002（取込）**: meta タグを `kind: "section_failure"` → `event: "section_failure"` に変更し ADR-005 を新設。`logServerError` の meta が `{ kind, code, message, cause }`（実コード60-65行目）で `kind` を SerializedError 語彙に使っていることと衝突回避する判断は実コードと整合。

- **S-003（取込）**: 同時多発時の総量が「1ページあたり境界数で bounded」である点をリスク欄（162行目）に明記。完全自動の総量抑止はスコープ外と明示。

- **S-004（取込）**: `scope ?? "page"` を送信ペイロード確定時に解決する旨をステップ2（115行目）・設計（77行目）に明記し、テスト検証項目（170行目）も追加。実コードの `SectionErrorBoundary` デフォルトが関数引数デフォルト（129行目 `scope = "page"`）で、注入経路で undefined が漏れうる懸念に正しく対処。

---

#### 問題点（要修正）

問題点ゼロ。

Round 1 の全指摘が実コードの確立パターンに照らして妥当に解消されており、新規のアーキテクチャ違反・依存方向逆転・実現不能な経路は検出されなかった。配置（`app/components/common/sectionFailureReport.ts`）も、実際に server fn が `app/components/*/action(s).ts` に集中している現状（grep で全 client-called POST fn がコンポーネント配下、`core/presentation` 配下は middleware 的 `authGuard.ts` のみ）と一致する。

---

#### 改善提案（検討推奨）

- **[S-001]** `componentDidCatch(error, info)` の引数 `error`/`info` を「受け取るが送らない（最小情報のみ）」ことを、実装時にコードコメントまたはテストの意図として明示しておくと、将来の改変で安易に `error.message` を payload に足す事故を構造的に防げる。
  - 理由: AC-2 の negative assertion（payload が許可キーのみ）はテストで担保されるが、`componentDidCatch` のシグネチャ上 `error`/`info` がスコープ内に見えるため、後続改変で「ついでに stack も送る」誘惑が生まれやすい。スキーマが余剰キーを弾く（plan ステップ1）＋テスト negative assertion で二重に守られてはいるので、これは堅牢化の念押しであり必須ではない。

- **[S-002]** 多重抑止の「直近に報告した section+resetKey の組を覚える」ロジックと、`count`（捕捉ごとに +1 する累積カウンタ）の増分タイミングの関係を、テストで1つ明示ケースとして固定しておくと曖昧さが消える。
  - 理由: plan は「count は丸めた『実報告』回数を数える」（116行目）と書くが、「捕捉ごとに +1」（78行目・114行目）とも書いており、count が「捕捉回数」なのか「実送信回数」なのか文面上わずかに揺れる。同一 resetKey 連続 throw で送信は1回に丸めつつ count が増えるのか据え置きなのか、実装者が一意に読めるよう、ステップ4の「2回目の count が 1 増える」ケース（resetKey を変える）に加えて「同一 resetKey 再 throw で送信なし・count 据え置き（または増加）」のどちらを正とするかを1行で確定させると良い。機能影響は小さい（最小情報の局所カウンタ）。

#### 良い点

- P-001 の解消が「既存規約への準拠」と「テスト容易性」の両方を同時に満たす形になっている。`onCatch` 注入なら class は観測非依存のまま、テストは `useServerFnRouter([[reportMock, reportMock]], reportMock)` で `useServerFn(reportSectionFailure)` を spy に差し替えられる（`UserMenu.test.tsx` と同型）。Round 1 提案の (a) を素直に採った結果、追加の前例作りが一切不要になっている。

- 配置 `app/components/common/sectionFailureReport.ts` の確定が、実コードの現状（client-called POST server fn は全てコンポーネント配下の `action(s).ts`、`core/presentation` 配下は `authGuard.ts` のみ）と完全に一致。`core/presentation` への配置という別案を ADR-004 で明示的に却下しており、二択の解消が実態に裏付けられている。

- redaction 前提（client は redacted 詳細を送れない／送らない）を AC-2 の構造的担保（許可キー4つのみのスキーマ＋negative assertion テスト）まで落とし込み、`errorResponseMiddleware` が唯一の redaction 境界である（実コード冒頭コメント）こととも整合。観測経路を増やしても redaction 規律を崩していない。

- fire-and-forget の不変条件（`void report({ data }).catch(() => {})`、`componentDidCatch` は副作用専用で `render` 不変）が、実コードの `useEditLock.ts` の `releaseLock(...).catch(() => {})`（168-170行目）と同じ best-effort パターンに揃っている。報告失敗が UI を壊さない（AC-6）を構造的に担保。

- `getContainer()` が client-graph safe（実コード `containerStore.ts` 冒頭コメント＋38行目以降）であり、別 POST でも `app/server.cloudflare.ts` の ALS スコープ内で解決される前提が正しい。`logServerError` が同じく `await getContainer()` で logger を引く（実コード59行目）のと同型で、報告 fn の handler 実装が既存パターンの単純な水平展開になっている。
