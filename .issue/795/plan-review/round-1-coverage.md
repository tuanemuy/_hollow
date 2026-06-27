# Round 1 レビュー — Issue #795 要件カバレッジ・スコープ整合性

レビュー視点: **Issue の要件カバレッジ・スコープ整合性**
対象: `.issue/795/plan.md` / `.issue/795/adr.md`
日付: 2026-06-27

## カバレッジ照合（結論: Issue 要件は全て計画に落ちている）

### Acceptance Criteria（Issue 8 項目）
| Issue AC | 計画の対応 | 判定 |
|---|---|---|
| 1. drag-and-drop + click-to-select | AC-1（Step 1,3,5） | カバー |
| 2. 選択ファイル preview（name/size・画像サムネ） | AC-2（Step 1,5） | カバー |
| 3. client 側 format/size 検証・ingestion と一貫 | AC-3（Step 1,4,5） | カバー |
| 4. progress / error・retry / success の各状態 | AC-4（Step 1,5） | カバー |
| 5. presign/put/finalize + 3 モード挿入の非破壊 | AC-5（Step 5,6） | カバー |
| 6. a11y 維持/改善（live-region, labelled, touch target） | AC-6（Step 1,5） | カバー |
| 7. mock に一致 | AC-7（Step 1,5） | カバー |
| 8. typecheck/lint/format | AC-8（Step 7） | カバー |

### Scope (mock first)（Issue 3 項目）
- (1) P12-editor.html + mobile への UI 設計 → Step 1。カバー。
- (2) 必要トークン / 共有スタイル定数 → Step 2。カバー（保守的に「原則新トークンなし」）。
- (3) MediaUploader 実装・flow 再利用・ingestion dropzone を適所で再利用/抽出 → Step 3,4,5 + ADR-001。カバー。

### Design questions（Issue 3 点）
- 共有 vs 軽量 editor 固有 → ADR-001 で「ビジュアルのみ共有・検証は media 固有」と明示決定。カバー。
- single-file vs multi-file → スコープ「含まれないもの」で single 維持を明示。カバー。
- toolbar「画像」ボタン配線 → スコープで未配線据え置きを明示。カバー。

検証の結果、コードベースの事実確認も概ね計画どおり（`BYTE_SIZE_MAX` は `schema.ts:4` に未 export で存在、`MediaUploader` の props 契約・3 ステップフロー・`UploadState` の現状、P12 mock に toolbar 画像ボタンはあるが in-body uploader mock は無し、を確認）。**Issue 要件カバレッジは網羅されている。** 以下は整合性・正確性の指摘。

#### 問題点（要修正）

- **[P-001]** ADR-001 が扱っていない決定を、計画スコープ欄が「ADR-001 で判断を記録」と誤って参照している（plan.md 内部の自己矛盾）。
  - 理由: plan.md L29（single-file 維持）と L30（toolbar 画像ボタン未配線）はいずれも「(ADR-001 で判断を記録)」と書くが、ADR-001 の本文は dropzone 抽象化の粒度（ビジュアルのみ共有 vs コンポーネント全体抽出 vs 個別再実装）に関する決定のみで、toolbar ボタン配線には一切言及がない。さらに plan.md L154 は「single-file 維持 / toolbar 画像ボタン未配線はスコープ判断（…ADR では扱わない）」と書いており、L29-30 と L154 が真っ向から矛盾している。レビュアー/実装者がどちらを信じるべきか不明で、決定の出所が追えない。
  - 提案: L29-30 の「(ADR-001 で判断を記録)」を削除し「(plan.md スコープ判断、ADR 対象外)」に統一する（L154 に合わせる）。あるいは single-file/toolbar の判断を ADR 化したいなら ADR-001 とは別の ADR-003 を起こす。いずれにせよ L29/L30/L154 の参照先を一致させること。

