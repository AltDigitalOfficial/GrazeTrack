import * as React from "react";

import { cn } from "@/lib/utils";

type AlertBannerVariant = "error" | "success" | "info" | "warning";

const variantClasses: Record<AlertBannerVariant, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  success: "border-green-200 bg-green-50 text-green-800",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

type AlertBannerProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: AlertBannerVariant;
};

export function AlertBanner({
  className,
  variant = "info",
  children,
  ...props
}: AlertBannerProps) {
  return (
    <div
      className={cn("rounded-lg border px-4 py-3 text-sm", variantClasses[variant], className)}
      {...props}
    >
      {children}
    </div>
  );
}
