# ADR — Issue #461: UIコントロール寸法のばらつき横断見直し

## ADR-001: `text-[13px]`（56箇所/32ファイル）の解消方針

### Status
Accepted（実装で確定）

### Context
`text-[13px]` が 56箇所/32ファイルに散在しており、Tailwind 標準スケール外の任意値として SSOT 原則から逸脱している。これだけ広範に使われている事実は「`text-xs`(12px) と `text-base`(14px〜) の中間の固定サイズ」に実需があることを示す。

ただしこのプロジェクトのタイポグラフィスケールは**全て fluid（clamp）**で定義されている:
- `--text-xs: clamp(11px, 0.7vw + 9px, 12px)`（最大12px）
- `--text-sm: clamp(12px, 0.8vw + 10px, 13px)`（最大13px）
- `--text-base: clamp(14px, 1vw + 11px, 16px)`

つまりデスクトップ幅では `text-sm` の実効値は 13px であり、`text-[13px]` は「`text-sm` の上限を固定したもの」に等しい。小画面では fluid な `text-sm` が 12px へ縮むのに対し、`text-[13px]` は 13px のまま。

選択肢:
- **(A) 固定13pxの新トークンを追加**（例 `--text-label` / `--text-xs2`）。視覚値13pxを完全維持。
- **(B) `text-sm` に寄せて統合**。任意値を完全排除し、システムの fluid 思想に一致。ただし小画面で 13px→12px に縮む。
- **(C) 任意値のまま放置**。スコープ上 NG。

### Decision
**(B) `text-sm` への統合を採用する。新トークンは作らない。** 理由:
- このプロジェクトのタイポグラフィは fluid スケールが SSOT であり、**固定px値のトークンを新設するのはシステム思想に逆行する**。新トークンは「fluid スケールの例外」を制度化してしまう。
- `text-[13px]` はデスクトップで `text-sm`(上限13px) と同値。差が出るのは小画面で 13px→12px に縮む点のみで、ラベル/メタ/エラー文言という用途では 12px への縮小は許容範囲（むしろ小画面では他テキストと整合する）。
- **既存実装が既にこのパターンを採用している**: `public/styles.ts:59` は `text-[13px] max-sm:text-xs` と小画面で手動 12px へ落としており、(B) が `text-sm`(clamp) で自動実現する挙動そのもの。「小画面で13px→12px」は既存設計が意図的に選んだパターンで、実害が低いことの裏付け。
- 56箇所を `text-sm` に置換すれば任意値が完全に消え、原型（`fieldLabel`/`formError` 等）も標準ユーティリティで表現できる。
- 置換と同時に、`text-[13px] max-sm:text-xs` のように小画面用 utility を手動併記している箇所は、`text-sm` 一本にして冗長な `max-sm:text-xs` を掃除する。

フォールバック: 置換後の目視確認で「小画面で 13px→12px に縮むことで可読性・レイアウトが崩れる箇所」が出た場合に限り、その箇所のみ (A) 固定トークン新設を再検討する（typography scale は管理画面上書き対象外なので、その場合も `app/core/domain/adminSettings/defaults.ts` の `BUILTIN_DESIGN_TOKENS` には追加しない）。

### Consequences
- 良い点: 任意値が完全消滅。fluid スケール思想と一致。新トークンを増やさずに済む。原型が標準ユーティリティで表現できる。冗長な `max-sm:text-xs` 併記も解消。
- トレードオフ: 小画面で対象テキストが 13px→12px に縮む。視覚差は軽微で既存に前例あり。目視確認で崩れがないことを担保する。

---

## ADR-002: `text-[15px]` の扱い

### Status
Accepted（実装で確定）

### Context
`text-[15px]` は 4箇所のみ。実コードでの内訳: `public SEARCH_FORM_INPUT`(public/styles.ts:104)・`public GATE_INPUT`(:142)（public 大型入力、意図的なタッチ/ヒーロー強調）、`PAGE_SUBTITLE`(layout/styles.ts:88)、`IngestionJobRow` JOB_CARD_NAME(:46)。`--text-md: clamp(15px, 1vw + 12px, 17px)`（最小15px）が存在する。なお auth INPUT は `text-md` であって `text-[15px]` ではない。

### Decision
トークン化しない。public の大型入力は意図的な差として維持。`PAGE_SUBTITLE` / `IngestionJobRow` JOB_CARD_NAME は `text-md`（最小15px）へ寄せられるか個別判断する（fluid化で上限17pxまで伸びる点を目視確認）。需要が薄く（4箇所）、新トークン化のコストに見合わない。

