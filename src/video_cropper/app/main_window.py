"""Main window: layout + wiring. Business logic lives in services/models."""

from __future__ import annotations

import os
from pathlib import Path

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QAction, QCloseEvent, QDragEnterEvent, QDropEvent, QKeySequence, QPixmap
from PySide6.QtWidgets import (
    QFileDialog, QLabel, QMainWindow, QMessageBox, QSplitter, QToolBar,
    QVBoxLayout, QWidget,
)

import video_cropper
from video_cropper.ffmpeg import resolver
from video_cropper.ffmpeg.encoder import EncoderInfo
from video_cropper.graphics.crop_scene import CropScene
from video_cropper.graphics.crop_view import CropView
from video_cropper.models.crop_config import AspectRatio, CropConfig, ratio_by_label
from video_cropper.models.processing_job import (
    OUTPUT_PRESETS, ProcessingJob, compute_output_size,
)
from video_cropper.models.video_metadata import VideoMetadata
from video_cropper.services.processing_service import ProcessingService
from video_cropper.services.settings_service import SettingsService
from video_cropper.services.video_service import VideoService
from video_cropper.ui.crop_controls import CropControls
from video_cropper.ui.dialogs import (
    DiagnosticsDialog, SettingsDialog, ask_overwrite, build_diagnostics, show_error,
)
from video_cropper.ui.metadata_panel import MetadataPanel
from video_cropper.ui.output_controls import OutputControls
from video_cropper.ui.progress_panel import ProgressPanel
from video_cropper.utils.coordinates import PreviewMapping
from video_cropper.utils.paths import is_video_file, suggest_output_path
from video_cropper.utils.time import format_seconds

