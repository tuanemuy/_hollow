import type { ReactNode } from "react";
import type { UserDTO } from "@/core/application/dto/identity";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

type Props = {
  user: UserDTO;
  children: ReactNode;
};

export function AppShell({ user, children }: Props) {
  return (
    <>
      <Header user={user} />
      <div className="app-layout with-sidebar">
        <Sidebar user={user} />
        <main className="app-main">{children}</main>
      </div>
    </>
  );
}
