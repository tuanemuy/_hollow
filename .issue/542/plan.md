# 実装計画 — Issue #542: 領域3「整理・公開管理」(P17/P18/P14) のモック実装追従

**Issue:** #542
**作成日:** 2026-06-07
**複雑度:** 中〜大規模

---

## 目的

#510 で確定した領域3「整理・公開管理」のデザインモック(SSOT)に、既存のフロントエンド実装を精緻に追従させる。対象は P17（ゴミ箱）/ P18（タグ運用 + マージダイアログ）/ P14（公開設定）。新規の大規模機能追加ではなく、既存実装をモックの見た目・体験へ揃える差分作業。

## スコープ

### 含まれるもの

- **P17 ゴミ箱**: 保存期間案内の独立カード化、完全削除確認ダイアログの `.alert` 追従（削除対象名の赤アラート + 取消不可文）
- **P18 タグ**: 行アクションの hover/focus 表示 + 狭幅ケバブ化、ボタンのサイズ/バリアント追従、inline rename ブロックの見出し + accent-surface 背景、削除確認の対象名表示
- **P14 公開設定**: ラジオカードの説明文追加、「公開時の URL」プレビュー（`publicNoteUrl` を thread）、最終アクセス表示（`lastAccessedAt` 利用）・コピーボタン・link-card レイアウト追従
- **共通**: `ConfirmDialog` を `.alert` パターンへ追従（P17/P18 共通、後方互換維持）
- 寸法・色はデザイントークン経由で当てる（リテラル px の新規持ち込みを避ける）

### 含まれないもの（モックに無い / backend 非対応 / 別Issue引き渡し）

- **P17**: 一括操作 / フィルタ / ソート — モック `P17-trash.html` に存在せず（個別の復元/完全削除 + 確認ダイアログのみ）、backend 非対応。Issue本文の追従ポイント列挙はモック確定前の文言。
- **P18**: 検索 / ソート / 最終使用列 / 統合進捗バナー — モックが明示的に「別Issue引き渡し」と注記。
- **P14**: QRコード — モックが明示的に「QR 未対応 → 別Issue引き渡し」と注記。
- **P14 未保存警告 alert（`.safety-check`）**: エディタの dirty 状態を `NoteActions` 配下のモーダル `PublishSettings` まで伝搬する経路が現状コードに無い（編集中状態は別系統の NoteEditor）。供給困難なため本Issueスコープ外とし ADR 化。`publicNoteUrl`/`lastAccessedAt`（供給可能で確定スコープ）と対比して判断の一貫性を ADR に明記する。

## 実装ステップ

### P17 ゴミ箱

#### 1. retention-note を独立カード化

- **対象ファイル:** `app/components/trash/TrashList.tsx`
- **変更内容:** `PAGE_SUBTITLE` を「{count} 件のノートがゴミ箱にあります。」に戻し、保存期間の説明を分離。subtitle 直後に `role="note"` の retention カードを追加（surface 背景・時計アイコン・太字導入文 + 補足）。寸法は全てトークン対応ユーティリティで当てる。
- **理由:** モックは案内を独立カードで提示するが、現状は subtitle に平文混在で視覚階層が乖離。

#### 2. ConfirmDialog を ALERT パターンへ追従（P17/P18 共通）

