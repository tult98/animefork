import { useId } from 'react';
import type { ComponentProps } from 'react';

type InputProps = Omit<ComponentProps<'input'>, 'placeholder'> & {
  label: string;
  // A string is shown as the message under the field. `true` only styles the field.
  error?: string | boolean;
};

export function Input({ label, error, id, className, ...rest }: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const messageId = `${inputId}-msg`;
  const message = typeof error === 'string' && error !== '' ? error : null;
  const invalid = Boolean(error);

  return (
    <div>
      <div className={invalid ? 'af-field af-field--error' : 'af-field'}>
        <input
          {...rest}
          id={inputId}
          // The single space is what :placeholder-shown keys on to float the label.
          placeholder=" "
          className={className ? `af-input ${className}` : 'af-input'}
          aria-invalid={invalid || undefined}
          aria-describedby={message ? messageId : undefined}
        />
        <label htmlFor={inputId}>{label}</label>
      </div>
      {message && (
        <div className="af-field-msg" id={messageId}>
          {message}
        </div>
      )}
    </div>
  );
}
