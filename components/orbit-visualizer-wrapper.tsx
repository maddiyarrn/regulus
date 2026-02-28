'use client';

import dynamic from 'next/dynamic';

const OrbitVisualizer = dynamic(
  () => import('./orbit-visualizer').then((mod) => ({ default: mod.OrbitVisualizer })),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full flex items-center justify-center"
        style={{ height: 'calc(100vh - 120px)', background: '#020817' }}
      >
        <div className="text-center text-white space-y-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto" />
          <p className="text-sm text-white/60">Loading 3D visualization...</p>
        </div>
      </div>
    ),
  }
);

export { OrbitVisualizer };
