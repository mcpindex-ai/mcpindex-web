import type { ReactNode } from 'react';
import {
  DWhereTheGateSits,
  DSilentDriftTimeline,
  DTierLadder,
  DAnatomyOfAHold,
  DItHeldNowWhat,
  DPostureMatrix,
  DNinetySecondPath,
} from './gate';
import {
  DTrustBoundary,
  DTwoVerdictSurfaces,
  DDriftNetworkLoop,
  DProvenanceChain,
  DSourceLivenessCensus,
} from './trust';
import {
  DTwoJobsTwoPackages,
  DBlastRadius,
  DCategoryMap,
  DCorpusPipeline,
  DMcpNeedsALockfile,
} from './product';

export * from './gate';
export * from './trust';
export * from './product';

/**
 * Live counts a figure may need. Only the corpus funnel reads them today, but the shape is
 * shared so a future figure cannot invent its own way of receiving a derived number - the
 * freshness guard rejects numeric literals inside diagram components, so props are the only
 * legal path for a fact that can change.
 */
export interface DiagramFacts {
  servers?: string;
  categories?: string;
}

/**
 * id -> renderer. The gallery and the standalone SVG route render by id, so a diagram that is
 * in the registry but not here (or vice versa) is caught by lib/diagrams.test.ts rather than
 * 404-ing in production.
 */
export const DIAGRAM_COMPONENTS: Record<string, (f: DiagramFacts) => ReactNode> = {
  'where-the-gate-sits': () => <DWhereTheGateSits />,
  'silent-contract-drift-timeline': () => <DSilentDriftTimeline />,
  'trust-boundary': () => <DTrustBoundary />,
  'tier-ladder': () => <DTierLadder />,
  'anatomy-of-a-hold': () => <DAnatomyOfAHold />,
  'it-held-now-what': () => <DItHeldNowWhat />,
  'posture-matrix': () => <DPostureMatrix />,
  'two-jobs-two-packages': () => <DTwoJobsTwoPackages />,
  'two-verdict-surfaces': () => <DTwoVerdictSurfaces />,
  'drift-network-loop': () => <DDriftNetworkLoop />,
  'blast-radius': () => <DBlastRadius />,
  'provenance-chain': () => <DProvenanceChain />,
  'category-map': () => <DCategoryMap />,
  'corpus-pipeline': (f) => (
    <DCorpusPipeline servers={f.servers ?? '—'} categories={f.categories ?? '—'} />
  ),
  'source-liveness-census': () => <DSourceLivenessCensus />,
  'ninety-second-path': () => <DNinetySecondPath />,
  'mcp-needs-a-lockfile': () => <DMcpNeedsALockfile />,
};

export function renderDiagram(id: string, facts: DiagramFacts = {}): ReactNode {
  return DIAGRAM_COMPONENTS[id]?.(facts) ?? null;
}
