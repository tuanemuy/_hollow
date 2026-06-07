# ADR — Issue #549: P11 ノート詳細 backend 拡張

## ADR-001: wikilink/hashtag のマークアップ化を表示専用 port + adapter で行う

### Status
Proposed

### Context
保存される `contentHtml` の `[[wikilink]]` / `#hashtag` は verbatim 保持が既存の意図的不変条件（`markdownConverter.ts` の verbatim、`htmlSanitizer.allowInternalLinks` の温存、`extractMetadataFromHtml` の抽出専念が全て依存）。一方モックは詳細表示でこれらをピル/accent 表示する。表示用マークアップ化をどこで行うか選択肢:

- (a) server component 内で正規表現置換
- (b) ドメイン port `NoteBodyRenderer` + adapter 実装で表示専用変換
- (c) 保存時に body をマークアップ化（不変条件を破壊）

### Decision
(b) を採用。`renderForDisplay(html, refs)` をドメイン port として定義し、adapter で text node 限定の安全な要素化を行う。read path（詳細表示）専用とし、保存 body・export は触らない。

理由: (1) 保存 body verbatim 不変条件を破壊しない、(2) wikilink 解決の意味づけ（`InternalLinkRef` の kind/resolved）はドメイン語彙なので port をドメインに置くのが自然、(3) HTML 文字列の安全な要素化を adapter（既存 `ultrahtml`）に閉じる。(a) は XSS 安全性（属性内・コード内誤変換）と再利用性で劣る。(c) は不変条件破壊のため不可。

### Consequences
- 良い点: 編集/保存/export の既存挙動を一切変えずに表示だけ追従できる。XSS を adapter に閉じられる。
- トレードオフ: 表示のたびに変換コストが乗る（詳細ページのみ・1 ノート単位なので軽微）。

---

## ADR-002: wikilink は保存時解決を真実とし本文再解決をしない

### Status
Proposed

### Context
`[[wikilink]]` のリンク先は `assembleFromInputs` → `resolveInternalLinks` で保存時に `resolvedNoteId` が確定し、`NoteDTO.internalLinkRefs`（`InternalLinkRefDTO`、`kind=id` は解決済み id）として露出済み。表示時に本文を再解決するか否か。

### Decision
再解決しない。レンダラは解決済み refs を入力に取り、本文中の各 `[[...]]` トークンと突き合わせて `kind=id` → note 詳細リンク、未解決 title → 非リンク（broken 表示）とする。

理由: 保存時解決を単一の真実とすることで表示の決定性が保て、#321（post-hoc 再解決）の方針とも整合する。

### Consequences
- 良い点: 表示が決定的、DB アクセス追加なし。
- トレードオフ: 保存後に解決対象ノートが新規作成されても、当該ノートを再保存するまで未解決のまま（既存仕様どおり）。

---

## ADR-003: バックリンクのディレクトリは `directorySegments` で投影する

### Status
Proposed

### Context
モックの `.backlink-meta` はディレクトリパス（`Research / 書籍要約` 等）を uppercase で表示。DTO に持たせる形は `directoryPath`（連結済み文字列）か `directorySegments`（`{id,name}[]`）か。

### Decision
`directorySegments: readonly { id: string; name: string }[]` を採用。主ノート breadcrumb と同じ `DirectoryService.computeSegments` で算出。大文字化・`/` 連結はプレゼンの CSS/描画で行い、DTO は素の name を保持。

理由: breadcrumb 既存構造と整合し、表示自由度（リンク化・大文字化）が高い。

### Consequences
- 良い点: 既存ディレクトリ算出経路を流用、主ノートとの一貫性。
- トレードオフ: referrer ごとに segments 算出が必要。`getBacklinks` 全件で N+1 になるため、`DirectoryService` に `findTree(ownerId)` 1 回 + メモリ親子マップで複数ディレクトリの segments を一括構築する純関数を追加し `O(1)` クエリに落とす（既存 `collectSubtreeIds` パターン踏襲）。

---

## ADR-004: バックリンクスニペットの wikilink/hashtag はスコープ外

### Status
Proposed

### Context
`buildBacklinkSnippet` は `toPlainText` で本文を素テキスト化するため、バックリンクカードのスニペットには `[[...]]` / `#tag` が生のまま出る。本 Issue の表示マークアップ化を「詳細本文のみ」に閉じるか、スニペットにも広げるか。

