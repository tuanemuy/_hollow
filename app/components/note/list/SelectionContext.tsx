"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from "react";
import {
  emptySelection,
  type SelectionAction,
  type SelectionState,
  selectionReducer,
} from "./listSelectors";

type SelectionContextValue = Readonly<{
  state: SelectionState;
  dispatch: Dispatch<SelectionAction>;
}>;

const Ctx = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(selectionReducer, emptySelection);
  const value = useMemo<SelectionContextValue>(
    () => ({ state, dispatch }),
    [state],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSelection(): SelectionContextValue {
  const value = useContext(Ctx);
  if (value === null) {
    throw new Error("useSelection must be used inside <SelectionProvider>");
  }
  return value;
}
