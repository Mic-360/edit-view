import { useEffect, useId, useMemo, useRef, useState } from 'react';

type Props = {
  value: File | null;
  onChange: (file: File | null) => void;
};

const ACCEPT = ['.jpg', '.jpeg', '.png', '.webp'].join(',');

export function ImageUploader({ value, onChange }: Props) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useMemo(
    () => (value ? URL.createObjectURL(value) : null),
    [value]
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFile(file: File | null) {
    setError(null);
    if (!file) {
      onChange(null);
      return;
    }
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(file.type)) {
      setError('Unsupported file type. Use JPG, PNG, or WEBP.');
      onChange(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be 5MB or smaller.');
      onChange(null);
      return;
    }
    onChange(file);
  }

  return (
    <section
      aria-labelledby={`${inputId}-label`}
      className='grid gap-2'
    >
      <div className='flex items-center justify-between'>
        <label
          id={`${inputId}-label`}
          htmlFor={inputId}
          className='font-medium'
        >
          Image Upload
        </label>
        {value && (
          <button
            type='button'
            onClick={() => {
              handleFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className='text-sm text-red-600 hover:underline'
            aria-label='Remove image'
          >
            Remove Image
          </button>
        )}
      </div>
      <p className='text-sm text-muted-foreground'>
        Upload one image you want to edit. Supported formats: JPG, PNG, WEBP.
      </p>
      <input
        ref={fileInputRef}
        id={inputId}
        name='image'
        type='file'
        accept={ACCEPT}
        aria-describedby={error ? `${inputId}-error` : undefined}
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          handleFile(f);
        }}
        className='block w-full text-sm file:mr-4 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium file:hover:bg-accent'
      />
      {error && (
        <p
          id={`${inputId}-error`}
          role='alert'
          className='text-sm text-red-600'
        >
          {error}
        </p>
      )}
      {previewUrl && (
        <div className='mt-2'>
          <img
            src={previewUrl}
            alt='Preview of the uploaded image'
            className='max-h-64 w-auto rounded-md border'
          />
        </div>
      )}
    </section>
  );
}

export default ImageUploader;
