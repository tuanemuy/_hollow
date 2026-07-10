# Plan Review — Issue #824 (Round 1) — 要件カバレッジ・スコープ整合性

対象: `.issue/824/plan.md` / `.issue/824/adr.md`
視点: Issue の要件カバレッジ・スコープ整合性

## 総評

Issue 本文で合意された機能要件（モバイルヘッダーへの簡略タイトル表示、共有シェルへの最小配管、デスクトップ／他 `/_app` 画面への非影響）は AC-1〜AC-6 にほぼ漏れなく落ちている。スコープ管理も優秀（「含まれないもの」を明示し、プレゼン層に閉じることを宣言）。指摘は「AC↔ステップ紐づけの誤り」1 件と「mock `.header-doc` 見た目の乖離が AC で捕捉されない」1 件が中心で、いずれも計画の骨子は崩さず修正可能。

---

#### 問題点（要修正）

- **[P-001]** AC-6（unmount／画面遷移で簡略タイトルが消え検索に戻る）の「対応ステップ」が `1,6` になっているが、実際にこの挙動を実装するステップが抜けている。
  - 理由: タイトルを消す機構は **ステップ3**（`NoteEditor` に追加する `useEffect(() => () => setHeaderTitle(null), [setHeaderTitle])` の unmount クリーンアップ）と、title=null で検索に戻す **ステップ4**（`HeaderCenter` の `hasTitle` 分岐レンダー）が担う。`1,6` は「context 定義」と「動作確認」だけを指しており、AC-6 を成立させる実装ステップ（3・4）を欠く。task 観点(3)「基準と実装ステップの紐づけが正しいか」に反する明確なトレーサビリティ欠陥。
  - 提案: AC-6 の対応ステップを `1,3,4,6`（または最低でも `3,4` を含む形）に修正する。

- **[P-002]** ステップ5 の `HEADER_DOC = "sm:hidden truncate text-center text-sm font-medium text-ink min-w-0"` が mock `.header-doc`（design SSOT）から見た目で乖離しており、かつこの乖離を検証する AC が存在しない。
  - 理由: mock `.header-doc`（`spec/design/pages/mobile/P12-editor.html` L227-235）は `text-align` を持たず、ヘッダーグリッド `auto 1fr auto` の中央 1fr セルに **左揃え**で描画される。plan は `text-center` を追加しており、テキストが中央揃えになる＝mock と異なる見た目。さらに `HeaderCenter` の root に `SEARCH_BOX_WRAPPER`（`max-w-[460px] mx-auto`）を流用するため、mock に無い水平中央寄せ／最大幅制約も付く（モバイル幅では max-width はほぼ効かないが、`mx-auto`+`text-center` の中央寄せは効く）。task 観点で明示された「mock `.header-doc` の見た目が基準に正しく反映されているか」に照らすと、この視覚差が AC-1〜AC-6 のどれにも捕捉されない（AC-2=truncate、AC-3=aria-hidden のみで、字揃え・タイポは無検証）。
  - 提案: いずれかを行う。(a) mock に忠実化し `text-center` を外す（左揃え・全幅維持）／HeaderCenter の header-doc は SEARCH_BOX_WRAPPER の中央寄せ制約下に置かない。あるいは (b) 中央寄せを意図的採用とするなら adr.md ADR-002 に「mock は左揃えだが中央寄せに変更する（理由）」を明記し、AC にも「タイトルは中央寄せで表示」を追記して検証可能にする。放置＝mock 準拠を謳いながら無検証で逸脱、が最も避けたい状態。

---

#### 改善提案（検討推奨）

- **[S-001]** AC-5 の「表示・挙動・SSR いずれも不変」は文言が強すぎ、そのままでは検証で偽になる。
  - 理由: `HeaderCenter`（client island）が現行の `<div SEARCH_BOX_WRAPPER><form>` を `<div HeaderCenter root><div data-doc><form>` へと **ラッパー div を1段増やす**ため、SSR 出力の DOM ツリーは厳密には変わる（バイト等価でない）。title=null 時の視覚・挙動は不変だが「SSR 不変」は成立しない。task 観点(2)「各基準が検証可能な形か」に照らすと過剰主張。
  - 提案: AC-5 を「検索ボックスが従来どおり server-render され、表示・挙動が視覚的・機能的に不変（DOM は HeaderCenter の薄いラッパーが加わるのみ）」へ緩める。

- **[S-002]** header-doc の**タイポグラフィ（`text-sm`/`font-medium`/`text-ink`）のmock準拠**を検証する AC が無い。
  - 理由: mock 見た目のうち truncate（AC-2）と aria-hidden（AC-3）は AC 化されているが、font-size/weight/color の忠実性は step5 の実装記述にあるだけで受け入れ基準に無い。P-002 の字揃え問題も含め、見た目乖離が criteria をすり抜ける。
  - 提案: AC-2 を「truncate かつ mock の `text-sm`/`font-medium`/`text-ink` で表示」へ拡張、またはタイポ用 AC を1行追加。

- **[S-003]** AC-1 の文言「タイトルを入力すると…表示される」が **edit モード（既存タイトルを持つノートを開いた瞬間）** を取りこぼしている。
  - 理由: ステップ3 の push は `useEffect([state.title])` で mount 時にも発火し、`initialTitle` を持つ編集画面は開いた瞬間にヘッダーへ反映される（`NoteEditor` L133: edit 時 title = initialTitle）。しかし AC-1 は「入力すると」表示、という new モード寄りの記述で、edit モードの初期表示が検証項目化されていない。
  - 提案: AC-1 を「既存タイトルを持つ編集画面を開くと即座に表示され、新規ノートでタイトルを入力すると表示される」と両ケースを含める形に。

---

#### 良い点

- スコープ規律が優秀: 「含まれないもの」（desktop 編集ヘッダー／保存状態複製／メタ情報／Icon API 拡張）を明示し、変更をプレゼン層に閉じることを宣言。ドメイン／ユースケース／アダプター影響「なし」を根拠付きで断言しており、スコープ外作業の混入は見られない（task 観点(4)クリア）。
- 既存 `DrawerCtx`+`MenuButton` の実証済みパターンに完全同型で配管する設計（ADR-001）。RSC 境界を跨がず前例踏襲でリスクが低い。
- AC-3 が「aria-hidden の装飾要素／SR はエディタ本文 input のみ読み上げ（二重読み上げ防止）」を検証可能な形で捉えており、mock の `aria-hidden="true"` 意図を正しく反映。
- モバイル限定＆検索置換の保証を、ルート判定なしの純 CSS（`sm:hidden` + `data-[doc]:max-sm:hidden`）で表現し、AC-4（desktop=編集画面含め検索のみ）／AC-5（他画面不変）に正しく分離。「モバイル限定表示の保証」は要件として明確。
- read/setter context 分離（ADR-003）で編集本体の再レンダー churn を遮断する配慮。
- リスク節が SSR→hydration のちらつき、新規ノート空タイトル、全 `/_app` 回帰を網羅し、受け入れ挙動（progressive な検索fallback）と AC の整合を説明済み。

---

## 判定

要件カバレッジは高い。P-001（AC↔ステップ紐づけ誤り）と P-002（mock 見た目乖離が無検証）を修正すれば計画として十分。S 群は検証可能性・忠実性の精度向上。
