import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SlashCommand {
  label: string;
  description: string;
  icon: string;
  action: () => void;
  keywords: string[];
}

interface SlashCommandMenuProps {
  isVisible: boolean;
  position: { top: number; left: number };
  filter: string;
  selectedIndex: number;
  commands: SlashCommand[];
  onSelectCommand: (command: SlashCommand) => void;
  onSelectIndex: (index: number) => void;
  onClose: () => void;
}

export default function SlashCommandMenu({
  isVisible,
  position,
  filter,
  selectedIndex,
  commands,
  onSelectCommand,
  onSelectIndex,
  onClose
}: SlashCommandMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  // Detectar se é tela pequena (sm = 640px)
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  // Verificar tamanho da tela
  useEffect(() => {
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 640);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => {
      window.removeEventListener('resize', checkScreenSize);
    };
  }, []);

  // Autofocus para fechar teclado em telas pequenas
  useEffect(() => {
    if (isVisible && menuRef.current && isSmallScreen) {
      // Forçar o blur em qualquer elemento ativo para fechar o teclado
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      
      // Dar foco no menu para fechar o teclado virtual
      setTimeout(() => {
        if (menuRef.current) {
          menuRef.current.focus();
        }
      }, 150); // Delay maior para garantir que o blur aconteça primeiro
    }
  }, [isVisible, isSmallScreen]);

  // Filtrar comandos baseado no filtro
  const filteredCommands = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(filter.toLowerCase()) ||
    cmd.description.toLowerCase().includes(filter.toLowerCase()) ||
    cmd.keywords.some(keyword => keyword.toLowerCase().includes(filter.toLowerCase()))
  );

  // Auto-scroll para o item selecionado
  useEffect(() => {
    if (menuRef.current && selectedIndex >= 0 && selectedIndex < filteredCommands.length) {
      const selectedElement = menuRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }
  }, [selectedIndex, filteredCommands.length]);

  // Lidar com teclas do menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible) return;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          onSelectIndex(selectedIndex < filteredCommands.length - 1 ? selectedIndex + 1 : 0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          onSelectIndex(selectedIndex > 0 ? selectedIndex - 1 : filteredCommands.length - 1);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onSelectCommand(filteredCommands[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isVisible, selectedIndex, filteredCommands, onSelectCommand, onSelectIndex, onClose]);

  // Effect para reposicionar menu quando viewport mudar (teclado virtual)
  useEffect(() => {
    const handleViewportChange = () => {
      if (isVisible && menuRef.current) {
        // Calcular viewport disponível (considerando teclado virtual)
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        const menuHeight = 240; // maxHeight definido no CSS
        const rect = menuRef.current.getBoundingClientRect();
        
        // Se o menu sair da parte inferior da tela, ajustar posição
        if (rect.bottom > viewportHeight) {
          // Ajustar para que fique visível, mas sempre mantendo para baixo
          const newTop = Math.max(10, viewportHeight - menuHeight - 10);
          menuRef.current.style.top = `${newTop}px`;
        }
      }
    };

    // Visual Viewport API para detectar teclado virtual
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
    }
    
    // Fallback para navegadores sem Visual Viewport API
    window.addEventListener('resize', handleViewportChange);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <>
      {/* Menu com comandos */}
      {filteredCommands.length > 0 ? (
        <div 
          ref={menuRef}
          className="absolute z-[100] bg-[#1f1f1f] border border-[#3f3f3f] rounded-lg shadow-2xl min-w-[280px] max-w-[320px]"
          tabIndex={isSmallScreen ? 0 : -1} // Focável em telas pequenas
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            maxHeight: '240px',
            overflowY: 'scroll',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch', // Smooth scrolling no iOS
            scrollbarWidth: 'thin',
            // Garantir que o menu seja scrollável mesmo com teclado virtual
            position: 'fixed',
            transform: 'translate3d(0, 0, 0)', // Force hardware acceleration
            outline: 'none', // Remover outline de foco
          }}
        >
          <div className="py-1">
            {/* Header do menu - sticky */}
            <div className="px-3 py-2 text-xs font-medium text-gray-400 border-b border-[#3f3f3f] bg-[#2a2a2a] sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <span className="text-blue-400">✨</span>
                {filter ? `${t("editor.slashMenu.searching")} "${filter}"` : t("editor.slashMenu.quickCommands")}
              </div>
            </div>

            {/* Lista de comandos com scroll melhorado */}
            <div className="py-1" style={{ maxHeight: '160px', overflowY: 'auto' }}>
              {filteredCommands.map((command, index) => (
                <button
                  key={index}
                  data-index={index}
                  className={`w-full text-left px-3 py-2.5 transition-all duration-150 flex items-center gap-3 group ${
                    index === selectedIndex 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-gray-300 hover:bg-[#2a2a2a]'
                  }`}
                  onClick={() => onSelectCommand(command)}
                  onMouseEnter={() => onSelectIndex(index)}
                >
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center text-sm font-medium ${
                    index === selectedIndex 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-[#3f3f3f] text-gray-400 group-hover:bg-[#4f4f4f]'
                  }`}>
                    {command.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm ${
                      index === selectedIndex ? 'text-white' : 'text-gray-200'
                    }`}>
                      {command.label}
                    </div>
                    <div className={`text-xs truncate ${
                      index === selectedIndex ? 'text-blue-100' : 'text-gray-500'
                    }`}>
                      {command.description}
                    </div>
                  </div>
                  {index === selectedIndex && (
                    <div className="text-xs text-blue-200 opacity-75">
                      ↵
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Footer com dica - sticky */}
            <div className="px-3 py-2 text-xs text-gray-500 border-t border-[#3f3f3f] bg-[#2a2a2a] sticky bottom-0">
              <div className="flex items-center justify-between">
                <span>↑↓ {t("editor.slashMenu.navigate")}</span>
                <span>↵ {t("editor.slashMenu.select")}</span>
                <span>esc {t("editor.slashMenu.cancel")}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Menu sem resultados */
        <div 
          ref={menuRef}
          className="absolute z-[100] bg-[#1f1f1f] border border-[#3f3f3f] rounded-lg shadow-2xl min-w-[280px]"
          tabIndex={isSmallScreen ? 0 : -1} // Focável em telas pequenas
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            position: 'fixed',
            transform: 'translate3d(0, 0, 0)',
            outline: 'none', // Remover outline de foco
          }}
        >
          <div className="py-1">
            {/* Header do menu */}
            <div className="px-3 py-2 text-xs font-medium text-gray-400 border-b border-[#3f3f3f] bg-[#2a2a2a]">
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">🔍</span>
                {t("editor.slashMenu.noResults")}
              </div>
            </div>
            
            <div className="px-3 py-4 text-center">
              <div className="text-gray-500 text-sm">
                {t("editor.slashMenu.noCommandsFound")}
              </div>
              <div className="text-gray-300 font-medium">
                /{filter}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Hook para criar os comandos do slash menu
export function useSlashCommands(
  insertMarkdown: (syntax: string) => void,
  fileInputRef: React.RefObject<HTMLInputElement | null>
) {
  const { t } = useTranslation();

  return [
    {
      label: t("editor.bold"),
      description: t("editor.slashMenu.commands.bold.description"),
      icon: "B",
      action: () => insertMarkdown("bold"),
      keywords: ["bold", "negrito", "b"]
    },
    {
      label: t("editor.italic"),
      description: t("editor.slashMenu.commands.italic.description"),
      icon: "I",
      action: () => insertMarkdown("italic"),
      keywords: ["italic", "italico", "i"]
    },
    {
      label: t("editor.heading1"),
      description: t("editor.slashMenu.commands.heading1.description"),
      icon: "H1",
      action: () => insertMarkdown("heading1"),
      keywords: ["heading", "titulo", "h1", "title"]
    },
    {
      label: t("editor.heading2"),
      description: t("editor.slashMenu.commands.heading2.description"),
      icon: "H2",
      action: () => insertMarkdown("heading2"),
      keywords: ["heading", "subtitulo", "h2", "subtitle"]
    },
    {
      label: t("editor.code"),
      description: t("editor.slashMenu.commands.code.description"),
      icon: "</>",
      action: () => insertMarkdown("code"),
      keywords: ["code", "codigo", "programming"]
    },
    {
      label: t("editor.orderedList"),
      description: t("editor.slashMenu.commands.orderedList.description"),
      icon: "1.",
      action: () => insertMarkdown("orderedList"),
      keywords: ["list", "lista", "numbered", "numerada", "ordered"]
    },
    {
      label: t("editor.unorderedList"),
      description: t("editor.slashMenu.commands.unorderedList.description"),
      icon: "•",
      action: () => insertMarkdown("unorderedList"),
      keywords: ["list", "lista", "bullet", "marcadores", "unordered"]
    },
    {
      label: t("editor.link"),
      description: t("editor.slashMenu.commands.link.description"),
      icon: "🔗",
      action: () => insertMarkdown("link"),
      keywords: ["link", "url", "hyperlink"]
    },
    {
      label: t("editor.insertImage"),
      description: t("editor.slashMenu.commands.image.description"),
      icon: "🖼️",
      action: () => {
        if (fileInputRef.current) {
          fileInputRef.current.click();
        } else {
          insertMarkdown("image");
        }
      },
      keywords: ["image", "imagem", "photo", "foto", "picture"]
    }
  ];
}