- **対象ファイル:** `app/components/common/ConfirmDialog.tsx`
- **変更内容:** 任意の `subject?: string`（赤アラートに出す対象名）プロパティを追加。渡されたら description 上に `ALERT`+`ALERT_ERROR`（白地 + error 枠 + アイコン + `ALERT_TITLE`「削除対象」+ `ALERT_BODY` に対象名）を描画。「この操作は取り消せません。」は `<strong>` で強調（`ALERT_BODY` の `[&_strong]:` で表現）。`subject` 未指定時は従来挙動を維持（後方互換）。
- **理由:** P17 モックは確認ダイアログ内に削除対象を示す赤アラート + 取消不可の太字を持つが、現状は warning アイコン + プレーン文のみ。`.alert` 統一原則（index.md）にも沿う。
- **注意:** 現状は見出し横に `AlertTriangle`(warning) アイコンがある。**`subject` 指定時は見出しの warning アイコンを抑制**し、error alert 内アイコンとの二重表示を避ける（モックの確認ダイアログ見出しにアイコンは無い）。既存全呼び出し（trash purge / tag delete / discard 系）の見た目回帰を確認。
- **a11y:** `subject` の赤アラート用 id を `aria-describedby`（現状 `descId`/`errorId` を織り込む、ConfirmDialog L73-79）に追加し、SR が削除対象名を読み上げるようにする。`role="alert"`（assertive）は二重読み上げに注意。

#### 3. TrashRowActions の確認ダイアログに対象名を渡す

- **対象ファイル:** `app/components/trash/TrashRowActions.tsx`, `app/components/trash/TrashList.tsx`
- **変更内容:** `TrashList` から `title` を prop で渡し、`ConfirmDialog` に `subject={noteTitle}` を渡す。`description` は「このノートを完全に削除しますか？**この操作は取り消せません。**」へ。
- **理由:** モックの赤アラートに削除対象名を出すため。

### P18 タグ

#### 4. タグ行アクションを hover/focus 表示 + 狭幅ケバブへ

- **対象ファイル:** `app/components/tag/TagList.tsx`, `app/components/tag/TagActions.tsx`, `app/components/tag/styles.ts`
- **変更内容:** アクション列を `opacity-0` + `group-hover:opacity-100` + `group-focus-within:opacity-100`（モック `.list-row-actions-hover`）で hover/focus 表示に。`<li>` に `group` 付与、`motion-reduce:transition-none` 付き。**狭幅（`max-lg:` = モック `@media (max-width: 1023px)`、P18-tags.html L459-473 で確認済み）** ではアクション列を隠してケバブメニュー（共通 `Menu`/`MenuItem` プリミティブ）を表示、削除は `data-danger` で error 表示。同じ `max-lg:` で **件数（`tag-count`）も非表示**（モック L471）。最狭幅（`max-sm:` = モック `@media (max-width: 639px)`）でケバブのタップターゲット 44px を確保。繰り返しユーティリティは `tag/styles.ts` に hoist。
- **理由:** モックはアクションを hover 表示・狭幅でケバブに畳む設計。現状は常時表示で乖離。
- **注意:** inline rename 中はアクションを常時表示のまま（モック L476 `.tag-editing-block .list-row-actions { display: flex !important; }` — 編集ブロックは hover/ケバブ非依存で常時表示）。a11y（roving tabindex）は既存 Menu が担保。**「統合」は候補ゼロ時に非表示という既存仕様（TagActions.tsx L106-115 `candidates.length > 0`）をケバブメニュー項目側にも引き継ぐ**こと。
- **マージダイアログ（P18-merge-tag-dialog.html）:** 既存 `MergeTagDialog` が progressbar・説明文・disabled までモック相当を実装済み。**本Issueでは変更なし**（確認のみ）。

#### 5. タグ行ボタンのサイズ/バリアントをモックへ

- **対象ファイル:** `app/components/tag/TagActions.tsx`
- **変更内容:** リネーム/統合の `pillBtn` に `pillBtnSm`（`data-sm=""`）を付与し `btn-xs` 密度へ。削除を `pillBtnDanger`（常時赤）→ `pillBtnGhostDanger`（transparent → hover error）に変更。
- **理由:** モックのリネーム/統合は小型 surface ボタン、削除は ghost-danger。現状はサイズ過大 + 常時赤塗り。

#### 6. inline rename ブロックのコンテキスト見出し + 背景

