# ADR — Issue #158: P11 ノート履歴 (NoteRevision aggregate)

## ADR-001: Revision を独立 aggregate ではなく `Note` のサブエンティティ（履歴系列）とする

### Status
Proposed

### Context

Issue 本文には `NoteRevision aggregate` と書かれているが、DDD の集約境界として「独立した集約 (aggregate root)」にすべきか、それとも「Note 集約の不変履歴」として `notes` の付随リソースに留めるかで、整合性ルール・トランザクション境界・ライフサイクルが変わる。

候補:

- **A. Note の付随イミュータブル履歴（採用）** — `note_revisions` は `notes.id` を FK に持つ追記専用テーブル。Note 集約の `save` トランザクション内で同一 UoW で挿入される。Revision 自体には独立したライフサイクル（編集・状態遷移）が無く、純粋なスナップショット。
- **B. NoteRevision 独立集約** — 別 aggregate root として `NoteRevisionRepository` を持ち、`SaveNote` 後に別ユースケースで作る。エディタが「ある時点のスナップショット」を独立して保存/管理する。

### Decision

**A. 付随イミュータブル履歴** を採用する。

理由:
- Revision は **「Note のある時点の不変スナップショット」** であり、自律的なライフサイクル（独立した状態遷移、独立した整合性ルール）を持たない。集約は「不変条件で結ばれたデータの一塊」だが、Revision は単独で意味のある集約ではなく、Note に従属するエンティティ。
- 「保存と revision 作成は同じ責務」であるべき（後述 ADR-002 の方針）ため、別 aggregate にして UoW を分けると逆に整合性が崩れる（保存成功 / revision 失敗時の補償が必要になる）。
- `Note.save → Revision 挿入` を同一 UoW でアトミックに行うのが最も単純で安全。
- Issue 本文の "NoteRevision aggregate" は厳密な DDD 用語というより「履歴データの単位」を指すものと解釈する。spec/scenario/authoring.md の「差分があった行のみが履歴に乗る（将来拡張、MVP では最新版のみ）」という記述からも、付随的な扱いが期待されている。

### Consequences

- 良い点:
  - Revision 作成と Note 保存をアトミック化（同一トランザクション・同一 UoW）でき、不整合不能。
  - 別ポート (`NoteRevisionRepository`) を作る代わりに、`NoteRepository` を拡張するか、Note と同じ DB 移管で済む（簡潔）。
  - ドメインイベントを乱発しない（`note.saved` だけで済む。revision は Note の派生情報）。
- トレードオフ:
  - Revision の独立した検索・分析機能（履歴単独の集計・横断分析）を将来追加する場合、ポート設計を見直す必要があり得る。だが MVP の「閲覧・復元」ユースケースには影響しない。
  - 「集約」と呼ぶか「子エンティティ」と呼ぶかの言語的不一致が残る → spec/domains/note.md にドキュメントとして明記する。

---

## ADR-002: Revision 作成タイミングは「明示保存（SaveNote）ごと」に限定する

### Status
Proposed

### Context

Issue 本文に「保存ごとに revision を作成」or「時間/差分しきい値で作成」と書かれており、選択肢の決定が必要。

候補:

- **A. SaveNote 成功ごとに 1 revision（採用）**
- **B. SaveNoteDraft（自動保存）も含めて全保存で revision**
- **C. 時間しきい値（例 5 分以上経過した自動保存）**
- **D. 差分しきい値（例 N 文字以上の差分）**
- **E. ユーザーが明示的にスナップショットを作るボタン**

### Decision

**A. SaveNote 成功ごとに 1 revision を作成する** を採用する。SaveNoteDraft（自動保存）では作成しない。

理由:
- 自動保存（SaveNoteDraft）が走るたびに revision を作ると、数秒〜数分単位で行が増え、D1（SQLite ベースの容量制限あり）に対する書き込み圧力と肥大が深刻になる。
- 「保存」はユーザーが意図的に押すアクション（spec/scenario/authoring.md C5 で明記）であり、ユーザーの編集意図の「節目」を表すマーカーとして最も自然。
- 時間しきい値・差分しきい値は「いつ作成されるか」がユーザーから不可視で、UX として混乱を招く。
- spec/scenario/authoring.md C5「差分があった行のみが履歴に乗る」は将来の差分化最適化を示唆するが、MVP では full snapshot で良い（後述 ADR-003）。

