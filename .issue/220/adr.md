# ADR — Issue #220: アップロードはページ遷移せずモーダル／ドロワーで完結させる

## ADR-001: 起動 UI として「モーダル」を採用（ドロワーは見送り）

### Status
Proposed

### Context
Issue 本文では「モーダル or サイドドロワー」の二者択一が示され、議論として「ドラッグ&ドロップ対応や進捗の見え方を考えるとドロワー寄りが良さそう」とされていた。一方で:

- プロジェクトには既に `app/components/common/Dialog.tsx` の堅牢なモーダル primitive がある（focus trap、Esc クローズ、SSR ガード、backdrop クリック制御、body scroll lock、close button オプション）。
- ドロワー primitive は存在せず、新規に同等のアクセシビリティ品質で実装するのは追加コストが大きい（slide-in アニメーション、focus trap、breakpoint 別レイアウト、`prefers-reduced-motion` 対応など）。
- アップロード操作は基本的に短時間で完結する単発作業であり、取り込みキューの全件監視は既存 `/upload` ページ（フォールバック）に任せられる。
- ノート一覧画面が背景に残り、完了後に `router.invalidate()` で即反映する設計は、モーダルでも十分実現できる（コンテキスト保持の要件を満たす）。

### Decision
モーダルを採用する。既存 `Dialog` primitive を再利用し、`UploadDialog` を新規追加する。フッターに「取り込みキューを見る」リンクを置いて `/upload` ページに誘導し、進捗の継続監視はそちらに任せる。

### Consequences
- 良い点:
  - 新規 primitive を追加せず、Issue スコープが拡大しない
  - 既存 Dialog のアクセシビリティ・UX 品質をそのまま享受できる（focus trap、Esc、scroll lock、IME 安全な Esc）
  - 既存パターン（`MoveNoteDialog` 等）と一貫性が取れる
- トレードオフ:
  - 「複数ファイルを順次追加しながら裏で進捗を眺める」フローは弱くなる。ただし `UploadForm` 自体は複数ファイル選択に対応しており、完了後の進捗確認は `/upload` ページ（モーダル内リンクから 1 クリック）で代替できる

---

## ADR-002: モーダル開閉状態を URL hash（`#upload`）で表現する

### Status
Proposed

### Context
Issue 完了条件③「モーダルの開閉状態が URL に反映される」を満たす必要がある。本文では「URL search param（例: `?upload=open`）に反映して `validateSearch` で扱う」と提案されている。

しかし、現状の各ルートは個別に `validateSearch` を持つ（`/`, `/u/$username`, `/trash`, `/exports`, `/views`, `/notes/$noteId/history`, ...）。アップロードはヘッダー / サイドバーから「どのページに居ても」開けることが求められるため、`?upload=open` を全ルートの search schema に追加する必要が生じ、変更ファイル数が肥大化する。`__root.tsx` の `validateSearch` で共通化する案もあるが、TanStack Router の search 検証は各 leaf route 単位で完結する設計のため、共通 schema 設計には別途の検討が必要になる。

代替案として URL hash（`#upload`）を採用すると:

- ルート定義に一切手を入れずに済む（hash は `validateSearch` の対象外）
- 任意のルートで動作する（hash はパスから独立）
- リロード／URL 共有で復元可能（Issue 要件を満たす）
- TanStack Router の `<Link to="." hash="upload">` で書き込め、`useRouterState({ select: s => s.location.hash })` で読み取れる

### Decision
URL hash（`#upload`）でモーダル開閉状態を表現する。`UploadDialogMount` が hash と pathname を購読し、hash が `upload` **かつ** pathname が `/upload` 以外のとき `UploadDialog` を `open` する（`/upload` ページではフォールバックページとモーダルが重ならないよう抑止）。

履歴ポリシー:

- **オープン操作**（`UploadButton` クリック）は `replace` を **付けない** → ブラウザ「戻る」でモーダルが閉じる自然な挙動になる
- **クローズ操作**（Esc／×／backdrop／フッターリンク）は `router.navigate({ to: ".", hash: () => "", replace: true })` で hash をクリアし履歴に新エントリを積まない（モーダル開閉のトグルが履歴を肥大化させない）

`hash: () => ""` の Updater 形式を使う理由: `hash: ""` を string 直接渡しすると URL バー末尾に `#` だけ残る環境がある可能性があるため、Updater 形式で確実にクリアする。さらに保険として、navigate 後に `window.location.hash !== ""` であれば `window.history.replaceState(null, "", window.location.pathname + window.location.search)` で強制クリアする。

### Consequences
- 良い点:
  - 全ルートで動作、ルート定義の変更ゼロ
  - 既存の `validateSearch` パターンと衝突しない
  - SSR 時は hash が無いため初期描画でモーダルは閉じた状態 → hydration 後に hash を読んで開く（SSR レンダーで Portal 副作用を出さない設計と整合）
- トレードオフ:
  - hash はサーバーに送られないため SSR で「初期描画から開いた状態」を出すことはできない（hydration 後に open する一瞬の遅延が出る）
  - 検索エンジンや外部リンクで `#upload` 付き URL を共有しても、SSR で先回りしてダイアログを開くことはできない（ただしクライアント hydration 直後に開く）

---

## ADR-003: 既存 `/upload` ページはフォールバックとして維持

### Status
Proposed

### Context
Issue 本文に「直リンクされる可能性を考えると残す価値はある（ブックマークや外部リンク用のフォールバック）」と明記されている。一方で「冗長なら削除も視野」とも書かれている。

評価:

- `/upload` ページは取り込みキュー全件を一覧表示する場として機能している（`IngestionJobRow` で個別操作可能）
- モーダルは「これからアップロードする」操作に最適化される。既に進行中のジョブを後から見直す動線として、別ページがあると便利
- 削除すると `<Link to="/upload">` の他参照（共有 URL、ブックマーク）が壊れる
- 残しても主動線をモーダルに変えれば「冗長感」は解消する（ヘッダー CTA はモーダルへ）

### Decision
`/upload` ページは維持する。ただしヘッダー／サイドバー／ノート一覧ツールバーの「アップロード」CTA はモーダル起動に切り替える。モーダル内には「取り込みキューを見る」フッターリンクを置き、進捗の継続監視への動線を確保する。

### Consequences
- 良い点:
  - 直リンク・ブックマーク互換を維持
  - 取り込みキュー全件閲覧の場が残る
  - Issue #217（取り込みキュー見出し削除等）との衝突を最小化
- トレードオフ:
  - 「主動線」「フォールバック」の二系統が併存する形になり、ユーザーへの説明コストが若干上がる。ただしモーダル → フォールバックへの誘導リンクで違和感は小さい

---
