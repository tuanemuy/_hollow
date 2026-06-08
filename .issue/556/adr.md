# ADR — Issue #556: wikilink/hashtag 表示レンダリングの横展開とタグ導線

## ADR-001: 法務ページは横展開対象外とする

### Status
Proposed

### Context
`.note-detail-content` を共有する画面のうち、法務ページ `LegalDocument.tsx` も保存 body を描画する。横展開対象に含めるか。

### Decision
対象外とする。`LegalDocument` は `markdownConverter` → `htmlSanitizer.sanitize({ allowInternalLinks: false })` で生成され、`[[...]]` / `#...` のプレースホルダが許可されず本文に存在しえない。`renderForDisplay` を通しても変換対象トークンが無く死にコードになる。

### Consequences
- 良い点: スコープを必要最小限に保つ。死にコードを避ける。
- トレードオフ: なし（法務文に内部リンク/ハッシュタグは仕様上出ない）。

---

## ADR-002: 公開サーフェスの hashtag は非リンクのまま

### Status
Proposed

### Context
モック DOM は `#hashtag` を `<a>` 形で示す。auth サーフェスでは既存 home ルート `/?tagNames=...` がタグ絞り込み一覧として機能するためリンク化できる。公開サーフェスではどうするか。

### Decision
公開サーフェスの hashtag は `<span class="hashtag">`（非リンク）のままとする。公開向けタグ絞り込みルートが存在しない（公開 `/search` の `searchSchema` は `q/username/cursor/limit` のみ、公開著者ページ `/u/$username` は `paginationSearchSchema` のみで、いずれも `tagNames` URL パラメータ非対応）。auth `/`（要ログイン）へ匿名ユーザーを誘導するのは不適切。

理由: #549 が「タグ絞り込みルートが無いため hashtag を非リンク」とした判断を、公開サーフェスへ引き継ぐ。公開タグ絞り込みルートの新設は本 Issue のスコープを越える。

### Consequences
- 良い点: 匿名ユーザーを認証アプリへ誘導しない。スコープを越えない。
- トレードオフ: 公開ページの hashtag はクリックできない（auth と非対称だが、公開導線が無い以上妥当）。公開タグ絞り込みは別 Issue 候補。

---

## ADR-003: 過去版の refs は現行ノートの internalLinkRefs を流用する

### Status
Proposed

### Context
過去版閲覧（リビジョン詳細）でも wikilink/hashtag を表示マークアップ化したい。しかし `NoteRevision` エンティティは `internalLinkRefs` を持たない（保存スナップショットに refs を含めていない）。refs をどう供給するか。

### Decision
`getNoteRevision` が既に取得している**現行ノート `found.entity` の `internalLinkRefs`** を refs として渡す。revision エンティティ/`NoteRevisionDTO` に refs フィールドを追加しない。

レンダラはトークンを `(kind, target)` キーで refs と突き合わせるだけなので、過去版本文のトークンに一致する ref があれば解決リンク化、無ければ未解決 `<span>` に degrade する（壊れず安全）。

過去版閲覧は `getNoteRevision` がオーナー本人に限定する（`found.entity.ownerId !== input.actorUserId` で Forbidden）。よって閲覧者は自分のノートしか見られず、auth サーフェスで wikilink を `/notes/$id`（auth ルート）に出して安全（private 露出は起きない）。

理由: revision 保存スキーマ（不変条件）を一切変えずに最小差分で表示マークアップを実現する。revision にも refs を持たせる案は保存スナップショット不変条件に触れスコープ過大。

### Consequences
- 良い点: 保存スナップショット不変条件を保ったまま過去版もマークアップ化できる。
- トレードオフ: 過去版で参照されていたが現行で削除/変更されたリンクは未解決表示に倒れる（誤ったノートへは飛ばない＝安全側 degrade）。

---

## ADR-005: auth サーフェスの hashtag リンク化は getNoteDetail（#549）の表示も変える

### Status
Accepted

### Context
本 Issue で adapter の既定サーフェスを `"auth"` とし、auth サーフェスの `#hashtag` を非リンク `<span>` からリンク `<a class="hashtag" href="/?tagNames=...">` へ変更した。`getNoteDetail`（#549, auth ノート詳細）も既定サーフェスを使うため、第 3 引数を省略したまま hashtag がリンク化される。#549 で追加された統合テスト（`renderedContentHtml` が `<span class="hashtag">#design</span>` を含むことを検証）はこの新挙動と衝突する。

### Decision
auth サーフェスの hashtag リンク化を全 auth read path（`getNoteDetail` / `getNoteRevision`）に一様適用する。`getNoteDetail` の統合テストの hashtag アサーションを新しいリンク形（`<a class="hashtag" href="/?tagNames=%5B%22design%22%5D">#design</a>`）に更新する。これは Issue #556 の意図（auth `#hashtag` を既存 home タグ絞り込み導線へリンク化）そのものであり、#549 の非リンク挙動は本 Issue で更新される過渡的状態だったと位置づける。`contentHtml` の verbatim 不変条件・wikilink 挙動は不変。

### Consequences
- 良い点: auth read path 全体で hashtag のリンク化が一貫する。サーフェス分岐が単一の adapter 既定値に集約され、呼び出し側は public のみ明示すればよい。
- トレードオフ: #549 で追加されたテストアサーション 1 件の更新が必要（挙動変更を反映する正当な更新）。`a.hashtag` の hover CSS（#549 先回り済み）が auth read path 全体で初めて活きる。

---

## ADR-004: 公開 wikilink は public ルートへ向け、visibility は target ルートに委ねる

### Status
Proposed

### Context
公開ノート詳細で wikilink をリンク化する際、(1) リンク先 URL（adapter は auth ルート `/notes/$id` をハードコード）と (2) 解決先ノートが private な可能性（`InternalLinkRef.resolvedNoteId` は対象の visibility を保証しない）という 2 系統の private 露出リスクがある。

### Decision
公開サーフェスでは wikilink を `/notes/public/$noteId`（公開ルート）へ向ける。レンダラ側で解決先の visibility を追加で引かない。

理由: `/notes/public/$noteId` は `getPublicNote` byId 経由で visibility=public gate を持ち、非公開は一律 NotFound（存在の有無も秘匿し列挙を防ぐ）。よって public ルートへ向ければリンクは出ても踏むと安全に 404 し private 露出は起きない。レンダラで visibility を引くと追加 I/O・非決定性を招くため避ける。

### Consequences
- 良い点: 追加 I/O なし・決定的。private 露出と列挙を target ルートの既存 gate で安全化。
- トレードオフ: private 解決先への wikilink はリンクとして出るが踏むと 404（リンクの見た目上は解決済みに見える）。これは公開範囲の設計上許容。

---
