# ADR — Issue #795: refactor(note): polish the editor's media-upload UI

## ADR-001: dropzone は「ビジュアルのみ共有・検証ロジックは media 固有」で揃える

### Status
Proposed

### Context
editor の `MediaUploader` を ingestion の洗練パターン（`UploadForm`）に揃えるにあたり、「2 つの divergent な upload UI を重複させない」ことが Issue から要請されている。取りうる抽象化の粒度は 3 つ：

1. **コンポーネント全体を共有抽出**（`<Dropzone>` + 検証 + バナーを 1 つの再利用コンポーネントに）。
2. **ビジュアル（dropzone のユーティリティ文字列）＋バナープリミティブのみ共有し、検証ロジックは各ドメインで持つ**。
3. **editor 固有に丸ごと再実装**（共有なし）。

調査で判明した制約：
- ingestion の `validateUploadFiles` は `IngestionService.detectKind` と `DEFAULT_MAX_INGESTION_BYTES` に**ドメイン結合**しており、対応形式は「HTML/MD/Word/Excel/PPT/PDF/画像/音声/テキスト」。一方 editor のメディアは **image/video のみ**でサイズ上限も別系（`media/schema.ts` の `BYTE_SIZE_MAX`）。検証の意味論が異なるため共有不可。
- ingestion は **multi-file**、editor は本 Issue では **single-file**（挿入モデルが 1 枚追記 / カーソル 1 枚挿入）。状態機械とプレビューの形が異なる。
- 一方、dropzone の**見た目**（`border-dashed` / `surface-elevated` / `data-dragover` ホバー）と**バナーの構造**（`ALERT` / `ALERT_ERROR` / `ALERT_WARNING` プリミティブ）は完全に共通化できる。
- `DROPZONE` 文字列は現状 ingestion の 2 consumer（`UploadForm.tsx:30` / `UploadDialog.tsx:58`）に**同一インラインで既に重複**しており、「繰り返すユーティリティは module-scoped 共有定数へ」という CLAUDE.md の規約からは共有プリミティブ化が望ましい。editor という 3 つ目の consumer が生まれる本 Issue を契機に、ingestion 2 箇所 + editor の計 3 箇所を共有定数へ収斂させる（ingestion 内の既存重複も同時に解消し、移設後に「共有定数 + インライン重複」の新たな不整合を残さない）。

### Decision
**選択肢 2** を採る。
- `DROPZONE` ユーティリティ文字列を `app/components/common/styles.ts` の domain-agnostic 共有プリミティブへ移設し、editor と ingestion の各 consumer（`UploadForm` / `UploadDialog`）がすべて参照する（ビジュアルの SSOT）。
- バナーは既存の `ALERT*` 共有プリミティブで両者が同じ構造を描画する（文言は各ドメイン固有）。
- 検証ロジックは **media 固有の単一ファイル版** `validateMediaFile`（`app/components/media/validation.ts`）を新設し、ingestion の `validateUploadFiles` とは分離する。
- コンポーネント全体抽出（選択肢 1）はしない。multi/single・検証ドメイン・状態機械の差が大きく、無理に 1 コンポーネントへ畳むと条件分岐だらけの抽象化漏れになるため。

### Consequences
- 良い点: dropzone の見た目とバナー構造は単一管理になり「2 つの divergent UI」を回避。検証は各ドメインの意味論に忠実なまま。`UploadForm` の挙動・クラスは不変（移設のみ）。
- トレードオフ: dropzone のコピー/プレビュー/状態機械は editor 側に独自実装が残る（完全な DRY ではない）。ただしこれらはドメイン固有なので重複ではなく適正な分離。将来 editor も multi-file 化する場合は検証の共有可否を再検討する。

---

## ADR-002: クライアント検証の size 上限は `media/schema.ts` の `BYTE_SIZE_MAX` を SSOT にする

### Status
Proposed

### Context
AC-3 は「クライアント側の format/size バリデーションが upload 前にフィードバック」を要求する。サーバーは `presignMediaUploadSchema` で `byteSize ≤ BYTE_SIZE_MAX`（5 GiB）を強制している。クライアント側に**別の上限値をハードコード**すると、両者がずれた瞬間に「クライアントで通ったがサーバーで弾かれる（またはその逆）」という不整合が生じ、UX とサーバーの safety net が乖離する。

### Decision
`app/components/media/schema.ts` の既存定数 `BYTE_SIZE_MAX` を `export` し、クライアントの `validateMediaFile` がそれを参照する。クライアントとサーバーが同一の上限定数を共有する。

### Consequences
- 良い点: 「クライアントで弾いた＝サーバーでも弾かれる」の整合が定数共有で保証される。上限変更は 1 箇所。
- トレードオフ: `schema.ts`（transport boundary 定義）からクライアントコンポーネントが値を import する依存が増えるが、同じ presentation/frontend 層内の参照であり層越境はない。ロジック変更はなく export 公開のみ。
- **UX 上限は別途設けず server cap（`BYTE_SIZE_MAX` = 5 GiB）を SSOT とする。** ingestion の 50 MB のような「より小さい UX 上限」を別定数で持つ案は見送る — どの値が妥当かは product 判断で AC に含まれず（AC-3 は「ingestion と一貫した format/size 検証機構」を求めるだけで具体的しきい値は指定していない）、別定数は ADR の核心（クライアントで通った＝サーバーでも通る）を増やさずに複雑さだけ足す。size バナーは日常的には発火しにくい安全網になる点は受容し、6 GiB 動画のような明確な超過を upload 前に弾けることと、整合性・単純さを優先する。

---
