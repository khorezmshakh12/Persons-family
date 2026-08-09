import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        // Translucent pill for glass surfaces (photo background + frosted
        // cards) — the stock variants above read `--primary`/`--border`/etc,
        // which are the strict grayscale light-theme tokens (see globals.css'
        // TT-07 comment) and render as a solid black-on-white chip that
        // doesn't belong on a glass card. `tint` opts into the same
        // translucent color language already used by StatCard/dashboard tint
        // maps instead, so every ad-hoc status/tier pill across the app can
        // converge on one component.
        tint: "",
      },
      tint: {
        green: "border-green-500/30 bg-green-500/20 text-green-50",
        blue: "border-blue-500/30 bg-blue-500/20 text-blue-50",
        orange: "border-orange-500/30 bg-orange-500/20 text-orange-50",
        amber: "border-amber-500/30 bg-amber-500/20 text-amber-100",
        red: "border-red-500/30 bg-red-500/20 text-red-50",
        slate: "border-white/20 bg-white/10 text-white/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  tint,
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant, tint: variant === "tint" ? (tint ?? "slate") : undefined }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
