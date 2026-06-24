# PR #774 レビュー — Test 観点（review-002-test）2巡目

対象 PR: #774 / 計画: `.issue/660/plan.md`（AC-8 中心）
観点: テストの網羅性・回帰価値・flaky 耐性・既存挙動の不変温存・過剰結合の有無
前回（review-001-test）指摘: W-001 / W-002 / N-005

レビュー対象ファイル:
- `app/components/common/useRovingTablist.ts`（実装）
- `app/components/note/list/DisplayModeSwitch.tsx`（実装）
- `app/components/public/PublicTopControls.tsx`（実装）
- `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx`（テスト）
- `app/components/public/__tests__/PublicTopControls.test.tsx`（テスト）

実行確認: 上記2テストファイル **32 tests passed**（`npx vitest run`、前回 29 → +3）。

---

## 前回指摘の反映確認

- **W-001（`.focus()` 副作用が未アサート）→ 反映済み。** `DisplayModeSwitch.test.tsx:309`（ArrowRight 後）/ `:375`（End 後）/ `:388`（Home 後）で `expect(document.activeElement).toBe(tabByLabel(...))` を追加。roving の本体である「移動＝選択＋フォーカス追従」の不可分性が回帰として固定された。`querySelector` セレクタ typo や `radios?.[next]` のインデックスずれを緑のまま通すことはなくなった。
- **W-002（ArrowUp/ArrowDown 分岐が未実行）→ 反映済み。** `:312` の `ArrowDown`（= ArrowRight と同じ「次へ」）、`:329` の `ArrowUp`（= ArrowLeft と同じ「前・ラップ」）を各1ケース追加。フックの `event.key === "ArrowDown"` / `"ArrowUp"` 受理分岐（`useRovingTablist.ts:67,69`）が実際に通るようになった。
- **N-005（public 静的契約が `aria-checked` 1本のみで薄い）→ 反映済み。** `PublicTopControls.test.tsx:152-172` を新設し、SSR マークアップ上で `role="radiogroup"` / `aria-orientation="horizontal"` / `role="radio"` ×3 / `tabindex="0"` ×1 + `tabindex="-1"` ×2（roving）/ 旧 `tablist`・`tab`・`aria-selected` 非存在を確認。public 固有の配線ミス（SEGMENTED_BTN への tabIndex 付け忘れ・role 取り違え）を SSR harness の範囲内で拾えるようになった。

3点とも計画どおり consumer 側に低コストで追加され、過剰結合を持ち込んでいない。

---

## Test

### Blockers

なし。

role 契約の旧→新移行・矢印キー回帰（Right/Left/Up/Down/Home/End・両端ラップ・連続矢印→連続 navigate・フォーカス追従）・既存挙動の不変（#219/#650/#215）がいずれも回帰として固定されており、AC-8 の要求水準を満たす。前回 Warning（W-001/W-002）も解消済み。

### Warnings

なし。

### Notes

- **N-001: フォーカス追従アサートは ArrowRight/Home/End の3経路のみ。ArrowLeft/Up/Down は navigate だけ確認（許容範囲）**
  - 場所: `DisplayModeSwitch.test.tsx:309,375,388`（focus 追従あり）/ `:312,334,351`（ArrowDown/Up/Left は navigate のみ）
  - `document.activeElement` のアサートは ArrowRight・End・Home に付き、ArrowLeft / ArrowUp / ArrowDown の各テストは navigate（search 出力）だけを見てフォーカス追従を見ていない。フォーカス移動は `useRovingTablist.onKeyDown` の単一コードパス（`radios?.[next]?.focus()`）を全キーが共通で通るため、`next` の計算（前/次/Home/End）さえ navigate 側で固定できていればフォーカス側のリグレッションは ArrowRight/End/Home の3点で十分検出できる。全キーに focus アサートを付けるのは過剰。N 留め（コードパス共通性により実害確率は低い）。

- **N-002: `count === 0` early return（`useRovingTablist.ts:63`）は未検証。ただしコンシューマー不在で到達不能に近い**
  - 場所: `useRovingTablist.ts:63`（`if (count === 0) return;`）
  - 両コンシューマーとも `count` は固定3（`DISPLAY_MODES.length` / `DISPLAY_OPTIONS.length`）で 0 になり得ず、この防御分岐は consumer 経由テストでは通らない。フック単体テストがあれば自然に閉じるが、`useRovingMenu` も専用テストを持たず consumer 経由で検証する先例（`docs/test.md`「Frontend: 必要最小限」）に沿っており、到達不能な防御コードに専用テストを足すのは費用対効果が低い。前回 N-001 と同じ「フック単体テストを置くかどうかの選択の問題」で、AC-8 は現状方針で満たす。N 留め。

- **N-003: `orientation: "vertical"` 分岐はコンシューマー不在のまま（前回 W-002 の残余・実害なし）**
  - 場所: `useRovingTablist.ts:56,57`（`nextKey`/`prevKey` の orientation 分岐）
  - 前回 W-002 で挙げた ArrowUp/Down は反映され受理分岐が通るようになったが、`orientation === "vertical"` 自体を渡す呼び出し元は依然存在しない（両者 default horizontal）。ただし ArrowUp/Down は orientation に関係なく常に受理される設計（`67,69` 行の `|| event.key === "ArrowDown"` 等）なので、vertical を渡しても振る舞いは horizontal と同一であり、未使用の `orientation` パラメータは「将来の縦並び segmented 用の拡張点」に過ぎない。テストで通らない＝バグではなく、型に残した拡張余地。気になるなら型から落とす選択もあるが、これは Test ではなく実装設計の判断で、回帰価値の欠落ではない。N 留め。

