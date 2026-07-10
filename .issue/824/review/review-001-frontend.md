# Frontend / React 設計・RSC 境界・再レンダーレビュー — PR #828 (Issue #824)

**対象:** `EditorTitleContext.tsx` / `HeaderCenter.tsx` / `AppShellDrawer.tsx` / `Header.tsx` / `useEditorTitleSync.ts` / `NoteEditor.tsx` / `styles.ts` + tests
**視点:** Frontend / React 設計・RSC 境界・再レンダー churn
**レビュー日:** 2026-07-10

## 総評

ADR-001〜006 の設計意図が忠実に実装されている。value/setter の二重 context 分離（ADR-003）、"children as prop" churn 封じ込め（ADR-006）、RSC payload 内 client island による context consume（ADR-001、`MenuButton`/`DrawerCtx` と同型）、effect の push/cleanup（ADR-005）、grid truncation の二段 `min-w-0`（ADR-004）はいずれも正しく成立している。AC-1〜AC-8 を満たす。**Blocker はなし。** 実装コード・ランタイム React ツリー・RSC 境界を追った結果、churn 封じ込めが load-bearing な不変条件として実際に機能することを確認した。

### Frontend

#### Blockers

なし。

#### Warnings

- **[W-001]** 共有中央 grid アイテムへの `min-w-0` 追加が、編集画面に限らず**全 `/_app` ページ**のヘッダー中央トラックの縮小挙動を変える。
  - 場所: `HeaderCenter.tsx:30`（`${SEARCH_BOX_WRAPPER} min-w-0`）
  - 理由: 従来、中央 grid アイテム（`SEARCH_BOX_WRAPPER`）は `min-w-0` を持たず、`grid-cols-[auto_1fr_auto]` の `1fr`＝`minmax(auto,1fr)` の最小値は検索 `<input>` の intrinsic min-content（`size` 由来のおよそ 170〜200px）だった。`min-w-0` により中央トラック最小値が 0 になるため、狭幅時に検索ボックスが input intrinsic 未満まで縮む。これは ADR-004 が要求する編集画面 truncation のために必須で、かつ狭幅モバイルでのヘッダーオーバーフローを解消する**改善方向**の変更だが、AC-5 が明示する差分（「inert な wrapper div が 1 段増えるのみ」）には含まれておらず、**title=null の全ページの共有ヘッダーの縮小挙動そのものを変える**点が AC-5 の文言範囲を超える。
  - 影響評価: manual-test で `/`・`/settings` を 390px で回帰確認済み。ただし 390px は左右列＋gap を差し引いても中央トラックが input intrinsic を上回るため、この delta は顕在化しない幅。delta は極狭幅（〜360px 未満）や左右列が広いページでのみ現れる。実害はほぼ無い（むしろ overflow 防止）が、共有インフラの挙動変更である旨を PR 記述/AC-5 に一言添えると回帰判定の実態と一致する。
  - 提案: 実害なしと判断するなら AC-5 の caveat を「inert wrapper div 追加＋中央グリッドアイテムの `min-w-0` による最小幅解放（狭幅で検索が input intrinsic 未満に縮み得る、overflow 防止方向）」へ明文化。コード変更は不要。

#### Notes

- **[N-001]** churn 封じ込めが二重に正しく成立している（設計の要）。
  - `EditorTitleProvider`（`EditorTitleContext.tsx:43-52`）は自 `useState` を持ち `setTitle` で自身が再レンダーするが、`{header}`＋`<main>{children}</main>` を `AppShellDrawer.tsx:193-217` で生成し **`children` prop として透過**しているため、provider の自 state 再レンダーでは `children` の element 参照が変わらず React が subtree をスキップする（ADR-006 の "children as prop" bailout）。`AppShellDrawer.tsx:188-192` にこの不変条件のコメントが残されており、将来の inline 化回帰への防波堤になっている。良い。
  - さらに value/setter を別 context に分離（`EditorTitleContext.tsx:25-28`、setter provider を外・value provider を内にネスト）。`NoteEditor` は `useEditorTitleSync` → `useSetEditorTitle`（setter context のみ）を購読するため、キーストロークごとの value churn は `NoteEditor` に伝播しない。value churn を read するのは `HeaderCenter`（1 島）のみ。ADR-003 の主張どおり。
  - 確認: title 変化 → `NoteEditor` は自 reducer（controlled input）で再レンダーするが（不可避、ADR-003 の注記どおり）、context value churn は上乗せされない。`EditorTitleContext.test.tsx:70-99` が setter 参照安定を明示的に検証しており、effect 再実行が title 変化時のみに抑えられることを担保している。

