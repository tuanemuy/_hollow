# Plan Review — Issue #710 (Round 1: アーキテクチャ整合性・実現可能性・リスク)

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク

対象: `.issue/710/plan.md` / `.issue/710/adr.md`

---

#### 問題点（要修正）

- **[P-001]** `styles.ts` の `filterChip` JSDoc（line 69）にある「Directory has no in-bar trigger ... shows just the active chip (#497 ADR-001)」が本変更で実態と矛盾するが、plan のステップに更新が含まれていない
  - 理由: 本 Issue はディレクトリのチップ表示をパンくずに置き換える。`app/components/note/list/styles.ts:62-77` の `filterChip` JSDoc は「directory は active チップのみ表示」と明記しており、変更後はドキュメントと実装が乖離する。CLAUDE.md は「コメントの正確性」と「設計判断の記録」を重視しており、`.issue/497/adr.md` ADR-001 を上書きする以上、コード内 JSDoc も同期すべき。plan のステップ 1〜6 は `directoryTree.ts` / `DirectoryBreadcrumb.tsx` / `FilterBar.tsx` / `HomePage.tsx` / テスト / ADR ファイルのみに触れており、`styles.ts` JSDoc の修正が抜けている。
  - 提案: ステップ 3（または 6）に「`styles.ts` の `filterChip` JSDoc から directory のチップ表示記述を除去し、パンくず化（#710 ADR-002）に言及する形へ更新」を追記する。

- **[P-002]** フォールバック分岐の表示条件が現状コードと完全には一致せず、過渡状態の挙動定義に曖昧さが残る
  - 理由: 現状 `FilterBar.tsx:373-387` は `optimisticDirectoryId !== undefined` を表示の外枠条件にし、内側で `optimisticDirectoryId === directoryId ? directoryName : "ディレクトリ"` を出し分けている。plan の AC-4 / ステップ 3 は (a) `optimisticDirectoryId === undefined` → 非表示、(b) `=== directoryId` かつ segments 非空 → パンくず、(c) それ以外 → フォールバックチップ、という3分岐を提案するが、「`optimisticDirectoryId !== undefined` かつ `!== directoryId`（別ディレクトリへ切り替え中の過渡状態）」のケースで何を出すかが (c) に丸められている。ただし本コンポーネントの optimistic reducer は directory に対し `clearDirectory`（undefined 化）しか持たず（`FilterBar.tsx:107-108`）、ディレクトリ「選択」は optimistic 経路を通らない（ツリー側 Link での通常 navigate）。したがって `optimisticDirectoryId` が `undefined` でも `directoryId`（baseline）でもない第三の値になる過渡状態は構造上発生しない。plan の (c)「optimistic が baseline と一致しない過渡状態」という記述は、実際には起き得ないケースをフォールバック理由に挙げており、フォールバックの真の発火条件（segments 空＝id がツリーに無い）と混同している。
  - 提案: 表示分岐を「`optimisticDirectoryId === undefined` → 非表示」「segments 非空 → パンくず」「`optimisticDirectoryId !== undefined` かつ segments 空 → フォールバックチップ」の2軸（undefined 判定 + segments 有無）に整理し直す。`=== directoryId` 判定は segments が baseline 由来である以上ほぼ冗長（baseline と optimistic が一致するときだけ segments が意味を持つ）。実装時に「optimistic が directoryId と異なる過渡状態」を分岐に書くと到達不能コードになるため、リスク節の記述（plan.md:151）も「directory には set 系 optimistic が無いため一致判定はほぼ常に true」と明確化すべき。

#### 改善提案（検討推奨）

- **[S-001]** `directoryAncestorSegments` の戻り値型を `NoteBreadcrumb`/`DirectoryBreadcrumb` の props 型（`readonly { id: string; name: string }[]`）と一致させ、可能なら共有型として宣言する
  - 理由: plan では `directoryTree.ts` のヘルパー戻り値・`FilterBar` の props・`DirectoryBreadcrumb` の props・`NoteBreadcrumb` の props が同じ `{ id; name }[]` 形を別々に書く。型の単一情報源（例: `directoryTree.ts` に `BreadcrumbSegment` を export し各所で参照）にしておくと、将来 segment 構造が変わったときの追従漏れを防げる。CLAUDE.md の「型安全優先・illegal state を表現不能に」の方針とも整合する。スコープは小さく、ADR-001 が共通化を見送った描画ロジックとは別レイヤー（型のみ）なので衝突しない。

- **[S-002]** `DirectoryBreadcrumb` の `nav` を `aria-label="パンくず"` のまま新設すると、同一ページ（P10 一覧）内で `nav aria-label` が重複しないかを確認する
  - 理由: `NoteBreadcrumb` は P11 詳細で `aria-label="パンくず"` を使う（`NoteBreadcrumb.tsx:38`）。P10 一覧側に別の `nav aria-label="パンくず"` を置く場合、同一ページ内に同名ランドマークが他に無ければ問題ないが、一覧ページの他ナビゲーション（ページネーション等）との関係でラベル文言を「現在のディレクトリ」等に差別化すると読み上げが明確になる。plan/ADR は「`NoteBreadcrumb` のパターン踏襲」とだけ述べ aria-label 文言の検討に触れていない。実装時に一覧ページの landmark 構成を一度確認することを推奨。

- **[S-003]** root 除外を「ヘルパー側で `name === ""` 除外」に一本化する方針は妥当だが、`#356 ADR-002` の「root の directoryId をフィルタに渡さない」との二重防御の責務境界を JSDoc に明記する
  - 理由: plan は root 混入防止を (1) ヘルパーの `name === ""` 除外、(2) ツリー側が root id を渡さない、の2点で担保するとしている（plan.md:153）。`flattenDirectoryTree`（`directoryTree.ts:30-32`）は root の空名セグメントを path から落とすが flat 配列には root 行自体を残す。`directoryAncestorSegments` で `parentId` を辿る際、root（`name===""`）に到達してこれを除外する設計は正しい。ただし「なぜヘルパーで除外するのか（呼び出し側が root id を渡さない前提でも防御的に除外する）」を JSDoc に残さないと、将来「呼び出し側が保証するなら除外不要では」とリグレッションされうる。ADR-002 の踏襲意図を JSDoc に1行残すとよい。

#### 良い点

- presentation 層のみの変更という結論が正確。`FilterSection`（`HomePage.tsx:165-182`）は既に `loadDirectoryTreeFlat` の `flat` をロード済みで、各 `FlatDirectory` が `parentId`/`name` を持つ（`directoryTree.ts:14-20`）ため、`directoryId` から `parentId` を辿る純粋関数で祖先を再構成でき、「追加 I/O 不要・ドメイン/ユースケース不変」の主張はコードで裏付けられる。レイヤー内側からの設計順（純粋ヘルパー → コンポーネント → 配線）も依存方向に忠実。
- 純粋ヘルパーの置き場を `directoryTree.ts`（既存の flatten/exclude 系純粋関数の SSOT）に集約し、`loaders.ts`（`serverData(getContainer())` 依存）に純粋ロジックを置かない方針は `directoryTree.ts` の JSDoc（line 6-13）に明記された規約と完全に一致。
- ADR-001（`NoteBreadcrumb` 流用 vs `DirectoryBreadcrumb` 新設）の判断が妥当。`NoteBreadcrumb` は `noteTitle: string` を必須 props に持ち末尾に `aria-current="page"` のタイトルを置く前提（`NoteBreadcrumb.tsx:19-22, 60-63`）で、一覧側の末尾（解除 `×`）と意味・props 形が根本的に異なる。汎用化（render-prop 化）は安定契約（commit 322516ee）を壊すリスクがあり、新設＋パターン踏襲の選択は合理的。重複リスクも「3つ目が出たら共通化」とフォローアップ余地として正しく認識している。
- root セグメント除外を `name === ""` 判定で行う方針が `flattenDirectoryTree` の既存規約（`directoryTree.ts:30-32`「root carries name=''」）および `#356 ADR-002`（root id をフィルタに渡さない）の双方と整合。
- `Link` の search 構築を `{ ...HOME_SEARCH, directoryId: segment.id }` で `NoteBreadcrumb` と同一パターンにする点が正しい。`HOME_SEARCH = {}`（`links.ts:16`）の SSOT を踏襲し、URL 汚染を避ける既存規約に沿う。
- スタイルを `filterChip` 語彙ではなく `text-sm text-ink-tertiary` 系のナビゲーション言語にする方針が、Issue の主目的（チップ＝絞り込み / パンくず＝居場所の意味分離）と utility-first 規約の双方に合致。`NoteBreadcrumb` の `CRUMB_LINK`/`SEP` パターン（`NoteBreadcrumb.tsx:24-25`）を正として揃える点も妥当。
- props 置換の波及範囲を `HomePage.tsx` のみと特定（grep 済み）。実際に `directoryName` を `FilterBar` 用途で参照するのは `FilterBar.tsx` と `HomePage.tsx` のみで、他の同名 prop（`DeleteDirectoryDialog` 等）は無関係という調査結果が正確。`skeletons.tsx` の `FilterBarSkeleton` は props を取らないため波及なし。
- フォールバック（segments 空＝削除直後等）で空 nav を出さず従来チップへ落とす設計が、`directoryAncestorSegments` の「id 不在時は空配列」契約と表示条件（segments 非空）で正しく噛み合っている。
- テスト方針が既存資産（`directoryTree.test.ts`・`FilterBar.test.tsx`・`NoteBreadcrumb.test.tsx` の Link モック手法）の流用として現実的。`directoryTree.test.ts` は既存（8 test）で `directoryAncestorSegments` の追記先として妥当。
