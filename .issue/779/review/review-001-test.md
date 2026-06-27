# レビュー: PR #785 / Issue #779 — Test 観点

対象差分: `gh pr diff 785`
基準: `.issue/779/plan.md`「テスト方針」/ AC-1〜AC-5

## サマリ

AC-1〜AC-5 はいずれも実在するテストでカバーされており、主要アサーションは実質的（偽陽性で素通りしない）。レイヤー分担も妥当（ドメイン VO 境界＝ユニット、マーカー生成＝アダプター統合、フラグ伝播＝ユースケース、要素化／XSS＝フロント）。Blocker・Warning なし。網羅性・堅牢性の観点で軽微な Note を 5 件。

| AC | カバーするテスト | 判定 |
|---|---|---|
| AC-1 タイトル `<mark>` 描画 | 統合 `marks the matched run in the title...`（title に `<mark>デザイン</mark>` を厳密一致）＋ フロント `element-ises the title's <mark> markers`（`<mark` 要素化） | OK |
| AC-2 XSS 安全 | フロント `...escapes the user text`（`<script>` をエスケープ・生 script 不在・`<mark` 要素化を同時検証）＋ 共有 `highlightSnippet.test.tsx` | OK |
| AC-3 本文のみ一致＝タイトルプレーン | 統合 `leaves the title unmarked when only the body matches`（title を `toBe("週次メモ")` 厳密一致、snippet 側は `<mark>` 保持） | OK |
| AC-4 LIKE フォールバック＝プレーン | 統合 `returns plain strings on the LIKE fallback`（title を `toBe("AI roadmap")`） | OK |
| AC-5 他サーフェス漏れなし | 統合 `returns plain title and snippet when highlight is false` ＋ ユースケース `sets SearchQuery.highlight to false`（伝播） | OK |
| VO 境界 ≤1024/＞1024 | `valueObject.test.ts` SearchHighlightedTitle（1024 受理・1025 拒否・マーカー付き受理） | OK |
| errorCode 命名 | `domain/__tests__/errorCodeNaming.test.ts` が `SearchErrorCode` 全エントリを自動走査 → 新コード自動検証 | OK |

## Blockers

なし。

## Warnings

なし。

## Notes

- **[N-001] 統合 AC-4/AC-5 の snippet アサーションが弱く偽陽性余地がある。**
  - 場所: `searchIndex.integration.test.ts` `returns plain strings on the LIKE fallback...`（L840）/ `returns plain title and snippet when highlight is false`（L813）。
  - 理由: snippet 側は `expect(...snippet).not.toContain("<mark>")` のみ。空文字列でも通るため、`snippet()` が誤って空抜粋を返す回帰を捕捉できない。title 側は `toBe(...)` で厳密なので AC 自体は守られているが、snippet の正値（実テキストを含むこと）は未検証。
  - 提案: `expect(...snippet).toContain("デザイン")`（AC-5）/ 本文由来の語（AC-4）を 1 つ正アサーションとして足すと、空抜粋回帰まで塞げる。

- **[N-002] LIKE フォールバックの「highlight に依らずプレーン」をテスト名どおり両値で検証していない。**
  - 場所: `searchIndex.integration.test.ts` `returns plain strings on the LIKE fallback regardless of highlight (AC-4)`（L816-841）。
  - 理由: テスト名は "regardless of highlight" だが、実際に流すのは既定 `highlight:true` の 1 ケースのみで、`highlight:false` の LIKE 経路は実行していない。`runLikeQuery` はフラグを受け取らない構造（`searchIndex.ts` で `q.highlight` は `runMatchQuery` のみに伝播）なので実害は小さいが、名と検証範囲が非対称。
  - 提案: 同一ドキュメントに `makeQuery({ keyword: "AI", highlight: false })` を 1 本足して両値でプレーンを確認すると、名と実態が一致する（コスト極小）。

- **[N-003] フロントの title 要素化アサーションは「snippet にマーカーが無いこと」に依存した間接判定。**
  - 場所: `PublicSearch.test.tsx` `element-ises the title's <mark> markers...`（L142 `expect(html).toContain("<mark")`）。
  - 理由: 出力中の `<mark` が title 由来だと一意に言えるのは、フィクスチャ snippet `"本文の抜粋"` にマーカーが無いため。実質的には正しく機能している（title を素描画に退行させると `&lt;mark&gt;` になり当該アサーションが落ちる）が、`<mark` の出所が title であることは構造上の前提に依存。
  - 提案: 必要なら snippet 側に別マーカーを入れず、title の `安全な`／`タイトル` 平文セグメント（既に検証済み L148-149）と合わせて「title 領域に mark 要素が在る」ことを title ノードにスコープして断定するとさらに堅い。現状でも AC は満たすため任意。

- **[N-004] `SearchHighlightedTitle.create("")`（空文字）の受理テストが無い。**
  - 場所: `valueObject.test.ts` `describe("SearchHighlightedTitle")`（L102-128）。
  - 理由: 兄弟 VO `SearchTitle` には空文字受理テスト（L97-99）があるが、`SearchHighlightedTitle` には無い。下限境界のパリティ欠如（実害なし、create に下限制約は無い）。
  - 提案: 対称性のため空文字受理ケースを 1 行足すと網羅が揃う。任意。

- **[N-005] `searchUserPublicNotes` の highlight フラグ伝播テストが無い。**
  - 場所: ユースケース層テスト全般（`searchPublicNotes.test.ts` / `searchOwnNotes.test.ts` のみ追従）。
  - 理由: plan は「描画コンシューマ不在ゆえ既定 true で inert」と判断済みで本 PR のスコープ判断としては妥当。ただし他 2 サーフェスがフラグ値を明示検証している中で、`searchUserPublicNotes` だけ未検証。将来 UI が付いた際の回帰検出ポイントが無い。
  - 提案: 既存テストがあれば 1 ケース追加（既定 true 確認）。無ければ任意。

## 良い点

- VO 境界テストが 1024 ちょうど受理・1025 拒否・マーカー付き受理の 3 点で過不足なく、エラーコードまで `HighlightedTitleTooLong` を断定。
- 統合 AC-1/AC-3 が title を厳密一致（`toContain("<mark>デザイン</mark>")` / `toBe("週次メモ")`）で判定しており、マーカー有無を取り違える偽陽性が無い。
- フロント XSS テストが「`<mark` 要素化」「生 `<script>` 不在」「エスケープ済み文字列存在」「平文セグメント残存」を同時に主張し、素描画退行・HTML 注入の双方を 1 ケースで弾く。
- 不正マーカー（未終端）・連続マーカー・back-compat は共有 `highlightSnippet.test.tsx` で既出カバー済みで、title 再利用も同一関数のため不正マーカー耐性は担保。
- フラグ既定値の後方互換（公開系 `highlight:true` 既定）と自ノート opt-out（`highlight:false`）が両ユースケーステストで明示検証されている。
- フィクスチャ移行（`SearchTitle.create` → `SearchHighlightedTitle.create`）が 4 箇所すべてで完了し、import も置換済み。typecheck 破壊の取りこぼし無し。
