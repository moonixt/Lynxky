"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Analytics } from "@vercel/analytics/next";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "../components/ProtectedRoute";
import Profile from "../profile/page";
import Tasks from "../components/tasks";
// import CalendarView from "../components/CalendarView";
import { useTranslation } from "react-i18next";
// import Tables from "../components/tables";
import { Eye, Star, Users, Plus, ArrowRight, Edit, Trash2, Info } from "lucide-react";
//Info
import { checkStripeSubscription } from "../../lib/checkStripeSubscription";

// Import the hybrid note system
import { usePrivateNotes, usePublicNotes, NoteType } from "../../lib/realtimeManager";
import NoteTypeSelector, { CollaborativeStatus } from "../components/NoteTypeSelector";
import JoinByCode from "../components/JoinByCode";
import { decrypt } from "../components/Encryption";

// Bookmark
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu";

interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  favorite?: boolean;
  type?: 'private' | 'public';
  is_collaborative?: boolean;
}

// Combined note type for unified display
type DisplayNote = Note | (NoteType & { favorite?: boolean });

// Utility function to extract first image from markdown content
const extractFirstImage = (content: string): string | null => {
  const imageRegex = /!\[.*?\]\((.*?)\)/;
  const match = content.match(imageRegex);
  return match ? match[1] : null;
};

