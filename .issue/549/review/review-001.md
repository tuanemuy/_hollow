# PR Review #001 — feat(#549): P11 ノート詳細のモック追従 backend 拡張

**PR:** #555
**Date:** 2026-06-07
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2（実質。Domain W-001 はレビュー時点で既に解消済み）
- Notes: 多数（高価値の軽微改善を本ラウンドで取り込む）
- Verdict: **BLOCKED**（Warning 修正のため）

レビューレイヤー: Domain/UseCase・Adapter/Security・Frontend・Test の 4 視点を並列実施。

---

## Domain / Use Case

#### Blockers
なし

#### Warnings
- **[W-001]** untracked の POC テスト `app/core/adapters/renderer/__tests__/__poc.test.ts` が typecheck を赤にする
  - **→ レビュー時点で既に存在せず、`pnpm typecheck` 緑。対応不要（実装中の一時状態）。**

#### Notes
- port のドメイン配置・純粋性、入力をドメイン VO にした判断、`computeSegmentsForMany` の正しさ（findTree 1回・サイクル/欠落親/空入力の安全な縮約・O(1) クエリ）、`renderedContentHtml` の verbatim 非破壊供給、pattern export の matchAll 状態回避、N+1 解消をすべて確認。DTO 波及の消費側更新も漏れなし。

## Adapter / Security

#### Blockers
なし（XSS PoC を複数試行したが多層防御で確実に遮断。href=検証済み UUID、display/tag=テキストコンテンツ、text-node 限定 + pre/code/a サプレス、sanitize 済み入力前提）

#### Warnings
なし

#### Notes
- **[N-001]** `UUID_V7_PATTERN` が renderer にローカル再定義（`noteBodyRenderer.ts:18`）。`note/service.ts:67`（非 export）と同一リテラル。ADR-005 の単一ソース方針に照らし domain から export して再利用するのが一貫性として望ましい。 → **本ラウンドで対応**
- **[N-002]** port JSDoc に「入力は sanitize 済み body」のトラスト前提を一行加えると将来の誤用（公開詳細など別ポリシー HTML を通す改修）の安全網になる。 → **本ラウンドで対応**

## Frontend

#### Blockers
なし

#### Warnings
- **[W-001]** 未解決 wikilink に視覚的区別がない（`index.css` の `.wikilink`、`noteBodyRenderer.ts` の `<span data-unresolved>`）。解決済み `<a>` と未解決 `<span>` が同一描画でリンクに見えて遷移しない。ADR でも「broken 表示」と明記しているのに CSS が broken を表現していない。`data-unresolved` 属性は出力済みなので `.wikilink[data-unresolved]` に quiet な broken アフォーダンス（muted 色 + cursor:default + ドット muted）を足す。 → **本ラウンドで対応**

#### Notes
- **[N-001]** モック CSS 完全一致、トークン使用、既存 `.note-detail-content a` 衝突を詳細度で正しく打ち消し（mock の `!important` 不要な形で再現）。
- **[N-002]** backlink-meta 行は utility-first 準拠でモック値一致、空 segments 非表示。
- **[N-003]** `[[uuid]]`（display 無し id-kind）のラベルが生 UUID になる（`noteBodyRenderer.ts` の label）。`ref.displayText` を二次フォールバックにすればより堅牢。 → **本ラウンドで対応**
- **[N-005]** 他の `.note-detail-content` 共有画面は素テキスト描画で新 CSS は inert、退行なし（スコープ一致）。
- **[N-006]** hashtag 非リンク `<span>` は導線未提供のため妥当。

## Test

#### Blockers
なし（unit 53 + integration 20 緑を実機確認）

#### Warnings
- **[W-001]** 解決済み wikilink（`[[id]]` → `<a href="/notes/...">`）の end-to-end が統合テスト未検証。`renderedContentHtml` の唯一の統合ケースが未解決 span 分岐のみを通る。`entity.internalLinkRefs` に resolvedNoteId が載って renderer に届く結線が DI 経由で無保証。`seedInternalLink`（fromNoteId=自ノート, resolvedNoteId=他ノート）で解決 href が出る 1 ケースを追加。 → **本ラウンドで対応**

#### Notes
- **[N-001]** `collectReplacements` の overlap 排除（`#tag` が `[[...]]` 内）に専用テストなし。 → **本ラウンドで対応**
- **[N-002]** NoteMetaPanel 単体テストで backlink-meta 行 DOM が無検証（全 backlink の segments が `[]` 固定）。 → **本ラウンドで対応**
- **[N-003]** XSS テストのコメントが終端挙動を主張するが plain `#tag` のみで実証していない。終端入力に差し替えるかコメント修正。 → **本ラウンドで対応**
- **[N-004]** 既存 verbatim/passthrough/export テストは未変更で回帰なし。

---

## Design Decisions

このラウンドで新規の設計判断なし（既存 ADR-001〜006 の範囲内）。

## 本ラウンドの対応方針

すべて同一機能・同一ファイル群に閉じる軽微修正のため、後回しせず本 PR で全件対応する:
1. [Frontend W-001] 未解決 wikilink の broken アフォーダンス CSS
2. [Test W-001] 解決済み wikilink E2E 統合テスト追加
3. [Adapter N-001] UUID_V7_PATTERN 単一ソース化（domain export）
4. [Adapter N-002] port JSDoc にトラスト前提を追記
5. [Frontend N-003] label の ref.displayText 二次フォールバック
6. [Test N-001/N-002/N-003] overlap テスト・backlink-meta DOM テスト・XSS コメント修正