- **[P-002]** ingestion 側の `DROPZONE` インライン定義は実際には 2 箇所存在し（`UploadForm.tsx:30` と `UploadDialog.tsx:58`、文字列は完全一致）、計画の「2 つ目の consumer（editor）が生まれる」「UploadForm.tsx にインライン定義」という前提が事実と異なる。共有化スコープから `UploadDialog.tsx` が漏れている。
  - 理由: 計画・ADR-001 の中核根拠は「2 つの divergent な upload UI を重複させない」「繰り返すユーティリティは共有定数へ」。ところが `UploadForm.tsx` の DROPZONE のみを `common/styles.ts` へ移設し `UploadDialog.tsx` の同一インライン定義を残すと、editor 移設後に「共有定数を使う consumer 2（UploadForm/editor）＋インライン重複 1（UploadDialog）」という新たな不整合が生まれ、移設の正当化根拠（重複排除）を自ら裏切る。plan.md L40/L41/L60、ADR-001 L19 の「現状 UploadForm.tsx にインライン定義」という記述も不正確。
  - 提案: Step 3 の対象に `app/components/ingestion/UploadDialog.tsx` を追加し、3 箇所（UploadForm / UploadDialog / editor）すべてを共有 `DROPZONE` へ収斂させる。リスク欄の「DROPZONE 移設の回帰」確認に `UploadDialog`（および対応テスト/スナップショット）も含める。スコープ「含まれないもの」の「UploadForm から…移設するのみ」の記述、および調査結果の「UploadForm.tsx にインライン」表現も「ingestion の 2 consumer」に訂正する。

#### 改善提案（検討推奨）

- **[S-001]** AC-2 の「preview before/while uploading」に対し、選択即アップロード（auto-upload）か明示確認ステップかが Step 5（L128「要決定」）で未確定のまま。
  - 理由: Issue AC#2 は「before/while uploading」で while のみでも満たすが、mock（Step 1）でどちらを描くかが AC-2/AC-7 の合否を左右する。計画は「選択即アップロードで preview を uploading 中に併記」を暫定案にしているので、mock 確定時点でこの方針を mock と AC-2 の文言（“before/while”のどちらを満たす設計か）に明記しておくと、実装-mock-AC の三者の整合検証がぶれない。

- **[S-002]** AC-2 が「動画/その他はアイコン」、AC-3 が「対応外=alert-error / サイズ超過=alert-warning」と Issue 本文より具体化している点は良い詳細化だが、Issue が明記していない追加要素なので、mock（Step 1）でこの粒度を必ず描き AC-7 の「mock 一致」と齟齬が出ないようにすること。
  - 理由: AC の具体化自体は検証可能性を上げる良い動き。ただし「Issue に無い具体」を AC に書いた以上、mock 側がそれを描かないと AC-2/AC-3 と AC-7 が相互に食い違う。Step 1 のチェックリストに「video/その他アイコン」「alert-error/alert-warning の出し分け」を明示するとよい。

#### 良い点

- AC 表に「由来（Issue AC 番号 / ingestion パターン）」列と「対応ステップ」列を持ち、要件→基準→実装ステップのトレーサビリティが明確。8 AC すべてに由来とステップが紐づいている。
- Issue の Design questions 3 点・Scope 3 点を、AC だけでなく独立した「含まれないもの」「ADR」で**スコープ判断として明示**しており、暗黙のスコープ漏れがない。
- props 契約（`{contentHtml, onInsert, disabled}` と `onInsert` シグネチャ）の固定を AC-5・リスク欄・各ステップで一貫して強調し、NoteEditor 3 経路への波及を非破壊に保つ設計が筋が通っている（実コードの mode 非依存設計と一致）。
- ADR-002（`BYTE_SIZE_MAX` を export して client/server 検証上限を SSOT 化）は実コード（`schema.ts:4` の未 export 定数）と整合し、「クライアントで弾いた＝サーバーでも弾かれる」という検証可能な不変条件を与えている。スコープも「ロジック変更なし・export 公開のみ」と最小。
- ObjectURL リーク・mock 二重メンテ・a11y 二重読み上げなど、UI 刷新で典型的に漏れる落とし穴をリスク欄で先取りしている。
- スコープ外（multi-file / toolbar 配線 / server-domain-usecase-adapter 不変）の線引きが具体的で、スコープクリープは見当たらない。
