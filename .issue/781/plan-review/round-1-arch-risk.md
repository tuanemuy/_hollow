# Issue #781 計画レビュー — round 1（アーキテクチャ整合性・実現可能性・リスク）

レビュー対象: `.issue/781/plan.md` / `.issue/781/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク
前提確認: `git show 15446b65:` で #776 適用後の `useRovingTablist.ts` / `TagListToolbar.tsx` を確認。`useRovingMenu.ts`（`restoreFocusOnCommit` 先例）と照合済み。consumer 集合（`EditorModeSwitch` / `DisplayModeSwitch` / `PublicTopControls` / `TagListToolbar`）を `git grep 15446b65` で確認 — 計画の列挙と完全一致。

---

## 結論サマリー

設計の方向性（`useRovingMenu.restoreFocusOnCommit` の確立済みパターンを automatic variant へオプトイン横展開）は正しく、復元メカニズム（キーボード意図フラグ + dep配列なし post-commit effect + `activeElement===body` ガード + 2コミット遅延への対処）は先例と整合しており、ロジックを追っても happy-path・主要エッジケース（初期ロード・window blur・別所移動・cancelled navigation）で破綻しない。アーキテクチャ規約（共有プリミティブの所在、index SSOT 規律、illegal state unrepresentable、最小波及）にも沿っている。

ただし**型レベルで1点、そのまま実装すると `pnpm typecheck` が失敗する具体的欠陥**がある（P-001）。修正は軽微だが、計画の文言（「manual variant には追加しない」＋「分割代入する」）が TypeScript の union 分割代入セマンティクスと矛盾しているため、要修正として明示する。

---

#### 問題点（要修正）

- **[P-001]** `restoreFocusOnCommit` を automatic variant にのみ追加したうえで関数引数で分割代入する、という計画どおりに書くと TypeScript のコンパイルエラー（typecheck 失敗）になる。
  - 理由: 既存フックの引数は `useRovingTablistOptions = UseRovingTablistAutomatic | UseRovingTablistManual` の union を直接分割代入している（`{ ..., onSelect, manualActivation }`）。union を分割代入できるのは**全メンバーに存在するプロパティのみ**。現状 `onSelect` も `manualActivation` も両 variant に宣言されているからこそ成立している。計画（ステップ1「`UseRovingTablistAutomatic` 型に追加（manual variant には追加しない）」＋「フック引数に `restoreFocusOnCommit = false` を分割代入」、ADR-001「manual variant には公開しない」）どおり automatic 側だけに生やすと、`restoreFocusOnCommit` は `UseRovingTablistManual` に存在しないため `{ restoreFocusOnCommit = false }: UseRovingTablistOptions` が `TS2339: Property 'restoreFocusOnCommit' does not exist on type 'UseRovingTablistManual'` になる。スケッチのコメント「automatic variant にのみ追加」をそのまま実装すると型が通らない。
  - 提案: `UseRovingTablistManual` 側に `restoreFocusOnCommit?: never`（または `?: false`）を宣言する。これで(1) union の共通プロパティになり分割代入が通る、(2) manual で `true` を渡す組合せは型エラーになるため ADR-001 が狙う「型で manual+復元を表現不能にする（illegal state unrepresentable）」がむしろ厳密に達成される。`?: never` を推奨（`?: false` だと `restoreFocusOnCommit: false` を明示的に渡せてしまい意味的にノイズ）。計画ステップ1の記述を「automatic に `?: boolean`、manual に `?: never` を追加（destructure 可能にしつつ manual+true を禁止）」に改めること。代替として「分割代入をやめて関数内で `"restoreFocusOnCommit" in options` で読む」方法もあるが、既存の分割代入スタイルと不整合になるため非推奨。

---

#### 改善提案（検討推奨）

- **[S-001]** AC-3 / ADR の「デフォルト挙動は #776 と **byte 等価**」という表現は技術的に不正確。
  - 理由: 非オプトイン consumer でも、新設した dep 配列なし effect は毎コミット生成・実行され（先頭で `if (!restoreFocusOnCommit) return;` により即 return するだけ）、`react` の `useEffect` import と `restorePendingRef` も増える。実行時の観測挙動は同一だが「byte 等価」ではない。レビュー時に「コードが #776 と byte 一致しないので AC-3 違反」と誤判定されうる。受け入れ基準を「非オプトイン consumer に**観測可能な挙動差が無い**（追加 effect は early-return でノーオペ、ARIA/キーボード/フォーカス挙動が #776 と一致）」へ言い換えることを推奨。

- **[S-002]** 復元ロジックの肝（フラグ保持 = commit-1、body 脱落 = commit-2 での復元・解除、別所移動での解除のみ）は happy-dom の consumer テストでは 2 コミット遅延を忠実に再現しづらく、回帰検知力が弱い。
  - 理由: 計画自身がリスク欄で「フラグ解除タイミング誤りで永続フラグ化／早期解除」を最大の落とし穴として挙げている。ところがその分岐を直接固定するテストは「あってもよい（consumer 経由で十分）」と任意扱い。AC-6 の実ブラウザが最終判断とはいえ、CI で回る決定的テストとしてフック直叩きの小さなユニットテスト（`document.body.focus()` で脱落を模擬 → 再 render → 復元 assert／別要素に focus → 横取りしない assert／flag 未セットで何もしない assert）を1本用意し、3分岐をピン留めすると回帰防止が堅くなる。`useRovingMenu` 側に同種フック直叩きテストの先例があれば流用可。

- **[S-003]** 復元先 index の `selectedIndex < 0`（`indexOf` が `-1`）に対するガードが無い。
  - 理由: スケッチは `Math.min(selectedIndex, items.length - 1)` のみで上限クランプ。`selectedIndex` が負（理論上 `optimistic.sort` がリスト外）の場合 `items[-1]` は `undefined` で `?.focus()` がノーオペ（実害は無い）だが、`useRovingMenu` 流に `Math.max(0, Math.min(selectedIndex, items.length - 1))` としておくと意図が明確。現状の TagListToolbar では `sort` は常に妥当なので必須ではない（任意）。

---

#### 良い点

- **先例との対称性が正確**: dep 配列なし post-commit effect / `activeElement===document.body` ガード / `preventScroll: true` を `useRovingMenu`（15446b65 で確認、当該 effect に biome-ignore 無しで lint 通過）から忠実に踏襲。Biome `recommended` は dep 配列を**省略**した effect を `useExhaustiveDependencies` で咎めない（先例が無印で通っている）ため、計画の effect も lint 上の懸念は無い。新規発明ではなく確立パターンの横展開という位置づけが妥当。
- **2コミット遅延構造への対処が正しい**: automatic 経路の同期 `focus()` は commit-1（optimistic、`key={s}` 安定でノード非スワップ→focus 保持）で生き残り、commit-2（RSC 再レンダーでノード再生成→body 脱落）で初めて落ちる。スケッチの「`activeElement===items[clamped]` なら flag 維持して return、body なら復元・解除、それ以外は解除のみ」の順序がこの 2 コミットを正しく跨ぐ。ADR-002 案B（`selectedIndex` dep）/案C（timer）の不採用理由も的確。
- **`useRovingMenu` の `setActiveIndex(clamped)` を盲目コピーしていない**: tablist automatic 経路は復元先が caller 所有の `selectedIndex` 由来で内部 state を持たないため、復元 effect で setState 不要（再レンダーループを誘発しない）。この差分を正しく取り込んでいる。
- **キーボード意図フラグでスコープする判断が妥当**: 常時マウントの segmented には `useRovingMenu` の `open` ゲートが無く、無条件復元は初期ロード/別 island 操作/window blur で焦点横取り回帰を生む。flag 初期値 false により初期ロード effect が即 return し横取りしないこと、click 経路は flag を立てず復元対象外（Issue 要件のキーボード連続操作にスコープ）であることが筋として通っている。
- **後方互換の担保が型と早期 return の二重**: automatic 限定の型公開（P-001 修正後）＋ effect 先頭の `!restoreFocusOnCommit` 早期 return ＋ default off。consumer 集合も `git grep 15446b65` で4ファイルと一致し、実コード変更が `TagListToolbar` 1行のみという波及最小設計（#660 ADR-002 の文化に整合）が正確。
- **AC とステップの対応、スコープ外の切り分け**（EditorModeSwitch=manual・loaderDeps 外、DisplayModeSwitch/PublicTopControls 表示形式=client-only・loaderDeps 外、PublicTopControls ソート=`useRovingMenu` 管轄）が根拠付きで明示され、症状が出ないことの理由が loaderDeps 内/外で一貫して説明されている。
- **実ブラウザ検証（AC-6）を決め手に据える判断**が、happy-dom の focus/再レンダー再現限界と #776 manual-test の知見を踏まえており現実的。
