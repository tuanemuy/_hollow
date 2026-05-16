import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { HOME_SEARCH } from "../links";

type AuthHeaderProps = {
  /** Right-side action element. Defaults to the login entry link. */
  rightSlot?: ReactNode;
};

export function AuthHeader({ rightSlot }: AuthHeaderProps) {
  return (
    <header className="app-header">
      <Link to="/" search={HOME_SEARCH} className="app-logo">
        Hollow
      </Link>
      {rightSlot ?? (
        <Link to="/login" className="header-link">
          ログイン
        </Link>
      )}
    </header>
  );
}
