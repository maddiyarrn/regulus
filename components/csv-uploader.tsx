'use client';

import { useCallback, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, CheckCircle, XCircle, Loader2, X } from 'lucide-react';

interface FileResult {
  name: string;
  imported: number;
  skipped: number;
  errors: string[];
  status: 'pending' | 'uploading' | 'done' | 'error';
}

interface Props {
  onImportComplete?: () => void;
}

export function CSVUploader({ onImportComplete }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const valid = Array.from(newFiles).filter(
      f => f.name.endsWith('.csv') || f.name.endsWith('.txt') || f.name.endsWith('.tle')
    );
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...valid.filter(f => !existing.has(f.name))];
    });
    setFileResults([]);
  }, []);

  const removeFile = (name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name));
    setFileResults([]);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const uploadFile = async (file: File, index: number, total: number): Promise<FileResult> => {
    setFileResults(prev => {
      const next = [...prev];
      next[index] = { name: file.name, imported: 0, skipped: 0, errors: [], status: 'uploading' };
      return next;
    });

    const text = await file.text();
    const lines = text.trim().split('\n');
    const header = lines[0];
    const dataLines = lines.slice(1).filter(l => l.trim());

    const CHUNK_SIZE = 500;
    let totalImported = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];

    const chunks = [];
    for (let i = 0; i < dataLines.length; i += CHUNK_SIZE) {
      chunks.push(dataLines.slice(i, i + CHUNK_SIZE));
    }

    if (chunks.length === 0) chunks.push([]);

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunkText = [header, ...chunks[ci]].join('\n');
      const blob = new Blob([chunkText], { type: 'text/csv' });
      const chunkFile = new File([blob], file.name, { type: 'text/csv' });

      const formData = new FormData();
      formData.append('files', chunkFile);

      try {
        const res = await fetch('/api/import/csv', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          allErrors.push(err.error || `Chunk ${ci + 1} failed`);
        } else {
          const data = await res.json();
          totalImported += data.imported || 0;
          totalSkipped += data.skipped || 0;
          if (data.errors?.length) allErrors.push(...data.errors);
        }
      } catch {
        allErrors.push(`Network error on chunk ${ci + 1} of ${chunks.length}`);
      }

      // Update overall progress
      const filesProgress = (index / total) * 100;
      const chunkProgress = ((ci + 1) / chunks.length) * (1 / total) * 100;
      setOverallProgress(Math.round(filesProgress + chunkProgress));
    }

    const result: FileResult = {
      name: file.name,
      imported: totalImported,
      skipped: totalSkipped,
      errors: allErrors.slice(0, 5),
      status: allErrors.length > 0 && totalImported === 0 ? 'error' : 'done',
    };

    setFileResults(prev => {
      const next = [...prev];
      next[index] = result;
      return next;
    });

    return result;
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setOverallProgress(0);

    const results: FileResult[] = files.map(f => ({
      name: f.name, imported: 0, skipped: 0, errors: [], status: 'pending',
    }));
    setFileResults(results);

    let grandTotal = 0;
    for (let i = 0; i < files.length; i++) {
      const r = await uploadFile(files[i], i, files.length);
      grandTotal += r.imported;
    }

    setOverallProgress(100);
    setUploading(false);

    if (grandTotal > 0) {
      onImportComplete?.();
      setFiles([]);
    }
  };

  const totalImported = fileResults.reduce((s, r) => s + r.imported, 0);
  const totalErrors = fileResults.filter(r => r.status === 'error').length;
  const allDone = fileResults.length > 0 && fileResults.every(r => r.status === 'done' || r.status === 'error');

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !uploading && document.getElementById('csv-file-input')?.click()}
        className={`relative border-2 border-dashed rounded-xl transition-colors
          ${uploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
          ${dragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/50'
          }`}
      >
        <input
          id="csv-file-input"
          type="file"
          multiple
          accept=".csv,.txt,.tle"
          className="hidden"
          onChange={e => addFiles(e.target.files)}
          disabled={uploading}
        />
        <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
          <div className={`p-4 rounded-full mb-4 transition-colors ${dragging ? 'bg-primary/10' : 'bg-muted'}`}>
            <Upload className={`w-8 h-8 ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <p className="text-base font-medium mb-1">
            {dragging ? 'Drop files here' : 'Drag & drop CSV files here'}
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            or click to browse — supports .csv, .txt, .tle — no size limit
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant="outline">Space-Track CCSDS OMM</Badge>
            <Badge variant="outline">TLE 3-line format</Badge>
            <Badge variant="outline">Multiple files</Badge>
          </div>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && !uploading && fileResults.length === 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            {files.length} file{files.length > 1 ? 's' : ''} ready to import
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {files.map(file => (
              <div
                key={file.name}
                className="flex items-center justify-between bg-muted rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{formatSize(file.size)}</span>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); removeFile(file.name); }}
                  className="ml-2 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress while uploading */}
      {uploading && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">Importing...</span>
            <span className="font-mono font-semibold">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {fileResults.map((r, i) => (
              <div key={r.name} className="flex items-center gap-3 text-sm px-1 py-1">
                {r.status === 'pending' && (
                  <div className="w-4 h-4 rounded-full border-2 border-muted shrink-0" />
                )}
                {r.status === 'uploading' && (
                  <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                )}
                {r.status === 'done' && (
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                )}
                {r.status === 'error' && (
                  <XCircle className="w-4 h-4 text-destructive shrink-0" />
                )}
                <span className="truncate text-muted-foreground flex-1">{r.name}</span>
                {r.status === 'done' && (
                  <span className="text-green-600 font-medium shrink-0">{r.imported} imported</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results after done */}
      {allDone && !uploading && (
        <div className={`rounded-xl border p-4 ${
          totalErrors === 0
            ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
            : totalImported > 0
            ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950'
            : 'border-destructive/20 bg-destructive/5'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            {totalErrors === 0 ? (
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            ) : (
              <XCircle className="w-5 h-5 text-destructive" />
            )}
            <p className="font-semibold text-sm">
              {totalImported > 0
                ? `Successfully imported ${totalImported} satellites`
                : 'Import failed'}
            </p>
          </div>
          <div className="space-y-2">
            {fileResults.map(r => (
              <div key={r.name} className="flex items-center gap-2 text-sm">
                {r.status === 'done'
                  ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                }
                <span className="truncate text-muted-foreground">{r.name}</span>
                <span className="ml-auto font-medium shrink-0">
                  {r.imported > 0 ? `${r.imported} imported` : 'failed'}
                </span>
              </div>
            ))}
          </div>
          {fileResults.some(r => r.errors.length > 0) && (
            <details className="mt-3">
              <summary className="text-xs text-muted-foreground cursor-pointer">Show errors</summary>
              <div className="mt-2 space-y-1">
                {fileResults.flatMap(r => r.errors).slice(0, 10).map((e, i) => (
                  <p key={i} className="text-xs text-destructive font-mono">{e}</p>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Upload Button */}
      {files.length > 0 && !uploading && fileResults.length === 0 && (
        <Button className="w-full" onClick={handleUpload}>
          <Upload className="w-4 h-4 mr-2" />
          Import {files.length} file{files.length > 1 ? 's' : ''} into database
        </Button>
      )}

      {allDone && totalImported === 0 && (
        <Button variant="outline" className="w-full" onClick={() => { setFileResults([]); setFiles([]); }}>
          Try again
        </Button>
      )}
    </div>
  );
}
