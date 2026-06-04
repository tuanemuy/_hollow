# ADR — Issue #464: 公開設定画面（P14）のスタイリング

## ADR-001: P14 固有スタイル定数を `app/components/publication/styles.ts` に新設する

### Status
Proposed

### Context
公開設定画面には radio-card（枠線カード＋選択時 accent 枠）、status-dot、link-row（モノスペース URL のカード行）など、モック由来で繰り返し使う固有ユーティリティ文字列がある。CLAUDE.md は「繰り返すユーティリティ文字列は module-scoped 定数へ括り出す」と規定し、既に `public`/`layout`/`auth`/`directory` 各ドメインが専用 `styles.ts` を持つ。これらを `common/styles.ts` に置くか、新規ドメインファイルに置くかの選択。

### Decision
`app/components/publication/styles.ts` を新設し、P14 固有定数のみを置く。汎用プリミティブ（`field`/`fieldLabel`/`fieldControl`/`formError`/`radioRow`/`chip`/`pillBtn*`）は `common/styles.ts` から、`PAGE_TITLE`/`PAGE_SUBTITLE`/`EMPTY_STATE`/`CHIP_*` は `layout/styles.ts` から流用し重複定義しない。

### Consequences
- 良い点: ドメイン別 `styles.ts` の既存前例に整合。共通定数の粒度肥大を避ける。
- トレードオフ: 新規ファイル追加。ただし規約に沿った標準パターン。

### 補足（status-dot）
公開ステータスのドットは `publication/styles.ts` に `STATUS_DOT` を新規定義する。`app/components/note/detail/NoteActions.tsx` の `VISIBILITY_DOT` は同種だが **module-private（非 export）** で直接 import できず、`NoteActions.tsx` を触るのは本Issueスコープ（3ファイルのビジュアル層）外のため、export 化も文字列複製も行わない。代わりに `VISIBILITY_DOT` と**同一のトークン語彙**で value-match variant を定義する: `data-[visibility=private]:bg-status-private` / `data-[visibility=unlisted]:bg-status-link` / `data-[visibility=public]:bg-status-public`。visibility 値 `unlisted` はトークン名 `status-link` に対応する（`--color-status-link` 実在、`status-unlisted` は不在）ため、この対応を守らないと語彙ズレを招く。`VISIBILITY_DOT` との SSOT 統合（共通定数への移設）は将来のフォロー候補として `progress.md` に記録する。

---

## ADR-002: ルート移動は pathless layout group を使い公開 URL を不変に保つ

### Status
Proposed

### Context
アプリシェル適用のためルートを `_app` 配下へ移す必要があるが、P11（ノート詳細）からの単体起動導線（`NoteActions` の `to="/notes/$noteId/publish"`）は維持しなければならない。

### Decision
ファイルを `app/routes/_app/notes/$noteId/publish.tsx` へ物理移動し `createFileRoute` のパスを `/_app/...` に変更する。`_app` は pathless group なので公開 URL は `/notes/$noteId/publish` のまま変わらず、導線は無改修で維持される。`routeTree.gen.ts` は codegen で再生成する。

### Consequences
- 良い点: URL 不変で導線・ブックマーク・head の path 指定すべてが無改修。auth gate もシェル経由で前段適用。
- トレードオフ: `routeTree.gen.ts` の差分が発生（ビルド成果物のため許容）。

---

## ADR-003: モックの modal シェルは採用せず、視覚言語のみページ本文へ翻訳する

### Status
Proposed

### Context
デザインモック `P14-publish-settings.html` は modal（backdrop/header/footer/close/sticky）形式で、URL プレビュー・safety-check・bulk-mode・コピー/QR/再発行・最終アクセスなどロジック未実装の要素を多数含む。実画面はページ形式で、ロジックは既に実装済みのものだけが存在する。

### Decision
modal シェルおよびロジック未実装のモック限定要素は作らない。modal 内の視覚言語（radio-card・status-dot・field-label・link-row・small-btn・url-preview ボックス）だけを Tailwind ユーティリティ＋既存共通定数へ翻訳し、`_app` のページ本文（`<section className="max-w-[640px]">`）に流し込む。実装済みの「発行された URL 一度だけ表示」はモックの url-preview スタイルを流用して見せる。

### Consequences
- 良い点: スコープをビジュアル層に限定でき、未実装機能の作り込みを避けられる。
- トレードオフ: モックと完全一致はしない（modal でなくページ）。Issue の意図（既存内部画面と視覚トーンを揃える）には合致。

---

## ADR-004: ラジオカードの選択強調は `has-[input:checked]:` で行う（`data-selected` state 連動を採用しない）

### Status
Proposed

### Context
公開ステータスのラジオは `<input type="radio" defaultChecked={v === visibility}>` のネイティブ checked で制御され、`visibility` state はサーバ確定値（`changeVisibility` 成功後に `setVisibility`）にのみ追従する。選択カードの accent 強調を `data-selected={v === visibility || undefined}` で出すと、ユーザーが submit 前にラジオを選び直してもカードの見た目が変わらず「選んだのに反映されない」UX 不整合が生じる。

### Decision
選択カードの accent 強調は Tailwind の `has-[input:checked]:` variant（CSS `:has` でネイティブ radio の checked に追従）を主軸にする。`<input>` は `[&_input]:sr-only` で視覚隠ししつつ、ラベル内包で操作・キーボード・関連付けは維持。フォーカスリングはカード側 `focus-within:` で補う。

### Consequences
- 良い点: submit 前のクリック選択にも即追従。状態の SSOT がネイティブ checked に一本化され、React state との二重管理を避けられる。
- トレードオフ: `:has` セレクタ依存（モダンブラウザは対応済み。本プロジェクトのターゲットで問題なし）。
