# ADR — Issue #803: ノート編集タグ入力 候補パネルの viewport クランプ / 外側クリッククローズ

## ADR-001: `usePopover` 全面移行ではなく純粋ヘルパ流用 ＋ 自前配線（B 案）

### Status
Proposed

### Context
ADR-004（#789）で候補パネルを手書き絶対配置にし、viewport クランプと外側クリッククローズを見送った。本 Issue でこれらを補うにあたり2案がある。

- **(A) `usePopover`（`app/components/common/usePopover.ts`）へ全面移行**: 外側 mousedown / Escape / focus-out のクローズ、`clampToViewport`（`computeShiftX`/`computeShiftY`）、aria 配線を内蔵する first-layer primitive。`DirectoryTreeSelect` が `Popover` 経由で採用。
- **(B) 純粋ヘルパ（`computeShiftY` と定数 `VIEWPORT_MARGIN`）だけ流用し、outside-click 用の document `mousedown` リスナと縦クランプを `TagsInput` 内に自前実装**。

`usePopover` は **trigger(button)+panel モデル**で、`triggerProps`（`ref: Ref<HTMLButtonElement>` / `aria-haspopup` / `aria-expanded=open` / `aria-controls` / onClick toggle）の付与と、Escape クローズ時の **trigger(button) へのフォーカス復帰**を前提とする。一方 `TagsInput` は ADR-003 で **実フォーカスを input に固定するインライン combobox**であり、独自の aria 契約を持つ:
- `aria-expanded` は `panelOpen`（`open && (hasSuggestions || isNewDraft)`）を反映し、`usePopover` の `open` 直結とは異なる（ADR-003 / arch-risk R3 P-001）。
- `aria-controls`/`aria-activedescendant` は `open && hasSuggestions` の時のみ付与し、`panelId` ではなく listbox の `listboxId`/option id を指す。
- `aria-haspopup` は combobox では `aria-autocomplete="list"` であり `usePopover` の `listbox`/`menu`/`dialog` とは別概念。
- Escape は input の `onKeyDown` で処理し、トリガー（input）からフォーカスを移さない。`usePopover` の Escape→button フォーカス復帰は不要かつ復帰先 button が存在しない。

### Decision
**(B) を採る。** `usePopover.ts` が export する純粋関数 `computeShiftY` と定数 `VIEWPORT_MARGIN` を再利用して縦クランプを行い、outside-click は `usePopover.onDocMouseDown` と同形の document `mousedown` リスナを `TagsInput` 内に自前で張る。`usePopover` フック本体（`triggerProps`・focus-out・Escape 復帰・panelId 配線）は採用しない。

### Consequences
- 良い点:
  - DRY の本質（単体テスト済み・DOM 非依存の clamp math）を再利用しつつ、ADR-003 の combobox a11y 契約・IME ガード・blur コミットを一切触らずに済む。
  - 追加コードは「測定 layout effect ＋ transform style ＋ document mousedown」の局所的なものに留まり、影響範囲が `TagsInput.tsx` に閉じる。
  - `usePopover.ts` は無改変（既存 export の利用のみ）で、他の `usePopover` 利用者（FilterBar / Menu / DirectoryTreeSelect）に影響しない。
- トレードオフ:
  - 外側クリッククローズの document リスナ（約10行）が `usePopover` と概念重複する。ただし `usePopover` を部分利用する公開 API が無く、フック全体はトリガーモデルが衝突するため、重複を受容する方が全面移行より低リスク。
  - 将来さらに popover 的要件（focus-trap・別レイヤ・flip）が増えるなら、その時点で combobox 対応の primitive 抽出を再検討する余地は残る。

---

## ADR-002: 縦はみ出しは flip（上方向反転）ではなく shift クランプで補正する

### Status
Proposed

### Context
Issue は「viewport に応じてクランプ／上方向反転（上方向に開く等）」を改善方向性に挙げる。実装方式は2つ。

- **flip**: 下端がはみ出す時、アンカーを input の上側（`bottom: 100%`）に切り替えてパネルを上向きに開く。
- **shift クランプ**: アンカーは下側のまま、`translateY` でパネルを viewport 内へ押し上げる（`computeShiftY`）。

アプリ全体の確立パターン（`usePopover` の `clampToViewport`）は **shift 方式**で統一されており、flip を行う既存実装は無い。flip は新しい配置ロジック（アンカー切替・activedescendant スクロール基準の再考）を持ち込み、複雑度とテスト対象を増やす。ADR-004 自身も「viewport クランプ」と表現し flip は必須としていない。

### Decision
**shift クランプ**を採用する。`computeShiftY(rect, window.innerHeight)`（bottom はみ出しを先に補正、次に top。パネルが viewport より高い場合は head を残す）を再利用し、`transform: translateY(shiftY)` を当てる。

