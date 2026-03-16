"use client";

import { useState, useCallback } from "react";
import { Upload, Image as ImageIcon, Download, Loader2, AlertCircle } from "lucide-react";

interface ProcessingResult {
  svg: string;
  buildings: Array<{
    id: number;
    points: Array<{ x: number; y: number }>;
  }>;
}

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be less than 10MB");
      return;
    }
    
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target?.result as string);
      setImageFile(file);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleUrlSubmit = useCallback(() => {
    if (!urlInput.trim()) return;
    
    setError(null);
    setImage(urlInput);
    setImageFile(null);
  }, [urlInput]);

  const handleProcess = useCallback(async () => {
    if (!image) return;
    
    setIsProcessing(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          image: image,
          source: imageFile ? "upload" : "url"
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to process image");
      }
      
      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsProcessing(false);
    }
  }, [image, imageFile]);

  const handleDownload = useCallback(() => {
    if (!result?.svg) return;
    
    const blob = new Blob([result.svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "site-plan.svg";
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const clearAll = useCallback(() => {
    setImage(null);
    setImageFile(null);
    setUrlInput("");
    setResult(null);
    setError(null);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b bg-white dark:bg-zinc-900 px-6 py-4">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            HYLO-SP
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Architectural Plan Drawer
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Left Panel - Input */}
          <div className="space-y-6">
            <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
              <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-50">
                1. Upload Image
              </h2>
              
              {/* Upload Area */}
              {!image ? (
                <div className="space-y-4">
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 p-8 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600">
                    <Upload className="mb-3 h-10 w-10 text-zinc-400" />
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      Drag & drop or click to upload
                    </span>
                    <span className="text-xs text-zinc-400 mt-1">
                      PNG, JPG up to 10MB
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileSelect(e.target.files)}
                    />
                  </label>
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t dark:border-zinc-700" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                        Or enter URL
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://example.com/satellite-image.jpg"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                    />
                    <button
                      onClick={handleUrlSubmit}
                      disabled={!urlInput.trim()}
                      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                    <img
                      src={image}
                      alt="Uploaded"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <button
                    onClick={clearAll}
                    className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    ← Choose different image
                  </button>
                </div>
              )}
            </div>

            {/* Process Button */}
            <button
              onClick={handleProcess}
              disabled={!image || isProcessing}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </span>
              ) : (
                "Generate Site Plan"
              )}
            </button>

            {/* Error Display */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Right Panel - Output */}
          <div className="space-y-6">
            <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                  2. Site Plan
                </h2>
                {result && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    <Download className="h-4 w-4" />
                    Download SVG
                  </button>
                )}
              </div>

              {!result ? (
                <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700">
                  <div className="text-center text-zinc-400">
                    <ImageIcon className="mx-auto mb-2 h-8 w-8" />
                    <p className="text-sm">Upload an image and generate</p>
                    <p className="text-xs">to see the site plan</p>
                  </div>
                </div>
              ) : (
                <div className="aspect-video overflow-hidden rounded-lg border bg-white dark:bg-zinc-950">
                  <div
                    className="h-full w-full"
                    dangerouslySetInnerHTML={{ __html: result.svg }}
                  />
                </div>
              )}
            </div>

            {/* Building Info */}
            {result && result.buildings.length > 0 && (
              <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
                <h3 className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  Detected Buildings ({result.buildings.length})
                </h3>
                <ul className="space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {result.buildings.map((b) => (
                    <li key={b.id}>Building {b.id}: {b.points.length} vertices</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
