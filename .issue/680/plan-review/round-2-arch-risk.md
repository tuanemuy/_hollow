# Round 2 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #680）

**レビュー視点:** あるべきアーキテクチャとの整合性・実現可能性・リスク
**対象:** `.issue/680/plan.md` / `.issue/680/adr.md`（1周目レビュー反映後）
**1周目:** `.issue/680/plan-review/round-1-arch-risk.md`
**日付:** 2026-06-13

---

#### 問題点（要修正）

問題点ゼロ。

1周目の指摘はすべて適切に反映され、実コードとの整合も取れている。確認結果:

- **[1周目 P-001（フィールド型訂正）反映確認: OK]** `app/components/admin/PromptsForm/index.tsx` を実コードで確認。text は `<textarea>`（L189-197）、variables は `<input type="text">`（L211-219）で、計画の訂正（plan L19/L42/L43/L107、adr.md L55、AC-3）と一致。新規フックが `HTMLInputElement | HTMLTextAreaElement` 双方対応である点（plan L63/L83/L84）とも矛盾なし。views inline は `<input>`（`SavedViewsList/index.tsx` L360、`autoFocus` 付き）、identity text は `<textarea>`（`identity/PromptsForm/index.tsx` L224）も実コードで一致。スコープ外の `PreviewPanel.sample` も `<textarea>`（同 L362、`useState` ユーザー入力）で実在を確認、配線対象外の線引きが正しい。

- **[1周目 P-002（退避タイミングの核心）反映確認: 設計は破綻なく成立]** 旧案「コミット直前/同一 effect 内で退避」は、invalidate のコミットでは「focus が body に落ちるコミット」と「effect が走るコミット」が同一であり effect 実行時には既に body へ落ちている、という理由で却下され、**退避＝イベント駆動（focus 中の `onSelect`/`onKeyUp`/`onMouseUp`/`onInput` で selection を ref へ随時記録）、復元＝コミット後 effect（保持済みスナップショットを使用）** に分離された（plan L64-66/L84-85、adr.md L42-49）。この分離は成立する: スナップショットは focus 喪失イベントとは独立に「ユーザーが最後に caret を動かした時点」で ref に確定するため、コミットのタイミングに依存しない。復元側は `useRovingMenu.restoreFocusOnCommit`（L107-121）と同型の「dep なし `useEffect` + `activeElement === document.body` ガード + `focus({preventScroll:true})`」で、実働前例があり機序が一致する。退避と復元を同一 effect に同居させない点が前例との差分として明記されており（plan L66、adr.md L49）、設計の核心は読めている。

#### 改善提案（検討推奨）

- **[S-001]** イベント駆動退避の「捕捉漏れ」ケースを、ステップ2の設計確定時に列挙してフックに織り込む（または ADR に許容範囲として明記する）
  - 理由: `onSelect`/`onKeyUp`/`onMouseUp`/`onInput` は caret 移動の主要経路を覆うが、`onSelect` は input/textarea で「選択範囲が変化したとき」発火し、矢印キーによる**選択を伴わない caret 移動**も多くのブラウザで `onSelect` を発火させる（HTML仕様で input/textarea の caret 移動は select イベント対象）ため実害は小さい。ただし「フォーカス直後・1文字も操作せず invalidate」のケースは、どのイベントも発火しておらずスナップショットが初期値（null）のままになりうる。この場合は「caret 末尾/先頭にジャンプ」ではなく「スナップショット無し → selection 復元はスキップし focus のみ復元」にフォールバックするのが安全。`autoFocus` で開く views inline rename（操作前に invalidate が重なる余地がある）で起きうるので、ステップ2で「スナップショット未取得時は focus だけ復元（setSelectionRange しない）」を明文化し、ステップ7の観測（S-001 で追加済みの before/after 実測）でこのケースも1つ見ると、退避漏れを成功誤判定しない。`focusout`/`blur` 直前の最終退避併用（plan L65/L84 で「してもよい」）を**必須**に格上げすると、focus を失う直前の最後の状態が必ず1回は退避され、捕捉漏れの保険になる。

