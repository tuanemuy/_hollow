"use client";

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

type Props = {
  className?: string;
  children: ReactNode;
};

export function UploadButton({ className, children }: Props) {
  return (
    <Link to="." hash="upload" className={className}>
      {children}
    </Link>
  );
}
