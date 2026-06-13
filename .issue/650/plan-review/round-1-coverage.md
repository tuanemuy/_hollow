# Round 1 レビュー — 要件カバレッジ・スコープ整合性（Issue #650）

レビュー視点: Issue 本文・#626 ADR-003 の要件が受け入れ基準に漏れなく落ち、各基準が検証可能で、実装ステップと正しく紐づき、スコープ外作業が混入していないか。

## 結論サマリー

Issue 本文の 3 つの必須要件（永続化と P10 初期表示への適用 / #219 整合 / URL 明示指定 > 永続値の優先順位整理）はすべて受け入れ基準に落ちており、SavedView との優先順位という #626 由来の論点も AC-4 でカバーされている。基準は概ね検証可能で実装ステップとの紐づけも整合している。要修正は 2 件（いずれもテスト・スコープ記述の漏れに起因し、要件解釈そのものは正しい）。

---

#### 問題点（要修正）

- **[P-001]** 実装ステップ 4（`NoteListViews` の `useEffectiveDisplayMode` 化）に伴い破壊される既存テスト `NoteListViews.test.tsx` がテスト計画（ステップ 6）に挙がっていない
  - 理由: `app/components/note/list/__tests__/NoteListViews.test.tsx` は `@tanstack/react-router` を mock し `useSearch({ select })` を直接スタブして `currentDisplay` を注入する構造（L22-35, L64, L84-114）。ステップ 4 で `NoteListViews` が `homeRoute.useSearch` を直接呼ばず `useEffectiveDisplayMode()` 経由になると、この mock では `display` を制御できなくなり、5 ケース（list/tile/calendar/undefined→list/notes forward）が機能しなくなる可能性が高い。ステップ 6 は更新対象として `DisplayModeSwitch.test.tsx` のみを挙げ、`NoteListViews.test.tsx` を「変更なし」扱いにしているため、計画どおり進めると既存テストが壊れたまま放置されるか、ステップ 7 の `pnpm test:unit` で初めて発覚して手戻りになる。AC-2/3/4/6 の「永続値の適用点」がまさに `NoteListViews` であり、ここのテスト整合は要件検証の根幹に関わる。
  - 提案: ステップ 6 の更新対象に `NoteListViews.test.tsx` を明記し、`useEffectiveDisplayMode` 導入後も list/tile/calendar 分岐が検証できるよう mock を調整する（フックを直接 mock するか、URL 値 + localStorage スタブで実効モードを制御する形にする）方針を計画に追記する。

- **[P-002]** `SaveViewDialog.tsx` も `selectDisplay` で `display` を読んでおり、永続値オーバーレイの影響範囲・非影響範囲が計画で明示されていない
  - 理由: `app/components/note/list/SaveViewDialog.tsx`（L48 `const displayMode = homeRoute.useSearch({ select: selectDisplay })`）は「ビューとして保存」時の `displayMode` を URL から読む。これは ADR-005 の意図（URL/SavedView 由来は永続化しない・ユーザー明示選択のみ保存）に照らすと、`useEffectiveDisplayMode`（永続値オーバーレイ）ではなく**現行の `selectDisplay`（URL 素直値）のままにすべき**箇所。だが計画の調査結果（L36-48）と実装ステップは `SaveViewDialog` に一切言及がなく、`selectDisplay` の利用者として `DisplayModeSwitch` / `NoteListViews` のみを列挙している。このままだと、(a) 実装者が「`selectDisplay` 利用箇所はすべて実効モードに揃えるべき」と誤解して `SaveViewDialog` まで `useEffectiveDisplayMode` 化すると、URL 無指定 + 永続値 calendar の状態で「保存」した SavedView に意図せず calendar が焼き付き、ADR-005 の不変条件を破る。逆に (b) 何も触れないのが正解だが、計画にその判断根拠が無いためレビュー/実装で揺れる。
  - 提案: スコープ節または調査結果に「`SaveViewDialog` は `selectDisplay`（URL 素直値）を維持し、永続値オーバーレイを適用しない。理由: SavedView は明示的な URL 状態を保存する操作であり、端末ローカルの前回値を焼き付けるのは ADR-005 の意図に反する」を明記する（実装は変更なしで正しい。記述漏れの是正のみ）。

