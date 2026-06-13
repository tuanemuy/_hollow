# R-2: 入力 value 保持の非退行 (AC-7)

- 対応AC: AC-7
- セッション: TC-2 / TC-3 / TC-4 / TC-5 / TC-6 の観測を流用

## 目的

追加した selection 記録用イベントハンドラ（onSelect/onKeyUp/onMouseUp/onInput/onFocus/onBlur/
onCompositionStart/onCompositionEnd）が既存 `onChange` と干渉せず、入力 value が保持される。

## 実測（各 TC の after で value 保持を確認）

| TC | 配線箇所 | 入力 value | invalidate 後 value | 保持 |
|----|---------|-----------|--------------------|------|
| TC-2 | /views rename input | TestLongViewName649… | 同左 | OK |
| TC-3 | /admin/prompts text textarea（onChange + 新ハンドラ同居） | "Hello World Test" | 同左 | OK |
| TC-4 | /admin/prompts variables input（onChange + 新ハンドラ同居） | "content, dirs" | 同左 | OK |
| TC-5 | /settings/prompts text textarea | "My analysis intent here" | 同左 | OK |
| TC-6 | /views rename input (raw invalidate) | TestLongViewName649… | 同左 | OK |

## 判定: PASS

invalidate 後も入力中の value が保持される。特に /admin/prompts の新規配線
（`onChange` と `onSelect`/`onKeyUp`/`onMouseUp` 等が共存）でも value 更新が壊れず、
入力中のテキストが保持されることを TC-3/TC-4 で確認。#670 で実証済みの value 保持挙動を壊していない。
