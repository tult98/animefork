import type { ComponentProps } from 'react';

type IconButtonProps = Omit<ComponentProps<'button'>, 'aria-label'> & {
  label: string;
  small?: boolean;
};

export function IconButton({
  label,
  small = false,
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={['pl-ib', small && 'pl-ib--sm', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
