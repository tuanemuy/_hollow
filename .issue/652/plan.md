# 実装計画 — Issue #652: 共有 Popover が垂直ビューポート処理を持たず、下方向メニューの末尾項目が画面外でマウス選択できない

**Issue:** #652
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

共有 Popover プリミティブ `usePopover` に、既存の水平クランプ（`computeShiftX` / `shiftX` / `translateX`）と対称的な **垂直クランプ**（`computeShiftY` / `shiftY` / `translateY`）を opt-in で追加し、トリガーがビューポート下部寄りにあっても下方向に開くメニューの末尾項目が画面内に収まり、実マウスでクリックできるようにする。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | 高さの低いビューポート（例: 633px）で `/u/test-public-user` のソートメニューを開いたとき、末尾項目「タイトル順」が画面内に収まり、実マウスクリックで `?sort=title` に遷移できる（メニューが outside-mousedown で閉じない） | Issue 本文 再現手順 / #619 TC-002 | 1, 2, 3 |
| AC-2 | 通常のデスクトップ高さ・キーボード操作・URL 直接遷移では従来どおり全ソート軸が選択できる（回帰なし） | Issue「ロジックは健全」 | 1, 3, 5 |
| AC-3 | 垂直クランプの px 計算が純粋関数 `computeShiftY` として happy-dom でユニットテストできる（`computeShiftX` のテストパターンに倣う） | Issue やること4 / `usePopover` 既存テスト方針 | 1, 4 |
| AC-4 | `max-sm` シートパネル（#588 ADR-003、`max-sm:fixed max-sm:bottom-0`）では垂直クランプがスキップされ、ボトムシートのレイアウトに干渉しない | Issue 重要原則「max-sm sheet との相互作用」 | 1, 2, 4, 5 |
| AC-5 | auth 側の下方向メニュー（FilterBar の `VisibilityPopover` / `DatePopover` / `TagPickerPopover`）と既存の actions メニュー・上方向 UserMenu が回帰しない | Issue 影響範囲 | 3, 5 |

## スコープ

### 含まれないもの
- **上方向フリップ（`top-full` ⇄ `bottom-full` のアンカー切替）**: アンカーは consumer の `panelClassName`（`absolute right-0 top-full …`）が持ち、usePopover はそれを知らない。フリップには新 API（アンカー宣言の prop 化）が要り抽象化粒度が大きく変わる。本 Issue は垂直クランプ（translateY）で末尾項目の到達性を担保する方針を採るため、フリップは対象外（→ adr.md ADR-001）。
- **パネルへの `max-height` + 内部スクロールの一律付与**: パネル高がビューポート高を超える極端ケース（4項目のソートメニューでは発生しない）への備えであり、本 Issue の実害（短いビューポートでの末尾項目のはみ出し）は垂直クランプで解消する。max-height は将来パネルがビューポート超の高さを持つ consumer が現れたとき consumer 側 `panelClassName` で付与する（TagPicker が既に `max-h-[min(60vh,400px)]` を持つ前例）。usePopover への一律付与は行わない（→ adr.md ADR-001 / ADR-002）。
- ソート/フィルタの**ロジック・ルーティング・バックエンド**: Issue で「健全」と確認済み。無変更。

### 縦長パネル（パネル高 > ビューポート高）の扱い

`computeShiftY` は「下端はみ出しを先に補正→次に上端を補正」の順序のため、**パネル高がビューポート高を超える場合は上端補正が後段で勝ち、先頭項目が画面内に見える位置に収まる**（末尾は内部スクロール/到達不可のまま）。これは水平 `computeShiftX` と対称な設計（右端補正→左端補正で、超過時は左端＝先頭が勝つ）であり、意図どおり。本 Issue のスコープ（4項目の短いソートメニュー）ではパネル高がビューポート高を超えないため発生しないが、DatePopover 等の縦長になりうる clamp consumer が短いビューポートで開いた場合の挙動として上記を明記する。`max-height` + 内部スクロールの一律付与は引き続きスコープ外とし、パネル高がビューポート超になる consumer が現れたとき consumer 側 `panelClassName` で個別に対応する（TagPicker の `max-h-[min(60vh,400px)]` が前例）。

## 調査結果

