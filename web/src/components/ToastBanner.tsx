import { useEffect, useState } from "react";

type Props = {
  message: string | null;
  onClose: () => void;
  /** Auto-dismiss after this many ms (default 8s). */
  durationMs?: number;
  variant?: "error" | "info";
};

/**
 * Top-right toast with countdown auto-dismiss and manual close.
 */
export function ToastBanner({
  message,
  onClose,
  durationMs = 8000,
  variant = "error",
}: Props) {
  const [visible, setVisible] = useState(false);
  const [remainingMs, setRemainingMs] = useState(durationMs);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    setRemainingMs(durationMs);
    const started = Date.now();
    const tick = window.setInterval(() => {
      const left = Math.max(0, durationMs - (Date.now() - started));
      setRemainingMs(left);
      if (left <= 0) {
        window.clearInterval(tick);
        setVisible(false);
        onClose();
      }
    }, 100);
    return () => window.clearInterval(tick);
  }, [message, durationMs, onClose]);

  if (!message || !visible) return null;

  const seconds = Math.ceil(remainingMs / 1000);
  const progress = Math.max(0, Math.min(1, remainingMs / durationMs));

  return (
    <div
      className={`toast-banner is-${variant}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="toast-banner-body">
        <p className="toast-banner-msg">{message}</p>
        <button
          type="button"
          className="toast-banner-close"
          aria-label="Dismiss"
          onClick={() => {
            setVisible(false);
            onClose();
          }}
        >
          ×
        </button>
      </div>
      <div className="toast-banner-meta">
        <span className="toast-banner-timer">Closes in {seconds}s</span>
        <div
          className="toast-banner-progress"
          aria-hidden="true"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </div>
  );
}
