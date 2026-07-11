# Plan Review — Issue #287 / Round 1（アーキテクチャ・実現可能性・リスク視点）

レビュー対象: `.issue/287/plan.md` / `.issue/287/adr.md`
レビュー観点: レイヤー構造との整合・ロジックの置き場所・実現可能性・見落とされた依存/副作用・エッジケース・トレードオフの妥当性

## 検証プロセス（前提の突き合わせ）

計画の主要な事実主張を実コードと照合した。結果はすべて一致:

- `insertMediaIntoHtml` が既に `<p><img src="/media/<id>" alt="" /></p>` で包んで返すこと（`app/components/note/editor/mediaInsert.ts:41`、`__tests__/mediaInsert.test.ts` で pin 済み）。Issue 起票時の ADR-005 (#233) の記述から状況が変わっているという計画の指摘は正しい。
- 乖離の唯一の原因がゲート `if (!isPre && !hasDirectTextChild(el)) continue;`（`InlineEditor.tsx:294`）であること。
- 新ゲート `¬containsEditableBlock(el)` の挙動表（plan.md の 8 行）を全ケース机上検証 — すべて計画どおり。既存 pin テスト（`<li><p>` skip / mixed blockquote 両 decorate / `<pre><code>` decorate / table・td / disabled トグル）に skip 側を壊すものは無く、既存テストは green のまま維持される見込み。`EDITABLE_TAGS` に `pre` が含まれるため `<td><pre>…</pre></td>` の外側 `<td>` も従来どおり skip される（一貫性 OK）。
- `classifyRecords` は「contentEditable 継承下 target への TEXT_NODE のみの childList」を許可する（`InlineEditor.tsx:400-414`）ので、decorate さえされれば分類器の変更は不要 — 計画どおり。
- `serializeHostContent` / `structureSignature` / `clearEditable` がゲートに依存しないことも確認。`applyEditable` の 4 呼出経路（mount rebuild / resync rebuild / rollback / disabled トグル）の列挙は正確。
- サニタイザは `img`/`video`/`audio`/`source` を許可（`htmlSanitizer.ts:130-152`）、`MEDIA_ID_FROM_URL` は HTML 文字列不変のため影響なし — 計画の「ドメイン/アプリ/アダプター影響なし」は正しい。
- `NoteEditor.tsx` の `onMediaInsert`（231-259 行）: inline は `setContent` 文字列追記経路 → resync rebuild。AC-2 のテスト設計（外部 value 変更 → re-render）は挿入経路の忠実な再現になっている。

## 問題点（要修正）

問題点ゼロ。

計画はレイヤー配置（presentation 層内の純粋関数 1 箇所に閉じる修正）、依存方向（内側レイヤー無変更の確認から出発）、Issue 要件（挿入された `<img>` の前後でインライン編集可能）のすべてを満たしており、既存 pin テストとの整合も机上検証で崩れない。ブロッカーは見当たらない。

## 改善提案（検討推奨）

- **[S-001]** リスク欄の「`<td><br></td>` … `<br>` の隣にテキストを入力しても TEXT_NODE 追加なので分類器は許可する — 想定どおり」という主張は、実ブラウザでは成立しない可能性が高い。
  - 理由: Chrome/Firefox は空ブロックのプレースホルダ `<br>` を持つ contentEditable に文字を入力すると、テキストノード追加と同じバッチで `<br>` を **remove** することが多い。`removedNodes` に Element が混入するため ADR-003 (#233) の保守的バッチ rollback が発火し、「クリックして入力できるのに 1 文字目が即座に巻き戻る」挙動になりうる。従来（decorate されず完全に編集不可）より UX として紛らわしくなる面があり、「改善方向・想定どおり」という断定は過大。
  - 提案: リスク欄の当該記述を「`<br>` プレースホルダ付き空ブロックはブラウザ実装依存で rollback されうる（悪化ではないが改善とも限らない）」に改め、ブラウザ検証手順に「空段落 / `<br>` 入り空セルへの入力」を 1 項目追加する。挙動が悪ければ空 `<p>`/`<br>` ケースのフォローアップ Issue 化を判断できる。

- **[S-002]** リスク欄「入力した 1 文字目も巻き戻る」は rollback の実際の影響範囲を過小に記述している。
  - 理由: `snapshotRef` は rebuild 時にのみ更新され、許可されたテキスト編集では更新されない（`InlineEditor.tsx`: snapshot 設定は `rebuild` 内のみ）。したがって「画像の後ろにテキストを入力（emit 済み）→ 画像を Backspace で削除しようとする → rollback」のシーケンスでは、最後の rebuild 以降の**全**テキスト編集が DOM 上で巻き戻り、次の編集の emit で古い内容が親 state を上書きする。これは #233 由来の既存挙動で本計画が導入するものではないが、本計画は「rollback を誘発しやすい要素（`<img>`）に隣接した編集」を新たに解禁するため、この既存挙動に遭遇する頻度を上げる。
  - 提案: ブラウザ検証手順に「画像の後ろにテキスト入力 → 保存を待たずに画像を Backspace で削除しようとする → 入力済みテキストの残存を確認」を追加する。実害（挿入直後の編集が丸ごと消える体験）が確認されたら、snapshot の追従（許可 emit 時に snapshot を更新する等）を別 Issue として切り出す判断材料になる。本 Issue のスコープには含めなくてよい。

- **[S-003]** 実装ステップ 2 は `inlineEditor.test.tsx` のファイル先頭 docstring（19-33 行「Editable allow-list applied only to text-bearing block elements.」）の更新に触れていない。
  - 理由: ステップ 1.5 で `InlineEditor.tsx` の JSDoc 不変条件 1 を更新する計画になっている一方、テストファイル側の contract 記述が旧規則（text-bearing のみ）のまま残ると、pin テスト群の意図説明と実装の不変条件が食い違う。
  - 提案: ステップ 2 に「テストファイル先頭の contract コメントを新規則（純粋コンテナ除外）に合わせて 1 行修正」を含める。

- **[S-004]** ネストしたコンテナ内のメディア（`<li><img><p>foo</p></li>` / `<blockquote><img><p>bar</p></blockquote>` 等）は新規則でも外側が skip されるため、`<img>` に隣接する編集は依然不可。
  - 理由: 外側要素は「editable 子孫あり・直接テキスト子なし」なので純粋コンテナとして skip される。`insertMediaIntoHtml` はトップレベル追記しかしないので挿入経路では発生せず Issue 範囲外だが、`html` モード手書き由来のノートで「画像は編集できるようになったはずでは」という将来の混乱の芽になる。
  - 提案: スコープの「含まれないもの」に 1 行追記して既知の残余ギャップとして明文化する（実装変更は不要）。

## 良い点

- **原因の特定が正確で、修正が最小点に閉じている。** Issue の検討事項 1（`<p>` ラッパ）が既に実装済みであることをコードとテストで確認した上で、「残る乖離は `applyEditable` のゲートのみ」と特定している。Issue 起票時から状況が変わったことを見抜いており、不要な `mediaInsert.ts` 変更を避けている。
- **ゲートの再設計が「例外の列挙」でなく「意図の直接表現」になっている。** ADR-001 の 3 案比較は適切で、案 1（メディアタグ追加許可）が `<p><a><img></a></p>` で漏れる点、案 3（`<img>` を許可リストへ）が void 要素の編集ホスト不成立と許可リスト方式の意味論破壊で成立しない点の分析は正しい。採用案は ADR-002 (#233) の本来意図（純粋コンテナ除外）への回帰であり、「既存コードに合わせるだけ」でも「理想形の追求しすぎ」でもないちょうどよい高度。
- **`isPre` バイパスの明示維持の判断が良い。** 新規則の偶然の帰結（`code` は許可リスト外なので `<pre><code>` も decorate される）に頼らず、`<pre>` の不透明領域という独立不変条件を明示のまま残す判断は、将来 `code` が許可リストに入った場合の regression を防ぐ。
- **レイヤー分析が正確。** ドメイン（`MEDIA_ID_FROM_URL`）・アダプター（サニタイザ許可タグ）・アプリケーション無影響の確認を「調査結果」として根拠付きで示しており、presentation 層内の変更であることの検証が形式的でない。
- **挙動表 + AC ↔ ステップ対応表 + 4 呼出経路の依存確認**により、変更の波及範囲が机上で追試可能な形で提示されている。実際に全ケースを既存テストと突き合わせたが齟齬はなかった。
- **ADR-002（キャレット自動配置を見送る）は適切なスコープ抑制。** `InlineEditor` の `value`/`onChange` I/O 契約と resync rebuild の単純さを守る判断で、Issue ゴール（編集「可能」になる）を満たしつつ結合を増やさない。
- **ブラウザ検証で `pnpm start` を指定**しており、dev サーバーの CSRF 403 制約を踏まえた現実的な手順になっている。孤児 purge（`/media/<id>` 参照残存）の確認まで含めている点も良い。