- **対象ファイル:** `app/components/tag/TagActions.tsx`（第一候補ではここで完結）
- **変更内容:** 編集状態で input の上に「#{name} をリネーム（{noteCount} 件のノートに反映）」の小見出し（`text-sm text-ink-tertiary`）を表示。編集行の背景を `bg-accent-surface`（モック `.tag-editing-block`）に。
- **方式（第一候補）:** モックの `.tag-editing-block` は `.list-row` を内包する外枠（背景は外枠、行は transparent）。**`TagActions` が自身の編集UI領域に accent-surface 背景を描くラッパ方式**を採る。これなら `isEditing` 状態を `TagList` 行へ持ち上げる必要がなく、`useOptimistic`（`optimisticTags.map`）と非干渉。
- **理由:** モックは編集ブロックに反映件数の案内 + accent-surface 背景を持つが、現状は input のみ。
- **注意:** どうしても行全体の背景が必要なら `data-[editing]:bg-accent-surface` で行 `<li>` に当てるが、状態持ち上げと optimistic 整合のコストが増すためラッパ方式を優先する。

#### 7. タグ削除確認に対象名を渡す（ステップ2の波及）

- **対象ファイル:** `app/components/tag/TagActions.tsx`
- **変更内容:** `ConfirmDialog` に `subject={`#${name}`}` を渡し、赤アラートにタグ名を表示。description は既存の「参照ノートからも除去され…」を維持。
- **理由:** 統一された確認体験。

### P14 公開設定

#### 8. ラジオカードに説明文を追加

- **対象ファイル:** `app/components/publication/PublishSettings/index.tsx`, `app/components/publication/styles.ts`（`RADIO_DESC` 追加）
- **変更内容:** 各ラジオ（private/unlisted/public）に `.radio-desc` 相当（`text-sm text-ink-secondary`）の説明文を `RADIO_CARD_TITLE` の下に追加。モック文言に追従。
- **理由:** モックは説明文付き、現状はラベルのみ。

#### 9. 「公開時の URL」プレビューを追加（確定スコープ）

- **対象ファイル:** `app/components/publication/PublishSettings/index.tsx`, `app/components/note/detail/NoteActions.tsx`
- **変更内容:** `NoteActions` が既に保持する `publicNoteUrl`（`/u/<username>/<slug>` 形式、NoteActions L47-48）を `PublishSettings` に prop で渡す（新規DTO追加不要）。公開ステータスセクション内（更新ボタン前）に、public 選択時に「公開時の URL」見出し + `publicNoteUrl` を表示。
- **URL_PREVIEW の扱い:** `publication/styles.ts` に `URL_PREVIEW`/`URL_PREVIEW_LABEL`/`URL_PREVIEW_URL` が既存（L66-72、発行リンク一度きり表示用）。着手時にモックの `.url-preview`（公開時URL）と発行リンク box が同一サーフェスか確認し、同一なら既存 `URL_PREVIEW` を再利用、別物なら新規定数を起こす（`LINK_URL` JSDoc の「2つは別サーフェス」前提に注意）。
- **理由:** モックは公開ステータスに常設URLプレビューを持つが、現状は「発行リンク一度だけ表示」用途のみ。
- **注意:** モックの公開URLは `https://hollow.example/yumenaut/<slug>` 形式だが、実装は `/u/<username>/<slug>`。プレビューには実装の `publicNoteUrl` をそのまま使い、モックの表記差は無視する。

#### 10. 安全性アラート（未保存の変更）— スコープ外（ADR化）

- **判断:** モックの `.safety-check` warning alert（「未保存の変更があります」）は、エディタの dirty 状態を別系統の `PublishSettings`（NoteActions 配下モーダル）まで伝搬する必要がある。現状の loader/props 経路に未保存フラグの供給線が無く、供給は非自明。**本Issueではスコープ外とし adr.md に記録**（P14 で唯一供給困難な項目。ステップ9/11 の供給可能項目と対比して判断の一貫性を明記）。

