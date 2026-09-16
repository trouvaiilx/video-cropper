"""Keyboard shortcuts are wired actions, not just tooltip text."""

from PySide6.QtGui import QKeySequence


def test_exit_shortcut(qapp):
    from video_cropper.app.main_window import MainWindow
    window = MainWindow()
    try:
        assert window.act_exit.shortcut() == QKeySequence("Ctrl+Shift+Q")
    finally:
        window.close()


def test_exit_action_closes_window(qapp):
    from video_cropper.app.main_window import MainWindow
    window = MainWindow()
    window.show()
    window.act_exit.trigger()  # same path as the shortcut; keeps closeEvent guards
    assert window.isHidden()


def test_start_shortcut_matches_tooltip(qapp):
    from video_cropper.ui.progress_panel import ProgressPanel
    assert ProgressPanel().start_btn.shortcut() == QKeySequence("Ctrl+R")
