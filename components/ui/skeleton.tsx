import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg bg-gradient-to-r from-muted via-muted/65 to-muted bg-[length:200%_100%] ring-1 ring-border/25 animate-shimmer-slide",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
