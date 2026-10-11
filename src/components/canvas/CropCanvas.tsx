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
  /** Shared, hidden <video> used for playback (frames are drawn onto the canvas). */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** True once the video element holds a decodable source. */
  videoReady: boolean;
  /** Render only the cropped region (what will be exported) instead of the editor view. */
  cropView: boolean;
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
      videoRef,
      videoReady,
      cropView,
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
    const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

    const zoomRef = useRef<number>(zoom);
    zoomRef.current = zoom;
    const panRef = useRef<{ x: number; y: number }>(pan);
    panRef.current = pan;
    const fitScaleRef = useRef<number>(fitScale);
    fitScaleRef.current = fitScale;
    const cropViewRef = useRef<boolean>(cropView);
    cropViewRef.current = cropView;
    // Latest draw function; the video frame loop calls it directly (no React render per frame).
    const drawRef = useRef<() => void>(() => {});

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

    // Cursor position tracking for zoom navigation
    const mousePosRef = useRef<{ x: number; y: number; inside: boolean }>({
      x: 0,
      y: 0,
      inside: false,
    });

    // Zoom centered at arbitrary viewport point
    const zoomAtPoint = useCallback(
      (point: { x: number; y: number }, factor: number) => {
        if (!containerRef.current || !imageRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const prevZoom = zoomRef.current;
        const prevPan = panRef.current;
        const minZ = fitScaleRef.current;
        const maxZ = fitScaleRef.current * 8.0;

        const newZoom = clamp(prevZoom * factor, minZ, maxZ);
        if (Math.abs(newZoom - prevZoom) < 1e-4) return;

        const imgW = imageRef.current.width;
        const imgH = imageRef.current.height;

        // When zoomed all the way out to fit view, center the image
        if (newZoom <= minZ + 1e-4) {
          const centeredPan = {
            x: (rect.width - imgW * newZoom) / 2,
            y: (rect.height - imgH * newZoom) / 2,
          };
          zoomRef.current = newZoom;
          panRef.current = centeredPan;
          setZoom(newZoom);
          setPan(centeredPan);
          onZoomChange(1.0);
          return;
        }

        const scaleRatio = newZoom / prevZoom;
        const newPanX = point.x - (point.x - prevPan.x) * scaleRatio;
        const newPanY = point.y - (point.y - prevPan.y) * scaleRatio;

        const clamped = clampPan(
          { x: newPanX, y: newPanY },
          newZoom,
          imgW,
          imgH,
          rect.width,
          rect.height,
          EDGE_MARGIN_PX
        );

        zoomRef.current = newZoom;
        panRef.current = clamped;
        setZoom(newZoom);
        setPan(clamped);
        onZoomChange(newZoom / fitScaleRef.current);
      },
      [onZoomChange]
    );

    const getZoomTargetPoint = useCallback((): { x: number; y: number } => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const center = { x: rect.width / 2, y: rect.height / 2 };

      if (mousePosRef.current.inside) {
        const mx = clamp(mousePosRef.current.x, 0, rect.width);
        const my = clamp(mousePosRef.current.y, 0, rect.height);
        return { x: mx, y: my };
      }
      return center;
    }, []);

    const zoomIn = useCallback(() => {
      zoomAtPoint(getZoomTargetPoint(), 1.25);
    }, [zoomAtPoint, getZoomTargetPoint]);

    const zoomOut = useCallback(() => {
      zoomAtPoint(getZoomTargetPoint(), 0.8);
    }, [zoomAtPoint, getZoomTargetPoint]);

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

    // Current frame source: the live video once ready, otherwise the still preview.
    // Both share the same aspect ratio, so the video is simply scaled into the
    // still's coordinate space; crop math stays in display-pixel fractions.
    const getDrawSource = (): { src: CanvasImageSource; w: number; h: number } | null => {
      const v = videoRef.current;
      if (videoReady && v && v.videoWidth > 0 && v.videoHeight > 0) {
        return { src: v, w: v.videoWidth, h: v.videoHeight };
      }
      const img = imageRef.current;
      return img ? { src: img, w: img.width, h: img.height } : null;
    };

    // Render Canvas
    const draw = useCallback(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // Assigning width/height reallocates the bitmap; skip when unchanged (matters at 30+ fps).
      const bw = Math.round(rect.width * dpr);
      const bh = Math.round(rect.height * dpr);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      ctx.fillStyle = '#181818';
      ctx.fillRect(0, 0, rect.width, rect.height);

      // Crop view: only the cropped region, fitted to the viewport (export preview).
      if (cropView && meta && crop.width > 0 && crop.height > 0) {
        const s = getDrawSource();
        if (s) {
          const fx = s.w / meta.display_width;
          const fy = s.h / meta.display_height;
          const pad = EDGE_MARGIN_PX;
          const scale = Math.min(
            Math.max(10, rect.width - pad * 2) / crop.width,
            Math.max(10, rect.height - pad * 2) / crop.height
          );
          const dw = crop.width * scale;
          const dh = crop.height * scale;
          const dx = Math.round((rect.width - dw) / 2);
          const dy = Math.round((rect.height - dh) / 2);

          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(
            s.src,
            crop.x * fx,
            crop.y * fy,
            crop.width * fx,
            crop.height * fy,
            dx,
            dy,
            dw,
            dh
          );
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
          ctx.lineWidth = 1;
          ctx.strokeRect(dx - 0.5, dy - 0.5, dw + 1, dh + 1);
        }
        ctx.restore();
        return;
      }

      if (imageRef.current && meta) {
        const img = imageRef.current;
        const mapping = getMapping();

        // 1. Draw image (live video frame when playback is ready)
        const imgScreen = {
          x: pan.x,
          y: pan.y,
          w: img.width * zoom,
          h: img.height * zoom,
        };
        const frame = getDrawSource();
        ctx.drawImage(frame ? frame.src : img, imgScreen.x, imgScreen.y, imgScreen.w, imgScreen.h);

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
    }, [previewSrc, meta, crop, zoom, pan, showThirds, getMapping, containerSize, cropView, videoReady]);

    // Redraw whenever view state changes; keep drawRef pointing at the latest closure.
    drawRef.current = draw;
    useEffect(() => {
      draw();
    }, [draw]);

    // Video-driven redraws: a frame loop only while playing (throttled to the video's fps),
    // plus single redraws on seek/load. Nothing runs while paused.
    const fps = meta?.fps && meta.fps > 0 ? meta.fps : 30;
    useEffect(() => {
      const v = videoRef.current;
      if (!videoReady || !v) return;

      const minInterval = (1000 / Math.min(60, fps)) * 0.8;
      let raf = 0;
      let lastDraw = 0;

      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (now - lastDraw >= minInterval) {
          lastDraw = now;
          drawRef.current();
        }
      };
      const onPlay = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(loop);
      };
      const onPause = () => {
        cancelAnimationFrame(raf);
        drawRef.current();
      };
      const redraw = () => drawRef.current();

      v.addEventListener('play', onPlay);
      v.addEventListener('pause', onPause);
      v.addEventListener('seeked', redraw);
      v.addEventListener('loadeddata', redraw);
      if (!v.paused) onPlay();
      drawRef.current();

      return () => {
        cancelAnimationFrame(raf);
        v.removeEventListener('play', onPlay);
        v.removeEventListener('pause', onPause);
        v.removeEventListener('seeked', redraw);
        v.removeEventListener('loadeddata', redraw);
      };
    }, [videoReady, videoRef, fps]);

    // Resize observer to re-render and adjust view on container size changes
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const width = Math.round(entry.contentRect.width);
          const height = Math.round(entry.contentRect.height);
          if (width <= 0 || height <= 0) continue;

          setContainerSize((prev) => {
            if (prev.width === width && prev.height === height) return prev;
            return { width, height };
          });

          if (imageRef.current) {
            const imgW = imageRef.current.width;
            const imgH = imageRef.current.height;
            if (imgW > 0 && imgH > 0) {
              const pad = EDGE_MARGIN_PX * 2;
              const availW = Math.max(10, width - pad);
              const availH = Math.max(10, height - pad);
              const newFitScale = Math.min(availW / imgW, availH / imgH, 1.0);

              const wasAtFit = Math.abs(zoomRef.current - fitScaleRef.current) < 0.005;

              setFitScale(newFitScale);

              if (wasAtFit) {
                setZoom(newFitScale);
                setPan({
                  x: (width - imgW * newFitScale) / 2,
                  y: (height - imgH * newFitScale) / 2,
                });
                onZoomChange(1.0);
              } else {
                setPan((prevPan) => {
                  return clampPan(
                    prevPan,
                    zoomRef.current,
                    imgW,
                    imgH,
                    width,
                    height,
                    EDGE_MARGIN_PX
                  );
                });
                onZoomChange(zoomRef.current / newFitScale);
              }
            }
          }
        }
      });

      ro.observe(container);
      return () => ro.disconnect();
    }, [onZoomChange]);

    // Pointer event handlers
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      if (cropView || !imageRef.current || !meta) return;
      const mapping = getMapping();
      if (!mapping) return;

      const rect = containerRef.current!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Right-click or Middle-click: Pan
      if (e.button === 2 || e.button === 1) {
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
      if (cropView) {
        containerRef.current!.style.cursor = 'default';
        return;
      }
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      mousePosRef.current = { x: mouseX, y: mouseY, inside: true };

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

    // Touch pinch-to-zoom support for touchscreens / precision devices
    const touchDistRef = useRef<number | null>(null);

    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        touchDistRef.current = dist;
      }
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2 && touchDistRef.current !== null && containerRef.current) {
        e.preventDefault();
        const rect = containerRef.current.getBoundingClientRect();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

        if (dist > 10 && touchDistRef.current > 10) {
          const factor = dist / touchDistRef.current;
          zoomAtPoint({ x: midX, y: midY }, factor);
        }
        touchDistRef.current = dist;
      }
    };

    const handleTouchEnd = () => {
      touchDistRef.current = null;
    };

    // Native wheel listener with { passive: false } attached to window for reliable trackpad pinch capture
    useEffect(() => {
      const handleWheelNative = (e: WheelEvent) => {
        const container = containerRef.current;
        if (!container || !imageRef.current || cropViewRef.current) return;

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Verify the cursor or pinch centroid is within the canvas
        const isOver =
          mouseX >= 0 &&
          mouseX <= rect.width &&
          mouseY >= 0 &&
          mouseY <= rect.height;

        if (!isOver) return;

        e.preventDefault();
        e.stopPropagation();

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

        // 1. Pinch-to-zoom (Trackpad) or Ctrl + Wheel (Mouse)
        if (e.ctrlKey) {
          const isDiscreteMouse =
            e.deltaMode === 1 || (Math.abs(dy) >= 50 && Number.isInteger(dy) && e.deltaX === 0);
          const factor = isDiscreteMouse
            ? (dy < 0 ? 1.15 : 1 / 1.15)
            : Math.max(0.75, Math.min(1.35, Math.exp(-dy * 0.02)));
          zoomAtPoint({ x: mouseX, y: mouseY }, factor);
          return;
        }

        // 2. Explicit Shift + Wheel: Horizontal pan
        if (e.shiftKey) {
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
          panRef.current = clamped;
          setPan(clamped);
          return;
        }

        // 3. Explicit Alt + Wheel: Fine vertical pan
        if (e.altKey) {
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
          panRef.current = clamped;
          setPan(clamped);
          return;
        }

        // 4. Auto-detect Trackpad 2-finger swipe vs Physical Mouse Wheel:
        // - Trackpad 2-finger gestures on Windows emit pixel deltas (deltaMode === 0)
        //   with continuous/fractional values or simultaneous X+Y movement.
        // - Physical mouse wheels emit line deltas (deltaMode === 1) or large discrete steps (>= 50) with dx === 0.
        const isTrackpad =
          e.deltaMode === 0 &&
          (Math.abs(e.deltaX) > 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 50);

        if (isTrackpad) {
          // Trackpad 2-finger swipe: Fluid 2D pan following fingers in any direction
          const targetPan = {
            x: currentPan.x - dx,
            y: currentPan.y - dy,
          };
          const clamped = clampPan(
            targetPan,
            currentZoom,
            imgW,
            imgH,
            rect.width,
            rect.height,
            EDGE_MARGIN_PX
          );
          panRef.current = clamped;
          setPan(clamped);
        } else {
          // Physical mouse wheel: Cursor-centered zoom
          const factor = dy < 0 ? 1.15 : 1 / 1.15;
          zoomAtPoint({ x: mouseX, y: mouseY }, factor);
        }
      };

      window.addEventListener('wheel', handleWheelNative, { passive: false });
      return () => {
        window.removeEventListener('wheel', handleWheelNative);
      };
    }, [zoomAtPoint]);

    return (
      <div
        ref={containerRef}
        style={{ touchAction: 'none' }}
        className="relative w-full h-full overflow-hidden bg-bg-dark outline-none select-none touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseEnter={(e) => {
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            mousePosRef.current = {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
              inside: true,
            };
          }
        }}
        onMouseLeave={() => {
          handleMouseUp();
          mousePosRef.current.inside = false;
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas
          ref={canvasRef}
          style={{ touchAction: 'none' }}
          className="absolute inset-0 block w-full h-full touch-none"
        />
      </div>
    );
  }
);
