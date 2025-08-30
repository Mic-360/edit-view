import ImageUploader from '@/components/ImageUploader';
import PromptInput from '@/components/PromptInput';
import ResultDisplay from '@/components/ResultDisplay';
import { useTRPC } from '@/utils/trpc';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/')({
  component: HomeComponent,
});

const TITLE_TEXT = `
 ██████╗ ███████╗████████╗████████╗███████╗██████╗
 ██╔══██╗██╔════╝╚══██╔══╝╚══██╔══╝██╔════╝██╔══██╗
 ██████╔╝█████╗     ██║      ██║   █████╗  ██████╔╝
 ██╔══██╗██╔══╝     ██║      ██║   ██╔══╝  ██╔══██╗
 ██████╔╝███████╗   ██║      ██║   ███████╗██║  ██║
 ╚═════╝ ╚══════╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝

 ████████╗    ███████╗████████╗ █████╗  ██████╗██╗  ██╗
 ╚══██╔══╝    ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝
    ██║       ███████╗   ██║   ███████║██║     █████╔╝
    ██║       ╚════██║   ██║   ██╔══██║██║     ██╔═██╗
    ██║       ███████║   ██║   ██║  ██║╚██████╗██║  ██╗
    ╚═╝       ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
 `;

function HomeComponent() {
  const trpc = useTRPC();
  const healthCheck = useQuery(trpc.healthCheck.queryOptions());
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState('');

  const canSubmit = Boolean(
    file && prompt.trim().length > 0 && prompt.trim().length <= 500
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Please upload an image.');
      const formData = new FormData();
      formData.append('image', file);
      formData.append('prompt', prompt.trim());
      const res = await fetch(
        `${import.meta.env.VITE_SERVER_URL}/api/edit-image`,
        {
          method: 'POST',
          body: formData,
        }
      );
      const data = (await res.json()) as {
        success: boolean;
        imageUrl?: string;
        text?: string;
        error?: string;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Request failed with ${res.status}`);
      }
      return data;
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to edit image');
    },
  });

  return (
    <div className='container mx-auto max-w-3xl px-4 py-2'>
      <pre className='overflow-x-auto font-mono text-sm'>{TITLE_TEXT}</pre>
      <div className='grid gap-6'>
        <section className='rounded-lg border p-4'>
          <h2 className='mb-2 font-medium'>API Status</h2>
          <div className='flex items-center gap-2'>
            <div
              className={`h-2 w-2 rounded-full ${
                healthCheck.data ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className='text-muted-foreground text-sm'>
              {healthCheck.isLoading
                ? 'Checking...'
                : healthCheck.data
                ? 'Connected'
                : 'Disconnected'}
            </span>
          </div>
        </section>

        <section className='rounded-lg border p-4 grid gap-6'>
          <div>
            <h2 className='mb-2 font-medium'>Image Editor</h2>
          </div>
          <ImageUploader
            value={file}
            onChange={setFile}
          />
          <PromptInput
            value={prompt}
            onChange={setPrompt}
          />
          <div>
            <button
              type='button'
              disabled={!canSubmit || mutation.isPending}
              aria-disabled={!canSubmit || mutation.isPending}
              onClick={() => mutation.mutate()}
              className='inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50'
              title='Click to send your image and edit request to our AI editor.'
            >
              {mutation.isPending ? 'Submitting...' : 'Submit'}
            </button>
            <p className='mt-1 text-sm text-muted-foreground'>
              Click to send your image and edit request to our AI editor.
            </p>
          </div>

          <ResultDisplay
            imageUrl={mutation.data?.imageUrl}
            text={mutation.data?.text}
            loading={mutation.isPending}
            error={mutation.isError ? (mutation.error as any)?.message : null}
          />
        </section>
      </div>
    </div>
  );
}
