"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Upload, Image as ImageIcon, Download, Loader2, AlertCircle, Box, Grid3X3, FileDown, Palette, Ruler, MapPin, Tag, X, Plus, Move } from "lucide-react";
import * as THREE from "three";

interface ProcessingResult {
  svg: string;
  buildings: Array<{
    id: number;
    points: Array<{ x: number; y: number }>;
    name?: string;
  }>;
}

interface BlenderResult {
  success: boolean;
  data: {
    threeJsScene: {
      scene: {
        ground: { dimensions: number[]; color: string };
        buildings: Array<{
          id: number;
          name: string;
          position: number[];
          dimensions: number[];
          color: string;
        }>;
      };
      camera: { position: number[]; fov: number };
    };
  };
}

type RenderStyle = "realistic" | "blueprint" | "minimal" | "architectural" | "bw";
type ExportFormat = "svg" | "dxf" | "png" | "pdf" | "blend";

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading3D, setIsLoading3D] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [blenderResult, setBlenderResult] = useState<BlenderResult | null>(null);
  const [activeTab, setActiveTab] = useState<"2d" | "3d">("2d");
  
  // Phase 3: Style and export options
  const [renderStyle, setRenderStyle] = useState<RenderStyle>("realistic");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("svg");
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<number | null>(null);
  const [editedBuildings, setEditedBuildings] = useState<ProcessingResult["buildings"] | null>(null);
  
  // Overlay options
  const [includeDimensions, setIncludeDimensions] = useState(true);
  const [includeNorthArrow, setIncludeNorthArrow] = useState(true);
  const [includeScaleBar, setIncludeScaleBar] = useState(true);
  const [includeLabels, setIncludeLabels] = useState(true);
  const [lotSize, setLotSize] = useState({ width: 100, depth: 100 });
  
  const threeContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

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
    setEditedBuildings(null);
    
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
      setEditedBuildings(data.buildings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsProcessing(false);
    }
  }, [image, imageFile]);

  const handleGenerate3D = useCallback(async () => {
    const buildings = editedBuildings || result?.buildings;
    if (!buildings || buildings.length === 0) return;
    
    setIsLoading3D(true);
    setError(null);
    
    try {
      const response = await fetch("/api/blender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildings: buildings,
          lotSize,
          style: renderStyle === "bw" ? "minimal" : renderStyle
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate 3D model");
      }
      
      const data = await response.json();
      setBlenderResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading3D(false);
    }
  }, [result, editedBuildings, lotSize, renderStyle]);

  const handleExport = useCallback(async () => {
    const buildings = editedBuildings || result?.buildings;
    if (!buildings || buildings.length === 0) return;
    
    setIsExporting(true);
    setError(null);
    
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildings: buildings,
          lotSize,
          style: renderStyle,
          format: exportFormat,
          includeDimensions,
          includeNorthArrow,
          includeScaleBar,
          includeLabels,
          scale: 50
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate export");
      }
      
      const data = await response.json();
      
      // Download the file
      const blob = new Blob([data.content], { 
        type: data.contentType 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
      
      setShowExportPanel(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsExporting(false);
    }
  }, [result, editedBuildings, lotSize, renderStyle, exportFormat, includeDimensions, includeNorthArrow, includeScaleBar, includeLabels]);

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

  const handleBuildingNameChange = (id: number, name: string) => {
    if (!editedBuildings) return;
    setEditedBuildings(
      editedBuildings.map(b => 
        b.id === id ? { ...b, name } : b
      )
    );
  };

  const clearAll = useCallback(() => {
    setImage(null);
    setImageFile(null);
    setUrlInput("");
    setResult(null);
    setBlenderResult(null);
    setEditedBuildings(null);
    setError(null);
  }, []);

  // Three.js 3D rendering
  useEffect(() => {
    if (activeTab !== "3d" || !blenderResult?.data?.threeJsScene) return;
    
    const container = threeContainerRef.current;
    if (!container) return;
    
    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current = null;
    }
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;
    
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(30, -30, 40);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(20, 20, 30);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    const { scene: threeScene } = blenderResult.data.threeJsScene;
    const groundGeom = new THREE.PlaneGeometry(
      threeScene.ground.dimensions[0],
      threeScene.ground.dimensions[1]
    );
    const groundMat = new THREE.MeshStandardMaterial({ 
      color: threeScene.ground.color,
      roughness: 0.9
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    const gridHelper = new THREE.GridHelper(
      Math.max(threeScene.ground.dimensions[0], threeScene.ground.dimensions[1]) * 1.5,
      20,
      0x888888,
      0xcccccc
    );
    scene.add(gridHelper);
    
    threeScene.buildings.forEach((b) => {
      const geom = new THREE.BoxGeometry(...b.dimensions);
      const mat = new THREE.MeshStandardMaterial({ 
        color: b.color,
        roughness: 0.5,
        metalness: 0.1
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(b.position[0], b.position[1], b.position[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    });
    
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      scene.rotation.y += 0.002;
      renderer.render(scene, camera);
    };
    animate();
    
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);
    
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
      if (rendererRef.current && container) {
        container.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, [activeTab, blenderResult]);

  const buildings = editedBuildings || result?.buildings;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b bg-white dark:bg-zinc-900 px-6 py-4">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            HYLO-SP
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Phase 3: Polish
            </span>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Architectural Plan Drawer
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Panel - Input */}
          <div className="space-y-6">
            <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
              <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-50">
                1. Upload Image
              </h2>
              
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
                      placeholder="https://example.com/satellite.jpg"
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

            {/* Lot Size Input */}
            <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
              <h3 className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Lot Size (meters)
              </h3>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-zinc-500">Width</label>
                  <input
                    type="number"
                    value={lotSize.width}
                    onChange={(e) => setLotSize({ ...lotSize, width: Number(e.target.value) })}
                    className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-zinc-500">Depth</label>
                  <input
                    type="number"
                    value={lotSize.depth}
                    onChange={(e) => setLotSize({ ...lotSize, depth: Number(e.target.value) })}
                    className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
              </div>
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

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Middle Panel - Output */}
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-xl border bg-white p-6 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
              <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
                  2. Site Plan
                </h2>
                
                {result && (
                  <div className="flex items-center gap-2">
                    {/* Style Selector */}
                    <button
                      onClick={() => setShowStylePanel(!showStylePanel)}
                      className="flex items-center gap-1 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      <Palette className="h-4 w-4" />
                      {renderStyle}
                    </button>
                    
                    {/* Edit Buildings */}
                    <button
                      onClick={() => setShowEditPanel(!showEditPanel)}
                      className="flex items-center gap-1 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    >
                      <Tag className="h-4 w-4" />
                      Edit
                    </button>
                    
                    {/* Export */}
                    <button
                      onClick={() => setShowExportPanel(true)}
                      className="flex items-center gap-1 rounded-lg bg-blue-100 px-3 py-1.5 text-sm text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                    >
                      <FileDown className="h-4 w-4" />
                      Export
                    </button>
                    
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Style Panel */}
              {showStylePanel && result && (
                <div className="mb-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                  <h3 className="mb-3 text-sm font-medium">Render Style</h3>
                  <div className="flex flex-wrap gap-2">
                    {(["realistic", "blueprint", "minimal", "architectural", "bw"] as RenderStyle[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setRenderStyle(s)}
                        className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
                          renderStyle === s
                            ? "bg-blue-600 text-white"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Edit Panel */}
              {showEditPanel && buildings && (
                <div className="mb-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                  <h3 className="mb-3 text-sm font-medium">Edit Buildings</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {buildings.map((b) => (
                      <div key={b.id} className="flex items-center gap-2">
                        <span className="text-sm text-zinc-500 w-20">Building {b.id}:</span>
                        <input
                          type="text"
                          value={b.name || ""}
                          onChange={(e) => handleBuildingNameChange(b.id, e.target.value)}
                          placeholder="Enter name..."
                          className="flex-1 rounded-lg border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Export Panel Modal */}
              {showExportPanel && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                  <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-medium">Export Site Plan</h3>
                      <button onClick={() => setShowExportPanel(false)}>
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium">Format</label>
                        <div className="flex flex-wrap gap-2">
                          {(["svg", "dxf", "pdf", "png", "blend"] as ExportFormat[]).map((f) => (
                            <button
                              key={f}
                              onClick={() => setExportFormat(f)}
                              className={`rounded-lg px-3 py-1.5 text-sm uppercase ${
                                exportFormat === f
                                  ? "bg-blue-600 text-white"
                                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                              }`}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <label className="mb-2 block text-sm font-medium">Include</label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={includeDimensions}
                              onChange={(e) => setIncludeDimensions(e.target.checked)}
                              className="rounded"
                            />
                            <span className="text-sm">Dimensions</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={includeNorthArrow}
                              onChange={(e) => setIncludeNorthArrow(e.target.checked)}
                              className="rounded"
                            />
                            <span className="text-sm">North Arrow</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={includeScaleBar}
                              onChange={(e) => setIncludeScaleBar(e.target.checked)}
                              className="rounded"
                            />
                            <span className="text-sm">Scale Bar</span>
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={includeLabels}
                              onChange={(e) => setIncludeLabels(e.target.checked)}
                              className="rounded"
                            />
                            <span className="text-sm">Labels</span>
                          </label>
                        </div>
                      </div>
                      
                      <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isExporting ? "Generating..." : "Download"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabs */}
              {result && (
                <div className="mb-4 flex gap-2">
                  <button
                    onClick={() => setActiveTab("2d")}
                    className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      activeTab === "2d"
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    <Grid3X3 className="h-4 w-4" />
                    2D Plan
                  </button>
                  <button
                    onClick={() => setActiveTab("3d")}
                    className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      activeTab === "3d"
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    <Box className="h-4 w-4" />
                    3D Model
                  </button>
                </div>
              )}

              {!result ? (
                <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700">
                  <div className="text-center text-zinc-400">
                    <ImageIcon className="mx-auto mb-2 h-8 w-8" />
                    <p className="text-sm">Upload an image and generate</p>
                    <p className="text-xs">to see the site plan</p>
                  </div>
                </div>
              ) : activeTab === "2d" ? (
                <div className="aspect-video overflow-hidden rounded-lg border bg-white dark:bg-zinc-950">
                  <div
                    className="h-full w-full"
                    dangerouslySetInnerHTML={{ __html: result.svg }}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {!blenderResult ? (
                    <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700">
                      <div className="text-center">
                        <Box className="mx-auto mb-2 h-8 w-8 text-zinc-400" />
                        <p className="text-sm text-zinc-500">Generate 3D model</p>
                        <button
                          onClick={handleGenerate3D}
                          disabled={isLoading3D}
                          className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isLoading3D ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Generating...
                            </span>
                          ) : (
                            "Generate 3D"
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      ref={threeContainerRef} 
                      className="aspect-video rounded-lg overflow-hidden"
                    />
                  )}
                  
                  {blenderResult && (
                    <p className="text-xs text-zinc-500 text-center">
                      3D model rendered with Three.js • Drag to rotate
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Building Info */}
            {buildings && buildings.length > 0 && (
              <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-zinc-900 dark:border-zinc-800">
                <h3 className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  Detected Buildings ({buildings.length})
                </h3>
                <ul className="space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {buildings.map((b) => (
                    <li key={b.id}>
                      {b.name || `Building ${b.id}`}: {b.points.length} vertices
                    </li>
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
