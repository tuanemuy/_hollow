# PR #784 レビュー — Frontend（React hook / コンポーネント設計 / a11y / フォーカス管理）

レビュー対象: `app/components/common/useRovingTablist.ts` / `app/components/tag/TagListToolbar.tsx` / 新規 `app/components/common/__tests__/useRovingTablist.test.tsx` / `app/components/tag/__tests__/TagListToolbar.test.tsx`
照合: `.issue/781/plan.md` AC-1〜AC-4 / `adr.md` ADR-001・ADR-002 / 先例 `app/components/common/useRovingMenu.ts`
検証実行: `pnpm test:unit`（対象3スコープ）→ 274 files / 4272 tests PASS。3 consumer（`DisplayModeSwitch` / `PublicTopControls` 表示形式 segmented / `EditorModeSwitch`）は diff 無し・`restoreFocusOnCommit` 未指定で後方互換確認済み。

## 結論サマリー

計画（ADR-001/002）に忠実で、`useRovingMenu.restoreFocusOnCommit` の確立済みパターンを automatic variant へ正しく横展開できている。Rules of Hooks 違反なし、復元 effect の3分岐ロジックは2コミット遅延構造を正しく跨ぐ、型は automatic `?: boolean` / manual `?: never` で illegal state を表現不能化、焦点横取りは opt-in + `activeElement===body` の二重ガードで防止、デフォルト off で既存3 consumer は無変更。AC-1〜AC-4 はすべて満たされている。**Blocker・Warning なし。** 設計上許容済みのエッジを Note として記録する。

### Frontend

#### Blockers

なし。

#### Warnings

なし。

#### Notes

- **[N-001]** 復元 effect の3分岐は計画どおり正確。/ 場所: `app/components/common/useRovingTablist.ts:209-224`
  - `(a) activeElement===items[clamped]` → フラグ維持して return（commit-1 で同期 focus が target に乗ったままの局面。フラグを倒さないことで後続 commit-2 の body 脱落を取りこぼさない）、`(c) activeElement!==body` → フラグのみ解除し横取りしない（ユーザーが別所へ意図移動）、`(b) activeElement===body` → `focus({preventScroll:true})` 復元 + フラグ解除。早期 return の順序（`!restoreFocusOnCommit` → `!restorePendingRef.current` → querySelectorAll）により、非オプトイン／非キーボード時は `querySelectorAll` すら走らず実質ノーオペ（AC-4）。`clamped=Math.min(Math.max(selectedIndex,0),len-1)` の上下限クランプも先例同型。先例 `useRovingMenu`（同 `:155-169`）が `open` ゲートで担うスコープを、常時マウントの segmented ではキーボード意図フラグで代替する設計判断が正しく実装されている。dep 配列なし post-commit + body ガード + preventScroll の対称性も保たれている。

- **[N-002]** 「永続フラグ」極端ケースは ADR-002 Consequences で明示・許容済み。/ 場所: `app/components/common/useRovingTablist.ts:217`（branch (a)）
  - 分岐 (a) は focus が target に乗り続ける限りフラグを保持するため、「キーボード操作後に一度も body 脱落が起きない」局面（例: `run()` の `catch` でナビゲーションが superseded され body 脱落を伴わず revert する経路）ではフラグが消費されず残り、後続の無関係な body 脱落コミットが活性化して焦点を引き戻しうる。ただし対象 `TagListToolbar` では矢印選択が常に別 `sort` → `loaderDeps` 変化 → 必ず RSC 再レンダーで body 脱落するためフラグが消費され、実害なし。automatic + opt-in 限定なので他 consumer へは型・early-return で波及しない。ADR-002 の許容判断は妥当で、追加対応は不要。WHY も hook JSDoc（`:197-208`）に記述済み。

- **[N-003]** window blur + フラグ立ち中の復元は「キーボード操作直後」スコープ内で許容範囲。/ 場所: 同 effect `:218-223`
  - 矢印押下（フラグ立ち）→ loader 確定前に window blur → コミット時に `activeElement===body` で復元、というシーケンスは理論上ありうるが、ユーザーが直前に矢印で選択した radio へ focus が戻るだけで、キーボード意図フラグが立っている = 「今キーボード操作の最中」のスコープ内であり、横取りとは言えない。`preventScroll:true` でスクロール飛びも防止。手動テスト TC-EDGE-1（矢印未操作時の非横取り）も PASS。問題なし。

- **[N-004]** onKeyDown の同期 `focus()`（`:185`）は `preventScroll` を付けず、復元 effect（`:222`）のみ付ける非対称があるが、前者は #776 既存挙動で本 PR スコープ外。キーボードナビゲーションの即時 focus はスクロールイン期待があり妥当。指摘ではなく確認事項として記録。

- **[N-005]** テストの品質が高い。/ 場所: `app/components/common/__tests__/useRovingTablist.test.tsx`
  - フック直叩きで3分岐（(a) フラグ維持・非横取り / (b) body 脱落で復元しフラグ解除 / (c) 別所移動で解除のみ）を決定的にピン留めし、各分岐で「フラグが正しく解除/維持されたか」を後続の body 脱落 commit で二重に検証（永続フラグ・早期解除の双方を回帰防止）。AC-4（非オプトイン非横取り）も同ハーネスで網羅。`biome-ignore lint/a11y/useSemanticElements` のコメントが `TagListToolbar` の APG Radio Group（button + role="radio"）を模す理由を明記しており CLAUDE.md のコメント方針（WHY のみ）に沿う。`TagListToolbar.test.tsx` の復元テストは navigation を pending に保ち optimistic を再レンダー跨ぎで維持する実フロー（commit-1 → commit-2）を忠実に再現しており、happy-dom の限界を踏まえた組み立てが適切。

- **[N-006]** 型設計の検証。/ 場所: `app/components/common/useRovingTablist.ts:91-114`
  - automatic `restoreFocusOnCommit?: boolean` / manual `restoreFocusOnCommit?: never` で union 両メンバーに宣言。分割代入 `restoreFocusOnCommit = false`（`:134`）は `(boolean|undefined) | (never|undefined) = boolean|undefined` → default 適用で `boolean` となり型安全。manual で `true` を渡すと `never` 非代入で型エラー = illegal state unrepresentable を型レベルで厳密達成。`?: never`（vs `?: false`）の選択理由（明示 `false` 渡しのノイズ回避）も manual variant の JSDoc に記述済み。`pnpm test:unit` 全 PASS（typecheck は別途だが union 分割代入の正当性は plan round-2 で照合済みで本実装と一致）。
