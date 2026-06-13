# レビュー: PR #713 — Issue #710 ディレクトリ表示のパンくず化

観点: Logic / 正しさ（純粋関数のエッジケース、データ変換の正しさ）

対象主要ファイル:
- `app/components/note/directoryTree.ts`（`directoryAncestorSegments`, `BreadcrumbSegment`）
- `app/components/note/HomePage.tsx`（`FilterSection` の呼び出し）
- `app/components/note/list/FilterBar.tsx`（表示分岐 / 正規化）
- `app/components/note/list/DirectoryBreadcrumb.tsx`（描画）
- `app/components/note/__tests__/directoryTree.test.ts`（ユニットテスト）

---

### Logic / 正しさ

#### Blockers

なし。

`directoryAncestorSegments` のコアロジック・表示分岐ともに、計画（`.issue/710/plan.md`）と ADR の判断どおりに正しく実装されている。徹底検証の結果、正しさを損なう欠陥は検出しなかった（詳細は下記 Notes）。

#### Warnings

- **[W-001]** 循環参照ガード時に「壊れた鎖」をそのままパンくず表示してしまう（中間が欠けた経路を root→leaf として描画する）
  - 場所: `app/components/note/directoryTree.ts:56-65`
  - 理由: `visited` セットは無限ループを正しく防ぐが、循環を検出した時点で walk を打ち切るだけで「収集済み chain を破棄する」処理がない。テスト（`directoryTree.test.ts:697-707`）は `a→b→a` の循環に対し `[{b,B},{a,A}]` を「期待結果」として固定しているが、これは root（`parentId===null`）に到達していない不完全な祖先鎖をそのままパンくず化したもので、UI 上は「root に繋がらない宙に浮いた経路」を「正しい現在地」として提示することになる。同様に「祖先が Map に無い」打ち切り（`directoryTree.test.ts:709-717` の `c(parent=gone)` → `[{c,C}]`）も、root 未到達のまま末端だけを表示する。
  - これは「無限ループしないか」という第一義の安全性（→ OK）とは別の、「データ破損時に部分的な誤情報を確定情報として描画してよいか」という正しさの問題。`directoryId` 自体がツリーに無い場合は空配列→フォールバック（健全）なのに、ツリーに有るが祖先が壊れている場合だけ部分鎖を出すのは挙動が非対称。
  - 評価: 循環・親欠落は本来 backend 不変条件（`assertNotCyclicMove` 等）で発生しないはずのデータ破損ケースであり、実運用での発火可能性は極めて低い。よって Blocker ではなく Warning。ただし「ガード＝安全に縮退」を意図するなら、`current` が `parentId===null` の root に到達せず打ち切られた場合は空配列を返す（`directoryId` 不在時と同じフォールバック経路に寄せる）方が、UI の正しさとして一貫する。現状テストが部分鎖を「期待値」として固定しているため、仕様としてどちらを正とするかを明示した上で揃えるのが望ましい。

#### Notes

- **[N-001]** `directoryAncestorSegments` の root→leaf 再構成は正しい。`directoryId` から `parentId` を `null` まで辿って `chain` に積み（leaf→root 順）、`.reverse()` で root→leaf 順に直す変換は正確。テスト `y2024 → [Work, 2024]`（`directoryTree.test.ts:672-677`）が順序の正しさを担保しており、テスト fixture（`tree`, :38-56）の親子関係（root→work→y2024）とも整合する。

- **[N-002]** root（`name===""`）の除外が正しい。`.filter((d) => d.name !== "")` を `.reverse()` の後・`.map` の前に適用しており、root セグメントが結果に混入しない。`work`（root 直下）→ `[Work]`、`root` 自身 → `[]` のテスト（:680-690）が境界を正しく押さえている。`#356 ADR-002`（root id をフィルタに渡さない）に対する「呼び出し側保証＋ヘルパー側防御」の二重防御も JSDoc（:37-41）に意図が明記され、リグレッション防止として妥当。`DirectoryBreadcrumb` 側で各セグメントを `{ ...HOME_SEARCH, directoryId: segment.id }` のリンクにする際、root が既に除去済みなので root id がリンクに乗らない点も正しい。

