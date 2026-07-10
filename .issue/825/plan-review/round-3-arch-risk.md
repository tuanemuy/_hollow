# Round 3 レビュー（最終） — アーキテクチャ整合性・実現可能性・リスク（Issue #825）

対象: `.issue/825/plan.md` / `.issue/825/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク
主眼: round-2 の最重要指摘（P-001 sticky/幅/role の移設・option B 除外、S-001 `surface === "edit"` ゲート維持）が技術的に妥当な形で反映されたか、sticky 移設案が実際に追従を壊さず AC-2（デスクトップ不変）と両立するか

---

## 総評

round-2 指摘は plan・adr の両方へ誠実かつ正確に反映されている。実コードで裏取りした結果:

- **P-001 反映（sticky/幅/role の外側ラッパー移設・option B 除外）**: `editorToolbar`（`styles.ts:54`）は実際に `sticky top-[calc(var(--header-height)+var(--space-2))] z-20 mb-4` + `self-start` + `max-sm:self-stretch max-sm:overflow-x-auto` を持ち、JSDoc も「a sticky pill that follows the scroll just below the app header」と明記。`editorToolbar` は `WysiwygEditor.tsx:550` の 1 箇所専用（grep 再確認済み）で、`role="toolbar" aria-label="書式"` もそこに載っている。親は `WysiwygEditor.tsx:515` の `flex flex-col`（`EditorContent` を含む背の高いコンテナ）。→ plan step 2 / ADR-001 の「sticky/mb-4/role を外側ラッパーへ移設、内側レールを非 sticky スクローラに降格、`editorToolbar` を styles.ts で分割」という前提・手順は**実コードと完全に一致**し、sticky 移設案は追従を壊さず成立する（外側ラッパーの containing block が背の高い `flex flex-col` のままだから）。option B 除外の理由（別行落ち）も妥当。
- **S-001 反映（装飾ゲートの `surface === "edit"` スコープ維持）**: `NoteEditor.tsx:311` の装飾ロスゲートは実際に `if (surface === "edit" && nextMode === "wysiwyg")` に限定され、コメントも「new-note surface keeps its pre-#696 behaviour (AC-6)」と明記。plan step 5（L147）が `proceedModeSwitch` 抽出時にこの条件分岐を「そのまま内包」と明示しており、正しく反映されている。
- 未保存確認の再構成（`window.confirm` at `NoteEditor.tsx:283` → `pendingUnsavedSwitch` + `proceedModeSwitch` の遅延遷移）は既存 `pendingWysiwygSwitch`/`confirmWysiwygSwitch`（L327-）と同型で、順序・二重プロンプト回避（AC-5）を保つ。

ただし、round-2 で導入された「幅の置換（`self-stretch` → `flex-1 min-w-0`）」の文言が **breakpoint 修飾子を欠いたまま plan・adr へ伝播**しており、そのまま実装するとデスクトップの pill が全幅化して AC-2（デスクトップ 1px 不変）を壊す。この 1 点のみ要修正として出す。それ以外はアーキ整合・実現可能性ともに問題なし。

---

#### 問題点（要修正）

- **[P-001] レール幅の置換 `self-stretch → flex-1 min-w-0` が breakpoint 未修飾のままで、デスクトップ pill が全幅化し AC-2 を壊す**
  - 問題: 現状 `editorToolbar`（`styles.ts:54`）の幅指定は **`self-start`（無修飾＝全 breakpoint、デスクトップの shrink-to-fit pill を成立させている）+ `max-sm:self-stretch`（モバイルのみ全幅上書き）** の 2 段構成。plan step 2.2 / ADR-001 point 2 / round-2 P-001 提案 2 はいずれも「`max-sm:self-stretch` を **`flex-1 min-w-0`** に置換」と書くが、**置換後の `flex-1 min-w-0` に `max-sm:` 修飾子が付いていない**。この文言どおりに置換すると、レールのクラスは `self-start … flex-1 min-w-0`（`flex-1` 無修飾）になる。移設後の外側ラッパーは `flex flex-col` の子として cross 軸 stretch でデスクトップでも全幅になり、その中でレールが `flex-1`（無修飾）だと**デスクトップでもレールが main 軸いっぱいに grow → pill が全幅化**する。現状デスクトップは `self-start inline-flex` の shrink-to-fit・左寄せ pill なので、これは可視的なレイアウト変化＝ AC-2 違反。
  - 理由: `flex-1` は round-2 の説明文（「モバイルで `⋯` を行末に置きつつレールを可変幅で埋める」）が示すとおり**モバイル専用の意図**だが、置換される元トークン（`max-sm:self-stretch`）が持っていた `max-sm:` 修飾子が置換先で落ちている。plan・adr・round-2 の 3 文書すべてが無修飾で記述しており、実装者が literal に従うとデスクトップ pill を全幅化させ、`pnpm build` は通るが AC-2 の目視ゲートで初めて発覚する（回帰が遅れて顕在化する類）。
  - 提案: 置換先を **`max-sm:flex-1`** に修飾する（`min-w-0` は元クラス文字列に無修飾で既に存在するため追加不要。必要なら `max-sm:min-w-0` を併記）。加えて、デスクトップのレールは shrink-to-fit・左寄せを保つため **`flex-1` をモバイル限定にすれば足りる**（デスクトップのレールは既定 flex `0 1 auto` で grow せず、`self-start` は flex-row 外側ラッパー内では cross 軸＝垂直の無害な指定に変わるので、pill は現状どおり shrink-to-fit・左寄せのまま）。あわせて **外側ラッパー自身も `flex-1` を持たせない**（デスクトップで全幅の透明ラッパー内に左寄せ pill が乗る＝現状と同一見た目）ことを step 2 / ADR-001 point 2 に一言明記すると、実装者が修飾子を落とすトラップを確実に防げる。styles.ts の `editorToolbar` を「外側ラッパー（sticky）」「内側レール（非 sticky スクローラ）」に分割する JSDoc にも、レールのデスクトップ shrink-to-fit を維持する旨を残すのが望ましい。

#### 改善提案

- なし（P-001 の修正提案内に、外側ラッパー・レールのデスクトップ非 grow 明記を含めたため、追加の独立提案は出さない）。

#### 良い点

- round-2 の最重要修正（sticky 追従の回帰）を、実コードの containing block 構造（`flex flex-col` at `WysiwygEditor.tsx:515` が背の高い親）に照らして正しく解決している。sticky/mb-4 を 1 行高の外側ラッパーへ移し、その外側ラッパーが引き続き背の高い `flex flex-col` を containing block とするため、ヘッダー直下追従が維持され、かつ overflow コンテナでないため Menu パネルもクリップされない — 追従とクリップ回避が両立する設計として技術的に成立している。
- `role="toolbar"` の外側ラッパー移設（`⋯` トリガーを 1 ツールバーのグルーピングに含める）は a11y 上正しく、`editorToolbar` が 1 箇所専用（grep 確認）なので styles.ts 分割で副作用なく完結する。
- option B（Menu を `flex flex-col` 直下の別兄弟に出す案）を「別行落ちで `⋯` が行末に付かず追従もしない」として明確に除外し、option A に一本化したことで実装の曖昧さが消えた。
- S-001（`surface === "edit"` ゲート）が `NoteEditor.tsx:311` の実コードと一致し、`proceedModeSwitch` 抽出時の内包が step 5 に明記され、新規ノート面の AC-6 回帰が防止されている。
- `sm:hidden` ラッパーでデスクトップの空 Menu ラッパー（`<div className="relative">`）ごと DOM から除去し、`gap-[2px]` 分の余白増を防ぐ点（AC-2）も、`flex` の gap が `display:none` 要素には効かない挙動と整合して正しい。
- ネイティブダイアログ置換（未保存 = 既存 `ConfirmDialog` 流用、リンク = 新規 `LinkDialog`）、native `alert` のインライン `role="alert"` 化、TipTap 操作を親に残す責務分離、いずれも既存プリミティブ・utility-first 規約に準拠し、内側レイヤー無変更。

---

## 返答

- 問題点: 1 / 改善提案: 0
- **[P-001]** レール幅の置換 `self-stretch → flex-1 min-w-0` が breakpoint 未修飾で、デスクトップ pill が全幅化し AC-2 違反（`max-sm:flex-1` に修飾し、外側ラッパー・レールをデスクトップで非 grow とする旨を明記して解消）
