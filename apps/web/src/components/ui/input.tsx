import { useId } from 'react';
import type { ComponentProps, ReactNode } from 'react';

type InputProps = Omit<ComponentProps<'input'>, 'placeholder'> & {
  label: string;
  // A string is shown as the message under the field. `true` only styles the field.
  error?: string | boolean;
  // Drops the field's 280px minimum width so it fits a narrow column.
  fluid?: boolean;
  // A control that sits inside the field, such as the password Show / Hide button.
  action?: ReactNode;
};

export function Input({
  label,
  error,
  fluid,
  action,
  id,
  className,
  ...rest
}: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const messageId = `${inputId}-msg`;
  const message = typeof error === 'string' && error !== '' ? error : null;
  const invalid = Boolean(error);
  const fieldClass = [
    'af-field',
    fluid && 'af-field--fluid',
    action && 'af-field--action',
    invalid && 'af-field--error',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <div className={fieldClass}>
        <input
          {...rest}
          id={inputId}
          // The single space is what :placeholder-shown keys on to float the label.
          placeholder=" "
          className={className ? `af-input ${className}` : 'af-input'}
          aria-invalid={invalid || undefined}
          aria-describedby={
            [message ? messageId : null, rest['aria-describedby']]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
        <label htmlFor={inputId}>{label}</label>
        {action}
      </div>
      {message && (
        <div className="af-field-msg" id={messageId}>
          {message}
        </div>
      )}
    </div>
  );
}
