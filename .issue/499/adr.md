# ADR — Issue #499: ノート一覧のクリック領域を行全体に拡張

## ADR-001: 行全体クリック化の実装パターン（block Link ラップ vs stretched-link）

### Status
Proposed

### Context
ListView / CalendarView のクリック領域を見出しのみから行全体に拡張するにあたり、2 案があった。

1. **行全体を `<Link>`/`<button>` でラップ** — TileView と同じく行本体を `block` な Link で包み、選択モード時は `<button>`（チェックボックストグル）に切替える。
2. **stretched-link パターン** — 見出しの `<Link>` を残しつつ `::after` を絶対配置で行全体に広げ、クリック領域だけ拡張する。

ListView の行内には選択モード時の `NoteCheckbox`（インタラクティブ要素）が同居する。タグは現状ただの `span` でリンクではない。

### Decision
**案1（block Link ラップ）を採用**。

- TileView が既にこのパターン（`block` Link / 選択時 `button` / チェックボックスはラッパー外）を確立しており、ListView・CalendarView を揃えれば 3 ビューでクリック挙動が統一される（Issue の一貫性要件を最も満たす）。
- 行内のインタラクティブ要素は選択モード時のチェックボックスのみ。これを Link/button の外側に配置することで、リンク内ネストや二重クリック発火が構造的に発生しない。
- 案2 は utility-first 方針下で絶対配置オーバーレイを別途書く必要があり、将来タグをリンク化する際に他リンクとの相性が悪い（Issue 本文の指摘どおり）。

### Consequences
- 良い点: 3 ビューでクリック挙動・hover ハイライトのパターンが統一される。マークアップ規約（既存 TileView）に沿う。
- トレードオフ: 行全体が `<Link>` になることで excerpt・タグ・更新日時がアクセシブルネームに含まれ冗長化する。これは `aria-label={note.title}` を明示してリンク名を title に固定することで吸収する。

---

## ADR-002: ListView のレイアウト主リファレンスと選択モードの grid 構造

### Status
Proposed

### Context
ListView は横並び行（見出し本体列 | 更新日時列）で、選択時はチェックボックス列が加わる 3 列構造。TileView は縦積みカードでチェックボックスを `absolute` オーバーレイにしているが、行高の低い ListView でオーバーレイを使うと本文に重なる。「行全体を block Link で包む」だけだと grid の `1fr_auto` 2 セル構造（日時の右寄せ）が崩れる。

### Decision
- **主リファレンスは公開側 `UserPublicTop` の `NOTE_ROW`**（`<Link>` 自身が `grid grid-cols-[1fr_auto]` のコンテナで、本体 div と日時 div を直接の子セルにする）。ListView は構造的にこの横並び行に最も近い。選択モードの `<button>` 切替だけ TileView から借りる。
- **選択モード時は二段 grid**:
  - `<li>` を `grid grid-cols-[auto_1fr]`（チェックボックス列 | 本体列）にし、第1セルに `NoteCheckbox`、第2セルに `<button onClick={toggle}>` を置く。
  - その `<button>` をさらに `grid grid-cols-[1fr_auto]`（本体 | 日時）の内側コンテナにする。
  - チェックボックスは button の外側なので、ネスト・二重クリック発火が構造的に発生しない。

### Consequences
- 良い点: grid の右寄せ日時セルを保ったまま行全体クリックを実現。チェックボックスのネスト問題を回避。
- トレードオフ: 非選択（Link が grid）と選択（li が外側 grid + button が内側 grid）でラッパー構造が分岐する。padding をどちらが持つかをモード間で揃え、見た目の一致を実機確認する必要がある。

---

## ADR-003: CalendarView 選択モードのチェックボックス左余白

### Status
Accepted（実装時に追記）

### Context
CalendarView は padding を Link/button 側へ移し `<li>` を `p-0` にした。これにより非選択時は Link が `px-2 py-[6px]` を持ち行余白までクリック領域になる。一方、選択モードのチェックボックスは grid 第1セル（ラッパー外）に置くため、`<li>` の `p-0` 化でチェックボックスが行の左端に密着し、従来（`<li>` が `px-2` を持っていた頃）の 8px 左余白が失われる。

### Decision
チェックボックスを `<span className="pl-2">` で包み、従来と同じ左余白を復元する。button 側 padding（`px-2`）とモード間で水平余白が揃う。

### Consequences
- 良い点: 非選択（Link）/ 選択（button）/ チェックボックス で行の左端余白が一致し、モード切替で横位置がぶれない。
- トレードオフ: チェックボックス用の薄いラッパー span が 1 つ増える。ListView は元々チェックボックスを `self-start pt-1` のラッパー div で包んでおり、そこへ水平余白を足す必要はない（ListView は `<li>` ではなく内側で padding を持たないため別構造）。

---
