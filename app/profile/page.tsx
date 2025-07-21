"use client";

import { useState, useEffect, useRef, memo, useCallback } from "react";
import { Avatar, AvatarImage } from "@radix-ui/react-avatar";
import Image from "next/image";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import Clock from "../components/clock";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decrypt } from "../components/Encryption";
import { useTranslation } from "react-i18next";
import { Analytics } from "@vercel/analytics/next";

const Profile = memo(() => {
  const { t } = useTranslation();
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [wallpaperLoading, setWallpaperLoading] = useState(true);
  const [avatar_url, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const [bio, setBio] = useState<string | null>(null);
  const [bioLoading, setBioLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [usernameLoading, setUsernameLoading] = useState(true);
  const [notes, setNotes] = useState<number | null>(null);
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const [wallpaperPosition, setWallpaperPosition] = useState<string>("center");
  const [dataLoaded, setDataLoaded] = useState(false);

  // Memoizar funções para evitar re-criações desnecessárias
  const getUserWallpaper = useCallback(async () => {
    if (!user?.id || dataLoaded) return;

    setWallpaperLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("wallpaper_url, wallpaper_position")
        .eq("id", user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data?.wallpaper_url) {
        const { data: urlData } = supabase.storage
          .from("user-wallpaper")
          .getPublicUrl(data.wallpaper_url);

        setWallpaperUrl(urlData.publicUrl);
        setWallpaperPosition(data?.wallpaper_position || "center");
      } else {
        setWallpaperUrl("/static/images/susan.jpg"); //default wallpaper
        setWallpaperPosition("center");
      }
    } catch (error) {
      console.error("Erro ao buscar wallpaper:", error);
      setWallpaperUrl("/static/images/susan.jpg");
      setWallpaperPosition("center");
    } finally {
      setWallpaperLoading(false);
    }
  }, [user?.id, dataLoaded]);

  const getUserPhoto = useCallback(async () => {
    if (!user?.id || dataLoaded) return;

    setAvatarLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data?.avatar_url) {
        const { data: urlData } = supabase.storage
          .from("user-avatar")
          .getPublicUrl(data.avatar_url);
        setAvatarUrl(urlData.publicUrl);
      } else {
        setAvatarUrl("/static/images/profilepic.png");
      }
    } catch (error) {
      console.error("Erro ao buscar avatar:", error);
      setAvatarUrl("/static/images/profilepic.png");
    } finally {
      setAvatarLoading(false);
    }
  }, [user?.id, dataLoaded]);

  const getUserBio = useCallback(async () => {
    if (!user?.id || dataLoaded) return;

    setBioLoading(true);
    setUsernameLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("bio, full_name")
        .eq("id", user.id)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data?.bio) {
        setBio(data.bio);
      } else {
        setBio(t("profile.bioPlaceholder"));
      }

      setUsername(data?.full_name || null);
    } catch (error) {
      console.error("Error fetching bio and username:", error);
      setBio(t("profile.bioPlaceholder"));
      setUsername(null);
    } finally {
      setBioLoading(false);
      setUsernameLoading(false);
    }
  }, [user?.id, dataLoaded, t]);



  const getUserNotes = useCallback(async () => {
    if (!user?.id || dataLoaded) return;

    try {
      const { data, error } = await supabase
        .from("notes")
        .select("*", { count: "exact" })
        .eq("user_id", user.id);

      if (error) throw error;

      setNotes(data.length);
    } catch (error) {
      console.error("Error fetching notes:", error);
      setNotes(0);
    }
  }, [user?.id, dataLoaded]);

  // Carregar dados apenas uma vez quando o usuário estiver disponível
  useEffect(() => {
    if (user?.id && !dataLoaded) {
      const loadAllData = async () => {
        await Promise.all([
          getUserWallpaper(),
          getUserPhoto(),
          getUserBio(),
          getUserNotes(),
        ]);
        setDataLoaded(true);
      };

      loadAllData();
    }
  }, [
    user?.id,
    dataLoaded,
    getUserWallpaper,
    getUserPhoto,
    getUserBio,
    getUserNotes,
  ]);

  // Resetar estado quando usuário mudar
  useEffect(() => {
    if (user?.id) {
      setDataLoaded(false);
    }
  }, [user?.id]);

  // Prevenir re-execução desnecessária quando a página volta a ter foco
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log("Profile component visible - não recarregando dados");
        // NÃO recarregar dados aqui
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const updateBio = async (newBio: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ bio: newBio, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (error) throw error;

      setBio(newBio);
    } catch (error) {
      console.error("Error updating bio:", error);
    }
  };

  const isImageFile = (file: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    return allowedTypes.includes(file.type);
  };

  // Função auxiliar para excluir arquivos antigos com tratamento de erros de permissão
  const deleteOldFile = async (bucket: string, filePath: string | null) => {
    if (!filePath) return;

    try {
      console.log(
        `Attempting to delete file ${filePath} from bucket ${bucket}`,
      );

      // Verificar se o arquivo existe antes de tentar remover
      const { data: existsData, error: existsError } = await supabase.storage
        .from(bucket)
        .list("", {
          search: filePath,
        });

      if (existsError) {
        console.error(
          `Error checking if file exists in ${bucket}:`,
          existsError,
        );
        return;
      }

      // Se o arquivo não for encontrado, não precisamos deletar
      const fileExists =
        existsData && existsData.some((item) => item.name === filePath);
      if (!fileExists) {
        console.log(
          `File ${filePath} not found in ${bucket}, skipping deletion`,
        );
        return;
      }

      // Tentar deletar o arquivo
      const { error } = await supabase.storage.from(bucket).remove([filePath]);

      if (error) {
        console.error(`Error deleting old file from ${bucket}:`, error);

        //   // Se for um erro de permissão, podemos registrar isso para análise posterior
        //   if (error.message?.includes('permission') || error.statusText === 'Unauthorized') {
        //     console.error(`Permission denied when trying to delete ${filePath} from ${bucket}`);
        //   }
      } else {
        console.log(`Successfully deleted ${filePath} from ${bucket}`);
      }
    } catch (err) {
      console.error(`Error in delete operation from ${bucket}:`, err);
    }
  };

  // Upload de wallpaper
  const uploadWallpaper = async (file: File) => {
    if (!user || !file) return;

    if (!isImageFile(file)) {
      alert("Only image files are allowed.");
      return;
    }

    // Check file size (limit to 10MB = 10 * 1024 * 1024 bytes)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > MAX_FILE_SIZE) {
      alert("Image size exceeds 10MB limit. Please choose a smaller image.");
      return;
    }

    try {
      setUploading(true);

      // Primeiro, buscar o arquivo antigo
      const { data: oldFileData, error: fetchError } = await supabase
        .from("profiles")
        .select("wallpaper_url")
        .eq("id", user.id)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") throw fetchError;

      // Criar nome de arquivo único
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;

      // Upload para o bucket
      const { error: uploadError } = await supabase.storage
        .from("user-wallpaper")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Salvar referência no perfil
      const { error: updateError } = await supabase.from("profiles").upsert({
        id: user.id,
        wallpaper_url: fileName,
        updated_at: new Date().toISOString(),
      });

      if (updateError) throw updateError;

      // Excluir o arquivo antigo após o upload bem-sucedido
      if (oldFileData?.wallpaper_url) {
        await deleteOldFile("user-wallpaper", oldFileData.wallpaper_url);
      }

      // Atualizar UI
      const { data } = supabase.storage
        .from("user-wallpaper")
        .getPublicUrl(fileName);

      setWallpaperUrl(data.publicUrl);
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      alert("Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };

  // Upload de avatar
  const uploadAvatar = async (file: File) => {
    if (!user || !file) return;

    if (!isImageFile(file)) {
      alert("Only image files are allowed.");
      return;
    }

    // Check file size (limit to 5MB = 5 * 1024 * 1024 bytes)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > MAX_FILE_SIZE) {
      alert("Image size exceeds 5MB limit. Please choose a smaller image.");
      return;
    }

    try {
      setUploadingAvatar(true);

      // Primeiro, buscar o arquivo antigo
      const { data: oldFileData, error: fetchError } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") throw fetchError;

      // Criar nome de arquivo único
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;

      // Upload para o bucket
      const { error: uploadError } = await supabase.storage
        .from("user-avatar")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Salvar referência no perfil
      const { error: updateError } = await supabase.from("profiles").upsert({
        id: user.id,
        avatar_url: fileName,
        updated_at: new Date().toISOString(),
      });

      if (updateError) throw updateError;

      // Excluir o arquivo antigo após o upload bem-sucedido
      if (
        oldFileData?.avatar_url &&
        !oldFileData.avatar_url.includes("cop-note.png")
      ) {
        await deleteOldFile("user-avatar", oldFileData.avatar_url);
      }

      // Atualizar UI
      const { data } = supabase.storage
        .from("user-avatar")
        .getPublicUrl(fileName);

      setAvatarUrl(data.publicUrl);
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      alert("Erro ao enviar imagem");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Enhanced search function with better precision
  const searchNotes = async (term: string) => {
    if (!user || term.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Clean and prepare search term
      const cleanTerm = term.trim().toLowerCase();
      const searchTerms = cleanTerm.split(/\s+/).filter(t => t.length > 1);
      
      // First, get all notes for the user
      const { data, error } = await supabase
        .from("notes")
        .select("id, title, content, created_at, tags")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Decrypt and score results
      const decryptedNotes = (data || []).map((note) => ({
        ...note,
        title: decrypt(note.title),
        content: note.content ? decrypt(note.content) : undefined,
      }));

      // Advanced scoring algorithm
      const scoredResults = decryptedNotes
        .map((note) => {
          let score = 0;
          const title = (note.title || "").toLowerCase();
          const content = (note.content || "").toLowerCase();
          const allText = `${title} ${content}`.toLowerCase();

          // Exact phrase match (highest score)
          if (title.includes(cleanTerm)) score += 100;
          if (content.includes(cleanTerm)) score += 50;

          // Title word matches (high score)
          searchTerms.forEach(searchTerm => {
            if (title.includes(searchTerm)) score += 30;
            if (content.includes(searchTerm)) score += 10;
            
            // Word boundary matches (more precise)
            const wordBoundaryRegex = new RegExp(`\\b${searchTerm}`, 'i');
            if (wordBoundaryRegex.test(title)) score += 20;
            if (wordBoundaryRegex.test(content)) score += 5;
          });

          // Tag matches
          if (note.tags && Array.isArray(note.tags)) {
            note.tags.forEach(tag => {
              if (tag.toLowerCase().includes(cleanTerm)) score += 40;
              searchTerms.forEach(searchTerm => {
                if (tag.toLowerCase().includes(searchTerm)) score += 15;
              });
            });
          }

          // Bonus for recent notes (slight preference)
          const daysSinceCreated = (Date.now() - new Date(note.created_at).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceCreated < 7) score += 5;
          if (daysSinceCreated < 1) score += 3;

          return { ...note, score };
        })
        .filter(note => note.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8); // Increased limit for better results

      setSearchResults(scoredResults);
      setShowSearchResults(true);
    } catch (error) {
      console.error("Erro ao buscar notas:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Enhanced debounce with minimum character requirement
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.trim().length >= 2) {
        searchNotes(searchTerm);
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    }, 400); // Slightly longer debounce for better UX
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchResultsRef.current &&
        !searchResultsRef.current.contains(event.target as Node)
      ) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Se não há usuário, não renderizar nada
  if (!user) {
    return null;
  }

  // Enhanced function to highlight search terms in text
  const highlightText = (text: string, searchTerm: string) => {
    if (!searchTerm.trim() || !text) return text;
    
    const terms = searchTerm.trim().toLowerCase().split(/\s+/).filter(t => t.length > 1);
    let highlightedText = text;
    
    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">$1</mark>');
    });
    
    return highlightedText;
  };

  // Função auxiliar para exibir excertos de conteúdo com destaque
  const getExcerpt = (content: string | undefined, searchTerm: string, maxLength = 100) => {
    if (!content) return "";
    
    // If search term is found, try to get context around it
    const lowerContent = content.toLowerCase();
    const lowerSearchTerm = searchTerm.toLowerCase().trim();
    
    if (lowerSearchTerm && lowerContent.includes(lowerSearchTerm)) {
      const searchIndex = lowerContent.indexOf(lowerSearchTerm);
      const start = Math.max(0, searchIndex - 30);
      const end = Math.min(content.length, searchIndex + lowerSearchTerm.length + 30);
      
      let excerpt = content.substring(start, end);
      if (start > 0) excerpt = "..." + excerpt;
      if (end < content.length) excerpt = excerpt + "...";
      
      return excerpt;
    }
    
    // Default excerpt
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + "...";
  };

  // Formatar data similar ao sidebar
  function formatDate(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Hoje";
    } else if (diffDays === 1) {
      return "Ontem";
    } else if (diffDays < 7) {
      return `${diffDays} dias atrás`;
    } else {
      return date.toLocaleDateString();
    }
  }

  // Handler para seleção de arquivo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    uploadWallpaper(e.target.files[0]);
  };

  // Add this function to update the wallpaper position
  const updateWallpaperPosition = async (position: string) => {
    if (!user) return;

    setWallpaperPosition(position);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          wallpaper_position: position,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating wallpaper position:", error);
    }
  };

  return (
    <>
      <div className="flex justify-center ">
        <div className="bg-[var(--background)] text-[var(--background]">
          <div className="relative">
            {wallpaperLoading ? (
              <div className="w-600 h-55 sm:h-130 md:h-70 2xl:h-150 bg-gray-200 animate-pulse"></div>
            ) : (
              <>
                <Link href="/dashboard">
                  <Image
                    src={wallpaperUrl || "/static/images/susan.jpg"}
                    alt="Profile"
                    width={4000}
                    height={4000}
                    className={`w-screen  h-80 sm:h-130 md:h-90 2xl:h-180 object-cover ${
                      wallpaperPosition === "top"
                        ? "object-top"
                        : wallpaperPosition === "bottom"
                          ? "object-bottom"
                          : "object-center"
                    }`}
                    priority
                    unoptimized={wallpaperUrl?.endsWith(".gif")}
                  />
                </Link>
              </>
            )}

            {/* Position controls - always visible, above wallpaper */}
            <div className="absolute z-20 top-2 left-0 flex gap-1  rounded-md p-1 shadow-lg">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10"
                title={t("profile.wallpaper.upload")}
                type="button"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
              </button>
              <button
                onClick={() => updateWallpaperPosition("top")}
                className={`w-7 h-7 flex items-center justify-center rounded ${wallpaperPosition === "top" ? "bg-white/30 border border-white" : "hover:bg-white/10"}`}
                title={t("profile.wallpaper.positionTop")}
                type="button"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                </svg>
              </button>
              <button
                onClick={() => updateWallpaperPosition("center")}
                className={`w-7 h-7 flex items-center justify-center rounded ${wallpaperPosition === "center" ? "bg-white/30 border border-white" : "hover:bg-white/10"}`}
                title={t("profile.wallpaper.positionCenter")}
                type="button"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="12" y1="3" x2="12" y2="21"></line>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                </svg>
              </button>
              <button
                onClick={() => updateWallpaperPosition("bottom")}
                className={`w-7 h-7 flex items-center justify-center rounded ${wallpaperPosition === "bottom" ? "bg-white/30 border border-white" : "hover:bg-white/10"}`}
                title={t("profile.wallpaper.positionBottom")}
                type="button"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-white"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="15" x2="21" y2="15"></line>
                </svg>
              </button>
            </div>

            <div className="absolute top-0 flex justify-center  w-full  ">
              <div id="clock" className="bg-black/80 backdrop-blur-sm">
                <Clock />
              </div>
            </div>

            {/* Informações do usuário e data */}
            <div className="absolute bottom-6 right-2 sm:right-auto sm:left-2 flex flex-col gap-1 z-20">
              <div className="bg-black/70 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-md shadow-sm">
                {new Date().toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </div>

              {user && (
                <div className="bg-black/70 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-md shadow-sm flex items-center gap-2 relative z-30">
                  {usernameLoading ? (
                    <div className="w-16 h-4 bg-gray-500 animate-pulse rounded"></div>
                  ) : username ? (
                    <span>{username}</span>
                  ) : (
                    <>
                      <span 
                        className="text-yellow-300 hover:text-yellow-100 transition-colors underline cursor-pointer relative z-50"
                        onClick={() => {
                          window.location.href = '/settings';
                        }}
                      >
                        {t('profile.setUsername')}
                      </span>
                    </>
                  )}
                  <span className="h-4 w-px bg-[var(--foreground)]/30"></span>
                  <span className="flex items-center gap-1">
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
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    {notes || 0}
                  </span>
                </div>
              )}
            </div>

            {/* Enhanced search interface */}
            <div
              className="absolute top-20 sm:top-24 left-1/2 transform -translate-x-1/2 z-30 w-full max-w-md px-4"
              ref={searchResultsRef}
            >
              <div className="flex items-center bg-black/80 backdrop-blur-sm rounded-lg shadow-lg border border-white/20 p-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-2 text-white/80"
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder={`${t("sidebar.searchNotes")} (min. 2 chars)`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent text-white px-3 py-2 w-full focus:outline-none text-sm placeholder:text-white/50"
                  onFocus={() => {
                    if (searchTerm.trim().length >= 2 && searchResults.length > 0)
                      setShowSearchResults(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowSearchResults(false);
                      setSearchTerm("");
                    }
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setShowSearchResults(false);
                    }}
                    className="mr-2 p-1 hover:bg-white/10 rounded transition-colors"
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
                      className="text-white/60"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                )}
                {isSearching && (
                  <div className="mr-2">
                    <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                  </div>
                )}
              </div>

              {/* Enhanced dropdown with better styling and relevance indicators */}
              {showSearchResults && (
                <div className="absolute left-0 right-0 mt-2 bg-black/90 backdrop-blur-sm rounded-lg shadow-2xl max-h-[400px] overflow-y-auto border border-white/20">
                  {searchResults.length > 0 ? (
                    <>
                      <div className="px-3 py-2 text-xs text-white/60 border-b border-white/10 bg-black/50">
                        {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                      </div>
                      {searchResults.map((note, index) => (
                        <button
                          key={note.id}
                          onClick={() => {
                            setShowSearchResults(false);
                            setSearchTerm("");
                            router.push(`/notes/${note.id}`);
                          }}
                          className="flex flex-col w-full text-left p-4 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0 group"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="text-white/70"
                              >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <h4 
                                  className="text-white text-sm font-medium truncate group-hover:text-blue-200 transition-colors"
                                  dangerouslySetInnerHTML={{
                                    __html: highlightText(note.title || t("sidebar.untitled"), searchTerm)
                                  }}
                                />
                                {note.score > 80 && (
                                  <span className="ml-2 px-2 py-0.5 text-xs bg-green-500/20 text-green-300 rounded-full border border-green-500/30">
                                    Best match
                                  </span>
                                )}
                              </div>

                              {note.content && (
                                <p 
                                  className="text-white/70 text-xs mt-1.5 line-clamp-2 leading-relaxed"
                                  dangerouslySetInnerHTML={{
                                    __html: highlightText(getExcerpt(note.content, searchTerm, 120), searchTerm)
                                  }}
                                />
                              )}

                              <div className="flex items-center justify-between mt-2">
                                <div className="flex items-center text-white/50 text-xs">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="mr-1"
                                  >
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                  </svg>
                                  {formatDate(note.created_at)}
                                </div>
                                {note.score > 0 && (
                                  <div className="text-xs text-white/40">
                                    {Math.round((note.score / 100) * 100)}% match
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </>
                  ) : (
                    <div className="p-6 text-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mx-auto text-white/30 mb-3"
                      >
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      </svg>
                      <p className="text-white/70 text-sm">
                        {searchTerm.trim().length < 2
                          ? "Type at least 2 characters to search"
                          : `No notes found for "${searchTerm}"`}
                      </p>
                      <p className="text-white/50 text-xs mt-1">
                        Try different keywords or check spelling
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Loading indicator for wallpaper upload */}
            {uploading && (
              <div className="absolute top-2 left-14 bg-[var(--background)] text-[var(--foreground)] p-2 rounded-md shadow flex items-center gap-2">
                <div className="h-4 w-4 border-2 border-t-transparent border-current rounded-full animate-spin"></div>
                <span className="text-xs">Uploading...</span>
              </div>
            )}
          </div>

          <div className="flex justify-center items-center gap-2 mt-[-50px] pb-2 relative">
            <div
              id="background blur"
              className="absolute inset-0 bg-[var(--background)]/10 backdrop-blur z-0 h-[30px] mt-11"
            >
              {" "}
            </div>
            <div className="relative">
              {avatarLoading ? (
                <div className="h-[80px] w-[80px] rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
              ) : (
                <Avatar
                  onClick={() => avatarFileInputRef.current?.click()}
                  className="cursor-pointer hover:opacity-86 transition-opacity duration-700"
                >
                  <AvatarImage
                    className="h-[110px] w-[110px] rounded-full object-cover object-center border-1 border-black"
                    src={avatar_url || ""}
                    alt="Profile avatar"
                  />
                </Avatar>
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full">
                  <div className="h-6 w-6 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                </div>
              )}
              <button
                onClick={() => avatarFileInputRef.current?.click()}
                className="absolute bottom-0 left-0 bg-[var(--background)] text-[var(--foreground)] p-1 rounded-full opacity-80 hover:opacity-100 border border-[var(--foreground)]"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    uploadAvatar(e.target.files[0]);
                  }
                }}
                ref={avatarFileInputRef}
              />
            </div>

            {bioLoading ? (
              <div className="italic text-[var(--foreground)] bg-[var(--container)] w-40 h-6 rounded animate-pulse "></div>
            ) : (
              <div
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => {
                  const newBio = e.target.innerText;
                  if (newBio.length <= 50) {
                    updateBio(newBio);
                  } else {
                    alert("Bio must be 50 characters or less.");
                    e.target.innerText = bio || t("profile.bioPlaceholder"); // Revert to the previous bio or use default
                  }
                }}
                className="italic  text-[var(--foreground)] bg-[var(--container)]/30 backdrop-blur-sm max-w-[260px] overflow-wrap-anywhere"
              >
                {bio || t("profile.bioPlaceholder")}
              </div>
            )}
          </div>

          {/* Input oculto para uploa</h2>d alternativo */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            style={{ display: "none" }}
          />
        </div>
      </div>
      <Analytics />
    </>
  );
});

Profile.displayName = "Profile";

export default Profile;
