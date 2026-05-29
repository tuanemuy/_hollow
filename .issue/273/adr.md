# ADR — Issue #273: pillBtn (common) と PILL_BTN (layout) の 1 系統集約

## ADR-001: 統合先は common 側 (`pillBtn`/`pillBtnPrimary`/`pillBtnDanger`)、押下アニメは全 pill に統一付与

### Status

Accepted

### Context

pill ボタンのスタイルが 2 系統に分かれていた（Issue #257 / PR #270 の ADR-002 で見送られた統合タスク）:

- `app/components/common/styles.ts`: `pillBtn`（base） / `pillBtnPrimary`（`data-[primary]:` 駆動 add-on） / `pillBtnDanger`（`${pillBtn} bg-error-surface text-error hover:bg-error-surface`）
- `app/components/layout/styles.ts`: `PILL_BTN`（`data-[primary]:` / `data-[danger]:` を inline 内包 + `active:scale-[0.985] motion-reduce:active:scale-100`）

class 文字列はほぼ重複。主な差分は (a) `PILL_BTN` のみ押下アニメ `active:scale` を持つ、(b) danger の表現方法（PILL_BTN は `data-[danger]:` inline / common は専用定数 `pillBtnDanger`）、(c) danger の hover 挙動。

選択肢:

- A. common 側 (`pillBtn`/`pillBtnPrimary`/`pillBtnDanger`) を正とし、layout の `PILL_BTN` を削除して 8 consumer を移行
- B. layout の data 駆動単一定数 (`PILL_BTN` の形) を正として common に移設し、`pillBtnPrimary`/`pillBtnDanger` を削除（~18 consumer 改修）

### Decision

**A** を採用。理由:

- Issue 本文が「`pillBtnPrimary` / `pillBtnDanger` の variant パターンの方が拡張性が高い」と common 側をリードしている（ユーザー確認済み）
- `pillBtn` が使われる範囲（ingestion / note / tag / trash / identity / directory / layout）は domain-agnostic であり、`common/styles.ts`（domain-agnostic primitive の置き場）が正規の住所。`layout/styles.ts` は「authenticated app shell」専用で住所が狭い
- 移行対象が 8 consumer（PILL_BTN 側）で済み、多数派の ~28 consumer（common 側）は据え置ける

あわせて、`PILL_BTN` が持っていた押下アニメ `active:scale-[0.985] motion-reduce:active:scale-100` を canonical `pillBtn` に付与する（ユーザー確認済み）。これにより:

- 移行する 8 ボタンは押下フィードバックを失わない
- common 系既存 ~28 ボタンも同じ押下フィードバックを得て、全 pill の挙動が統一される

### Consequences

- 良い点:
  - pill ボタンのスタイル定義が common 1 系統に集約され、将来の片側更新による乖離リスクが解消
  - data-* 駆動 variant（`data-[primary]:`）という CLAUDE.md の Styling 規約に沿った形が残る
  - 全 pill ボタンの押下フィードバックが一致
- トレードオフ:
  - common 系 ~28 ボタンに押下アニメが新たに付く（軽微な視覚変化）。`motion-reduce:active:scale-100` で prefers-reduced-motion 環境では無効化される
  - danger の適用形は当初「`pillBtnDanger`（無条件適用）に置換し `data-danger` 属性を除去」する想定だったが、ADR-003 で `pillBtnDanger` を data 駆動 variant に作り変えたため、最終的には primary と対称の `` `${pillBtn} ${pillBtnDanger}` `` + `data-danger=""` 形に統一した（属性は維持）

### 補足: 将来の variant 拡張方針

`layout/styles.ts` の `ROW_ACTIONS_SMALL_PILL`（高さ 30px の小型 pill。現状 consumer なし）は本 Issue のスコープ外だが、canonical を common の variant 方式に一本化した以上、将来 small pill が必要になった場合は common 側に `pillBtnSmall` 等の variant として足す。layout 側に独自 pill 定数を再び生やさないことで、再度の 2 系統化を予防する。

---

## ADR-002: 移行した danger ボタンの hover は赤を維持する（pillBtnDanger の挙動を正とする）

### Status

Accepted

### Context

danger の hover 挙動が 2 系統で異なっていた:

- `PILL_BTN` + `data-danger`: base の `hover:bg-surface-hover` が当たり、hover 時に赤 (`bg-error-surface`) が外れて灰色寄りになる（`data-[danger]:hover:*` のオーバーライドが無いため）
- `pillBtnDanger`: `hover:bg-error-surface` を明示し、hover 時も赤を維持する

統合で danger を `pillBtnDanger` に寄せると、移行した 8 系統の danger ボタンは hover で赤を維持するようになる。