- **[N-002]** RSC 境界の構成が既存実証パターンと完全同型で正しい。`Header`（server、`renderServerComponent(<Header />)` で RSC payload 化、`_app/route.tsx:79`）が server の検索 `<form>` を client island `HeaderCenter`（`Header.tsx:29-47`）へ `children` として透過し、`HeaderCenter` は `EditorTitleValueCtx` を consume する。これは `MenuButton`×`DrawerCtx` と同じ「RSC payload 内 client island が親 client provider の context を購読」構図で、ランタイム client ツリー上は provider の子孫。検索 input は server-render のまま維持され（AC-5）、title の read だけが client 化される最小島。RSC 境界を跨がない。

- **[N-003]** `useEditorTitleSync`（`useEditorTitleSync.ts:17-23`）の effect 分割が正しい。push を deps `[title, setHeaderTitle]` の effect（cleanup なし）に、unmount クリアを deps `[setHeaderTitle]` の cleanup-only effect に分けているため、**キーストローク間の null フラッシュが起きない**（もし単一 effect の cleanup で null 化すると打鍵ごとに null→title の往復が生じる）。setter が安定参照ゆえ cleanup-only effect は mount 時 1 回登録・unmount 時 1 回発火。AC-1（mount 時 initialTitle 即 push）／AC-6（unmount で null）を取りこぼしなく満たす。`useEditorTitleSync(state.title)` は `NoteEditor.tsx:221` で全 hook 呼び出し後・early return なしの位置にあり Rules of Hooks 準拠（L95-221 に component-level の早期 return なしを確認）。

- **[N-004]** 遷移時の unmount/mount ordering に null 取りこぼしなし。編集→編集（別 note）や編集→他ページで、React は置換される旧 subtree の effect cleanup（→null）を先に走らせ、新 subtree の effect setup（→新 title / 非編集なら push なし）を後に走らせるため、最終状態は常に「新 title または null」で、旧 title のリークも stuck-null も生じない。header は `loadAppShell` がキャッシュする永続要素なので、この unmount クリアが AC-6 リーク防止として必須かつ効いている。

- **[N-005]** `hasTitle` 判定（`HeaderCenter.tsx:28`、`title !== null && title.trim() !== ""`）は空文字・空白のみを正しく「タイトルなし」に落とす（新規ノート未入力＝検索 fallback、AC-1/AC-8）。`HeaderCenter.test.tsx:78-82` が whitespace-only を検証。表示は untrimmed `{title}`（L33）だが、`.header-doc` は block かつ `white-space:nowrap`（`truncate`）で先頭/末尾空白は通常の空白畳み込みで視覚に出ないため実害なし。

- **[N-006]** desktop 編集画面でも `useEditorTitleSync` は title を push し、`HeaderCenter` は打鍵ごとに再レンダーする（`.header-doc` は `sm:hidden` で非表示、検索は `data-doc` があっても `max-sm:hidden` が desktop で不発ゆえ表示）。つまり desktop では title を追跡するが描画には出ない無駄な churn が僅かに乗る。ただし churn は `HeaderCenter`（1 島）に限定され、検索 `children` は安定参照で bailout されるため input は再 reconcile されない。CSS-only（ルート/viewport JS 判定なし）方針の必然的トレードオフで、許容範囲。AC-4 は成立（desktop=検索のみ）。

- **[N-007]** `AppShell.tsx`（`Header` を `EditorTitleProvider`/`DrawerCtx` の外で直接描く旧シェル）は現在どこからも import/JSX 使用されていない dead code（grep 済み）。仮に復活させると `MenuButton` の `useDrawer()` が throw する（本 PR 以前からの既存事情）が、`HeaderCenter`/`useEditorTitle` は default `null` で search-only に degrade するため本 PR で状況は悪化しない。スコープ外だが、混乱源として将来的な削除を検討推奨。

- **[N-008]** テスト 3 本（`EditorTitleContext.test.tsx` / `HeaderCenter.test.tsx` / `useEditorTitleSync.test.tsx`）は setter 安定性・value 伝播・title/検索トグル・whitespace・mount/change/unmount を過不足なくカバーし、`NoteEditor` フル mount を要さない harness 駆動（ADR-005 の狙いどおり）。「value churn が `NoteEditor` に伝播しない」「children-as-prop bailout」といった再レンダー不変条件そのものの回帰テストは無いが、これらは unit で検証しづらい構造的性質であり、コメント（`AppShellDrawer.tsx:188-192` / `EditorTitleContext.tsx:37-42`）による不変条件固定で代替されている。妥当。
