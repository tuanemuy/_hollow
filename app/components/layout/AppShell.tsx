import type { ReactNode } from "react";
import type { UserDTO } from "@/core/application/dto/identity";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { APP_LAYOUT_WITH_SIDEBAR, APP_MAIN } from "./styles";

type Props = {
  user: UserDTO;
  children: ReactNode;
};

export function AppShell({ user, children }: Props) {
  return (
    <>
      <Header user={user} />
      <div className={APP_LAYOUT_WITH_SIDEBAR}>
        <Sidebar user={user} />
        <main className={APP_MAIN}>{children}</main>
      </div>
    </>
  );
}
