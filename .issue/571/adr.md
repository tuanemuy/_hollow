# ADR — Issue #571: P21 プロフィール拡充

## ADR-001: `lastSavedAt` に User の `updatedAt` を射影する

### Status
Accepted

### Context
モックの action-row には「最終保存: {タイムスタンプ}」表示がある。これを実値で出すには保存時刻が必要だが、User entity には専用の `lastSavedAt` カラムが無い。選択肢:
- (a) `updatedAt`（あらゆる mutation で更新される）を `lastSavedAt` として DTO に射影する
- (b) profile 保存専用の `lastSavedAt` カラムを entity / adapter / migration に新設する

### Decision
(a) を採用。`UserDTO.lastSavedAt` に `toInstant(user.updatedAt)` を射影する。profile mutation（changeAvatar/changeBio/changeDisplayName/changeUsername）でも `updatedAt` は必ず更新されるため、「最終保存」の意図と実用上一致する。(b) は entity/adapter/migration 拡張が必要でスコープ過大（#543 ADR-002 のスコープ分割方針に反する）。

### Consequences
- 良い点: backend 変更は DTO 射影1行のみ。虚偽表示にならない実値を出せる。
- トレードオフ: `updatedAt` は profile 以外の更新（email 変更・role 変更等）でも進むため、「最終保存」表示が profile を触っていなくても動く可能性がある。ただしモック文言が「最終保存」であり、profile 文脈で読めば実用上問題ない。DTO 上の名前を `lastSavedAt` とすることで消費側の意味を明確化する。

---

## ADR-002: avatar 表示は `/media/<id>` 既存リダイレクト経路を使う（Page server で presigned URL を注入しない）

### Status
Accepted

### Context
avatar 画像を表示するには download URL の解決が必要。選択肢:
- (a) `<img src="/media/{avatarMediaId}">` で既存の 302 リダイレクト経路（`app/routes/media/$mediaId.tsx` → R2 presigned URL）を辿る
- (b) Page server component で presigned URL を解決し、prop として `<img>` に注入する

### Decision
(a) を採用。`downloadMedia` の認可は owner に自分の asset を**状態非依存で無条件許可**する（`MediaService.assertViewableBy`）ため、`/media/<id>` で owner 自身の avatar（finalize 済み pending 含む）を表示できる。これは note 本文画像と同一パターン（既存 ADR-009 相当）。

### Consequences
- 良い点: pending（未保存・finalize 済み）avatar も同経路でプレビュー可能。Page server での URL 解決・prop 追加が不要。
- トレードオフ: (b) は presigned URL の短命 TTL（約60秒）と loader キャッシュ（`staleTime`）が衝突し、期限切れ URL を配るリスクがあるため不採用。

---

## ADR-003: avatar の削除・確定はフォーム保存に統合する（即時 API を呼ばない）

### Status
Accepted

### Context
avatar のアップロード/削除を、即時に別 API で User に反映するか、profile フォームの「保存」に統合するか。

### Decision
フォーム保存に統合。アップロードは presign→PUT→finalize までを選択直後に実行して pending `mediaId` を得るが、User への紐付け（`changeAvatar`）と削除（旧 avatar の ref decrement）は profile フォーム submit 時に `avatarMediaId` を tri-state（変更なし=omit / 設定=id / 削除=null）で `updateProfile` に送り、既存の swap ロジックに委ねる。

### Consequences
- 良い点: モックの action-row（保存/リセットが avatar も含めて1まとまり）と整合。「リセット」で avatar 変更も取り消せる。トランザクション境界が1つに保たれる。
- トレードオフ: アップロード後に「保存」を押さず離脱すると avatar は反映されない。ただし finalize 済み未参照 asset は `refCount=0` の pending として PurgeOrphans が後で回収するため安全。pending preview を視覚的に明示してユーザーに保存が必要なことを伝える。

---

## ADR-004: avatar 推奨サイズヘルプの client バリデーション境界

### Status
Accepted

### Context
モック文言は「推奨: 正方形 512×512px 以上、PNG または JPEG、5MB まで。」。#543 ADR-004（虚偽表示禁止）は「ヘルプと実挙動の厳密一致」を要求するが、backend の `enforceUploadLimit` は avatar 専用上限を持たず instance settings の `maxNoteBytes` 基準で、5MB と一致する保証がない。どこまで client で強制するかを確定する必要がある。

