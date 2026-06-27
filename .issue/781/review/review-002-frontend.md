# PR #784 レビュー（2周目フルレビュー） — Frontend（React hook / コンポーネント設計 / a11y / フォーカス管理）

レビュー対象:
- `app/components/common/useRovingTablist.ts`（復元実装本体）
- `app/components/tag/TagListToolbar.tsx`（オプトイン側）
- `app/components/common/__tests__/useRovingTablist.test.tsx`（フック直叩き、1周目以降にテスト1件追加）
- `app/components/common/useRovingMenu.ts`（先例との同型性確認）

照合: `.issue/781/plan.md` AC-1〜AC-4 / `adr.md` ADR-001・ADR-002 / 1周目 `review-001-frontend.md`

検証実行:
- `pnpm vitest run useRovingTablist.test.tsx TagListToolbar.test.tsx` → 2 files / 31 tests PASS
- `pnpm typecheck`（tsgo）→ PASS（union 両メンバー宣言の分割代入・`?: never` の illegal state 拒否が型レベルで成立）

差分の所在: 本体（`useRovingTablist.ts` / `TagListToolbar.tsx`）は PR head `691f5201` 時点で 1周目レビュー版と**バイト同一**。1周目以降の変更は `useRovingTablist.test.tsx` への**テスト1件追加のみ**（`(AC-4 effect guard)`、現状は未コミットの作業ツリー差分 +18行）。

## 結論サマリー

ADR-001/002 に忠実。`useRovingMenu.restoreFocusOnCommit` の確立済みパターンを automatic variant へ正しく横展開。Rules of Hooks 違反なし、復元 effect の3分岐（2コミット遅延跨ぎ・永続フラグ防止・早期解除）は計画どおり正確、型は automatic `?: boolean` / manual `?: never` で illegal state を表現不能化、焦点横取りは opt-in + `activeElement===body` の二重ガードで防止、デフォルト off で既存3 consumer は無変更。AC-1〜AC-4 を満たす。

追加テスト `(AC-4 effect guard)` は、フラグ立ち中に opt-in を OFF へ切り替え、`if (!restoreFocusOnCommit) return;` が**単独で**横取りを止めることをピン留めする良質な回帰テスト（既存 AC-4 ケースはフラグを立てないため、この early-return をフラグガードから分離して固定できていなかった穴を埋める）。

**Blocker なし。** JSDoc の「why not reuse」根拠文に本 PR の追加と矛盾する記述が1件あるため Warning として記録する。

### Frontend

#### Blockers

なし。

#### Warnings

- **[W-001]** 「why not reuse `useRovingMenu`」の根拠 JSDoc が、本 PR が追加した復元と内部矛盾している。
  - 場所: `app/components/common/useRovingTablist.ts:16-19`
  - 内容: 「`useRovingMenu` … carries **focus-restore** / disabled-item concerns **a segmented control never needs**」と断定しているが、同ファイルは本 PR で segmented control 向けの opt-in 復元（`restoreFocusOnCommit`、`:53-63` / `:197-224`）を**まさに追加した**。「segmented control は focus-restore を一切必要としない」という WHY は、同一ファイル下部の実装と読み手レベルで矛盾する。
  - 理由: これは設計判断の核（「なぜ別フックか」）を支える load-bearing な根拠コメント。将来の保守者が「このフックに復元は無い／不要」と誤読し、`restoreFocusOnCommit` 経路の存在を見落とす/重複実装するリスクがある。本タスクが明示的に問う「JSDoc の WHY 妥当性」の観点で、ここだけ実装に追従できていない。disabled-item 概念が不要なのは正しいが、focus-restore は不要ではなく「menu の `open` ゲート型・`panelRef` 駆動の復元機構が segmented には合わず、別スコープ（キーボード意図フラグ）の復元を内製した」が正確な WHY。
  - 提案: 当該文から focus-restore を「不要」リストから外し、機構の差として言い換える。例: 「… and carries an **open-gated, `panelRef`-driven** focus-restore and disabled-item concerns that don't fit a segmented control — the segmented control instead opts into its own keyboard-intent-scoped restore (see below).」 同段落 `:21-22` の「focus-restore invariants（既存 call site を壊しうる）」は menu 側の話なので保持で良い。挙動・型に影響しない doc-only 修正。

#### Notes