_APP_FILTER = "Videos (*.mp4 *.mkv *.mov *.avi *.webm *.m4v *.mpg *.mpeg *.ts *.m2ts *.wmv *.flv *.ogv);;All files (*)"


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Video Cropper")
        self.setMinimumSize(960, 620)
        self.setAcceptDrops(True)

        self.settings = SettingsService()
        self.video_service = VideoService(self)
        self.processing = ProcessingService(self)

        # -- state (models are the truth; widgets mirror them) --
        self.meta: VideoMetadata | None = None
        self.mapping: PreviewMapping | None = None
        self.crop = CropConfig()
        self.ratio: AspectRatio = ratio_by_label(self.settings.ratio())
        self.out_w = 0
        self.out_h = 0
        self.preset = self.settings.resolution_preset()
        if self.preset not in OUTPUT_PRESETS:
            self.preset = "Original Crop"
        self.encoders: list[EncoderInfo] = []
        self._syncing = False
        self._preview_path = ""

        self._build_ui()
        self._connect()
        self._restore()

    # -- construction ---------------------------------------------------------
    def _build_ui(self) -> None:
        # Menus
        file_menu = self.menuBar().addMenu("&File")
        self.act_open = QAction("&Open Video…", self)
        self.act_open.setShortcut(QKeySequence("Ctrl+O"))
        self.act_open.triggered.connect(self.open_file_dialog)
        file_menu.addAction(self.act_open)
        file_menu.addSeparator()
        act_exit = QAction("E&xit", self)
        act_exit.triggered.connect(self.close)
        file_menu.addAction(act_exit)

        view_menu = self.menuBar().addMenu("&View")
        self.act_fit = QAction("&Fit", self)
        self.act_fit.setShortcut(QKeySequence("Ctrl+0"))
        self.act_fit.triggered.connect(self._fit)
        self.act_zoom_in = QAction("Zoom &In", self)
        self.act_zoom_in.setShortcut(QKeySequence("Ctrl+="))
        self.act_zoom_in.triggered.connect(self._zoom_in)
        self.act_zoom_out = QAction("Zoom &Out", self)
        self.act_zoom_out.setShortcut(QKeySequence("Ctrl+-"))
        self.act_zoom_out.triggered.connect(self._zoom_out)
        self.act_thirds = QAction("Rule-of-thirds grid", self, checkable=True)
        self.act_thirds.setChecked(self.settings.show_thirds())
        self.act_thirds.toggled.connect(self._on_thirds)
        view_menu.addAction(self.act_fit)
        view_menu.addAction(self.act_zoom_in)
        view_menu.addAction(self.act_zoom_out)
        view_menu.addSeparator()
        view_menu.addAction(self.act_thirds)

        tools_menu = self.menuBar().addMenu("&Tools")
        act_settings = QAction("&Settings…", self)
        act_settings.triggered.connect(self.open_settings)
        tools_menu.addAction(act_settings)
        act_diag = QAction("&Diagnostics…", self)
        act_diag.triggered.connect(self.open_diagnostics)
        tools_menu.addAction(act_diag)

        help_menu = self.menuBar().addMenu("&Help")
        act_about = QAction("&About", self)
        act_about.triggered.connect(self._about)
        help_menu.addAction(act_about)

        # Toolbar (flat, no decoration)
        toolbar = QToolBar("Main", self)
        toolbar.setMovable(False)
        toolbar.addAction(self.act_open)
        toolbar.addAction(self.act_fit)
        toolbar.addSeparator()
        self.zoom_label = QLabel("Zoom: —")
        self.zoom_label.setObjectName("Dim")
        toolbar.addWidget(self.zoom_label)
        self.addToolBar(toolbar)

        # Central splitter: preview | side panel
        splitter = QSplitter(Qt.Orientation.Horizontal, self)
        self.setCentralWidget(splitter)

        self.scene = CropScene(self)
        self.scene.set_guides(True, self.act_thirds.isChecked())
        self.view = CropView(self.scene, self)
        self.view.setMinimumSize(480, 360)
        splitter.addWidget(self.view)

        side = QWidget(self)
        side_layout = QVBoxLayout(side)
        side_layout.setContentsMargins(6, 6, 6, 6)
        side_layout.setSpacing(8)

        self.meta_panel = MetadataPanel(side)
        self.crop_controls = CropControls(side)
        self.output_controls = OutputControls(side)
        self.progress = ProgressPanel(side)
        side_layout.addWidget(self.meta_panel)
        side_layout.addWidget(self.crop_controls)
        side_layout.addWidget(self.output_controls)
        side_layout.addWidget(self.progress)
        side_layout.addStretch(1)
        side.setMinimumWidth(300)
        side.setMaximumWidth(380)
        splitter.addWidget(side)
        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 0)

        self.statusBar().showMessage("Open a video to begin.")
        self._set_panels_enabled(False)
        self.crop_controls.set_ratio(self.ratio.label if self.ratio.label in
                                     [self.crop_controls.ratio_combo.itemText(i)
                                      for i in range(self.crop_controls.ratio_combo.count())]
                                     else "Free")

    def _connect(self) -> None:
        self.video_service.load_started.connect(
            lambda p: self.statusBar().showMessage(f"Loading {Path(p).name}…"))
        self.video_service.video_loaded.connect(self._on_video_loaded)
        self.video_service.load_failed.connect(self._on_load_failed)

        self.view.crop_preview_changed.connect(self._on_scene_crop)
        self.view.zoom_changed.connect(
            lambda z: self.zoom_label.setText(f"Zoom: {z * 100:.0f}%"))

        self.crop_controls.ratio_changed.connect(self._on_ratio)
        self.crop_controls.values_changed.connect(self._on_spin_values)
        self.output_controls.changed.connect(self._on_output_changed)
        self.output_controls.browse_requested.connect(self._browse_output)

        self.progress.start_requested.connect(self._start)
        self.progress.cancel_requested.connect(self._cancel)
        self.processing.started.connect(self.progress.set_command)
        self.processing.progress.connect(self._on_progress)
        self.processing.succeeded.connect(self._on_succeeded)
        self.processing.failed.connect(self._on_failed)
        self.processing.cancelled.connect(
            lambda: (self.progress.set_idle("Cancelled. Partial output removed."),
                     self.statusBar().showMessage("Cancelled.")))

    def _restore(self) -> None:
        geo = self.settings.geometry()
        if geo:
            try:
                self.restoreGeometry(bytes(geo))
            except Exception:
                pass
        st = self.settings.window_state()
        if st:
            try:
                self.restoreState(bytes(st))
            except Exception:
                pass
        ffmpeg, _ = self._tools()
        if ffmpeg is None:
            self.statusBar().showMessage(
                "FFmpeg not found — install it or set its location in Tools → Settings.")

    # -- tools ------------------------------------------------------------------
    def _tools(self) -> tuple[str | None, str | None]:
        ff = resolver.find_tool("ffmpeg", self.settings.ffmpeg_path() or None)
        fp = resolver.find_tool("ffprobe", self.settings.ffprobe_path() or None)
        return ff, fp

    def _require_tools(self) -> tuple[str, str] | None:
        ff, fp = self._tools()
        if not ff or not fp:
            show_error(self, "FFmpeg not found",
                       "FFmpeg could not be found.\nInstall FFmpeg or configure its location in Settings.")
            return None
        return ff, fp

    # -- file opening --------------------------------------------------------------
    def open_file_dialog(self) -> None:
        if self.processing.is_running:
            show_error(self, "Busy", "Stop the current encoding before opening another video.")
            return
        start = self.settings.last_dir() or str(Path.home())
        path, _ = QFileDialog.getOpenFileName(self, "Open Video", start, _APP_FILTER)
        if path:
            self.open_path(path)

    def open_path(self, path: str) -> None:
        tools = self._require_tools()
        if tools is None:
            return
        ff, fp = tools
        self.settings.set_last_dir(str(Path(path).parent))
        self.video_service.load(path, fp, ff)

    def _on_video_loaded(self, meta: VideoMetadata, preview_path: str,
                         encoders: list[EncoderInfo]) -> None:
        self.meta = meta
        self.encoders = encoders
        self._preview_path = preview_path
        pixmap = QPixmap(preview_path)
        if pixmap.isNull():
            self._on_load_failed("Could not decode the preview frame.")
            return
        self.mapping = PreviewMapping(meta.display_width, meta.display_height,
                                      pixmap.width(), pixmap.height())
        self.scene.set_preview(pixmap)
        # Default crop: full frame (honest default; never a stale rect).
        self.crop = CropConfig(bound_w=meta.display_width,
                               bound_h=meta.display_height).full_frame()
        self.meta_panel.set_metadata(meta)
        self.crop_controls.set_bounds(meta.display_width, meta.display_height)
        # Encoders
        items = [(e.id, e.label, e.available) for e in encoders]
        if not items:
            items = [("libx264", "CPU · H.264 (libx264)", True)]
        saved_enc = self.settings.encoder()
        current = saved_enc if any(eid == saved_enc for eid, _, _ in items) else items[0][0]
        # Prefer saved encoder only when available; else libx264.
        avail = {eid for eid, _, ok in items if ok}
        if current not in avail:
            current = "libx264" if "libx264" in avail else next(iter(avail), "libx264")
        self.output_controls.set_encoders(items, current)
        # Output defaults
        if self.preset not in OUTPUT_PRESETS:
            self.preset = "Original Crop"
        self.output_controls.preset_combo.setCurrentText(self.preset)
        self._push_crop_to_ui()
        self._recompute_output(keep_custom=False)
        # Suggest output next to input.
        out_dir = self.settings.last_output_dir() or str(Path(meta.path).parent)
        suggested = Path(out_dir) / suggest_output_path(meta.path).name
        self.output_controls.set_path(str(suggested))
        self._set_panels_enabled(True)
        self.view.set_ratio_lock(self.ratio.value)
        self.statusBar().showMessage(f"{meta.filename} — {meta.dimensions_label}")
        # Fit after layout settles so the whole frame is visible.
        QTimer.singleShot(0, self.view.fit_view)

    def _on_load_failed(self, msg: str) -> None:
        show_error(self, "Could not open video", msg)
        self.statusBar().showMessage("Could not open video.")

    # -- crop flow ------------------------------------------------------------------
    def _push_crop_to_ui(self) -> None:
        self._syncing = True
        try:
            c = self.crop.clamped()
            self.crop = c
            self.crop_controls.set_crop(c.x, c.y, c.width, c.height)
            if self.mapping is not None:
                x, y, w, h = self.mapping.source_to_preview(c.x, c.y, c.width, c.height)
                from PySide6.QtCore import QRectF
                self.scene.set_crop_rect(QRectF(x, y, w, h))
            self.output_controls.set_crop_context(c.width, c.height)
        finally:
            self._syncing = False

    def _on_scene_crop(self, rect) -> None:  # QRectF in preview px
        if self._syncing or self.mapping is None or self.meta is None:
            return
        x, y, w, h = self.mapping.preview_to_source(
            rect.x(), rect.y(), max(0.0, rect.width()), max(0.0, rect.height()))
        c = CropConfig(x=x, y=y, width=max(2, w), height=max(2, h),
                       bound_w=self.meta.display_width,
                       bound_h=self.meta.display_height).clamped()
        # Enforce ratio when locked (view already constrains; re-snap for safety).
        if self.ratio.value:
            c = self._snap_to_ratio(c, self.ratio.value)
        self.crop = c
        self._syncing = True
        try:
            self.crop_controls.set_crop(c.x, c.y, c.width, c.height)
            self.output_controls.set_crop_context(c.width, c.height)
        finally:
            self._syncing = False
        self._recompute_output(keep_custom=True)

    def _on_spin_values(self, x: int, y: int, w: int, h: int) -> None:
        if self._syncing or self.meta is None:
            return
        c = CropConfig(x=x, y=y, width=max(2, w), height=max(2, h),
                       bound_w=self.meta.display_width,
                       bound_h=self.meta.display_height)
        if self.ratio.value:
            c = self._snap_to_ratio_keep_w(c, self.ratio.value)
        self.crop = c.clamped()
        self._push_crop_to_ui()
        self._recompute_output(keep_custom=True)

    def _on_ratio(self, ratio: AspectRatio) -> None:
        self.ratio = ratio
        self.settings.set_ratio(ratio.label if ratio.label in
                                ("Free", "16:9", "9:16", "4:3", "3:4", "1:1", "4:5", "5:4")
                                else "Free")
        self.view.set_ratio_lock(ratio.value)
        if self.meta is None or not self.crop.is_valid:
            return
        if ratio.value is None:
            return
        self.crop = self.crop.apply_ratio(ratio)
        self._push_crop_to_ui()
        self._recompute_output(keep_custom=True)

    @staticmethod
    def _snap_to_ratio(c: CropConfig, value: float) -> CropConfig:
        return c.apply_ratio(AspectRatio("lock", value, 1.0))

    @staticmethod
    def _snap_to_ratio_keep_w(c: CropConfig, value: float) -> CropConfig:
        # Keep X/Y/W from the spinboxes; derive H. Fall back to deriving W.
        h = max(2, int(round(c.width / value)))
        cand = CropConfig(x=c.x, y=c.y, width=c.width, height=h,
                          bound_w=c.bound_w, bound_h=c.bound_h).clamped()
        if cand.height != h and c.bound_h:
            w = max(2, int(round(c.height * value)))
            cand = CropConfig(x=c.x, y=c.y, width=w, height=c.height,
                              bound_w=c.bound_w, bound_h=c.bound_h).clamped()
        return cand

    # -- output flow ------------------------------------------------------------------
    def _on_output_changed(self) -> None:
        if self._syncing:
            return
        preset, cw, ch, enc, _ = self.output_controls.values()
        self.preset = preset
        self.settings.set_resolution_preset(preset)
        self.settings.set_encoder(enc)
        if preset == "Custom":
            self.out_w, self.out_h = max(2, cw), max(2, ch)
            self.output_controls.set_crop_context(self.crop.width, self.crop.height)
        else:
            self._recompute_output(keep_custom=False)

    def _recompute_output(self, keep_custom: bool) -> None:
        if self.meta is None or not self.crop.is_valid:
            return
        preset, cw, ch, _, _ = self.output_controls.values()
        if keep_custom and preset == "Custom":
            self.out_w, self.out_h = max(2, cw), max(2, ch)
        else:
            self.out_w, self.out_h = compute_output_size(
                self.crop.width, self.crop.height, preset, cw, ch)
            self._syncing = True
            try:
                self.output_controls.set_output_size(self.out_w, self.out_h)
            finally:
                self._syncing = False
        self.output_controls.set_crop_context(self.crop.width, self.crop.height)

    def _browse_output(self) -> None:
        start = self.output_controls.values()[4] or self.settings.last_output_dir() or (
            str(Path(self.meta.path).parent) if self.meta else str(Path.home()))
        path, _ = QFileDialog.getSaveFileName(self, "Output file", start,
                                              "MP4 (*.mp4);;MKV (*.mkv);;MOV (*.mov);;All files (*)")
        if path:
            self.output_controls.set_path(path)
            self.settings.set_last_output_dir(str(Path(path).parent))

    # -- processing ----------------------------------------------------------------------
    def _build_job(self) -> ProcessingJob | None:
        if self.meta is None:
            return None
        _, _, _, enc, out = self.output_controls.values()
        return ProcessingJob(
            input_path=self.meta.path, output_path=out, crop=self.crop.clamped(),
            output_width=self.out_w, output_height=self.out_h,
            encoder=enc, has_audio=self.meta.has_audio,
            duration=self.meta.duration, rotation=self.meta.rotation,
        )

    def _start(self) -> None:
        tools = self._require_tools()
        if tools is None:
            return
        ffmpeg, _ = tools
        job = self._build_job()
        if job is None:
            show_error(self, "Nothing to process", "Open a video first.")
            return
        err = self.processing.validate(job)
        if err == "NEEDS_CONFIRM":
            if not ask_overwrite(self, job.output_path):
                return
            err = self.processing.start(job, ffmpeg, allow_overwrite=True)
        else:
            err = self.processing.start(job, ffmpeg) if err is None else err
        if err:
            show_error(self, "Cannot start", err)
            return
        self.settings.set_last_output_dir(str(Path(job.output_path).parent))
        self.progress.set_running()
        self._set_panels_enabled(False, keep_progress=True)
        self.statusBar().showMessage("Encoding…")

    def _cancel(self) -> None:
        self.processing.cancel()
        self.statusBar().showMessage("Cancelling…")

    def _on_progress(self, upd) -> None:
        total = self.meta.duration if self.meta else 0.0
        self.progress.show_progress(upd, total)

    def _on_succeeded(self, out: str) -> None:
        self.progress.set_idle(f"Done — {Path(out).name}")
        self.progress.bar.setValue(1000)
        self._set_panels_enabled(True)
        self.statusBar().showMessage(f"Saved {out}")
        ret = QMessageBox.information(self, "Done", f"Saved:\n{out}\n\nShow in folder?",
                                      QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                                      QMessageBox.StandardButton.No)
        if ret == QMessageBox.StandardButton.Yes:
            try:
                import subprocess as _sp
                _sp.Popen(["explorer", "/select,", os.path.normpath(out)])
            except Exception:
                pass

    def _on_failed(self, msg: str) -> None:
        self.progress.set_idle("Failed.")
        self._set_panels_enabled(True)
        show_error(self, "Video processing failed", msg)
        self.statusBar().showMessage("Processing failed.")

    # -- view slots -------------------------------------------------------------------------
    def _fit(self) -> None:
        self.view.fit_view()

    def _zoom_in(self) -> None:
        self.view.zoom_in()

    def _zoom_out(self) -> None:
        self.view.zoom_out()

    def _on_thirds(self, on: bool) -> None:
        self.scene.set_guides(True, on)
        self.settings.set_show_thirds(on)

    # -- settings / diagnostics ---------------------------------------------------------------
    def open_settings(self) -> None:
        dlg = SettingsDialog(self.settings.ffmpeg_path(), self.settings.ffprobe_path(), self)
        if dlg.exec():
            ff, fp = dlg.values()
            self.settings.set_ffmpeg_path(ff)
            self.settings.set_ffprobe_path(fp)
            self.settings.sync()

    def open_diagnostics(self) -> None:
        ff, fp = self._tools()
        extra: dict[str, str] = {}
        if self.meta is not None:
            extra["input"] = self.meta.path
            extra["source"] = (f"{self.meta.display_width}x{self.meta.display_height} "
                               f"{self.meta.video_codec} {self.meta.pixel_format} "
                               f"{format_seconds(self.meta.duration)} audio={self.meta.has_audio}")
            extra["crop"] = (f"{self.crop.width}x{self.crop.height}+{self.crop.x}+{self.crop.y}")
            extra["output"] = f"{self.out_w}x{self.out_h} preset={self.preset}"
        else:
            extra["input"] = "(none)"
        _, _, _, enc, out = self.output_controls.values()
        extra["encoder"] = enc
        extra["output_path"] = out or "(none)"
        body = build_diagnostics(video_cropper.__version__, ff or "", fp or "", extra)
        DiagnosticsDialog(body, self).exec()

    def _about(self) -> None:
        QMessageBox.about(self, "About Video Cropper",
                          f"Video Cropper {video_cropper.__version__}\n\n"
                          "Select the region to keep. Audio is copied, "
                          "the source is never modified.\n\n"
                          "Left-drag: crop · Right-drag: pan · Ctrl+wheel: zoom")

    # -- helpers -------------------------------------------------------------------------------
    def _set_panels_enabled(self, on: bool, keep_progress: bool = False) -> None:
        self.crop_controls.set_enabled_all(on)
        self.output_controls.set_enabled_all(on)
        self.act_open.setEnabled(on or not self.processing.is_running)
        if not keep_progress:
            self.progress.start_btn.setEnabled(on and self.meta is not None)
        if on and self.meta is not None:
            self.progress.start_btn.setEnabled(True)

    # -- drag & drop / close ----------------------------------------------------------------------
    def dragEnterEvent(self, event: QDragEnterEvent) -> None:  # noqa: N802
        urls = event.mimeData().urls() if event.mimeData().hasUrls() else []
        if len(urls) == 1 and is_video_file(urls[0].toLocalFile()):
            event.acceptProposedAction()
        else:
            event.ignore()

    def dropEvent(self, event: QDropEvent) -> None:  # noqa: N802
        urls = event.mimeData().urls() if event.mimeData().hasUrls() else []
        if urls:
            local = urls[0].toLocalFile()
            if local:
                if self.processing.is_running:
                    show_error(self, "Busy", "Stop the current encoding before opening another video.")
                    return
                self.open_path(local)
                event.acceptProposedAction()
                return
        event.ignore()

    def closeEvent(self, event: QCloseEvent) -> None:  # noqa: N802
        if self.processing.is_running:
            ret = QMessageBox.question(self, "Encoding in progress",
                                       "An encoding is running. Cancel it and quit?",
                                       QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                                       QMessageBox.StandardButton.No)
            if ret != QMessageBox.StandardButton.Yes:
                event.ignore()
                return
            self.processing.cancel()
        self.video_service.cancel()
        try:
            self.settings.set_geometry(bytes(self.saveGeometry()))
            self.settings.set_window_state(bytes(self.saveState()))
            self.settings.sync()
        except Exception:
            pass
        super().closeEvent(event)
