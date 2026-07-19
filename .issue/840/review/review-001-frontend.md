# レビュー #840 PR #845 — Frontend 観点 (review-001)

対象: `app/components/note/editor/InlineEditor.tsx` / `app/components/note/editor/__tests__/inlineEditor.test.tsx`
計画: `.issue/840/plan.md` / ADR: `.issue/840/adr.md`
検証: `pnpm vitest run inlineEditor.test.tsx` → **52 passed**

## 総評

候補 B（snapshot 追従）＋ 候補 C（プレースホルダ `<br>` 許容）＋ P-001 reconciliation の 3 点が計画・ADR どおりに実装されている。受け入れ基準 AC-1〜AC-7 / AC-3′ はいずれもコードとテストで満たされており、#233 の保守的 rollback（許可外 mutation→全置換復元）の安全機構は基準点を前進させただけで無効化されていない。IME 合成中・`<pre>` ハイライト中の捕捉ガードは observer コールバックと compositionend の双方で正しいタイミングに置かれている。ブロッカーはなし。テスト 4-T8 が「reconciliation の onChange 発火」を実際には踏んでいない点（DOM 主張は有効・機能は 4-T3 でカバー済み）を Warning として 1 件挙げる。

### AC カバレッジ確認

| AC | 実装 | テスト | 判定 |
|----|------|--------|------|
| AC-1/2 | `captureSnapshot` を allowed バッチで前進 → rollback は最新 1 バッチのみ巻き戻し | 4-T1 (TC-005: img 復元＋TAIL 保持) | OK |
| AC-3 | 同上＋reconciliation | 4-T2 ((1)DOM 保持 (2)後続 emit が最新本文) | OK |
| AC-3′ | `rollback()` の pending clear→serialize→同期 onChange | 4-T3 (flush 非挿入・2 バッチ構成) | OK |
| AC-4 | `isPlaceholderBr`＋`querySelector("*")===null` guard | 4-T4 (`<td>`/`<p>` 空ブロック) | OK |
| AC-5 | guard 下でも装飾/img/要素子残存 `<br>` は rollback | 4-T5 (a/b/c、c は img 同居構成) | OK |
| AC-6 | 合成中は `captureSnapshot` スキップ、compositionend 成功時のみ捕捉 | 4-T6 / 4-T7 | OK |
| AC-7 | `cleanClone` が `<pre>` を常に平文化 | 既存 #498 pin ＋ 4-T8（下記 W-001 の限界あり） | 概ね OK |

## Blockers

なし

## Warnings

- **[W-001]** 4-T8（AC-7）は reconciliation の onChange 発火経路を実際には踏んでおらず、観測している `onChange` 引数は rollback 前の通常 emit 由来である。
  - 場所: `app/components/note/editor/__tests__/inlineEditor.test.tsx` — 「restores a plain `<pre>` ... and reconciles onChange」テスト内、span 注入 act 直後の `await flushMutations();`（実装 `InlineEditor.tsx:598-624` の reconciliation に対応）
  - 理由: 手順が「span 注入 act → **`await flushMutations()`（80ms）** → 別要素 append で rollback」の順。span 注入で `<code>` テキストが `foo→foobar` に変わり、その 80ms flush で通常のデバウンス emit が発火する（`serializeHostContent` の `cleanClone` が span を平文化 → `onChange("<p>seed</p><pre><code>foobar</code></pre>")`、`lastEmittedHtmlRef` も foobar 版に更新）。続く rollback 時には `restored === lastEmittedHtmlRef` となり `changed === false` → **reconciliation の `onChange` は発火しない**。テスト末尾で観測している `lastArg` は rollback ではなく直前の通常 emit の値。つまりコメントが謳う「the reconciled onChange argument is ... plain」を厳密には pin していない。plan 3周目が S-001 として避けようとした「テキスト不変で reconciliation が沈黙する」ハマりの変種（今回は flush が先に emit してしまう形）に落ちている。
  - 影響度: 低。(a) DOM レベルの主張（rollback 復元後 `<pre>` が span を含まない平文・`code.textContent==="foobar"`）は依然有効で AC-7 の実質（snapshot 経路が `<pre>` を平文で捕捉している）を pin できている。(b) reconciliation が onChange を同期発火する挙動そのものは 4-T3 が独立に pin 済み。よって回帰検出の穴は限定的で、機能の正しさは担保されている。ブロッカーにはしない。
  - 提案: span 注入 act と rollback act の間の `await flushMutations();` を削除する。そうすると span 注入時の emit タイマーが pending のまま（`act` は実時間を進めない）→ rollback が pending を clear、`restored(foobar) !== lastEmittedHtmlRef(mount の foo)` で `changed===true` → reconciliation の `onChange(foobar)` が発火し、`lastArg` が真に reconciliation 由来になる。DOM 主張は変わらず green（要検証だが上記トレース上は成立）。これで 4-T3（非 `<pre>` の reconciliation）と 4-T8（`<pre>` 経路の reconciliation）が一対一に揃う。

