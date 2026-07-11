# 実装計画 — Issue #287: inline モード: メディア挿入直後の <img> 単体ラッパを編集可能にする

**Issue:** #287
**作成日:** 2026-07-11
**複雑度:** 中〜大規模

---

## 目的

`inline` モードで画像/メディアを挿入した直後、挿入された `<img>` の前後でインラインテキスト編集を可能にする（仕様 C4「編集中の画像・動画アップロード挿入」× C2「既存ノートをビジュアル編集」の交差シナリオの実害解消）。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `inline` モードで `<p><img src="/media/<id>" alt=""></p>` を含む HTML をレンダリングしたとき、その `<p>` に `contentEditable=true` が付与される（`<img>` 自身には付与されない） | Issue ゴール | 1, 2 |
| AC-2 | メディア挿入経路（外部 `value` 変更 → `InlineEditor` の resync rebuild）を通った後も、追記された `<p><img></p>` が編集可能として decorate される | Issue ゴール（挿入「直後」） | 1, 2 |
| AC-3 | 画像の前後にテキストを入力しても MutationObserver に rollback されず、`onChange` が `<img>` 参照（`/media/<id>` src）とテキスト双方を含む HTML を emit する | Issue ゴール（実際に編集できる） | 1, 2 |
| AC-4 | emit される HTML に編集用 `contenteditable` 属性が漏れない（`serializeHostContent` の round-trip 維持） | 既存不変条件（#233） | 1, 2 |
| AC-5 | 既存の decorate 規則が回帰しない: `<li><p>foo</p></li>` の外側 `<li>` は decorate されない / `<blockquote>foo<p>bar</p></blockquote>` は両方 decorate / `<pre><code>` は decorate（Issue #285） | ADR-002・既存テスト | 1, 3（既存 `inlineEditor.test.tsx` スイートの green 維持で検証 — ステップ2で既存テストは変更しない） |
| AC-6 | `wysiwyg`（TipTap 命令）/ `html`（htmlDraft 追記）モードの挿入経路に変更がない。検証: (a) diff が `InlineEditor.tsx` とテストファイルのみに閉じていること、(b) `wysiwygEditorImageButton.test.tsx` / `noteEditorImageButtonWiring.test.tsx` が green であること | Issue 検討事項 | 3 |

## スコープ

### 含まれないもの

- **素のトップレベル `<img>`（`<p>` ラッパなし）の編集可能化** — 現行の `insertMediaIntoHtml` は既に `<p><img /></p>` で包んで返す（後述「調査結果」）。ラッパなしの `<img>` は `html` モードで手書きした場合にのみ生じ、Issue のゴール「メディア挿入を行ったとき」の経路外。`html` モードで編集可能なため対応しない。
- **`inline` モードでの `<img>` 自体の削除（Backspace）** — 要素ノードの remove は構造変更として rollback される。`<strong>`/`<em>` の削除と同じ ADR-003（#233）の既知制約であり、削除したい場合は `html` モードへ切替する。本 Issue は「前後のテキスト編集」がゴール。
- **空 `<p></p>` のクリック可能性（高さ確保のスタイル）改善** — ゲート一般化の副産物として空 `<p>` も decorate されるようになるが、視覚的な高さ確保は別課題。
- **`wysiwyg` / `html` モードの挿入経路の変更** — Issue 本文で明示的に維持と記載。
- **ネストしたコンテナ内メディアの編集可能化（既知の残余ギャップ）** — `<li><img><p>foo</p></li>` / `<blockquote><img><p>bar</p></blockquote>` 等の外側要素は「editable 子孫あり・直接テキスト子なし」の純粋コンテナとして新規則でも skip されるため、その `<img>` に隣接する編集は依然不可。`insertMediaIntoHtml` はトップレベル追記しかしないため挿入経路では発生せず、`html` モード手書き由来のノートでのみ生じる。Issue のゴール（メディア挿入経路）の範囲外として対応しない。
- **spec/manual-tests の更新** — ドキュメント同期は spec-sync の領分。

## 調査結果