- **N-004: Space/Enter の preventDefault 非介入は依然 Tab で代表（前回 N-004 から不変・許容範囲）**
  - 場所: `DisplayModeSwitch.test.tsx:428-442`（Tab のみ）
  - 「未処理キーで preventDefault しない」は Tab 1ケースで固定。Space/Enter はネイティブ button の onClick 経由 select に委ねる設計で、これらが preventDefault されると活性化が壊れるが、`useRovingTablist.onKeyDown` の分岐構造（`Arrow*`/`Home`/`End` 以外は `next === null` で early return → preventDefault に到達しない）上、Tab と Enter/Space は同一の early-return に落ちるため Tab で代表させて妥当。`key:"Enter"`/`" "` を1アサート足すとキー網羅が完結するが、実害確率は低く N 留め（前回 N-004 から変化なし、新規の劣化ではない）。

- **N-005: flaky 耐性は良好（良い点）**
  - 場所: `DisplayModeSwitch.test.tsx:86-91`（`pressKey`）
  - `act(() => group.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })))` で React 合成 onKeyDown を同期発火し、`act` で state 反映を待つ流儀は既存 `act(render)`/`act(click)` と一貫。`document.activeElement` 追従アサートも happy-dom の `HTMLElement.focus()` 実装に乗った同期検証で、microtask/fake timers 待ちを要さない。新規追加された focus 追従・ArrowUp/Down ケースも同じ同期パターンで、flaky 要因（未ラップ dispatch・非同期待ち漏れ）は見当たらない。

- **N-006: 既存挙動の不変が完全に温存されている（良い点）**
  - 場所: `DisplayModeSwitch.test.tsx:132-288`
  - #219 navigate `replace:true` / #650 localStorage 永続・write-before-guard 順序（ADR-005）/ effective mode による active 判定 / #215 prev pass-through・空 prev クリーン URL の契約テストは、セレクタ（`[role="tab"]`→`[role="radio"]`）と aria 属性名（selected→checked）の差し替えのみで全て温存。矢印キー経路が click と同じ `select` ハンドラへ収束する設計（`DisplayModeSwitch.tsx:73`）のため、これら既存契約が矢印経路にもそのまま効くことも担保されている。AC-5 の不変性が回帰でロックされている。

- **N-007: 過剰結合なし（良い点）**
  - role/aria-checked/tabIndex の公開 ARIA 契約・navigate 呼び出し引数（`replace`/`search` 出力）・`document.activeElement` という観測可能な振る舞いを見ており、フック内部（`querySelectorAll` の呼び方・内部変数）には結合していない。`useRovingTablist` を別実装へ差し替えても ARIA 契約・navigate 出力・フォーカス追従が保たれる限りテストは緑で、リファクタ耐性がある。public 側の新規静的契約テストも `html` 文字列の出力契約（role/tabindex/旧 role 非存在）を見ており、実装詳細に踏み込んでいない。

- **N-008: 旧マークアップ非存在の明示が両ファイルで揃った（良い点）**
  - 場所: `DisplayModeSwitch.test.tsx:103-105` / `PublicTopControls.test.tsx:169-171`
  - DisplayModeSwitch（DOM）・PublicTopControls（SSR 文字列）の双方で `tablist`/`tab`/`aria-selected` が **存在しないこと** を明示アサート。新 role を足すだけでなく旧契約の残存（片方だけ radio 化等の移行漏れ）を両系統で検出する作りになった。前回 public 側で欠けていた「旧 role 非存在」が N-005 反映で揃い、2系統の移行完全性が対称に固定された。

---

## 総評

前回の Warning 2件（W-001 フォーカス追従未検証 / W-002 ArrowUp/Down 未実行）と Note 1件（N-005 public 静的契約の薄さ）は、いずれも計画どおり consumer 側に低コストで追加され、過剰結合を持ち込まずに解消された（29 → 32 tests）。

ゼロベース再レビューでも:
- 網羅性: role 契約の旧→新移行（両系統で旧 role 非存在を明示）、矢印キー全6キー（Right/Left/Up/Down/Home/End）、両端ラップ、連続矢印→連続 navigate、フォーカス追従、roving tabindex を回帰で固定。
- flaky 耐性: `act` + 同期 `dispatchEvent` 流儀で安定。非同期待ち依存なし。
- 既存挙動の不変: #219/#650/#215 契約をセレクタ・属性名差し替えのみで温存。
- 過剰結合: 公開 ARIA 契約・navigate 出力・activeElement という振る舞いを見ており実装詳細非依存。

Blocker・Warning とも検出されず、**問題点ゼロ**。残る Note（N-001〜N-004）は「フック単体テストを置くか／到達不能な防御分岐・未使用 orientation・Space/Enter 代表」のいずれも AC-8 を満たす範囲の選択であり、無理に足す必要はない。AC-8 は回帰として的確に閉じている。