- **[S-002]** 高速タイピング中のコミット重畳について、スナップショットの「鮮度」より「value との整合」を1行確認項目に加える
  - 理由: 退避がイベント駆動なので、高速タイピング中に invalidate が連続しても「最後の入力イベント時点の caret」は ref に載っており陳腐化しない（むしろ effect 退避より鮮度が高い）。懸念は caret 値の鮮度ではなく、復元時に `el.value`（reconcile 後の最新 value）と退避済み `selectionStart/End`（退避時点の value 長基準）がズレて `setSelectionRange` が clamp される可能性。input value は #670 で保持確定済みなので実害は出にくいが、`setSelectionRange` はブラウザが value 長で自動 clamp するためクラッシュはしない。ステップ7で「タイピング途中（文中 caret）→ invalidate」を1ケース見て、caret が打鍵位置に留まる（末尾へ飛ばない）ことを確認すると、`useRovingMenu` の clamped index 知見（adr.md L63 で JSDoc 共有予定）の text 版として裏が取れる。複数 invalidate 連続は「毎コミット後 effect」が各コミットで走るので個別に問題ない。

- **[S-003]** ステップ7の実機ゲートを通過できなかった場合のフォールバック発火条件を、観測値で一意に決める
  - 理由: ADR-003（adr.md L97-112）はフォールバック（描画構造見直し）を残課題として持つが、「フックで復元しきれない」の判定基準が定性的。S-001 で追加済みの before/after 実測（退避値の有無・復元後 selectionStart/End）を使い、「復元後に focus が当該要素へ戻らない」「focus は戻るが setSelectionRange 後の selectionStart が退避値と一致しない（かつスナップショットは存在した）」のいずれかが3フォームで1つでも起きたらフォールバック起票、という閾値をステップ7に1行で書いておくと、実機ゲートが主観に流れず ADR-001 フォールバックへの遷移条件が明確になる。

#### 良い点

- **核心 P-002 の設計修正が機序として正しい。** 退避（イベント駆動・focus 喪失と独立にスナップショット確定）と復元（コミット後 effect・保持済み値使用）の分離は、1周目が指摘した「effect 実行時には既に body へ落ちている」問題を構造的に回避する。スナップショットの源泉がコミットサイクルから切り離されたため、「複数 invalidate 連続」でも「高速タイピング中のコミット」でも退避ソースが陳腐化・空化しない。adr.md L42-49 が `useRovingMenu` が `activeIndex`（caller 所有の論理 state）保持で済んだ理由まで踏み込んで非対称性を説明しており、前例との差分の理解が深い。

- **実コードとの整合が全箇所で取れている。** admin の2フィールド型（textarea + input）、views inline input、identity textarea、スコープ外の PreviewPanel.sample のいずれも実コードの行番号・型・seed 方式と一致。1周目 P-001 のフィールド型誤認は完全に解消され、再発していない。

- **復元側が実働前例と同型でリスクが低い。** `activeElement === document.body` ガード・`focus({preventScroll:true})`・dep なし `useEffect`・window blur 時は activeElement が要素のまま（body にならない）ため復元しない、という挙動は `useRovingMenu.restoreFocusOnCommit`（L100-120）の実装コメントが明示する前例と一致。adr.md L62（S-004 反映）と L63（preventScroll 根拠引き継ぎ、S-002 反映）が前例コメントの WHY を正しく引いている。

- **IME composition ガードの格上げが妥当。** 日本語入力主言語で `compositionstart`〜`compositionend` 中の `setSelectionRange` が変換セッションを壊す実害を、設計段階（ステップ2）の必須検討項目に格上げ（plan L87/L150、adr.md L51-52）。「早期 return か compositionend まで保留か」をステップ2で確定する方針も明記されており、実機で迷わない。

- **配置・命名・規約適合が完全。** 新規フック `useRestoreFieldFocusOnCommit` を `app/components/common/`（`useRovingMenu`/`routerInvalidate`/`useAuthGuardEffect`/`usePopover` と同列、実ディレクトリ確認済み）に置き、`"use client"`・library-level JSDoc で WHY を残す方針は CLAUDE.md フロントエンド規約・既存共通フック慣行に沿う。focus はブラウザ副作用でドメイン概念でないとしてドメイン/ユースケース/アダプター影響なしと層判断するのも正しい。invalidate 経路（UploadDialog/routerInvalidate）に一切触れず発生源非依存で局所復元する設計は、AC-6（最新値再表示の非退行）を構造的に担保する。

- **実機検証ゲートの観測精度が1周目反映で上がった。** ステップ7に「caret スナップショットが復元ソースとして実際に保持されたか」を before/after で実測する項目（S-001 反映、plan L126）、admin 両フィールド個別確認（plan L125）、raw invalidate での発生源非依存確認（plan L127）が追加され、「復元は走ったが caret は退避できず末尾に飛んだ」を成功誤判定しない設計になっている。
