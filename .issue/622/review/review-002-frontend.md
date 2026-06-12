# PR #661 レビュー（Issue #622）— Frontend（2回目・ゼロベース）

レビュー対象: `gh pr diff 661`（app 変更は `PublicNoteDetail.tsx` / `public/styles.ts` / `PublicNoteDetail.test.tsx` の 3 ファイル）
照合資料: `.issue/622/plan.md`（AC-1〜AC-8）、`.issue/622/adr.md`、`spec/design/pages/P31-public-note.html`、`app/styles/tokens.css` / `index.css`、`.issue/622/review/review-001*.md`

## 検証メモ（事実確認）

- **AC-1**: `NOTE_BOTTOM_META` = `mt-16 pt-6 border-t border-hairline flex items-center justify-between gap-4 flex-wrap text-sm text-ink-tertiary`。モック `.bottom-meta`（margin-top 64px / padding-top 24px / align-items center / space-between / gap 16px / flex-wrap）と全項目一致。タグ 0 件時は日付 div の `ml-auto`（`PublicNoteDetail.tsx:177`）で右寄せを確定。タグ有り時は `justify-between` により margin が 0 に解決され無害。
- **AC-2**: `AUTHOR_MINI` に `transition-colors motion-reduce:transition-none hover:bg-surface-hover`。`--color-surface-hover` は `index.css:16` でブリッジ済み。公開面の確立パターン（`CHIP` / `BACKLINK_ITEM` / `RELATED_CARD`）と一貫。モックの `transition: var(--transition-bg)` との差（`transition-colors`）は plan ステップ2で意図明文化済み、hover で変わるのは背景のみなので実挙動同一。
- **AC-3/AC-4**: メタ行タグは `<Link to="/u/$username" params={{ username }} search={{ tags: [t] }}>`（141-149行）。P30 の `validateSearch`（`routes/u/$username/index.tsx:37` の `tags: z.array(z.string().min(1).max(64)).max(8)`）に型安全に乗ることを確認。末尾メタは `<span className="text-accent">` 維持（171行）— モック実体（メタ行 `<a class="tag">` / 末尾 `<span class="tag">`）に正確に一致。ADR-001 の決定どおり。
- **AC-5**: `SECTION_TITLE` が `tracking-wider`（0.05em）→ `tracking-[0.06em]`。`index.css` の `--tracking-*` ブリッジに 0.06em 相当が無いことを確認、任意値の使用は規約どおり。
- **AC-6**: `BACKLINK_TEXT` / `RELATED_TITLE` が `text-[14px]`。モックはリテラル 14px、`--text-sm` は clamp 上限 13px のため任意値が正解。
- **AC-7**: `PUB_PILL` が `text-[11px]` → `text-xs`。モックは `var(--text-xs)`、`index.css:45` でブリッジ済み。任意値→トークンユーティリティへの「戻し」で規約上もっとも好ましい形。
- **AC-8**: `pnpm vitest run app/components/public/__tests__/PublicNoteDetail.test.tsx` をローカル実行し 3 件すべて緑（2026-06-13 実行）。
- **前ラウンド指摘の解消確認**: W-001/F（マークアップ全文一致の脆いアサーション）は `extractAnchors`（属性を Map 化、属性順・class 文字列・エスケープ非依存）＋ `data-search` の `JSON.parse` → `toStrictEqual` への分解で解消。W-001/T（タグ 1 件では per-tag search の回帰を検出できない）はフィクスチャを `["cloudflare", "workers"]` の 2 件に拡張し全タグをループ検証。W-002/T（非リンク証明の不完全さ）は `stripAnchors` 後に `#tag` が `<span>` 内に残存することを検証する形で解消。W-002/F（hover アフォーダンス）は「モック準拠のため見送り」で確定済み — 再指摘しない。
- **規約確認**: 新規 CSS ファイルなし、`@apply` なし、条件分岐クラス文字列なし（状態スタイル不要のケース）、変更ユーティリティはすべて `styles.ts` 定数または inline literal で JIT スキャン可能。変更 6 定数の参照元は `PublicNoteDetail.tsx` のみで他ページへの波及なし。
- **a11y**: タグリンクのアクセシブルネームは `#cloudflare` 等のテキストで十分。フォーカスはグローバル `:focus-visible` リングで識別可能。`aria-hidden` の付与（ドット・アバター・svg）は既存どおり適切。

## Blockers

なし

## Warnings

なし

## Notes

- **[N-001]** AC-1〜AC-8 全充足、かつ前ラウンドの修正対象 Warning（W-001/F, W-001/T, W-002/T, W-003/T）がすべて意図どおり解消されていることを確認。app 側の差分は計画ステップと 1:1 で、計画外の変更が混ざっていない。
- **[N-002]** テストの `tagNames` がモジュールスコープの可変変数で、各テスト冒頭の代入に依存している（`backlinks` / `relatedNotes` も同パターン）。現状は 3 テストすべてが明示的に設定しており問題ないが、テスト追加時の設定漏れは前のテストの値を引き継いで偽陽性になり得る。`beforeEach` で `tagNames = []; backlinks = []; relatedNotes = [];` とリセットしておくと安全（既存パターン踏襲のため必須ではない）。
  / 場所: `app/components/public/__tests__/PublicNoteDetail.test.tsx:34-37`
- **[N-003]** `extractAnchors` / `stripAnchors` の正規表現ベース HTML 解析は、`renderToStaticMarkup` の出力（ネスト `<a>` なし・属性は二重引用符）という前提では十分堅牢で、コメントで「node 環境に DOM が無いため」という理由も明記されている。jsdom 環境化より軽量で妥当な選択。
- **[N-004]** `ml-auto` による `flex-wrap` 折返し時の日付右寄せはモック（左寄せ）と微差だが、plan ステップ1で「意図した挙動として許容」と明文化済み。manual-test TC-006（390px 幅）でも破綻なしを実測済み。
- **[N-005]** ブラウザ検証（`.issue/622/manual-test/`）が AC 全件＋エッジ（タグ無しノート・390px・ID ベース URL `/notes/public/$noteId`・P30 タグフィルタ着地）を computed style の実測値付きでカバーしており、検証証跡として十分。