- 関連ファイル:
  - `app/components/note/editor/InlineEditor.tsx` — inline エディタ本体。`applyEditable`（274行目付近）が許可リストブロックへ `contentEditable=true` を付与する。**本 Issue の本質的な修正対象**。
  - `app/components/note/editor/mediaInsert.ts` — `insertMediaIntoHtml`。**既に** `<p><img src="/media/<id>" alt="" /></p>` の段落ラッパ付きで追記する実装になっており（`__tests__/mediaInsert.test.ts` で pin 済み）、Issue 検討事項 1（段落ラッパ）は実質実装済み。Issue 起票時（ADR-005 の「文字列末尾追記なので `<img>` だけのトップレベル要素を持ちうる」）から状況が変わっている。
  - `app/components/note/editor/NoteEditor.tsx` `onMediaInsert`（231行目付近）— `inline` モードでは `dispatch({ type: "setContent", value: nextHtml })` の文字列追記経路（ADR-005 of #233 どおり）。`InlineEditor` の `useEffect([value])` resync が rebuild → `applyEditable` を再実行する。
  - `app/components/note/editor/MediaUploader.tsx` — アップロード完了後に `insertMediaIntoHtml` を呼び `onInsert` へ渡す。変更不要。
  - `app/components/note/editor/__tests__/inlineEditor.test.tsx` — decorate 規則の pin テスト群（table/td、mixed blockquote、`<li><p>`、pre）。
  - `app/core/adapters/sanitizer/htmlSanitizer.ts` — `img`/`video`/`audio` は許可タグ。`<p><img></p>` は保存時サニタイズを素通りする。
  - `app/core/domain/note/service.ts` — `MEDIA_ID_FROM_URL` が `<img>`/`<video>`/`<source>` の `src` から media 参照を抽出（孤児 purge 対策）。本変更は HTML 文字列を変えないため影響なし。
- あるべきアーキテクチャ:
  - 仕様 C2-2（`spec/scenario/authoring.md`）: 「装飾済みの要素はその意匠を保ったままインラインで文字を編集」/ C2-3: 「編集中は構造を壊さない」。
  - 仕様 C4: 挿入された `<img>`/`<video>` を含む本文の編集継続が前提。
  - ADR-002（`.issue/233/adr.md`）: テキスト保持ブロック要素の許可リスト方式。**ゲートの意図は「編集可能ブロックの純粋なコンテナ（`<li><p>…</p></li>` の外側など）は自身を decorate しない」こと**であり、`hasDirectTextChild` はその意図の近似（proxy）にすぎない。
  - ADR-005（`.issue/233/adr.md`）: `inline` の挿入は文字列追記経路 + resync。トレードオフ欄に本 Issue の欠陥が明記されており「別 Issue で扱う」= 本 Issue。
- 既存実装の状態:
  - `insertMediaIntoHtml` は理想形（段落ラッパ）に既に一致。**乖離は `InlineEditor.applyEditable` のゲートのみ**: `if (!isPre && !hasDirectTextChild(el)) continue;`（294行目付近）が「直接テキスト子を持たないブロックは decorate しない」ため、`<p><img></p>` は直接テキスト子がなく decorate されない。ゲートが ADR-002 の本来意図（純粋コンテナの除外）より過剰に厳しい、というのが乖離の正体。
  - MutationObserver の分類器（`classifyRecords`）は「`contentEditable` 継承下の TEXT_NODE のみの add/remove を許可」するため、`<p><img></p>` が decorate されさえすれば、画像の前後へのテキスト入力（テキストノード追加）は rollback されずに通る。分類器側の変更は不要。
  - `serializeHostContent` は `contenteditable` 属性を strip するだけで `<img>` には触れない。round-trip も変更不要。
- 依存関係:
  - `applyEditable` は mount 時 rebuild・resync rebuild・rollback・`disabled` トグルの 4 経路から呼ばれる。ゲート変更は 4 経路すべてに一様に効く（それが正しい: どの経路でも同じ decorate 規則であるべき）。
  - `clearEditable` / `structureSignature` / `classifyRecords` / `serializeHostContent` はゲートに依存しないため無変更。

## 設計

### ドメインモデルへの影響

なし。HTML 文字列の contract（`/media/<id>` 参照、サニタイズ許可タグ）は一切変わらない。

### ユースケース / アプリケーションロジック

なし。

### アダプター / 永続化 / 外部連携

なし。サニタイザ・レンダラーは `<p><img></p>` を既に受理する。

### UI / プレゼンテーション

修正は `InlineEditor.tsx` の純粋関数 `applyEditable` のゲート述語のみ。

**ゲートの再設計（詳細は `.issue/287/adr.md` ADR-001）:**

現行:

```
decorate(el) ⇔ isEditableTag(el) ∧ (isPre(el) ∨ hasDirectTextChild(el))
```

新規:

```
decorate(el) ⇔ isEditableTag(el) ∧ (isPre(el) ∨ hasDirectTextChild(el) ∨ ¬containsEditableBlock(el))
```