- **[N-003]** id 不在時に空配列を返す挙動が正しい。`byId.get(directoryId)` が `undefined` のとき while ループが一度も回らず `chain` が空 → 空配列。テスト（:692-695 `missing`）で担保。FilterBar 側はこの空配列を `segments.length > 0` 判定でフォールバックに落とすため（`FilterBar.tsx:443-461`）、「空 nav を描画しない」という AC-5 が成立する。

- **[N-004]** 循環ガードが無限ループを確実に防ぐ点は正しい。`while (current !== undefined && !visited.has(current.id))` で、訪問済みノードに再到達した瞬間に停止する。`a→b→a` のトレース（current=a→push→b→push→a が visited 済みで停止）で有限回終了することを確認。`visited` への追加がループ本体先頭で push より前にある順序も正しい（自己ループ `x→x` でも 1 回で停止）。

- **[N-005]** 表示分岐 `(directorySegments ?? []).length > 0` 相当の正規化（`FilterBar.tsx:308-311` で `const segments = directorySegments ?? []` に集約）が、`undefined`（未選択）と `[]`（解決失敗）の挙動を正しく揃えている。外枠は `optimisticDirectoryId !== undefined`（:443）で、内側を `segments.length > 0`（:444）で分岐。3 状態（非表示／パンくず／フォールバック）が排他かつ網羅で、到達不能コードがない。`FilterAction` union に directory の `set` 系が無く `clearDirectory`（`directoryId: undefined`）のみ（`FilterBar.tsx:81-92, 109-110`）であることをコードで確認したため、「`optimisticDirectoryId` が undefined でも baseline でもない第三の値」になる過渡状態は構造上発生せず、計画の「`=== directoryId` 一致判定は冗長なので使わない」という判断は正しい（実際 PR でも一致判定は削除されている）。

- **[N-006]** `HomePage.tsx` の配線が正しい。`search.directoryId === undefined ? undefined : directoryAncestorSegments(flat, search.directoryId)`（:177-181 付近）で、未選択時は `undefined`、選択時はセグメント配列。条件付きスプレッド `{...(directorySegments !== undefined ? { directorySegments } : {})}` で prop を出し分け、FilterBar 側の正規化（N-005）と噛み合う。「undefined（未渡し）」と「[]（渡すが空）」の両形態を FilterBar が等価に扱うため、配線とのインピーダンスミスマッチがない。

- **[N-007]** パフォーマンス: `directoryAncestorSegments` は呼び出しごとに `flat` 全体から `Map` を再構築する（O(N)）が、`FilterSection` は async server component（RSC）で、`directoryId` 確定時に 1 回だけ評価される。クライアントの毎レンダー再構成ではないため、メモ化は不要。ディレクトリ数は実用上小さく、計算量上の懸念はない。`DirectoryBreadcrumb` 側の key 生成（`segments.slice(0, index+1).map(...).join("/")`, `DirectoryBreadcrumb.tsx:46-49`）は各セグメントで O(index) ＝全体 O(M²) だが、M（階層数）は小さく問題にならない。`NoteBreadcrumb` の既存パターン踏襲としても一貫。

- **[N-008]** 共有型 `BreadcrumbSegment` への置換が挙動非変更で正しい。`NoteBreadcrumb.tsx:18` のインライン `readonly { id: string; name: string }[]` を `readonly BreadcrumbSegment[]`（同形）に差し替えただけで、描画ロジックは不変。型の SSOT 化として妥当。

- **[N-009]** テストのデータ変換検証が的確。ネスト／root 直下／root 自身／id 不在／循環／親欠落の 6 ケースを網羅し、各期待値が fixture と整合。特に循環・親欠落の期待値固定は W-001 の論点（部分鎖を正とするか）に直結するため、仕様判断を変える場合はこのテストの期待値も合わせて見直す必要がある。
</content>
</invoke>
