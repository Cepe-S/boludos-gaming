import React from 'react';
import { GamesCatalogView } from './GamesCatalogView';

export interface SteamTasteProfilerViewProps {
  compact?: boolean;
}

/**
 * Single-source-of-truth wrapper: all updates live in GamesCatalogView.tsx
 * so the main Games section and the Onboarding Tour remain 100% identical.
 */
export const SteamTasteProfilerView: React.FC<SteamTasteProfilerViewProps> = ({
  compact = false,
}) => {
  return <GamesCatalogView embeddedInTour={compact} />;
};

export default SteamTasteProfilerView;
