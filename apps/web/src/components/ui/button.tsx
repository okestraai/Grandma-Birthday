import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full font-medium tracking-wide transition-all duration-300 ease-luxe disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** Gold, with a shimmer sweep on hover. The main call to action. */
        gold: 'bg-gold text-navy shadow-soft hover:-translate-y-0.5 hover:shadow-gold before:absolute before:inset-y-0 before:left-0 before:w-1/3 before:bg-white/35 before:content-[""] before:-translate-x-[120%] hover:before:animate-[shimmer_0.9s_ease-out]',
        primary: 'bg-navy text-ivory hover:-translate-y-0.5 hover:bg-emerald-deep hover:shadow-lift',
        emerald: 'bg-emerald text-ivory hover:-translate-y-0.5 hover:bg-emerald-deep hover:shadow-lift',
        outline: 'border border-gold/60 bg-transparent text-current hover:border-gold hover:bg-gold/10',
        ghost: 'bg-transparent text-current hover:bg-navy/5',
        subtle: 'bg-cream text-navy hover:bg-champagne/70',
        danger: 'bg-error text-white hover:bg-error/90',
        link: 'rounded-none px-0 text-emerald underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-4 text-sm',
        md: 'h-11 px-6 text-sm',
        lg: 'h-13 px-8 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, type, ...props }, ref) => {
    const Component = asChild ? Slot.Root : 'button';
    return (
      <Component
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Component>
    );
  },
);
Button.displayName = 'Button';
