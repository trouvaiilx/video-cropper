import React, { useEffect } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type NotificationType = 'error' | 'warning' | 'info' | 'success';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number; // ms, 0 for persistent until dismissed
}

interface NotificationToastProps {
  notifications: NotificationItem[];
  onDismiss: (id: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notifications,
  onDismiss,
}) => {
  if (notifications.length === 0) return null;

  return (
    <aside
      aria-label="Notifications"
      className="fixed top-12 right-3 z-50 flex flex-col gap-2 max-w-[380px] w-full pointer-events-none"
    >
      {notifications.map((item) => (
        <ToastItem key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </aside>
  );
};

const ToastItem: React.FC<{
  item: NotificationItem;
  onDismiss: (id: string) => void;
}> = ({ item, onDismiss }) => {
  useEffect(() => {
    const duration = item.duration !== undefined ? item.duration : 6000;
    if (duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(item.id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [item, onDismiss]);

  const getIcon = () => {
    switch (item.type) {
      case 'error':
        return <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />;
      case 'success':
        return <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />;
      default:
        return <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />;
    }
  };

  const getBorderColor = () => {
    switch (item.type) {
      case 'error':
        return 'border-red-500/40 bg-bg-panel/95 shadow-red-950/20';
      case 'warning':
        return 'border-amber-500/40 bg-bg-panel/95 shadow-amber-950/20';
      case 'success':
        return 'border-emerald-500/40 bg-bg-panel/95 shadow-emerald-950/20';
      default:
        return 'border-blue-500/40 bg-bg-panel/95 shadow-blue-950/20';
    }
  };

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded border shadow-xl backdrop-blur-md text-xs text-fg-primary animate-in fade-in slide-in-from-top-2 duration-150 ${getBorderColor()}`}
    >
      {getIcon()}
      <div className="flex-1 min-w-0 pr-1">
        <div className="font-semibold tracking-tight text-fg-primary text-xs">
          {item.title}
        </div>
        {item.message && (
          <div className="text-fg-secondary text-[11px] mt-0.5 leading-relaxed break-words font-mono">
            {item.message}
          </div>
        )}
        {item.action && (
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => {
                item.action?.onClick();
                onDismiss(item.id);
              }}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium tracking-tight rounded text-[11px] transition-colors shadow-sm"
            >
              {item.action.label}
            </button>
          </div>
        )}
      </div>
      <button
        onClick={() => onDismiss(item.id)}
        className="p-1 text-fg-muted hover:text-fg-primary hover:bg-bg-hover rounded transition-colors shrink-0"
        title="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
};