### Decision
詳細本文（`.note-detail-content`）のみを対象とし、バックリンクスニペットは対象外とする。スニペットは素テキストの抜粋であり、ピル化はレイアウト上も不要。

理由: モックのバックリンクカードはスニペットを素テキストで示し、ピル表示は本文側のみ。スコープ肥大を避け、#540 見送り 2 点に集中する。

### Consequences
- 良い点: スコープが明確、レビュー時の手戻り議論（スニペットもピル化すべきか）を予防。
- トレードオフ: スニペット内の `[[...]]`/`#tag` は生テキストのまま（既存挙動どおり）。

---

## ADR-005: wikilink/hashtag パターンを単一ソース化（export 化）

### Status
Proposed

### Context
`INTERNAL_LINK_PATTERN`（`note/service.ts`）と `HASHTAG_PATTERN`（`tag/service.ts`）はいずれも非 export のモジュール private。表示レンダラで同じパターンが必要。複製するか export して再利用するか。

### Decision
両パターンを各ドメインサービスから export して単一ソース化し、レンダラ adapter が import する。`/g` 付き正規表現は `lastIndex` 状態を持つため、レンダラでは `matchAll`（毎回新規イテレータ）を使うか正規表現を都度複製して状態共有を避ける。

理由: 抽出（`extractMetadataFromHtml` / tag service）と表示で同一パターンを使うことで、パターンの drift（抽出と表示で `[[...]]`/`#...` の解釈がずれる）を防ぐ。

### Consequences
- 良い点: 抽出と表示の解釈が常に一致。
- トレードオフ: ドメインサービスの公開 API がわずかに増える（正規表現定数の露出）。`/g` 状態共有のフットガンに注意（matchAll / 複製で回避）。

---

## ADR-006: 実装時の追加判断（Issue #549 実装フェーズ）

### Status
Accepted（実装で確定）

### Context / Decision

実装中に生じた非自明な判断を記録する。

1. **マッチ箇所の要素化方法（adapter）:** ultrahtml の AST に「整形済み HTML 文字列を値に持つ TEXT_NODE」を挿入し、`renderSync` がテキストノード値を verbatim 出力する性質を利用してマークアップを注入する（`rawHtmlNode`）。理由: マークアップ文字列を再 `parse` すると `<`/`>` が再エスケープされて崩れるため。`htmlSanitizer.ts` の「`renderSync` は再エスケープしない」前提と同じ知見を流用。target/display は `escapeAttrValue`/`escapeTextValue` 相当でエスケープしてから注入する。

2. **wikilink と hashtag の重なり処理:** 同一テキストノード内で両パターンを `matchAll` し、位置順に非重複でマージ。`[[...]]` スパンに食い込む `#tag` は wikilink を優先して破棄（`#` がリンク表示テキストの一部になる事故を防ぐ）。

3. **`href` 注入面の安全性:** `href` に入るのは `resolvedNoteId`（検証済み `NoteId` = UUID）のみ。kind=title 未解決は非リンク `<span>`。よって属性ブレイクアウト経路は target/display からは発生しない（display はテキストコンテンツのみ）。

4. **consumer / テスト DI への波及:** `ConsumerContainer = RequestContainer & ...` のため consumer は `createRequestContainer` の spread で自動的に `noteBodyRenderer` を継承（明示追加不要）。一方、手組みで `RequestContainer` を構築する 2 つのテストヘルパ（`application/__tests__/helpers.ts`・`adapters/d1/__tests__/helpers.ts`）には明示追加が必要だった。

5. **`computeSegmentsForMany` の経路:** `findTree(ownerId)` 1 回 + id→node マップで各 dir の親チェーンをメモリ走査。欠落親 / サイクル検出時はその dir を空配列に倒す（部分パスを返さない）。`getNoteDetail` の主ノート breadcrumb は既存の単発 `computeSegments` を流用し続け、新関数は referrer 群専用とした（主ノートは 1 件で N+1 にならないため）。

### Consequences
- 良い点: 保存 body・export・編集を一切変えず、表示のみマークアップ化。XSS は adapter に閉じ込め、テストで角括弧・コードブロック・既存 `<a>`・属性内を網羅。
- トレードオフ: 表示時に AST 走査コストが乗る（詳細ページ 1 ノート単位なので軽微）。

---
