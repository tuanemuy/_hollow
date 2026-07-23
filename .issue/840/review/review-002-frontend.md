# レビュー #840 PR #845 — Frontend 観点 (review-002 / round 2 フル再レビュー)

対象: `app/components/note/editor/InlineEditor.tsx` / `app/components/note/editor/__tests__/inlineEditor.test.tsx`
計画: `.issue/840/plan.md` / ADR: `.issue/840/adr.md`
前回: `.issue/840/review/review-001-frontend.md`（W-001 の反映確認）
検証: `pnpm vitest run inlineEditor.test.tsx` → **52 passed**

## 総評

候補 B（snapshot 追従）＋候補 C（プレースホルダ `<br>` 許容）＋ P-001 reconciliation の 3 点が計画・ADR どおりに実装されており、受け入れ基準 AC-1〜AC-7 / AC-3′ はコードとテストで満たされている。#233 の保守的 rollback（許可外 mutation→snapshot 全置換復元）の安全機構は基準点を前進させただけで無効化されておらず、IME 合成中・`<pre>` ハイライト中の捕捉ガードは observer コールバックと compositionend の双方で正しいタイミングに置かれている。

round 1 の W-001（4-T8 が reconciliation の onChange 発火経路を実際には踏んでいない = false green）はコミット `310122a6` で**適切に解消**された。span 注入 act 直後の `await flushMutations()` を除去し、`expect(onChange).not.toHaveBeenCalled()`（Step A 後・debounce pending の証明）と `expect(onChange).toHaveBeenCalled()`（reconcile 発火の証明）を追加したことで、reconciliation を無効化すると 4-T8 が red 化する真の pin になった。4-T3（非 `<pre>`）と 4-T8（`<pre>` 経路）が二バッチ構成で一対一に揃っている。

ゼロベースで全経路（reconciliation の比較順序・再入・compositionend rollback 時の reconcile 挙動・候補 C guard のレコード単位スコープ・メモリ/リーク・disabled 協調）を追い直したが、Blocker / Warning はなし。

### AC カバレッジ確認（round 2 再検証）

| AC | 実装 | テスト | 判定 |
|----|------|--------|------|
| AC-1/2 | `captureSnapshot` を allowed バッチで前進 → rollback は最新 1 バッチのみ巻き戻し | 4-T1 (`InlineEditor.tsx:685-686`, test L1125) | OK |
| AC-3 | 同上＋reconciliation | 4-T2 ((1)DOM 保持 (2)後続 emit が最新本文, test L1159) | OK |
| AC-3′ | `rollback()` の pending clear→serialize→同期 onChange（比較→更新→発火の順） | 4-T3 (flush 非挿入・2 バッチ, test L1212) | OK |
| AC-4 | `isPlaceholderBr`＋`querySelector("*")===null` guard（レコード単位） | 4-T4 (`<td>`/`<p>`, test L1258/L1280) | OK |
| AC-5 | guard 下でも装飾/img/要素子残存 `<br>` は rollback | 4-T5 (a/b/c、c は img 同居構成, test L1294) | OK |
| AC-6 | 合成中は `captureSnapshot` スキップ、compositionend 成功時のみ捕捉 | 4-T6 / 4-T7 (test L1351/L1387) | OK |
| AC-7 | `cleanClone` が `<pre>` を常に平文化 | 既存 #498 pin (L693/L733) ＋ 4-T8（W-001 修正で reconcile 経路も pin, test L1426） | OK |

## Blockers

なし

## Warnings

なし

## Notes

- **[N-001]** round 1 W-001 の解消が正しい。4-T8 は Step A（span 注入・debounce pending 維持・`onChange` 未発火を assert）→ Step B（別 act で `<b>` 追加 → observer 微タスクで rollback → pending clear → `restored(foobar) !== lastEmitted(mount の foo)` で `changed===true` → `onChange` 同期発火）の順で、real timer（`flushMutations` は 80ms 実待機）上で 50ms debounce が発火する前に rollback が pending を刈り取る。よって観測される `onChange` 引数は真に reconciliation 由来（`InlineEditor.tsx:606-621`）。plan 3 周目 S-001 が警告した「テキスト不変で reconcile が沈黙する」ハマりも、span テキストを `foo→foobar` に変える構成で回避できている。

- **[N-002]** P-001 reconciliation の比較順序・分岐が計画どおり（`InlineEditor.tsx:606-621`）。(1) `debounceTimerRef` を `clearTimeout` → null、(2) `const restored = serializeHostContent(host)`、(3) `const changed = restored !== lastEmittedHtmlRef.current`（**上書き前の値と比較**）、(4) `lastEmittedHtmlRef.current = restored`（無条件更新）、(5) `if (changed) onChangeRef.current(restored)`。「一致していれば onChange 不要・更新のみ」という plan の要件を満たす。`onChange` を observer 再購読（L613-620 の `obs.observe`）の**後**に置く順序も安全側（万一の同期 DOM 変異が監視下に入る）。

