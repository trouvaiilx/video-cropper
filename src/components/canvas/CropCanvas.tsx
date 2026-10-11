import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { CropConfig, VideoMetadata } from '../../types';
import { clamp, clampPan, PreviewMapping, clampCrop } from '../../utils/coordinates';

export interface CropCanvasHandle {
  fitView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface CropCanvasProps {
  previewSrc: string | null;
  meta: VideoMetadata | null;
  crop: CropConfig;
  ratioLock: number | null;
  showThirds: boolean;
  onCropChange: (crop: CropConfig) => void;
  onZoomChange: (zoom: number) => void;
}

// Handle indices: 0: NW, 1: N, 2: NE, 3: E, 4: SE, 5: S, 6: SW, 7: W
const HANDLE_NAMES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
const EDGE_MARGIN_PX = 32;
const HANDLE_SIZE_PX = 9;

export const CropCanvas = forwardRef<CropCanvasHandle, CropCanvasProps>(
  (
    {
      previewSrc,
      meta,
      crop,
      ratioLock,
      showThirds,
      onCropChange,
      onZoomChange,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);

    // Viewport transform
    const [zoom, setZoom] = useState<number>(1.0);
    const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [fitScale, setFitScale] = useState<number>(1.0);

    const zoomRef = useRef<number>(zoom);
    zoomRef.current = zoom;
    const panRef = useRef<{ x: number; y: number }>(pan);
    panRef.current = pan;
    const fitScaleRef = useRef<number>(fitScale);
    fitScaleRef.current = fitScale;

    // Interaction states
    const isInteractingRef = useRef<boolean>(false);
    const interactionModeRef = useRef<'idle' | 'creating' | 'moving' | 'resizing' | 'panning'>('idle');
    const activeHandleRef = useRef<number>(-1);
    const startMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const startCropRef = useRef<CropConfig>(crop);
    const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    // Load preview image
    useEffect(() => {
      if (!previewSrc) {
        imageRef.current = null;
        return;
      }
      const img = new Image();
      img.src = previewSrc;
      img.onload = () => {
        imageRef.current = img;
        fitView();
      };
    }, [previewSrc]);

    // Fit view calculation
    const fitView = useCallback(() => {
      if (!containerRef.current || !imageRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const imgW = imageRef.current.width;
      const imgH = imageRef.current.height;
      if (imgW <= 0 || imgH <= 0 || rect.width <= 0 || rect.height <= 0) return;

      const pad = EDGE_MARGIN_PX * 2;
      const availW = Math.max(10, rect.width - pad);
      const availH = Math.max(10, rect.height - pad);

      const scale = Math.min(availW / imgW, availH / imgH, 1.0);
      const initialPanX = (rect.width - imgW * scale) / 2;
      const initialPanY = (rect.height - imgH * scale) / 2;

      setFitScale(scale);
      setZoom(scale);
      setPan({ x: initialPanX, y: initialPanY });
      onZoomChange(scale / scale); // 100% relative to fit
    }, [onZoomChange]);

    // Zoom centered at arbitrary viewport point
    const zoomAtPoint = useCallback(
      (point: { x: number; y: number }, factor: number) => {
        setZoom((prevZoom) => {
          const minZ = fitScaleRef.current;
          const maxZ = fitScaleRef.current * 8.0;
          const newZoom = clamp(prevZoom * factor, minZ, maxZ);
          if (Math.abs(newZoom - prevZoom) < 1e-4) return prevZoom;

          setPan((prevPan) => {
            const scaleRatio = newZoom / prevZoom;
            const newPanX = point.x - (point.x - prevPan.x) * scaleRatio;
            const newPanY = point.y - (point.y - prevPan.y) * scaleRatio;

            if (containerRef.current && imageRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              return clampPan(
                { x: newPanX, y: newPanY },
                newZoom,
                imageRef.current.width,
                imageRef.current.height,
                rect.width,
                rect.height,
                EDGE_MARGIN_PX
              );
            }
            return { x: newPanX, y: newPanY };
          });

          onZoomChange(newZoom / fitScaleRef.current);
          return newZoom;
        });
      },
      [onZoomChange]
    );

    const zoomIn = useCallback(() => {
      if (!containerRef.current || !imageRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const center = { x: rect.width / 2, y: rect.height / 2 };
      zoomAtPoint(center, 1.25);
    }, [zoomAtPoint]);

    const zoomOut = useCallback(() => {
      if (!containerRef.current || !imageRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const center = { x: rect.width / 2, y: rect.height / 2 };
      zoomAtPoint(center, 0.8);
    }, [zoomAtPoint]);

    useImperativeHandle(ref, () => ({
      fitView,
      zoomIn,
      zoomOut,
    }));

    // Mapping helpers between screen pixels and source display pixels
    const getMapping = useCallback((): PreviewMapping | null => {
      if (!meta || !imageRef.current) return null;
      return new PreviewMapping(
        meta.display_width,
        meta.display_height,
        imageRef.current.width,
        imageRef.current.height
      );
    }, [meta]);

    const screenToPreview = useCallback(
      (sx: number, sy: number) => {
        return {
          x: (sx - pan.x) / zoom,
          y: (sy - pan.y) / zoom,
        };
      },
      [zoom, pan]
    );

    const getHandlePositions = (screenRect: { x: number; y: number; width: number; height: number }) => {
      const { x, y, width: w, height: h } = screenRect;
      return [
        { x, y }, // 0: nw
        { x: x + w / 2, y }, // 1: n
        { x: x + w, y }, // 2: ne
        { x: x + w, y: y + h / 2 }, // 3: e
        { x: x + w, y: y + h }, // 4: se
        { x: x + w / 2, y: y + h }, // 5: s
        { x, y: y + h }, // 6: sw
        { x, y: y + h / 2 }, // 7: w
      ];
    };

    const hitTestHandle = (
      mx: number,
      my: number,
      screenRect: { x: number; y: number; width: number; height: number }
    ): number => {
      const handles = getHandlePositions(screenRect);
      const half = HANDLE_SIZE_PX / 2 + 3; // hit area padding
      for (let i = 0; i < handles.length; i++) {
        const h = handles[i];
        if (mx >= h.x - half && mx <= h.x + half && my >= h.y - half && my <= h.y + half) {
          return i;
        }
      }
      return -1;
    };

    // Render Canvas
    useEffect(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = '#181818';
      ctx.fillRect(0, 0, rect.width, rect.height);

      if (imageRef.current && meta) {
        const img = imageRef.current;
        const mapping = getMapping();

        // 1. Draw image
        const imgScreen = {
          x: pan.x,
          y: pan.y,
          w: img.width * zoom,
          h: img.height * zoom,
        };
        ctx.drawImage(img, imgScreen.x, imgScreen.y, imgScreen.w, imgScreen.h);

        // 2. Compute crop in screen space
        if (mapping && crop.width > 0 && crop.height > 0) {
          const prevCrop = mapping.sourceToPreview(crop.x, crop.y, crop.width, crop.height);
          const screenCrop = {
            x: prevCrop.x * zoom + pan.x,
            y: prevCrop.y * zoom + pan.y,
            width: prevCrop.width * zoom,
            height: prevCrop.height * zoom,
          };

          // 3. Dim overlay outside crop box
          ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
          // Top band
          ctx.fillRect(imgScreen.x, imgScreen.y, imgScreen.w, Math.max(0, screenCrop.y - imgScreen.y));
          // Bottom band
          const cropBottom = screenCrop.y + screenCrop.height;
          ctx.fillRect(imgScreen.x, cropBottom, imgScreen.w, Math.max(0, imgScreen.y + imgScreen.h - cropBottom));
          // Left band
          ctx.fillRect(
            imgScreen.x,
            screenCrop.y,
            Math.max(0, screenCrop.x - imgScreen.x),
            screenCrop.height
          );
          // Right band
          const cropRight = screenCrop.x + screenCrop.width;
          ctx.fillRect(
            cropRight,
            screenCrop.y,
            Math.max(0, imgScreen.x + imgScreen.w - cropRight),
            screenCrop.height
          );

          // 4. Guide lines (Center crosshair & Rule-of-thirds)
          if (showThirds && screenCrop.width > 12 && screenCrop.height > 12) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);

            // Rule of thirds
            for (const f of [1 / 3, 2 / 3]) {
              const gx = Math.round(screenCrop.x + screenCrop.width * f) + 0.5;
              const gy = Math.round(screenCrop.y + screenCrop.height * f) + 0.5;
              ctx.beginPath();
              ctx.moveTo(gx, screenCrop.y);
              ctx.lineTo(gx, screenCrop.y + screenCrop.height);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(screenCrop.x, gy);
              ctx.lineTo(screenCrop.x + screenCrop.width, gy);
              ctx.stroke();
            }
            ctx.restore();
          }

          // Center crosshair
          if (screenCrop.width > 12 && screenCrop.height > 12) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            const cx = Math.round(screenCrop.x + screenCrop.width / 2) + 0.5;
            const cy = Math.round(screenCrop.y + screenCrop.height / 2) + 0.5;

            ctx.beginPath();
            ctx.moveTo(cx, screenCrop.y);
            ctx.lineTo(cx, screenCrop.y + screenCrop.height);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(screenCrop.x, cy);
            ctx.lineTo(screenCrop.x + screenCrop.width, cy);
            ctx.stroke();
            ctx.restore();
          }

          // 5. Crop Border (white outer + dark inner)
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(screenCrop.x, screenCrop.y, screenCrop.width, screenCrop.height);

          ctx.strokeStyle = 'rgba(20, 20, 20, 0.8)';
          ctx.lineWidth = 1.0;
          ctx.strokeRect(
            screenCrop.x + 1.5,
            screenCrop.y + 1.5,
            Math.max(0, screenCrop.width - 3),
            Math.max(0, screenCrop.height - 3)
          );
          ctx.restore();

          // 6. Handles (8 squares)
          const handles = getHandlePositions(screenCrop);
          const halfH = HANDLE_SIZE_PX / 2;
          ctx.save();
          for (const h of handles) {
            ctx.fillStyle = '#f5f5f5';
            ctx.fillRect(h.x - halfH, h.y - halfH, HANDLE_SIZE_PX, HANDLE_SIZE_PX);
            ctx.strokeStyle = '#202020';
            ctx.lineWidth = 1.0;
            ctx.strokeRect(h.x - halfH, h.y - halfH, HANDLE_SIZE_PX, HANDLE_SIZE_PX);
          }
          ctx.restore();
        }
      }

      ctx.restore();
    }, [previewSrc, meta, crop, zoom, pan, showThirds, getMapping]);

    // Resize observer to re-render on container size changes
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const ro = new ResizeObserver(() => {
        // Redraw
        setZoom((z) => z);
      });
      ro.observe(container);
      return () => ro.disconnect();
    }, []);

    // Pointer event handlers
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!imageRef.current || !meta) return;
      const mapping = getMapping();
      if (!mapping) return;

      const rect = containerRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Right-click: Pan
      if (e.button === 2) {
        interactionModeRef.current = 'panning';
        panStartRef.current = { x: mouseX - panRef.current.x, y: mouseY - panRef.current.y };
        isInteractingRef.current = true;
        return;
      }

      // Left-click: Crop interaction
      if (e.button === 0) {
        const prevCrop = mapping.sourceToPreview(crop.x, crop.y, crop.width, crop.height);
        const screenCrop = {
          x: prevCrop.x * zoom + pan.x,
          y: prevCrop.y * zoom + pan.y,
          width: prevCrop.width * zoom,
          height: prevCrop.height * zoom,
        };

        // Check handle hit
        const handleIdx = hitTestHandle(mouseX, mouseY, screenCrop);
        if (handleIdx >= 0) {
          interactionModeRef.current = 'resizing';
          activeHandleRef.current = handleIdx;
          startMousePosRef.current = { x: mouseX, y: mouseY };
          startCropRef.current = crop;
          isInteractingRef.current = true;
          return;
        }

        // Check inside crop hit
        if (
          mouseX >= screenCrop.x &&
          mouseX <= screenCrop.x + screenCrop.width &&
          mouseY >= screenCrop.y &&
          mouseY <= screenCrop.y + screenCrop.height
        ) {
          interactionModeRef.current = 'moving';
          startMousePosRef.current = { x: mouseX, y: mouseY };
          startCropRef.current = crop;
          isInteractingRef.current = true;
          return;
        }

        // Click outside: Create new crop
        const imgP = screenToPreview(mouseX, mouseY);
        const srcP = mapping.previewToSource(imgP.x, imgP.y, 0, 0);
        interactionModeRef.current = 'creating';
        startMousePosRef.current = { x: mouseX, y: mouseY };
        startCropRef.current = {
          x: srcP.x,
          y: srcP.y,
          width: 2,
          height: 2,
          bound_w: meta.display_width,
          bound_h: meta.display_height,
        };
        isInteractingRef.current = true;
      }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || !imageRef.current || !meta) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (!isInteractingRef.current) {
        // Update hover cursor
        const mapping = getMapping();
        if (mapping && crop.width > 0) {
          const prevCrop = mapping.sourceToPreview(crop.x, crop.y, crop.width, crop.height);
          const screenCrop = {
            x: prevCrop.x * zoom + pan.x,
            y: prevCrop.y * zoom + pan.y,
            width: prevCrop.width * zoom,
            height: prevCrop.height * zoom,
          };
          const handleIdx = hitTestHandle(mouseX, mouseY, screenCrop);
          if (handleIdx >= 0) {
            const h = HANDLE_NAMES[handleIdx];
            containerRef.current!.style.cursor =
              h === 'nw' || h === 'se'
                ? 'nwse-resize'
                : h === 'ne' || h === 'sw'
                ? 'nesw-resize'
                : h === 'n' || h === 's'
                ? 'ns-resize'
                : 'ew-resize';
            return;
          }
          if (
            mouseX >= screenCrop.x &&
            mouseX <= screenCrop.x + screenCrop.width &&
            mouseY >= screenCrop.y &&
            mouseY <= screenCrop.y + screenCrop.height
          ) {
            containerRef.current!.style.cursor = 'move';
            return;
          }
        }
        containerRef.current!.style.cursor = 'crosshair';
        return;
      }

      const mapping = getMapping();
      if (!mapping) return;

      // Interaction in progress
      if (interactionModeRef.current === 'panning') {
        const newPanX = mouseX - panStartRef.current.x;
        const newPanY = mouseY - panStartRef.current.y;
        if (containerRef.current && imageRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const clamped = clampPan(
            { x: newPanX, y: newPanY },
            zoomRef.current,
            imageRef.current.width,
            imageRef.current.height,
            rect.width,
            rect.height,
            EDGE_MARGIN_PX
          );
          setPan(clamped);
        } else {
          setPan({ x: newPanX, y: newPanY });
        }
        return;
      }

      const dxScreen = mouseX - startMousePosRef.current.x;
      const dyScreen = mouseY - startMousePosRef.current.y;
      const dxSource = Math.round(dxScreen / (zoom * mapping.scale));
      const dySource = Math.round(dyScreen / (zoom * mapping.scale));

      if (interactionModeRef.current === 'moving') {
        const initial = startCropRef.current;
        const nextCrop = clampCrop({
          ...initial,
          x: initial.x + dxSource,
          y: initial.y + dySource,
        });
        onCropChange(nextCrop);
        return;
      }

      if (interactionModeRef.current === 'resizing') {
        const initial = startCropRef.current;
        const handle = HANDLE_NAMES[activeHandleRef.current];
        let { x, y, width: w, height: h } = initial;

        if (handle.includes('e')) w += dxSource;
        if (handle.includes('w')) {
          x += dxSource;
          w -= dxSource;
        }
        if (handle.includes('s')) h += dySource;
        if (handle.includes('n')) {
          y += dySource;
          h -= dySource;
        }

        if (ratioLock && ratioLock > 0) {
          if (handle.includes('e') || handle.includes('w')) {
            h = Math.round(w / ratioLock);
            if (handle.includes('n')) {
              y = initial.y + initial.height - h;
            }
          } else {
            w = Math.round(h * ratioLock);
            if (handle.includes('w')) {
              x = initial.x + initial.width - w;
            }
          }
        }

        w = Math.max(2, w);
        h = Math.max(2, h);

        const nextCrop = clampCrop({
          x,
          y,
          width: w,
          height: h,
          bound_w: meta.display_width,
          bound_h: meta.display_height,
        });
        onCropChange(nextCrop);
        return;
      }

      if (interactionModeRef.current === 'creating') {
        const start = startCropRef.current;
        let w = dxSource;
        let h = dySource;
        let x = start.x;
        let y = start.y;

        if (w < 0) {
          x += w;
          w = Math.abs(w);
        }
        if (h < 0) {
          y += h;
          h = Math.abs(h);
        }

        if (ratioLock && ratioLock > 0) {
          h = Math.round(w / ratioLock);
        }

        const nextCrop = clampCrop({
          x,
          y,
          width: Math.max(2, w),
          height: Math.max(2, h),
          bound_w: meta.display_width,
          bound_h: meta.display_height,
        });
        onCropChange(nextCrop);
      }
    };

    const handleMouseUp = () => {
      isInteractingRef.current = false;
      interactionModeRef.current = 'idle';
      activeHandleRef.current = -1;
    };

    // Prevent Alt key from triggering Windows native window menu focus
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Alt') {
          e.preventDefault();
        }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Alt') {
          e.preventDefault();
        }
      };
      window.addEventListener('keydown', handleKeyDown, { capture: true });
      window.addEventListener('keyup', handleKeyUp, { capture: true });
      return () => {
        window.removeEventListener('keydown', handleKeyDown, { capture: true });
        window.removeEventListener('keyup', handleKeyUp, { capture: true });
      };
    }, []);

    // Native wheel listener with { passive: false } for robust prevention and clamping
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const handleWheelNative = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!imageRef.current) return;

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Normalize delta across line/pixel modes
        let dx = e.deltaX;
        let dy = e.deltaY;
        if (e.deltaMode === 1) {
          dx *= 24;
          dy *= 24;
        } else if (e.deltaMode === 2) {
          dx *= 400;
          dy *= 400;
        }

        const currentZoom = zoomRef.current;
        const currentPan = panRef.current;
        const imgW = imageRef.current.width;
        const imgH = imageRef.current.height;

        if (e.ctrlKey) {
          // Cursor-centered zoom
          const factor = dy < 0 ? 1.15 : 1 / 1.15;
          zoomAtPoint({ x: mouseX, y: mouseY }, factor);
        } else if (e.shiftKey) {
          // Horizontal scroll (smooth quarter-notch if Alt is also pressed)
          const factor = e.altKey ? 0.25 : 1.0;
          const rawDelta = dx !== 0 ? dx : dy;
          const delta = rawDelta * factor;
          const targetPan = { x: currentPan.x - delta, y: currentPan.y };
          const clamped = clampPan(
            targetPan,
            currentZoom,
            imgW,
            imgH,
            rect.width,
            rect.height,
            EDGE_MARGIN_PX
          );
          setPan(clamped);
        } else if (e.altKey) {
          // Alt + wheel: Smooth vertical scroll (quarter-notch for fine precision work)
          const delta = dy * 0.25;
          const targetPan = { x: currentPan.x, y: currentPan.y - delta };
          const clamped = clampPan(
            targetPan,
            currentZoom,
            imgW,
            imgH,
            rect.width,
            rect.height,
            EDGE_MARGIN_PX
          );
          setPan(clamped);
        } else {
          // Normal vertical scroll
          const targetPan = { x: currentPan.x, y: currentPan.y - dy };
          const clamped = clampPan(
            targetPan,
            currentZoom,
            imgW,
            imgH,
            rect.width,
            rect.height,
            EDGE_MARGIN_PX
          );
          setPan(clamped);
        }
      };

      container.addEventListener('wheel', handleWheelNative, { passive: false });
      return () => {
        container.removeEventListener('wheel', handleWheelNative);
      };
    }, [zoomAtPoint]);

    return (
      <div
        ref={containerRef}
        className="relative w-full h-full overflow-hidden bg-bg-dark outline-none select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />
      </div>
    );
  }
);