### Decision

`pillBtnDanger` の挙動（hover でも赤を維持）を正とする。danger アクションの hover で破壊操作の色（赤）が外れて灰色化するのは UX 上むしろ不自然であり、`pillBtnDanger` の挙動の方が望ましい。

### Consequences

- 良い点: danger ボタンが hover でも一貫して赤を保ち、破壊操作であることが視覚的に維持される。common 系 danger（ConfirmDialog 等）と挙動が一致する
- トレードオフ: 移行した 8 ファイルの danger ボタン（IngestionJobRow 破棄、IngestionPreviewForm 破棄、AccountDeleteForm 削除開始、TrashRowActions 完全削除、TagActions 削除）の hover 見た目が従来と変わる。軽微な視覚改善のためブラウザ目視で確認する

> 補足（ADR-003 で判明）: 当初は `pillBtnDanger` を「hover で赤維持」する標準クラスとして寄せる想定だったが、ブラウザ検証で `pillBtnDanger` 自体が（hover 前の通常状態でも）赤を出せず灰色になる既存バグが判明した。ADR-003 で data 駆動 variant に作り変えて解決し、hover 赤維持（`data-[danger]:hover:bg-error-surface`）も同時に担保している。本 ADR-002 の「hover で赤維持」という意図はそのまま保たれる。

---

## ADR-003: `pillBtnDanger` を data 駆動 variant に作り変える（灰色描画バグの修正）

### Status

Accepted

### Context

ブラウザ検証（manual-test）で、`pillBtnDanger` を適用した danger ボタンが**赤ではなく灰色**で描画されることを検出した（`getComputedStyle`: 背景 `rgb(245,245,247)` = surface、文字 `rgb(29,29,31)` = ink）。

原因は旧定義 `` `${pillBtn} bg-error-surface text-error hover:bg-error-surface` `` にある。`pillBtn` が内包する `bg-surface` / `text-ink` と、後段の `bg-error-surface` / `text-error` は同一 CSS プロパティ（background-color / color）を素の（variant なし）utility で指定している。Tailwind では同一プロパティの素 utility の勝敗は **class 文字列の並び順ではなく生成 CSS の出力順**で決まり、本プロジェクトのトークン定義順では `bg-surface` / `text-ink` が後勝ちして danger 色を打ち消していた。

この灰色描画は **main 時点から存在する既存バグ**で、`pillBtnDanger` を使う NoteActions（削除）・ConfirmDialog（確認）・BulkActionBar（ゴミ箱へ）が該当していた。一方、layout の `PILL_BTN` + `data-danger` は `data-[danger]:bg-error-surface` という **variant** で色を指定しており、variant utility は素 utility より後に並ぶため確実に勝ち、正しく赤く描画されていた。

本 Issue の統合で layout danger（8 系統）を旧 `pillBtnDanger` に寄せると、赤→灰色の**退行**が発生する。

### Decision

`pillBtnDanger` を `pillBtnPrimary` と同じ **data 駆動 variant の add-on** に作り変える:

```ts
export const pillBtnDanger =
  "data-[danger]:bg-error-surface data-[danger]:text-error data-[danger]:hover:bg-error-surface";
```

適用形は `` className={`${pillBtn} ${pillBtnDanger}`} `` + `data-danger=""`（primary と完全に対称）。variant utility は素 utility の後に並ぶため `bg-surface` を確実に上書きし、赤が描画される。

全 9 consumer（移行した 6 + 既存の NoteActions / ConfirmDialog / BulkActionBar）をこの適用形に統一した。

### Consequences

- 良い点:
  - danger ボタンが確実に赤く描画される（ブラウザ検証で `rgb(251,235,235)` / `rgb(196,62,62)` を確認）
  - layout danger の退行を防止
  - **既存の灰色バグ（NoteActions / ConfirmDialog / BulkActionBar）も同時に修正**された
  - `pillBtnPrimary`（data 駆動）と API が対称になり、pill ボタンの variant 機構が「base + data 駆動 add-on」で一貫。Issue が評価した「data 属性駆動の variant パターン」を真に体現する
- トレードオフ:
  - 本 Issue のスコープを既存 common consumer 3 ファイル（NoteActions / ConfirmDialog / BulkActionBar）へ広げた。ただしいずれも統合対象の `pillBtnDanger` を使う同一機構であり、灰色のまま残すと「統合された pill システム」が壊れているため、その場修正が妥当（skill のスコープ方針に合致）
  - consumer は `data-danger=""` 属性の付与が必須になった（primary と同じ運用）。付け忘れると danger 色が出ないため、`pillBtnDanger` の JSDoc に適用形を明記した

---
