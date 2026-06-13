# PR #686 レビュー (Round 1) — Test 観点

対象 PR: #686 / 対象テストファイル: `app/components/common/__tests__/Popover.test.tsx`
実装計画: `.issue/652/plan.md`（受け入れ基準 AC-2 / AC-3 / AC-4）

実行確認: `pnpm vitest run app/components/common/__tests__/Popover.test.tsx` → 22 件 PASS。
DOM スタブ各テストの実シフト値は `computeShiftX` / `computeShiftY` に rect を手で通して数値検証済み（下記 B-001 / W-001 の根拠）。

## Test

### Blockers

- **[B-001]** DOM スタブテストが「単一軸」を一切検証していない（テスト名と実挙動の乖離・回帰検知力の欠落）
  - 場所: `app/components/common/__tests__/Popover.test.tsx:313-346`（horizontal）/ `:348-390`（vertical）
  - 理由: 両テストとも `vi.spyOn(Element.prototype, "getBoundingClientRect")` で **全要素共通**の rect を返すスタブ。返している rect が両軸ともクランプ条件を踏んでしまっているため、`shiftX`/`shiftY` の両方が非0になる。
    - `applies a horizontal clamp …`: rect `{left:800,right:1080,top:0,bottom:0}` / innerWidth=1000・innerHeight=768(happy-dom 既定)。実測 `shiftX=-88`, **`shiftY=8`**（`top:0 < margin:8` のため上端補正が乗る）。出力 transform は `translate(-88px, 8px)`。「horizontal clamp」と名乗りながら垂直シフトも乗っている。
    - `applies a vertical clamp when the panel overflows the bottom edge`: rect `{left:0,right:280,top:500,bottom:760}` / innerWidth=1000・innerHeight=633。実測 **`shiftX=8`**（`left:0 < margin:8`）, `shiftY=-135`。出力 transform は `translate(8px, -135px)`。「vertical（bottom 端）」と名乗りながら水平シフトも乗っている。
    - その上でアサーションが両方とも `toContain("translate(")` のみ。`translate(` は `shiftX`/`shiftY` のどちらか一方でも非0なら必ず付く文字列なので、**「水平が効いた」「垂直が効いた」のどちらも証明していない**。仮に `computeShiftY` を丸ごと削除して `panelStyle` を `translateX` 単軸に戻しても、horizontal テストは（`translate(` が `translateX(` に変わるので落ちるが）vertical テストは axis を取り違えていて「垂直クランプが効いている」根拠にならない。逆に `computeShiftX` を壊しても vertical テストは `shiftY` で `translate(` が残り PASS してしまう。AC-3 の核心（垂直クランプが実際に transform に反映される）を回帰から守れていない。
  - 提案: rect を **当該軸だけがオーバーフローする**値に直し、かつ実値で固定する。
    - horizontal: `top`/`bottom` を viewport 内（例 `top:100,bottom:380`）にして `shiftY=0` を保証し、`expect(transform).toBe("translate(-88px, 0px)")`。
    - vertical: `left`/`right` を viewport 内（例 `left:100,right:380`）にして `shiftX=0` を保証し、`expect(transform).toBe("translate(8px, -135px)")` のように **負の垂直値を完全一致**で固定（下端はみ出し → 上シフト＝負、を実値で）。
    - これにより「軸の分離」と「実シフト量」の両方が回帰検知対象になる。`toContain("translate(")` は緩すぎる（重点観点どおり）。

### Warnings

- **[W-001]** 垂直クランプの「実数値」を検証するテストが皆無（純粋関数の境界網羅は良いが、DOM 経路の値が未固定）
  - 場所: `app/components/common/__tests__/Popover.test.tsx:348-390`
  - 理由: `computeShiftY` のユニット 4 ケース（AC-3）は値まで固定しているが、`usePopover` の layout effect 経由で `getBoundingClientRect` → `computeShiftY` → `panelStyle.transform` という**結線**を通った値は B-001 の `toContain` でしか見ていない。「effect が `window.innerHeight` を `computeShiftY` の第2引数へ渡している」「`setShiftY` が `translate` の第2引数に合成されている」という結線バグ（例: 引数取り違え、translate の引数順入れ替え）を検知できない。B-001 を実値一致に直せば本 Warning も同時解消する。
  - 提案: B-001 の修正（完全一致アサーション）に統合。垂直シフトの符号（下端はみ出し=負）と桁が transform に正しく載ることを 1 ケースで固定する。