#### 11. link-card レイアウト + 最終アクセス + コピーボタン（確定スコープ）

- **対象ファイル:** `app/components/publication/PublishSettings/index.tsx`, `app/components/publication/styles.ts`
- **変更内容:** `ShareLinkRow` をモックの `link-card` 構造（head 行: 有効チップ + 最終アクセスを `ml-auto`、その下に URL 行 + コピー `icon-mini`）に寄せる。コピーは `navigator.clipboard`。最終アクセスは `ShareLinkDTO.lastAccessedAt: Instant | null`（dto/publication.ts L31）が既存なので、`null` でない場合のみ `formatDate` 流用で表示（`null`=未アクセスは非表示）。
- **理由:** モックの link-card はチップとURLを別行に分け、最終アクセス・コピーを持つ。
- **注意:** QR は明示的にスコープ外（モック注記準拠）。`formatDate` は `app/components/note/list/listSelectors.ts` L20 にあり、`publication/` から直接 import すると note→publication のクロスドメイン import になる。純粋リーフ formatter なので実害は小さいが、着手時に「直接 import か共通フォーマッタへ寄せるか」を一言判断する。

## 設計判断

詳細は `adr.md` 参照。要点:

- **モックに無い機能・backend 非対応・別Issue注記のあるものはスコープ外**として明記（P17 一括操作/フィルタ/ソート、P18 検索/ソート/進捗バナー、P14 QR、P14 未保存警告 alert）。
- **供給可能性の確認結果**: P14 の「公開時URL」(`publicNoteUrl` が NoteActions に既存)・「最終アクセス」(`lastAccessedAt` が ShareLinkDTO に既存) は確定スコープ。「未保存警告」は供給経路が無く唯一スコープ外。
- **トークンの当て方**: 寸法・色は全て `tokens.css`→Tailwind utility で当て、リテラル px は新規に持ち込まない。既存 `pillBtnSm`/`pillBtnGhostDanger`/`ALERT*`/`URL_PREVIEW`/`menuItem` を再利用。
- **状態は data-* variant**: 編集中行背景・選択状態は条件付きクラス文字列でなく `data-[editing]:` / `has-[input:checked]:` で表現。
- **ConfirmDialog 後方互換**: `subject` は任意プロパティとし、既存呼び出しの見た目を壊さない。

## リスクと注意点