将来拡張:
- 明示的なスナップショットボタン（候補 E）は別 Issue で追加可能。
- 自動保存にも履歴を残したい要望が出た場合は、SaveNoteDraft でも作成する切り替えを `instance_settings` に追加できる。

### Consequences

- 良い点:
  - 書き込み量がユーザーの「保存」回数に等しく予測可能。
  - ユーザーの意図と履歴が一致し、「あの時の版に戻したい」というメンタルモデルと合う。
  - 同時編集衝突（後勝ち上書き）の救済として、上書き直前の版が必ず履歴に残る（C6 の「直近の自動保存版を提示」とは別の救済経路）。
- トレードオフ:
  - 自動保存後で「保存」を押さずにブラウザを閉じたケースは履歴に残らない（が、SaveNoteDraft も Note 本体は更新するので、データ消失ではない）。
  - 「いま履歴を取りたい」というワンクリック保存 UX が無い → 既存の「保存」ボタンが兼ねる形。

---

## ADR-003: Revision はフル・スナップショット方式（差分方式ではない）

### Status
Proposed

### Context

各 revision を「フル本文を持つスナップショット」とするか、「直前との差分のみ」とするか。

候補:

- **A. フル・スナップショット（採用）** — `note_revisions.content_html` などに保存時点の全フィールドをそのまま入れる。
- **B. 差分のみ（diff base）** — 直前 revision との差分のみ保存し、復元時に再構築。

### Decision

**A. フル・スナップショット** を採用する。

理由:
- 差分方式は「差分の連鎖が壊れたら全履歴が読めなくなる」失敗モードがあり、SQLite ベース D1 では特に怖い。
- ContentHtml は仕様上 1 MiB 上限。フル保存しても 1 revision あたり最大 1 MiB+α。SaveNote 頻度を見れば D1 容量で破綻するスケールではない（ユーザーあたり数千〜万 revision のオーダ）。
- 差分復元の実装コスト・テストコストが、MVP のスコープ「閲覧・復元」に対して過剰。
- spec/scenario/authoring.md C5 の「差分があった行のみ」は **UI 表示上の差分** を指すと解釈する（フル保存しておいて表示時に diff を計算）。

### Consequences

- 良い点:
  - 任意の revision を単独行から復元できる（連鎖不要）。
  - 障害時の影響範囲が 1 行に閉じる。
  - 実装が単純（差分アルゴリズムを持たない）。
- トレードオフ:
  - 行サイズが大きくなる → 容量制限（後述 ADR-004 の保持上限）で抑える。
  - HTML 差分表示（UI で「変わった行をハイライト」）は、レンダリング時に都度計算する必要がある（MVP スコープ外）。

---

## ADR-004: 保持件数の上限を `instance_settings.limits` で管理し、超過分は古い revision から自動削除する

### Status
Proposed

### Context

履歴は積み増しの一方なので、上限ポリシーが必要。

### Decision

- **ノート単位の上限**: `instance_settings.limits.noteRevisionsPerNoteMax` を新設（既定: 50）。
- 上限を超えた状態で新しい revision が作られたとき、その同 UoW 内で **最古の revision を 1 行削除** する。
- 全体クォータ（ユーザーあたり、インスタンスあたり）は MVP では設けない。

理由:
- D1 容量を全体クォータで守ろうとすると「ユーザーごとの利用パターン」を考慮した複雑な制御が要る。ノート単位 N 件は単純で予測可能。
- 上限値は管理者が `instance_settings` 経由で調整できるべき。
- 同 UoW 内で削除することで「上限超えながら永続化される」状態を作らない。
- `AdminSettings.limits` ドメイン定義 (spec/domains/adminSettings.md) に新フィールドを追加するだけで済む。

### Consequences

- 良い点:
  - データ増加が予測可能（ノート数 × N）。
  - 管理者が運用時にチューニング可能。
- トレードオフ:
  - 「もっと古い版に戻りたい」ユーザーの要望には応えられない → UI 上で「N 件まで保持」を明示する。
  - 削除はソフトデリートではなく物理削除（履歴の履歴を持たない）。

---

## ADR-005: 復元は「現在の本文を新規 revision として保存しつつ、対象 revision の内容を Note 本体に書き戻す」

### Status
Proposed

