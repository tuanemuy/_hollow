# PR Review #001 — feat(note): P11 detail link to referencing-note filter + chip title resolver (#32)

**PR:** #62
**Date:** 2026-05-19
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 18
- Verdict: **BLOCKED**（Warning 全件をその場で修正する方針）

---

## Frontend / UI

### Blockers
なし

### Warnings

- **[W-F1]** `.meta-panel-referencing` クラスが CSS に未定義
  - 場所: `app/components/note/detail/NoteMetaPanel.tsx:113` / `app/styles/app.css`
  - 理由: JSX で `<div className="meta-panel-referencing">` を付与しているが、`app/styles/app.css` の `.meta-panel-*` 系セレクタに該当ルールがない。兄弟の `.meta-panel-backlinks` は `flex-basis: 100%` で `<dd>`（`display: flex; flex-wrap: wrap`）の中で意図的に改行している（app.css:624-628）。本クラスには同等のルールがないため、ナローモバイル等で「2 件」chip と同じ行に押し込まれる挙動がブラウザ依存になるリスク。手動テストは特定ビューポート観察結果なのでカバーし切れない。
  - 提案: `app/styles/app.css` に `.meta-panel-referencing { flex-basis: 100%; margin-top: var(--space-1); }` + `.meta-panel-referencing a { color: var(--color-accent); font-size: 12px; }` を追加して `.meta-panel-backlinks` 流の改行を担保

- **[W-F2]** `<Link to="/" search>` で `page` / `limit` を渡さず codebase 慣習と不一致
  - 場所: `app/components/note/detail/NoteMetaPanel.tsx:114-117`
  - 理由: `app/components/auth/links.ts:16` で `HOME_SEARCH = { page, limit }` を中央化済み。`LandingPage` / `AuthHeader` / `SignUpForm` / `PublicLayout` / `NoteActions.tsx:85` の `/trash` リンクなど 20 箇所超で `search={HOME_SEARCH}` を明示。本 PR の Link だけ慣習を外れ、受信側で defaults が再付与される 1 ホップ余計な挙動になる
  - 提案: `search={{ ...HOME_SEARCH, referencingNoteId: noteIdStr }}` に揃える

- **[W-F3]** `as unknown as string` キャストがコンポーネント内 inline で散発
  - 場所: `app/components/note/detail/NoteMetaPanel.tsx:116, 124, 127`
  - 理由: `NoteActions.tsx:43` の慣習は冒頭で `const noteIdStr = noteId as unknown as string;` と局所変数化、以降は文字列扱い。本ファイルは backlinks 側に 2 箇所、referencing 側に 1 箇所のキャスト散発があり読みづらい
  - 提案: 関数本体冒頭で `const noteIdStr = noteId as unknown as string;` を抽出（backlink リスト要素ごとの id は別変数のまま）

### Notes
- **[N-F1]** ADR-005 の spread 構文パターンが `HomePage.tsx:48-50` / `NoteList.tsx:87-89` の両中継点で一貫
- **[N-F2]** `formatReferencingNoteChipLabel(id, title)` の引数順 / null 検査 / テスト 3 ケースが plan 通り
- **[N-F3]** `loadReferencingNoteTitle` の catch 範囲が plan P-C どおり
- **[N-F4]** リンク文言「このノートを参照しているノート一覧を見る」が ADR-004 で pin、spec/pages/index.md P11 と整合
- **[N-F5]** chip 解除ボタンの aria-label「内部リンク参照フィルタを解除」は安定
- **[N-F6]** chip タイトル → 可変長日本語の視覚切替は `.chip.chip-active` で吸収

---

## Server-side & Security

### Blockers
なし

### Warnings

- **[W-S1]** docs（plan.md / testing.md / TC-06 / seed-data.md）の挙動説明が実装と食い違い
  - 場所: `.issue/32/plan.md` リスクと注意点 / `.issue/32/testing.md` 確認項目 6 / `.issue/32/manual-test/results/TC-06.md` / `.issue/32/manual-test/seed-data.md`
  - 理由: `app/core/domain/note/valueObject.ts:31-39` の `NoteId.create` は `trim().length === 0` のみで弾く実装で、UUID 形式は検証していない。したがって `referencingNoteId=not-a-uuid-string` は `DomainNoteId.create` を通過し、`noteRepository.findById('not-a-uuid-string')` が D1 で 0 件 → `null` フォールバック、というのが実機の経路。テスト結果としては PASS で結論は変わらないが、原因記述が誤り
  - 提案: ドキュメント 4 箇所を「TC-06 は `findById` が 0 件で `null` 返却 → `{ title: null }` フォールバック」に修正。実装の修正は不要（挙動として正しい）

### Notes
- **[N-S1]** owner check の二重実装は ADR-002 で意識的に選択、3 箇所目で usecase 抽出検討
- **[N-S2]** branded type を `as unknown as string` で剥がした比較は安全
- **[N-S3]** `Promise.resolve({})` の loader モジュール引数は既存パターンに合致
- **[N-S4]** `cache()` キー粒度は `loadPublishStateForNote` と同一
- **[N-S5]** エラー伝播設計が plan P-C どおりで listing と resolver で一貫
- **[N-S6]** listing 側 / resolver 側で `referencingNoteId` 解釈は対称（不正 ID では一覧 0 件 + chip UUID 断片）
- **[N-S7]** SavedView 復元経路で resolver が起動する経路は維持

---

## Test

### Blockers
なし

### Warnings
なし

### Notes
- **[N-T1]** 純関数 3 ケース網羅で十分（境界拡張は JS 仕様検証になるので不要）
- **[N-T2]** `describe` / `it` 名は既存スタイル（英語小文字始まり平叙文）と一貫
- **[N-T3]** assertion 値は helper 戻り値と完全一致
- **[N-T4]** `loadReferencingNoteTitle` の専用 integration なし判断は ADR-002 + manual-test TC-05/06/07 で合理的にカバー
- **[N-T5]** manual-test 8 ケースは機能リスクを漏れなくカバー、特に TC-04 / TC-05 が高品質

---

## Design Decisions

特になし。Warning は実装パターンの不一致 / docs 精度の問題で、ADR を要する設計判断ではない。
