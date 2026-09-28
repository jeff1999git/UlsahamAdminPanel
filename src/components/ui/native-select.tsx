import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Classes for the wrapper, which sets the width. */
  wrapperClassName?: string
}

/**
 * A native <select> styled like the Radix Select trigger. It needs no extra
 * JS, and phones open their own picker, which suits simple filters.
 */
const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, wrapperClassName, children, ...props }, ref) => (
    <div className={cn("relative", wrapperClassName)}>
      <select
        ref={ref}
        className={cn(
          "flex h-10 w-full appearance-none items-center rounded-md border border-input bg-background py-2 pl-3 pr-9 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
        aria-hidden="true"
      />
    </div>
  )
)
NativeSelect.displayName = "NativeSelect"

export { NativeSelect }