`containsEditableBlock(el)` = 「`el` の子孫に許可リストブロック要素が存在する」（`EDITABLE_TAGS` を join した CSS セレクタで `el.querySelector(...) !== null`）。

これは `hasDirectTextChild` という近似を、ADR-002 の本来意図「**編集可能ブロックの純粋なコンテナだけを decorate 対象から外す**」の直接表現に置き換えるもの。挙動の検証:

| 入力 | 現行 | 新規 | 判定 |
|---|---|---|---|
| `<p>text</p>` | decorate | decorate | 不変 |
| `<p><img></p>`（メディア挿入結果） | skip | **decorate** | 本 Issue の修正点 |
| `<li><p>foo</p></li>` の `<li>` | skip | skip（editable 子孫あり） | 不変（ADR-002 ネスト規則維持） |
| `<blockquote>foo<p>bar</p></blockquote>` の `<blockquote>` | decorate | decorate（直接テキスト子あり） | 不変（mixed 規則維持） |
| `<pre><code>x</code></pre>` の `<pre>` | decorate（isPre 特例） | decorate（isPre 特例維持） | 不変（Issue #285） |
| `<p></p>`（空段落） | skip | **decorate** | 一般化の副産物（改善方向・スコープ注参照） |
| `<td><img></td>` / `<li><img></li>` | skip | **decorate** | 同上（媒体を含むセル/項目も編集可に） |
| `<p><a href="…"><img></a></p>` | skip | **decorate** | インラインラッパ越しの媒体も救済 |

decorate 後の編集フロー（変更不要なことの確認）:

- **入力**: `<p contenteditable>` 内でのクリックはブラウザ標準で `<img>` の前後にキャレットを置ける。文字入力はテキストノード追加（`childList` / TEXT_NODE のみ / `isContentEditable` target）として `classifyRecords` が許可 → debounce emit。
- **Enter**: 既存 keydown ハンドラが `preventDefault`（`<pre>` 外は改行不可）— 既存挙動どおり。
- **`<img>` の削除**: Element の remove は rollback（構造保持）— 既知制約（スコープ外に明記）。
- **serialize**: `serializeHostContent` が `contenteditable` を strip。`<img>` は素通り。emit 値が `state.contentHtml` → 保存時サニタイズ（`img` 許可）→ `MEDIA_ID_FROM_URL` 抽出、のパイプラインは既存のまま成立。
- **キャレットの自動配置は行わない**（挿入直後にプログラム的にキャレットを新段落へ移す処理は追加しない。ADR-002 of #287 参照）。

## 実装ステップ

### 1. `InlineEditor.tsx` — `applyEditable` のゲートを「純粋コンテナ除外」規則に置き換える

- **対象ファイル:** `app/components/note/editor/InlineEditor.tsx`
- **変更内容:**
  1. `EDITABLE_TAGS` の直後に、`EDITABLE_TAGS` を `,` join したセレクタ定数（例: `EDITABLE_TAGS_SELECTOR`）を追加。
  2. `containsEditableBlock(el: Element): boolean` ヘルパーを追加（`el.querySelector(EDITABLE_TAGS_SELECTOR) !== null`）。
  3. `applyEditable` 内のゲート `if (!isPre && !hasDirectTextChild(el)) continue;` を `if (!isPre && !hasDirectTextChild(el) && containsEditableBlock(el)) continue;` に変更。
  4. ゲート直上のブロックコメント（「Decorate the block when it has at least one direct text child; …」）を新規則の説明に書き換える: skip するのは「編集可能ブロックの純粋なコンテナ」だけであり、テキスト子も editable 子孫も持たないブロック（`<p><img></p>`、空 `<p>` 等）は decorate する（Issue #287）。
  5. ファイル先頭 JSDoc の不変条件 1（Allow-list block contentEditable）に、media-only / 子孫に editable ブロックを持たないブロックも decorate される旨を反映。
- **理由:** `<p><img></p>` に `contentEditable=true` が付かない唯一の原因がこのゲート。`hasDirectTextChild` は ADR-002 の意図（純粋コンテナ除外）の過剰に厳しい近似であり、意図の直接表現に置き換えることで媒体ケース・空ブロックケースを一括して正しく扱える。

### 2. `inlineEditor.test.tsx` — 新規則の pin テストを追加