- **[W-002]** 「両軸同時クランプ（合成 transform）」の専用テストが無い
  - 場所: `app/components/common/__tests__/Popover.test.tsx`（該当テスト無し）/ 計画 `(C)` 合成 transform は本 PR の中核変更
  - 理由: 偶然ながら B-001 の 2 テストは両方とも 2 軸非0の rect を踏んでいる（horizontal=`translate(-88,8)`, vertical=`translate(8,-135)`）ので「両軸合成」は実は通っている。しかしそれは**意図された検証ではなく副作用**で、B-001 を「単一軸分離」に直すと両軸合成を踏むテストが 1 件も無くなる。`translate(x, y)` の引数順（x が水平・y が垂直）を取り違えても気付けないリスクが残る。
  - 提案: B-001 で単軸テストへ寄せるなら、両軸ともオーバーフローする rect で `translate(<x>px, <y>px)` を完全一致させる「合成」テストを別途 1 件足す。x と y が異なる絶対値になる rect を選べば引数順の取り違えも検知できる（例 `shiftX=-88, shiftY=-135` のように水平・垂直で値を変える）。

- **[W-003]** 狭幅スキップテスト（AC-4）が「水平・垂直 両方がスキップされた」ことまでは保証していない（弱い保証）
  - 場所: `app/components/common/__tests__/Popover.test.tsx:392-437`
  - 理由: `expect(panel()?.style.transform).toBeFalsy()` は「transform が付いていない＝両軸とも 0」を保証できており、AC-4（`max-sm` シートで translateX/translateY が乗らない）の固定としては**正しく十分**。これは Note 級の良点でもある。ただし `toBeFalsy()` は `""`・`undefined`・`"none"` を区別しない。本実装は両0なら `panelStyle=undefined` を返すので空文字になるが、将来 `transform: "none"` を明示する実装に変わったときに「クランプ計算が走ったが結果0」と「そもそもスキップ」の区別が付かない（早期 return＝計算スキップが AC-4 の本質）。
  - 提案: 必須ではないが、`toBe("")`（panelStyle=undefined のとき style.transform は空文字）に締めるか、もしくは `getBoundingClientRect` スタブが**呼ばれていない**こと（`expect(rectStub).not.toHaveBeenCalled()`）を併せて assert すると「計算自体がスキップされた」という AC-4 の意図に直結する。

- **[W-004]** rect スタブが `Element.prototype` 全体に効くため、テストの前提が脆い
  - 場所: `app/components/common/__tests__/Popover.test.tsx:314-315, 349-350, 396-397`
  - 理由: `vi.spyOn(Element.prototype, "getBoundingClientRect")` は trigger・container・panel すべてに同一 rect を返す。実装が将来 trigger rect も併用するような計測に変わると、テストが意図せず通り続ける/壊れる。既存 horizontal テスト（main 由来）からの踏襲なので本 PR の新規責任ではないが、B-001 で rect を意味のある値に変える際に、せめてコメントで「全要素に同 rect が返る前提」を明記しておくと後続変更者の誤解を防げる。
  - 提案: コメント追記、または `panelRef` の要素のみをスタブする（`setPanelRef` でキャプチャした node に直接 `vi.spyOn`）形にできれば前提が締まる。優先度は低。

### Notes

- **[N-001]** `computeShiftY` の純粋関数ユニットテスト（`:41-69`）は AC-3 の境界を的確に網羅している。フィットで0 / 下端はみ出しで負（`-VIEWPORT_MARGIN`）/ 上端はみ出しで正（`VIEWPORT_MARGIN - -20`）/ 縦長パネル上端優先（`{top:200,bottom:900},600` → `VIEWPORT_MARGIN - 200`）の 4 ケースが、`computeShiftX` の 3 ケースと対称で、かつ計画の S-002（上端優先 = 将来 max-height との境界固定）まで実値でカバー。マジックナンバーを `VIEWPORT_MARGIN` 由来の式で書いており margin 変更に追従する点も良い。
- **[N-002]** 既存 `applies a translateX clamp …` → `applies a horizontal clamp …`（`:313`）への改名とコメント（`#652 (C)` で 2 引数 `translate(x,y)` 化したため `translateX(` マッチを `translate(` に更新）は、計画 AC-2 / リスク欄の「文字列マッチ破壊」を明示的に処理しており、意図が追える。改名自体は妥当（単軸検証への回帰は B-001 で別途必要）。
- **[N-003]** ファイル冒頭の JSDoc（`:9-15`）を `shiftX horizontal + shiftY vertical` に更新し、happy-dom にレイアウトが無いため純粋関数＋DOM スタブで検証する制約を明記しているのは、後続変更者への意図共有として良い。
- **[N-004]** 狭幅スキップテスト（`:392-437`）は AC-4 を「両軸とも transform に乗らない」形で固定できており、計画の最重要差分（ボトムシート非干渉）を回帰から守る要のテストとして機能している。innerWidth/innerHeight を try/finally で確実に復元しているのも他テストと一貫していて良い。
- **[N-005]** 既存の dismiss / role(mousedown defaultPrevented の `it.each`) / multiselectable / focus 復帰テスト群は本 PR で無変更のまま 22 件 PASS。共有基盤改修にもかかわらず既存の振る舞い検証に回帰が無いことが確認できる（AC-2 の一部）。
