type Props = {
  imageUrl?: string | null;
  text?: string | null;
  loading?: boolean;
  error?: string | null;
};

export function ResultDisplay({ imageUrl, text, loading, error }: Props) {
  return (
    <section
      className='grid gap-2'
      aria-live='polite'
      aria-busy={loading || undefined}
    >
      <h2 className='font-medium'>Result</h2>
      <p className='text-sm text-muted-foreground'>
        Your edited image will appear here once processing is complete.
      </p>
      {loading && <div className='text-sm'>Processing your image…</div>}
      {error && (
        <div
          role='alert'
          className='text-sm text-red-600'
        >
          {error}
        </div>
      )}
      {imageUrl && (
        <div className='grid gap-3'>
          <img
            src={imageUrl}
            alt='AI generated edited result'
            className='max-h-96 w-auto rounded-md border'
          />
          <div>
            <a
              href={imageUrl}
              download
              className='inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent'
            >
              Download
            </a>
          </div>
        </div>
      )}
      {text && <p className='text-sm text-muted-foreground'>{text}</p>}
    </section>
  );
}

export default ResultDisplay;
