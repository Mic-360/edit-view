import { useId, useState } from 'react';

type Props = {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
};

export function PromptInput({ value, onChange, maxLength = 500 }: Props) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const remaining = maxLength - value.length;
  const tooLong = remaining < 0;

  return (
    <section
      aria-labelledby={`${id}-label`}
      className='grid gap-2'
    >
      <label
        id={`${id}-label`}
        htmlFor={id}
        className='font-medium'
      >
        Edit Prompt
      </label>
      <p className='text-sm text-muted-foreground'>
        Write a short description of the changes you want to make to the
        uploaded image.
      </p>
      <textarea
        id={id}
        name='prompt'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
        placeholder="Describe the edit you want (e.g., 'Add a sunset background')."
        aria-describedby={`${id}-desc ${id}-count`}
        aria-invalid={tooLong || undefined}
        className='min-h-28 resize-y rounded-md border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring'
      />
      <div
        id={`${id}-desc`}
        className='sr-only'
      >
        Describe the edit you want to apply to the uploaded image.
      </div>
      <div
        id={`${id}-count`}
        className={`text-xs ${
          tooLong ? 'text-red-600' : 'text-muted-foreground'
        }`}
      >
        {remaining} characters remaining
      </div>
      {touched && tooLong && (
        <p
          role='alert'
          className='text-sm text-red-600'
        >
          Prompt must be at most {maxLength} characters.
        </p>
      )}
    </section>
  );
}

export default PromptInput;
