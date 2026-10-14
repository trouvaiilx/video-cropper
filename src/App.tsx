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
  rotateCropCw,
  rotateCropCcw,
  rotateAspectRatio,
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
import { NotificationToast, NotificationItem } from './components/NotificationToast';
import { Play, FolderOpen, FileText } from 'lucide-react';
import { SettingsModal } from './components/dialogs/SettingsModal';
import { DiagnosticsModal } from './components/dialogs/DiagnosticsModal';
import { ConfirmOverwriteModal } from './components/dialogs/ConfirmOverwriteModal';
import { AboutModal } from './components/dialogs/AboutModal';
import { ErrorModal } from './components/dialogs/ErrorModal';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const SUPPORTED_VIDEO_EXTENSIONS = [
  'mp4',
  'mkv',
  'mov',
  'avi',
  'webm',
  'm4v',
  'mpg',
  'mpeg',
  'ts',
  'm2ts',
  'mts',
  'wmv',
  'flv',
  'ogv',
  '3gp',
  'vob',
  'divx',
  'f4v',
] as const;

export function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastDot === -1 || lastDot < lastSlash) {
    return '';
  }
  return filePath.substring(lastDot + 1).toLowerCase();
}

export function isSupportedVideoFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return (SUPPORTED_VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

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
          hasAudio: metadata.has_audio,
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
  const [userRotation, setUserRotation] = useState<number>(0);

  // UI / View state
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [showThirds, setShowThirds] = useState<boolean>(true);
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    isValid: boolean | null;
    fileName: string;
  }>({
    isDragging: false,
    isValid: null,
    fileName: '',
  });
  const [statusMessage, setStatusMessage] = useState<string>('Open a video to begin.');

  // Encode state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const [commandText, setCommandText] = useState<string>('');

  // Modals & Notifications
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState<boolean>(false);
  const [diagnosticsText, setDiagnosticsText] = useState<string>('');
  const [aboutOpen, setAboutOpen] = useState<boolean>(false);
  const [overwriteModalPath, setOverwriteModalPath] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState<{ title: string; text: string } | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const toolsRef = useRef<ToolPaths | null>(null);

  const showNotification = useCallback((item: Omit<NotificationItem, 'id'>) => {
    setNotifications((prev) => {
      // If it's a persistent process toast, clear previous process toasts so the new status is clear
      if (item.duration === 0) {
        const withoutPriorProcess = prev.filter(
          (n) => !(n.title === 'Processing Complete' || n.title === 'Processing Failed')
        );
        const id = Math.random().toString(36).substring(2, 9);
        return [...withoutPriorProcess, { ...item, id }];
      }

      if (prev.some((n) => n.title === item.title && n.message === item.message)) {
        return prev;
      }
      const id = Math.random().toString(36).substring(2, 9);
      return [...prev, { ...item, id }];
    });
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const ensureTools = useCallback(async (): Promise<ToolPaths | null> => {
    if (toolsRef.current) return toolsRef.current;
    try {
      const found = await invoke<ToolPaths | null>('get_tools', {
        customFfmpeg: settings.ffmpeg_path || null,
        customFfprobe: settings.ffprobe_path || null,
      });
      if (found) {
        setTools(found);
        toolsRef.current = found;
      }
      return found;
    } catch (e) {
      console.error('Failed to probe tools:', e);
      return null;
    }
  }, [settings.ffmpeg_path, settings.ffprobe_path]);

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
        toolsRef.current = foundTools;
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
        const outPath = event.payload;
        const fileName = outPath.split(/[/\\]/).pop() || outPath;
        setIsRunning(false);
        setIsCancelling(false);
        setProgress(null);
        setStatusMessage(`Done: ${fileName}`);

        showNotification({
          type: 'success',
          title: 'Processing Complete',
          message: fileName,
          duration: 0, // Persistent until dismissed
          actions: [
            {
              label: 'Open Video',
              icon: <Play size={12} className="shrink-0" />,
              variant: 'primary',
              onClick: async () => {
                try {
                  await invoke('open_video', { path: outPath });
                } catch (err) {
                  showNotification({
                    type: 'error',
                    title: 'Failed to open video',
                    message: String(err),
                  });
                }
              },
            },
            {
              label: 'Open Explorer',
              icon: <FolderOpen size={12} className="shrink-0" />,
              variant: 'secondary',
              onClick: async () => {
                try {
                  await invoke('show_in_folder', { path: outPath });
                } catch (err) {
                  showNotification({
                    type: 'error',
                    title: 'Failed to open explorer',
                    message: String(err),
                  });
                }
              },
            },
          ],
        });
      });

      unlistenCancelled = await listen('ffmpeg-cancelled', () => {
        setIsRunning(false);
        setIsCancelling(false);
        setProgress(null);
        setStatusMessage('Cancelled. Partial output removed.');
        showNotification({
          type: 'info',
          title: 'Process Cancelled',
          message: 'Video processing was cancelled. Partial output was removed.',
        });
      });

      unlistenFailed = await listen<string>('ffmpeg-failed', (event) => {
        const errorDetails = event.payload;
        setIsRunning(false);
        setIsCancelling(false);
        setProgress(null);
        setStatusMessage('Video processing failed.');

        const summary =
          errorDetails
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith('ffmpeg version'))
            .pop() || 'Encoding process terminated with an error.';

        showNotification({
          type: 'error',
          title: 'Processing Failed',
          message: summary.length > 120 ? `${summary.substring(0, 120)}…` : summary,
          duration: 0, // Persistent until dismissed
          actions: [
            {
              label: 'View Details',
              icon: <FileText size={12} className="shrink-0" />,
              variant: 'danger',
              onClick: () => {
                setErrorModal({
                  title: 'Video Processing Failed',
                  text: errorDetails,
                });
              },
            },
          ],
        });
      });
    })();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenFinished) unlistenFinished();
      if (unlistenCancelled) unlistenCancelled();
      if (unlistenFailed) unlistenFailed();
    };
  }, [showNotification]);

  // Load Video File
  const loadVideo = useCallback(
    async (filePath: string) => {
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      if (!isSupportedVideoFile(filePath)) {
        const ext = getFileExtension(filePath);
        setStatusMessage('Unsupported file type.');
        showNotification({
          type: 'warning',
          title: 'Unsupported file type',
          message: ext
            ? `"${fileName}" (.${ext}) is not a recognized video file. Supported formats: MP4, MKV, MOV, WebM, AVI, TS, etc.`
            : `"${fileName}" is not a recognized video file. Supported formats: MP4, MKV, MOV, WebM, AVI, TS, etc.`,
        });
        return;
      }

      const resolvedTools = await ensureTools();
      if (!resolvedTools) {
        setStatusMessage('FFmpeg not configured — check Tools → Settings.');
        showNotification({
          type: 'warning',
          title: 'FFmpeg or ffprobe is not configured',
          message: 'Video Cropper needs FFmpeg to probe and process videos. Please set its path in Settings.',
          action: {
            label: 'Open Settings',
            onClick: () => setSettingsOpen(true),
          },
        });
        return;
      }
      try {
        resetPlayback();
        setUserRotation(0);
        setStatusMessage(`Loading ${fileName}…`);

        // Probe metadata
        const metadata = await invoke<VideoMetadata>('probe_video', {
          path: filePath,
          ffprobeExe: resolvedTools.ffprobe,
        });
        setMeta(metadata);

        // Extract 1-frame preview
        const dataUrl = await invoke<string>('extract_preview', {
          path: filePath,
          ffmpegExe: resolvedTools.ffmpeg,
          duration: metadata.duration,
        });
        setPreviewSrc(dataUrl);

        // Start the player in the background (native decode, proxy fallback)
        void setupPlayback(filePath, metadata, resolvedTools.ffmpeg);

        // Detect encoders
        const detectedEncoders = await invoke<EncoderInfo[]>('get_encoders', {
          ffmpegExe: resolvedTools.ffmpeg,
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

        setStatusMessage(`${fileName} — ${metadata.display_width} × ${metadata.display_height}`);
      } catch (err: any) {
        console.error(err);
        const errMsg = String(err);
        if (errMsg.includes('No video stream found')) {
          setStatusMessage('No video stream found.');
          showNotification({
            type: 'warning',
            title: 'No video stream found',
            message: `"${fileName}" does not contain a playable video stream.`,
          });
        } else {
          setStatusMessage('Could not open video.');
          showNotification({
            type: 'error',
            title: 'Could not open video',
            message: errMsg,
          });
        }
      }
    },
    [ensureTools, settings, outputPreset, resetPlayback, setupPlayback, showNotification]
  );

  // Incoming File Handler for Drops
  const lastDropTimeRef = useRef<number>(0);
  const handleIncomingDroppedFiles = useCallback(
    (paths: string[]) => {
      const now = Date.now();
      if (now - lastDropTimeRef.current < 500) {
        return;
      }
      lastDropTimeRef.current = now;

      if (paths.length === 0) return;
      const validPath = paths.find((p) => isSupportedVideoFile(p));
      if (validPath) {
        void loadVideo(validPath);
      } else {
        const first = paths[0];
        const fileName = first.split(/[/\\]/).pop() || first;
        const ext = getFileExtension(first);
        setStatusMessage('Unsupported file type.');
        showNotification({
          type: 'warning',
          title: 'Unsupported file type',
          message: ext
            ? `"${fileName}" (.${ext}) is not a recognized video file. Supported formats: MP4, MKV, MOV, WebM, AVI, TS, etc.`
            : `"${fileName}" is not a recognized video file. Supported formats: MP4, MKV, MOV, WebM, AVI, TS, etc.`,
        });
      }
    },
    [loadVideo, showNotification]
  );

  const handleIncomingDroppedFilesRef = useRef(handleIncomingDroppedFiles);
  handleIncomingDroppedFilesRef.current = handleIncomingDroppedFiles;

  // File Picker
  const handleOpenFileDialog = async () => {
    if (isRunning || isCancelling) {
      showNotification({
        type: 'warning',
        title: 'Encoding in progress',
        message: 'Please wait for or cancel the current encoding before opening another video.',
      });
      return;
    }
    const resolvedTools = await ensureTools();
    if (!resolvedTools) {
      showNotification({
        type: 'warning',
        title: 'FFmpeg or ffprobe is not configured',
        message: 'Please configure FFmpeg paths in Settings before opening videos.',
        action: {
          label: 'Open Settings',
          onClick: () => setSettingsOpen(true),
        },
      });
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

  // Rotation changes
  const handleRotate = useCallback(
    (deltaDegrees: number) => {
      if (!meta) return;
      const nextRotation = ((userRotation + deltaDegrees) % 360 + 360) % 360;
      setUserRotation(nextRotation);

      let newCrop: CropConfig;
      let newRatio: AspectRatio = selectedRatio;

      if (deltaDegrees === 90 || deltaDegrees === -270) {
        newCrop = rotateCropCw(crop);
        newRatio = rotateAspectRatio(selectedRatio);
      } else if (deltaDegrees === -90 || deltaDegrees === 270) {
        newCrop = rotateCropCcw(crop);
        newRatio = rotateAspectRatio(selectedRatio);
      } else {
        return;
      }

      setSelectedRatio(newRatio);
      setCrop(newCrop);

      const [ow, oh] = computeOutputSize(newCrop.width, newCrop.height, outputPreset, outputW, outputH);
      setOutputW(ow);
      setOutputH(oh);

      setStatusMessage(`Rotated ${nextRotation}° — ${newCrop.bound_w} × ${newCrop.bound_h}`);
    },
    [meta, userRotation, crop, selectedRatio, outputPreset, outputW, outputH]
  );

  const handleRotateCw = useCallback(() => handleRotate(90), [handleRotate]);
  const handleRotateCcw = useCallback(() => handleRotate(-90), [handleRotate]);

  const handleResetRotation = useCallback(() => {
    if (!meta || userRotation === 0) return;
    const delta = (360 - userRotation) % 360;
    if (delta === 90) {
      handleRotate(90);
    } else if (delta === 180) {
      const c1 = rotateCropCw(crop);
      const r1 = rotateAspectRatio(selectedRatio);
      const c2 = rotateCropCw(c1);
      const r2 = rotateAspectRatio(r1);
      setUserRotation(0);
      setSelectedRatio(r2);
      setCrop(c2);
      const [ow, oh] = computeOutputSize(c2.width, c2.height, outputPreset, outputW, outputH);
      setOutputW(ow);
      setOutputH(oh);
      setStatusMessage(`Reset rotation to 0° — ${c2.bound_w} × ${c2.bound_h}`);
    } else if (delta === 270) {
      handleRotate(-90);
    }
  }, [meta, userRotation, crop, selectedRatio, outputPreset, outputW, outputH, handleRotate]);

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
      user_rotation: userRotation,
      state: 'running',
    };

    try {
      setIsRunning(true);
      setIsCancelling(false);
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
      setIsCancelling(false);
      if (err === 'NEEDS_CONFIRM') {
        setOverwriteModalPath(outputPath);
      } else {
        showNotification({
          type: 'error',
          title: 'Validation failed',
          message: String(err),
        });
        setStatusMessage('Validation failed.');
      }
    }
  };

  const handleStart = () => executeStartEncode(false);

  const handleCancel = async () => {
    if (isCancelling) return;
    try {
      setIsCancelling(true);
      setStatusMessage('Cancelling…');
      await invoke('cancel_encode');
    } catch (e) {
      console.error('Cancel encode failed:', e);
      setIsCancelling(false);
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

  const handleExit = useCallback(async () => {
    try {
      await getCurrentWindow().close();
    } catch {
      invoke('exit_app').catch((e) => {
        console.error('Failed to exit application:', e);
      });
    }
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          (target.tagName === 'INPUT' &&
            (target as HTMLInputElement).type !== 'range' &&
            (target as HTMLInputElement).type !== 'checkbox' &&
            (target as HTMLInputElement).type !== 'button'));

      if (e.ctrlKey && e.shiftKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        handleExit();
        return;
      }
      if (e.ctrlKey) {
        if (e.key === 'o' || e.key === 'O') {
          e.preventDefault();
          handleOpenFileDialog();
        } else if (e.key === 'r' || e.key === 'R') {
          e.preventDefault();
          if (!isRunning && !isCancelling && meta) handleStart();
        } else if (e.key === '0') {
          e.preventDefault();
          canvasRef.current?.fitView();
        } else if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          canvasRef.current?.zoomIn();
        } else if (e.key === '-') {
          e.preventDefault();
          canvasRef.current?.zoomOut();
        } else if (e.key === ']') {
          e.preventDefault();
          if (meta) handleRotateCw();
        } else if (e.key === '[') {
          e.preventDefault();
          if (meta) handleRotateCcw();
        }
      } else if (!isInput) {
        if (e.key === ']') {
          e.preventDefault();
          if (meta) handleRotateCw();
        } else if (e.key === '[') {
          e.preventDefault();
          if (meta) handleRotateCcw();
        } else if (e.key === 'g' || e.key === 'G') {
          e.preventDefault();
          setShowThirds((prev) => !prev);
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          if (meta) {
            setCropView((prev) => !prev);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExit, handleOpenFileDialog, handleStart, handleRotateCw, handleRotateCcw, isRunning, isCancelling, meta]);

  // Window Drag & Drop (Full Window)
  useEffect(() => {
    let unlistenTauriDrag: (() => void) | undefined;
    let isMounted = true;

    // 1. Tauri v2 official window drag-and-drop listener
    getCurrentWindow()
      .onDragDropEvent((event) => {
        if (!isMounted) return;
        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          const paths = 'paths' in event.payload ? event.payload.paths : [];
          if (paths && paths.length > 0) {
            const hasVideo = paths.some(isSupportedVideoFile);
            const fname = paths[0].split(/[/\\]/).pop() || '';
            setDragState({
              isDragging: true,
              isValid: hasVideo,
              fileName: fname,
            });
          } else {
            setDragState((prev) => ({
              ...prev,
              isDragging: true,
            }));
          }
        } else if (event.payload.type === 'leave') {
          setDragState({
            isDragging: false,
            isValid: null,
            fileName: '',
          });
        } else if (event.payload.type === 'drop') {
          setDragState({
            isDragging: false,
            isValid: null,
            fileName: '',
          });
          const paths = event.payload.paths;
          if (paths && paths.length > 0) {
            handleIncomingDroppedFilesRef.current(paths);
          }
        }
      })
      .then((unlisten) => {
        if (!isMounted) {
          unlisten();
        } else {
          unlistenTauriDrag = unlisten;
        }
      })
      .catch((e) => {
        console.warn('Tauri onDragDropEvent listener fallback', e);
      });

    // 2. HTML5 drag-and-drop events: preventDefault to stop default browser navigation
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      isMounted = false;
      if (unlistenTauriDrag) unlistenTauriDrag();
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg-dark text-fg-primary">
      {/* Top Menubar & Action Bar */}
      <Toolbar
        zoomPercent={Math.round(zoomPercent * 100)}
        showThirds={showThirds}
        cropView={cropView}
        hasVideo={!!meta}
        userRotation={userRotation}
        isRunning={isRunning}
        isCancelling={isCancelling}
        onOpenVideo={handleOpenFileDialog}
        onFit={() => canvasRef.current?.fitView()}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onRotateCw={handleRotateCw}
        onRotateCcw={handleRotateCcw}
        onResetRotation={handleResetRotation}
        onToggleThirds={() => setShowThirds(!showThirds)}
        onToggleCropView={() => setCropView((v) => !v)}
        onStartExport={meta ? handleStart : undefined}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenDiagnostics={handleOpenDiagnostics}
        onOpenAbout={() => setAboutOpen(true)}
        onExit={handleExit}
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
              userRotation={userRotation}
              onCropChange={handleCropChange}
              onZoomChange={setZoomPercent}
            />
          </div>

          <PlayerBar
            videoRef={videoRef}
            status={playback.status}
            kind={playback.kind}
            duration={meta?.duration || 0}
            fps={meta?.fps || 30}
            cropView={cropView}
            hasVideo={!!meta}
            hasAudio={!!meta?.has_audio}
            shortcutsEnabled={!settingsOpen && !diagnosticsOpen && !aboutOpen && !overwriteModalPath}
            onToggleCropView={() => setCropView((v) => !v)}
          />

          {/* Decode surface for the player; frames are painted onto the canvas, never shown directly. */}
          <video
            ref={videoRef}
            loop
            playsInline
            preload="auto"
            className="absolute w-px h-px opacity-0 pointer-events-none"
          />
        </div>

        {/* Right: Controls & Info Sidebar */}
        <div className="w-[340px] shrink-0 border-l border-border-subtle bg-bg-panel flex flex-col h-full overflow-hidden">
          {/* Scrollable Upper Controls Area */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 space-y-2.5">
            <SourceMetadataPanel meta={meta} userRotation={userRotation} />

            <CropControlsPanel
              crop={crop}
              selectedRatio={selectedRatio}
              disabled={!meta || isRunning || isCancelling}
              userRotation={userRotation}
              onCropChange={handleCropChange}
              onRatioChange={handleRatioChange}
              onRotateCw={handleRotateCw}
              onRotateCcw={handleRotateCcw}
              onResetRotation={handleResetRotation}
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
              disabled={!meta || isRunning || isCancelling}
              onPresetChange={handlePresetChange}
              onSizeChange={handleSizeChange}
              onEncoderChange={setSelectedEncoder}
              onPathChange={setOutputPath}
              onBrowse={handleBrowseOutput}
            />
          </div>

          {/* Sticky Bottom: Progress & Export Panel */}
          <div className="shrink-0 p-2.5 bg-bg-panel border-t border-border-subtle/50">
            <ProgressPanel
              isRunning={isRunning}
              isCancelling={isCancelling}
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
            toolsRef.current = resolved;
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

      {/* Error Details Modal */}
      {errorModal && (
        <ErrorModal
          title={errorModal.title}
          errorText={errorModal.text}
          onClose={() => setErrorModal(null)}
        />
      )}

      {/* Full-UI Drag & Drop Zone Overlay */}
      <DropOverlay
        isDragging={dragState.isDragging}
        isValid={dragState.isValid}
        fileName={dragState.fileName}
      />

      {/* In-App Floating Notification Toasts */}
      <NotificationToast
        notifications={notifications}
        onDismiss={dismissNotification}
      />
    </div>
  );
};
