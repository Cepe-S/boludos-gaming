import React from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { AppTab } from '@/components/layout/AppSidebar';

export interface NavbarProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  onOpenChat: () => void;
  onOpenNotifications: () => void;
  onOpenDiscordModal: () => void;
  unreadChatCount?: number;
}

/**
 * Legacy compatibility wrapper kept in case external modules import Navbar directly.
 * Primary navigation now lives in AppSidebar + AppHeader.
 */
export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onOpenChat,
  onOpenNotifications,
  onOpenDiscordModal,
}) => {
  return (
    <AppHeader
      activeTab={activeTab}
      onOpenMobileSidebar={onOpenDiscordModal}
      onOpenChat={onOpenChat}
      onOpenNotifications={onOpenNotifications}
      onOpenDiscordModal={onOpenDiscordModal}
    />
  );
};
