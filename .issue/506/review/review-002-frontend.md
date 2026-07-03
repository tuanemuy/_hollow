# PR #812 レビュー（2周目・Frontend フル再レビュー）

対象: PR #812 / Issue #506
参照: `.issue/506/plan.md`・`.issue/506/adr.md`・CLAUDE.md（フロント/スタイル規約）
確認ファイル: `app/components/common/usePopover.ts` / `Popover.tsx` / `useRovingMenu.ts`（前例）/ `FilterBar.tsx` / `PublicTopControls.tsx` と各 `__tests__`
検証: 3 テストファイル全緑（85 passed）。W-001 の反映検証としてミューテーション（`prevOpenRef.current = open` リセット行の削除）を実機で実行。

---

### Frontend

#### Blockers

- **なし**
  - 実装（`usePopover` の初期フォーカス effect・`Popover` の `haspopup === "dialog"` コードゲート・2 consumer への `initialFocus` 配線）はいずれも二層設計に整合し、effect 順序・deps・コメント規約に機能上の欠陥はない。テストも全緑。実装を止める問題は検出されなかった。

#### Warnings

- **[W-001]** 「close→reopen 再アーム」テストの自己説明コメントが、実装の `prevOpenRef.current = open` リセット行に対するミューテーション kill を**誤って主張**している。
  - 場所: `app/components/common/__tests__/Popover.test.tsx` の `it("re-arms initial focus on close→reopen (rising-edge reset, W-001)")` 内コメント（L1037-1043 付近）。および 1周目 W-001 反映の「リセット行を消すと落ちることをミューテーションで確認済み」という主張。
  - 理由: コメントは「Delete that reset line (leaving prevOpenRef pinned true after the first open) and this test fails」と述べるが、この機序は誤り。`prevOpenRef.current = open;` は prevOpenRef への**唯一の代入**であり、これを削除すると prevOpenRef は初期値 `false` に**固定**される（コメントの言う "pinned true" ではない）。結果 `rising = open && !false = open` となり、close→reopen（false→true）は依然として rising edge と判定され再フォーカスが発火する。**実機でこのミューテーションを適用して当該テストを実行したところ PASS した**（1 passed）。すなわちこのテストは主張どおりにはミュータントを kill しておらず、リセット行はどのユニットテストでも実際にはガードされていない。これは round-2-arch S-001 が AC-9 について既に指摘した「deps `[open, moveInitialFocus]` 不変ゆえ happy-dom の再レンダーでは effect が再実行されずガードを判別できない」構造そのもので、close→reopen シナリオでも（reopen は必ず false→true 遷移なので）正しい実装とミュータントが観測上区別できない。リセット行が観測差を生むのは「open を維持したまま effect が再実行される」本番 RSC 再発火シナリオに限られ、これは happy-dom で再現できない。
  - 補足（severity の根拠）: リセット行自体は本番で必要（`useRovingMenu` 前例どおり）で、削除提案ではない。またテストが検証する**振る舞い**（reopen で先頭 focusable へ再フォーカスする）は正しく緑で locked されており、W-001 が指した「close→reopen 再アーム未テスト」は振る舞いレベルでは解消できている。問題はコメントと反映報告が「リセット行をミューテーションで検証した」と**事実に反して過度に断定**している点に限られるため Blocker ではなく Warning とする。
  - 提案: (a) 当該テストのコメントからミューテーション kill 主張（"Delete that reset line ... and this test fails" と "pinned true" の機序）を削除し、round-2-arch S-001 と同じ「本ケースは reopen 再アームの振る舞いスモークであり、リセット行の分離検証は happy-dom では不可能」という正直な位置づけに揃える。(b) 反映記録側の「ミューテーションで確認済み」も同様に「振る舞いを固定（リセット行自体はユニットで分離検証不能）」へ訂正する。（もしリセット行を厳密に kill したいなら、open を維持したまま `moveInitialFocus` を true→false→true とトグルする作為的なケースが唯一の手段になるが、内部 deps への密結合を招くため非推奨。振る舞いスモーク＋前例準拠で担保する現方針が妥当。）

#### Notes

- **[N-001]** 初期フォーカス effect を clamp の `useLayoutEffect` の**後**の `useEffect`（post-paint）に置いた順序が正しい。layout effect（clamp）→ paint → passive effect（focus）の順で、transform 適用後に focus が走りフリッカーも二重発火もない。deps `[open, moveInitialFocus]` は最小かつ primitive 値で安定。
- **[N-002]** `Popover` の `moveInitialFocus: haspopup === "dialog" ? Boolean(initialFocus) : false` コードゲートにより、menu/listbox へ `initialFocus` が誤配線されても roving との二重フォーカスが構造的に表現不能。CLAUDE.md「illegal states を型/コードで表現不能に」に沿った昇格で、AC-7 テスト（menu/listbox で focus が入らない）も直接ガードしている。
- **[N-003]** コメントは WHY 中心で、Issue/ADR 参照（#506・#467・ADR-001・`useRovingMenu` 前例）を設計根拠ポインタとして保持しており規約に整合。1周目 W-001 で依頼された `prevOpenRef` の WCAG 3.2.1（On Focus）注記も追記されている。
- **[N-004]** AC-2（後方互換）テストが `panel()?.contains(document.activeElement)` で判定し、happy-dom で不安定な `activeElement === trigger` を避けている点、AC-1 に `expect(panel()).not.toBeNull()` を併記して onFocusOut 誤発火の退行を直接ガードしている点など、テスト設計は堅牢。consumer 側テスト（FilterBar/PublicTopControls）も先頭 focusable が `aria-pressed` を持つプリセットボタンであることを確認し、date input 暴発回避を構造で担保している。

---

## 返答（サマリー）

- Blockers: 0 / Warnings: 1 / Notes: 4
- **[W-001]** 「close→reopen 再アーム」テストのコメント（および 1周目反映報告）が `prevOpenRef.current = open` リセット行のミューテーション kill を誤主張。実機でリセット行を削除しても当該テストは PASS することを確認（prevOpenRef は初期値 `false` に固定され reopen は依然 rising edge と判定される）。リセット行は本番で必要・削除不要、振る舞い（reopen 再フォーカス）も正しく locked されているため Blocker ではなく Warning。コメントを round-2-arch S-001 と同じ「happy-dom では分離検証不可・振る舞いスモーク」の正直な位置づけへ訂正推奨。
- Notes: effect 順序/deps 適正・コードゲートで二重フォーカス排除・コメント規約整合（WCAG 注記含む）・テスト判定が happy-dom 前提で堅牢。