### Consequences
- 良い点: アプリ全体の clamp 方式と一貫。`computeShiftY` をそのまま使え、計算ロジックの新規実装・テストが不要。アンカー（`top-[calc(100%+6px)]`）と activedescendant の `scrollIntoView` 挙動を変えずに済む。
- トレードオフ: 画面最下部などパネルが極端にはみ出す状況では、push-up により候補が入力フィールドの一部に被さる可能性がある（visible は保たれる）。flip ならフィールドを避けられるが、本 Issue（優先度低・実害小）では shift で十分。将来 flip 要件が出れば別途検討。

---

## ADR-003: 外側クリッククローズは `panelOpen` 時のみの document `mousedown` リスナ

### Status
Proposed

### Context
現状クローズは input の `blur` と Escape のみ。Issue は明示的な outside-click ハンドラを求める。`blur` は focusable な外側要素クリックでは閉じるが、非フォーカス領域クリックなど blur が発火しないケースを取りこぼし得る。実装方式は (a) `usePopover` 同様 `document` の `mousedown` を購読し container 外なら閉じる、(b) パネル外要素に個別ハンドラ、等。

### Decision
`tagsRow` に `containerRef` を付け、`panelOpen` の時のみ `document` に `mousedown` リスナを張る。target が `containerRef.current` に含まれなければ `closePanel()`。cleanup で解除。`usePopover.onDocMouseDown` と同形。既存の Escape（input keydown）・blur での valid draft コミットは温存する。option クリックは `onMouseDown preventDefault`＋コンテナ内のため閉じない。

### Consequences
- 良い点: blur 非依存の確実なクローズ。`panelOpen` 時のみ購読しリーク無し。既存クローズ経路（Escape/blur）と共存し、a11y/コミット挙動に非干渉。
- トレードオフ: outside `mousedown` → `closePanel`（open=false）の直後に input `onBlur`（valid draft コミット）が連続発火する。発火順は mousedown→blur で、`closePanel` は open のみ変更しコミット可否は `onBlur` の条件に依存するため挙動は不変だが、相互作用をテストで明示固定する必要がある。

---

## ADR-004: 開いたまま再測定する縦クランプでは測定 rect を natural 位置へ復元してから `computeShiftY` に渡す

### Status
Proposed

### Context
本 Issue の縦クランプは `usePopover.ts` の純粋関数 `computeShiftY` を再利用する（ADR-002）。`computeShiftY` は「**測定 rect は natural（未シフト）位置であり、算出する補正値は絶対値**」という不変条件に依存している（usePopover の layout effect コメント: 「`shiftX`/`shiftY` are 0 here (reset on the previous close), so the measured rect is the natural, unshifted position and each correction is an absolute value」）。

`usePopover` 本体ではこの前提が自動的に満たされる。理由はその layout effect の依存配列が `[open, clampToViewport]` のみで、**パネルが開いたまま再測定しない**（content は静的前提）からである。close 時に `shiftY=0` にリセットされ、次の open で初めて測定するため、測定時点では必ず transform が当たっていない=natural。

一方、本 Issue の候補パネルは typing で候補件数＝高さが変わるため、**パネルを開いたまま**（`candidates.length`/`isNewDraft` を依存に含めて）再測定する必要がある（AC-3）。この再測定の瞬間、パネルには前回の measurement で当てた `transform: translateY(shiftY)`（`shiftY≠0`）が**既に適用済み**であり、`getBoundingClientRect()` はシフト後の rect を返す。これをそのまま `computeShiftY` に渡すと natural 前提が破れ、補正が二重計上されて誤クランプする。

具体例（viewport 633, margin 8）: natural top=500/bottom=760 → 初回 shiftY=-135（正）。候補が減って natural bottom=720 に変化した再測定時、前回の -135 が効いているので rect は top=365/bottom=585。`computeShiftY({365,585},633)` は両端 in-range → 0 を返し、パネルは natural の bottom=720 に戻り 95px はみ出したまま残る（effect も再走しない）→ AC-3 が実 DOM で失敗。

### Decision
**再測定時に測定 rect から現在の `shiftY` を引いて natural 位置を復元してから `computeShiftY` に渡す。**

```
computeShiftY({ top: rect.top - shiftY, bottom: rect.bottom - shiftY }, window.innerHeight)
```

これに伴い `shiftY` を layout effect の依存に含める。natural 値（補正後の `top - shiftY` 等）は不変なので 2 パス目は `Object.is` 同値となり React がバイルアウトして収束し、無限ループにはならない。初回は `shiftY=0` で補正項がゼロのため現状（usePopover 流）と等価。

代替案として usePopover 同様「高さ変化時にいったん `shiftY=0` にリセット→次フレームで再測定」する二段構えもあるが、リセット→再測定の間にちらつきが出るため compensation（natural 復元）方式を採る。

