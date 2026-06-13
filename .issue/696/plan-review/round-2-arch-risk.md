# Plan Review — Issue #696 / Round 2（アーキテクチャ整合性・実現可能性・リスク）

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
対象: `.issue/696/plan.md` / `.issue/696/adr.md`
1周目: `.issue/696/plan-review/round-1-arch-risk.md`
実コード再照合: `InlineEditor.tsx`（debounce / focusout）/ `editorState.ts`（latch）/ `ConfirmDialog.tsx`（form / subject / danger）/ `wysiwygUnsupportedTags.ts`

---

## 総評

1周目の唯一の要修正だった **P-001（InlineEditor の `onChange` が blur で同期フラッシュされない＝`stateRef.current.contentHtml` の鮮度を blur で担保できない）** は、計画・ADR の両方で実コードに即して正しく訂正されている。

実コードでの再確認:

- InlineEditor: `ONCHANGE_DEBOUNCE_MS = 50`（L127）、`onChange` は `setTimeout` 経由の debounce emit（L478-485）。`focusout` ハンドラ（L794 登録）と内部の `blur()`（L681/683）は `<pre>` 再ハイライト目的で、debounce タイマーを即時実行する経路は存在しない。→ 計画「設計3」・リスク欄「`stateRef` の鮮度（割り切り）」・ADR-002「判定対象の鮮度（割り切り）」の記述（「blur 強制で鮮度担保できる」という保証は成立しない／判定は最後にコミットされた `state.contentHtml` に対して行う／同期 flush 追加はスコープ外）は実コードと一致。過剰保証の文言は完全に除去されている。
- editorState の latch: `wysiwygUnsupportedDetected` は `setsEqual` で同一集合なら同一 state を返し（L558）、新規集合のみ `ack=false` リセット（L562）。`wysiwygUnsupportedAck` は冪等（L565-567）。→ 「同意時に `wysiwygUnsupportedAck` 併発 → onCreate 再検出が ack を消さない」という ADR-002 の二重同意回避が reducer 実装で成立する。
- ConfirmDialog: submit で `event.stopPropagation()`（L112）、内部 `<form>`（L126）、`subject` を渡すと `Trash2` ハードコード表示（L145）、確認ボタンは `data-danger=""` 固定で variant prop は削除済み（L177 / JSDoc L66）。→ ADR-001（subject 不使用・danger 許容・form 内配置安全）と一致。
- `detectUnsupportedTags` は結果を `.sort()`（L111）、サニタイザ依存で `<script>`/`<style>` は素通し（L23 / L93）。→ S-004 の注記（サニタイズ前提・誤判定の実害は警告精度のみ）と一致。

P-001 の訂正は新たな矛盾を生んでいない。S-001〜S-004 の取り込みも妥当（後述）。AC 表・テスト方針・リスク欄・ADR の三者間で記述がそろっており、内部不整合は見当たらない。

---

#### 問題点（要修正）

- **問題点ゼロ。** 1周目 P-001 の訂正は実コードと整合しており、過剰保証文言は除去され、判定対象を「コミット済み `state.contentHtml`（debounce 未フラッシュ分は含まれ得ない）」と割り切る方針で計画・ADR-002・リスク欄が一貫している。新たな矛盾・実現不能箇所は検出されなかった。

---

#### 改善提案（検討推奨）

- **[S-001]**（任意・優先度低）AC-7 / ADR-002 の二重同意回避は「`ConfirmDialog` で見せた `pendingWysiwygSwitch.lostTags`」と「`onCreate` で `detectUnsupportedTags` が再検出する集合」が同一であることに依存している。両者とも同じ `detectUnsupportedTags(同一 HTML)` 由来かつ reducer 側は `setsEqual`（順序非依存）で比較するため現状は確実に一致するが、ダイアログ表示用に `lostTags` を別途 state 保持する設計上、将来この 2 経路がズレると二重同意が再発する。計画のテスト方針には既に「latch 依存の暗黙結合をテストコメントに残す」と明記済みなので、実装時にその pin を確実に入れること（これは 1周目 S-002 の取り込みで既に対応済みであり、念押しの再掲）。新規の修正は不要。

---

#### 良い点

- **P-001 訂正の質が高い**: 「割り切る」方針を選んだうえで、なぜ実用上問題ないか（非対応タグ集合は通常のテキスト編集では変化しない）を根拠付きで明記し、過剰保証文言を計画・リスク欄・ADR-002 の 3 箇所すべてから除去している。対案2（InlineEditor 同期 flush）をスコープ外と明示する判断もアーキテクチャ的に妥当（別コンポーネント改修＝スコープ拡大）。

- **三文書の整合**: AC 表（AC-7/AC-8 の観測可能化）・設計・リスク欄・テスト方針・ADR-001/002/003 の間で、判定対象の鮮度・dispatch 順序・danger 色・subject 不使用の記述が一貫しており、相互に矛盾がない。

- **アーキテクチャ整合性**: フロントエンドのみ（ドメイン/UC/アダプター不変）、reducer はモデル状態に限定し一過性 UI 状態（`pendingWysiwygSwitch`）を orchestrator local state に置く、新規 CSS を書かず Tailwind utility/token/`data-*` variant を踏襲、という方針はいずれも CLAUDE.md の規約および既存 `editorState.ts` 冒頭 JSDoc の方針に沿う。

- **実コード裏づけの正確さ**: ConfirmDialog の `stopPropagation` による form 内配置安全性、latch による二重同意回避、subject/Trash2 ハードコード回避の各根拠が、いずれも実ファイルの該当行と一致している。

---

## 結論

1周目 P-001 の訂正は実コードと完全に整合し、過剰保証は除去され、計画・ADR・リスク欄の内部矛盾も無い。S-001〜S-004 の取り込みも適切。**要修正ゼロ**。S-001 は実装時の pin 徹底を促す念押しのみで、計画文書自体の修正は不要。計画はそのまま実装に進んでよい。