### Consequences
- 良い点: 不要なトークン増加を避ける。
- トレードオフ: `text-[15px]` が一部残る可能性。残す場合は意図的差として根拠を残す。

---

## ADR-003: アイコンボタンの段数整理

### Status
Accepted（実装で確定）

### Context
アイコンボタンが w-9/w-8/w-7/w-6/w-5 の5段、角丸が `rounded-full`/`rounded-pill`/`rounded-md`/`rounded` で混在。

### Decision
**寸法を物理的に3値へ強制統一はしない。** サイドバー密度（w-7/w-6/w-5）とヘッダー（w-9）は密度文脈が異なるため、§7.1 のタップ領域原則に沿って役割差（主要/行アクション/補助）として正当化する。

**角丸の統一方向は `--radius-pill` へ寄せる**（当初案の `rounded-full` 寄せから反転）。理由: `spec/design/tokens.md` のトークン用途定義が `--radius-pill`(980px)=「ピルボタン、検索バー、ステータスピル」、`--radius-full`(9999px)=「アバター、ドット」と明示しており、**ボタンはピル側が正準**。正方形（w-9 h-9 等）の icon-only ボタンでは pill も full も同一の真円になり視覚差ゼロなので、spec の用途定義に合わせて `rounded-pill` へ統一する方が整合的。`ICON_BTN`/`dialogCloseButton`（現状 `rounded-full`）と editor toolbar `EDITOR_TOOLBAR_BTN`（`rounded-pill`）の混在を、ボタン用途の `rounded-pill` に寄せて解消する。`rounded-full` はアバター/ドット/チェックボックス（`NoteCheckbox`）等の真円装飾に限定する。

なお `tree action` 等の `rounded-md` は角の付いた行アクションで、円形ボタンとは別カテゴリ。サイドバー慣習として現状維持（無理に円形へ寄せない）。

### Consequences
- 良い点: 角丸混在が解消し、spec の token 用途定義（pill=ボタン）と実装が一致。役割ごとの密度差という設計意図を保持。視覚差はゼロ（正方形では pill=full=真円）。
- トレードオフ: 寸法の段数自体は残る（ただし役割で説明可能なので偶発差ではない）。`rounded-full`→`rounded-pill` への置換対象が `ICON_BTN`/`dialogCloseButton` 等に及ぶ（視覚不変）。

---

## ADR-004: `fieldControl` の高さ目標値

### Status
Accepted（実装で確定）

### Context
`fieldControl`（`common/styles.ts` 164行目で宣言、値は `px-3 py-[10px] text-sm` で高さ未明示）は **input 専用ではなく、textarea / select / div field のベースとしても合成されている**:
- `HtmlEditor.tsx` / `FrontMatterEditor.tsx` / `IngestionPreviewForm.tsx`: `${fieldControl} ${fieldTextarea}`（`fieldTextarea` = `min-h-[320px]` 等）
- `UploadDialog.tsx`: `${fieldControl} min-h-[96px] resize-y`
- `FrontMatterEditor.tsx`: `${fieldControl} flex items-center gap-2`（input ではなく div）

`box-sizing: border-box`（グローバル適用）＋ border 1px のため input 実効高 ≈ `py-[10px]×2(20px) + line-height(text-sm≈13px×leading-normal≈20px) + border 2px ≈ 42px`。

**当初案（`py-[10px]` を撤去して `h-10` に置換）は textarea で破綻する**: 縦 padding が消えてテキストが上辺に貼り付く。textarea は `min-h-[*]` を持つので height は欲しくなく、padding が必要。

参照値: `pillBtn` = `h-9`(36px)、admin Form ローカル定数（Prompts/DesignTokens/LLMSettings）= `h-10`(40px)。共有プリミティブ `FIELD_INPUT`(layout/styles.ts) は `py-2.5`(10px) で h未明示（fieldControl と同じ問題）。

### Decision
`fieldControl` を **`h-10` を追加しつつ縦 padding は残す**（`py-[10px]` → 標準スケールの `py-2.5`(=10px、同値・任意値解消) に変換し、先頭に `h-10` を加える）。
- **input**: `box-border` で height が権威となり 40px に確定。padding は content box を内側に作るだけ（テキストは縦中央付近）。標準フォーム・admin が 40px に収斂。
- **textarea**: 合成側の `min-h-[*]` が `h-10` を上書きするため高さは影響を受けず、`py-2.5` が padding を供給してテキスト貼り付きを回避。
- **div field**: 40px の flex 行として機能（問題なし）。

