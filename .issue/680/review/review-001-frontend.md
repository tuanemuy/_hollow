# PR #684 レビュー — review-001（Frontend）

- 対象 PR: #684
- 観点: Frontend
- 実装計画: `.issue/680/plan.md` / 設計判断: `.issue/680/adr.md`
- 結論: 計画・ADR の方針（コミット後 focus/selection 復元フック、3フォーム配線、invalidate 経路非介入）はほぼ忠実に実装されている。AC-1〜AC-8 は満たされている。Blocker なし。ただし `hadFocusRef` が一度 arm されると解除されない設計に起因する focus 奪取の余地（W-001）と、autoFocus 未操作時の挙動の計画乖離（W-002）を指摘する。

## 受け入れ基準の検証

| AC | 判定 | 根拠 |
|----|------|------|
| AC-1 | 満たす | 原因（RSC コミット時 subtree 一時 detach → focus が `<body>` に落ちる）を ADR-001・フック JSDoc（`useRestoreFieldFocusOnCommit.ts:5-53`）に記録。`useRovingMenu.restoreFocusOnCommit` の前例と機序を突合。実機 before 再現は TC-E1（修正前 verify-tc-e1 で `{tag:BODY}` を観測）で裏付け。 |
| AC-2 | 満たす | `SavedViewsList/index.tsx:267,367,376` で inline rename `<input>` に ref + handlers 配線。autoFocus 維持。TC-2 / TC-2-retest で focus 復帰・caret 一致を実測。 |
| AC-3 | 満たす | `admin/PromptsForm/index.tsx:107-108,196,203,220,227` で text `<textarea>`・variables `<input>` の両フィールドに個別フック配線。TC-3（text）/ TC-4（variables）で個別 PASS。 |
| AC-4 | 満たす | `identity/PromptsForm/index.tsx:148,231,239` で text `<textarea>` のみ配線。`PreviewPanel.sample`（L369-377）は配線されておらず（スコープ外を遵守）。TC-5 で PASS。 |
| AC-5 | 満たす | 復元は `activeElement === document.body` を見るだけで発生源非依存。TC-6 で raw `router.invalidate()` でも復元を確認。 |
| AC-6 | 満たす | invalidate 経路（`UploadDialog.tsx` / `routerInvalidate.ts`）に一切変更なし（diff の変更ファイルは 4 ソースのみ）。TC-R1 で保存→invalidate→最新値再表示の非退行を確認。 |
| AC-7 | 満たす | handlers は `onChange` と別プロップで干渉せず value 保持。`useState` seed・onChange は不変。各 TC で value 保持を実測。 |
| AC-8 | 満たす | `pnpm typecheck` 成功。フック単体テスト 8件 PASS。`pnpm lint` は warning 27件（リポジトリ全体・既存分含む、exit 0）で gate を阻害しない。本 PR 起因の警告は L113-116 の optional-chain（**unsafe fix** なので `lint:fix` は適用せず gate 通過）。 |

## Frontend

### Blockers
- なし

### Warnings

- **[W-001]** `hadFocusRef` が一度 `true` になると解除されず、ユーザーが意図的に `<body>` へ blur した後の無関係な commit で focus を奪い返しうる
  - 場所: `app/components/common/useRestoreFieldFocusOnCommit.ts:90,110-132`（特に `onBlur` ハンドラ L145-155 が `hadFocusRef` を解除しない、復元 effect L113-118 のガードに「編集が継続中か」の条件がない）
  - 理由: 復元ガードは `(!composing) && hadFocusRef && el.isConnected && activeElement === document.body` のみ。`useRovingMenu` は `if (!open) return`（L109）で「パネルが開いている間だけ」に限定して同種の奪取を防いでいるが、本フックには等価な「いま編集中か」のゲートがない。`onBlur` でも `hadFocusRef` を落とさない（L145-155 は snapshot 退避のみ）ため、ユーザーがフィールドから空白領域へクリックして focus を `<body>` に落とした後、別の理由で commit（例: AppShell の UploadDialog 完了 invalidate）が走ると、`activeElement === document.body` 条件にそのまま合致して `el.focus()` が走り、ユーザーが離れたフィールドへ focus が戻ってしまう。ADR-001 Consequences のトレードオフ記述は「focus を外した『直後』にたまたま invalidate が重なる」狭いケースを想定しているが、実際は arm 解除がないため「離れて以降ずっと」奪取条件が立ち続ける。views inline rename はキャンセル/保存で `setIsEditing(false)` され input が unmount されるので実害は限定的だが、admin/identity の `<textarea>`/`<input>` は editing 中ずっと DOM に残るため、blur→（数秒後の他要素操作なし状態での）invalidate で focus が textarea に戻る再現余地がある。
  - 提案: `onBlur` で `hadFocusRef.current = false` にして「focus を失った＝編集の手を離した」を表現する（invalidate コミット由来の `<body>` 落ちは React 合成 onBlur を発火させないため、コミット由来 detach と意図的 blur を区別でき、本来守りたいケースは壊れない）。あるいは復元 effect の冒頭で `relatedTarget`/直近 focus の継続性を見るか、消費側が editing フラグを渡してゲートする。少なくとも TC-E2-retest が確認したのは「別要素へ移った」ケースのみで、「body へ落として留まった後の無関係 invalidate」は未検証。実機 1 ケースの追加観測を推奨。