### Context

過去版を「復元」する操作のセマンティクスを決める必要がある。

候補:

- **A. 現在の本文を新規 revision として保存 → 過去 revision の内容を Note に書き戻す（採用）**
- **B. 過去 revision を「新しい revision」として再挿入する（履歴 chain 化）**
- **C. 過去 revision を Note 本体に直接書き戻す（履歴を残さない）**

### Decision

**A** を採用する。`RestoreNoteRevision` ユースケースは:

1. UoW 開始
2. 復元元 revision を取得
3. 現在の Note の本文・タイトル等を **新規 revision として作成・挿入**（誤復元のロールバックを可能にするセーフティネット）
4. Note 本体に復元元 revision の内容を `Note.updateContent` 経由で書き戻し → save
5. UoW commit

理由:
- ユーザーの「誤って古い版を復元してしまった」というオペレーションミスから救済できる（直前の状態が必ず履歴に残る）。
- 「履歴」というメンタルモデルに合う（事象の連続として保持される）。
- C のように履歴を残さないと「復元」が不可逆になり、ユーザーが躊躇する。
- 編集ロックは `requireLock=false` で動作させる（復元はエディタ外からも実行できるべき）。ただし他者が編集中（live lock）のときは弾く。

### Consequences

- 良い点:
  - 復元のロールバックがそのまま「もう一度履歴から元の版を選び直す」で可能。
  - 履歴の整合性が常に取れる（飛び石にならない）。
  - `note.saved` Outbox event が発火するので Search / Publication 連携も自動で追従。
- トレードオフ:
  - 1 復元あたり Note 本体 + Revision 1 件の書き込みが発生する。
  - 履歴上限（ADR-004）に近い場合、復元のたびに最古が削除される。

---

## ADR-006: 履歴一覧・閲覧画面は P11 のサブビューではなく **専用ルート** とする

### Status
Proposed

### Context

Issue 本文に「履歴一覧画面（P11 サブビュー or 別ルート）」とある。技術的に決める必要がある。

候補:

- **A. 別ルート `/notes/$noteId/history` および `/notes/$noteId/history/$revisionId`（採用）**
- **B. P11 内のサブパネル（モーダル or 折り畳み）**

### Decision

**A. 別ルート** を採用する。

理由:
- 既存の P11 配下が `/notes/$noteId/{index,edit,export,publish}` という型をすでに採っており、「サブ機能 = 別ルート」が定着している（一貫性）。
- 履歴一覧 + 過去版閲覧は情報量が多く、モーダル UI に収まらない（diff 表示など将来拡張余地もある）。
- ディープリンク可能（「あの過去版」を URL で共有できる）。
- TanStack Router の loader でデータ取得をしやすい。

UI 設計:
- `/notes/$noteId/history` — 履歴一覧（更新日時、タイトル、誰が（MVP は所有者のみだが UserId は保持））。各行から `/notes/$noteId/history/$revisionId` へ。
- `/notes/$noteId/history/$revisionId` — 過去版の本文を read-only でレンダリング + 「この版に復元」ボタン。
- P11 の「履歴」ボタンは `/notes/$noteId/history` への `<Link>` に置き換え。

### Consequences

- 良い点:
  - 既存ルーティングパターンに沿う。
  - 履歴 UI を独立して拡張できる（diff 表示など）。
- トレードオフ:
  - ルート追加のオーバーヘッド（route 2 つ）。

---

## ADR-007: 保持上限の判定で `deleteOldestForNote(noteId, cap - 1)` を使う（D1 read-your-writes ギャップへの対応）

### Status
Accepted

### Context

実装段階で `D1UnitOfWorkProvider` の挙動（`PendingBatch` に積んだ書き込みは UoW 終了の `db.batch()` までコミットされず、その前の同 UoW 内の SELECT には反映されない）を確認した結果、`SaveNote` の流れで:

1. `noteRevisionRepository.insert(rev)` をバッファ
2. `countByNoteId` で件数を取得（← R3 はまだ見えない、commited count = 2）
3. `deleteOldestForNote(noteId, cap)` を呼ぶと、コミット済み行が 2 件しかないため、`stale.length (2) <= keepCount (2)` で削除 0 件
4. UoW commit 後、R1/R2/R3 が揃って 3 件になる（cap=2 を超過したまま）

という off-by-one が発生する。

