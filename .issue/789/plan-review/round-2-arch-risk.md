# Plan Review — Issue #789 (Round 2: アーキテクチャ整合性・実現可能性・リスク)

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

## 総評

1周目の指摘はおおむね適切に反映されている。activeIndex を `-1`（無アクティブ）へ変更（P-001）、`tagInputControl` への `focus-visible:shadow-none` 追加（P-002）、最終ゲートのステップ独立（coverage P-001）、committed/候補の同一正規化（S-002）、空 draft でのエラー非表示（S-003）、commit 単位=検証単位（S-001）、ADR-004 の Popover vs 手書き絶対配置のトレードオフ記録（S-004）、テスト DOM 構造刷新の具体化（S-005）まで、ADR と plan の双方に整合的に落とし込まれている。コード照合で `titleInput` の `focus-visible:shadow-none` 前例（styles.ts:17-18）と `dirDropdownPanel` の `max-sm` 全幅化（styles.ts:121-122）も実在を確認した。ADR-004 のモバイルはみ出し吸収の前提は成立する。

ただし **1周目の P-001 修正（`activeIndex = -1` 化）が、plan が「コピーせず再利用する」と明記している `nextActiveIndex` / `clampActiveIndex`（`directoryTreeModel.ts`）の実装と非互換**であることが新たに判明した。再利用ヘルパは index の下限を 0 と仮定しており、`-1` センチネルを通すと「↓ で先頭候補を飛ばす」という別のバグを生む。これは要修正。

## 検証した事実（コード照合）

- `clampActiveIndex(index, count)`（directoryTreeModel.ts:150-155）は `if (index < 0) return 0;` を持つ。つまり **`-1` を渡すと必ず `0` に潰す**。
- `nextActiveIndex(current, dir, count)`（同:161-170）は内部で `clampActiveIndex(current, count)` を先に通す。したがって
  - `nextActiveIndex(-1, "down", n)` = `(clamp(-1)=0 + 1) % n` = **`1`**（先頭の index 0 を飛ばして 2 件目へ）
  - `nextActiveIndex(-1, "up", n)` = `(0 - 1 + n) % n` = `n-1`（末尾。これは偶然妥当）
- `DirectoryTreeSelect` は `activeIndex` 初期値 `0`（DirectoryTreeSelect.tsx:65）で、さらに `useEffect(() => setActiveIndex(clampActiveIndex(current, options.length)))`（同:91-93）で **options 長が変わるたびに index を実在 option に丸める**。このパターンを TagsInput がそのまま流用すると、draft 変化で `-1` に戻しても直後の clamp 効果が `0` に押し戻し、「無アクティブ既定」が成立しない。

---

## 問題点（要修正）

- **[P-001]** 1周目修正で導入した `activeIndex = -1`（無アクティブ）センチネルが、plan が「コピーせず再利用」と明記する `nextActiveIndex` / `clampActiveIndex` と非互換。
  - 理由: 
    (a) `nextActiveIndex(-1, "down", n)` は `1` を返す（`clampActiveIndex` が先に `-1→0` に潰してから +1 するため）。結果、**無アクティブ状態から ↓ を押すと先頭候補（index 0）を飛ばして 2 件目がハイライトされる**。これは P-001 修正が意図した「ユーザーが ↑↓ を押して初めて候補がハイライトされる（最初の ↓ で先頭候補）」に反し、新たな操作バグになる。
    (b) plan 設計ステップ 1 は「`clampActiveIndex`/`nextActiveIndex` は directoryTreeModel から再利用（コピーしない）」と明記し、ステップ 3 は「候補があれば `nextActiveIndex` で移動」とするだけで、`-1` 始点の特別扱いに触れていない。
    (c) さらに DirectoryTreeSelect 流の「options 長変化で `clampActiveIndex` に丸める useEffect」（DirectoryTreeSelect.tsx:91-93）を踏襲すると、`clampActiveIndex(-1, n) = 0` のため **draft 変化で `-1` に戻しても即座に `0` へ押し戻され、無アクティブ既定が成立しない**（P-001 修正の前提が崩れる）。
  - 提案: 次のいずれかを plan/ADR-003 に明記する。
    1. `-1` 始点を扱う薄いラッパ（または分岐）を TagsInput 側に置く: 「`activeIndex < 0` のとき ↓ は `0`、↑ は `count-1` を返す。それ以外は `nextActiveIndex` に委譲」。これなら既存ヘルパは無改変のまま、`-1` 始点の挙動だけ正す。
    2. `nextActiveIndex` を「`current < 0` を no-selection として扱う」よう拡張し、DirectoryTreeSelect（初期 `0` だが `-1` は渡さない）にも後方互換であることをテストで担保する（共有ヘルパ拡張なので回帰テスト必須）。
    3. clamp 効果は「`-1` は保持し、`index >= count` の上限超過時のみ丸める」専用ロジックにする（DirectoryTreeSelect の length-clamp useEffect をそのまま流用しないことを明記）。あるいは clamp useEffect 自体を置かず、commit/絞り込みのたびに明示的に `-1` リセットする設計に一本化する。
    いずれにせよ「`nextActiveIndex`/`clampActiveIndex` をそのまま流用すれば足りる」という現 plan の前提は誤りなので、`-1` センチネルの取り回しを設計ステップ 1/3 とテスト（最初の ↓ が先頭候補を選ぶ／draft 変化後も `-1` が保持される）に固定すること。

