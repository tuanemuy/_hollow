# ADR — Issue #670: loader データを seed にするフォームが invalidate 起因の再マウントで編集内容を失う

## ADR-001: 防御機構は Step 0 の再マウント実証後に、代替 (a)(b)(c) から最小のものを選ぶ

### Status
**Superseded by ADR-003（Step 0 実証で再マウントが再現せず、機構は不採用）**

### Context
#669 はエディタールートを `routerInvalidate` から常時除外する方式（`.issue/669/adr.md` ADR-003）を採った。ただしこれは「エディタールートを invalidate する正当なケースが構造的に存在しない」（loader は seed 専用 / `staleTime: 0` で再進入時に必ず fresh load）という不変条件に基づく**予防的整理（precaution）**であり、「生 invalidate が NoteEditor を remount して state を破壊することを実測した」結果ではない。

実証された事実は次のとおり（一次情報で確認済み）:
- `.issue/669/manual-test/results/analysis.md`: 実測されたフォーカス喪失（TC-007）の真因は **InlineEditor 内部の `host.replaceChildren()` による DOM 全再構築**であり、「autosave / invalidate ではない」。
- `.issue/669/adr.md` ADR-003 末尾「実測による前提の補正（TC-009）」: rule 2 の生 invalidate 後も**未保存編集は維持された**。loader 再実行は同一インスタンスへの props 更新で済み seed-once が効いた。
- `noteEditorSeedOnce.test.tsx`: seed-once 契約は「**生 `router.invalidate()` がエディターを remount する経路はカバーしない（できない）**」と明記。

したがって「invalidate → RSC ツリー差し替え → 再マウント → state 喪失」は #669 では**実証されていない命題**である。TanStack Start の RSC loader 再実行が leaf サブツリーを reconcile するか remount するかは要素の type/key 同一性次第で、同型・同位置なら reconcile されうる。

本 Issue の対象3ルート（`/_app/settings/prompts`, `/admin/prompts`, `/_app/views`）はルート除外不可（保存後の最新値再表示が受け入れ条件）だが、そもそも再マウントが起きるかが未確定。さらに個人 prompts は本番 `staleTime: Infinity` のため invalidate されても loader 再実行されない可能性が高く、3ルートで挙動が非対称になりうる。

### Decision
1. **Step 0（ハードゲート）で再マウントを実測**する。3フォームを編集中に本番相当の invalidate（UploadDialog 完了 → `routerInvalidate`）または忠実な再現を発火させ、mount カウンタ ref で remount か reconcile かを判定し、入力・フォーカス・編集モードの保持有無を観測する。staleTime 差（個人 prompts=本番 Infinity / 管理・views=0）を区別して記録する。
2. **再マウントが実証された箇所のみ**、防御機構を入れる。機構は以下から**最も単純で副作用の小さいもの**を、実証された再マウント境界に応じて選ぶ:
   - **(a) state を再マウント境界の外側の安定コンポーネントへ引き上げる**（第一候補。最も React 的・リーク無し・命令的後始末不要）。
   - **(b) entity-id keyed な Context provider を境界外にマウント**（(a) を Context で実現）。
   - **(c) module-scope draft store**（最終手段）。採るなら CLAUDE.md「mutable state は単一外部リソースをカプセル化する adapter に限る」と整合する「単一 draft 退避リソースをカプセル化する client-only adapter」とし、client-only 保証（`"use client"`・サーバ非実行）／key 名前空間衝突回避／確実な GC を設計とテストで pin する。sessionStorage 退避（プロセス非共有・リロード耐性）も比較対象とする。
3. **全箇所で再マウントが実証されなければ**、防御機構・新ユーティリティは作らず、本 Issue は影響なしとしてクローズ提案する。

採用方式は Step 0 の結果（どこが再マウント境界か）を見てから確定し、**plan.md の機構記述と必ず一致させる**。

### AC-5（保存 → 最新値再表示）の担保形
命令的 reset 依存（reset 漏れ＝最新値が見えない退行）を避け、可能なら **`editing=false` に戻れば seed（loader 最新値）に追従**する宣言的不変条件で担保する API 形状を優先する。prompts は明示的 editing がないため、editing の定義（draft が seed と異なる間を editing とみなす等）を機構確定時にここで確定する。

### Consequences
- 良い点: 過剰設計（未実証の再マウントを前提にした重量級ユーティリティ）を避けられる。影響なしならクローズで完結。防御が要っても境界外引き上げ（a）なら CLAUDE.md 原則と整合しリークリスクが無い。
- トレードオフ: 防御を入れる場合「編集中に他クライアントが同一エンティティを更新 → invalidate しても自分の draft が優先され最新値が見えない」が生じうるが、これは編集中フォームの正しい挙動（保存時にサーバが最新で再評価）。表示専用フィールドは props 由来のまま追従。

### 旧 Decision（破棄）
旧 ADR-001 の「seed-once + 安定 key で再マウント耐性を実現」は破棄する。seed-once は再レンダーには強いが再マウントには無力で、key は同一親インスタンス内の再利用しか保証しないため、RSC ツリー差し替えで親ごと新インスタンス化する場合は防御にならない。逆に、そもそも再マウントが起きないなら（#669 TC-009 と同様）seed-once だけで足り key も store も不要。どちらに倒れるかは Step 0 の実証で決める。

