# レビュー (2回目): PR #785 / Issue #779 — Test 観点

対象差分: `gh pr diff 785`
基準: `.issue/779/plan.md`「テスト方針」/ AC-1〜AC-5
前回: `.issue/779/review/review-001-test.md`（N-001/N-002/N-004 の対応確認を含む）

## サマリ

ゼロベースで再精査した。AC-1〜AC-5 はいずれも実在テストでカバーされ、主要アサーションは実装と突き合わせても実質的（偽陽性で素通りしない）。レイヤー分担も妥当（VO 境界=ユニット、マーカー生成=アダプター統合、フラグ伝播=ユースケース、要素化/XSS=フロント）。前回 Notes（N-001/N-002/N-004）はいずれも妥当に修正済み。Blocker・Warning なし。網羅性の観点で軽微な Note を 3 件。

### 前回 Notes の対応確認

- **N-001（snippet 正アサーション欠如）→ 解消**。`searchIndex.integration.test.ts` AC-5（L817 `snippet).toContain("デザイン原則")`）/ AC-4（L848・L862 `snippet).toContain("planning notes")`）が追加され、空抜粋回帰を捕捉する正アサーションが入った。
- **N-002（LIKE "regardless of highlight" を片値しか検証していない）→ 解消**。AC-4 テストに `highlight: false` 明示ケース（L854-862）が追加され、既定 true（L837-848）と両値でプレーンを確認。テスト名と実態が一致。
- **N-004（`SearchHighlightedTitle.create("")` 空文字受理テスト欠如）→ 解消**。`valueObject.test.ts` L117-119 に空文字受理ケースが追加され、兄弟 VO `SearchTitle`（L97-99）と下限境界のパリティが揃った。

### AC カバレッジ

| AC | カバーするテスト | 判定 |
|---|---|---|
| AC-1 タイトル `<mark>` 描画 | 統合 `marks the matched run in the title and snippet...`（L744、title を `toContain("<mark>デザイン</mark>")` 厳密一致）＋ フロント `element-ises the title's <mark> markers`（`<mark`/`</mark>` 要素化） | OK |
| AC-2 XSS 安全 | フロント `...escapes the user text`（L108、`<script>` エスケープ・生 script 不在・`<mark` 要素化・平文セグメント残存を同時検証）＋ 共有 `highlightSnippet.test.tsx` | OK |
| AC-3 本文のみ一致=タイトルプレーン | 統合 `leaves the title unmarked when only the body matches`（L767、title を `toBe("週次メモ")` ＋ `<mark>` 不在、snippet 側は `<mark>` 保持） | OK |
| AC-4 LIKE フォールバック=プレーン | 統合 `returns plain strings on the LIKE fallback regardless of highlight`（L820、両 highlight 値で title/snippet プレーン＋snippet 正値 `planning notes`） | OK |
| AC-5 他サーフェス漏れなし | 統合 `returns plain title and snippet when highlight is false`（L792）＋ ユースケース `sets SearchQuery.highlight to false`（伝播） | OK |
| VO 境界 ≤1024/＞1024/空 | `valueObject.test.ts` SearchHighlightedTitle（"hit"・1000字マーカー付き・1024 受理／空文字受理／1025 拒否＝`HighlightedTitleTooLong`） | OK |
| 公開系 既定 true | `searchPublicNotes.test.ts` `leaves SearchQuery.highlight at the default true`（L137） | OK |
| errorCode 命名 | `domain/__tests__/errorCodeNaming.test.ts` が `SearchErrorCode` 全エントリを自動走査 | OK |

実装側との突き合わせ:
- `searchIndex.ts` L225-228: `titleSelect` が `highlight=true` で `highlight(fts.search_documents_fts, 0, '<mark>','</mark>')`、false で `sd.title`。`runLikeQuery` はフラグ非受領（プレーン）。→ AC-3/AC-4/AC-5 のアサーションは実挙動を捉える。
- `valueObject.ts` L443: `highlight: params.highlight ?? true`。→ ユースケース両値テストの前提が成立。
- `PublicSearch.tsx` L209: `{highlightSnippet(hit.title)}`。`highlightSnippet` はマーカー無しなら原文返却（back-compat）。→ AC-2/AC-3 のフロント前提が成立。