- 関連ファイル:
  - `app/components/common/usePopover.ts` — 第1層プリミティブ（#467 ADR-001）。`computeShiftX`（純粋関数）+ `shiftX` state + `useLayoutEffect` 計測 + `panelStyle.transform = translateX(...)`。`clampToViewport` opt-in。`POPOVER_SHEET_BREAKPOINT(=640)` で狭幅時に水平クランプをスキップ（#588 ADR-003）。**垂直処理は皆無**。
  - `app/components/common/Popover.tsx` — `usePopover` のレンダープロップ・ラッパ。`menu`/`listbox`/`dialog` の3分岐 JSX に `style={popover.panelStyle}` を適用。`panelStyle` を経由するので transform 拡張は Popover 無変更で反映される。
  - `app/components/common/useRovingMenu.ts` — 第2層 roving tabindex（menu 専用）。垂直配置とは独立。本 Issue で無変更。
  - `app/components/common/__tests__/Popover.test.tsx` — `computeShiftX` の純粋関数テスト（happy-dom はレイアウト無 → `getBoundingClientRect` 全0なので純粋関数で検証）+ 1 件だけ `getBoundingClientRect` を `vi.spyOn` でスタブして DOM 経由 translateX を検証。垂直版も同パターンで追加できる。
  - `app/components/public/PublicTopControls.tsx` — `SortPopover`（`Popover`+`useRovingMenu`、`clampToViewport`、`SORT_MENU_PANEL` は `absolute right-0 top-full`）。本件の再現箇所。
  - `app/components/note/list/FilterBar.tsx` — `VisibilityPopover`（menu）/`DatePopover`（dialog）/`TagPickerPopover`（listbox）。全て `clampToViewport` + `top-full`。共有基盤の修正なので回帰確認対象。
  - `app/components/layout/UserMenu.tsx` — `bottom-full`（上方向に開く）。垂直クランプ対象外であるべき（下端問題は起きない）。
  - `app/components/common/styles.ts` — `popoverSheetPanel`（`max-sm:fixed max-sm:bottom-0`）。`menuPanel`。
  - `app/components/public/styles.ts` — `SORT_MENU_PANEL`（`max-sm:fixed max-sm:bottom-0`）。
- あるべきアーキテクチャ:
  - #467 ADR-001: Popover は dismiss + ARIA + focus 復帰 + **shiftX** を担う第1層。垂直クランプはこの「ビューポート内に収める」責務の自然な拡張で、第1層が持つのが正。
  - CLAUDE.md「responsive は CSS variant で／JS ランタイム分岐を新規導入しない」: 既存の clamp は元から layout effect の JS 計測であり、#588 ADR-003 がその狭幅ゲートを「新規分岐の導入ではなく既存計測のゲート」として許可済み。垂直クランプも同じ既存 layout effect 内で完結させ、新規の独立した分岐は作らない。
  - 純粋関数 + layout effect + transform のパターンを踏襲（新ライブラリ導入なし）。
- 既存実装の状態: 水平クランプは完備、垂直は皆無。本 Issue で水平と対称な垂直クランプを追加して乖離を埋める。
- 依存関係: `usePopover` は全 Popover の共通基盤。`panelStyle.transform` の拡張は `Popover.tsx` 無変更で全 consumer に波及する（opt-in なので `clampToViewport` 利用 consumer のみ）。

## 設計

ドメイン/アプリケーション/アダプター層への影響は **なし**（フロントエンドのプレゼンテーション層のプリミティブのみの変更）。

### UI / プレゼンテーション

中心は `usePopover` の水平クランプと**対称**な垂直クランプの追加。

**(A) 純粋関数 `computeShiftY`（`computeShiftX` と対称）**
- シグネチャ: `computeShiftY(rect: { top: number; bottom: number }, viewportHeight: number, margin = VIEWPORT_MARGIN): number`
- 下端はみ出しを先に補正、次に上端。`computeShiftX` の `left/right` を `top/bottom`、`viewportWidth` を `viewportHeight` に置換しただけのロジック:
  ```
  let shift = 0;
  if (rect.bottom > viewportHeight - margin) shift = viewportHeight - margin - rect.bottom;
  if (rect.top + shift < margin) shift = margin - rect.top;
  return shift;
  ```