- **`ConfirmDialog` の共有変更**は trash purge / tag delete / discard 系すべてに波及。`subject` 未指定時は従来通りに保つことで回帰を防ぐが、全呼び出し箇所の目視確認が必要。`TagList.test.tsx` / `PublishSettings.test.tsx` の回帰確認。
- **P18 ケバブ導入**は DATA_ROW のグリッド列との両立、狭幅でのタップターゲット（44px）確保に注意。`max-lg:` で切替。
- **P14 の追従は DTO 供給に強く依存**。`ShareLinkDTO` / 公開URL構成 / 未保存状態の取得可否を実装着手時に確認し、不可能なものはスコープ外として ADR 化（過剰実装回避）。
- **optimistic 整合**: `TagList` の `useOptimistic` と行構造変更（group/ケバブ）・inline rename 状態の持ち上げが干渉しないこと。
- 各変更後に `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。

## テスト方針

- **静的検証**: `pnpm typecheck && pnpm lint:fix && pnpm format`。
- **ユニット**: 既存 `TagList.test.tsx` / `PublishSettings.test.tsx` の回帰確認。`ConfirmDialog` の `subject` に軽量テスト追加を検討。
- **ブラウザ手動/自動（manual-test スキル）**: ローカルサーバ起動 → 各画面でモックと突き合わせ。
  - P17: retention カード / 完全削除確認の赤アラート + 取消不可文 / 復元・完全削除動作。
  - P18: hover/focus でアクション表示・狭幅でケバブ / リネーム小型ボタン・削除 ghost-danger / inline rename 見出し + accent-surface / 統合ダイアログ。
  - P14: ラジオ説明文 / 公開時URLプレビュー / （供給可能なら）未保存 warning alert・最終アクセス・コピー。
- **レスポンシブ**: `base`/`sm`/`lg` で P18 のアクション表示↔ケバブ切替、タップターゲット 44px を確認。
- **モック突合**: 各変更で対象モックHTML・`index.md`・`tokens.md` を参照し、寸法・色がトークン経由で一致するか確認。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 2視点並列）

**修正した点**:
- 要件P-001 / アーキS-001: ステップ9「公開時URLプレビュー」を条件付きから**確定スコープ**へ格上げ。`publicNoteUrl` が `NoteActions` に既存（prop thread で供給可能）。モックの `/yumenaut/<slug>` と実装の `/u/<username>/<slug>` の表記差は実装値を採用。
- 要件P-002 / アーキS-002: ステップ11「最終アクセス」を条件付きから**確定スコープ**へ格上げ。`ShareLinkDTO.lastAccessedAt: Instant | null` が既存。`null` 時は非表示と仕様化。
- 要件S-002: ステップ4 に「狭幅（`max-lg`）で件数（`tag-count`）も非表示」を追記（モック L471）。
- 要件S-003 / アーキS-003補強: ステップ2 に「`subject` 指定時は見出しの warning アイコンを抑制」を追記（二重アイコン回避）。
- アーキ S-004: ステップ6 に「`TagActions` 完結のラッパ方式を第一候補」と明記（`useOptimistic` 非干渉）。
- アーキ P-002: ステップ9 に「`URL_PREVIEW` は既存（L66-72）。同一サーフェスか着手時確認し再利用/新規を判断」を追記。
- スコープ整理: ステップ10「未保存警告」を明確にスコープ外（ADR化）として独立記述。

**判定の訂正（モック実機確認）**:
- アーキ P-001（ケバブ切替を `max-sm` にすべき）は **却下**。`spec/design/pages/P18-tags.html` L459-473 を確認した結果、ケバブ表示・hover アクション非表示・`tag-count` 非表示はいずれも `@media (max-width: 1023px)`（= `max-lg`）で切り替わる。アーキレビュアーが参照した L288 `@media (max-width: 639px)` はケバブのタップターゲット 44px 確保の別ルール。よって計画の `max-lg:` が正しく、`max-sm:` は 44px タップターゲット用として併記。

**見送った提案とその理由**:
- なし（全指摘を反映 or モック実機確認で訂正）。

**両視点の総括**: スコープ膨張ゼロ、切り分け判断は SSOT と高精度で一致。要修正点は「条件付きスコープ外」とした項目が実は供給可能だった調査不足（P-001/P-002）とブレークポイント記述の精緻化のみで、いずれも反映済み。構造的問題なし。

### 2周目（要件カバレッジ / アーキ・リスク 2視点並列）

**両視点とも問題点ゼロで終了。** 1周目の反映（公開URL/最終アクセスの確定スコープ化、tag-count 非表示、ブレークポイント `max-lg` の判定訂正、未保存警告のスコープ外化、ラッパ方式、URL_PREVIEW 既存確認）がモック実機・実装コードと突き合わせて適切と確認された。

**取り込んだ改善提案**:
- 要件S-001: マージダイアログは既存実装がモック相当（本Issueでは変更なし・確認のみ）をステップ4に明記。
- 要件S-002: ケバブメニューで「統合」の `candidates.length > 0` 条件を引き継ぐ旨をステップ4に明記。
- アーキS-001: `formatDate` のクロスドメイン import を着手時判断する旨をステップ11に明記。
- アーキS-002: ConfirmDialog `subject` の `aria-describedby` 織り込みをステップ2に明記。

**終了理由**: 2周目で両視点とも問題点ゼロ。
