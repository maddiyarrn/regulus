'use client';

import { useCallback, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, CheckCircle, XCircle, Loader2, X } from 'lucide-react';

interface UploadResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
  message: string;
}

interface Props {
  onImportComplete?: () => void;
}

export function CSVUploader({ onImportComplete }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const csvFiles = Array.from(newFiles).filter(
      f => f.name.endsWith('.csv') || f.name.endsWith('.txt') || f.name.endsWith('.tle')
    );
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name));
      return [...prev, ...csvFiles.filter(f => !existing.has(f.name))];
    });
    setResult(null);
  }, []);

  const removeFile = (name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name));
    setResult(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));

      const res = await fetch('/api/import/csv', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      setResult(data);

      if (data.success && data.imported > 0) {
        setFiles([]);
        onImportComplete?.();
      }
    } catch (err) {
      setResult({
        success: false,
        imported: 0,
        skipped: 0,
        errors: ['Network error during upload'],
        message: 'Upload failed',
      });
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`relative border-2 border-dashed rounded-xl transition-colors cursor-pointer
          ${dragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/50'
          }`}
        onClick={() => document.getElementById('csv-file-input')?.click()}
      >
        <input
          id="csv-file-input"
          type="file"
          multiple
          accept=".csv,.txt,.tle"
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <div className={`p-4 rounded-full mb-4 transition-colors ${dragging ? 'bg-primary/10' : 'bg-muted'}`}>
            <Upload className={`w-8 h-8 ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <p className="text-base font-medium mb-1">
            {dragging ? 'Drop files here' : 'Drag & drop CSV files here'}
          </p>
          <p className="text-sm text-muted-foreground mb-3">
            or click to browse — supports .csv, .txt, .tle
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant="outline">Space-Track CCSDS OMM</Badge>
            <Badge variant="outline">TLE 3-line format</Badge>
            <Badge variant="outline">Multiple files</Badge>
            <Badge variant="outline">No size limit</Badge>
          </div>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            {files.length} file{files.length > 1 ? 's' : ''} selected
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {files.map(file => (
              <div
                key={file.name}
                className="flex items-center justify-between bg-muted rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatSize(file.size)}
                  </span>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); removeFile(file.name); }}
                  className="ml-2 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Button */}
      {files.length > 0 && (
        <Button
          className="w-full"
          onClick={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Importing satellites...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Import {files.length} file{files.length > 1 ? 's' : ''} into database
            </>
          )}
        </Button>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-xl border p-4 ${
          result.success && result.imported > 0
            ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
            : 'border-destructive/20 bg-destructive/5'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {result.success && result.imported > 0 ? (
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            ) : (
              <XCircle className="w-5 h-5 text-destructive" />
            )}
            <p className="font-semibold text-sm">{result.message}</p>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-green-700 dark:text-green-300 font-medium">
              {result.imported} imported
            </span>
            {result.skipped > 0 && (
              <span className="text-muted-foreground">{result.skipped} skipped</span>
            )}
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Errors (first 10):</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-destructive font-mono">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
