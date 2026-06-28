# Round 1 レビュー — アーキテクチャ整合性 / 実現可能性 / リスク（Issue #795）

**レビュー対象:** `.issue/795/plan.md` / `.issue/795/adr.md`
**視点:** あるべきアーキテクチャ（CLAUDE.md Styling 規約・layer 方向）との整合・実現可能性・リスク

---

## 総評

計画は CLAUDE.md の Styling 規約（utility-first / トークン SSOT / `data-*` 属性 / 繰り返しユーティリティの hoist / mock first）を正しく踏まえており、層越境も発生しない健全な設計。`MediaUploader` の props 契約・mode 非依存設計・3 ステップフローを「あるべき姿」として温存し UI のみ刷新する方針は妥当。ADR-001/ADR-002 の抽象境界の引き方も筋が良い。

一方で、**状態機械に列挙した `selected` が「選択即アップロード」案では到達不能になる**未決定点、**ドラッグ&ドロップ追加でアップロード中の二重起動ガードが新たに必要になる**副作用が、実装着手前に解消すべき点として残っている。

---

#### 問題点（要修正）

- **[P-001]** `UploadState` の `selected` 状態と「選択即アップロード（自動アップロード）」デフォルトが両立せず、`selected` がデッド状態になり得る
  - 理由: plan.md step 5（127-128 行）は `idle | selected | uploading | error | done` を導入しつつ、同じ箇所で「デフォルトは選択即アップロードで preview を uploading 中に併記する案」と書いている。選択即アップロードなら検証通過ファイルは即 `uploading` に遷移し、`selected`（アップロード前プレビュー）には決して滞在しない。検証 NG（unsupported/oversized）はバナー表示のまま `idle` に留まるので、これも `selected` を経由しない。結果として `selected` は到達不能な dead state になり、状態機械の意図と実装が食い違う。さらに AC-2 の「upload **前**に preview」は、自動アップロードだと実質ゼロ秒となり「前」の要件を満たしているとは言いにくい。
  - 提案: mock first（step 1）でこの分岐を**確定**し、状態機械をそれに一致させる。(a) 確認ステップ採用なら `selected`（プレビュー＋「アップロード」確定ボタン）を正規状態として残し AC-2「前」を素直に満たす。(b) 自動アップロード採用なら `selected` を状態機械から落とし、プレビューは `uploading` 内に併記する設計にして dead state を作らない。どちらにせよ「未決定のまま両論併記」で実装に渡さない。

- **[P-002]** ドラッグ&ドロップ追加に伴う「アップロード中の二重起動」ガードが計画で手当てされていない（single-file・直列挙動の回帰リスク）
  - 理由: 現行 `MediaUploader` は `<input disabled={... || state.kind === "uploading"}>`（137 行）で**入力を無効化することだけ**でアップロード中の再選択を塞いでいる。新設する `<label>` ベースの dropzone は drop ハンドラが native input を経由しないため、`disabled` では塞げない。参照元の `UploadForm.onDrop` も `isPending` 中の drop をそのまま `submitFiles` に流す（225-229 行）。multi-file の ingestion では許容でも、editor は single-file・直列前提なので、アップロード中に drop されると 2 本目の `runUpload` が走り `setState({kind:"uploading"})` が競合してプレビュー/進捗が壊れる。plan.md の「single-file 挙動の維持」リスク欄（161 行）は「複数ファイルドロップ時は先頭のみ」には触れているが、**アップロード中の追加 drop/選択**には触れていない。
  - 提案: step 5 の dropzone 実装に「`state.kind === "uploading"`（および `disabled`）の間は `onDrop` を early-return し、label に `data-disabled` / `aria-disabled` + `pointer-events-none` 相当を付与してクリックも抑止する」を明記する。検証バナー表示中（`idle` だがバナーあり）に新規 drop が来た場合の上書き挙動も併せて定義する。

---

#### 改善提案（検討推奨）

- **[S-001]** クライアント size 上限に `BYTE_SIZE_MAX`（5 GiB safety cap）をそのまま使うと、size バリデーションが実質ほぼ発火せず AC-3 の「ingestion と一貫した」体験から外れる
  - 理由: ingestion は `DEFAULT_MAX_INGESTION_BYTES`（50 MB）で弾き、バナー文言も「上限 50 MB」。一方 media の `BYTE_SIZE_MAX` は 5 GiB の安全網であって UX 上限ではない。5 GiB 超のメディアは現実にほぼ無いので、editor の size バナーはほぼ死茬コードになり、200 MB の動画なども素通りで巨大 PUT を試みる。ADR-002 が守りたい「クライアントで弾いた＝サーバーでも弾かれる」不変条件は、UX 上限を `BYTE_SIZE_MAX` **以下**の別定数（例 `MEDIA_UX_BYTE_SIZE_MAX`）にしても保たれる（`uxCap ≤ serverCap` なら invariant 維持）。`BYTE_SIZE_MAX` を SSOT として export する ADR-002 の判断自体は妥当なので、これは「上限値の選び方」の論点。
  - 提案: mock 確定時に「size バナーが意味のある頻度で発火する UX 上限」が必要かを判断する。不要（5 GiB の安全網で十分）と決めるなら、それを ADR-002 に「size バナーは実用上ほぼ発火しない安全網であることを承知の上で `BYTE_SIZE_MAX` を採用」と明記し、AC-3 解釈（一貫＝UX 機構が同じ、しきい値は別）を残す。

