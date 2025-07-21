"use client";

import { Users, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface NoteTypeSelectorProps {
  currentType: 'private' | 'public';
  onTypeChange: (type: 'private' | 'public') => void;
  className?: string;
}

export default function NoteTypeSelector({ 
  currentType, 
  onTypeChange,
  className = "" 
}: NoteTypeSelectorProps) {
  const { t } = useTranslation();
  
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onTypeChange('private')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentType === 'private'
              ? 'bg-[var(--foreground)] text-[var(--background)] shadow-md'
              : 'bg-[var(--background)] text-[var(--foreground)] dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
          title={t('noteTypeSelector.privateTooltip')}
        >
          <Lock size={16} />
          <span>{t('noteTypeSelector.privateNotes')}</span>
        </button>
        
        <button
          onClick={() => onTypeChange('public')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentType === 'public'
              ? 'bg-[var(--foreground)] text-[var(--background)] shadow-md'
              : 'bg-[var(--background)] text-[var(--foreground)] dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
          title={t('noteTypeSelector.publicTooltip')}
        >
          <Users size={16} />
          <span>{t('noteTypeSelector.collaborativeNotes')}</span>
        </button>
      </div>
    </div>
  );
}

// Componente de status de conexão para notas públicas
export function CollaborativeStatus({ isConnected }: { isConnected: boolean }) {
  const { t } = useTranslation();
  
  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
      <div className={`w-2 h-2 rounded-full ${
        isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
      }`} />
      <span>
        {t('noteTypeSelector.collaboration')}: {isConnected ? `🟢 ${t('noteTypeSelector.connected')}` : `🔴 ${t('noteTypeSelector.disconnected')}`}
      </span>
    </div>
  );
}