---

#### 改善提案（検討推奨）

- **[S-001]** AC-1 のキー名と「list 以外も保存される」点の検証粒度を上げる
  - 理由: AC-1 は「localStorage（キー `hollow3:noteList:display`）に保存される」と検証可能に書けているが、ステップ 6 の `DisplayModeSwitch.test.tsx` 更新は「キーへ書き込まれること」のみ。`writeDisplayPreference` が `DISPLAY_MODES` バリデーション（ADR-001 / ステップ 2）を通すため、list/tile/calendar の各値が正しく round-trip する点も AC-1 の本質。`displayPreference.test.ts`（ステップ 6）の round-trip 検証でカバーされる想定だが、AC-1 ↔ ステップ 6 のどのテストがどの側面を保証するかを表に書き分けると、要件カバレッジの追跡性が上がる。

- **[S-002]** AC-4（SavedView 優先）の検証手段が「既存 redirect 経路で自動成立」に依存しており、新規テストでの能動的検証が薄い
  - 理由: AC-4 は ADR-002 のとおり「`viewId` あり時は redirect で URL に display が乗る → 永続値オーバーレイは URL 無指定時のみ発火 → 発火しない」という間接成立で、対応ステップは「4」のみ。`useEffectiveDisplayMode.test.tsx`（ステップ 6）のケース (a)「URL display あり → 永続値無視」がこの不変条件を実質カバーするが、AC-4 の文言（SavedView 文脈）とテストケース (a) の文言（URL display 文脈）が一見対応しない。AC-4 とケース (a) の対応関係を計画に一言補足すると、要件→検証の紐づけが明確になる。スコープ的には新規テスト不要の判断で妥当。

---

#### 良い点

- Issue 本文の必須 3 要件が AC に過不足なく落ちている。「URL 明示指定 > 永続値」は **AC-3** で具体値（永続値 calendar・URL tile → tile）付きの検証可能形、「#219 整合」は **AC-5**（`homeLoaderDeps` の display 除外不変・既存テストで回帰担保）、「初期表示適用」は **AC-2** で明確にカバー。Issue に明示されていない SavedView との優先順位も **AC-4** で先回りして整理しており、#626 ADR-003 の議論文脈を正しく汲んでいる。
- 優先順位（URL > SavedView > 永続値 > 既定 list）が ADR-002 で一意に定義され、AC-2/3/4 がその各段を分担して検証する構造になっている。「永続値を URL に書き戻さない」判断（ADR-002/003）により、明示指定との区別が型・経路レベルで担保されており、要件「優先順位整理」を表面的なドキュメントでなく実装制約として落とし込めている。
- スコープ「含まれないもの」（cookie/サーバー永続・SavedView/URL 由来の永続化・home 以外への波及・端末間同期・URL 書き戻し）が明示され、いずれも ADR と紐づいている。特に「P30・公開一覧は home route 専用 (`getRouteApi("/_app/")` ハードコード) のため波及はフォローアップ」は、コード上の事実（`PublicTopControls` / `PublicNoteViews` が独自の `selectDisplay` を持つ）と整合しており、スコープ外作業の混入を正しく防いでいる。
- hydration mismatch（ADR-004）と localStorage 利用不可環境（ADR-001）という、要件の明文ではないが実装の正しさに必須な品質要件を AC-6 / AC-7 として基準化している。`CalendarView` の `typeof Intl` ガード・`useState(undefined)+useEffect` の hydration 回避策まで先例を引いて具体化されており、検証可能性が高い。
- 既存の `homeLoaderDeps` / `shouldRedirectForSavedView` / `viewQueryToSearch` / loader を「変更しない」と繰り返し明示し、内側レイヤー（domain/usecase/adapter）影響ゼロを宣言している点が、スコープ整合性の観点で堅実。
