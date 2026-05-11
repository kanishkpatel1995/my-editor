import { forwardRef, type ReactNode } from 'react'
import { Button, type ButtonProps } from './Button'

interface IconButtonProps extends Omit<ButtonProps, 'children' | 'variant'> {
  icon: ReactNode
  label: string
  variant?: 'icon' | 'primary' | 'danger' | 'ghost'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'icon', size = 'md', ...rest },
  ref,
) {
  return (
    <Button ref={ref} variant={variant} size={size} aria-label={label} title={rest.title ?? label} {...rest}>
      {icon}
    </Button>
  )
})