- **[N-003]** 「rollback 後、親 value = 復元後 DOM」の不変条件が全経路で成立する。`changed===true` なら `onChange(restored)` で親へ届き、`changed===false` なら `lastEmittedHtmlRef===restored` かつ lastEmitted は過去に実際 emit された値（emit タイマー / reconcile でしか更新されない）なので親は既に保持済み。mount 時の `rebuild` は `lastEmittedHtmlRef = serialize(host)` を onChange なしで設定するが、その値は親から渡された `value` 自身なので齟齬なし。AC-3′ は堅牢。

- **[N-004]** compositionend 由来の rollback でも reconciliation が誤発火しない。4-T6（先行 "foobar" 編集 → 合成 drift → rollback）では snapshot=foobar・lastEmitted=foobar で `changed===false` となり onChange は増えず、DOM は foobar のまま。4-T7（合成中 "fooDURING" は捕捉スキップ → drift rollback）では snapshot=foo・lastEmitted=foo で `changed===false`、DOM は foo に巻き戻る。合成中に snapshot を折り込まないガード（`InlineEditor.tsx:685` の `!isComposingRef.current`）と compositionend 成功時のみの捕捉（`:852` の `isComposingRef=false` 後 `:858` `captureSnapshot()`）が正しく効いている。

- **[N-005]** 候補 C の guard がレコード単位で正しくスコープされている（`InlineEditor.tsx:486-497`）。`removedBr` と `targetEl.querySelector("*") !== null` は childList レコードごとのローカル判定で、各 `<br>` 除去をその除去が起きたブロックの mutation 後 DOM に対して検査する。`<td><br></td>`→text の 1 文字入力は定着し（4-T4）、`<p>a<br><img></p>` からの `<br>` 除去は img が残るため rollback（4-T5(c)）。`isPlaceholderBr` の JSDoc（`:430-439`）に「プレースホルダ限定ではなく属性なし `<br>` 全般にマッチ」と明記されており arch-risk S-001 の受容が文書化されている。

- **[N-006]** IME/ハイライト捕捉ガードの二経路が正位置（observer: `:685`、compositionend: `:858`）。compositionend の捕捉は pending 分類ブロックの有無に依らず（`takeRecords()` が空で確定バッチを observer が drain 済みの経路 arch-risk S-003 でも）配置され、確定テキストを基準へ折り込める。4-T7 が「合成中編集が drift rollback で巻き戻る」ことを観測可能な振る舞いで pin し、private クロージャの `captureSnapshot` 呼び出し有無を間接固定している。

- **[N-007]** メモリ/リーク・再入はクリーン。reconciliation の `onChange` は親 setState で、返る `value===lastEmittedHtmlRef` により resync effect（`:949-952`）が no-op → rebuild されず再入ループなし。`captureSnapshot`（`:579-584`）はリスナ/observer/タイマーを増やさず detached `<body>` を差し替えるのみ（旧 snapshot は GC 対象）。`debounceTimerRef` の `clearTimeout` は emit / rollback（`:606-609`）/ rebuild（`:705-708`）/ disabled effect は無し（後述）/ unmount cleanup（`:934-937`）で処理。observer の `disconnect`/`takeRecords` も rollback・rebuild・disabled・cleanup で対称。

- **[N-008]** ADR-001 arch-risk S-002 の `cleanClone` 共通化が意図どおり（`:371-393`, `:579-584`）。snapshot 捕捉・serialize・rollback 復元の三者が同一正規形（contenteditable なし・`<pre>` 平文）で突き合い、`DOMParser` 往復を省く。ADR-003 の「`captureSnapshot` に try/catch を置かない」判断も、`cloneNode`/`createElement`/`replaceChildren` が非例外操作であることと既存 `rebuild`（`:754`）の無防御対称性から妥当。CLAUDE.md「Avoid broad try/catch」に沿う。

- **[N-009]** 実装ステップ 1 の「mount-once effect 内に `captureSnapshot()` を追加」は、実際には mount 時の baseline を `rebuild`（resync effect 経由、`lastEmittedHtmlRef` 初期 null で必ず走る）の `snapshotRef.current = body.cloneNode(true)`（`:754`）で確立しており、機能的に等価（どちらも clean な `<body>`）。plan 文言との差はあるが挙動上の欠陥ではなく、baseline 生成箇所を一本化したむしろ整合的な実装。

- **[N-010]（スコープ外・参考）** `disabled` トグル effect（`:954-980`）は pending debounce を clear せず `lastEmittedHtmlRef = serializeHostContent(host)` を更新するため、編集直後（emit 未発火）に disabled=true へ切り替わると、その pending emit が `next===lastEmittedHtmlRef` で早期 return し親へ届かない窓が理論上ある。ただしこれは #840 以前からの既存挙動で、`clearEditable`/`applyEditable` は contenteditable のみ変えるため serialize 値は不変（＝実害は「編集直後に即 disabled 化」という稀経路に限定）。本 PR の変更点ではなく #840 のスコープ外。将来 disabled 遷移周りを触る際の留意点として記録に留める。
