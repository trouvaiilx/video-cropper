"""QProcess-based FFmpeg encoding process with progress + safe cancellation.

Lifetime:
  start(argv, duration) → progress updates → finished | failed | cancelled
  cancel() → kill → wait → remove partial output → cancelled signal

Never touches the source file; only the (new) output path may be removed,
and only when this process created it and did not complete successfully.
"""

from __future__ import annotations

import os
import time

from PySide6.QtCore import QObject, QProcess, QTimer, Signal

from video_cropper.ffmpeg.progress import FfmpegProgressParser, ProgressUpdate


class FfmpegProcess(QObject):
    progress = Signal(object)          # ProgressUpdate
    finished_ok = Signal(str)          # output path
    failed = Signal(str)               # user-facing message + details
    cancelled = Signal()

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._proc: QProcess | None = None
        self._parser = FfmpegProgressParser(0.0)
        self._output = ""
        self._duration = 0.0
        self._start_t = 0.0
        self._cancelling = False
        self._stderr_tail: list[str] = []
        self._stdout_buf = ""
        self._kill_timer: QTimer | None = None

    @property
    def is_running(self) -> bool:
        return self._proc is not None and self._proc.state() != QProcess.ProcessState.NotRunning

    def start(self, argv: list[str], output_path: str, duration: float) -> None:
        if self.is_running:
            self.failed.emit("An encoding process is already running.")
            return
        self._output = output_path
        self._duration = max(0.0, duration)
        self._parser.reset(self._duration)
        self._cancelling = False
        self._stderr_tail.clear()
        self._stdout_buf = ""
        self._start_t = time.monotonic()

        proc = QProcess(self)
        proc.setProcessChannelMode(QProcess.ProcessChannelMode.SeparateChannels)
        proc.readyReadStandardOutput.connect(self._on_stdout)
        proc.readyReadStandardError.connect(self._on_stderr)
        proc.finished.connect(self._on_finished)
        proc.errorOccurred.connect(self._on_error)
        self._proc = proc
        proc.setProgram(argv[0])
        proc.setArguments(argv[1:])
        proc.start()
        if not proc.waitForStarted(10000):
            self._proc = None
            self.failed.emit("FFmpeg could not be started. Check the FFmpeg path in Settings.")

    # -- cancellation -----------------------------------------------------
    def cancel(self) -> None:
        if not self.is_running:
            return
        self._cancelling = True
        assert self._proc is not None
        self._proc.kill()  # SIGKILL-equivalent; no orphan risk
        # Hard guarantee: if the process ignores kill, escalate via timer.
        timer = QTimer(self)
        timer.setSingleShot(True)
        timer.timeout.connect(self._force_cleanup)
        timer.start(5000)
        self._kill_timer = timer
        # Best-effort synchronous wait without freezing UI for long.
        self._proc.waitForFinished(3000)

    def _force_cleanup(self) -> None:
        if self.is_running and self._proc is not None:
            try:
                self._proc.terminate()
            except Exception:
                pass

    # -- QProcess slots ----------------------------------------------------
    def _on_stdout(self) -> None:
        if self._proc is None:
            return
        chunk = bytes(self._proc.readAllStandardOutput()).decode("utf-8", "replace")
        self._stdout_buf += chunk
        elapsed = time.monotonic() - self._start_t
        while "\n" in self._stdout_buf:
            line, _, rest = self._stdout_buf.partition("\n")
            self._stdout_buf = rest
            upd = self._parser.feed_line(line, elapsed)
            if upd is not None:
                self.progress.emit(upd)

    def _on_stderr(self) -> None:
        if self._proc is None:
            return
        chunk = bytes(self._proc.readAllStandardError()).decode("utf-8", "replace")
        for line in chunk.splitlines():
            self._stderr_tail.append(line)
            if len(self._stderr_tail) > 60:
                del self._stderr_tail[: len(self._stderr_tail) - 60]

    def _on_error(self, error: QProcess.ProcessError) -> None:
        if error == QProcess.ProcessError.Crashed and self._cancelling:
            return  # handled in _on_finished
        if error == QProcess.ProcessError.FailedToStart:
            self._proc = None
            self.failed.emit("FFmpeg could not be started. Check the FFmpeg path in Settings.")

    def _on_finished(self, exit_code: int, status: QProcess.ExitStatus) -> None:
        if self._kill_timer is not None:
            self._kill_timer.stop()
            self._kill_timer = None
        was_cancelling = self._cancelling
        self._cancelling = False
        proc, self._proc = self._proc, None
        _ = proc

        if was_cancelling:
            self._remove_partial_output()
            self.cancelled.emit()
            return
        if status == QProcess.ExitStatus.NormalExit and exit_code == 0:
            if os.path.isfile(self._output):
                self.finished_ok.emit(self._output)
            else:
                self.failed.emit("FFmpeg reported success but no output file was created.")
            return
        # Failure: keep stderr tail for diagnostics, remove partial output.
        self._remove_partial_output()
        detail = "\n".join(self._stderr_tail[-25:]).strip()
        msg = "Video processing failed."
        if "No such file" in detail:
            msg = "Video processing failed: input or output path is not accessible."
        elif "Invalid argument" in detail:
            msg = "Video processing failed: invalid crop or encoder settings."
        self.failed.emit(msg + (f"\n\nDetails\n{detail}" if detail else ""))

    def _remove_partial_output(self) -> None:
        try:
            if self._output and os.path.isfile(self._output):
                os.remove(self._output)
        except OSError:
            pass