## Blockers

なし。

## Warnings

なし。

## Notes

- **[N-001] フロントの title 要素化アサーションは「snippet にマーカーが無いこと」に依存した間接判定（前回 N-003 の再掲、未対応）。**
  - 場所: `PublicSearch.test.tsx` `element-ises the title's <mark> markers...`（L142 `expect(html).toContain("<mark")`）。
  - 理由: 出力中の `<mark` が title 由来だと一意に言えるのは、フィクスチャ snippet `"本文の抜粋"` にマーカーが無いため。実質は正しく機能（title を素描画に退行させると `&lt;mark&gt;` になり L142/L146 が落ちる）が、`<mark` の出所が title であることは構造前提に依存。
  - 提案: title ノードにスコープして `<mark>` 存在を断定するか、平文セグメント（L148-149 で検証済みの `安全な`/`タイトル`）と `<mark` の隣接を主張するとさらに堅い。現状でも AC は満たすため任意。

- **[N-002] `searchUserPublicNotes` の highlight フラグ伝播テストが無い（前回 N-005 の再掲、未対応）。**
  - 場所: `searchUserPublicNotes.test.ts`（`hits: readonly never[]` で SearchHit を組まず、`highlight` を検証しない）。`searchUserPublicNotes.ts` も `highlight` 未指定で既定 true。
  - 理由: plan は「描画コンシューマ不在ゆえ既定 true で inert」と判断済みで本 PR のスコープ判断としては妥当。ただし他 2 サーフェス（own=false / public=true）がフラグ値を明示検証している中で当該サーフェスだけ未検証。将来 UI が付いた際の回帰検出ポイントが無い。
  - 提案: `expect(observed?.highlight).toBe(true)` を 1 行足すと 3 サーフェスのフラグ意図が出揃う。任意。

- **[N-003] DTO テストがマーカー入りタイトルの透過を検証していない。**
  - 場所: `dto/__tests__/search.test.ts`（フィクスチャ title が `SearchHighlightedTitle.create("hit")` のプレーン値のみ）。
  - 理由: `toSearchHitDTO` の `title: hit.title as string` キャストが `<mark>` を含む描画用文字列をそのまま素通しする契約（plan ステップ4）だが、DTO 層では平文のみで確認している。end-to-end（統合の `highlight()` 生成＋フロントの要素化）でマーカー透過は担保されるため実害は無い。
  - 提案: `SearchHighlightedTitle.create("安全な<mark>X</mark>")` のヒットで `dto.title` がマーカー文字列を保持することを 1 ケース足すと、DTO 契約が単体で固定される。任意。

## 良い点

- 統合 AC-1/AC-3/AC-5 が title を厳密一致（`toContain("<mark>デザイン</mark>")` / `toBe("週次メモ")` / `toBe("デザイン原則")`）で判定し、マーカー有無を取り違える偽陽性が無い。
- 前回指摘の snippet 正アサーション（AC-4/AC-5）と LIKE 両値検証（AC-4）が過不足なく入り、空抜粋回帰・名実不一致の双方を塞いだ。
- VO 境界テストが 1024 ちょうど受理・マーカー付き受理・空文字受理・1025 拒否（コード `HighlightedTitleTooLong` 断定）の 4 点で網羅。
- フロント XSS テストが「`<mark` 要素化」「生 `<script>` 不在」「エスケープ済み文字列存在」「平文セグメント残存」を 1 ケースで同時主張し、素描画退行・HTML 注入の双方を弾く。
- フラグ既定値の後方互換（公開系 `highlight:true` 既定）と自ノート opt-out（`highlight:false`）が両ユースケーステストで明示検証。
- フィクスチャ移行（`SearchTitle.create` → `SearchHighlightedTitle.create`）が dto/service/searchOwnNotes/searchPublicNotes の 4 箇所すべてで完了し、import も置換済み。typecheck 破壊の取りこぼし無し。
- 不正マーカー（未終端）・連続マーカー・back-compat は共有 `highlightSnippet.test.tsx` で既出カバー済みで、title 再利用は同一関数のため不正マーカー耐性を継承。
