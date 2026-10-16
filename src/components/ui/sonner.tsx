"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Sonner's chrome is only used for stacking/animation: each toast draws the shadcn Alert from
 * `@/components/ui/toast`. The toaster itself only needs the theme plus the page font, because its
 * own stylesheet pins a system font stack on [data-sonner-toaster].
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group font-sans"
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
