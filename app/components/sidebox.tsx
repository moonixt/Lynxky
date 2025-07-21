"use client";
import { useState, useEffect, useRef } from "react";
import {
  // PlusCircle,

  Search,
  Fullscreen,
  Clock as ClockIcon,
  X,
  BookOpen,
  BookOpenText,
  ChevronDown,
  FolderPlus,
  File,
  Trash2,
  Plus,
  Folder,
  FolderOpen,
  Inbox,
  Settings,
  // Book,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import ThemeToggle from "./ThemeToggle";
import { useTranslation } from "next-i18next";
import i18n from "../../i18n";
// import LanguageSwitcher from "../../components/LanguageSwitcher";
import { encrypt, decrypt } from "./Encryption";
import eventEmitter from "../../lib/eventEmitter";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "../../components/ui/dropdown-menu";
import { checkUserLimits } from "../../lib/checkUserLimits";

interface SideboxProps {
  isVisible?: boolean;
  onVisibilityChange?: (isVisible: boolean) => void;
}

export default function Sidebox({
  isVisible = false,
  onVisibilityChange,
}: SideboxProps) {
  interface Note {
    id: string;
    title: string;
    content?: string;
    created_at: string;
    folder_id?: string | null;
  }

  interface Folder {
    id: string;
    name: string;
    expanded: boolean;
  }
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [isFolderCreating, setIsFolderCreating] = useState(false);
  const [showFoldersTab, setShowFoldersTab] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const notesLoadedRef = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  // Function to check if a note is currently active
  const isNoteActive = (noteId: string) => {
    return pathname === `/notes/${noteId}`;
  };
  const { user } = useAuth();
  const [, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const languages = [
    { code: "en", name: "English" },
    { code: "pt-BR", name: "Português (BR)" },
    { code: "ja", name: "日本語" },
    { code: "de", name: "Deutsch" },
    { code: "es", name: "Español" },
  ];

  // Initialize language detection based on browser language
  useEffect(() => {
    // Try to get language from localStorage first
    let savedLang = null;
    if (typeof window !== "undefined") {
      savedLang = localStorage.getItem("i18nextLng");
    }
    const browserLang = navigator.language;
    const supportedLanguages = Object.keys(i18n.options.resources || {});

    let langToSet = "en";
    if (savedLang && supportedLanguages.includes(savedLang)) {
      langToSet = savedLang;
    } else if (browserLang && supportedLanguages.includes(browserLang)) {
      langToSet = browserLang;
    } else if (browserLang && browserLang.startsWith("pt")) {
      langToSet = "pt-BR";
    } else if (browserLang && browserLang.startsWith("ja")) {
      langToSet = "ja";
    } else if (browserLang && browserLang.startsWith("de")) {
      langToSet = "de";
    } else if (browserLang && browserLang.startsWith("es")) {
      langToSet = "es";
    }
    i18n.changeLanguage(langToSet);
    if (typeof window !== "undefined") {
      localStorage.setItem("i18nextLng", langToSet);
    }
  }, []);

  // Check for mobile screen size
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    // Initial check
    checkIfMobile();

    // Listen for window resize
    window.addEventListener("resize", checkIfMobile);

    // Clean up
    return () => window.removeEventListener("resize", checkIfMobile);
  }, []);

  const fetchNotes = async () => {
    setLoading(true);
    try {
      if (!user) {
        setNotes([]);
        return;
      }

      const { data } = await supabase
        .from("notes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      // Descriptografia das notas antes de atualizar o estado
      const decryptedNotes = (data || []).map((note) => ({
        ...note,
        title: decrypt(note.title),
        content: note.content ? decrypt(note.content) : undefined,
      }));

      setNotes(decryptedNotes);
      notesLoadedRef.current = true;
    } catch (error) {
      console.error("Erro ao buscar notas:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFolders = async () => {
    try {
      if (!user) {
        setFolders([]);
        return;
      }

      const { data } = await supabase
        .from("folders")
        .select("*")
        .eq("user_id", user.id)
        .order("name", { ascending: true });
      setFolders(
        (data || []).map((folder) => ({
          ...folder,
          name: decrypt(folder.name), // Descriptografa o nome da pasta
          expanded: false,
        })),
      );
    } catch (error) {
      console.error("Erro ao buscar pastas:", error);
    }
  };

  useEffect(() => {
    if (user && !notesLoadedRef.current) {
      // Só carrega as notas se o usuário estiver logado e ainda não carregamos as notas
      fetchNotes();
      fetchFolders();
      notesLoadedRef.current = true;
    } else if (!user) {
      setNotes([]);
      setFolders([]);
      setLoading(false);
      notesLoadedRef.current = false;
    }
  }, [user]);

  // Adicionar listener para eventos de atualização
  useEffect(() => {
    // Função que será chamada quando uma nota for salva
    const handleNoteSaved = () => {
      if (user) {
        fetchNotes(); // Reset to show new notes
        fetchFolders();
      }
    };

    // Registrar o listener
    eventEmitter.on("noteSaved", handleNoteSaved);

    // Limpar o listener quando o componente for desmontado
    return () => {
      eventEmitter.off("noteSaved", handleNoteSaved);
    };
  }, [user]); // Re-registra o listener se o usuário mudar

  const filteredNotes = notes.filter((note) => {
    // Filtrar por termo de busca
    return (
      note.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      note.content?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  function getExcerpt(content: string | undefined, maxLength = 24) {
    if (!content) return "";
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + "...";
  }

  function getTitleExcerpt(title: string | undefined, maxLength = 24) {
    if (!title) return "";
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + "...";
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return t("sidebar.dateFormat.today");
    } else if (diffDays === 1) {
      return t("sidebar.dateFormat.yesterday");
    } else if (diffDays < 7) {
      return t("sidebar.dateFormat.daysAgo", { count: diffDays });
    } else {
      return date.toLocaleDateString(
        i18n.language === "pt-BR" ? "pt-BR" : "en-US",
        {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        },
      );
    }
  }
  const toggleMobileSidebar = () => {
    // Only close sidebar on mobile devices, not on desktop
    if (isMobile && onVisibilityChange) {
      onVisibilityChange(false);
    }
  };

  // Remove the useEffect that was managing isMobileOpen since it's no longer needed

  const toggleFolder = (folderId: string) => {
    setFolders(
      folders.map((folder) =>
        folder.id === folderId
          ? { ...folder, expanded: !folder.expanded }
          : folder,
      ),
    );
  };
  const createFolder = async () => {
    if (!newFolderName.trim() || !user) return;

    try {
      // Set loading state to true when starting folder creation
      setIsFolderCreating(true);

      // Check user limits before creating folder
      const userLimits = await checkUserLimits(user.id);
      if (!userLimits.canCreateFolder) {
        // Show limit reached notification with upgrade option
        const notification = document.createElement("div");
        notification.className =
          "fixed bottom-4 right-4 bg-yellow-500 text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-500 flex items-center gap-2 max-w-md";
        notification.innerHTML = `
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
              </svg>
              <span>${t("sidebar.folderLimitReached")}</span>
            </div>
            <button onclick="window.location.href='/pricing'" class="bg-white text-yellow-600 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100 transition-colors">
              ${t("sidebar.upgradeToPro")}
            </button>
          </div>`;
        document.body.appendChild(notification);

        setTimeout(() => {
          notification.style.opacity = "0";
          setTimeout(() => notification.remove(), 500);
        }, 5000);
        return;
      }

      const { data, error } = await supabase
        .from("folders")
        .insert([{ name: encrypt(newFolderName), user_id: user.id }])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        setFolders([
          ...folders,
          { id: data[0].id, name: newFolderName, expanded: false }, // Usamos o nome original, já que estamos adicionando à lista local
        ]);
        setNewFolderName("");
        setIsAddingFolder(false);
      }
    } catch (error) {
      console.error("Erro ao criar pasta:", error);
    } finally {
      // Always reset loading state when done
      setIsFolderCreating(false);
    }
  };

  const deleteFolder = async (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    try {
      // Primeiro, atualiza as notas para remover a referência à pasta
      await supabase
        .from("notes")
        .update({ folder_id: null })
        .eq("folder_id", folderId)
        .eq("user_id", user.id);

      // Então, remove a pasta
      const { error } = await supabase
        .from("folders")
        .delete()
        .eq("id", folderId)
        .eq("user_id", user.id);

      if (error) throw error;

      setFolders(folders.filter((folder) => folder.id !== folderId));
    } catch (error) {
      console.error("Erro ao excluir pasta:", error);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        // Safari
        (document.documentElement as any).webkitRequestFullscreen();
      } else if ((document.documentElement as any).msRequestFullscreen) {
        // IE11
        (document.documentElement as any).msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        // Safari
        (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        // IE11
        (document as any).msExitFullscreen();
      }
    }
  };

  const moveNoteToFolder = async (noteId: string, folderId: string | null) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("notes")
        .update({ folder_id: folderId })
        .eq("id", noteId)
        .eq("user_id", user.id);

      if (error) throw error;

      // Atualiza o estado das notas localmente
      setNotes(
        notes.map((note) =>
          note.id === noteId ? { ...note, folder_id: folderId } : note,
        ),
      );
    } catch (error) {
      console.error("Erro ao mover nota:", error);
    }
  };

  return (
    <div
      className={`w-80 sm:w-80 w-full max-w-80 h-screen fixed left-0 top-0 z-50 transition-all duration-300 ease-in-out ${
        isVisible ? "translate-x-0" : "-translate-x-full"
      }`}
      style={{
        pointerEvents: isVisible ? "auto" : "none",
      }}
    >
      {" "}
      {/* Sidebar */}
      <aside
        className="w-full h-full bg-[var(--background)]/95 backdrop-blur-xl text-[var(--text-color)] shadow-2xl border-r border-[var(--foreground)]/10 overflow-y-auto scrollbar"
        style={{
          paddingBottom: "60px", // Leave space for bottom bar
        }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-[var(--foreground)]/10">
            <div className="flex items-center justify-center mb-3 sm:mb-4">
              <h1 className="text-xl sm:text-2xl font-bold flex items-center">
                <div className="p-1.5 sm:p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg sm:rounded-xl mr-2 sm:mr-3 shadow-lg">
                  <Image
                    src="/icon-512x512.png"
                    alt="Lynxky"
                    width={20}
                    height={20}
                    className="w-8 h-8  rounded-full object-cover shadow-md"
                  />
                </div>
                {user ? (
                  <Link href={"/dashboard"}>
                    {" "}
                    <span
                      className="text-[var(--foreground)] px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all duration-200 hover:bg-[var(--container)]/50 hover:shadow-sm font-semibold text-base sm:text-lg"
                      onClick={() => toggleMobileSidebar()}
                    >
                      {t("sidebar.myWorkspace")}
                    </span>
                  </Link>
                ) : (
                  <span className="text-[var(--foreground)] pl-2 sm:pl-3 text-base sm:text-lg font-semibold">Lynxky</span>
                )}
              </h1>
            </div>

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder={t("sidebar.searchNotes")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-2.5 sm:p-3 pl-8 sm:pl-10 bg-[var(--container)]/50 placeholder-[var(--foreground)]/60 rounded-lg sm:rounded-xl border border-[var(--foreground)]/10 text-xs sm:text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 focus:bg-[var(--container)]/70 transition-all duration-200 outline-none"
              />
              <Search
                size={16}
                className="absolute left-2.5 sm:left-3 top-2.5 sm:top-3 text-[var(--foreground)]/60"
              />
            </div>
          </div>
          {/* Navigation Tabs */}
          <div className="flex bg-[var(--container)]/30 mx-3 sm:mx-4 rounded-lg sm:rounded-xl p-0.5 sm:p-1 mb-3 sm:mb-4">
            <button
              onClick={() => setShowFoldersTab(false)}
              className={`flex-1 py-2 sm:py-3 px-3 sm:px-4 text-center text-xs sm:text-sm font-semibold rounded-md sm:rounded-lg transition-all duration-200 ${
                !showFoldersTab 
                  ? " bg-gradient-to-br from-blue-500 to-purple-600  text-white shadow-sm" 
                  : "text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:bg-[var(--container)]/50"
              }`}
            >
              {t("sidebar.notes")}
            </button>
            <button
              onClick={() => setShowFoldersTab(true)}
              className={`flex-1 py-2 sm:py-3 px-3 sm:px-4 text-center text-xs sm:text-sm font-semibold rounded-md sm:rounded-lg transition-all duration-200 ${
                showFoldersTab 
                  ? " bg-gradient-to-br from-blue-500 to-purple-600  text-white shadow-sm" 
                  : "text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:bg-[var(--container)]/50"
              }`}
              disabled={!user}
              style={!user ? { opacity: 0.5, pointerEvents: "none" } : {}}
            >
              {t("sidebar.folders")}
            </button>
          </div>
          {/* Folders Section */}
          <div
            className={`overflow-y-auto flex-1 ${showFoldersTab ? "" : "hidden"} ${!user ? "hidden" : ""}`}
          >
            {/* Folders Header */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center bg-gradient-to-r from-[var(--container)]/20 to-[var(--container)]/10 border-b border-[var(--foreground)]/5">
              <h3 className="text-xs sm:text-sm font-semibold text-[var(--foreground)] flex items-center">
                <Folder size={14} className="sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-blue-500" />
                {t("sidebar.folders")}
              </h3>
              <button
                onClick={() => setIsAddingFolder(true)}
                className="p-1.5 sm:p-2 rounded-md sm:rounded-lg hover:bg-[var(--container)]/50 transition-all duration-200 hover:scale-105"
                title={t("sidebar.newFolder")}
              >
                <FolderPlus size={14} className="sm:w-4 sm:h-4 text-blue-500" />
              </button>
            </div>
            {isAddingFolder && (
              <div className="p-3 sm:p-4 bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-900/20 dark:to-purple-900/20 border-b border-[var(--foreground)]/10">
                <div className="flex rounded-lg sm:rounded-xl overflow-hidden shadow-sm">
                  <input
                    type="text"
                    defaultValue=""
                    onChange={(e) => {
                      // Usar um timeout para reduzir a frequência de atualização do estado
                      const value = e.target.value;
                      // Técnica básica para evitar múltiplas renderizações
                      setTimeout(() => {
                        setNewFolderName(value);
                      }, 0);
                    }}
                    placeholder={t("sidebar.folderName")}
                    className="flex-1 p-2.5 sm:p-3 text-xs sm:text-sm bg-white dark:bg-[var(--container)] border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createFolder();
                      if (e.key === "Escape") setIsAddingFolder(false);
                    }}
                    disabled={isFolderCreating}
                  />
                  <button
                    onClick={createFolder}
                    className="px-3 sm:px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 transition-all duration-200 flex items-center justify-center min-w-[50px] sm:min-w-[60px] shadow-sm"
                    disabled={isFolderCreating}
                  >
                    {isFolderCreating ? (
                      <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <span className="font-medium text-xs sm:text-sm">{t("sidebar.add")}</span>
                    )}
                  </button>
                </div>
                <button
                  onClick={() => setIsAddingFolder(false)}
                  className="w-full mt-2 sm:mt-3 text-xs text-center py-1.5 sm:py-2 text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:bg-[var(--container)]/30 rounded-md sm:rounded-lg transition-all duration-200"
                  disabled={isFolderCreating}
                >
                  {t("sidebar.cancel")}
                </button>
              </div>
            )}
            {/* Folders List */}
            <div className="px-3 sm:px-4 py-1.5 sm:py-2 space-y-1.5 sm:space-y-2">
              {folders.length === 0 ? (
                <div className="px-3 sm:px-4 py-6 sm:py-8 text-center text-xs sm:text-sm text-[var(--foreground)]/60">
                  <Folder size={20} className="sm:w-6 sm:h-6 mx-auto mb-1.5 sm:mb-2 text-[var(--foreground)]/40" />
                  <p>{t("sidebar.noFolders")}</p>
                </div>
              ) : (
                folders.map((folder) => (
                  <div key={folder.id} className="rounded-lg sm:rounded-xl overflow-hidden bg-[var(--container)]/20 hover:bg-[var(--container)]/40 transition-all duration-200">
                    <div
                      className={`p-2.5 sm:p-3 cursor-pointer transition-all duration-200 flex items-center justify-between`}
                      onClick={() => toggleFolder(folder.id)}
                    >
                      <div className="flex items-center flex-1 min-w-0">
                        <div className="p-0.5 sm:p-1 mr-1.5 sm:mr-2">
                          {folder.expanded ? (
                            <FolderOpen size={16} className="sm:w-[18px] sm:h-[18px] text-blue-500" />
                          ) : (
                            <Folder size={16} className="sm:w-[18px] sm:h-[18px] text-blue-500" />
                          )}
                        </div>
                        <ChevronDown
                          size={14}
                          className={`sm:w-4 sm:h-4 mr-1.5 sm:mr-2 transition-transform duration-200 text-[var(--foreground)]/60 ${folder.expanded ? "rotate-0" : "-rotate-90"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFolder(folder.id);
                          }}
                        />
                        <span className="text-xs sm:text-sm font-medium truncate">{folder.name}</span>
                      </div>
                      <div className="flex items-center space-x-0.5 sm:space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/editor?folder=${folder.id}`);
                          }}
                          className="p-1.5 sm:p-2 rounded-md sm:rounded-lg hover:bg-[var(--container)]/60 transition-all duration-200 hover:scale-105"
                          title={t("sidebar.addToFolder")}
                        >
                          <Plus
                            size={12}
                            className="sm:w-[14px] sm:h-[14px] text-green-500"
                          />
                        </button>
                        <button
                          onClick={(e) => deleteFolder(folder.id, e)}
                          className="p-1.5 sm:p-2 rounded-md sm:rounded-lg hover:bg-red-500/20 transition-all duration-200 hover:scale-105"
                          title={t("sidebar.deleteFolder")}
                        >
                          <Trash2
                            size={12}
                            className="sm:w-[14px] sm:h-[14px] text-red-500"
                          />
                        </button>
                      </div>
                    </div>

                    {folder.expanded && (
                      <div className="mx-4 mb-3 space-y-1 bg-gradient-to-r from-[var(--container)]/10 to-[var(--container)]/5 rounded-lg p-3 border-l-2 border-blue-500/30">
                        {notes
                          .filter((note) => note.folder_id === folder.id)
                          .map((note) => (
                            <Link
                              href={`/notes/${note.id}`}
                              key={note.id}
                              onClick={() => toggleMobileSidebar()}
                            >
                              <div className={`px-3 py-2 hover:bg-[var(--container)]/50 cursor-pointer transition-all duration-200 text-sm flex items-center justify-between group rounded-lg ${
                                isNoteActive(note.id) 
                                  ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-l-2 border-blue-500 shadow-sm' 
                                  : ''
                              }`}>
                                <div className="flex items-center overflow-hidden">
                                  <File
                                    size={14}
                                    className={`mr-3 flex-shrink-0 ${
                                      isNoteActive(note.id) ? 'text-blue-500' : 'text-blue-400'
                                    }`}
                                  />
                                  <span className={`truncate font-medium ${
                                    isNoteActive(note.id) ? 'text-blue-600 dark:text-blue-400' : ''
                                  }`}>
                                    {getTitleExcerpt(note.title) || t("sidebar.untitled")}
                                  </span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    moveNoteToFolder(note.id, null);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-500/20 transition-all duration-200"
                                  title={t("sidebar.removeFromFolder")}
                                >
                                  <X
                                    size={12}
                                    className="text-red-500"
                                  />
                                </button>
                              </div>
                            </Link>
                          ))}
                        {notes.filter((note) => note.folder_id === folder.id)
                          .length === 0 && (
                          <div className="py-4 text-xs text-center text-[var(--foreground)]/50">
                            <File size={16} className="mx-auto mb-1 opacity-50" />
                            <p>{t("sidebar.emptyFolder")}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            {/* Notas sem pasta para arrastar */}
            <div className="mt-6 px-6 py-4 flex items-center bg-gradient-to-r from-[var(--container)]/20 to-[var(--container)]/10 border-b border-[var(--foreground)]/5">
              <div className="p-2 bg-gradient-to-br from-gray-400 to-gray-600 rounded-lg mr-3">
                <Inbox size={16} className="text-white" />
              </div>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">
                {t("sidebar.unfiled")}
              </h3>
            </div>{" "}
            <div className="px-4 py-2 space-y-1">
              {notes
                .filter((note) => note.folder_id === null)
                .map((note) => (
                  <div key={note.id} className="relative group">
                    <div className={`p-3 rounded-xl hover:bg-[var(--container)]/40 cursor-pointer transition-all duration-200 mb-1 flex items-start border border-transparent hover:border-[var(--foreground)]/10 ${
                      isNoteActive(note.id) 
                        ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-l-2 border-blue-500 shadow-sm !border-blue-500/30' 
                        : ''
                    }`}>
                      <Link
                        href={`/notes/${note.id}`}
                        onClick={() => toggleMobileSidebar()}
                        className="flex-1 min-w-0"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center">
                            <File
                              size={16}
                              className={`mr-3 ${
                                isNoteActive(note.id) ? 'text-blue-500' : 'text-blue-400'
                              }`}
                            />
                            <span className={`text-sm font-medium truncate ${
                              isNoteActive(note.id) ? 'text-blue-600 dark:text-blue-400' : ''
                            }`}>
                              {getTitleExcerpt(note.title) || t("sidebar.untitled")}
                            </span>
                          </div>
                          <div className="flex items-center text-xs text-[var(--foreground)]/60 mt-2 ml-7">
                            <ClockIcon size={12} className="mr-1" />
                            <span>{formatDate(note.created_at)}</span>
                          </div>
                        </div>
                      </Link>
                      {/* Dropdown menu trigger for moving to folder */}
                      <div className="ml-2 text-[var(--foreground)] opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hover:bg-[var(--container)]/60 rounded-lg"
                            >
                                <svg
                                  width="18"
                                  height="18"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  viewBox="0 0 24 24"
                                >
                                  <circle cx="12" cy="12" r="1" />
                                  <circle cx="19" cy="12" r="1" />
                                  <circle cx="5" cy="12" r="1" />
                                </svg>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56 ">
                              <DropdownMenuLabel>
                                {t("sidebar.moveToFolder")}
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuRadioGroup
                                value={note.folder_id || "none"}
                                onValueChange={(folderId) =>
                                  moveNoteToFolder(
                                    note.id,
                                    folderId === "none" ? null : folderId,
                                  )
                                }
                              >
                                <DropdownMenuRadioItem value="none">
                                  {t("sidebar.unfiled")}
                                </DropdownMenuRadioItem>
                                {folders.map((folder) => (
                                  <DropdownMenuRadioItem
                                    key={folder.id}
                                    value={folder.id}
                                  >
                                    {folder.name}
                                  </DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                  </div>
                ))}
              {notes.filter((note) => note.folder_id === null).length === 0 && (
                <div className="py-8 text-sm text-center text-[var(--foreground)]/50">
                  <Inbox size={24} className="mx-auto mb-2 opacity-50" />
                  <p>{t("sidebar.noUncategorizedNotes")}</p>
                </div>
              )}
            </div>
          </div>
          {/* Notes list - shown only in "Notes" tab view */}
          <div
            className={`flex-1 overflow-y-auto px-3 sm:px-4 py-1.5 sm:py-2 space-y-1.5 sm:space-y-2 ${showFoldersTab ? "hidden" : ""}`}
          >
            {!user ? (
              <div className="text-center py-8 sm:py-12 text-[var(--foreground)]/60">
                <BookOpen size={28} className="sm:w-8 sm:h-8 mx-auto mb-3 sm:mb-4 opacity-50" />
                <p className="font-medium text-sm sm:text-base">{t("sidebar.loginToCreateNotes")}</p>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center py-8 sm:py-12">
                <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3 sm:mb-4"></div>
                <p className="text-xs sm:text-sm text-[var(--foreground)]/60">Loading notes...</p>
              </div>
            ) : filteredNotes.length > 0 ? (
              <>
                {filteredNotes.map((note) => (
                  <div key={note.id} className="relative group">
                    <div className={`p-3 sm:p-4   hover:bg-[var(--container)]/40 cursor-pointer transition-all duration-200 border border-transparent hover:border-[var(--foreground)]/10 hover:shadow-sm ${
                      isNoteActive(note.id) 
                        ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-l-2 border-blue-500 shadow-sm !border-blue-500/30' 
                        : ''
                    }`}>
                      <Link
                        href={`/notes/${note.id}`}
                        onClick={() => toggleMobileSidebar()}
                        className="flex items-start space-x-2.5 sm:space-x-3 flex-1"
                      >
                        <div className="flex items-start space-x-2.5 sm:space-x-3 flex-1">
                          <div className={`p-1.5 sm:p-2 rounded-md sm:rounded-lg ${
                            isNoteActive(note.id) 
                              ? 'bg-gradient-to-br from-blue-600 to-purple-700 shadow-md' 
                              : 'bg-gradient-to-br from-blue-500 to-purple-600'
                          }`}>
                            <BookOpenText
                              size={14}
                              className="sm:w-4 sm:h-4 text-white"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h2 className={`font-semibold truncate text-xs sm:text-sm ${
                              isNoteActive(note.id) ? 'text-blue-600 dark:text-blue-400' : ''
                            }`}>
                              {getTitleExcerpt(note.title) || t("sidebar.untitled")}
                            </h2>
                            {note.content && (
                              <p className="text-xs text-[var(--foreground)]/60 mt-0.5 sm:mt-1 truncate">
                                {getExcerpt(note.content)}
                              </p>
                            )}
                            <div className="flex items-center text-xs text-[var(--foreground)]/50 mt-2 sm:mt-3 space-x-2 sm:space-x-3">
                              <div className="flex items-center">
                                <ClockIcon size={10} className="sm:w-3 sm:h-3 mr-1" />
                                <span className="text-xs">{formatDate(note.created_at)}</span>
                              </div>
                              {note.folder_id && (
                                <div className="flex items-center">
                                  <Folder
                                    size={10}
                                    className="sm:w-3 sm:h-3 mr-0.5 sm:mr-1 text-blue-400"
                                  />
                                  <span className="truncate max-w-[60px] sm:max-w-[80px] text-xs">
                                    {folders.find((f) => f.id === note.folder_id)
                                      ?.name || ""}
                                  </span>
                                </div>
                              )}
                              {!note.folder_id && (
                                <div className="flex items-center">
                                  <Inbox size={10} className="sm:w-3 sm:h-3 mr-0.5 sm:mr-1 text-gray-400" />
                                  <span className="text-xs">{t("sidebar.unfiled")}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                      {/* Dropdown menu trigger */}
                      <div className="absolute top-3 sm:top-4 right-3 sm:right-4 text-[var(--foreground)] opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="hover:bg-[var(--container)]/60 rounded-md sm:rounded-lg w-6 h-6 sm:w-8 sm:h-8"
                            >
                              <svg
                                width="14"
                                height="14"
                                className="sm:w-[18px] sm:h-[18px]"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                viewBox="0 0 24 24"
                              >
                                <circle cx="12" cy="12" r="1" />
                                <circle cx="19" cy="12" r="1" />
                                <circle cx="5" cy="12" r="1" />
                              </svg>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-56 ">
                            <DropdownMenuLabel>
                              {t("sidebar.moveToFolder")}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuRadioGroup
                              value={note.folder_id || "none"}
                              onValueChange={(folderId) =>
                                moveNoteToFolder(
                                  note.id,
                                  folderId === "none" ? null : folderId,
                                )
                              }
                            >
                              <DropdownMenuRadioItem value="none">
                                {t("sidebar.unfiled")}
                              </DropdownMenuRadioItem>
                              {folders.map((folder) => (
                                <DropdownMenuRadioItem
                                  key={folder.id}
                                  value={folder.id}
                                >
                                  {folder.name}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="text-center py-12 text-[var(--foreground)]/60">
                {searchTerm ? (
                  <div>
                    <Search size={32} className="mx-auto mb-4 opacity-50" />
                    <p className="font-medium">{t("sidebar.noNotesFound")}</p>
                    <p className="text-xs mt-2 opacity-75">{t("sidebar.tryOtherTerms")}</p>
                  </div>
                ) : (
                  <div>
                    {user ? (
                      <>
                        <BookOpen size={28} className="sm:w-8 sm:h-8 mx-auto mb-3 sm:mb-4 opacity-50" />
                        <p className="font-medium text-sm sm:text-base">{t("sidebar.noNotesYet")}</p>
                        <p className="text-xs mt-1.5 sm:mt-2 mb-3 sm:mb-4 opacity-75">
                          {t("sidebar.createYourFirst")}
                        </p>
                        <button
                          onClick={() => router.push("/editor")}
                          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-sm"
                        >
                          {t("sidebar.createFirstNote")}
                        </button>
                      </>
                    ) : (
                      <>
                        <BookOpen size={28} className="sm:w-8 sm:h-8 mx-auto mb-3 sm:mb-4 opacity-50" />
                        <p className="font-medium text-sm sm:text-base">{t("sidebar.loginToCreateNotes")}</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Footer */}
          <div className="p-4 sm:p-6 text-xs text-[var(--foreground)]/70 bg-gradient-to-r from-[var(--container)]/10 to-[var(--container)]/5 border-t border-[var(--foreground)]/10">
            <div className="flex justify-between items-center">
              <div className="font-medium text-xs">
                {t("sidebar.total")}: {notes.length}{" "}
                {notes.length === 1
                  ? t("sidebar.noteCountSingular")
                  : t("sidebar.noteCountPlural")}
              </div>
              {user && (
                <button
                  onClick={async () => {
                    setError(null);
                    setIsLoggingOut(true);
                    try {
                      await supabase.auth.signOut();
                    } catch (err) {
                      if (err instanceof Error) {
                        setError(err.message);
                      }
                    } finally {
                      // Always redirect to login, even if error
                      // Optionally clear local/session storage for extra safety
                      if (typeof window !== "undefined") {
                        window.localStorage.clear();
                        window.sessionStorage.clear();
                      }
                      router.push("/login");
                      setIsLoggingOut(false);
                    }
                  }}
                  className="bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 px-3 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg disabled:opacity-60 transition-all duration-200 shadow-sm font-medium text-xs sm:text-sm"
                  disabled={isLoggingOut}
                >
                  {isLoggingOut ? "Logging out..." : t("sidebar.logout")}
                </button>
              )}
              <button
                onClick={() => {
                  notesLoadedRef.current = false; // Reset para forçar reload
                  fetchNotes();
                }}
                className="p-1.5 sm:p-2 hover:bg-[var(--container)]/50 rounded-md sm:rounded-lg transition-all duration-200 hover:scale-105"
                title={t("sidebar.refresh")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="sm:w-4 sm:h-4 text-blue-500"
                >
                  <path d="M21 2v6h-6"></path>
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                  <path d="M3 22v-6h6"></path>
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                </svg>
              </button>
            </div>
          </div>{" "}
          <div className="p-3 sm:p-4 border-t border-[var(--foreground)]/10">
            <div className="flex justify-end items-center ">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Controls" className="hover:bg-[var(--container)]/50 rounded-md sm:rounded-lg w-7 h-7 sm:w-8 sm:h-8">
                    <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 sm:w-56">
                  <DropdownMenuLabel className="font-semibold text-xs sm:text-sm">{t("sidebar.controls")}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={toggleFullscreen} className="hover:bg-[var(--container)]/50 text-xs sm:text-sm">
                    <Fullscreen className="mr-1.5 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                    {t("sidebar.fullscreen")}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="flex items-center hover:bg-[var(--container)]/50 text-xs sm:text-sm">
                      <Settings className="mr-1.5 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                      {t("sidebar.settings")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="font-semibold text-xs sm:text-sm">{t("sidebar.language")}</DropdownMenuLabel>
                  {languages.map((lang) => (
                    <DropdownMenuItem
                      key={lang.code}
                      onClick={() => i18n.changeLanguage(lang.code)}
                      className={`hover:bg-[var(--container)]/50 text-xs sm:text-sm ${i18n.language === lang.code ? "font-bold bg-blue-500/20" : ""}`}
                    >
                      {lang.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <ThemeToggle />
          </div>
          {user && (
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-[var(--container)]/30 to-[var(--container)]/20 text-[var(--foreground)] flex justify-center items-center text-xs sm:text-sm border-t border-[var(--foreground)]/10">
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full animate-pulse"></div>
                <p className="font-medium truncate">{user.email}</p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
