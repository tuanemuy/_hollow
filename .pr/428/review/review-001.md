# PR Review #001 — feat(#423): 楽観的UI更新を複製・tag・directory 展開に拡張

**PR:** #428
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- **Blockers:** 7 件（すべてテストレイヤー、reducer 単体テスト欠落・複数行誤配信検証不足・optimistic patch 破棄検証なし）
- **Warnings:** 8 件（exhaustiveness guard / reducer 可視性 / DOM selector 脆性など）
- **Notes:** 優秀（useOptimistic 正確・transition セマンティクス・親子責務・#414 踏襲・設計判断記録など）
- **Verdict:** **BLOCKED**（テスト品質の修正が必須）

---

## Frontend Components

### Blockers

なし。

### Warnings

- **[W-001]** SavedViewsList reducer に exhaustiveness check がない（switch に default なし）
  - 場所: `app/components/view/SavedViewsList/index.tsx:96-108`
  - 理由: TypeScript は union 型の穴をキャッチするが、新しい action type 追加時にランタイム保険がない
  - 提案: 末尾に `const _: never = action;` または default 句で throw を追加

- **[W-002]** TagList reducer も同様に exhaustiveness guard がない
  - 場所: `app/components/tag/TagList.tsx:31-42`
  - 理由: 同上
  - 提案: exhaustiveness check 追加

- **[W-003]** TagList error state の命名が曖昧（actionErrorId で delete/rename の区別が不明）
  - 場所: `app/components/tag/TagList.tsx:57-58`
  - 理由: delete と rename の同時実行がないため実害はないが、可読性が低い
  - 提案: JSDoc で「delete と rename は同時実行しない」ことを明記するか、命名を `mutationError` に寄せる

- **[W-004]** DirectoryTree の transition 所有権が parent へ移行、設計境界が複雑
  - 場所: `app/components/directory/DirectoryTree.tsx:222-243`
  - 理由: input change handler と `isPending` の同期が複雑
  - 提案: 現状のコメントで説明済みのため許容。ただし保守者向けに注意コメントを強化推奨

- **[W-005]** SavedViewsList の AddAction で重複 key 防御が if 分岐（実装上発動しない可能性）
  - 場所: `app/components/view/SavedViewsList/index.tsx:986-988`
  - 理由: server が採番 id を返すため、baseline 更新時に patch が破棄されるはずで防御が不要な可能性
  - 提案: テスト pass で検証済みのため許容。コメント（line 982-985）で意図を説明済み

### Notes

- **[N-001]** useOptimistic の配置が全て early return より前で正確。#414 の教訓を完全に踏襲。
- **[N-002]** transition セマンティクスが正確。SavedViewsList / TagList / DirectoryTree いずれも `applyOptimistic` → `await mutation` → `await invalidate` の順序が正確。
- **[N-003]** 親所有データの子からの変更がない。SavedViewsList の delete/add、TagList の delete/rename、DirectoryTree の rename いずれも親子責責分離が完璧。
- **[N-004]** エラー所有が明確。delete/add/rename エラーの所有がそれぞれ一貫。
- **[N-005]** reducer の不変性が保持。全て readonly 返却型で新配列。
- **[N-006]** TagActions が props drill を整理して clean。mutation 関心が親に完全に委譲。
- **[N-007]** DirectoryTree の InlineRenameInput refactor が正確。React 19 transition セマンティクスに完全準拠。
- **[N-008]** TagList の候補再計算が即座に反応。delete で optimisticTags が即座に更新される。
- **[N-009]** ADR の記述が正確。設計判断が実装に反映されている。

---

## Test Design

### Blockers

**[B-001]** optimistic add が `routerInvalidate` 完了前の状態をテストしていない
- 場所: `SavedViewsList.test.tsx:285-317`
- 理由: テストは resolver 解決後に検証しており、mutation 直後（invalidate pending）の optimistic 状態が正確にテストされていない
- 提案: `duplicateMock` 完了直後と `routerInvalidate` 完了後の状態を分けてアサート

