# ADR — Issue #542: 領域3「整理・公開管理」(P17/P18/P14) のモック実装追従

## ADR-001: P14 の追従項目はDTO/props供給可能性で取捨する

### Status
Accepted

### Context
P14 公開設定モック（`P14-publish-settings.html`）には「公開時のURLプレビュー」「限定公開リンクの最終アクセス表示」「未保存の変更があります警告（`.safety-check`）」の3つの情報依存UIがある。これらを実装するには、表示に必要なデータが現状のコンポーネント/loader/DTO から供給できる必要がある。モック自身も各所に「実装は…未対応 → 別Issue引き渡し」と注記しており、SSOT がスコープ分割を許容している。

### Decision
供給可能性を実コードで確認し、以下のとおり取捨する:

- **公開時URL** → 供給可能。`NoteActions`（`app/components/note/detail/NoteActions.tsx` L47-48）が既に `publicNoteUrl`（`/u/<username>/<slug>`）を保持し、同コンポーネントが `PublishSettings` を描画する。prop thread のみで供給でき新規DTOは不要。**確定スコープ。**
- **最終アクセス** → 供給可能。`ShareLinkDTO.lastAccessedAt: Instant | null`（`app/core/application/dto/publication.ts` L31）が既存。`ShareLinkRow` が `link: ShareLinkDTO` を受け取るため per-row でアクセス可能。**確定スコープ**（`null`=未アクセスは非表示）。
- **未保存警告** → 供給困難。エディタの dirty 状態は別系統（NoteEditor）にあり、`NoteActions` 配下モーダルの `PublishSettings` まで伝搬する経路が現状コードに無い。dirty 伝搬の新設は本Issue（モック追従）の範囲を超える。**スコープ外**（別Issueへ引き渡し）。

### Consequences
- 良い点: 過剰実装（dirty 伝搬機構の新設）を回避しつつ、供給可能な追従を確実にカバー。判断基準が「データ供給可能性」で一貫し、恣意的なスコープ切りを避けられる。
- トレードオフ: 未保存警告はモックにあるが本Issueでは未実装のまま残る。別Issueでの dirty 伝搬設計が前提。

---

## ADR-002: ConfirmDialog の `.alert` 追従は任意 `subject` プロパティで後方互換に行う

### Status
Accepted

### Context
P17 完全削除・P18 タグ削除のモックは、確認ダイアログ内に削除対象名を示す赤アラート（`.alert.alert-error`）+「この操作は取り消せません」太字を持つ。現状の共通 `ConfirmDialog` は見出し横の warning アイコン + プレーン description のみ。`ConfirmDialog` は trash purge / tag delete に加え discard 系でも共有されており、無条件にデザインを変えると無関係な呼び出しの見た目が変わる。

### Decision
`ConfirmDialog` に任意の `subject?: string` プロパティを追加し、渡されたときだけ description 上に `ALERT`+`ALERT_ERROR`（`ALERT_TITLE`「削除対象」+ `ALERT_BODY` に対象名）を描画する。`subject` 指定時は見出しの warning アイコンを抑制し二重アイコンを避ける。`subject` の id を `aria-describedby` に織り込む。未指定時は従来の見た目・挙動を完全維持する。

### Consequences
- 良い点: 破壊操作の確認だけを `.alert` 統一原則（index.md）に寄せられ、discard 系など他の呼び出しは無変更で回帰しない。新規プリミティブを増やさず既存 `ALERT*`（#539 基盤）を再利用。
- トレードオフ: `subject` を渡す/渡さないで見た目が分岐するため、呼び出し側の意図（破壊操作か否か）を明示する責務が増える。

---

## ADR-003: P18 タグ行アクションの狭幅切替は `max-lg`（モック実機準拠）

### Status
Accepted

### Context
タグ行アクションの hover/ケバブ切替のブレークポイントについて、レビューで `max-lg`（1024px 未満）と `max-sm`（640px 未満）の2案が出た。モックには `@media (max-width: 639px)`（タップターゲット用）と `@media (max-width: 1023px)`（表示切替用）の2つのメディアクエリがある。

### Decision
`spec/design/pages/P18-tags.html` を実機確認した結果、ケバブ表示・hover アクション非表示・件数（`tag-count`）非表示はいずれも L459-473 の `@media (max-width: 1023px)`（= `max-lg`）で切り替わる。L288 `@media (max-width: 639px)`（= `max-sm`）はケバブのタップターゲット 44px 確保の別ルール。よって**表示切替は `max-lg:`、タップターゲット確保は `max-sm:`** を採用する。

