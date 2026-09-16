"""Background video loading: ffprobe + preview extraction in a worker thread.

Emits VideoMetadata + preview file path. The GUI thread only handles pixmaps.
"""

from __future__ import annotations

from PySide6.QtCore import QObject, QThread, Signal

from video_cropper.ffmpeg.encoder import detect_encoders, EncoderInfo
from video_cropper.ffmpeg.preview import extract_preview, preview_seek_time, PreviewError
from video_cropper.ffmpeg.probe import probe_video, ProbeError
from video_cropper.models.video_metadata import VideoMetadata


class _Worker(QObject):
    done = Signal(object, str, object)  # metadata | None, preview_path, encoders|error
    failed = Signal(str)

    def __init__(self, path: str, ffprobe: str, ffmpeg: str) -> None:
        super().__init__()
        self._path = path
        self._ffprobe = ffprobe
        self._ffmpeg = ffmpeg

    def run(self) -> None:
        try:
            meta = probe_video(self._path, self._ffprobe)
            seek = preview_seek_time(meta.duration)
            preview = extract_preview(self._path, self._ffmpeg, seek_time=seek)
            encoders = detect_encoders(self._ffmpeg)
            self.done.emit(meta, preview, encoders)
        except (ProbeError, PreviewError) as exc:
            self.failed.emit(str(exc))
        except Exception as exc:  # never crash the thread host
            self.failed.emit(f"Could not open this video.\n{exc}")


class VideoService(QObject):
    video_loaded = Signal(object, str, object)  # VideoMetadata, preview_path, list[EncoderInfo]
    load_failed = Signal(str)
    load_started = Signal(str)

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._thread: QThread | None = None
        self._worker: _Worker | None = None
        self._seq = 0  # ignore stale completions

    def load(self, path: str, ffprobe: str, ffmpeg: str) -> None:
        self.cancel()
        self._seq += 1
        seq = self._seq
        self.load_started.emit(path)
        thread = QThread(self)
        worker = _Worker(path, ffprobe, ffmpeg)
        worker.moveToThread(thread)
        thread.started.connect(worker.run)
        worker.done.connect(lambda *a: self._on_done(seq, *a))
        worker.failed.connect(lambda m: self._on_fail(seq, m))
        worker.done.connect(thread.quit)
        worker.failed.connect(thread.quit)
        thread.finished.connect(worker.deleteLater)
        thread.finished.connect(thread.deleteLater)
        self._thread = thread
        self._worker = worker
        thread.start()

    def cancel(self) -> None:
        if self._thread is not None:
            try:
                self._thread.quit()
                self._thread.wait(1000)
            except Exception:
                pass
            self._thread = None
            self._worker = None

    def _on_done(self, seq: int, meta: VideoMetadata, preview: str,
                 encoders: list[EncoderInfo]) -> None:
        if seq != self._seq:
            return
        self.video_loaded.emit(meta, preview, encoders)

    def _on_fail(self, seq: int, msg: str) -> None:
        if seq != self._seq:
            return
        self.load_failed.emit(msg)
