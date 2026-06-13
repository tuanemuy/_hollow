# ADR — Issue #652: 共有 Popover の垂直ビューポート処理

## ADR-001: 垂直処理は「垂直クランプ（translateY）」で実装する（フリップ／max-height は採らない）

### Status
Proposed

### Context
Issue は期待動作として3案を提示している:
1. **上方向フリップ**: 下に余地が無ければアンカーを `top-full` → `bottom-full` に切り替えて上方向に開く。
2. **垂直クランプ（スクロールイン）**: パネル全体をビューポート内へ `translateY` で押し戻す（水平 `shiftX` の縦版）。
3. **max-height + 内部スクロール**: パネルに `max-height` を与え、超過分は内部スクロールで到達可能にする。

制約:
- アンカー（`absolute right-0 top-full …`）は **consumer の `panelClassName`** が持ち、`usePopover` はアンカーを知らない（#467 ADR-001 で chrome/位置は consumer 所有と決定済み）。案1 はアンカー宣言を prop 化する新 API が必要で、第1層プリミティブの抽象化粒度が大きく変わる。
- 既存の水平クランプは「純粋関数 `computeShiftX` + `shiftX` state + layout effect 計測 + `translateX` transform」という確立したパターン（#467 ADR-001 / #588 ADR-003）。
- 本 Issue の実害は「短い／スクロールされたビューポートでの下端メニュー項目のはみ出し」に限られ、パネル高がビューポート高を超える極端ケース（4項目のソートメニュー等では発生しない）は対象外。

### Decision
**案2（垂直クランプ / translateY）** を採る。`computeShiftX` と対称な純粋関数 `computeShiftY` を追加し、既存の水平クランプ layout effect 内で同時に計測して `transform: translate(shiftX, shiftY)` に合成する。

- 案1（フリップ）を採らない理由: アンカーが consumer 所有で usePopover から不可視。フリップには新 API が必要で粒度が増し、Issue スコープ（共有基盤の最小・対称な修正）を超える。下端での視覚的重なりは非モーダルメニューでは許容範囲で、項目の到達性（Issue の主目的）は translateY で満たせる。
- 案3（max-height 一律付与）を主手段にしない理由: パネル高がビューポート超の場合の備えであり本 Issue の実害ではない。一律付与は内部スクロール UI を全 clamp consumer に強制し挙動変更が広い。max-height が必要な consumer は `panelClassName` で個別付与できる（TagPicker の `max-h-[min(60vh,400px)]` が前例）。

### Consequences
- 良い点: 水平クランプと完全対称。純粋関数 + layout effect + transform の既存パターンを踏襲し、新 API・新ライブラリ不要。`Popover.tsx` は `panelStyle` 経由で無変更。`clampToViewport` opt-in なので非 clamp consumer は無影響。`computeShiftY` を happy-dom でユニットテストできる。
- トレードオフ: 下端でクランプするとパネルがトリガーに視覚的に一部重なりうる（フリップなら重ならない）。非モーダルメニューでは許容。パネル高がビューポート高を超える将来ケースは別途 consumer 側 `max-height` で対応（本 Issue スコープ外）。
- 縦長パネル（パネル高 > ビューポート高）の挙動: `computeShiftY` は下端補正→上端補正の順序のため、両端がはみ出す場合は**上端補正が後段で勝ち、先頭項目が画面内に見える**位置に収まる（末尾は到達不可のまま）。これは水平 `computeShiftX`（右端→左端で左端＝先頭が勝つ）と対称な設計で意図どおり。本 Issue の4項目メニューでは発生しないが、DatePopover 等の縦長になりうる clamp consumer が短いビューポートで開いた場合の挙動として認識しておく。末尾まで到達させたい consumer は `panelClassName` で `max-height` + 内部スクロールを個別付与する（スコープ外）。

---

## ADR-002: 垂直クランプは既存の水平クランプ layout effect に相乗りし、独立した分岐を新設しない

### Status
Proposed

### Context
CLAUDE.md は「レスポンシブは CSS variant で／JS ランタイム分岐を新規導入しない」を方針とする。#588 ADR-003 は、水平クランプの狭幅スキップを「新規分岐の導入ではなく、既存の JS 計測（clamp 自体が元から layout effect）を狭幅でゲートしただけ」として許可した。垂直クランプの計測タイミング・狭幅スキップをどう配線するかが論点。

### Decision
- 垂直クランプは**新しい effect を増やさず**、既存の水平クランプ `useLayoutEffect`（依存 `[open, clampToViewport]`）の中で計測する。`getBoundingClientRect()` を一度だけ取得し、その natural rect から `computeShiftX` と `computeShiftY` を同時に算出して `shiftX`/`shiftY` を set する。
- 狭幅スキップ（`window.innerWidth < POPOVER_SHEET_BREAKPOINT`）は水平・垂直で共有する。`max-sm:fixed max-sm:bottom-0` のボトムシート（#588 ADR-003 / `popoverSheetPanel`）では translateY が干渉するため、狭幅では `shiftY` も 0 のまま。

### Consequences
- 良い点: 新規のランタイム分岐を作らず、既存計測の拡張に留まる（#588 ADR-003 の許可範囲と同じ性質）。水平・垂直が同一 rect・同一スキップ条件で整合。
- トレードオフ: 水平・垂直の関心が1つの effect に同居するが、両者は「ビューポート内へ収める」同一責務で凝集は高い。

---
