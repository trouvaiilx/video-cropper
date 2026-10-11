import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  AspectRatio,
  CropConfig,
  EncoderInfo,
  ProcessingJob,
  ProgressUpdate,
  ToolPaths,
  VideoMetadata,
  AppSettings,
} from './types';
import {
  PRESET_RATIOS,
  applyAspectRatio,
  computeOutputSize,
  getRatioValue,
} from './utils/coordinates';
import { CropCanvas, CropCanvasHandle } from './components/canvas/CropCanvas';
import { SourceMetadataPanel } from './components/panels/SourceMetadataPanel';
import { CropControlsPanel } from './components/panels/CropControlsPanel';
import { OutputControlsPanel } from './components/panels/OutputControlsPanel';
import { ProgressPanel } from './components/panels/ProgressPanel';
import { Toolbar } from './components/Toolbar';
import { PlayerBar } from './components/player/PlayerBar';
import {
  NO_PLAYBACK,
  PlaybackState,
  attachSource,
  previewSeekTime,
  resetVideo,
} from './utils/playback';
import { DropOverlay } from './components/DropOverlay';
import { SettingsModal } from './components/dialogs/SettingsModal';
import { DiagnosticsModal } from './components/dialogs/DiagnosticsModal';
import { ConfirmOverwriteModal } from './components/dialogs/ConfirmOverwriteModal';
import { AboutModal } from './components/dialogs/AboutModal';

