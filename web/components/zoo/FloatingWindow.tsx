import { useRef, useEffect, useState, type ReactNode } from "react";

interface FloatingWindowProps {
  id: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  defaultPosition?: { x: number; y: number };
  width?: number;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
}

export default function FloatingWindow({
  id,
  title,
  children,
  onClose,
  defaultPosition,
  width = 340,
  minHeight,
  maxHeight,
  className = "",
}: FloatingWindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(defaultPosition ?? { x: 40, y: 60 });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Clamp position to viewport on mount
  useEffect(() => {
    if (!defaultPosition) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({
      x: Math.min(Math.max(0, defaultPosition.x), vw - width - 8),
      y: Math.min(Math.max(0, defaultPosition.y), vh - 120),
    });
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, select")) return;
    e.preventDefault();
    setDragging(true);
    dragOffset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const newX = e.clientX - dragOffset.current.x;
    const newY = e.clientY - dragOffset.current.y;
    setPos({
      x: Math.max(0, Math.min(newX, window.innerWidth - 60)),
      y: Math.max(0, Math.min(newY, window.innerHeight - 40)),
    });
  };

  const onPointerUp = () => {
    setDragging(false);
  };

  return (
    <div
      ref={windowRef}
      data-window={id}
      className={`fixed z-30 zt-float-window ${className}`}
      style={{
        left: pos.x,
        top: pos.y,
        width,
        minHeight,
        maxHeight,
      }}
    >
      {/* Title bar — draggable */}
      <div
        className="zt-win-titlebar select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="zt-win-title">{title}</span>
        <button onClick={onClose} className="zt-win-close" aria-label="Close">
          X
        </button>
      </div>

      {/* Content */}
      <div className="zt-win-body" style={{ maxHeight: maxHeight ? maxHeight - 32 : undefined }}>
        {children}
      </div>
    </div>
  );
}