- happy-dom でレイアウト無しでもユニットテスト可能（AC-3）。
- JSDoc は `computeShiftX`（`usePopover.ts:52-59`）と対称に「natural（unshifted）rect を受け取る」前提を明記する。後続の変更者が rect を「shift 適用後」と誤解しないようにするため。順序は「下端補正→上端補正（縦長パネルでは上端＝先頭が勝つ）」である旨も書く。

**(B) `shiftY` state + layout effect**
- `clampToViewport` が true のときだけ、既存の水平クランプ layout effect と**同じ effect 内**で `computeShiftY` を計測・適用する（独立 effect を増やさない）。
- 狭幅スキップは水平と共有: `window.innerWidth < POPOVER_SHEET_BREAKPOINT` の早期 return は垂直にも効く（`max-sm:fixed max-sm:bottom-0` のボトムシートでは translateY が干渉するため、AC-4）。`shiftY` も reset/close 時に 0 へ戻す。
- 計測順の注意: `shiftX` を `setShiftX` した後の rect は同 effect 内では更新前。水平・垂直は独立軸なので、`shiftX` 適用前の natural rect（`getBoundingClientRect()` 一回分）から両軸を同時に算出して両 state を set する（rect は一度だけ取得し `computeShiftX`/`computeShiftY` の両方へ渡す）。

**(C) transform の合成**
- 現状 `transform: translateX(${shiftX}px)`。両軸対応に拡張:
  - 両方 0 → `undefined`（現状維持）
  - どちらか非0 → `transform: translate(${shiftX}px, ${shiftY}px)`（`translate()` 2引数で水平のみ/垂直のみも表現できる）
- `Popover.tsx` は `popover.panelStyle` をそのまま渡すだけなので**無変更**。

**(D) consumer 側**
- `SortPopover` / FilterBar 各 popover は既に `clampToViewport` を渡しているので、垂直クランプは**自動で有効化**され、consumer 側の変更は不要。`SORT_MENU_PANEL` 等のアンカー（`top-full`）も無変更。
- UserMenu は `clampToViewport` を渡していない（`bottom-full` 上方向）ので影響なし。

## 実装ステップ

### 1. `computeShiftY` 純粋関数と垂直クランプ計測を `usePopover` に追加

- **対象ファイル:** `app/components/common/usePopover.ts`
- **変更内容:**
  - `computeShiftX` の直後に対称な `export function computeShiftY(rect, viewportHeight, margin)` を追加（JSDoc も `computeShiftX` のものに倣い「縦版」と明記）。
  - `shiftY` state を追加（`shiftX` と並列）。
  - 既存の水平クランプ `useLayoutEffect` を拡張: `clampToViewport` && open && 幅 >= breakpoint のとき、`rect` を一度取得し `computeShiftX`/`computeShiftY` の両方を算出、それぞれ非0なら `setShiftX`/`setShiftY`。close/非 clamp 時は両方 0 にリセット。
  - `panelStyle` を `shiftX`/`shiftY` の合成（`translate(x, y)`）に変更。両 0 のとき `undefined`。
- **理由:** AC-1/AC-3/AC-4。水平クランプと対称な垂直クランプを第1層プリミティブ（#467 ADR-001 の責務）に追加する。

### 2. 狭幅シートとの相互作用の確認（コード）

- **対象ファイル:** `app/components/common/usePopover.ts`（ステップ1の effect 内で完結）
- **変更内容:** 既存の `window.innerWidth < POPOVER_SHEET_BREAKPOINT` 早期 return が垂直クランプもゲートすること（`shiftY` が 0 のまま）をコードと JSDoc で担保。`max-sm:fixed max-sm:bottom-0` パネルに translateY が乗らない。
- **理由:** AC-4。#588 ADR-003 のボトムシート前提を壊さない。

### 3. consumer の無変更確認

- **対象ファイル:** `app/components/public/PublicTopControls.tsx`, `app/components/note/list/FilterBar.tsx`, `app/components/layout/UserMenu.tsx`（変更せず確認のみ）
- **変更内容:** `clampToViewport` を渡している consumer（Sort/Visibility/Date/TagPicker）が自動で垂直クランプを得ること、UserMenu（非 clamp・`bottom-full`）が無影響であることを確認。consumer 側コード変更は不要。
- **理由:** AC-1/AC-5。共有基盤の修正で consumer に波及させる設計の確認。