// Utility function to get text content without images and markdown formatting
const getTextPreview = (content: string, maxLength: number = 150): string => {
  // Remove image markdown syntax
  const withoutImages = content.replace(/!\[.*?\]\(.*?\)/g, "");
  // Remove other markdown formatting
  const withoutMarkdown = withoutImages.replace(/[#*`_]/g, "");
  // Clean up extra whitespace
  const cleaned = withoutMarkdown.replace(/\s+/g, " ").trim();

  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength) + "...";
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // State for note type selection
  const [currentNoteType, setCurrentNoteType] = useState<'private' | 'public'>('private');
  
  // State for JoinByCode modal
  const [showJoinModal, setShowJoinModal] = useState(false);
  
  // Use hybrid note system hooks with infinite scrolling
  const { 
    notes: privateNotes, 
    loading: privateLoading, 
    hasMore: hasMorePrivate,
    refresh: refreshPrivateNotes,
    loadMore: loadMorePrivate
  } = usePrivateNotes(user?.id);
  
  const { 
    notes: publicNotes, 
    loading: publicLoading, 
    isConnected: realtimeConnected,
    hasMore: hasMorePublic,
    refresh: refreshPublicNotes,
    loadMore: loadMorePublic
  } = usePublicNotes(user?.id);

  // Legacy state management for backward compatibility
  const [hasActiveSubscription, setHasActiveSubscription] = useState<boolean | null>(null);
  const [showTasks, setShowTasks] = useState(() => {
    if (typeof window !== "undefined") {
      const savedShowTasks = localStorage.getItem("showTasks");
      return savedShowTasks === null ? false : savedShowTasks === "true";
    }
    return true;
  });

  // Determine current notes to display based on selected type
  const currentNotes = currentNoteType === 'private' ? privateNotes : publicNotes;
  const currentLoading = currentNoteType === 'private' ? privateLoading : publicLoading;
  const hasMore = currentNoteType === 'private' ? hasMorePrivate : hasMorePublic;
  const loadMore = currentNoteType === 'private' ? loadMorePrivate : loadMorePublic;

  // Memoizar o componente Profile corretamente
  const MemoizedProfile = useMemo(() => <Profile />, [user?.id]);

  // Função para alternar o favorito (apenas para notas privadas)
  const toggleFavorite = async (
    noteId: string,
    currentFavorite: boolean | undefined,
  ) => {
    if (!user || currentNoteType !== 'private') return;
    try {
      const { error } = await supabase
        .from("notes")
        .update({ favorite: !currentFavorite })
        .eq("id", noteId)
        .eq("user_id", user.id);
      if (error) throw error;
      
      // Refresh private notes
      refreshPrivateNotes();
    } catch (error) {
      console.error("Erro ao atualizar favorito:", error);
    }
  };

  // Função para deletar uma nota
  const deleteNote = async (noteId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (!user) return;
    
    // Para notas públicas/colaborativas, mostrar mensagem informativa
    if (currentNoteType === 'public') {
      alert(t("dashboard.collaborativeDeleteInfo"));
      return;
    }
    
    const confirmed = window.confirm(t("dashboard.confirmDelete"));
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("notes")
        .delete()
        .eq("id", noteId)
        .eq("user_id", user.id);
      if (error) throw error;
      refreshPrivateNotes();
    } catch (error) {
      console.error("Erro ao deletar nota:", error);
      alert(t("dashboard.deleteError"));
    }
  };

  // Função para editar uma nota
  const editNote = (noteId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    const noteLink = currentNoteType === 'private' 
      ? `/notes/${noteId}`
      : `/notes/${noteId}?type=public`;
    
    router.push(noteLink);
  };

  // Função para verificar se o usuário tem assinatura ativa do Stripe
  const fetchSubscriptionStatus = async () => {
    if (!user) return;

    try {
      const hasSubscription = await checkStripeSubscription(user.id);
      setHasActiveSubscription(hasSubscription);
    } catch (error) {
      console.error("Erro ao verificar status da assinatura:", error);
      // Em caso de erro, considera como trial (mostra o botão)
      setHasActiveSubscription(false);
    }
  };

  // Handle successful join via invite code
  const handleJoinSuccess = (noteId: string) => {
    setShowJoinModal(false);
    // Switch to public notes to show the newly joined note
    setCurrentNoteType('public');
    // Refresh public notes to include the newly joined note
    refreshPublicNotes();
    // Navigate to the note with type parameter
    router.push(`/notes/${noteId}?type=public`);
  };

  // Handle infinite scrolling
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container && hasMore && !currentLoading) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Load more when user is 200px from the bottom
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadMore();
      }
    }
  }, [hasMore, currentLoading, loadMore]);

  // Add scroll listener
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  // Update loading state when both hooks are loaded
  // Note: Loading state is now managed by individual hooks

  // Load display preferences from localStorage on initial render
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedShowTasks = localStorage.getItem("showTasks");
      // const savedShowCalendar = localStorage.getItem("showCalendar");
      // const savedShowTables = localStorage.getItem("showTables");

      setShowTasks(savedShowTasks === null ? true : savedShowTasks === "true");
      // setShowCalendar(
      //   savedShowCalendar === null ? true : savedShowCalendar === "true",
      // );
      // setShowTables(
      //   savedShowTables === null ? true : savedShowTables === "true",
      // );
    }
  }, []);

  // Save display preferences to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("showTasks", showTasks.toString());
    }
  }, [showTasks]);

  // Fetch subscription status when user changes
  useEffect(() => {
    if (user) {
      fetchSubscriptionStatus();
    } else {
      setHasActiveSubscription(null);
    }
  }, [user]);

  // Prevenir re-fetch desnecessário quando a página volta a ter foco
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log("Dashboard visível - notas são gerenciadas pelos hooks");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <>
      <ProtectedRoute>
        {" "}
        <div ref={scrollContainerRef} className="smooth overflow-y-auto max-h-screen scrollbar">
          <div>{MemoizedProfile}</div>

          <div className="p-4 sm:p-0  mx-auto max-w-screen  sm:max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-7xl 2xl:max-w-7xl ">
            {/* Renderização condicional do botão Free trial */}
            {hasActiveSubscription === false && (
              <div className="flex justify-end mb-4 ">
                {" "}
                <button
                  className=" px-2 py-2 flex justify-center sm:px-5 sm:py-2.5 rounded-md  text-base font-medium  bg-gradient-to-r from-grey-900 to-blue-300/40 border border-[var(--border-theme)]/30 text-[var(--foreground)]   hover:bg-opacity-60 transition-all hover:shadow-md transition-colors flex items-center gap-2"
                  onClick={() => router.push("/pricing")}
                >
                  {t("dashboard.freeTrialButton")}
                </button>
              </div>
            )}
            <div className="flex-1  gap-4">
              {/* New document button */}

              {/* <div className="flex justify-center">
            <button
              className="px-4 py-2 flex justify-center sm:px-5 sm:py-2.5 sm:w-96 w-60 rounded-md  text-base font-medium  bg-gradient-to-r from-[var(--button-theme)] to-[var(--theme2)]/40 border border-[var(--border-theme)]/30 text-[var(--text-theme)]   hover:bg-opacity-60 transition-all hover:shadow-md transition-colors flex items-center gap-2"
              onClick={() => router.push("/editor")}
            >
               <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>{t("dashboard.newDocument")}</span>
             
            </button>
           
            </div> */}

              {/* Tasks component with conditional rendering and animation */}
              <div
                className={`transition-all duration-600  ease-in-out overflow-hidden ${
                  showTasks
                    ? "max-h-full pt-6 opacity-100"
                    : "max-h-0 opacity-0 mb-0"
                }`}
              >
                {showTasks && <Tasks />}
              </div>

              {/* Calendar component with conditional rendering */}
              {/* <div
              className={`transition-all duration-600 ease-in-out overflow-hidden mt-4 ${
                showCalendar
                  ? "max-h-[1000px] opacity-100"
                  : "max-h-0 opacity-0 mb-0"
              }`}
            >
              {showCalendar && (
                <div>
                  <h2 className="text-xl font-semibold ">
                    {t("dashboard.calendar")}
                  </h2>
                  <CalendarView />
                </div>
              )}
            </div> */}
            </div>
            {/* Tables component with conditional rendering */}
            {/* <div
            className={`transition-all duration-600 ease-in-out mt-4 ${
              showTables ? "opacity-100 " : "max-h-0 opacity-0 mb-0"
            }`}
          >
            {showTables && (
              <div className="w-[380px] sm:w-auto ">
                <Tables />
              </div>
            )}
          </div> */}
            {/* Pinterest-style Header Section relative mb-8 text-center */}
          
            <div className="">  
              {/* Background decoration */}
              {/* <div className="absolute inset-0 theme-bg-light rounded-3xl opacity-50"></div>
              
              <div className="relative z-10 py-8 px-6">
                <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 bg-clip-text text-transparent mb-4">
                  ✨ Your Creative Space
                </h1>
                <p className="text-lg text-[var(--foreground)]/70 max-w-2xl mx-auto">
                  Discover, organize, and share your ideas in your own workspace
                </p>
                
                
              </div> */}
            </div>

            <div className="flex justify-between items-center ">
              <h1 className="text-xl font-semibold mt-4 mb-2">
                {t("dashboard.documents")}
              </h1>
              {/* Toggle components dropdown */}
              <div className="">
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-[var(--button-theme)] to-[var(--theme2)]/40 border border-[var(--border-theme)]/30 text-[var(--text-theme)] hover:bg-[var(--container)] hover:shadow-md transition-all duration-200 group">
                    <Eye className="h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
                    <span className="text-sm font-medium hidden sm:inline">View</span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="group-hover:translate-y-0.5 transition-transform duration-200"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-[var(--background)] border border-[var(--border-theme)]/30 rounded-lg shadow-lg backdrop-blur-sm">
                    <DropdownMenuLabel className="text-[var(--text-color)] font-semibold px-3 py-2">
                      {t("dashboard.components")}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-[var(--border-theme)]/20" />
                    <DropdownMenuCheckboxItem
                      checked={showTasks}
                      onCheckedChange={setShowTasks}
                      className="text-[var(--text-color)] hover:bg-[var(--container)]/50 transition-colors duration-200 px-3 py-2 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 flex items-center justify-center">
                          {showTasks && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="text-green-500"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          )}
                        </div>
                        <span>{t("dashboard.tasks")}</span>
                      </div>
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Note Type Selector and Actions */}
            <div className="mb-6 grid items-center justify-center gap-2">
              <NoteTypeSelector
                currentType={currentNoteType}
                onTypeChange={setCurrentNoteType}
                className="flex-1"
              />
              
              {/* Join by Code Button - only show for public notes */}
              {currentNoteType === 'public' && (
                <button
                  onClick={() => setShowJoinModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-[var(--button-theme)] to-[var(--theme2)]/40 border border-[var(--border-theme)]/30 text-[var(--text-theme)] rounded-md hover:bg-opacity-60 transition-all hover:shadow-md flex items-center gap-2"
                  title={t("dashboard.joinByCode", "Join by Code")}
                >
                  <Plus className="h-4 w-4" />
                  <span className=" sm:inline">{t("dashboard.joinByCode", "Join by Code")}</span>
                </button>
              )}
              
              {/* Realtime Connection Status for Public Notes */}
              {currentNoteType === 'public' && (
                <div>
                  <CollaborativeStatus isConnected={realtimeConnected} />
                </div>
              )}
            </div>

            {currentLoading && currentNotes.length === 0 ? (
              <p>{t("dashboard.loading")}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pt-5">
                  {currentNotes.map((note: DisplayNote, index: number) => {
                    // Handle both private and public note types with decryption
                    const noteTitle = currentNoteType === 'private' 
                      ? (note as Note).title  // Already decrypted in usePrivateNotes hook
                      : decrypt((note as NoteType).title);  // Decrypt public note title
                    
                    const noteContent = currentNoteType === 'private'
                      ? (note as Note).content || ''  // Already decrypted in usePrivateNotes hook
                      : decrypt((note as NoteType).content || '');  // Decrypt public note content
                    
                    const firstImage = extractFirstImage(noteContent);
                    const textPreview = getTextPreview(noteContent);

                    // Determine the link based on note type
                    const noteLink = currentNoteType === 'private' 
                      ? `/notes/${note.id}`
                      : `/notes/${note.id}?type=public`;

                    return (
                      <div
                        key={note.id}
                        className="group block relative cursor-pointer"
                        onClick={() => router.push(noteLink)}
                      >
                        <div
                          className="bg-[var(--container)]/30 backdrop-blur-sm flex flex-col rounded-lg border border-[var(--foreground)]/20 overflow-hidden transition-all duration-300 hover:shadow-xl h-full"
                        >
                          {/* Display first image if available - moved to top */}
                          {firstImage && (
                            <div className="overflow-hidden relative">
                              <img
                                src={firstImage}
                                alt="Note preview"
                                className="w-full h-32 object-cover object-top transition-transform duration-300 group-hover:scale-110"
                                onError={(e) => {
                                  // Hide image if it fails to load
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            </div>
                          )}

                          <div className="p-4 flex flex-col flex-grow">
                            <div className="flex justify-between items-center mb-2">
                              {/* Collaboration indicator for public notes */}
                              {currentNoteType === 'public' && (note as NoteType).is_collaborative && (
                                <div className="flex items-center gap-1 text-xs text-blue-500">
                                  <Users size={14} />
                                  <span>Collaborative</span>
                                </div>
                              )}
                              
                              {/* Favorite button - only for private notes */}
                              {currentNoteType === 'private' && (
                                <button
                                  type="button"
                                  aria-label={
                                    (note as Note).favorite
                                      ? t("dashboard.unbookmark")
                                      : t("dashboard.bookmark")
                                  }
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    toggleFavorite(note.id, (note as Note).favorite);
                                  }}
                                  className={`rounded-full p-1.5 transition-colors ml-auto z-10 ${(note as Note).favorite ? " text-[var(--foreground)]" : "hover:bg-[var(--foreground)] hover:text-[var(--background)]"}`}
                                >
                                  <Star
                                    size={18}
                                    fill={(note as Note).favorite ? "currentColor" : "none"}
                                  />
                                </button>
                              )}
                            </div>

                            <h2 className="text-base font-semibold mb-3 leading-tight break-words overflow-hidden">
                              {noteTitle || t("dashboard.note.untitled")}
                            </h2>

                            <p className="text-sm text-[var(--foreground)] opacity-80 mb-4 flex-grow leading-relaxed break-words overflow-hidden">
                              {textPreview || t("dashboard.note.noContent")}
                            </p>
                            <div className="flex justify-between items-center text-xs text-gray-500 mt-auto pt-3 border-t border-[var(--container)]/20">
                              <span>
                                {new Date(note.created_at).toLocaleDateString()}
                              </span>
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="opacity-60"
                              >
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1-2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                              </svg>
                            </div>
                          </div>

                          {/* Pinterest-style hover overlay - Bottom bar with action buttons */}
                          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-b-lg">
                            <div className="flex justify-end items-end p-3 gap-2 h-full">
                              <button
                                type="button"
                                aria-label="Edit note"
                                onClick={(e) => editNote(note.id, e)}
                                className="bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 transition-all duration-200 hover:scale-110 shadow-lg"
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                type="button"
                                aria-label={currentNoteType === 'public' ? "Delete info" : "Delete note"}
                                onClick={(e) => deleteNote(note.id, e)}
                                className={`rounded-full p-2 transition-all duration-200 hover:scale-110 shadow-lg ${
                                  currentNoteType === 'public' 
                                    ? "bg-blue-500/90 hover:bg-blue-500 text-white" 
                                    : "bg-red-500/90 hover:bg-red-500 text-white"
                                }`}
                              >
                                {currentNoteType === 'public' ? <Info size={16} /> : <Trash2 size={16} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Loading indicator for infinite scroll */}
                {currentLoading && currentNotes.length > 0 && (
                  <div className="flex justify-center items-center p-6">
                    <div className="flex items-center gap-2 text-sm text-[var(--foreground)] opacity-70">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                      <span>Loading more notes...</span>
                    </div>
                  </div>
                )}
                
                {/* End of content indicator */}
                {!hasMore && currentNotes.length > 0 && (
                  <div className="flex justify-center items-center p-6">
                    <span className="text-sm text-[var(--foreground)] opacity-50">
                      {t("dashboard.endOfNotes", "You've reached the end")}
                    </span>
                  </div>
                )}
              </>
            )}
            {!currentLoading && currentNotes.length === 0 && (
              <div className="flex flex-col items-center justify-center p-10 border border-dashed border-[var(--foreground)] bg-opacity-10 mt-4">
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mb-4 opacity-50"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-6"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="12" y1="18" x2="12" y2="12"></line>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
                <h3 className="text-lg font-semibold mb-2">
                  {currentNoteType === 'private' 
                    ? t("dashboard.emptyState.title") 
                    : "No public notes yet"}
                </h3>
                <p className="text-sm text-[var(--foreground)] opacity-70 mb-4 text-center">
                  {currentNoteType === 'private'
                    ? t("dashboard.emptyState.description")
                    : "Create your first collaborative note to start sharing and collaborating with others!"}
                </p>
              </div>
            )}{" "}
          </div>
        </div>
        
        {/* Join by Code Modal */}
        <JoinByCode
          isOpen={showJoinModal}
          onClose={() => setShowJoinModal(false)}
          onSuccess={handleJoinSuccess}
          onError={(error) => {
            console.error('Join by code error:', error);
            // You could add a toast notification here
          }}
        />
      </ProtectedRoute>
      <Analytics />
    </>
  );
}