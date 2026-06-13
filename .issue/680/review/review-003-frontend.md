# PR #684 レビュー — review-003（Frontend / 3周目・最終確認）

- 対象 PR: #684
- 観点: Frontend
- 実装計画: `.issue/680/plan.md` / 設計判断: `.issue/680/adr.md`（ADR-004 まで）
- 前周: `.issue/680/review/review-002-frontend.md`（Frontend W-001: ADR-004 の論拠精緻化を要求）
- 結論: 2周目 Frontend W-001 は適切に解消された。論拠の重心が「区別不能（本質的制約）」から「実害の小ささ」へ正され、断定の言い過ぎが取り除かれた。コードは前周（コミット `47a4bdba`）から不変で、3フォーム配線・AC 整合に新たな問題なし。**Blocker なし。問題なし（APPROVED）。**

## 2周目 Frontend W-001 の解消確認

2周目 W-001 の要求は2点だった: (1) 見送り根拠の重心を「区別不能（本質的制約）」から「実害小」へ移す、(2) `onBlur` arm 解除案を「relatedTarget 分離が未実測のため採らない」と表現を精緻化する。本フックの変更は不要との結論も付いていた。

更新後の ADR-004 Consequences（`.issue/680/adr.md` L143-145）を Read で確認:

- 冒頭が「**見送りの主たる根拠は実害の小ささにある**」に変わり、論拠の重心が実害小へ移った。`activeElement === body` ガードで別要素移動ケースは既に復元が走らない（実機 E-2 PASS）こと、残るのは「意図的 body blur ＋ 直後の無関係 invalidate の偶然重なり」という稀ケースのみで value 保持・再クリック可で実害が小さいこと、を主根拠として整理し直している。要求 (1) を満たす。
- `onBlur` arm 解除案について、旧版の「本質的に区別不能」断定が除かれ、「detach とユーザーの意図的 body blur を `onBlur` だけで**分離できるかは未実測**」「必要が生じれば **onBlur の relatedTarget 観測を実機で裏取りしてから判断する**」という未確定・実機裏取り前提の表現に精緻化されている。要求 (2) を満たす。
- フック本体（`useRestoreFieldFocusOnCommit.ts`）は前周から変更なし（`git diff main...HEAD` で確認、ソース変更は前周コミット `47a4bdba` の4ファイルのみ）。要求どおりコード変更なし。

→ 2周目 W-001 は適切に解消。再掲・新規化の必要なし。

## コード・配線の最終確認

- フック本体 `app/components/common/useRestoreFieldFocusOnCommit.ts`（165行）は前周 Read 内容と一致。退避（イベント駆動 + onBlur 最終退避）/ 復元（毎コミット後 dep なし effect）の分離、`composingRef` IME ガード、`isConnected` ガード、snapshot=null フォールバック（focus のみ・`setSelectionRange` 非呼出）、post-commit `activeElement === el` での arm（ADR-004 の修正本体, L129-131）すべて健在。
- 3フォーム配線（`git diff main...HEAD` で実確認）:
  - `SavedViewsList/index.tsx`: rename `<input>` に `ref={renameFocus.ref}` + `{...renameFocus.handlers}`。`autoFocus` 維持、`onChange` は独立プロップ。
  - `admin/PromptsForm/index.tsx`: text `<textarea>`（`HTMLTextAreaElement`）と variables `<input>`（`HTMLInputElement`）を**別フックインスタンスで個別配線**。型パラメータが要素に整合。
  - `identity/PromptsForm/index.tsx`: intent `<textarea>` のみ配線。`PreviewPanel.sample` は未配線（スコープ外遵守）。DEV `staleTime:0` / 本番無害の WHY コメントあり。
- いずれも `{...handlers}` に `onChange` を含まず、各フォームの `onChange`/`useState` seed は不変 → value 保持（AC-7）が構造レベルで担保。
- `pnpm vitest run` で当該ユニット **9件 PASS** を実測。`pnpm typecheck` クリーン通過。

## AC 再確認（3周目）

| AC | 判定 | 根拠 |
|----|------|------|
| AC-1 | 満たす | ADR-001 + フック JSDoc で機序記録。`useRovingMenu` と同機序。実機 before（TC-1/TC-E1）で `<body>` 落ち観測。 |
| AC-2 | 満たす | `SavedViewsList`：`autoFocus` 維持・`onChange` と handlers 別プロップで非干渉。 |
| AC-3 | 満たす | `admin/PromptsForm`：text/variables を別フックインスタンスで個別配線、型整合。 |
| AC-4 | 満たす | `identity/PromptsForm`：intent textarea のみ、`PreviewPanel.sample` 未配線。 |
| AC-5 | 満たす | 復元は `activeElement === body` 観測のみで発生源非依存。TC-6 raw invalidate 確認。 |
| AC-6 | 満たす | invalidate 経路（`UploadDialog`/`routerInvalidate`）に変更なし。TC-R1 非退行。 |
| AC-7 | 満たす | handlers に `onChange` 非含、各 `onChange`/`useState` seed 不変。value 保持。 |
| AC-8 | 満たす | `pnpm typecheck` クリーン、ユニット 9件 PASS を本周で実測。 |

## Frontend

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** 2周目 W-001 の指摘どおり、ADR-004 の論拠が「区別不能（本質的制約）」断定から「実害小を主根拠・`onBlur` 分離可否は未実測のため `relatedTarget` 実機裏取りまで判断保留」へ精緻化された。断定の言い過ぎが取り除かれ、誠実な記述になった。本フックの挙動は変えていないため受容リスクの結論（見送り）は維持され、トレーサビリティも保たれている。
- **[N-002]** ソース差分は前周から不変で、回帰の入り込む余地がない（今周の作業ツリー変更は `adr.md` と未コミットの test ファイルのみ。test は前周 Test 指摘修正の反映で、9件 PASS を実測）。
- **[N-003]** 3フォーム配線は `{...handlers}` と `onChange` が一貫して別プロップに分離され、型パラメータも各要素に整合。`identity` の `PreviewPanel.sample` 未配線でスコープ境界も遵守。新たな取りこぼし・誤配線なし。
