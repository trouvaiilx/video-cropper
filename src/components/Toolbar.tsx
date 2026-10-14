import React, { useState, useRef, useEffect } from 'react';
import {
  FolderOpen,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Play,
  Grid,
  Settings,
  Activity,
  HelpCircle,
} from 'lucide-react';

interface ToolbarProps {
  zoomPercent: number;
  showThirds: boolean;
  hasVideo: boolean;
  userRotation: number;
  isRunning?: boolean;
  isCancelling?: boolean;
  onOpenVideo: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotateCw: () => void;
  onRotateCcw: () => void;
  onResetRotation: () => void;
  onToggleThirds: () => void;
  onStartExport?: () => void;
  onOpenSettings: () => void;
  onOpenDiagnostics: () => void;
  onOpenAbout: () => void;
  onExit: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  zoomPercent,
  showThirds,
  hasVideo,
  userRotation,
  isRunning = false,
  isCancelling = false,
  onOpenVideo,
  onFit,
  onZoomIn,
  onZoomOut,
  onRotateCw,
  onRotateCcw,
  onResetRotation,
  onToggleThirds,
  onStartExport,
  onOpenSettings,
  onOpenDiagnostics,
  onOpenAbout,
  onExit,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleMenuClick = (menuName: string) => {
    setActiveMenu((prev) => (prev === menuName ? null : menuName));
  };

  const handleMenuMouseEnter = (menuName: string) => {
    if (activeMenu !== null) {
      setActiveMenu(menuName);
    }
  };

