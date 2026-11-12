import { useState } from 'react';
import type { ComponentProps } from 'react';
import { authCopy } from '../../lib/auth/copy.ts';
import { Input } from './input.tsx';

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'action'>;

export function PasswordInput(props: PasswordInputProps) {
  const [shown, setShown] = useState(false);
  return (
    <Input
      {...props}
      type={shown ? 'text' : 'password'}
      action={
        <button
          type="button"
          className="af-field-action"
          aria-pressed={shown}
          onClick={() => setShown((was) => !was)}
        >
          {shown ? authCopy.fields.hide : authCopy.fields.show}
        </button>
      }
    />
  );
}