- **[W-002]** autoFocus 直後・完全無操作で invalidate が重なると focus が復元されない（計画 E-1 の期待との乖離）
  - 場所: `app/components/common/useRestoreFieldFocusOnCommit.ts:125-131`（post-commit arming）／ `.issue/680/manual-test/results/TC-E1.md`
  - 理由: 計画ステップ2・ADR-001 S-001 は「スナップショット未取得でも **focus のみは復元する**」を仕様としている。実装は post-commit effect で `activeElement === el` のとき `hadFocusRef` を arm する救済（L129-131）を入れたが、TC-E1（verify-tc-e1, 完全無操作）では修正後も focus が body に残り復元されなかった。arming は「focus が当該要素にある commit」が一度走った後に有効化されるため、autoFocus マウントと同一 commit で arm が間に合わないケースが残る。TC-E1-retest は HMR 反映後に再検証して PASS としているが、TC-E1（無操作・PASS せず）と TC-E1-retest（PASS）の差分が「実機タイミング依存」なのか「確実に解決した」のか判別しづらい。実害は ADR-003 のフォールバック条件 (a)「focus が当該要素へ戻らない」に技術的に該当するが、TC-E1.md は「S-001 が想定する操作後の退避失敗ではなく未 arm のため意図的に抑制」と整理しフォールバック起票を回避している。
  - 提案: この境界挙動（autoFocus 直後・完全無操作の取りこぼし余地）はフック JSDoc にも明記して後続保守者が辿れるようにする（現 JSDoc L46-48 は arm の二経路を説明するが「それでも初回 commit で間に合わないと復元されない」点は書かれていない）。実運用上は autoFocus 直後にユーザーが必ず打鍵するため実害軽微という TC-E1.md の評価は妥当だが、判断根拠を JSDoc/コードコメントに残す価値がある。

### Notes

- **[N-001]** invalidate 経路（`UploadDialog.tsx` / `routerInvalidate.ts`）に一切手を入れず、focus を失う当事者側にフックを置く方針（ADR-001 / 計画 P-002）が忠実に実装されている。diff の変更ソースは 4 ファイルのみで「発生源非依存」が構造的に担保されている。
- **[N-002]** 退避（イベント駆動 capture + `onBlur` 最終退避）と復元（コミット後 dep なし `useEffect`）の分離、`activeElement === document.body` ガード、`preventScroll: true`、`setSelectionRange` の clamp 依拠など、ADR/計画の設計判断が JSDoc（L23-53）に WHY 付きで残されており CLAUDE.md「library-level JSDoc に WHY」規約に沿う。`useRovingMenu` L116-120 の引き継ぎ明記も良い。
- **[N-003]** IME ガードは `composingRef` を `compositionstart`/`compositionend` で開閉し、復元 effect 冒頭 `!composingRef.current` で抑制。`compositionend` で `capture()` を再実行して確定後の caret を再取得する点も妥当。TC-8 で composition 中の `setSelectionRange` 非発火（caret 不動）を確認。実 IME 駆動の限界は TC-8 に明記済み。
- **[N-004]** ユニットテストはガード分岐（restore/別要素/未 focus/切断ノード/snapshot 無し/autoFocus arm/IME/window-blur 相当）を網羅し 8件 PASS。jsdom では RSC detach を忠実再現できない制約を冒頭コメントで明示し、統合は実機 TC に委ねる切り分けが適切。
- **[N-005]** `identity/PromptsForm` の `PreviewPanel.sample`（L369-377）は計画どおり配線対象外を遵守。admin の text/variables 双方への個別フック適用も計画どおり。型パラメータ（`<HTMLTextAreaElement>` / `<HTMLInputElement>`）の使い分けも要素に整合。
- **[N-006]** `capture()` が `document.activeElement !== el` で早期 return しつつ `hadFocusRef` は guard 通過後にのみ立てる順序になっており、別要素 focus 中のイベントで誤って arm しない。`selectionStart/End === null`（type=search 等 selection 非対応）でも snapshot を更新せず null フォールバックへ倒れる安全設計。
