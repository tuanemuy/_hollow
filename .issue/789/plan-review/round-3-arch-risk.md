# Round 3 レビュー — アーキテクチャ整合性・実現可能性・リスク（#789）

対象: `.issue/789/plan.md` / `.issue/789/adr.md`
視点: あるべきアーキテクチャとの整合・combobox 実現可能性・エッジケース・設計トレードオフ

前提として、2 周目で確定した中核（`tagSuggestModel.ts` の `clampSuggestIndex`/`nextSuggestIndex` による下限 -1 保持・上限超過のみ丸め、`aria-expanded = open && hasSuggestions`、新規作成行をナビ対象外、開閉トリガーの明文化）は実コードと照合して妥当であることを確認した。

- `directoryTreeModel.ts:150-155` `clampActiveIndex` は `index<0 → 0`、`count<=0 → 0`。`nextActiveIndex(-1,"down",n)` は内部 clamp で `-1→0` にした後 `+1` で `1` を返し、先頭候補 index 0 を飛ばす。→ 専用ヘルパ新設の判断は正しい（既存ヘルパ流用前提の撤回は妥当）。
- `DirectoryTreeSelect.tsx:91-93` の clamp useEffect は `clampActiveIndex` 経由で `-1` を `0` に押し戻す。→ 「DirectoryTreeSelect 流の clamp useEffect を流用しない」判断は正しい。
- `aria-expanded`/`aria-controls`/`aria-activedescendant` を実在条件で付与する形（`DirectoryTreeSelect.tsx:242-246`）に倣う方針も整合。
- `resolveTagNames`/`parseTagInput`（`editorState.ts:660-696`）は submit/autosave の SSOT。reducer 不変・autosave 非送信維持の設計と矛盾しない。

---

#### 問題点（要修正）

#### [P-001] パネル表示／`aria-expanded` の述語が `open && hasSuggestions` のみだと、AC-5 の主ケース（draft が既存タグに一致しない＝新規タグ）で「新規作成」表示が出ない

**理由:**
plan ステップ 3 / ADR-003 は、パネル描画条件と `aria-expanded` をいずれも `open && hasSuggestions` に揃えている。一方で「新規作成」行（`tagSuggestOptionNew`）は styles ステップで「候補パネル系」の一部として定義され、`classifyDraft` が `new` のときパネル内に表示する設計になっている。

ここで `hasSuggestions` は `filterTagSuggestions` の既存タグ候補件数に基づく。AC-5 が区別したい「新規タグ作成」の**最も典型的な状況は、入力中の draft が既存タグのどれにも一致しないケース**であり、そのとき `hasSuggestions = false`。`open && hasSuggestions` だとパネル自体が描画されず、新規作成インジケータが表示される場所が無くなる。結果として AC-5 が主ケースで満たされない。

plan は本件を `（候補 0 件なら開フラグが立っても非表示＝AC-5 の新規作成行のみ表示する余地は別途 classifyDraft 側で判断）` と括弧書きで認識しているが、肝心の「パネル可視述語をどうするか」「そのとき `aria-expanded`/`aria-controls` をどう保つか」が未確定のまま残っている。実装者が `open && hasSuggestions` を素直に実装するとリグレッションになる。round 3 までに述語を確定させたい。

**提案:**
- パネル可視述語を「既存候補 or 新規作成インジケータの少なくとも一方を表示すべきか」に拡張する。例: `const isNewDraft = classifyDraft(...) === "new"; const panelOpen = open && (hasSuggestions || isNewDraft);`
- `aria-expanded`/`aria-controls`/`aria-activedescendant` の整合を保つため、役割を分離して明文化する:
  - `aria-expanded` はパネル（ポップアップ）が表示されているか＝`panelOpen` を反映する。
  - `aria-controls` が指す `role="listbox"` は**既存候補 option を持つときだけ**実在させる（`hasSuggestions` 条件のまま）。新規作成行は `role="option"` でない非インタラクティブ表示（S-002 の不変条件）なので、listbox に含めない。
  - したがって「新規作成行のみ表示（`hasSuggestions=false && isNewDraft`）」のときは、`aria-expanded="true"` だが `aria-controls`/`aria-activedescendant` は付与しない（listbox が無い＝ナビ対象 0 件）という組み合わせを許容する旨を ADR-003 に追記する。ARIA 上、popup が表示されていて listbox が空/不在でも矛盾ではない（活性化可能な option が無いだけ）。
- もしくは「新規作成インジケータをパネル外（input 直下の補足）に出す」案でもよいが、その場合は styles ステップの `tagSuggestOptionNew` を「パネル内候補行」ではなく独立インジケータとして再定義する必要がある。いずれを採るか round 3 で明示する。

---

#### 改善提案

#### [S-001] 空 draft でフォーカスした時の `filterTagSuggestions` の振る舞いを定義する

