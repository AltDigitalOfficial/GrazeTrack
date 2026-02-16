import * as React from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

type PageShellProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
};

export function PageShell({ title, description, children, className }: PageShellProps) {
  return (
    <div className={cn("p-6 space-y-6", className)}>
      <header>
        <h1 className="text-3xl font-bold text-stone-800">{title}</h1>
        <p className="mt-1 text-stone-600">{description}</p>
      </header>
      {children}
    </div>
  );
}

type FeatureGridProps = {
  children: React.ReactNode;
  className?: string;
};

export function FeatureGrid({ children, className }: FeatureGridProps) {
  return <section className={cn("grid grid-cols-1 gap-6 md:grid-cols-2", className)}>{children}</section>;
}

type FeatureTileProps = {
  title: string;
  description: string;
  className?: string;
};

const baseTileClassName =
  "block rounded-lg border border-stone-300 p-5 shadow-sm transition";

export function FeatureTileLink({ title, description, className, to }: FeatureTileProps & { to: string }) {
  return (
    <Link to={to} className={cn(baseTileClassName, "bg-white hover:shadow-md", className)}>
      <h2 className="text-xl font-semibold text-stone-800">{title}</h2>
      <p className="mt-1 text-stone-600">{description}</p>
    </Link>
  );
}

export function FeatureTileDisabled({ title, description, className }: FeatureTileProps) {
  return (
    <div className={cn(baseTileClassName, "cursor-not-allowed bg-stone-100 opacity-60", className)}>
      <h2 className="text-xl font-semibold text-stone-500">{title}</h2>
      <p className="mt-1 text-stone-500">{description}</p>
    </div>
  );
}