---

## ADR-002: IngestionPreviewForm / PreviewPanel sample / 「新規」ViewFormDialog の扱い

### Status
Proposed

### Context
Issue 本文は対象を4箇所とするが、一部は本バグの影響を受けない、またはスコープ外と整理できる。

### Decision
- **IngestionPreviewForm: 変更しない（影響なし）。** `preview` は `job.preview`（UploadDialog の client state / ポーリング結果）由来でルート loader の RSC ペイロードではない。UploadDialog は `AppShellFrame` 常駐（`/_app`、`staleTime: Infinity` かつ `routerInvalidate` 除外）で leaf loader 再実行では再マウントされない。よって UploadDialog 完了の `routerInvalidate` でも IngestionPreviewForm は再マウントされず state を失わない。
- **PreviewPanel の `sample` 入力: スコープ外。** loader 由来でないユーザー入力であり、IngestionPreviewForm をスコープ外にした論理と同じ理由で text のみを対象とする。一貫性とスコープ膨張防止のため、保持対象としない。
- **「新規」ViewFormDialog（`NewViewButton`）**: `editView === null` で空文字 seed のため loader データを seed していない。本 Issue の主眼（loader データ＝既存値の喪失）には該当しない。Step 0 で `/_app/views` leaf 再マウントが実証され、かつ新規ダイアログがその境界内で再マウントされる場合に限り、**安定 id を持たないため固定文字列 key（`"new-view"`）の module-scope 共有は採らず**、可視性・入力を再マウント境界の外側の安定要素が所有する形（ADR-001 機構 (a)/(b)）で守る。固定 key の共有は複数同時新規・タブ間で衝突し、別閲覧で前回の開状態が復活する退行を招くため禁止。

### Consequences
- 良い点: スコープを「実際に loader-seed 喪失が起きる箇所」に絞り、過剰対応を防ぐ。
- トレードオフ: 新規ダイアログの扱いは編集ダイアログと非対称（id がない）。詳細は plan のステップで具体化する。

---

## ADR-003: Step 0 実証の結論 — 再マウント・編集内容喪失は再現せず、防御機構は不採用

### Status
Accepted（2026-06-13、実機検証）

### Context
Step 0（ハードゲート）を `pnpm dev` + agent-browser で実施。詳細は `.issue/670/step0-results.md`。各フォームに一時 mount プローブを仕込み、本番の `UploadDialog` 完了が呼ぶ `routerInvalidate(router)` と同一の router API・同一フィルタ（`_app`・エディタールート除外）を `window.__TSR_ROUTER__.invalidate({filter})` で忠実に発火し、focus を動かさず観測した。

実測（`/_app/views` SavedViewRow ×3 / `/admin/prompts` PromptCard ×5、いずれも `staleTime:0`）:
- **再マウントは起きない**（mount プローブが "1" のまま）。
- **編集内容（入力 value）は保持される**（seed-once `useState` は reconcile で初期値引数を無視するため）。
- **DOM ノードは同一・同位置・document 内に残留**（`__tag` プロパティ残存・親/index 不変）。
- コントロール（invalidate 無しの focus + 待機）では focus 保持。
- 個人 prompts は本番 `staleTime: Infinity` で loader 再実行されない可能性が高く、さらに安全側。コンポーネント構造（seed-once `useState`・再seed effect 無し・invalidate で変わる key 無し）は3ルート共通。

### Decision
1. **防御機構 (a)/(b)/(c) は実装しない。** Issue 本文・plan・ADR-001 が想定した「invalidate 起因の**再マウント**で**編集内容を失う**」はどのルートでも再現しない。3ルートは `Route.useLoaderData()` が `renderServerComponent(...)` の RSC ペイロードを返す同一パターンで、loader 再実行は client component を reconcile するだけで再マウントしない（#669 TC-009 と同一機序）。機構を入れることは plan が最大リスクとした「Step 0 を飛ばした過剰設計」に当たる。ADR-001 は本 ADR に supersede される。
2. **本 Issue #670 は「影響なし（no-repro）」としてクローズ提案する。** 新ユーティリティ・コンポーネント改修・テストは追加しない。成果物は本 Step 0 実証記録のみ。
3. **別症状「invalidate でフォーカスが外れる（入力内容は残る）」は別 Issue で追跡する。** mount もせず DOM ノードも同一のまま focus だけが失われる（React の RSC ペイロードコミット時の一時 detach/再 attach が原因と推定）。これは state 喪失ではないため (a)/(b)/(c) では直せず、focus 退避/復元 or ルート描画構造の見直しという別アプローチが要る。重篤度は低い（入力内容は保持され、バックグラウンド invalidate がフォーカス中に重なった時だけカーソルが外れる）。ユーザー判断により #670 のスコープ外として別 Issue 化。

### Consequences
- 良い点: 未実証の再マウントを前提にした重量級ユーティリティ（module-scope 可変 store 等）を作らずに済み、CLAUDE.md のステートレス志向と整合。Issue が許容する「影響なしならクローズ」で完結。
- トレードオフ: フォーカス喪失という実在の UX 劣化は #670 では未修正のまま残るが、別 Issue で正しい原因（DOM 再 attach）に対して対処する。入力内容が保持されるため即時の致命性はない。
