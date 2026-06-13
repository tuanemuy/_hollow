# レビュー round-1 — アーキ整合・実現可能性・リスク (Issue #650)

レビュー対象: `.issue/650/plan.md` / `.issue/650/adr.md`
視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

#### 問題点（要修正）

- **[P-001]** `DisplayModeSwitch.select` の早期 return ガード `if (mode === current) return;` と「current を実効モードに揃える（ステップ 5）」の組み合わせで、永続値書き込みが抜けるケースがある
  - 理由: ステップ 5 で `current` を `useEffectiveDisplayMode()`（= 実効モード）に置き換えると、「URL に display 無し・永続値が calendar」の初期表示時に `current === "calendar"` になる。この状態でユーザーがカレンダーをクリックしても `mode === current` で早期 return し、`router.navigate` も `writeDisplayPreference` も走らない。実害は小さい（既に永続値が calendar なので localStorage 値は変わらない）が、より問題なのは逆方向: 「URL `?display=tile`（明示）が乗っていて永続値が list」の状態で current は "tile"。ユーザーが list に戻すと navigate は走るが、これは正常。一方「永続値 calendar・URL 無し」で current=calendar のとき、ユーザーが一度 tile にして再び calendar に戻すと、最後の calendar クリックで早期 return するため URL からは display が消えず（tile のまま残り）表示と URL が food い違う可能性がある。早期 return が「現在の URL 状態」ではなく「実効表示状態」を見るようになることで、navigate 要否の判定基準と URL 実体がズレる。
  - 提案: 早期 return の比較対象を「実効モード」ではなく「URL の生 display 値（`selectDisplayRaw`）と mode の一致」に保つ（=「URL を実際に変える必要があるか」で判定する）、もしくは `current`（active 表示用・実効モード）と navigate ガード用の比較値を分離する。ステップ 5 は「active 表示は実効モード」「navigate 要否は URL 生値ベース」と明記して 2 つの関心を切り分けること。ADR-005 と plan のステップ 5 にこの分離を追記すべき。

#### 改善提案（検討推奨）

- **[S-001]** `useEffectiveDisplayMode` を `app/components/note/list/` に置く配置は妥当だが、配置の WHY を ADR に一段強く残すとよい
  - 理由: CLAUDE.md は「クロスカット（clock/id/logging）はポート経由」と定めるが、本件の localStorage アクセスはサーバー側の外部リソースではなく純粋なクライアント描画の関心事であり、ヘキサゴナルのアダプター層（`app/core/adapters/`）とは別物。plan/adr ともこの区別を述べており整合的。ただし「なぜ `app/lib/` や共通フックではなく `note/list/` 直下なのか」は「home route 専用（`getRouteApi("/_app/")` ハードコード）でスコープが閉じているから」という理由に依存している。将来 P30/公開一覧へ波及する際に「list 配下のローカルモジュール」だと再利用の置き場所が宙に浮くため、ADR-001 に「現状は home 専用ゆえ list 配下、横展開時は配置を見直す」と明記しておくと後続 Issue の判断が楽になる。スコープ外作業は不要、ADR への 1 文追記のみ。

- **[S-002]** `useEffectiveDisplayMode` の hydration 回避ロジック（`useState(undefined)` + `useEffect`）は React 19/RSC + TanStack Start で機能する見込みで、実現可能性に問題なし
  - 理由: `"use client"` 境界のコンポーネントは SSR 時に初回レンダーされ、`useEffect` はサーバーで実行されず、クライアント hydration 後に初めて走る。初回クライアントレンダーが `persisted=undefined` → 実効 `"list"` でサーバー HTML（`"list"`）と一致するため mismatch は出ない。これは plan/ADR-004 の設計どおりで、`NotePickerDialog.tsx` 等の既存 `useEffect` パターンと同じ流儀。確認事項として: フックの初回戻り値が必ず `"list"`（URL 無指定時）になることをテストで pin する（plan ステップ 6 (c) でカバー済み）。問題なし。

- **[S-003]** `useSearch` の select を `selectDisplayRaw`（`undefined` を返しうる）に差し替えても referential-equality は壊れない
  - 理由: TanStack Router の `useSearch({ select })` は select の戻り値を構造比較（structural equality）でメモ化する。新 selector はプリミティブ（`string | undefined`）を返すため、既存 `selectDisplay`（`string` を返す）と同じく安定する。オブジェクト/配列を返さない限り再レンダー増加はない。plan のリスク欄でも言及済みで認識は正しい。問題なし。ただし `selectDisplayRaw` は `listSelectors.ts` に JSDoc 付きで追加し、「`?? "list"` で潰す前の生値が必要な理由（実効モード判定）」を残すこと（plan ステップ 1 に記載あり、忠実に実装すれば足りる）。