**[B-002]** 二重キー防御のテストが reducer ロジックを検証していない
- 場所: `SavedViewsList.test.tsx:319-337`
- 理由: reducer の条件分岐 `cur.some((view) => view.id === action.view.id)` が直接テストされていない。DOM の結果で間接的にテストしているだけ
- 提案: `reduceViews` 関数の単体テストを追加し、add action で既存 id を検出した際に配列が変わらないことを直接確認

**[B-003]** duplicate 失敗時の error が source row に正確に紐付いているか未検証
- 場所: `SavedViewsList.test.tsx:339-371`
- 理由: 2 行以上のビューでテストし、複製失敗時に source row のみにエラーが出ることを明示的にアサートしていない
- 提案: 複数行を render して、v1 複製失敗時に v1 のみにエラーが出ることを確認

**[B-004]** TagList の reducer ロジックが直接テストされていない
- 場所: `TagList.test.tsx` 全体
- 理由: `reduceTags` 関数（lines 31-42）の単体テストが存在しない。rename 時に noteCount を保持すること、remove で正確に id で filter することが reducer レベルで検証されていない
- 提案: `describe("reduceTags")` を追加し、各 action 種別に対して配列の変更を直接検証

**[B-005]** tag delete 時の merge candidate 更新が正確に反映されているか不十分
- 場所: `TagList.test.tsx:201-244`
- 理由: delete 後に削除されたタグが候補からも外されたことを直接検証していない。DOM 要素の出現数で間接的にテストしているだけ
- 提案: 削除前後で merge button のテキスト内容（候補タグ名）を検証し、削除タグへの参照が消えていることを直接確認

**[B-006]** optimistic name が patch 破棄時に baseline に戻ることをテストしていない
- 場所: `DirectoryTree.test.tsx:115-169`
- 理由: テストコメント（line 117-122）は「visual は browser で確認」と述べており、`useOptimistic(node.name)` の core behavior（failure/invalidate 時に baseline へ snap back）がテストされていない
- 提案: router.invalidate() resolver 後の state を検証し、optimistic 名が baseline へ戻っていることを確認

**[B-007]** rename 失敗時に input が remain したまま、editor close されない設計が検証不足
- 場所: `DirectoryTree.test.tsx:171-234`
- 理由: input が remain することは確認しているが、retry UX（input が active か、error が表示されるか、再度 Enter で retry できるか）が検証されていない
- 提案: failure 後に input が disabled でないこと、error message が表示されること、再試行できることを検証

### Warnings

- **[W-001]** 二重キー防御が id 型安全性に依存。型検証がない（SavedViewsList.test.tsx:102, 176）
- **[W-002]** delete 成功パスが resolver 後の状態を検証していない（SavedViewsList.test.tsx:141-180）
- **[W-003]** rename エラーが複数行で正確に row に限定されるか未検証（SavedViewsList.test.tsx:229-282）
- **[W-004]** TagList rename 入力要素の選択が脆弱（value で絞り込み）（TagList.test.tsx:116-119）
- **[W-005]** rename 失敗時に editor が開いたままかどうかが暗黙的（TagList.test.tsx:98-156）
- **[W-006]** rename commit 時の trimming が単体検証されていない（DirectoryTree.test.tsx:147）
- **[W-007]** 複数 directory で rename 中に別の rename menu を open した場合の state 衝突がテストされていない（DirectoryTree.test.tsx 全体）
- **[W-008]** delete 失敗時に merge candidates が正確に update されているか未検証（TagList.test.tsx の candidates テスト）

### Notes

