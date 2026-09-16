"""Owns job validation + FFmpeg command construction + process lifetime.

The GUI provides plain values; this service builds the ProcessingJob,
delegates argv to command_builder, and forwards process signals.
"""

from __future__ import annotations

from pathlib import Path

from PySide6.QtCore import QObject, Signal

from video_cropper.ffmpeg.command_builder import args_to_display, build_ffmpeg_args
from video_cropper.ffmpeg.process import FfmpegProcess
from video_cropper.ffmpeg.progress import ProgressUpdate
from video_cropper.models.crop_config import CropConfig
from video_cropper.models.processing_job import ProcessingJob
from video_cropper.utils.paths import ensure_parent_dir, same_file


class ProcessingService(QObject):
    progress = Signal(object)   # ProgressUpdate
    succeeded = Signal(str)
    failed = Signal(str)
    cancelled = Signal()
    started = Signal(str)       # display command

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._proc = FfmpegProcess(self)
        self._proc.progress.connect(self.progress.emit)
        self._proc.finished_ok.connect(self.succeeded.emit)
        self._proc.failed.connect(self.failed.emit)
        self._proc.cancelled.connect(self.cancelled.emit)
        self.current_job: ProcessingJob | None = None

    @property
    def is_running(self) -> bool:
        return self._proc.is_running

    def validate(self, job: ProcessingJob, allow_overwrite: bool = False) -> str | None:
        """Return an error message, or None when the job is safe to start."""
        if not job.input_path or not Path(job.input_path).is_file():
            return "No input video is loaded."
        if not job.output_path:
            return "Choose an output file."
        if same_file(job.input_path, job.output_path):
            return "Output must be different from the input.\nThe source file is never overwritten."
        if Path(job.output_path).exists() and not allow_overwrite:
            return "NEEDS_CONFIRM"
        if job.crop.width < 2 or job.crop.height < 2:
            return "Crop region is empty. Drag on the preview to select the area to keep."
        if job.output_width < 2 or job.output_height < 2:
            return "Output resolution is invalid."
        bw, bh = job.crop.bound_w, job.crop.bound_h
        if bw and (job.crop.x + job.crop.width > bw or job.crop.y + job.crop.height > bh):
            return "Crop extends outside the video frame."
        return None

    def start(self, job: ProcessingJob, ffmpeg_exe: str, allow_overwrite: bool = False) -> str | None:
        """Start encoding. Returns error message, or None on launch."""
        err = self.validate(job, allow_overwrite)
        if err == "NEEDS_CONFIRM":
            return err
        if err:
            return err
        try:
            ensure_parent_dir(job.output_path)
        except OSError as exc:
            return f"Output folder could not be created.\n{exc}"
        argv = build_ffmpeg_args(job, ffmpeg_exe, overwrite=True)
        self.current_job = job
        self.started.emit(args_to_display(argv))
        self._proc.start(argv, job.output_path, job.duration)
        return None

    def cancel(self) -> None:
        self._proc.cancel()