---

## 改善提案（検討推奨）

- **[S-001]** `aria-expanded` の値を `open && hasSuggestions` にする旨を明記する。
  - 理由: plan ステップ 3 は `aria-expanded={hasSuggestions}` とするが、Escape で `open=false` にした後も候補が存在すれば `hasSuggestions` は true のまま。パネル非表示なのに `aria-expanded="true"` になり、`aria-controls` が指す listbox が DOM に無い状態と矛盾する（DirectoryTreeSelect は `aria-controls`/`aria-activedescendant` を listbox 実在時のみ条件付与している:243-246）。`aria-expanded` は実際にパネルが開いている `open && hasSuggestions` を反映し、`aria-controls`/`aria-activedescendant` も同条件で付与する。

- **[S-002]** 「新規作成」行がキーボードナビゲーションの対象 option かどうかを明記し、activeIndex の上限（option 件数）と一致させる。
  - 理由: `directoryTreeModel.ts` の JSDoc が強調するとおり「activedescendant の index は可視 option 件数と厳密に一致」が不変条件。plan ステップ 3 は「先頭/末尾に『新規作成』行を出す」とするが、それが (a) ナビ可能な `role="option"`（その場合 `count = suggestions.length + 1`、`nextActiveIndex` の count もこれに合わせる）なのか、(b) 非インタラクティブな表示インジケータ（その場合 count は `suggestions.length` のまま）なのかで index 計算と option ref 配列長が変わる。P-001 の `-1` 既定 Enter（draft を新規確定）と、新規行を option として選ぶ経路が二重になる点も含め、どちらの設計かを確定し、`activeOptionId`/ref 配列/`nextActiveIndex(count)` を一貫させること。

- **[S-003]** パネルの「開く」トリガー条件を明文化する。
  - 理由: plan は `open` を local `useState` とするが、いつ `true` になるか（onFocus か onChange か、draft 非空かつ候補ありの時か）が未記述。Escape クローズ後の再オープン（再度タイプで開く）も含め、開閉のトリガーを設計ステップ 3 に 1〜2 行で固定しておくと、`aria-expanded`（S-001）と blur クローズの整合が取りやすい。実装時の解釈ぶれを防ぐ軽微な明確化。

## 良い点

- 1周目の全 P/S が plan・ADR の双方に具体的に反映され、「レビュー履歴」節で各指摘の解消内容（どのステップ/ADR をどう直したか）まで追跡可能になっている。トレーサビリティが高い。
- ADR-003 が「DirectoryTreeSelect は draft=検索フィルタなので 0 再アンカー可、TagsInput は draft=確定値なので `-1`」というインライン combobox 固有の前提差を Decision/Consequences に正しく言語化している（方向性は妥当。実装手段が P-001 で要補強なだけ）。
- ADR-004 の手書き絶対配置トレードオフ（外側クリック/viewport クランプを自前担保、モバイルは `dirDropdownPanel` の `max-sm` で吸収）がコードと整合（styles.ts:121-122 で確認）。実フォーカスを input に残す設計と focus-trap 不要の判断は一貫。
- 検証 SSOT を `TagName.create` に一本化（ADR-002）し、committed（生文字列）と候補（DB 正規化済み）双方に同一正規化を適用してから比較する S-002 反映は、reducer が trim のみ（NFKC/`#`除去なし）である実装事実に正しく対応している。
- 内側レイヤー（reducer/ドメイン/ユースケース/アダプター）無改修・フロント完結の方針は維持され、レイヤー依存方向を一切侵さない。`tagSuggestions` 任意化による後方互換も妥当。

## 返答

- 問題点: 1 / 改善提案: 3
- [P-001] `activeIndex = -1` センチネルが再利用ヘルパ `nextActiveIndex`/`clampActiveIndex` と非互換（↓ で先頭候補を飛ばす／clamp が `-1` を `0` に潰す）。`-1` 始点の取り回しを設計ステップとテストに固定する要修正。
- [S-001] `aria-expanded` は `hasSuggestions` でなく `open && hasSuggestions` を反映する。
- [S-002] 「新規作成」行がナビ対象 option か否かを明記し、activeIndex の上限件数と一致させる。
- [S-003] パネルの開閉トリガー条件（onFocus/onChange/Escape 後の再オープン）を明文化する。