export const App: React.FC = () => {
  // References
  const canvasRef = useRef<CropCanvasHandle>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackToken = useRef(0);

  // Playback (native <video>, proxy fallback) & crop view
  const [playback, setPlayback] = useState<PlaybackState>(NO_PLAYBACK);
  const [cropView, setCropView] = useState<boolean>(false);

  const resetPlayback = useCallback(() => {
    playbackToken.current += 1;
    invoke('cancel_playback_proxy').catch(() => {});
    if (videoRef.current) resetVideo(videoRef.current);
    setPlayback(NO_PLAYBACK);
  }, []);

  // Native decode first; if the webview can't decode the file, build a small proxy.
  // `playbackToken` makes superseded loads harmless (results are dropped, never applied).
  const setupPlayback = useCallback(
    async (filePath: string, metadata: VideoMetadata, ffmpegExe: string) => {
      const video = videoRef.current;
      if (!video) return;

      const token = ++playbackToken.current;
      const stale = () => token !== playbackToken.current;
      const start = previewSeekTime(metadata.duration);
      const aspect = metadata.display_width / Math.max(1, metadata.display_height);

      setPlayback({ status: 'preparing', kind: null });
      try {
        await invoke('allow_playback', { path: filePath });
        if (stale()) return;

        if (await attachSource(video, convertFileSrc(filePath), start, aspect)) {
          if (!stale()) setPlayback({ status: 'ready', kind: 'native' });
          return;
        }
        if (stale()) return;

        resetVideo(video);
        const proxyPath = await invoke<string>('build_playback_proxy', {
          path: filePath,
          ffmpegExe,
        });
        if (stale()) return;

        if (await attachSource(video, convertFileSrc(proxyPath), start, aspect)) {
          if (!stale()) setPlayback({ status: 'ready', kind: 'proxy' });
          return;
        }
        if (stale()) return;
        resetVideo(video);
        setPlayback({ status: 'unavailable', kind: null });
      } catch (e) {
        console.error('Playback setup failed:', e);
        if (!stale()) {
          resetVideo(video);
          setPlayback({ status: 'unavailable', kind: null });
        }
      }
    },
    []
  );

  // Tools & Settings
  const [tools, setTools] = useState<ToolPaths | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    last_dir: '',
    last_output_dir: '',
    encoder: 'libx264',
    ratio: 'Free',
    resolution_preset: 'Original Crop',
    ffmpeg_path: '',
    ffprobe_path: '',
    show_thirds: true,
  });

  // Media & Processing state
  const [meta, setMeta] = useState<VideoMetadata | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [encoders, setEncoders] = useState<EncoderInfo[]>([]);
  const [crop, setCrop] = useState<CropConfig>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    bound_w: 0,
    bound_h: 0,
  });
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio>(PRESET_RATIOS[0]);
  const [outputPreset, setOutputPreset] = useState<string>('Original Crop');
  const [outputW, setOutputW] = useState<number>(0);
  const [outputH, setOutputH] = useState<number>(0);
  const [selectedEncoder, setSelectedEncoder] = useState<string>('libx264');
  const [outputPath, setOutputPath] = useState<string>('');

  // UI / View state
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [showThirds, setShowThirds] = useState<boolean>(true);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Open a video to begin.');

  // Encode state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [commandText, setCommandText] = useState<string>('');

  // Modals
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState<boolean>(false);
  const [diagnosticsText, setDiagnosticsText] = useState<string>('');
  const [aboutOpen, setAboutOpen] = useState<boolean>(false);
  const [overwriteModalPath, setOverwriteModalPath] = useState<string | null>(null);

  // Initialize
  useEffect(() => {
    (async () => {
      try {
        const loadedSettings = await invoke<AppSettings>('get_settings');
        setSettings(loadedSettings);
        setShowThirds(loadedSettings.show_thirds);
        setOutputPreset(loadedSettings.resolution_preset || 'Original Crop');
        setSelectedEncoder(loadedSettings.encoder || 'libx264');

        const foundTools = await invoke<ToolPaths | null>('get_tools', {
          customFfmpeg: loadedSettings.ffmpeg_path || null,
          customFfprobe: loadedSettings.ffprobe_path || null,
        });
        setTools(foundTools);
        if (!foundTools) {
          setStatusMessage('FFmpeg not found — configure its location in Tools → Settings.');
        }
      } catch (e) {
        console.error('Initialization error:', e);
      }
    })();
  }, []);

  // Listen to Tauri progress events
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenFinished: (() => void) | undefined;
    let unlistenCancelled: (() => void) | undefined;
    let unlistenFailed: (() => void) | undefined;

    (async () => {
      unlistenProgress = await listen<ProgressUpdate>('ffmpeg-progress', (event) => {
        setProgress(event.payload);
      });

      unlistenFinished = await listen<string>('ffmpeg-finished', (event) => {
        setIsRunning(false);
        setStatusMessage(`Done: ${event.payload}`);
      });

      unlistenCancelled = await listen('ffmpeg-cancelled', () => {
        setIsRunning(false);
        setProgress(null);
        setStatusMessage('Cancelled. Partial output removed.');
      });

      unlistenFailed = await listen<string>('ffmpeg-failed', (event) => {
        setIsRunning(false);
        setStatusMessage('Video processing failed.');
        alert(event.payload);
      });
    })();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenFinished) unlistenFinished();
      if (unlistenCancelled) unlistenCancelled();
      if (unlistenFailed) unlistenFailed();
    };
  }, []);

  // Load Video File
  const loadVideo = useCallback(
    async (filePath: string) => {
      if (!tools) {
        alert('FFmpeg or ffprobe is not configured. Please check Tools → Settings.');
        return;
      }
      try {
        resetPlayback();
        setStatusMessage(`Loading ${filePath.split(/[/\\]/).pop()}…`);

        // Probe metadata
        const metadata = await invoke<VideoMetadata>('probe_video', {
          path: filePath,
          ffprobeExe: tools.ffprobe,
        });
        setMeta(metadata);

        // Extract 1-frame preview
        const dataUrl = await invoke<string>('extract_preview', {
          path: filePath,
          ffmpegExe: tools.ffmpeg,
          duration: metadata.duration,
        });
        setPreviewSrc(dataUrl);

        // Start the player in the background (native decode, proxy fallback)
        void setupPlayback(filePath, metadata, tools.ffmpeg);

        // Detect encoders
        const detectedEncoders = await invoke<EncoderInfo[]>('get_encoders', {
          ffmpegExe: tools.ffmpeg,
        });
        setEncoders(detectedEncoders);

        // Pick encoder (prefer saved, else libx264)
        const availIds = detectedEncoders.filter((e) => e.available).map((e) => e.id);
        if (availIds.includes(settings.encoder)) {
          setSelectedEncoder(settings.encoder);
        } else if (availIds.includes('libx264')) {
          setSelectedEncoder('libx264');
        } else if (availIds.length > 0) {
          setSelectedEncoder(availIds[0]);
        }

        // Full frame default crop
        const initialCrop: CropConfig = {
          x: 0,
          y: 0,
          width: metadata.display_width,
          height: metadata.display_height,
          bound_w: metadata.display_width,
          bound_h: metadata.display_height,
        };
        setCrop(initialCrop);

        // Recompute output size
        const [ow, oh] = computeOutputSize(
          initialCrop.width,
          initialCrop.height,
          outputPreset
        );
        setOutputW(ow);
        setOutputH(oh);

        // Suggest output path
        const suggested = await invoke<string>('suggest_output_path', {
          inputPath: filePath,
          lastOutputDir: settings.last_output_dir || null,
        });
        setOutputPath(suggested);

        // Save last input dir
        const parentDir = filePath.substring(0, Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')));
        const updated = { ...settings, last_dir: parentDir };
        setSettings(updated);
        await invoke('set_settings', { settings: updated });

        const fname = filePath.split(/[/\\]/).pop() || '';
        setStatusMessage(`${fname} — ${metadata.display_width} × ${metadata.display_height}`);
      } catch (err: any) {
        console.error(err);
        setStatusMessage('Could not open video.');
        alert(`Could not open video:\n${err}`);
      }
    },
    [tools, settings, outputPreset, resetPlayback, setupPlayback]
  );

  // File Picker
  const handleOpenFileDialog = async () => {
    if (isRunning) {
      alert('Stop the current encoding before opening another video.');
      return;
    }
    try {
      const selected = await invoke<string | null>('select_input_file', {
        defaultDir: settings.last_dir || null,
      });
      if (selected) {
        await loadVideo(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBrowseOutput = async () => {
    try {
      const selected = await invoke<string | null>('select_output_file', {
        defaultPath: outputPath || null,
      });
      if (selected) {
        setOutputPath(selected);
        const parentDir = selected.substring(0, Math.max(selected.lastIndexOf('/'), selected.lastIndexOf('\\')));
        const updated = { ...settings, last_output_dir: parentDir };
        setSettings(updated);
        await invoke('set_settings', { settings: updated });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Crop / Ratio changes
  const handleCropChange = (newCrop: CropConfig) => {
    setCrop(newCrop);
    const [ow, oh] = computeOutputSize(newCrop.width, newCrop.height, outputPreset, outputW, outputH);
    setOutputW(ow);
    setOutputH(oh);
  };

  const handleRatioChange = (newRatio: AspectRatio) => {
    setSelectedRatio(newRatio);
    if (crop.width > 0 && crop.height > 0) {
      const updated = applyAspectRatio(crop, newRatio);
      handleCropChange(updated);
    }
  };

  const handlePresetChange = (preset: string) => {
    setOutputPreset(preset);
    const [ow, oh] = computeOutputSize(crop.width, crop.height, preset, outputW, outputH);
    setOutputW(ow);
    setOutputH(oh);
  };

  const handleSizeChange = (w: number, h: number) => {
    setOutputW(w);
    setOutputH(h);
  };

  // Encoding
  const executeStartEncode = async (allowOverwrite: boolean) => {
    if (!meta || !tools) return;
    videoRef.current?.pause();

    const job: ProcessingJob = {
      input_path: meta.path,
      output_path: outputPath,
      crop,
      output_width: outputW,
      output_height: outputH,
      encoder: selectedEncoder,
      has_audio: meta.has_audio,
      duration: meta.duration,
      rotation: meta.rotation,
      state: 'running',
    };

    try {
      setIsRunning(true);
      setStatusMessage('Starting FFmpeg…');
      setProgress(null);

      const cmd = await invoke<string>('start_encode', {
        job,
        ffmpegExe: tools.ffmpeg,
        allowOverwrite,
      });

      setCommandText(cmd);
    } catch (err: any) {
      setIsRunning(false);
      if (err === 'NEEDS_CONFIRM') {
        setOverwriteModalPath(outputPath);
      } else {
        alert(err);
        setStatusMessage('Validation failed.');
      }
    }
  };

  const handleStart = () => executeStartEncode(false);

  const handleCancel = async () => {
    try {
      setStatusMessage('Cancelling…');
      await invoke('cancel_encode');
    } catch (e) {
      console.error(e);
    }
  };

  // Diagnostics
  const handleOpenDiagnostics = async () => {
    try {
      const text = await invoke<string>('get_diagnostics', {
        ffmpegExe: tools?.ffmpeg || null,
        ffprobeExe: tools?.ffprobe || null,
      });
      setDiagnosticsText(text);
      setDiagnosticsOpen(true);
    } catch (e) {
      console.error(e);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        if (e.key === 'o' || e.key === 'O') {
          e.preventDefault();
          handleOpenFileDialog();
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          if (!isRunning && meta) handleStart();
        } else if (e.key === '0') {
          e.preventDefault();
          canvasRef.current?.fitView();
        } else if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          canvasRef.current?.zoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          canvasRef.current?.zoomOut();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleOpenFileDialog, isRunning, meta]);

  // Window Drag & Drop
  useEffect(() => {
    let unlistenDrop: (() => void) | undefined;
    (async () => {
      unlistenDrop = await listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
        setIsDraggingFile(false);
        const paths = event.payload.paths;
        if (paths && paths.length > 0) {
          await loadVideo(paths[0]);
        }
      });
    })();

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingFile(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        setIsDraggingFile(false);
      }
    };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingFile(false);
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        // In Tauri webview, File object has .path property
        const localPath = (file as any).path;
        if (localPath) {
          await loadVideo(localPath);
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      if (unlistenDrop) unlistenDrop();
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [loadVideo]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg-dark text-fg-primary">
      {/* Top Menubar & Action Bar */}
      <Toolbar
        zoomPercent={Math.round(zoomPercent * 100)}
        showThirds={showThirds}
        hasVideo={!!meta}
        onOpenVideo={handleOpenFileDialog}
        onFit={() => canvasRef.current?.fitView()}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onToggleThirds={() => setShowThirds(!showThirds)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenDiagnostics={handleOpenDiagnostics}
        onOpenAbout={() => setAboutOpen(true)}
      />

      {/* Main Workspace (Canvas + Side Panel) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Viewport / Interactive Canvas + Player */}
        <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-bg-dark">
          <div className="flex-1 min-h-0 relative overflow-hidden">
            <CropCanvas
              ref={canvasRef}
              previewSrc={previewSrc}
              meta={meta}
              crop={crop}
              ratioLock={getRatioValue(selectedRatio)}
              showThirds={showThirds}
              videoRef={videoRef}
              videoReady={playback.status === 'ready'}
              cropView={cropView}
              onCropChange={handleCropChange}
              onZoomChange={setZoomPercent}
            />
            <DropOverlay isDragging={isDraggingFile} />
          </div>

          <PlayerBar
            videoRef={videoRef}
            status={playback.status}
            kind={playback.kind}
            duration={meta?.duration || 0}
            fps={meta?.fps || 30}
            cropView={cropView}
            hasVideo={!!meta}
            shortcutsEnabled={!settingsOpen && !diagnosticsOpen && !aboutOpen && !overwriteModalPath}
            onToggleCropView={() => setCropView((v) => !v)}
          />

          {/* Decode surface for the player; frames are painted onto the canvas, never shown directly. */}
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload="auto"
            className="absolute w-px h-px opacity-0 pointer-events-none"
          />
        </div>

        {/* Right: Controls & Info Sidebar */}
        <div className="w-[340px] shrink-0 border-l border-border-subtle bg-bg-panel overflow-y-auto p-2.5 space-y-2.5">
          <SourceMetadataPanel meta={meta} />

          <CropControlsPanel
            crop={crop}
            selectedRatio={selectedRatio}
            disabled={!meta || isRunning}
            onCropChange={handleCropChange}
            onRatioChange={handleRatioChange}
          />

          <OutputControlsPanel
            preset={outputPreset}
            outputW={outputW}
            outputH={outputH}
            cropW={crop.width}
            cropH={crop.height}
            encoders={encoders}
            selectedEncoder={selectedEncoder}
            outputPath={outputPath}
            disabled={!meta || isRunning}
            onPresetChange={handlePresetChange}
            onSizeChange={handleSizeChange}
            onEncoderChange={setSelectedEncoder}
            onPathChange={setOutputPath}
            onBrowse={handleBrowseOutput}
          />

          <ProgressPanel
            isRunning={isRunning}
            statusMessage={statusMessage}
            progress={progress}
            totalDuration={meta?.duration || 0}
            commandText={commandText}
            disabled={!meta}
            onStart={handleStart}
            onCancel={handleCancel}
          />
        </div>
      </div>

      {/* Status Bar */}
      <div className="h-6 border-t border-border-subtle bg-bg-panel px-3 flex items-center justify-between text-[11px] text-fg-muted select-none">
        <span className="truncate">{statusMessage}</span>
        <span className="font-mono text-[10px] shrink-0">
          {tools ? 'FFmpeg Ready' : 'FFmpeg Missing'}
        </span>
      </div>

      {/* Modals */}
      {settingsOpen && (
        <SettingsModal
          ffmpegPath={settings.ffmpeg_path}
          ffprobePath={settings.ffprobe_path}
          onSave={async (ff, fp) => {
            const updated = { ...settings, ffmpeg_path: ff, ffprobe_path: fp };
            setSettings(updated);
            await invoke('set_settings', { settings: updated });
            const resolved = await invoke<ToolPaths | null>('get_tools', {
              customFfmpeg: ff || null,
              customFfprobe: fp || null,
            });
            setTools(resolved);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {diagnosticsOpen && (
        <DiagnosticsModal
          diagnosticsText={diagnosticsText}
          onClose={() => setDiagnosticsOpen(false)}
        />
      )}

      {overwriteModalPath && (
        <ConfirmOverwriteModal
          filePath={overwriteModalPath}
          onConfirm={() => {
            setOverwriteModalPath(null);
            executeStartEncode(true);
          }}
          onCancel={() => setOverwriteModalPath(null)}
        />
      )}

      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
};