これにより当初案の textarea 破綻を回避しつつ、input 高を 40px に明示でき、任意値 `py-[10px]` も標準 `py-2.5` へ解消される。現状 input 実効高 ~42px からは約2px縮むため目視確認。

**共有プリミティブ `FIELD_INPUT`/`FIELD_TEXTAREA`(layout/styles.ts) も同方針**: `FIELD_INPUT` に `h-10` を追加（`py-2.5` は維持）、`FIELD_TEXTAREA` は `py-2.5` 維持で高さは合成側 `min-h` に任せる。これで admin 入力高が真に 40px へ統一される（3 Form ローカル定数 / FIELD_INPUT / UsersTable検索 が全て h-10）。

### Consequences
- 良い点: input 高が 40px に統一（標準フォーム・admin・共有プリミティブ全て）。`py-[10px]` 任意値が標準 `py-2.5` へ解消。textarea/select/div field の挙動を壊さない。
- トレードオフ: input 実効高が現状から約2px縮む。プレースホルダー/入力テキストの縦位置が動くため目視確認必須。崩れる場合は `h-11` へ切り替える余地を残す。`h-10` と `py-2.5` を併記する形になるが、共有ベースが input/textarea 両対応である以上これが最小侵襲。

---

## ADR-005: 実装時の判断（ステップ7で現状維持にした任意値）

### Status
Accepted（実装時に確定）

### Context
ステップ7は `gap-[5px]`（チップ系→`gap-1.5`、バッジ系→個別判断）と `navItem` の `py-[7px]`、micro-adjust 系 `px-[*]` を対象とする。実装時に以下を個別判断した。

### Decision
- **`BULK_ACTION`（BulkActionBar の操作ボタン）の font-size は `text-sm` を維持。** 棚卸し表の「小型ボタン」行は `BULK_ACTION` を原型 `pillBtnSm`(h-7/px-3/text-xs) に寄せるとしており、高さ・横余白は `h-7 px-3` に揃えた。font-size だけは `text-xs` ではなく `text-sm` を維持した。理由: BulkActionBar は暗背景バー（`bg-ink text-white`）で、白文字の可読性確保として `text-sm`(13px) が妥当。かつ同じバー内の件数表示 `BULK_COUNT` も `text-sm` であり、バー内のテキストサイズを `text-sm` で揃える方が一貫する（操作ボタンだけ `text-xs` に落とすと件数より小さくなり不整合）。寸法（h-7/px-3）は原型準拠としつつ、暗背景コンテキストの font-size のみ意図的に `text-sm` とした。
- **admin ステータスバッジの `gap-[5px] px-[9px] py-[2px]` は現状維持。** `UsersTable`(:27)・`Metrics`(:206)・`Jobs`(:43) の3箇所が**完全に同一シグネチャ**（`inline-flex items-center gap-[5px] px-[9px] py-[2px] rounded-pill text-xs font-medium`）で、h-7 チップより一回り小さい micro バッジとして自己整合した1つの族を成している。`gap` だけ `gap-1.5` に変えると `px-[9px]/py-[2px]` との視覚バランスが崩れ、族の一貫性が壊れる。棚卸し表の「バッジ=要判断」「迷ったら現状維持」に従い、3箇所セットで現状維持とした（チップとは役割が異なる）。
- **`navItem` の `py-[7px]` は現状維持。** `navItem`（common/styles.ts）はサイドバー nav リンクとディレクトリツリーリンクの共有プリミティブで、変更の波及範囲が広い。7px は近傍の標準値（`py-1.5`=6px / `py-2`=8px）のどちらでもなく、nav 行高を狙って選ばれた意図的な値とみられる。±1px の行高変化がサイドバー全体に及ぶリスクに対し得るものが薄いため、「micro-adjust は意図を確認のうえ標準値へ寄せ、判断に迷うものは現状維持で報告」の方針に従い現状維持とした。
- **その他の micro 任意値（`px-2 py-[2px]` のインラインmonoバッジ、prose `[&_code]` の `px-[6px]`、textarea の `py-[10px]`、`DesignTokensForm` の `px-[10px] py-[6px]`）は本Issueステップ7の明示スコープ（チップ系 gap / navItem）外のため対象外。** 自己整合しており偶発差ではないと判断し、現状維持とした。

### Consequences
- 良い点: バッジ族の一貫性・nav 行高の安定を保ちつつ、スコープを広げすぎない。
- トレードオフ: `gap-[5px]`(3箇所) と `py-[7px]`(1箇所) の任意値が残る。いずれも役割で説明可能で偶発差ではない。