- **[N-001]** makeView / makeNode が test data factory として品質が高い
- **[N-002]** buttonByLabel / buttonByText が aria-label / substring match で a11y テストの副作用価値あり
- **[N-003]** flush() utility が複数 Promise.resolve() で React 19 transition を正確に待っている
- **[N-004]** optimistic default toggle テスト（SavedViewsList.test.tsx:374-407）が設計意図を明示しており他のテストの参考になる
- **[N-005]** TagList の delete 時の candidates テスト（line 201-244）が「list-level state の副次効果」を高度に検証
- **[N-006]** openMenu / clickMenuItem helper が menu interaction を procedural abstraction で読みやすい
- **[N-007]** router.invalidate mock が呼び出される確認で side effect 検証

---

## Architecture & Design Patterns

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001]** 設計判断の記録（plan.md / adr.md）と実装が完全に一貫。特に ADR-001（複製の contract 変更）で #414 ADR-002 の前提誤りを明確に指摘。
- **[N-002]** #414 パターン の厳密な踏襲。list-level / row-level の使い分け、timing（transition 外の state 更新）、エラー所有、フック順序すべて一貫。
- **[N-003]** 親所有データ制約の徹底。tag 表示名を TagManager→TagList へ引き下げ、directory tree は _app 所有のため rename つなぎのみ限定。
- **[N-004]** 3ルール（invalidate 戦略）の正確性。tag は `routerInvalidate`、directory rename は raw `router.invalidate()`、move/delete は非楽観。
- **[N-005]** エラーハンドリングの一貫性。複製エラーは source row、tag エラーは baseline recovery 時、directory 削除は入力リトライ動線。
- **[N-006]** テスト戦略の合理性。成功時は component テスト、失敗時は rollback 検証、実機は manual-test で UX 即時反映確認。
- **[N-007]** スコープ の明確な線引き。実施（複製・tag）/ 限定（directory rename）/ 見送り（アップロード・hook 抽出）の各判断が妥当。
- **[N-008]** domain・application 層への影響なし。presentation 層のコンポーネント構成変更のみでスキーマ不変。

---

## Design Decisions

このラウンドで発見された主要な指摘：

- **reducer 単体テスト欠落**: `reduceViews` / `reduceTags` が reducer として純粋な関数だが、単体テストがない。component 統合テストで機能を間接検証しているが、reducer 自体の正当性を直接検証すべき。修正必須。
- **optimistic patch 破棄の未検証**: DirectoryTree の `useOptimistic(node.name)` が failure / invalidate 時に baseline へ snap back することが component テストされていない。テストコメントで「browser で確認」と明記しているが、unit test の責務として補うべき。修正必須。
- **複数行での誤配信検証欠落**: SavedViewsList / TagList がいずれも「複数行が存在するときに、操作対象以外の行に誤ってエラーが出ないか」を検証していない。edge case カバレッジ不足。修正必須。

---

## 修正タスク

Blocker 7 件の修正を推奨：

| B- | 修正内容 | ファイル | 優先度 |
|----|---------|---------|--------|
| B-001 | optimistic add の mutation 直後テストを追加（resolver pending 状態） | SavedViewsList.test.tsx | HIGH |
| B-002 | `reduceViews` 単体テスト追加（id 重複時の動作） | SavedViewsList.test.tsx | HIGH |
| B-003 | 複数行テストで duplicate error の source 行紐付けを検証 | SavedViewsList.test.tsx | HIGH |
| B-004 | `reduceTags` 単体テスト追加（rename noteCount 保持、remove filter） | TagList.test.tsx | HIGH |
| B-005 | 複数行テストで delete 時の candidates 更新を検証 | TagList.test.tsx | HIGH |
| B-006 | optimistic name が invalidate 後に baseline へ戻ることを検証 | DirectoryTree.test.tsx | HIGH |
| B-007 | rename 失敗時の retry UX（input active、error 表示、再試行可能）を検証 | DirectoryTree.test.tsx | HIGH |

---

## 次のステップ

1. 上記 Blocker 7 件を修正（テストファイルの追加・拡張）
2. 再レビュー（review-002.md）
3. 2 回連続でブロッカー 0件 → 完了
