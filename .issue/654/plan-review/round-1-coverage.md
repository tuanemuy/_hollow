# Plan Review — Issue #654 (Round 1)

**視点:** Issueの要件カバレッジ・スコープ整合性
**対象:** `.issue/654/plan.md` / `.issue/654/adr.md`
**レビュー日:** 2026-06-13

---

## サマリー判定

Issue 本文・ADR-004 で合意された要件（全公開タグ母集合の列挙 / 公開可視性 gate / 件数上限 / ＋chip 実装 / 既存 chips との整合 / モック filter-row 完全一致）は **6つの受け入れ基準（AC-1〜AC-6）にすべて落ちている**。各 AC は由来（Issue 本文の該当文言）と対応ステップが明示され、紐づけも概ね正しい。要件カバレッジの観点では漏れはない。

ただし、(1) 受け入れ基準には現れていないが Issue 要件と矛盾しうる「`tags` 検索スキーマ `.max(8)` cap と母集合追加の衝突」、(2) テスト方針（step 4 / ユニットテスト）が publication usecase の既存テスト基盤と整合しない点、の2点が要修正。

---

## 問題点（要修正）

- **[P-001]** ＋chip でタグを追加した結果、`tags` URL パラメータが route schema の `.max(8)` cap を超えると、全タグが `.catch(undefined)` で消える（サイレント全消し）リスクが受け入れ基準・スコープ・リスク欄のどこにも現れていない
  - 理由: `app/routes/u/$username/index.tsx:37` の `tags: z.array(...).max(8).optional().catch(undefined)` と、`renderInputSchema`（52行）の `.max(8)` により、選択中タグが9件以上になると `validateSearch` / server-fn 入力検証が配列全体を弾き `undefined` に落ちる。本 Issue は「母集合（全公開タグ、cap 1000）から自由に追加できる」UI を入れるので、ユーザーが9件目を追加した瞬間に**それまでの絞り込みが全消失**する。これは AC-5「即時反映」AC-6「二重表示や欠落なく扱われる」と実質的に矛盾する挙動であり、Issue 要件（母集合から追加できる）の素直な実装が既存 transport cap に衝突する。現状の chips 行は「現ページ発見タグ（8件 cap）＋選択中」なので8件超過は起きにくかったが、母集合追加で容易に到達する。
  - 提案: 受け入れ基準かリスク欄に「選択タグ数の上限と transport cap（`.max(8)`）の関係」を明記し、方針を1つ決める。候補: (a) ＋chip 側で選択数が8に達したら以降の option を無効化／非活性化して cap 内に閉じる（AC に「上限到達時の挙動」を追加）、(b) route schema の `.max(8)` を引き上げ AND フィルタ実用上限に合わせる（ただし AND が増えるほど結果は絞られるので過大値は不要、ADR で値を根拠づける）。最低限、本 Issue の完了基準に「8件超過時にフィルタがサイレント消失しないこと」を検証項目として加える。

- **[P-002]** Step 4 / テスト方針の「`listUserPublicTags` をフェイクで**ユニットテスト**する（`view/__tests__/fakes/container.ts` の `makeTagRepoStub`）」が、publication usecase の既存テスト基盤と整合しない
  - 理由: (1) `app/core/application/view/__tests__/fakes/container.ts` は **view 層 usecase（savedViews）専用**のミニ UoW で、`userRepository` スタブを一切持たない（`grep` 確認済み）。`listUserPublicTags` は `userRepository.findByUsername` →（deleted/suspended guard）→ `tagRepository.listPublicTagNamesByOwner` を呼ぶので、この container を流用するには user repo スタブと publication 向けの context 拡張が必要になり「ポート追加だけでは壊れない」という step 4 の前提は成立しない。(2) 既存の publication 読み取り usecase（`listUserPublicNotes`）は**ユニットテストを持たず integration test（`setupTestContainer` 実 DB）のみ**で検証している（`__tests__/` 確認済み）。テスト方針が「公開タグのみ／private-only 非出現／cap」をユニットで検証すると書いているが、これらは publication gate JOIN の挙動でありフェイクでは本質を検証できず、現に integration 側（D1 アダプターテスト）に同等項目が既に列挙されている（重複）。
  - 提案: 母集合 gate（公開のみ／private-only 非出現／cap／別オーナー混入なし／orderBy）の検証は **D1 アダプター integration test に一本化**し、`listUserPublicTags` usecase は「username 解決 → deleted/suspended guard → 委譲」という薄いオーケストレーションだけなので、ユニットを書くなら `listUserPublicNotes` と同じ integration test（実 DB ＋ `setupTestContainer`）で deleted/suspended guard を1ケース足す形にする。step 4「テスト用 tag リポジトリ（スタブ）に実装」を削除するか、view fakes container ではなく publication usecase 用の test helper を新設する方針に書き換える。どちらにせよ「`makeTagRepoStub` は部分スタブだから壊れない」という記述は user repo 不在の事実と食い違うので訂正が必要。

---

