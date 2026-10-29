'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ArchiveDryRunEntry } from '../../../../shared/ipc-contract';
import { ArchivePreview } from '../../../components/ArchivePreview';

interface DryRunState {
  batchId: string;
  entries: ArchiveDryRunEntry[];
}

function ArchivePreviewInner() {
  const router = useRouter();
  const params = useSearchParams();
  const ids = params.get('ids');
  const dir = params.get('dir');

  const [state, setState] = useState<DryRunState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runDryRun = useCallback(async () => {
    if (typeof window === 'undefined' || !window.sift) return;
    if (!ids || !dir) return;
    try {
      const fileIds = ids
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await window.sift.archiveDryRun(fileIds, dir);
      setState(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [ids, dir]);

  useEffect(() => {
    void runDryRun();
  }, [runDryRun]);

  const confirm = useCallback(
    async (batchId: string) => {
      if (typeof window === 'undefined' || !window.sift) return;
      await window.sift.confirmArchive(batchId);
      router.push('/ledger');
    },
    [router],
  );

  return (
    <>
      {error ? <p role="alert" style={{ color: '#c0392b' }}>{error}</p> : null}
      <ArchivePreview
        batchId={state?.batchId ?? null}
        entries={state?.entries ?? []}
        onConfirm={confirm}
        onBack={() => router.back()}
      />
    </>
  );
}

export default function ArchivePreviewPage() {
  return (
    <Suspense fallback={<p>加载中…</p>}>
      <ArchivePreviewInner />
    </Suspense>
  );
}