- **[S-004]** `DisplayModeSwitch.test.tsx` の既存 mock はフック導入後も動くが、mock の拡張が必要
  - 理由: 現行 mock の `getRouteApi()` は単一オブジェクトを返し `useSearch({ select })` を `select({ display: currentDisplay })` で評価する。`useEffectiveDisplayMode` も内部で同じ `homeRoute.useSearch({ select })` を呼ぶため mock 自体は流用できる。ただし (1) フックが `selectDisplayRaw`（`s.display` を素通し）を呼ぶと、mock の `currentDisplay` がそのまま渡るので URL 無指定（`undefined`）のテストには `currentDisplay` を `undefined` 可能な型に広げる必要がある、(2) フック内の `useEffect`/`useState` を回すには `act()` でラップした state 更新の確認が要る、(3) `writeDisplayPreference` の localStorage 書き込み検証には happy-dom の `window.localStorage` スタブ（または spy）が要る。plan ステップ 6 はこれらに触れているが、「`useEffectiveDisplayMode` を実コードのまま通すか、フックを mock するか」の方針を明記するとよい。実コードを通す場合 localStorage スタブの初期値制御が必要。実現可能性に支障はない。

- **[S-005]** フラッシュ（1 フレームの list→永続値 切替）の体感は ADR-004 で許容済みだが、`NoteListViews` 以外の実効モード依存箇所の洗い出しを明示するとよい
  - 理由: plan は `NoteListViews`（描画分岐）と `DisplayModeSwitch`（active 表示）の 2 箇所をフックに揃えるとしている。実効モードに依存する箇所が他に無いか（例: ツールバーの「カレンダー専用フィルタ」表示、`HomePage` 側で display を参照する分岐など）を grep で確認し、漏れがあれば同じフックに揃えないと「描画は calendar・別 UI は list 前提」のズレが出る。調査範囲は home route のクライアント群に閉じるためスコープ内。現状コードでは `selectDisplay` の利用箇所が `DisplayModeSwitch` / `NoteListViews` の 2 つに見えるため大きな漏れは無さそうだが、実装前に `grep -rn selectDisplay app/` で再確認する一文を plan に足すと安全。

#### 良い点

- ADR-001（localStorage 採用）の判断が、#219 の「display は usecase に到達しないクライアント描画の関心事」という既存位置づけと完全に整合している。cookie/サーバー永続を採らずドメイン・ユースケース・アダプター・loader へ一切変更を加えない方針は、ヘキサゴナルの依存方向と「内側を汚さない」原則に忠実。過剰なドメイン化を避けつつ Issue 要件を満たす、altitude の合った設計。
- ADR-002 の優先順位（URL > SavedView > 永続値 > 既定）が、既存の `shouldRedirectForSavedView` / `viewQueryToSearch` を一切変更せず「SavedView 経路では URL に display が乗る → 永続値オーバーレイは URL 無指定時のみ発火 → 自動的に (2)>(3) が成立」という形で導出されている点が秀逸。既存ロジックへの侵襲ゼロで優先順位が閉じる設計は、回帰リスクを最小化している。
- ADR-003 の #219 整合が明確で、`homeLoaderDeps` 不変・URL 書き換えなし・loader 非干渉を 3 点とも担保。既存テスト `index.loaderDeps.test.ts` を pin として維持する方針も正しい。
- ADR-004 の hydration 回避（`useState(undefined)` + `useEffect`、初期化子で localStorage を読まない）が React 19/RSC の制約を正確に理解した上で設計されている。リスク欄で「`useState(readDisplayPreference())` のように初期化子で読むと SSR/CSR で割れる」と落とし穴まで明記しており、実装者がミスしにくい。
- 実装ステップが依存方向（純粋ロジック → SSR セーフラッパ → フック → コンポーネント → テスト）に並んでおり、CLAUDE.md の「内側から」原則・純粋関数の単体テスト容易性を踏まえている。`displayPreference.ts` に localStorage アクセスの全分岐（SSR/throw/不正値）を閉じ込め、コンポーネントを純粋に保つ規律も明示されている。
- 受け入れ基準 AC-1〜AC-7 が検証可能な形で書かれ、各 ADR・各ステップに紐づいている。特に AC-6（hydration mismatch なし）・AC-7（localStorage throw 耐性）というエッジケースを基準に昇格させている点が堅実。

---

総評: アーキ整合・実現可能性ともに高水準。要修正は P-001（早期 return ガードと実効モードの混同で navigate 要否判定と URL 実体がズレうる）の 1 点のみ。それ以外は ADR への追記・テスト方針の明示といった軽微な改善提案。