### 4. ユニットテスト追加・既存テスト更新

- **対象ファイル:** `app/components/common/__tests__/Popover.test.tsx`
- **変更内容:**
  - **既存テストの更新（必須）:** 既存テスト `applies a translateX clamp when the panel overflows the viewport`（`Popover.test.tsx:305`）は `expect(panel()?.style.transform).toContain("translateX(")` と **`translateX(` を文字列マッチ**している。本計画 (C) で水平のみクランプ時の transform が `translateX(8px)` → `translate(8px, 0px)` に変わる（値は等価だが文字列が変わる）ため、このアサーションは**必ず失敗する**。期待値を新しい transform 出力形式に更新する（`toContain("translate(")`、または `translate(<shiftX>px, 0px)` の完全一致）。新規追加だけでなく、この既存テストのアサーション更新が必須である。
  - `describe("computeShiftY")` を追加し、`computeShiftX` の3ケース（フィットで0 / 下端はみ出しで上シフト / 上端はみ出しで下シフト）と対称なテストを書く。
  - **上端優先ケース（縦長パネル）の1ケース追加:** パネル高 > ビューポート高（下端も上端も両方はみ出す）rect を渡し、`computeShiftY` が**下端補正後に上端補正が勝つ＝上端を `margin` に合わせる（先頭を見せる）**正の shift を返すことを固定する。将来対応（max-height）との境界を回帰テストで固定する（S-002）。
  - 既存の「applies a translateX clamp …」DOM スタブテストに倣い、`getBoundingClientRect` を下端はみ出しでスタブ + `window.innerHeight` を上書きし、`panel().style.transform` に `translate(`（垂直シフト）が乗ることを検証する1ケースを追加。`innerWidth < breakpoint` のときシフトが乗らない（スキップ）ケースも1つ追加して AC-4 を固定。
- **理由:** AC-3/AC-4 の回帰防止と AC-2（既存 translateX 文字列マッチテストの破壊を防ぐ）。happy-dom 制約（レイアウト無）を純粋関数 + スタブで回避する既存方針を踏襲。

### 5. 手動・回帰確認

- **対象ファイル:** なし（検証）
- **変更内容:** `pnpm dev` + 高さ633px のビューポートで `/u/test-public-user` のソートメニュー末尾「タイトル順」を実マウスクリック → `?sort=title` 成功（AC-1）。FilterBar（auth）の各 popover をトリガーが下部寄りの短いビューポートで開き、末尾項目がクリックできること・通常高さで回帰がないことを確認（AC-5）。UserMenu（上方向）の無回帰確認。
  - **狭幅シート確認（S-001）:** `max-sm`（< 640px 幅）のビューポートで Sort/Filter を開き、ボトムシート（`max-sm:fixed max-sm:bottom-0`）が正しく bottom 固定され、translateY がレイアウトに干渉していないことを実機で視覚確認する（AC-4 を実挙動で閉じる）。
  - **縦長パネル確認（2周目 S-001）:** 縦長になりうる `DatePopover` を短いビューポートで開き、上端優先（先頭が見える位置にクランプされる）挙動が実機でも想定どおりで、レイアウトが破綻しないことを確認する。
- **完了条件:**
  - #619 TC-002（`.issue/619/manual-test/report.md`）の再現が解消されることを確認する（Issue 間トレーサビリティ, S-003）。
- **理由:** AC-1/AC-2/AC-4/AC-5。

## 設計判断

- ADR-001: 期待動作3案（フリップ / 垂直クランプ（スクロールイン）/ max-height+内部スクロール）から **垂直クランプ（translateY）** を選択。既存の水平クランプと対称で、純粋関数 + layout effect + transform のパターンに最も整合し、新 API・新ライブラリ不要。
- ADR-002: 計測は既存の水平クランプ layout effect 内で `rect` 一回取得から両軸同時算出（独立 effect を増やさず、CLAUDE.md の「新規ランタイム分岐を作らない」方針を維持）。
- 詳細は `.issue/652/adr.md`。

## リスクと注意点