**理由:**
開閉トリガーは「input への `focus` 時に `open=true`」。一方 `filterTagSuggestions(allNames, committed, draft, limit)` の前方/部分一致は、draft が空文字のとき「全件マッチ」になり得る（空文字は任意文字列の prefix）。すると**フォーカスしただけ（未入力）で全タグ候補がパネルに出る**挙動になりかねない。これは UX 判断（人気タグを出す vs 入力するまで出さない）であり、`aria-expanded` がフォーカス直後に true になるかにも直結する。plan / helper 仕様に空 draft の扱いが書かれていない。

**提案:** `filterTagSuggestions` の契約に「draft が trim 後空なら空配列を返す（= 入力開始まで候補非表示）」を明記し、`tagSuggestModel.test.ts` の境界に空 draft ケースを追加する。`classifyDraft("")="empty"` / `validateTagDraft("")=null` とも一貫する（typing 前はパネル閉・エラー非表示）。

#### [S-002] inline 抑止と submit 経路（`resolveTagNames`）の関係を一行明記する

**理由:**
AC-6 の inline 検証は draft の chip commit を抑止するが、**`resolveTagNames`（`editorState.ts:683`）は非空 draft を submit ペイロードへ無条件に畳み込む**ため、不正な draft をクリアせず保存すると、権威ある値オブジェクト構築（`TagName.create`）が submit 時に throw する。これは設計どおり（CLAUDE.md の「権威は値オブジェクト構築」）で正しい挙動だが、「inline 抑止＝不正タグは絶対に送信されない」と読めてしまうと誤解を生む。plan は inline をプレビュー、保存時を権威と整理済みなので、その境界を一行で確認しておくと round 3 の読み手に親切。

**提案:** plan のリスク節に「inline 抑止は chip 化のプレビュー抑止であり、未クリアの不正 draft は `resolveTagNames` 経由で submit に畳み込まれ、権威ある `TagName.create` が保存時に弾く（二重防御）」と明記する。必要なら blur commit が valid のみ chip 化する点（plan 既述）と合わせ、「invalid draft は chip にならず draft のまま残る」挙動をテストで固定する。

---

#### 良い点

- 2 周目 P-001 のヘルパ非互換問題を**実コード照合に基づいて**撤回・専用ヘルパ新設へ転換しており、判断が正確（`clampActiveIndex(-1)=0` / `nextActiveIndex(-1,"down")=1` を確認）。回帰テスト項目（最初の ↓ で先頭候補・draft 変化後の -1 保持・上限丸め）も的確。
- `activeIndex=-1` 始点により「インライン combobox の新規タグ Enter 確定を既存候補に奪わせない」という、DirectoryTreeSelect との本質的差異を ADR-003 で明文化できている。combobox 実現可能性の核を突いている。
- 新規作成行を `role="option"` から外し、`activeIndex` 上限＝候補件数（ref 配列長・`activeOptionId`・`nextSuggestIndex(count)` を一致）という不変条件を立てたのは、`aria-activedescendant` 方式の整合性として正しい。
- IME ガードを Enter/カンマだけでなく矢印にも拡張する点（DirectoryTreeSelect は Enter のみ）を明示しており、日本語入力の競合リスクを正しく捉えている。
- `filterTagSuggestions`/`classifyDraft` の committed 除外・一致判定を `TagName` 正規化 SSOT で両辺に適用（`#Foo` 確定済みが `Foo` 候補を除外）する設計は、表記ゆれ・重複表示の実害を防ぐ良い判断。
- レイヤー規約（reducer 不変・transient UI state は useState・スタイルは Tailwind+tokens・data-* 規約・新規 CSS/@apply ゼロ）への適合は全面的に保たれており、後方互換（`tagSuggestions?` 任意・省略時 `[]`）も担保されている。
- ADR-004 で Popover 不使用のトレードオフ（外側クリッククローズ・viewport クランプの自前担保）を明示し、将来 Popover 移行の余地を残しているのは健全。

---

## 返答

- 問題点: 1 / 改善提案: 2

- [P-001] パネル可視述語 `open && hasSuggestions` だと、draft が既存タグに一致しない主ケースで「新規作成」表示が出ず AC-5 未達。可視述語に新規インジケータ条件を含め、`aria-expanded`(=panelOpen) と `aria-controls`(=hasSuggestions) の役割分離を ADR-003 に明記する。
- [S-001] 空 draft フォーカス時の `filterTagSuggestions` 振る舞い（空→空配列）を契約・テストに明記し、フォーカス直後の全件表示・`aria-expanded` 挙動を確定する。
- [S-002] inline 抑止と `resolveTagNames` の submit 畳み込み（権威 `TagName.create` が保存時に弾く二重防御）の関係を一行明記し、invalid draft が chip 化されず draft のまま残る挙動をテストで固定する。
