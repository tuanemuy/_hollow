# PR Review #003 — Test 観点 — Issue #819: ページ遷移の読み込みフィードバック

**Issue:** #819
**Date:** 2026-07-10
**Round:** 3回目（R2 指摘 B-001 / W-001 / W-002 の解消確認を含むゼロベースのフルレビュー）
**対象ブランチ:** `issue/819/route-loading-feedback`（作業ツリー上の未コミット差分をレビュー）

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 3

## レビュー対象テスト

- `app/components/layout/__tests__/RouteProgressBar.test.tsx`（新規）
- `app/components/note/editor/__tests__/NoteEditorLoader.test.tsx`（新規）
- `app/components/note/editor/__tests__/NoteEditorSection.test.tsx`（新規）
- `app/components/common/__tests__/skeletonAria.test.tsx`（NoteEditorSkeleton 追加分）

## テスト実行結果

```
Test Files  4 passed (4)
Tests       18 passed (18)
```

全 18 ケース green。実装（`RouteProgressBar.tsx` / `styles.ts` / `NoteEditorLoader.tsx` / `edit.tsx`）と突き合わせてアサーションの妥当性を確認済み。

---

### Test

#### Blockers

なし

#### Warnings

なし

##### R2 指摘の解消状況（重点確認）

- **[B-001 → 解消]** AC-6 reduced-motion 契約テストが追加された。`RouteProgressBar.test.tsx:94-105`「pins the reduced-motion class contract (AC-6)」が、外側バーの `className` に `motion-reduce:transition-none`（reduced-motion でフェード無効）と `data-[loading]:transition-none`（即時表示）を含むこと、内側 fill に `motion-safe:animate-pulse`（reduced-motion で静的）を含むことを string-contains で固定。`styles.ts:190-200` の実クラス（`ROUTE_PROGRESS_BAR` / `ROUTE_PROGRESS_BAR_FILL`）と一致し、`ProgressBar.test.tsx` / `Skeleton.test.tsx` の確立パターンに揃っている。誰かが `motion-safe:` / `motion-reduce:transition-none` を落とせば落ちる。R2 指摘の中核（AC-6 の沈黙破壊）は塞がれた。

- **[W-001 → 解消]** loader の seed 導出が振る舞いで検証された。`NoteEditorLoader.test.tsx:82-146` に2ケース追加:
  - 「derives initialTagNames / initialEditLock / directory / suggestions」— `tagIds:["t1","unknown","t2"]` で **未知 id 脱落**と順序保持（`["typescript","react"]`）、`editLock:{expiresAt}` → `{state:"acquired", lockId:null, expiresAt: new Date(iso).getTime()}` への epoch-ms 変換、`initialDirectoryId`、`tagSuggestions`（`tags.tags.map(t=>t.name)`）を `NoteEditor` スパイに渡る props で直接アサート。`NoteEditorLoader.tsx:56-67` の導出ロジックと完全一致。
  - 「omits initialEditLock when the note has no lock」— `editLock:null` 時に props へ `initialEditLock` キー自体が現れない（`"initialEditLock" in props === false`）ことを検証。実装の条件付きスプレッド `{...(initialEditLock !== undefined ? {initialEditLock} : {})}` の契約（キー不在 vs undefined）を正しく突いており、`getTime()` 取り違え・タグ取りこぼし・lock 分岐の回帰が緑を突破できなくなった。R2 が求めた両分岐（acquired lock 構築／名前解決フィルタ）を過不足なく網羅。

- **[W-002 → 解消（manual-test 固定を妥当と判定）]** 編集ルート streaming 不変条件が `.issue/819/testing.md`「確認項目1・確認ポイント」に **R2 test W-002 の受け入れ条件**として明示固定された。内容は「スケルトンが実エディタより先に出ること自体が、`renderNoteEditor` が3クエリを await せず `NoteEditorSection` を即返している証拠」「スケルトンが出ず無反応→いきなりエディタに戻れば AC-2 劣化と判断」「ルート＋`createServerFn`＋`renderServerComponent` を巻き込むためユニット化が重く、`NoteEditorSection` 単体テストは loader を無限 suspend させるためルートが await しても緑のまま検知できない」旨まで記述。`edit.tsx:32-34` の実装（await せず `renderServerComponent(<NoteEditorSection/>)` を返す／redirect ガードは Suspense 外の L22）と照合し、記述された不変条件が事実であることを確認した。R2 が提示した3択（ユニット化／manual-test 固定／Note 降格）のうち「manual-test 固定」を選択しており、この不変条件が真に createServerFn / renderServerComponent 境界をまたいでユニット化困難である以上、判断は妥当。自動網から外れる旨も testing.md 内に明記され記録として残っている。

#### Notes

- **[N-001]** `RouteProgressBar.test.tsx` の fill アサーションは `toContain("motion-safe:animate-pulse")` のみで、実クラスの `group-data-[loading]:` ゲート（`opacity-0` の idle バーで pulse を空回しさせない最適化。`styles.ts:199` のコメント参照）は検証していない。ゲートが外れて `motion-safe:animate-pulse` 単体になっても緑のまま。ただしこれは AC-6（reduced-motion）ではなくパフォーマンス最適化の話であり、AC 観点の欠落ではない。厳密化するなら `toContain("group-data-[loading]:motion-safe:animate-pulse")` に締めるとゲート回帰も拾える。

- **[N-002]** `NoteEditorSkeleton` は `skeletonAria.test.tsx`（単一 `role="status"`＋`aria-busy`＋`aria-live`＋pulse は `aria-hidden` 配下）と `NoteEditorSection.test.tsx`（Suspense fallback がスケルトンであること）で a11y 契約・fallback 契約は担保されるが、P12 mock を近似した構造（モードタブ／タイトルバー／ディレクトリピル／タグ行／本文ブロック／FrontMatter 行）は構造アサートされていない。スケルトンの構造テストは一般に脆く価値が低いため許容範囲だが、視覚的近似の劣化は自動網の外である点は記録に値する（manual-test 確認項目1でカバー）。

- **[N-003]** `NoteEditorLoader.test.tsx` の「renders the editor when the note resolves」（L62-80）は「derives...」ケース（L82-123）と正常系がほぼ重複するが、後者が全 props を厳密検証する一方で前者は `html` に `"note-editor"` が含まれる最小確認に留まる。害はなく happy-path の存在確認として残しても良いが、統合しても失うカバレッジはない。

---

## 総評

R2 の Blocker 1・Warning 2 はいずれも的確に解消された。B-001（AC-6 契約テスト）と W-001（loader seed 導出）はコードで固定され、実装と一致することを確認。W-002 は manual-test 受け入れ条件として明示固定され、その選択も不変条件のユニット化困難性に照らして妥当。残る指摘は AC に無関係な test-precision の微小ギャップ 3 件（すべて Note）のみ。

**Verdict: APPROVED**