### Decision
- **形式（PNG/JPEG）: hard reject** — `accept` 属性 + 選択後 MIME 再チェックで非対応形式を弾く。
- **サイズ（5MB）: hard reject** — `file.size > 5MB` を client で弾く。backend より厳しい guard だが、虚偽表示にはならない。
- **寸法（512px 以上・正方形）: soft（推奨のみ）** — 強制せず表示のみ。文言が「推奨:」始まりのため虚偽にならない。

### Consequences
- 良い点: 「PNG または JPEG」「5MB まで」を client 強制で裏付け、ADR-004 に適合。寸法判定の過剰実装を避ける。
- トレードオフ: 寸法は強制しないため 512px 未満でもアップロード可能だが、「推奨」表記なので表示と挙動は矛盾しない。

---

## ADR-005: btn-sm はトークン由来の `pillBtn` + `pillBtnSm` で表現する（モックの literal px を持ち込まない）

### Status
Accepted

### Decision
モックの `.btn-sm`（`height:32px; padding:0 14px; font-size:13px`）と `.btn-sm.danger-text` は、既存の `common/styles.ts` プリミティブ `pillBtn` + `pillBtnSm`（`data-[sm]:h-7 px-3 text-xs`）/ `pillBtnGhostDanger` の合成で表現し、`BTN_SM` / `BTN_SM_DANGER` として `identity/styles.ts` に集約する。モックと数 px の差は出るが、CLAUDE.md の「literal px の新規持ち込みを避け、トークン由来 utility に集約」方針を優先する。avatar 80px 円は token utility `w-20 h-20` で表現でき、グラデーションは `layout/styles.ts` AVATAR と同じ `from-[#c9d3df] to-[#8e99a8]`（既存の literal hex 前例）を流用する。

### Consequences
- 良い点: 既存 pill primitive を再利用し、サイズ/danger variant の生成順問題（#416/#442 ADR）を既存解で回避。新規 literal px ゼロ。
- トレードオフ: モックの `btn-sm`（h-8）と実装（h-7）で 4px の高さ差。視覚的に許容範囲で、トークン整合を優先。

---

## ADR-006: リセットは uncontrolled な表示名/自己紹介を ref で初期値へ復元する

### Status
Accepted

### Context
表示名・自己紹介は既存実装で `defaultValue` を用いた uncontrolled input。リセットボタンで「未保存の変更を初期値に戻す」には、これらを制御コンポーネント化するか、ref で命令的に戻すかの選択がある。

### Decision
ref（`displayNameRef` / `bioRef`）で命令的に `value` を初期値へ戻し、bio カウンタ state と avatar pending state を同時にリセットする。input を制御化しない。

### Consequences
- 良い点: 既存の uncontrolled + `defaultValue` 構造・テスト（`setNativeValue` 経由の input 検証）を壊さず、最小差分でリセットを実現。
- トレードオフ: ref 経由の命令的 DOM 書き換えが1箇所増えるが、フォームリセットという局所的用途に限定。

## ADR-007: 日付表示（最終保存 / 次に変更できる日付）はマウント後にクライアントのみ描画する

### Status
Accepted

### Context
`ProfileForm` は `"use client"` コンポーネントで SSR + hydration の両方で描画される。「最終保存」「次に変更できる日付」はインスタントを viewer のローカルタイムゾーンで整形し、かつ現在時刻と比較する。サーバー（Cloudflare Workers = UTC）と クライアント（ローカル tz, 例 JST）で出力が食い違い、ブラウザ検証で React の hydration mismatch（サーバー `2026年6月5日 14:30` vs クライアント `23:30`）が観測された。`new Date()`（now）も SSR 時刻と hydration 時刻でズレるため hydration 非安全。

既存の `NoteMetaPanel` は同じ `toLocaleString("ja-JP")` を使うが `"use client"` の無いサーバーコンポーネントで一度だけ描画されるため mismatch しない。client component の日付表示（`listSelectors`）は `Intl.DateTimeFormat().resolvedOptions().timeZone` を明示解決している。

### Decision
`mounted` フラグ（`useState(false)` + `useEffect(() => setMounted(true), [])`）を導入し、TZ・現在時刻依存の表示（最終保存タイムスタンプ、次に変更できる日付）を **マウント後にのみ描画**する。SSR と first client render はどちらも非表示で一致し、mismatch しない。マウント後にローカル整形された実値が現れる。

### Consequences
- 良い点: hydration mismatch を確実に解消。viewer の実ローカル時刻を表示でき（虚偽表示にならない）、TZ をハードコードしない。
- トレードオフ: マウント直後の1フレームのみ当該ヒントが非表示（メタ情報のため許容範囲）。静的な「ユーザー名は30日に1回まで変更できます。」は常時表示のまま。