- **[N-001]** 復元 effect の3分岐は計画どおり正確。/ 場所: `useRovingTablist.ts:209-224`
  - `(a) activeElement===items[clamped]`（`:217`）→ フラグ維持して return（commit-1 で同期 focus が target に乗ったままの局面。倒さないことで後続 commit-2 の body 脱落を取りこぼさない）、`(c) activeElement!==body`（`:218-221`）→ フラグのみ解除し横取りしない、`(b) activeElement===body`（`:222-223`）→ `focus({preventScroll:true})` 復元 + フラグ解除。早期 return 順（`!restoreFocusOnCommit` → `!restorePendingRef.current` → querySelectorAll）により非オプトイン／非キーボード時は `querySelectorAll` すら走らずノーオペ（AC-4）。`clamped=Math.min(Math.max(selectedIndex,0),len-1)` の上下限クランプも先例同型。`useRovingMenu`（`:155-169`）が `open` ゲートで担うスコープを、常時マウントの segmented ではキーボード意図フラグで代替する設計が正しく実装されている。dep 配列なし post-commit + body ガード + preventScroll の対称性も保たれている。

- **[N-002]** 「永続フラグ」極端ケースは ADR-002 Consequences で明示・許容済み。/ 場所: `useRovingTablist.ts:217`（branch (a)）
  - 分岐 (a) は focus が target に乗り続ける限りフラグを保持するため、「キーボード操作後に一度も body 脱落が起きない」局面ではフラグが残り後続の無関係 body 脱落で活性化しうる。ただし対象 `TagListToolbar` は矢印選択が常に別 `sort` → `loaderDeps` 変化 → 必ず RSC 再レンダーで body 脱落しフラグが消費されるため実害なし。automatic + opt-in 限定なので他 consumer へは型・early-return で波及しない。ADR-002 の許容判断は妥当。追加テスト (b)/(c) がフラグ解除（永続化防止）を後続 body-drop commit で二重に検証している。

- **[N-003]** 先例 `useRovingMenu` との同型性は維持されている。/ 場所: `useRovingMenu.ts:155-169` ↔ `useRovingTablist.ts:209-224`
  - 共通: dep 配列なし post-commit effect、`activeElement===document.body` ガード、`Math.min(...)` クランプ、`focus({preventScroll:true})`。差分は計画どおり意図的: (1) menu は `open` ゲート、tablist はキーボード意図フラグ（常時マウント故のスコープ代替、ADR-002）、(2) menu は `clamped!==activeIndex` で `setActiveIndex` 同期（caller state が hook 内）するが、tablist は index が完全 caller 所有（`selectedIndex`）のため state 同期不要 — 設計差として正しい。公開コントラクト（`restoreFocusOnCommit?: boolean`）も命名統一。

- **[N-004]** 復元 effect のセレクタ `'[role="radio"],[role="tab"]'`（`:212-214`）は onKeyDown（`:182-184`）と一致。`[role="tab"]`（manual/Tabs）は `restoreFocusOnCommit` を `?: never` で渡せないため復元経路には決して到達しないが、onKeyDown とセレクタを揃えることで「どちらの role でも focus executor として機能する」規律を保つ意図。dead だが無害で、一貫性の観点ではむしろ妥当。指摘ではなく確認事項。

- **[N-005]** `TagListToolbar` 側のオプトインは最小・適切。/ 場所: `TagListToolbar.tsx:115-127`
  - `restoreFocusOnCommit: true` の1行追加のみ。コメントが「`sort` は `loaderDeps` 内 → データ駆動 RSC 再レンダーで body 脱落 → 復元で連続矢印を成立（#781）」と WHY を明記。唯一のデータ駆動 automatic consumer に限定されており ADR-001 の意図どおり。

- **[N-006]** 追加テスト `(AC-4 effect guard)` の価値。/ 場所: `useRovingTablist.test.tsx:193-209`（未コミット差分）
  - フラグ立ち（pressArrowRight）後に `commit(0, false)` で opt-in を OFF にし body 脱落させ、`if (!restoreFocusOnCommit) return;` が単独で横取りを止めることを固定。既存 `(AC-4)` ケースはフラグを立てないため `!restorePendingRef.current` ガードで止まり、opt-in early-return を分離検証できていなかった。このミューテーション（opt-in ガード削除）を捕捉する穴埋めとして適切。コメントも WHY（どのガードを単独でピン留めしているか）を明記しており CLAUDE.md のコメント方針に沿う。なお現状は作業ツリーの未コミット差分なので、PR への取り込み（コミット）を要確認。

- **[N-007]** onKeyDown の同期 `focus()`（`:185`）は `preventScroll` 無し、復元 effect（`:222`）のみ付ける非対称。前者は #776 既存挙動で本 PR スコープ外（キーボードナビゲーションの即時 focus はスクロールイン期待があり妥当）。1周目 N-004 と同旨、再掲のみ。