### Consequences
- 良い点: `computeShiftY` の natural 前提を保ったまま「開いたまま再測定」を可能にし、AC-3（動的高さ再クランプ）を実 DOM で正しく満たす。`usePopover.ts` は無改変のまま純粋関数だけ再利用できる。
- トレードオフ: `usePopover` の利用パターン（reset→測定）からの差分（natural 復元補正）が `TagsInput` 固有に増える。この非自明さは ADR と plan のリスク欄に明記し、固定 rect では検出できないため transform を反映した rect を返すテストで P-001 を回帰検出する。
- `shiftY` を依存に含めることで一見フィードバックループに見えるが、補正後 natural 値の不変性により収束する点を実装・テストで固定する。

---

## ADR-005: natural 復元補正の「適用済みシフト」は `shiftY` を依存に含めず `shiftYRef`（ref）から読む

### Status
Accepted（実装時に確定）

### Context
ADR-004 は natural 復元補正（`computeShiftY({ top: rect.top - shiftY, bottom: rect.bottom - shiftY }, …)`）にあたり、plan 実装ステップ2 の通り **`shiftY` を layout effect の依存に含め**、2 パス目は補正後 natural 値が不変なので `Object.is` 同値で React がバイルアウトして収束する、という設計だった。

この収束は「`getBoundingClientRect()` が**適用済み transform を反映したシフト後 rect を返す**」ことを前提とする（実ブラウザでは真）。しかし本コンポーネントのユニットテスト環境 **happy-dom にはレイアウトエンジンが無く、`getBoundingClientRect()` は transform を無視して常にゼロ rect（全 0）を返す**。このため:

- 2 パス目の測定 rect が「前回 transform を反映していない」ので、`rect - shiftY` 補正は `0 - shiftY` となり、natural 値が不変どころか毎パス変化する。
- 結果、`computeShiftY` が毎回ゼロでない値（top<margin により最低 +8）を返し続け、`shiftY` 依存により effect が再走を繰り返して **`Maximum update depth exceeded`（無限更新ループ）でクラッシュ**する。
- パネルを開く既存テスト（focus で listbox を開く多数のケース）が rect スタブ無しで走るため、これらが軒並み巻き込まれて落ちる（plan 必須要件「既存テストを緑のまま維持」と矛盾）。

`usePopover` 本体がこの問題を踏まないのは、依存配列が `[open, clampToViewport]` で **shift を依存に持たず**、かつ clamp が opt-in（既存非 clamp テストは effect 自体が early return）だからである。本コンポーネントは clamp が常時走るため、`shiftY` を依存に入れた瞬間に happy-dom の零 rect で発散する。

### Decision
**補正に使う「適用済みシフト」を state `shiftY` ではなく `shiftYRef`（ref）から読み、layout effect の依存配列を `[panelOpen, candidates.length, isNewDraft]` に保つ（`shiftY` を依存に含めない）。** effect 内で `shiftYRef.current` を読み、新しいシフトを算出したら `shiftYRef.current` と `setShiftY` の両方を更新する。`panelOpen=false` のリセットでも両方を 0 に戻す。

これにより:
- effect は「高さ変化（依存変化）ごとに 1 回だけ」走り、自身の `setShiftY` では再走しない（フィードバックループが構造的に存在しない）。
- 補正の数式は ADR-004 と完全に同一（`rect.{top,bottom} - applied`）。初回 open は `applied=0` で測定 rect が natural、再測定時は `applied=前回シフト` を引いて natural 復元 ―― 実ブラウザでは ADR-004 と同じ結果に収束する。
- happy-dom の零 rect でも「1 パスで spurious な +8 を当てて終わり（再走しない）」ため無限ループにならず、既存テスト（transform を検証しない）は緑のまま。
- P-001（transform フィードバック二重計上）の回帰検出力は維持される ―― 動的高さテストは transform 反映 rect を返すスタブで `applied` を反映させ、補正を外すと最終 transform が誤値になって落ちる（実装で確認済み）。

### Consequences
- 良い点: plan / ADR-004 の補正セマンティクス（natural 復元）と P-001 検出を保ったまま、happy-dom での無限ループを構造的に排除。`usePopover.ts` は無改変。
- トレードオフ: 「適用済みシフト」を state と ref の二重管理にする（常に同じ経路で同値更新するため desync しない）。plan が明記した「`shiftY` を依存に含める」記述からの逸脱だが、その記述の前提（`getBoundingClientRect` が transform を反映）がテスト環境で成立しないことに起因する必要な是正であり、本 ADR で根拠を固定する。
- happy-dom 由来の spurious な +8 シフトは実ブラウザでは発生しない（パネル natural top は input 直下で margin 内に無い）ため実害なし。

---