- **[S-002]** 検証で得た `kind` を `runUpload` の presign に渡し、`kindForMime` の重複判定を排除する
  - 理由: step 4 の `validateMediaFile` は `{ ok: true; kind: "image" | "video" }` を返す設計。一方 `runUpload` は presign 時に独立して `kindForMime(file.type)`（39-42 行）を再計算している。同じ MIME→kind 判定が 2 箇所に分かれると将来の分岐追加（avatar 等）でずれる。検証は「単一の MIME→kind 正規化点」になり得る。
  - 提案: `validateMediaFile` の戻り `kind` を選択ファイルと一緒に保持し、`runUpload` はそれを使う。`kindForMime` は削除するか `validateMediaFile` 内へ内包する。

- **[S-003]** `MediaUploader` のコンポーネントテストは `UploadForm.test.tsx` の serverFn モックだけでは足りず、XHR と `URL.createObjectURL` のスタブが追加で要る（テスト方針の実現性）
  - 理由: plan.md テスト方針（170 行）は「presign→put→finalize モックが順に呼ばれ」とするが、`putWithProgress` は**モジュール内 private 関数で `new XMLHttpRequest()` を直接生成**している（46-72 行）。`useServerFn` 由来の presign/finalize はモックできても、PUT フェーズは happy-dom のグローバル `XMLHttpRequest` をスタブしないと進まない（happy-dom の XHR は実ネットワークに出る/未実装の可能性）。加えてサムネイル用 `URL.createObjectURL` / `revokeObjectURL` も happy-dom で未定義になりがちで、スタブが要る。
  - 提案: テスト方針に「`global.XMLHttpRequest` のフェイク（onload/onprogress を手動発火）」「`URL.createObjectURL`/`revokeObjectURL` のスタブ」を前提として明記する。あるいは検証/状態遷移のユニットは純粋関数（`validateMediaFile`）に寄せ、E2E 寄りの put 経路は手動/ブラウザ検証に委ねる線引きを書く。

- **[S-004]** `BYTE_SIZE_MAX`（および新設 `validateMediaFile`）を `media/index.ts` バレル経由でも公開すると import 経路が一貫する
  - 理由: `media/index.ts` は `actions` / `schema` を再エクスポートする barrel。consumer 側が `@/components/media/schema` を直接掘るか barrel を使うかが混在すると参照点がぶれる。
  - 提案: 既存方針（schema 直 import）で統一するなら barrel は触らない、barrel 経由に寄せるなら `BYTE_SIZE_MAX` / `validateMediaFile` を `index.ts` に足す、のどちらかを step 4 で明示する（軽微）。

- **[S-005]** `revokeObjectURL` のタイミングを「useEffect クリーンアップに一本化」する旨を明記し、二重 revoke / 取りこぼしの両方を避ける
  - 理由: plan.md は「`useEffect` クリーンアップ/状態遷移で `revokeObjectURL`」（134 行）と二系統を併記しているが、状態遷移ハンドラ内で手動 revoke しつつ useEffect クリーンアップでも revoke すると二重 revoke、片方だけだと取りこぼしの温床になる。
  - 提案: 「object URL は state に持ち、`useEffect(() => () => revoke(url), [url])` の単一クリーンアップでのみ解放（画像 kind のみ生成、video/その他は生成しない）」と一本化方針を書く。

---

#### 良い点

- **層越境なし。** `validateMediaFile` を `app/components/media/validation.ts`（presentation/frontend 層・純粋関数）に置き、`BYTE_SIZE_MAX` を同層 `schema.ts` から export する設計は、core レイヤーを跨がず CLAUDE.md の依存方向を侵さない。ADR-002 の「同 presentation/frontend 層内参照で層越境はない」という整理は正確（`schema.ts` は `zod` のみ依存で client バンドル安全、`actions.ts`(server fn) を引き込まない）。
- **ADR-001 の抽象境界が的確。** 「ビジュアル（`DROPZONE` 文字列）＋ALERT プリミティブのみ共有、検証ロジックは各ドメイン固有」は、ingestion の `validateUploadFiles` が `IngestionService.detectKind` / `DEFAULT_MAX_INGESTION_BYTES` にドメイン結合している事実と、multi/single の状態機械差を踏まえた正しい判断。コンポーネント全体抽出を避けた理由づけも妥当。
- **`DROPZONE` の共有プリミティブ移設が規約に忠実。** `common/styles.ts` の `scrollbarHidden` 等と同列の domain-agnostic シェルとして移し、2 つ目の consumer が生まれる本 Issue を契機にする判断は「繰り返しユーティリティは module-scoped へ hoist」規約・JSDoc 規約（SSOT 明記）に沿う。クラス文字列完全一致での移設＋`UploadForm.test.tsx` 緑確認で回帰を抑える点も適切。
- **props 契約固定で NoteEditor 3 経路を非破壊に保つ設計。** `onMediaInsert` が WYSIWYG=`setImage` / HTML=`setHtmlDraft` / inline=`setContent` を出し分ける現行構造を確認済みで、`{contentHtml, onInsert, disabled}` と `onInsert(nextHtml,{id,url})` を不変に保てば NoteEditor 無変更という結論は正しい（step 6 の検証ステップ化も妥当）。
- **mock first と desktop/mobile 二重メンテのリスクを明示。** AC-7・`P12-editor.html` ＋ `mobile/P12-editor.html` 双方更新をリスク欄に立てており、Issue の「mock がない」ギャップへの対応順序も正しい。
- **a11y の二重読み上げ回避を踏襲。** `ProgressBar` を `decorative`（aria-hidden）にして隣接 live-region テキストと二重アナウンスしない既存方針を継承しており、ProgressBar の JSDoc 契約と一致。
- **検証ゲート追加が地味に正しい挙動改善。** 現行 `kindForMime` は MIME 不明（空文字）ファイルを image 扱いで presign してしまうが、`validateMediaFile` で `image/` `video/` 始まりのみ通すことで、drag-drop が `accept` を素通りさせる経路でも不正 MIME を upload 前に弾ける。
