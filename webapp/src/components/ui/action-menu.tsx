import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";

import { cn } from "@/lib/utils";

const ActionMenu = DropdownMenuPrimitive.Root;
const ActionMenuTrigger = DropdownMenuPrimitive.Trigger;
const ActionMenuPortal = DropdownMenuPrimitive.Portal;
const ActionMenuSeparator = DropdownMenuPrimitive.Separator;

const ActionMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 8, align = "end", ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[9rem] rounded-md border bg-white p-1 text-sm text-stone-900 shadow-md",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
ActionMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

type ActionMenuItemProps = React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
  variant?: "default" | "destructive";
};

const ActionMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  ActionMenuItemProps
>(({ className, variant = "default", ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "cursor-pointer select-none rounded px-3 py-2 outline-none",
      "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
      "data-[highlighted]:bg-stone-100",
      variant === "destructive" ? "text-red-700 data-[highlighted]:text-red-700" : "text-stone-900",
      className
    )}
    {...props}
  />
));
ActionMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export {
  ActionMenu,
  ActionMenuTrigger,
  ActionMenuPortal,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuSeparator,
};