## 改善提案（検討推奨）

- **[S-001]** AC-1 のモック一致基準が「565-577行」を引いているが、＋chip の正確な参照行は **570-573行**（plus アイコン 11px・stroke 2.2 ＋「タグを追加」）。検証者が範囲を取り違えないよう ＋chip 部分のピンポイント行（570-573）に絞ると精度が上がる。なお調査結果欄の「564-577行」「565-577行」「570-577」が場所により揺れているので統一を推奨。
  - 理由: 受け入れ基準は検証可能性が命。モック該当行のブレは手動検証時の判定ゆらぎを生む。

- **[S-002]** AC-2 / AC-4 の対応ステップが「1,2,3,4」と4ステップ全部に紐づくが、AC-2（母集合が列挙される）は実質 step 1〜3＋5（ローダー供給）＋6（＋chip 表示）まで通って初めて E2E で観測可能。AC-4（cap）は step 2（定数）＋3（SQL LIMIT）が本体で step 4 は検証ステップ。「実装ステップ」と「検証ステップ」を AC 表で区別すると紐づけがより正確になる（例: AC-2 → 実装 1,2,3,5,6 / 検証 4・手動）。
  - 理由: 現状 AC-2 に step 5・6 が落ちており「列挙される」を満たす UI 供給経路がトレースから抜けている。逆に AC-4 に step 4（テスト）が実装ステップとして混じる。紐づけの精度を上げると抜けの発見が容易になる。

- **[S-003]** AC-6（既存 chips との整合）の「二重表示や欠落なく扱われる」は、ADR-003 の決定により**意図的に「同一タグが chips 行と ＋chip 選択肢の両方に出る」二重表示を許容**している（auth FilterBar 同様）。AC-6 の文言「二重表示や欠落なく」と ADR-003 のトレードオフ（二重表示を許容）が字面上は矛盾して読める。AC-6 を「chips 行内での二重表示や、選択中タグの欠落が起きない（chips 行と ＋chip 選択肢の重複は ADR-003 で許容）」と限定して書くと、検証者が ＋chip 選択肢に既存タグが出ることをバグ判定しなくなる。
  - 理由: 受け入れ基準と ADR の語の不一致は、レビュー／手動検証で誤判定（許容済みの重複を不合格にする）を招く。

- **[S-004]** スコープ「含まれないもの」に「タグ自由入力（前方一致）」「noteCount 非表示」「期間/ソート/表示モード変更なし」は明記されているが、**「クロスオーナー秘匿の扱い」がスコープ記述から抜けている**。本 Issue は owner-scoped で tag 名のみ返すため owner 露出は起きないが、調査結果・ADR-001 では触れているのにスコープ表には無い。`searchPublicByNamePrefix`（クロスオーナー・名前のみ）との差分を「含まれないもの」に1行足すと、将来の監査で「なぜ owner-scoped か」が自明になる。
  - 理由: スコープ整合性の観点で、参照実装（クロスオーナー）との差分をスコープ欄に固定すると意図的な設計差が追跡可能になる。

---

## 良い点

- **要件→AC の網羅性が高い。** Issue 本文・ADR-004 の各要件（母集合列挙 / 公開 gate / 件数上限 / ＋chip / 既存 chips 整合 / モック完全一致）が AC-1〜6 に1対1で落ち、各 AC が「由来」列で Issue 文言に紐づいている。漏れた要件は無い。

- **スコープ外の切り分けが的確。** 「自由入力（前方一致 `searchPublicByNamePrefix`）はクロスオーナーの別サーフェスなので対象外」「noteCount は別集計でスコープ拡大」「期間/ソートは #619 実装済みで触らない」と、紛れ込みやすい隣接作業を明示的に排除している。スコープクリープは見当たらない。

- **既存実装の踏襲方針が具体的で実現可能性が高い。** ＋chip は auth `TagPickerPopover`（FilterBar.tsx 463-562、listbox＋roving＋`restoreFocusOnCommit`）、母集合 SQL は `searchPublicByNamePrefix`（tagRepository.ts:245-282、公開 gate JOIN）、cap は `TAG_CANDIDATE_CAP=1000` をそれぞれ実在の雛形として引いており、いずれもコードで存在を確認できた。母集合を `mergeTagChips` に合流させず ＋chip 専用 prop（`allTags`）にする ADR-003 の判断も、filter-row のコンパクトさ維持という Issue ゴール（モック構造一致）と整合する。

- **公開可視性 gate のリスク（情報漏洩）を最重要として明示し、テストで private-only 非出現を検証する方針が立っている。** 母集合 owner 条件の付与漏れ（クロスオーナー漏れ）もリスク欄＋integration test で押さえている。要件「公開可視性で gate」の本質を外していない。

- **母集合が loader dep に依存しない（sort/period/page で不変）点を明記**し、`tagOptions`（現ページ発見タグ、URL 変化で再フェッチ）との性質差を区別している。`Promise.all` 3本目の並列ロード方針もレイテンシ配慮として妥当。