### Consequences
- 良い点: SSOT のメディアクエリと完全一致し、640-1023px 帯でモックと乖離しない。
- トレードオフ: 2つのブレークポイントを使い分けるため実装時に取り違えないよう注意が要る（plan.md に値を明記済み）。

---

## ADR-004: inline rename ブロックの背景は TagActions 完結のラッパ方式で表現

### Status
Accepted

### Context
モックの `.tag-editing-block`（accent-surface 背景）を実装するには、編集中行の背景を変える必要がある。`isEditing` 状態は現在 `TagActions` のローカル state で、行 `<li>`（`TagList`）に `data-editing` を立てるには状態を `TagList` へ持ち上げる必要がある。`TagList` は `useOptimistic` で楽観更新しており、状態持ち上げは optimistic との整合コストを生む。

### Decision
モックの `.tag-editing-block` が `.list-row` を内包する外枠構造であることに倣い、**`TagActions` が自身の編集UI領域に accent-surface 背景を描くラッパ方式**を第一候補とする。これなら状態持ち上げ不要で `useOptimistic` と非干渉。どうしても行全体背景が必要な場合のみ `data-[editing]:` で行に当てる。

### Decision（実装時の精緻化）
ラッパ方式の「状態を持ち上げない」原則は維持しつつ、モックの「編集ブロックが行全幅で accent-surface を持ち、行の `#name`/件数列が消える」見た目も満たすため、**CSS の `:has()` を使った宣言的アプローチ**を採った:

- `TagActions` の編集ブロックは `data-editing=""` を持ち、`[grid-column:1/-1]` で行グリッドの全幅を占める（accent-surface はこのブロックが描く）。
- 行 `<li>`（`TagList`）の `#name`/件数列は `group-has-[[data-editing]]:hidden` で、編集ブロックが存在するときだけ非表示にする。

これにより、`isEditing` 状態は完全に `TagActions` ローカルに閉じたまま（`TagList` へ持ち上げない）行全幅の背景・列差し替えを実現でき、`useOptimistic` とも非干渉。`has-[a[data-active]]`（`directory/styles.ts`）の前例どおり Tailwind v4 で生成され、`pnpm build` で CSS 生成を確認済み。

### Consequences
- 良い点: `useOptimistic` との干渉を回避し、状態の所在を `TagActions` に閉じたまま保てる。CLAUDE.md の data-* 規約とも矛盾しない（`data-editing` + `group-has-[…]` variant で表現、条件付きクラス文字列を使わない）。モックの行全幅 accent-surface も忠実に再現。
- トレードオフ: 行の列差し替えが `<li>` 側の `group-has-[…]` ルールと `TagActions` 側の `data-editing` の二箇所の暗黙的協調に依存する（JSDoc/コメントで明示済み）。

---

## ADR-005: P18 タグ行の小型ボタンはピル型（pillBtnSm）を維持しモックの rounded-sm に追従しない

### Status
Accepted

### Context
モック `P18-tags.html` の行アクション小型ボタン `.btn-xs` は `border-radius: var(--radius-sm)`（6px、角丸矩形）で base `.btn` の `rounded-pill` を明示的に上書きしている。一方、実装で再利用する共通プリミティブ `pillBtnSm`（`app/components/common/styles.ts`）は高さ/パディング/文字サイズのみを縮小し、radius は base の `rounded-pill`（980px、ピル型）を保つ。よって厳密にモック追従するとタグ行だけ rounded-sm 矩形になる。

### Decision
タグ行の小型ボタンはピル型（`pillBtnSm`）を維持し、モックの rounded-sm には追従しない。

- `pillBtnSm` は admin テーブル等、出荷済みアプリ全体で「ピル型の小型ボタン」として一貫使用されている。本画面だけ rounded-sm に変えると、アプリ全体の小型ボタン体系と不整合になる。
- `pillBtnSm` 自体に `data-[sm]:rounded-sm` を足すと全使用箇所に波及し本Issueのスコープを超える。タグ行専用に rounded-sm を後付けしても Tailwind の `rounded-pill`/`rounded-sm` はクラス記述順で勝敗が決まらず信頼できない。
- issue-implement のデザイン方針（既存の出荷済み見た目に馴染ませる）と plan.md ステップ5（`pillBtnSm` 指定）にも沿う。

### Consequences
- 良い点: アプリ全体の小型ボタン体系（ピル型）との一貫性を維持。新規プリミティブを増やさない。
- トレードオフ: 当該モックの literal な角丸形状（rounded-sm）とは差異が残る。色挙動（`pillBtnGhostDanger` ≒ `.btn-destructive`）・寸法（高さ・パディング）はモックと一致しているため、差異は角丸形状のみに限定される。