  return (
    <div className="flex flex-col border-b border-border-subtle bg-bg-panel select-none">
      {/* Top Menu Bar */}
      <div
        ref={menuBarRef}
        className="flex items-center gap-1 px-2 py-0.5 border-b border-border-subtle/50 text-[11px]"
      >
        {/* File Menu */}
        <div className="relative">
          <button
            onClick={() => handleMenuClick('file')}
            onMouseEnter={() => handleMenuMouseEnter('file')}
            className={`px-2 py-0.5 rounded hover:bg-bg-hover text-fg-primary ${
              activeMenu === 'file' ? 'bg-bg-hover' : ''
            }`}
          >
            File
          </button>
          {activeMenu === 'file' && (
            <div className="absolute top-full left-0 mt-0.5 w-52 min-w-[210px] bg-bg-panel border border-border-subtle rounded shadow-lg py-1 z-50 text-xs">
              <button
                onClick={() => {
                  setActiveMenu(null);
                  onOpenVideo();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover flex justify-between items-center text-fg-primary"
              >
                <span className="whitespace-nowrap">Open Video…</span>
                <span className="text-[10px] text-fg-muted font-mono tracking-tight shrink-0 whitespace-nowrap ml-3">Ctrl+O</span>
              </button>
              {onStartExport && (
                <button
                  onClick={() => {
                    setActiveMenu(null);
                    onStartExport();
                  }}
                  disabled={!hasVideo || isRunning || isCancelling}
                  className="w-full text-left px-3 py-1.5 hover:bg-bg-hover flex justify-between items-center text-fg-primary disabled:opacity-40"
                >
                  <span className="whitespace-nowrap">Export Video…</span>
                  <span className="text-[10px] text-fg-muted font-mono tracking-tight shrink-0 whitespace-nowrap ml-3">Ctrl+R</span>
                </button>
              )}
              <div className="my-1 border-t border-border-subtle/50" />
              <button
                onClick={() => {
                  setActiveMenu(null);
                  onExit();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover flex justify-between items-center text-fg-primary"
              >
                <span className="whitespace-nowrap">Exit</span>
                <span className="text-[10px] text-fg-muted font-mono tracking-tight shrink-0 whitespace-nowrap ml-3">Ctrl+Shift+Q</span>
              </button>
            </div>
          )}
        </div>

        {/* View Menu */}
        <div className="relative">
          <button
            onClick={() => handleMenuClick('view')}
            onMouseEnter={() => handleMenuMouseEnter('view')}
            className={`px-2 py-0.5 rounded hover:bg-bg-hover text-fg-primary ${
              activeMenu === 'view' ? 'bg-bg-hover' : ''
            }`}
          >
            View
          </button>
          {activeMenu === 'view' && (
            <div className="absolute top-full left-0 mt-0.5 w-68 min-w-[275px] bg-bg-panel border border-border-subtle rounded shadow-lg py-1 z-50 text-xs">
              <button
                onClick={() => {
                  setActiveMenu(null);
                  onFit();
                }}
                disabled={!hasVideo}
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover flex justify-between items-center text-fg-primary disabled:opacity-40"
              >
                <span className="whitespace-nowrap">Fit</span>
                <span className="text-[10px] text-fg-muted font-mono tracking-tight shrink-0 whitespace-nowrap ml-4">Ctrl+0</span>
              </button>
              <button
                onClick={() => {
                  setActiveMenu(null);
                  onZoomIn();
                }}
                disabled={!hasVideo}
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover flex justify-between items-center text-fg-primary disabled:opacity-40"
              >
                <span className="whitespace-nowrap">Zoom In</span>
                <span className="text-[10px] text-fg-muted font-mono tracking-tight shrink-0 whitespace-nowrap ml-4">Ctrl+=</span>
              </button>
              <button
                onClick={() => {
                  setActiveMenu(null);
                  onZoomOut();
                }}
                disabled={!hasVideo}
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover flex justify-between items-center text-fg-primary disabled:opacity-40"
              >
                <span className="whitespace-nowrap">Zoom Out</span>
                <span className="text-[10px] text-fg-muted font-mono tracking-tight shrink-0 whitespace-nowrap ml-4">Ctrl+-</span>
              </button>
              <div className="my-1 border-t border-border-subtle/50" />
              <button
                onClick={() => {
                  setActiveMenu(null);
                  onRotateCw();
                }}
                disabled={!hasVideo}
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover flex justify-between items-center text-fg-primary disabled:opacity-40"
              >
                <span className="whitespace-nowrap">Rotate 90° Clockwise</span>
                <span className="text-[10px] text-fg-muted font-mono tracking-tight shrink-0 whitespace-nowrap ml-4">Ctrl+]</span>
              </button>
              <button
                onClick={() => {
                  setActiveMenu(null);
                  onRotateCcw();
                }}
                disabled={!hasVideo}
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover flex justify-between items-center text-fg-primary disabled:opacity-40"
              >
                <span className="whitespace-nowrap">Rotate 90° Counter-Clockwise</span>
                <span className="text-[10px] text-fg-muted font-mono tracking-tight shrink-0 whitespace-nowrap ml-4">Ctrl+[</span>
              </button>
              {userRotation !== 0 && (
                <button
                  onClick={() => {
                    setActiveMenu(null);
                    onResetRotation();
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-bg-hover flex justify-between items-center text-fg-primary"
                >
                  <span className="whitespace-nowrap">Reset Rotation</span>
                  <span className="text-[10px] text-fg-muted font-mono tracking-tight shrink-0 whitespace-nowrap ml-4">0°</span>
                </button>
              )}
              <div className="my-1 border-t border-border-subtle/50" />
              <button
                onClick={() => {
                  setActiveMenu(null);
                  onToggleThirds();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover flex items-center gap-2 text-fg-primary"
              >
                <input
                  type="checkbox"
                  checked={showThirds}
                  onChange={() => {}}
                  className="rounded bg-bg-input border-border-subtle"
                />
                <span className="whitespace-nowrap">Rule-of-thirds grid</span>
              </button>
            </div>
          )}
        </div>

        {/* Tools Menu */}
        <div className="relative">
          <button
            onClick={() => handleMenuClick('tools')}
            onMouseEnter={() => handleMenuMouseEnter('tools')}
            className={`px-2 py-0.5 rounded hover:bg-bg-hover text-fg-primary ${
              activeMenu === 'tools' ? 'bg-bg-hover' : ''
            }`}
          >
            Tools
          </button>
          {activeMenu === 'tools' && (
            <div className="absolute top-full left-0 mt-0.5 w-44 bg-bg-panel border border-border-subtle rounded shadow-lg py-1 z-50 text-xs">
              <button
                onClick={() => {
                  setActiveMenu(null);
                  onOpenSettings();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg-primary"
              >
                Settings…
              </button>
              <button
                onClick={() => {
                  setActiveMenu(null);
                  onOpenDiagnostics();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg-primary"
              >
                Diagnostics…
              </button>
            </div>
          )}
        </div>

        {/* Help Menu */}
        <div className="relative">
          <button
            onClick={() => handleMenuClick('help')}
            onMouseEnter={() => handleMenuMouseEnter('help')}
            className={`px-2 py-0.5 rounded hover:bg-bg-hover text-fg-primary ${
              activeMenu === 'help' ? 'bg-bg-hover' : ''
            }`}
          >
            Help
          </button>
          {activeMenu === 'help' && (
            <div className="absolute top-full left-0 mt-0.5 w-36 bg-bg-panel border border-border-subtle rounded shadow-lg py-1 z-50 text-xs">
              <button
                onClick={() => {
                  setActiveMenu(null);
                  onOpenAbout();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg-primary"
              >
                About
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Flat Action Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs">
        <button
          onClick={onOpenVideo}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary font-medium tracking-tight transition-colors"
          title="Open Video (Ctrl+O)"
        >
          <FolderOpen size={14} className="text-fg-secondary" />
          <span>Open</span>
        </button>

        <button
          onClick={onFit}
          disabled={!hasVideo}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary font-medium tracking-tight transition-colors disabled:opacity-40"
          title="Fit to view (Ctrl+0)"
        >
          <Maximize2 size={14} className="text-fg-secondary" />
          <span>Fit</span>
        </button>

        <button
          onClick={onZoomIn}
          disabled={!hasVideo}
          className="p-1.5 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary transition-colors disabled:opacity-40"
          title="Zoom in (Ctrl+=)"
        >
          <ZoomIn size={14} className="text-fg-secondary" />
        </button>

        <button
          onClick={onZoomOut}
          disabled={!hasVideo}
          className="p-1.5 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary transition-colors disabled:opacity-40"
          title="Zoom out (Ctrl+-)"
        >
          <ZoomOut size={14} className="text-fg-secondary" />
        </button>

        <div className="h-4 w-[1px] bg-border-subtle mx-1" />

        <button
          onClick={onRotateCcw}
          disabled={!hasVideo}
          className="p-1.5 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary transition-colors disabled:opacity-40"
          title="Rotate 90° Counter-Clockwise (Ctrl+[)"
        >
          <RotateCcw size={14} className="text-fg-secondary" />
        </button>

        <button
          onClick={onRotateCw}
          disabled={!hasVideo}
          className="p-1.5 bg-bg-input hover:bg-bg-hover active:bg-bg-input border border-border-subtle rounded text-fg-primary transition-colors disabled:opacity-40"
          title="Rotate 90° Clockwise (Ctrl+])"
        >
          <RotateCw size={14} className="text-fg-secondary" />
        </button>

        {userRotation !== 0 && (
          <button
            onClick={onResetRotation}
            className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
            title="Click to reset rotation to 0°"
          >
            {userRotation}°
          </button>
        )}

        <div className="h-4 w-[1px] bg-border-subtle mx-1" />

        <div className="text-[11px] font-mono tabular-nums text-fg-muted min-w-[70px]">
          Zoom: {hasVideo ? `${zoomPercent}%` : '—'}
        </div>

        <div className="h-4 w-[1px] bg-border-subtle mx-1" />

        <button
          onClick={onToggleThirds}
          className={`flex items-center gap-1.5 px-2 py-1 border border-border-subtle rounded font-medium tracking-tight transition-colors ${
            showThirds
              ? 'bg-bg-hover text-fg-primary border-border-focus'
              : 'bg-bg-input text-fg-secondary hover:bg-bg-hover'
          }`}
          title="Toggle Rule-of-Thirds Grid"
        >
          <Grid size={14} />
          <span>Grid</span>
        </button>

        {onStartExport && (
          <button
            onClick={onStartExport}
            disabled={!hasVideo || isRunning || isCancelling}
            className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded font-medium tracking-tight transition-colors disabled:opacity-40 shadow-sm ml-1.5"
            title="Start Export (Ctrl+R)"
          >
            <Play size={11} fill="currentColor" />
            <span>Export</span>
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={onOpenSettings}
          className="p-1.5 text-fg-secondary hover:text-fg-primary hover:bg-bg-hover rounded transition-colors"
          title="Settings"
        >
          <Settings size={14} />
        </button>

        <button
          onClick={onOpenDiagnostics}
          className="p-1.5 text-fg-secondary hover:text-fg-primary hover:bg-bg-hover rounded transition-colors"
          title="Diagnostics"
        >
          <Activity size={14} />
        </button>

        <button
          onClick={onOpenAbout}
          className="p-1.5 text-fg-secondary hover:text-fg-primary hover:bg-bg-hover rounded transition-colors"
          title="About Video Cropper"
        >
          <HelpCircle size={14} />
        </button>
      </div>
    </div>
  );
};
