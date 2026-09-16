import React from "react";

export type PageId =
  | "dashboard"
  | "events"
  | "workers"
  | "partitions"
  | "failures"
  | "benchmarks";

interface HeaderProps {
  activePage: PageId;
  onSelectPage: (page: PageId) => void;
  onOpenProducer: () => void;
  onReset: () => void;
  activeWorkerCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activePage,
  onSelectPage,
  onOpenProducer,
  onReset,
  activeWorkerCount,
}) => {
  const navItems: { id: PageId; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "events", label: "Events" },
    { id: "workers", label: "Workers" },
    { id: "partitions", label: "Partitions" },
    { id: "failures", label: "Failures" },
    { id: "benchmarks", label: "Benchmarks" },
  ];

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Top bar: Title and Quick Actions */}
        <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-gray-900 tracking-tight">
                Distributed Event Processing System
              </h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-green-50 text-green-700 border border-green-200">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                Cluster Active ({activeWorkerCount} workers)
              </span>
            </div>
            <p className="text-xs text-gray-500">
              B.Tech Computer Science &amp; Engineering Project &bull; Partitioning, Workers, Concurrency, DLQ &amp; Autoscaling
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenProducer}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
            >
              + Produce Event
            </button>
            <button
              onClick={onReset}
              className="px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded text-xs font-medium transition-colors"
              title="Reset queues and clear cluster state"
            >
              Reset Cluster
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center space-x-1 py-2 overflow-x-auto text-xs">
          {navItems.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectPage(item.id)}
                className={`px-3 py-1.5 rounded font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