### Decision

`deleteOldestForNote(noteId, cap - 1)` を呼ぶ。

判定ロジック自体は `if (count + 1 > cap)` でこれまで通り（commit 後の見込み件数）。pending な insert を考慮し、コミット済み行を「`cap - 1` まで」削る。commit 時に新規 insert が +1 されて合計 `cap` で揃う。

### Consequences

- 良い点:
  - 既存の `D1UnitOfWorkProvider` 設計（read-your-writes なし）を破らない。
  - 挙動が予測可能（`SaveNote` 1 回あたりちょうど 1 件まで pending 行を考慮する）。
- トレードオフ:
  - 「pending 行 +1 を考慮する」というロジックが暗黙的。`saveNote.ts` / `restoreNoteRevision.ts` 双方にコメントで明示する。
  - 将来的に「同 UoW 内で複数 revision を insert する」操作（ありうるとすれば一括復元のような新ユースケース）を追加するときは、+N 補正に書き換える必要がある。本 Issue のスコープでは 1 操作 = 1 revision なので問題なし。



## ADR-008: 履歴ルートを `history/route.tsx` (Outlet) + `history/index.tsx` + `history/$revisionId.tsx` の3層に分割

### Status
Accepted（manual-test で発覚した routing バグの修正）

### Context

実装初版では `app/routes/notes/$noteId/history.tsx`（履歴一覧）と `app/routes/notes/$noteId/history/$revisionId.tsx`（過去版詳細）を併存させた。TanStack Router のファイルベースルーティングでは、`history/` ディレクトリ配下に子ルートを置くと `history.tsx` が **親ルート扱い** になり、その component は `<Outlet />` を含む必要がある。

しかし `history.tsx` は `Route.useLoaderData()` を return するだけで `<Outlet />` を出していなかったため、`/notes/$noteId/history/$revisionId` に遷移しても child route の component が描画されず、親一覧のままになる現象が manual-test (TC-05/06/E5) で観測された。

### Decision

既存パターン `app/routes/exports/route.tsx + index.tsx + $jobId.tsx` に揃え、以下の 3 ファイル構造に分割する:

- `history/route.tsx` — Outlet レイアウト（layout component）。route id は `/notes/$noteId/history`
- `history/index.tsx` — 履歴一覧。route id は `/notes/$noteId/history/`（trailing slash 付き、index match）
- `history/$revisionId.tsx` — 既存のまま

### Consequences

- 良い点:
  - 既存の export 機能と同じレイアウトパターンに揃い、認知的負荷が下がる。
  - 親レイヤと leaf レイヤの責務が明確に分離される。
- トレードオフ:
  - ファイル数が 1 つ増える（route.tsx 追加）。

## ADR-009: RSC コンポーネント内で `throw notFound()` ではなくインライン JSX を返す

### Status
Accepted（manual-test で発覚した既知制約の踏み抜き修正）

### Context

E5 (存在しない revisionId で 404) を検証した際、定義した `notFoundComponent`「過去版が見つかりません」ではなく `errorComponent`「エラーが発生しました」が表示された。

TanStack Start の現バージョンでは、`renderServerComponent` 経由で実行される RSC コンポーネント内で投げた `throw notFound()` が route の `notFoundComponent` に届かず、通常の error として errorComponent に流れる挙動が確認されている（`app/components/export/ExportJobDetail/Page.tsx` 内のコメントで既知の制約として記録済み）。

### Decision

`NoteRevisionDetail.tsx` および `NoteHistoryList.tsx` で `isNotFoundError(e)` を catch した際、`throw notFound()` ではなく **インライン JSX (`<article role="alert">...</article>`)** を直接 return する。route 側の `notFoundComponent` 定義は親レイヤ用の保険として残す（TanStack Router 自体が投げる 404 は拾える）。

`ExportJobDetailPage` で確立されたパターンに従う。

### Consequences

- 良い点:
  - エンドユーザーには正しい「過去版が見つかりません」/「ノートが見つかりません」メッセージが表示される。
  - 既存パターンと一貫している。
- トレードオフ:
  - 各 RSC コンポーネントが notFound の UI を持つことになり、表記揺れリスクがある。表記は spec に揃える。
  - TanStack Start 側で notFound 伝搬が修正された場合は逆移行する必要がある（その時点で見直す）。