- **既存 translateX 文字列マッチテストの更新が必須**: 既存テスト `applies a translateX clamp …`（`Popover.test.tsx:305`）は `transform` を `translateX(` で文字列マッチしている。本計画 (C) で水平のみクランプ時の transform 文字列が `translateX(8px)` → `translate(8px, 0px)` に変わる（値は等価だが文字列が変わる）ため、このアサーション更新を怠ると AC-2「回帰なし」に反する確実な失敗になる。ステップ4で明示的に更新する。`translateX(` の参照は `usePopover.ts` 本体とこのテスト1箇所のみで影響は閉じている（他 consumer は `panelStyle` をオブジェクトとして透過するだけ, S-001）。
- **共有基盤の修正**: `usePopover` は全 Popover の共通基盤。`clampToViewport` opt-in のため非 clamp consumer（actions メニュー・UserMenu）は無影響だが、clamp consumer（Sort/Visibility/Date/TagPicker）全てに波及する。回帰確認はステップ5で全 clamp consumer を対象にする。
- **縦長パネルは上端優先**: `computeShiftY` は下端補正→上端補正の順序のため、パネル高 > ビューポート高では上端補正が勝ち**先頭項目が見える**位置に収まる（末尾は到達不可のまま）。本 Issue の4項目メニューでは発生しないが、DatePopover 等の縦長になりうる clamp consumer が短いビューポートで開いた場合の挙動として認識しておく。max-height の一律付与はスコープ外（consumer 側 `panelClassName` で個別対応）。
- **translateY による視覚的重なり**: 下端でクランプすると、パネルがトリガーに一部重なる可能性がある（上方向フリップなら重ならない）。ただし非モーダルのメニューであり、項目の到達性が最優先（Issue の期待動作）。実害なし。フリップが将来必要なら別 Issue（スコープ外）。
- **happy-dom にレイアウトが無い**: 垂直クランプの効果は純粋関数 `computeShiftY` + `getBoundingClientRect`/`window.innerHeight` スタブでしか自動テストできない。実ブラウザの最終確認はステップ5の手動検証で担保する。
- **rect 取得タイミング**: `shiftX`/`shiftY` を適用する前の natural rect から両軸を算出する。effect は open 遷移ごとに一度だけ走る（依存 `[open, clampToViewport]`）ので、適用後の再計測ループは起きない（水平の既存設計を踏襲）。

## テスト方針

- ユニット（`Popover.test.tsx`, happy-dom, ステップ4）:
  - `computeShiftY`: フィットで0 / 下端はみ出しで負シフト / 上端はみ出しで正シフト。
  - `computeShiftY` 上端優先: パネル高 > ビューポート高（両端はみ出し）で上端を margin に合わせる正シフトを返す（縦長パネルで先頭を見せる, S-002）。
  - DOM スタブ: 下端はみ出し rect + `innerHeight` 上書きで `transform` に `translate(` が乗る。
  - 狭幅（`innerWidth < POPOVER_SHEET_BREAKPOINT`）でシフトが乗らない（AC-4）。
  - 既存の `applies a translateX clamp` テストのアサーションを新 transform 形式（`translate(`）に更新（必須）。
  - 既存の `computeShiftX` / dismiss / role / multiselectable テストが回帰しないこと。
- 手動（ステップ5, 実ブラウザ）: 短いビューポートでの Sort/Filter メニュー末尾項目のマウスクリック成功、狭幅シートの bottom 固定確認、通常高さ・キーボード・UserMenu の無回帰、#619 TC-002 の解消確認。
- `pnpm typecheck && pnpm lint:fix && pnpm format` を変更後に実行。

## レビュー履歴

- 1周目（2026-06-13）: coverage P-001（欠番ステップ参照）/ P-002（縦長パネルケースの扱い）+ arch-risk P-001（既存 translateX 文字列マッチテストの破壊）を反映。改善提案 S-001（狭幅シートの実機視覚確認）/ S-002（上端優先ケースのユニットテスト + JSDoc の natural rect 前提明記）/ S-003（#619 TC-002 解消のトレーサビリティ）を取り込み。実装ステップ番号を 1〜5 の連番に整理（旧 6,7 → 4,5）し、受け入れ基準表・設計セクション・テスト方針の参照も連番に統一。
- 2周目（2026-06-13）: 両視点とも問題点ゼロで終了。改善提案として coverage S-001（DatePopover を縦長パネルの実機確認に名指し）をステップ5に追記。arch-risk S-001（既存テスト更新は `toContain("translate(")` を第一候補に）は計画に既出のため追記不要と確認。