- **対象ファイル:** `app/components/note/editor/__tests__/inlineEditor.test.tsx`
- **変更内容:** 既存の describe 構成に合わせて以下を追加（既存テストは全て green のまま維持されるはず — 変更しない）:
  1. **AC-1**: `value='<p><img src="/media/abc" alt=""></p>'` で `<p>` が `contenteditable="true"`、`<img>` 自身には `contenteditable` が付かないこと。
  2. **AC-2**: 初期 `value="<p>hi</p>"` でマウント後、`insertMediaIntoHtml` 相当の追記結果（`<p>hi</p>\n<p><img src="/media/abc" alt="" /></p>`）を新しい `value` として re-render → resync rebuild 後に 2 つ目の `<p>` が decorate されること（メディア挿入直後の経路の再現）。
  3. **AC-3**: `<p><img></p>` の `<p>` にテキストノードを追加（`p.appendChild(document.createTextNode("after"))` — キャレット横入力の DOM 上の等価操作）→ `flushMutations` → rollback されず、`onChange` が `img src="/media/…"` とテキスト双方を含む HTML で呼ばれること。
  4. **AC-4**: 上記 emit 値に `contenteditable` が含まれないこと（既存の round-trip テストパターンに倣う）。
  5. **一般化の pin**: 空 `<p></p>` が decorate されること（副産物の意図を固定）。
  6. **構造保持の pin**: `<p><img></p>` から `<img>` 要素を force-remove すると rollback して `<img>` が復元されること（既存の「non-text child force-removed」テストパターンに倣う。スコープ外の「削除は不可」制約を仕様として固定）。
  7. **contract docstring の更新**: ファイル先頭の contract コメント（「Editable allow-list applied only to text-bearing block elements.」の旧規則記述）を新規則（純粋コンテナ除外）に合わせて修正し、pin テスト群の意図説明と実装の不変条件（ステップ1-5 で更新する `InlineEditor.tsx` の JSDoc）を一致させる。
- **理由:** AC-5 の回帰（`<li><p>`・mixed blockquote・pre）は既存テストが既に pin しているため、追加分は新挙動の pin に集中する（AC-5 自体の検証はステップ3の既存スイート実行で行う）。

### 3. 品質ゲート

- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` → `pnpm test:unit`（少なくとも `inlineEditor.test.tsx` / `mediaInsert.test.ts` / `noteEditorImageButtonWiring.test.tsx` / `wysiwygEditorImageButton.test.tsx` を確認）。`inlineEditor.test.tsx` の既存 decorate 規則テストの green 維持が AC-5 の検証、`wysiwygEditorImageButton.test.tsx` / `noteEditorImageButtonWiring.test.tsx` の green と diff スコープの確認（`InlineEditor.tsx` + テストファイルのみ）が AC-6 の検証。
- **理由:** CLAUDE.md の規定。`mediaInsert.ts` は無変更だが、挿入経路の契約テストが green であることを確認する。

## 設計判断

- **ADR-001**（`.issue/287/adr.md`）: ゲートの緩め方は「メディアタグの追加許可リスト」ではなく「編集可能ブロックの純粋コンテナのみ skip」の一般規則を採用。ADR-002 (#233) の意図の直接表現であり、`<p><a><img></a></p>` や空 `<p>` も一括で救済する。`<pre>` の明示バイパスは維持。
- **ADR-002**（同上）: メディア挿入直後のキャレット自動配置は行わない（resync rebuild はフォーカスを破棄する既存設計のまま。クリックで編集開始）。

## リスクと注意点

- **`containsEditableBlock` の計算量**: `applyEditable` は全要素を走査しつつ各要素で `querySelector` を呼ぶため最悪 O(n²)。ノート本文の DOM 規模（数百〜数千ノード）では実害なし。rebuild/rollback 時のみ実行され、キー入力毎には走らない。
- **空 `<p></p>` が decorate される副産物**: ブラウザは空の contentEditable ブロックを高さ 0 で描画しうるため「編集可能だがクリックしにくい」ことがある。悪化ではなく中立〜改善方向（従来は完全に編集不可）。スタイル面の手当てはスコープ外と明記済み。
- **`<td><br></td>` などプレースホルダ `<br>` 付き空ブロックの入力はブラウザ実装依存で rollback されうる**: Chrome/Firefox は空ブロックの contentEditable への文字入力時、テキストノード追加と同じバッチでプレースホルダ `<br>` を remove することが多い。`removedNodes` に Element が混入すると ADR-003 (#233) の保守的バッチ rollback が発火し、「クリックして入力できるのに 1 文字目が即座に巻き戻る」挙動になりうる（悪化ではないが改善とも限らない）。ブラウザ検証で確認し、挙動が悪ければ空 `<p>`/`<br>` ケースのフォローアップ Issue 化を判断する。
- **rollback は最後の rebuild 時点の snapshot まで巻き戻る**: `snapshotRef` は rebuild 時にのみ更新され、許可されたテキスト編集では更新されない。したがって「画像の後ろにテキスト入力（emit 済み）→ `<img>` を Backspace で削除しようとする → rollback」のシーケンスでは、最後の rebuild 以降の全テキスト編集が DOM 上で巻き戻る。これは #233 由来の既存挙動だが、本変更は rollback を誘発しやすい要素（`<img>`）に隣接した編集を解禁するため遭遇頻度が上がる。ブラウザ検証で実害（挿入直後の編集が丸ごと消える体験）を確認し、必要なら snapshot の追従（許可 emit 時の snapshot 更新等）を別 Issue に切り出す。本 Issue のスコープには含めない。
- **`<img>` をクリック選択して文字入力するとブラウザが `<img>` を置換しようとする** → Element の remove を含む mutation となり rollback される（画像は消えない）。構造保持の仕様（C2-3）に整合するが、入力が巻き戻る体験になる点は既知のトレードオフ（ADR-003 #233 の保守的バッチ rollback と同種。巻き戻り範囲は上記のとおり snapshot 単位）。
- **rollback 経路との整合**: rollback は snapshot 復元後に `applyEditable` を再実行するため、新規則は rollback 後も一貫して適用される。snapshot は decorate 前の素の DOM の clone なので `contenteditable` の混入はない（既存不変条件のまま）。
- **`disabled` トグル**: `clearEditable` は `contenteditable` 属性の有無だけを見るため、decorate 対象が増えても正しく全消去される。

## テスト方針

- **ユニット（happy-dom / 既存パターン踏襲）**: 実装ステップ 2 の 6 ケース + 既存回帰スイート（`inlineEditor.test.tsx` 全体、`mediaInsert.test.ts`）。
- **ブラウザ検証（`pnpm start` 推奨 — dev サーバーは管理系 mutation で CSRF 403 になるため）**:
  1. 既存ノートを `inline` モードで開く → 画像をアップロード挿入 → 挿入直後に画像の前後をクリックしてテキスト入力できること（TC-C4-01/02 の inline 変形）。
  2. 入力後に自動保存 → 再読み込みして画像とテキスト双方が保存されていること（`/media/<id>` 参照が残り、孤児 purge 対象にならないこと）。
  3. `wysiwyg` モードでの画像挿入（TipTap 経路）が従来どおり動くこと。
  4. 空段落 / `<br>` 入り空セル（`<td><br></td>` 等）への入力挙動の確認 — プレースホルダ `<br>` の remove による rollback（1 文字目の巻き戻り）が起きるか。起きる場合はフォローアップ Issue 化を判断（リスク欄参照）。
  5. 画像の後ろにテキスト入力 → 保存を待たずに `<img>` を Backspace で削除しようとする → rollback 後も入力済みテキストが残存するかの確認。丸ごと消える実害があれば snapshot 追従を別 Issue に切り出す判断材料にする（リスク欄参照）。

## レビュー履歴

### 1周目
両視点とも問題点ゼロ（改善提案6件を反映）で終了。

**修正した点**:
- なし（問題点 P の指摘ゼロ）

**取り込んだ改善提案**:
- coverage S-001: AC-5 の対応ステップを「1, 2」から「1, 3」に修正（AC-5 の回帰検証は既存スイート実行＝ステップ3で行われるため。ステップ2は既存テストを変更しない）
- coverage S-002: AC-6 の検証方法を明文化（diff スコープ確認 + `wysiwygEditorImageButton.test.tsx` / `noteEditorImageButtonWiring.test.tsx` の green）し、ステップ3の確認対象テストに `wysiwygEditorImageButton.test.tsx` を追加
- arch-risk S-001: リスク欄の `<td><br></td>` 等プレースホルダ `<br>` 付き空ブロックの記述を「実ブラウザでは `<br>` remove により rollback されうる（悪化ではないが改善とも限らない）」に訂正し、ブラウザ検証項目4を追加
- arch-risk S-002: rollback が最後の rebuild 時点の snapshot まで巻き戻る（許可 emit では snapshot が更新されない）点をリスク欄に明記し、「テキスト入力 → 画像削除試行」のブラウザ検証項目5を追加
- arch-risk S-003: 実装ステップ2に `inlineEditor.test.tsx` 先頭の contract docstring（旧規則「text-bearing のみ」）の更新を追加
- arch-risk S-004: ネストコンテナ内メディア（`<li><img><p>…</p></li>` 等）が新規則でも編集不可である点を「含まれないもの」に既知の残余ギャップとして明文化

**見送った提案とその理由**:
- なし（6件すべて取り込み）
