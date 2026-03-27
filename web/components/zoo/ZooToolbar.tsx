interface ZooToolbarProps {
  openPanels: Set<string>;
  onToggle: (panel: string) => void;
  money: string;
  blockHeight?: number;
  connected: boolean;
}

const TOOLS: { id: string; icon: string; label: string; shortLabel: string }[] = [
  { id: "agents", icon: "\u{1F9D1}\u200D\u{1F91D}\u200D\u{1F9D1}", label: "Zoo Guests", shortLabel: "Guests" },
  { id: "shop", icon: "\u{1F3EA}", label: "Gift Shop", shortLabel: "Shop" },
  { id: "blockchain", icon: "\u{26D3}\u{FE0F}", label: "Blockchain", shortLabel: "Chain" },
  { id: "receipts", icon: "\u{1F9FE}", label: "Receipts", shortLabel: "TX" },
];

export default function ZooToolbar({ openPanels, onToggle, money, blockHeight, connected }: ZooToolbarProps) {
  return (
    <div className="zt-toolbar">
      {/* Left: tool buttons */}
      <div className="flex items-center gap-1">
        {TOOLS.map((tool) => {
          const isOpen = openPanels.has(tool.id);
          return (
            <button
              key={tool.id}
              onClick={() => onToggle(tool.id)}
              className={`zt-tool-btn ${isOpen ? "zt-tool-btn-active" : ""}`}
              title={tool.label}
            >
              <span className="text-sm leading-none">{tool.icon}</span>
              <span className="zt-tool-label">{tool.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Right: status readouts */}
      <div className="flex items-center gap-2">
        {/* Connection */}
        <div className="zt-toolbar-readout">
          <span className={`inline-block w-[6px] h-[6px] ${connected ? "bg-emerald-400" : "bg-red-500"}`} />
        </div>

        {/* Block height */}
        {blockHeight && (
          <div className="zt-toolbar-readout">
            <span className="zt-toolbar-label">BLK</span>
            <span className="zt-toolbar-value">#{blockHeight.toLocaleString()}</span>
          </div>
        )}

        {/* Money */}
        <div className="zt-toolbar-readout zt-toolbar-money">
          <span className="zt-toolbar-value">${money}</span>
        </div>
      </div>
    </div>
  );
}
