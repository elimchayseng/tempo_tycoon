import type { ReactNode } from "react";

interface MobileDrawerProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export default function MobileDrawer({ title, children, onClose }: MobileDrawerProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 zt-mobile-drawer" style={{ maxHeight: "60vh" }}>
      <div className="zt-float-window flex flex-col" style={{ maxHeight: "60vh" }}>
        {/* Title bar */}
        <div className="zt-win-titlebar select-none shrink-0">
          <span className="zt-win-title">{title}</span>
          <button onClick={onClose} className="zt-win-close" aria-label="Close">
            X
          </button>
        </div>

        {/* Scrollable content */}
        <div className="zt-win-body flex-1 min-h-0" style={{ maxHeight: "calc(60vh - 32px)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