## Notes

- **[N-001]** `serializeHostContent` 内のクローン＋clean 化を `cleanClone(host): HTMLElement` に括り出し、`serializeHostContent` は `cleanClone(host).innerHTML`、`captureSnapshot` は `cleanClone(host)` の子を新規 `<body>` へ移送、という共通化（`InlineEditor.tsx:371-393, 579-584`）は計画 arch-risk S-002 どおり。`DOMParser` 往復を省きつつ rebuild と同一形状（contenteditable なし・`<pre>` 平文）を保つ設計で、snapshot・serialize・rollback 復元の三者が同一正規形で突き合う。良い。

- **[N-002]** P-001 reconciliation の比較順序が正しい。`const changed = restored !== lastEmittedHtmlRef.current;` を評価してから `lastEmittedHtmlRef.current = restored;` で上書きしている（`InlineEditor.tsx:610-612`）。上書き前の値と比較する計画要件を満たす。`lastEmittedHtmlRef` の更新は従来どおり無条件、`onChange` は `changed` 時のみ、という分岐も plan「一致していれば更新のみ」に一致。

- **[N-003]** reconciliation の `onChange` を observer 再購読（`obs.observe(...)`）の**後**に発火している（`InlineEditor.tsx:613-621`）。`onChange` は親の setState でありコールバック内で host DOM を同期変異させないため、再購読の前後どちらでも実害はないが、後に置くことで「万一同期 DOM 変異が起きても observer が監視下」という安全側の順序になっている。再入ループも起きない（返ってくる `value === lastEmittedHtmlRef` で resync effect が no-op、rebuild されない）。

- **[N-004]** 候補 C の guard がレコード単位で正しくスコープされている。`removedBr` フラグと `targetEl.querySelector("*")` 判定は childList レコードごとのローカルで、各 `<br>` 除去をその除去が起きたブロックの mutation 後 DOM に対して検査する（`InlineEditor.tsx:486-497`）。text 挿入と `<br>` 除去が別レコード／別バッチに割れても、`<td>` への 1 文字入力が定着し、要素子が残るブロック（AC-5(c)）は rollback する挙動が保たれる。

- **[N-005]** IME・ハイライトの捕捉ガードが 2 経路とも正しい位置にある。observer コールバックは `!isComposingRef.current && !isHighlightingRef.current` のときだけ `captureSnapshot()`（`:685-687`）、compositionend は成功パスで `isComposingRef.current = false;` の**後**に `captureSnapshot()`（`:852-858`）。後者は pending 分類ブロックの有無に依らず配置され、合成中に observer が確定バッチを drain して `takeRecords()` が空になる経路（arch-risk S-003）でも確定テキストを基準へ折り込める。4-T7 が「合成中編集が drift rollback で巻き戻る」ことを振る舞いで pin し、ガードが外れた場合の回帰を捕捉する。

- **[N-006]** ADR-003（`captureSnapshot` に防御的 try/catch を置かない）は妥当。`cloneNode`/`createElement`/`replaceChildren` は例外を投げず、既存 `rebuild()` の snapshot 生成も無防御で対称。CLAUDE.md「Avoid broad try/catch ... use it only at explicit boundaries」に沿う。到達不能な死コードを持ち込まない判断は正しい。

- **[N-007]** allowed バッチごとに `cleanClone`（`cloneNode(true)`＋clean 化）で O(n) の再構築が走る（打鍵ごと）。ADR-001 / plan のリスク欄で「通常ノート規模では実害なし・更なる最適化は別 Issue」と受容済み。本 PR の設計上は妥当。将来、大規模ノートで体感遅延が出た場合の差分捕捉は別 Issue で。

- **[N-008]** メモリ／リーク観点はクリーン。`captureSnapshot` はリスナ・observer・タイマーを増やさず detached `<body>` を差し替えるのみ（旧 snapshot は GC 対象）。`debounceTimerRef` の `clearTimeout` は rollback（`:606-609`）・rebuild（`:705-708`）・unmount cleanup（`:934-937`）で漏れなく処理。observer の `disconnect`/`takeRecords` も rollback・rebuild・disabled effect・cleanup で対称に呼ばれている。コメント方針（WHY のみ）・スタイリング規約への逸脱なし。
