# Plan Review (Round 1) — Issue #789

**視点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/789/plan.md` / `.issue/789/adr.md`
**レビュー日:** 2026-06-28

## サマリ

- 問題点: 1 / 改善提案: 3
- Issue 受け入れ条件 11 項目はすべて AC-1〜AC-11 に 1:1 で対応付けられており、カバレッジの抜けは無い。
- スコープ規律は良好。「含まれないもの」が明確で、スコープ外作業の混入も無い。
- 計画中の事実主張（`loadAllTags` の構造、未配線のルート、`TagName` のエラーコード、既存テストの DOM 前提、`DirectoryTreeSelect` の a11y パターン、`--shadow-focus` トークン存在）はコードと突き合わせてすべて正確であることを確認した。

---

## 受け入れ条件カバレッジ照合（11 項目）

Issue 本文「受け入れ条件」とコードの実態を突き合わせた結果。

| Issue 受け入れ条件 | 対応 AC | カバー | 検証可能性 | 備考 |
|---|---|---|---|---|
| 1 コンテナ枠＋focus 可視化 | AC-1 | ○ | 中（focus-within の境界変化は目視/属性で確認可） | `styles.ts:85 tagsRow` 刷新で対応。`--shadow-focus`/`border-hairline`/`bg-bg` は実在を確認 |
| 2 空状態ガイド＋× アフォーダンス | AC-2 | ○ | 低（「整理されている」が主観的） | S-003 参照 |
| 3 `loadAllTags` 候補ドロップダウン | AC-3 | ○ | 高 | ルート両方で `loadAllTags` は warm 済みだが NoteEditor 未配線なのを正しく特定（new.tsx:29 / edit.tsx の `tags`） |
| 4 ↑↓＋Enter キーボードナビ | AC-4 | ○ | 高 | `directoryTreeModel` の `nextActiveIndex` 再利用は妥当 |
| 5 既存一致／新規作成の区別表示 | AC-5 | ○ | 高 | `classifyDraft` で分岐 |
| 6 バリデーション即時フィードバック | AC-6 | ○ | 高 | `TagName.create` の 3 コード（`tag_name_empty`/`_too_long`/`_invalid_chars`）を確認。S-002 参照 |
| 7 combobox/listbox ARIA＋roving | AC-7 | ○ | 高 | `DirectoryTreeSelect` の activedescendant 方式に準拠（ADR-003） |
| 8 IME 確定キー無視 | AC-8 | ○ | 高 | 矢印キーも `isComposing` ガードする点を正しく明示（既存 DirectoryTreeSelect は Enter のみ） |
| 9 Enter/カンマ/Backspace/blur＋autosave 既存挙動保持 | AC-9 | ○ | 中 | S-001 参照 |
| 10 Tailwind＋tokens、新規 CSS/@apply 増やさない | AC-10 | ○ | 高 | data-* 規約言及あり |
| 11 typecheck/lint/format 通過 | AC-11 | ○ | 高 | P-001 参照（対応ステップ番号の不整合） |

→ **11 項目すべて基準に落ちている。漏れた要件は無い。**

---

#### 問題点（要修正）

- **[P-001]** AC 表の「対応ステップ」列が存在しないステップ番号 7 を参照している。
  - 理由: 設計セクション「UI / プレゼンテーション」のステップ番号は 1〜6 までしか定義されていない（1 ヘルパ / 2 styles / 3 TagsInput / 4 NoteEditor 配線 / 5 ルート配線 / 6 テスト）。しかし AC-11 の対応ステップは「6, 7」となっており、ステップ 7 が未定義。基準と実装ステップの紐づけ（本レビューの主眼の一つ）が一箇所で破綻している。
  - 提案: AC-11 が暗に指している「最終ゲート（`pnpm typecheck && pnpm lint:fix && pnpm format` の実行）」を独立したステップ 7 として設計セクションに明記するか、AC-11 の対応ステップを「6」のみに修正する。後者ならテスト方針セクションの最終ゲート記述との対応を一言添えると追跡が明確になる。

#### 改善提案（検討推奨）

- **[S-001]** AC-9 のうち「autosave がタグを送らない既存挙動の保持」の対応ステップが 3, 6 になっているが、この保証は本質的には「`useAutosave`/`saveDraft` を変更しない」というスコープ除外（含まれないもの）に由来する。
  - 理由: ステップ 3（TagsInput）/ 6（テスト）は keyboard 挙動の保持・検証であり、autosave 非送信の担保はコード変更ではなく「触らないこと」で成立する。対応ステップ欄にスコープ除外項目への参照（例: 「スコープ: autosave 仕様の変更なし」）を併記すると、なぜ送信されないのかの追跡が明確になる。テスト方針に「autosave がタグ未送信をネットワークで確認」がある点は良い。

- **[S-002]** `validateTagDraft` は空 draft に対して `tag_name_empty`（`NameEmpty`）を返すが、空欄時に inline エラーを表示しないことを明示していない。
  - 理由: AC-6 が要求するのは「50 文字超・不正文字など」の即時フィードバックであり、単に空欄なフィールドに「タグ名を入力してください」を出すのは過剰で UX を損なう。計画は「空 draft は Enter で no-op」とは書くが、inline エラー表示（ステップ 3 / step 92 line 107）が空 draft でメッセージを出すか抑止するかが曖昧。空/空白のみの draft ではエラー非表示とする旨を一行加えると実装意図が確定する。

- **[S-003]** AC-2 の検証基準「× 削除アフォーダンスが視認できる形に整理されている」が主観的で、達成判定が難しい。
  - 理由: Issue 本文の文言由来ではあるが、計画段階で検証可能な具体基準（例: × ボタンにホバー/フォーカス時のコントラスト変化があり、最小ヒット領域を確保する）に落とすと、レビュー時の合否判定が客観化できる。現 `tagChipRemove`（styles.ts:98）は hover/focus-visible のコントラスト変化を既に持つので、それを基準として明文化するだけでよい。

#### 良い点

- **11 受け入れ条件の 1:1 トレーサビリティ。** AC 表が各基準に「由来（Issue 受け入れ条件 N）」と「対応ステップ」を明示しており、カバレッジ漏れ・取りこぼしが構造的に起きにくい。
- **スコープ規律が明確。** 「含まれないもの」（サーバ往復/即時永続化・autosave 仕様変更・reducer 拡張・ドメイン正規化変更・新規ユースケース/loader）が列挙され、スコープ外作業の混入が無い。フロントエンドのみの変更という境界も明示。
- **既存基盤の再利用が的確。** `DirectoryTreeSelect`（inline combobox の手本）、`directoryTreeModel` の `nextActiveIndex`/`clampActiveIndex`、`loadAllTags`、`TagName.create`（バリデーション SSOT）を新規実装せず流用する判断が、コードの実態（確認済み）と一致している。
- **未配線の正確な特定。** 両ルートが `loadAllTags` を呼びつつ NoteEditor へ結果を渡していない事実（new.tsx は「将来の autocomplete 用にキャッシュを温める」とコメント）を正しく捉え、配線追加をステップ 5 に落としている。
- **IME×矢印キーの競合リスクを先回り。** 既存 `DirectoryTreeSelect` が Enter のみ `isComposing` ガードする一方、本 Issue では矢印キーもガードが必要という差分を明示（AC-8 / リスク欄 / ADR-003）。
- **後方互換とテスト構造変更の明示。** `tagSuggestions` を任意プロップ（省略時 `[]`）にする方針、既存テストが `li` 数・`aria-label="新規タグ"` に依存する点を踏まえた更新方針をリスク欄に記載。実態として TagsInput は NoteEditor からのみ利用され、IngestionPreviewForm は独自 textarea を使う（NoteEditor/TagsInput 非依存）ため後方互換リスクは低いことも確認した。
