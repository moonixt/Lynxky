// NEED REVIEW

"use client";

// import Papa from "papaparse";
// import * as XLSX from "xlsx";
import { useState, useRef, useEffect, useCallback } from "react"; //import Usestate, the hook to managge state in react
import { supabase } from "../../lib/supabase"; //import the supabase client to connect to the database
import { useRealtimeUserData, realtimeManager } from "../../lib/realtimeManager"; // Import realtime manager
import { checkUserLimits } from "../../lib/checkUserLimits"; // Import the user limits checker
import { checkSubscriptionStatus } from "../../lib/checkSubscriptionStatus"; // Import subscription checker
import {
  Eye,
  Edit,
  ListOrdered,
  LayoutList,
  SmilePlus,
  Image,
  FolderIcon,
  ChevronDown, // Add import for dropdown icon
  Lock,
  Users,
} from "lucide-react"; //import of some icons from Lucide-React library
import { useAuth } from "../../context/AuthContext"; //import of the auth context to manage the authentication of the user
import ReactMarkdown from "react-markdown"; //Library to render markdown
import remarkGfm from "remark-gfm"; //Plugin to support GFM (GitHub Flavored Markdown) in ReactMarkdown
import EmojiPicker, { Theme } from "emoji-picker-react"; //LIbrary to enable support of emojis inside the text area
import { EmojiClickData } from "emoji-picker-react"; //Type for the emoji click data
// import ClientLayout from "./ClientLayout";
import Profile from "../profile/page";
import SlashCommandMenu, { useSlashCommands } from "./SlashCommandMenu";
import { encrypt, decrypt } from "./Encryption"; // Importar funções de criptografia e descriptografia
import { useTranslation } from "react-i18next"; // Import the translation hook

interface EditorProps {
  initialNoteType?: 'private' | 'public';
  noteId?: string; // Add noteId to know if we're editing an existing note
}


function Editor({ initialNoteType = 'private', noteId }: EditorProps) {
  //main function for the editor component
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const autoSaveTimeout = useRef<NodeJS.Timeout | null>(null);
  const { user } = useAuth();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showEmojiPickerContent, setShowEmojiPickerContent] = useState(false);
  const [imageUploadLoading, setImageUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // const [tagSearchTerm, setTagSearchTerm] = useState("");
  const { t } = useTranslation();
  const [, setCanCreateNotes] = useState(true);

  // State for note type selection
  const [selectedNoteType, setSelectedNoteType] = useState<'private' | 'public'>(initialNoteType);
  const [showNoteTypeDropdown, setShowNoteTypeDropdown] = useState(false);
  const [, setHasReadOnlyAccess] = useState(false);
  
  // Add flag to track if component has finished initializing
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Add state to track if this is editing an existing note
  const [isEditingExistingNote, setIsEditingExistingNote] = useState(false);
  
  // Add state to track the current note ID after creation
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(noteId || null);
  
  // Add state to track if user is trying to change note type
  const [showNoteTypeChangeDialog, setShowNoteTypeChangeDialog] = useState(false);
  const [pendingNoteType, setPendingNoteType] = useState<'private' | 'public' | null>(null);

  // Estados para o menu de comandos com /
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
  const [slashMenuFilter, setSlashMenuFilter] = useState('');
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Add state for folders and folder selection
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string } | null>(null);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);

  // Create a ref for the folder dropdown
  const folderDropdownRef = useRef<HTMLDivElement>(null);
  // Create a ref for the note type dropdown
  const noteTypeDropdownRef = useRef<HTMLDivElement>(null);

  // Setup Realtime for this user
  const { isConnected } = useRealtimeUserData(user?.id, {
    onNotesChange: (payload) => {
      console.log('Editor: Notes changed via realtime', payload);
      // Realtime will automatically update the sidebar since it has its own subscription
      // No need to manually refetch here
    },
    onFoldersChange: (payload) => {
      console.log('Editor: Folders changed via realtime', payload);
      // Atualizar a lista de pastas quando houver mudanças
      if (user) {
        fetchFolders();
      }
    },
    onTasksChange: (payload) => {
      console.log('Editor: Tasks changed via realtime', payload);
    },
    onCalendarEventsChange: (payload) => {
      console.log('Editor: Calendar events changed via realtime', payload);
    },
    onNoteSharedChange: (payload) => {
      console.log('Editor: Note sharing changed via realtime', payload);
    }
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        folderDropdownRef.current &&
        !folderDropdownRef.current.contains(event.target as Node)
      ) {
        setShowFolderDropdown(false);
      }
      
      if (
        noteTypeDropdownRef.current &&
        !noteTypeDropdownRef.current.contains(event.target as Node)
      ) {
        setShowNoteTypeDropdown(false);
      }
    }

    // Add event listener when any dropdown is open
    if (showFolderDropdown || showNoteTypeDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    // Clean up
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showFolderDropdown, showNoteTypeDropdown]); // Check subscription status when user changes
  useEffect(() => {
    const checkSubscription = async () => {
      if (user) {
        try {
          const subscriptionStatus = await checkSubscriptionStatus(user.id);
          setCanCreateNotes(subscriptionStatus.canCreate);
          setHasReadOnlyAccess(subscriptionStatus.hasReadOnlyAccess);
        } catch (error) {
          console.error("Error checking subscription status:", error);
          setCanCreateNotes(false);
          setHasReadOnlyAccess(true);
        }
      }
    };

    checkSubscription();
  }, [user]);

  // Carregar dados do localStorage quando o componente montar
  useEffect(() => {
    // Verificar se estamos no navegador (não em SSR)
    if (typeof window !== "undefined") {
      const savedTitle = localStorage.getItem("fair-note-title");
      const savedContent = localStorage.getItem("fair-note-content");
      const savedTags = localStorage.getItem("fair-note-tags");

      if (savedTitle) setTitle(savedTitle);
      if (savedContent) setContent(savedContent);
      if (savedTags) setSelectedTags(JSON.parse(savedTags));

      // Add this to load the folder if it was saved
      const savedFolder = localStorage.getItem("fair-note-folder");
      if (savedFolder) {
        try {
          setSelectedFolder(JSON.parse(savedFolder));
        } catch (e) {
          console.error("Error parsing saved folder", e);
        }
      }
    }

    // Check if we're editing an existing note
    if (noteId) {
      setIsEditingExistingNote(true);
    }

    // Fetch folders when component mounts
    if (user) {
      fetchFolders();
    }

    // Mark component as initialized after loading data
    setIsInitialized(true);

    // Cleanup function - limpa localStorage quando o componente é desmontado
    return () => {
      // Only clear localStorage if we're creating a new note, not editing existing
      if (!noteId) {
        localStorage.removeItem("fair-note-title");
        localStorage.removeItem("fair-note-content");
        localStorage.removeItem("fair-note-tags");
        localStorage.removeItem("fair-note-folder");
      }
    };
  }, [user, noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Add fetchFolders function using useCallback to prevent dependency issues
  const fetchFolders = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("folders")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      if (error) throw error;

      if (data) {
        // Descriptografar os nomes das pastas
        const decryptedFolders = data.map((folder) => ({
          ...folder,
          name: decrypt(folder.name),
        }));
        setFolders(decryptedFolders);
      }
    } catch (error) {
      console.error("Error fetching folders:", error);
    }
  }, [user]);

  // Salvar dados no localStorage quando mudarem
  useEffect(() => {
    localStorage.setItem("fair-note-title", title);
    localStorage.setItem("fair-note-content", content);
    localStorage.setItem("fair-note-tags", JSON.stringify(selectedTags));

    // Add this to save the selected folder
    if (selectedFolder) {
      localStorage.setItem("fair-note-folder", JSON.stringify(selectedFolder));
    } else {
      localStorage.removeItem("fair-note-folder");
    }
  }, [title, content, selectedTags, selectedFolder]);

  // const toggleTag = (tag: string) => {
  //   //function to togle in the tags, if the tag is already selected, it will be removed, otherwise it will be added to the selected tags
  //   setSelectedTags((prevTags) =>
  //     prevTags.includes(tag)
  //       ? prevTags.filter((t) => t !== tag)
  //       : [...prevTags, tag],
  //   );
  // };

  //Handle Emoji selector, working in the title and TextArea
  const handleEmojiSelect = (emojiData: EmojiClickData) => {
    setTitle((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const handleEmojiSelectContent = (emojiData: EmojiClickData) => {
    setContent((prev) => prev + emojiData.emoji);
    setShowEmojiPickerContent(false);
  };

  // Function to handle note type change with content check
  const handleNoteTypeChange = (newType: 'private' | 'public') => {
    // If no content yet, allow immediate change
    if (!title.trim() && !content.trim() && !isEditingExistingNote) {
      setSelectedNoteType(newType);
      setShowNoteTypeDropdown(false);
      return;
    }

    // If there's content or we're editing an existing note, show confirmation dialog
    setPendingNoteType(newType);
    setShowNoteTypeChangeDialog(true);
    setShowNoteTypeDropdown(false);
  };

  // Check if there's significant content
  const hasContent = () => {
    return title.trim().length > 0 || content.trim().length > 0 || isEditingExistingNote;
  };

  // Function to confirm note type change
  const confirmNoteTypeChange = async () => {
    if (!pendingNoteType) return;

    try {
      // If we're editing an existing note, save it first
      if (isEditingExistingNote && currentNoteId) {
        await saveNote();
      }

      // Reset state for new note type
      setSelectedNoteType(pendingNoteType);
      setIsEditingExistingNote(false);
      setCurrentNoteId(null);

      // Clear localStorage to start fresh
      localStorage.removeItem("fair-note-title");
      localStorage.removeItem("fair-note-content");
      localStorage.removeItem("fair-note-tags");
      localStorage.removeItem("fair-note-folder");

      // Keep current content but mark as new note
      // Content stays in the form, but will be saved as new note type

      setShowNoteTypeChangeDialog(false);
      setPendingNoteType(null);
    } catch (error) {
      console.error("Error saving before note type change:", error);
      // Show error but still allow the change
      setSelectedNoteType(pendingNoteType);
      setIsEditingExistingNote(false);
      setCurrentNoteId(null);
      setShowNoteTypeChangeDialog(false);
      setPendingNoteType(null);
    }
  };

  // Function to cancel note type change
  const cancelNoteTypeChange = () => {
    setShowNoteTypeChangeDialog(false);
    setPendingNoteType(null);
  };

  // Handle ESC key for dialog
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showNoteTypeChangeDialog) {
        cancelNoteTypeChange();
      }
    };

    if (showNoteTypeChangeDialog) {
      document.addEventListener('keydown', handleEscapeKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [showNoteTypeChangeDialog]);

  const insertMarkdown = (markdownSyntax: string) => {
    //main function to insert markdown in the text area
    // Get the textarea element where the content is being edited
    const textarea = textareaRef.current; // Use ref instead of querySelector
    if (!textarea) return; // Exit if no textarea is found

    // Get the current selection range in the textarea
    const start = textarea.selectionStart; // get the select the start position of the text area
    const end = textarea.selectionEnd; // get the select the end position of the text area

    // Extract the selected text from the content
    const selectedText = content.substring(start, end); // get the selected text from the content

    // Initialize a variable to hold the new text with Markdown syntax
    let newText = "";

    // Switch statement to handle different Markdown syntax insertions
    switch (markdownSyntax) {
      case "bold":
        // Wrap the selected text (or placeholder text) with double asterisks for bold formatting
        newText = `**${selectedText || t("editor.slashMenu.placeholders.bold")}**`; //bold text example
        break;
      case "italic":
        // Wrap the selected text (or placeholder text) with single asterisks for italic formatting
        newText = `*${selectedText || t("editor.slashMenu.placeholders.italic")}*`; //italic text example
        break;
      case "heading1":
        // Add a single hash symbol followed by the selected text (or placeholder) for a level 1 heading
        newText = `# ${selectedText || t("editor.slashMenu.placeholders.heading1")}`; // heading level 1 exemple
        break;
      case "heading2":
        // Add two hash symbols followed by the selected text (or placeholder) for a level 2 heading
        newText = `## ${selectedText || t("editor.slashMenu.placeholders.heading2")}`; //heading level 2 example
        break;
      case "code":
        // If the selected text contains newlines, wrap it in triple backticks for a code block
        // Otherwise, wrap it in single backticks for inline code
        newText = selectedText.includes("\n")
          ? `\`\`\`\n${selectedText || t("editor.slashMenu.placeholders.codeBlock")}\n\`\`\``
          : `\`${selectedText || t("editor.slashMenu.placeholders.code")}\``;
        break;
      case "orderedList":
        if (selectedText) {
          const lines = selectedText.split("\n"); // of has already content it will be formated
          newText = lines
            .map((line, index) => `${index + 1}. ${line}`)
            .join("\n");
        } else {
          // if not add a basic template
          newText = t("editor.slashMenu.placeholders.orderedList");
        }
        break;
      case "unorderedList":
        if (selectedText) {
          // if has already a content , format the text
          const lines = selectedText.split("\n");
          newText = lines.map((line) => `- ${line}`).join("\n");
        } else {
          // If not, add a template
          newText = t("editor.slashMenu.placeholders.unorderedList");
        }
        break;
      case "link":
        // Create a Markdown link with the selected text (or placeholder) as the link text and "url" as the placeholder URL
        newText = `[${selectedText || t("editor.slashMenu.placeholders.linkText")}](${t("editor.slashMenu.placeholders.linkUrl")})`;
        break;
      case "image":
        newText = `![${selectedText || t("editor.slashMenu.placeholders.imageDescription")}](${t("editor.slashMenu.placeholders.imageUrl")})`;
        break;
    }

    const newContent =
      content.substring(0, start) + newText + content.substring(end);
    setContent(newContent);

    // Reposicionar o cursor após a inserção
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + newText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const saveNote = async () => {
    //main fuction to save the notes in the database
    // Don't save if both title and content are empty for new notes
    if (!isEditingExistingNote && !title.trim() && !content.trim()) return;

    // Verify if the user is verified
    if (!user) {
      //if the user is not verified      // Show the notification error
      const notification = document.createElement("div");
      notification.className =
        "fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-500 flex items-center gap-2 z-[60]";
      notification.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 101.414 1.414L10 11.414l1.293-1.293a1 1 00-1.414-1.414L11.414 10l1.293-1.293a1 1 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
      </svg>${t("editor.loginRequired")}`;
      document.body.appendChild(notification);

      setTimeout(() => {
        //timeout for delay the notification
        notification.style.opacity = "0";
        setTimeout(() => notification.remove(), 500);
      }, 3000);
      return;
    }

    try {
      // Check user limits before saving (only for private notes and new notes)
      if (selectedNoteType === 'private' && !isEditingExistingNote) {
        const userLimits = await checkUserLimits(user.id);

        if (!userLimits.canCreateNote) {
          // Show limit reached notification with upgrade option
          const notification = document.createElement("div");
          notification.className =
            "fixed bottom-4 right-4 bg-yellow-500 text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-500 flex items-center gap-2 max-w-md z-[60]";
          notification.innerHTML = `
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
                <span>${t("editor.limitReached")}</span>
              </div>
              <button onclick="window.location.href='/pricing'" class="bg-white text-yellow-600 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100 transition-colors">
                ${t("editor.upgradeToPro")}
              </button>
            </div>`;
          document.body.appendChild(notification);

          setTimeout(() => {
            notification.style.opacity = "0";
            setTimeout(() => notification.remove(), 500);
          }, 5000);
          return;
        }
      }

      setSaving(true); // Change the state to true

      if (selectedNoteType === 'public') {
        if (isEditingExistingNote && currentNoteId) {
          // Update existing public note
          const encryptedContent = encrypt(content);
          const encryptedTitle = encrypt(title || "Untitled");
          
          const result = await realtimeManager.updatePublicNote(
            currentNoteId,
            {
              title: encryptedTitle,
              content: encryptedContent
            }
          );

          if (!result.success) {
            throw new Error(result.error || 'Failed to update public note');
          }
        } else {
          // Create new public note using the realtime manager with encryption
          const encryptedContent = encrypt(content);
          const encryptedTitle = encrypt(title || "Untitled");
          
          const result = await realtimeManager.createPublicNote(
            encryptedTitle, 
            encryptedContent,
            {
              allowAnonymousView: false,
              allowAnonymousEdit: false
            }
          );

          if (!result.success) {
            throw new Error(result.error || 'Failed to create public note');
          }

          // After creating, mark as editing existing note for future saves
          if (result.note && result.note.id) {
            setCurrentNoteId(result.note.id);
            setIsEditingExistingNote(true);
          }
        }
      } else {
        // Handle private notes
        const encryptedContent = encrypt(content);
        const encryptedTitle = encrypt(title || "Untitled");

        if (isEditingExistingNote && currentNoteId) {
          // Update existing private note
          const { error } = await supabase
            .from("notes")
            .update({
              title: encryptedTitle,
              content: encryptedContent,
              tags: selectedTags,
              folder_id: selectedFolder ? selectedFolder.id : null,
            })
            .eq("id", currentNoteId)
            .eq("user_id", user.id);

          if (error) throw error;
        } else {
          // Create new private note
          const { data, error } = await supabase
            .from("notes")
            .insert([
              {
                title: encryptedTitle,
                content: encryptedContent,
                user_id: user.id,
                tags: selectedTags,
                folder_id: selectedFolder ? selectedFolder.id : null,
              },
            ])
            .select();

          if (error) throw error;

          // After creating, mark as editing existing note and save the noteId for future updates
          if (data && data[0]) {
            setCurrentNoteId(data[0].id);
            setIsEditingExistingNote(true);
          }
        }
      }

      // If success, this flow will be executed:
      // Status é controlado pelo autosave

      // Only clear localStorage after saving a new note successfully
      if (!isEditingExistingNote) {
        localStorage.removeItem("fair-note-title");
        localStorage.removeItem("fair-note-content");
        localStorage.removeItem("fair-note-tags");
        localStorage.removeItem("fair-note-folder");
      }

      // NÃO limpar os campos do editor - manter o conteúdo após salvar
      // Os campos devem permanecer com o conteúdo atual para permitir edições contínuas

      // Auto fetch notes and folders after saving
      // Removed manual calls since Realtime will automatically notify all subscribed components
      // The sidebar will update automatically via its own Realtime subscription
    } catch (error) {
      console.error("Erro ao salvar nota:", error); //error logged in the console      // Notification toast for erro
      const notification = document.createElement("div");
      notification.className =
        "fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-500 flex items-center gap-2 z-[60]";
      notification.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 101.414 1.414L10 11.414l1.293-1.293a1 1 00-1.414-1.414L11.414 10l1.293-1.293a1 1 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
      </svg>${t("editor.saveError")}`;
      document.body.appendChild(notification);

      setTimeout(() => {
        //delay for the notification desappear
        notification.style.opacity = "0";
        setTimeout(() => notification.remove(), 500);
      }, 3000);
    } finally {
      setSaving(false);
    }
  };

  // Auto-save effect
  useEffect(() => {
    // Don't auto-save during component initialization
    if (!isInitialized) return;
    
    // Don't auto-save if both title and content are empty for new notes
    if (!isEditingExistingNote && !title.trim() && !content.trim()) return;
    
    if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
    
    autoSaveTimeout.current = setTimeout(async () => {
      try {
        await saveNote();
      } catch (error) {
        console.error('Auto-save error:', error);
      }
    }, 1500); // 1.5s debounce
    
    return () => {
      if (autoSaveTimeout.current) clearTimeout(autoSaveTimeout.current);
    };
  }, [title, content, selectedTags, selectedFolder, selectedNoteType, isInitialized, isEditingExistingNote, currentNoteId]);

  // Keyboard shortcut for save (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        
        // Only allow manual save if component is initialized
        if (!isInitialized) return;
        
        try {
          await saveNote();
        } catch (error) {
          console.error('Manual save error:', error);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [title, content, selectedTags, selectedFolder, selectedNoteType, isInitialized, isEditingExistingNote, currentNoteId]);

  const isImageFile = (file: File) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    return allowedTypes.includes(file.type);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    if (!isImageFile(file)) {
      alert("Apenas arquivos de imagem são permitidos.");
      return;
    }

    // Verificar se o usuário está autenticado
    if (!user) {
      alert(t("editor.loginRequired"));
      return;
    }

    try {
      setImageUploadLoading(true);

      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload para o Storage do Supabase
      const { error } = await supabase.storage
        .from("images")
        .upload(filePath, file);

      if (error) throw error;

      // Obter a URL pública
      const { data: publicUrlData } = supabase.storage
        .from("images")
        .getPublicUrl(filePath);

      // Solução simples: Apenas adicionar a imagem ao final do conteúdo atual
      const imageUrl = publicUrlData.publicUrl;
      const imageMarkdown = `\n\n![${file.name}](${imageUrl})\n`;

      // Adicionar ao conteúdo atual
      setContent((currentContent) => currentContent + imageMarkdown);
    } catch (error) {
      console.error("Erro ao fazer upload da imagem:", error);
      alert(t("editor.imageUploadError"));
    } finally {
      setImageUploadLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // This function safely handles dynamic translation keys
  // const translateTag = (tagKey: string): string => {
  //   // Using string interpolation with type assertion to satisfy TypeScript
  //   return t(`tags.${tagKey}`, { defaultValue: tagKey });
  // };

  // Use the slash commands hook
  const slashCommands = useSlashCommands(insertMarkdown, fileInputRef);

  // Função para calcular a posição do menu
  const calculateMenuPosition = (textarea: HTMLTextAreaElement, cursorPosition: number) => {
    // Obter posição real do cursor usando getBoundingClientRect
    const rect = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    
    // Pegar o texto até o cursor
    const textBeforeCursor = textarea.value.substring(0, cursorPosition);
    const lines = textBeforeCursor.split('\n');
    const currentLineIndex = lines.length - 1;
    const currentLineText = lines[currentLineIndex];
    
    // Encontrar posição da barra / na linha atual
    const slashIndex = currentLineText.lastIndexOf('/');
    const textBeforeSlash = currentLineText.substring(0, slashIndex);
    
    // Criar elemento temporário para medir texto
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.visibility = 'hidden';
    tempDiv.style.whiteSpace = 'pre';
    tempDiv.style.font = style.font;
    tempDiv.style.fontSize = style.fontSize;
    tempDiv.style.fontFamily = style.fontFamily;
    tempDiv.style.lineHeight = style.lineHeight;
    tempDiv.textContent = textBeforeSlash;
    document.body.appendChild(tempDiv);
    
    // Medir largura do texto antes da barra /
    const textWidth = tempDiv.getBoundingClientRect().width;
    document.body.removeChild(tempDiv);
    
    // Calcular posição baseada no padding do textarea
    const paddingLeft = parseInt(style.paddingLeft, 10);
    const paddingTop = parseInt(style.paddingTop, 10);
    const lineHeight = parseInt(style.lineHeight, 10);
    
    // Posição absoluta baseada no textarea - SEMPRE para baixo
    const left = rect.left + paddingLeft + textWidth;
    const top = rect.top + paddingTop + (currentLineIndex * lineHeight) + lineHeight + 8; // +8px para espaçamento
    
    // Verificar limites da viewport
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const menuWidth = 300;
    
    const finalTop = top; // Sempre usar posição para baixo
    let finalLeft = left;
    
    // Ajustar apenas se o menu sair da tela horizontalmente
    if (left + menuWidth > viewportWidth) {
      finalLeft = viewportWidth - menuWidth - 10;
    }
    
    // Garantir que não saia da tela pela esquerda
    if (finalLeft < 10) {
      finalLeft = 10;
    }
    
    return { 
      top: finalTop, 
      left: finalLeft 
    };
  };

  // Função para lidar com a entrada de texto e detectar /
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    setContent(newContent);
    
    // Verificar se o usuário digitou / e não há caracteres antes dele na linha
    const textBeforeCursor = newContent.substring(0, cursorPosition);
    const currentLineStart = textBeforeCursor.lastIndexOf('\n') + 1;
    const currentLineText = textBeforeCursor.substring(currentLineStart);
    
    // Detectar se começou com / e capturar o filtro
    const slashMatch = currentLineText.match(/^\/(.*)$/);
    
    if (slashMatch) {
      const filter = slashMatch[1];
      setSlashMenuFilter(filter);
      setSelectedSlashIndex(0);
      setShowSlashMenu(true);
      
      // Calcular posição do menu
      const position = calculateMenuPosition(e.target, cursorPosition);
      setSlashMenuPosition(position);
    } else {
      setShowSlashMenu(false);
    }
  };

  // Função para aplicar comando do menu slash
  const applySlashCommand = (command: typeof slashCommands[0]) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const cursorPosition = textarea.selectionStart;
    
    // Encontrar o início do comando / na linha atual
    const textBeforeCursor = content.substring(0, cursorPosition);
    const currentLineStart = textBeforeCursor.lastIndexOf('\n') + 1;
    const currentLineText = textBeforeCursor.substring(currentLineStart);
    const slashMatch = currentLineText.match(/^\/(.*)$/);
    
    if (slashMatch) {
      // Posição exata do / e do texto após ele
      const slashPosition = currentLineStart;
      const endPosition = cursorPosition;
      
      // Fechar o menu
      setShowSlashMenu(false);
      
      // Executar a ação do comando
      command.action();
      
      // If the command was not an image, remove the /command and insert markdown
      if (!command.keywords.includes("image")) {
        // Completely remove /command from current position
        const beforeSlash = content.substring(0, slashPosition);
        const afterCommand = content.substring(endPosition);
        
        // Determinar qual markdown inserir baseado nas keywords do comando
        let markdownToInsert = "";
        
        if (command.keywords.includes("bold")) {
          markdownToInsert = `**${t("editor.slashMenu.placeholders.bold")}**`;
        } else if (command.keywords.includes("italic")) {
          markdownToInsert = `*${t("editor.slashMenu.placeholders.italic")}*`;
        } else if (command.keywords.includes("h1")) {
          markdownToInsert = `# ${t("editor.slashMenu.placeholders.heading1")}`;
        } else if (command.keywords.includes("h2")) {
          markdownToInsert = `## ${t("editor.slashMenu.placeholders.heading2")}`;
        } else if (command.keywords.includes("code")) {
          markdownToInsert = `\`${t("editor.slashMenu.placeholders.code")}\``;
        } else if (command.keywords.includes("ordered")) {
          markdownToInsert = t("editor.slashMenu.placeholders.orderedList");
        } else if (command.keywords.includes("unordered")) {
          markdownToInsert = t("editor.slashMenu.placeholders.unorderedList");
        } else if (command.keywords.includes("link")) {
          markdownToInsert = `[${t("editor.slashMenu.placeholders.linkText")}](${t("editor.slashMenu.placeholders.linkUrl")})`;
        }
        
        // Criar o novo conteúdo com o markdown inserido no lugar do comando /
        const newContent = beforeSlash + markdownToInsert + afterCommand;
        setContent(newContent);
        
        // Posicionar cursor após o markdown inserido
        setTimeout(() => {
          textarea.focus();
          const newCursorPos = slashPosition + markdownToInsert.length;
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
      } else {
        // For image command, just remove the /image
        const beforeSlash = content.substring(0, slashPosition);
        const afterCommand = content.substring(endPosition);
        const newContent = beforeSlash + afterCommand;
        setContent(newContent);
        
        // Posicionar cursor onde estava o /
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(slashPosition, slashPosition);
        }, 0);
      }
    }
  };

  // Resetar índice selecionado quando o filtro muda
  useEffect(() => {
    setSelectedSlashIndex(0);
  }, [slashMenuFilter]);

  return (
    <div
      id="Editor"
      className="w-full  h-full flex flex-col bg-[var(--background)] scrollbar"
    >
      <Profile />
      <div className="mx-auto max-w-7xl w-full h-full flex flex-col flex-grow">
        <div className="bg-[var(--background)] overflow-hidden flex flex-col flex-grow h-full  transition-all duration-300">
          {/* Toolbar Section - Moved to top */}
          <div className="bg-[var(--container)] bg-opacity-30   text-sm px-2 sm:px-3 py-2 text-[var(--foreground)] flex justify-between items-center sticky top-0 z-10">
            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              <div className="flex items-center space-x-1 mr-2">
                <button
                  className="p-1.5 rounded-md hover:bg-[var(--accent-color)] hover:text-white transition-colors flex items-center justify-center"
                  onClick={() => insertMarkdown("orderedList")}
                  title={t("editor.orderedList")}
                >
                  <ListOrdered size={18} />
                </button>
                <button
                  className="p-1.5 rounded-md hover:bg-[var(--accent-color)] hover:text-white transition-colors flex items-center justify-center"
                  onClick={() => insertMarkdown("unorderedList")}
                  title={t("editor.unorderedList")}
                >
                  <LayoutList size={18} />
                </button>
                <button
                  className="p-1.5 rounded-md hover:bg-[var(--accent-color)] hover:text-white transition-colors font-bold"
                  onClick={() => insertMarkdown("bold")}
                  title={t("editor.bold")}
                >
                  B
                </button>
                <button
                  className="p-1.5 rounded-md hover:bg-[var(--accent-color)] hover:text-white transition-colors italic"
                  onClick={() => insertMarkdown("italic")}
                  title={t("editor.italic")}
                >
                  I
                </button>
                <button
                  className="p-1.5 rounded-md hover:bg-[var(--accent-color)] hover:text-white transition-colors"
                  onClick={() => insertMarkdown("link")}
                  title={t("editor.link")}
                >
                  🔗
                </button>
              </div>

              <div className="flex items-center space-x-1 mr-2">
                <button
                  className="p-1.5 rounded-md hover:bg-[var(--accent-color)] hover:text-white transition-colors"
                  onClick={() => insertMarkdown("heading1")}
                  title={t("editor.heading1")}
                >
                  H1
                </button>
                <button
                  className="p-1.5 rounded-md hover:bg-[var(--accent-color)] hover:text-white transition-colors"
                  onClick={() => insertMarkdown("heading2")}
                  title={t("editor.heading2")}
                >
                  H2
                </button>
              </div>

              <div className="flex items-center space-x-1 mr-2">
                <button
                  className="p-1.5 rounded-md hover:bg-[var(--accent-color)] hover:text-white transition-colors"
                  onClick={() => insertMarkdown("code")}
                  title={t("editor.code")}
                >
                  &lt;/&gt;
                </button>
                <button
                  className="p-1.5 rounded-md hover:bg-[var(--accent-color)] hover:text-white transition-colors  sm:flex items-center justify-center relative"
                  onClick={() => {
                    if (imageUploadLoading) return;
                    if (fileInputRef.current) {
                      fileInputRef.current.click();
                    } else {
                      insertMarkdown("image");
                    }
                  }}
                  title={t("editor.insertImage")}
                >
                  <Image size={16} />
                  {imageUploadLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--accent-color)] bg-opacity-70 rounded-md">
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  style={{ display: "none" }}
                />
              </div>

              <div className="flex items-center space-x-1 mr-2">
                <button
                  onClick={() =>
                    setShowEmojiPickerContent(!showEmojiPickerContent)
                  }
                  className="p-1.5 rounded-md hover:bg-[var(--accent-color)] hover:text-white transition-colors"
                  title={t("editor.addEmoji")}
                >
                  <SmilePlus size={16} />
                </button>
                {showEmojiPickerContent && (
                  <div className="absolute z-50 mt-36 right-4 shadow-xl rounded-lg overflow-hidden">
                    <EmojiPicker
                      onEmojiClick={handleEmojiSelectContent}
                      skinTonesDisabled
                      width={280}
                      height={350}
                      previewConfig={{ showPreview: false }}
                      theme={Theme.DARK}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className={`rounded-md px-3 py-1.5 transition-all duration-200 flex items-center gap-1.5 ${
                  isPreviewMode
                    ? "bg-transparent text-[var(--foreground)] border border-[var(--border-color)]"
                    : "bg-gradient-to-r from-[var(--button-theme)] to-[var(--theme2)]/40 border border-[var(--border-theme)]/30 text-[var(--text-theme)]"
                }`}
                onClick={() => setIsPreviewMode(false)}
                disabled={!isPreviewMode}
              >
                <Edit size={16} /> {t("editor.edit")}
              </button>
              <button
                className={`rounded-md px-3 py-1.5 transition-all duration-200 flex items-center gap-1.5 ${
                  !isPreviewMode
                    ? "bg-transparent text-[var(--foreground)] border border-[var(--border-color)]"
                    : "bg-gradient-to-r from-[var(--button-theme)] to-[var(--theme2)]/40 border border-[var(--border-theme)]/30 text-[var(--text-theme)]"
                }`}
                onClick={() => setIsPreviewMode(true)}
                disabled={isPreviewMode}
              >
                <Eye size={16} /> {t("editor.preview")}
              </button>
            </div>
          </div>

          {/* Title Section */}
          <div className="p-5 sm:p-6 relative">
            {/* Realtime Connection Indicator */}
            <div className="absolute top-2 right-2 flex items-center gap-3 text-xs">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-[var(--foreground-light)]">
                {isConnected ? t('editor.connected') : t('editor.disconnected')}
              </span>
            </div>

            {/* Botão de salvar manual opcional, pode ser removido se quiser só autosave */}
            {/*
            <div className="flex justify-center mt-2">
              <button
                className={`flex items-center justify-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 w-46 rounded-md text-sm sm:text-base font-medium transition-all duration-300 ${
                  saving
                    ? "bg-[var(--container)] text-[var(--foreground)] opacity-70"
                    : "bg-gradient-to-r from-[var(--button-theme)] to-[var(--theme2)]/40 border border-[var(--border-theme)]/30 text-[var(--text-theme)]"
                }`}
                onClick={saveNote}
                disabled={saving || (!title.trim() && !content.trim())}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[var(--foreground)] border-t-transparent rounded-full animate-spin"></div>
                    <span>{t("editor.saving")}</span>
                  </>
                ) : (
                  <>
                    <span>{t("editor.save")}</span>
                  </>
                )}
              </button>
            </div>
            */}
            {/* Title row with emoji button and title input */}
            <div className="flex items-center gap-3 mb-3 sm:mb-0">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-2 text-[var(--foreground)] hover:bg-[var(--container)] rounded-full transition-all duration-200"
                title={t("editor.addEmoji")}
              >
                <SmilePlus size={22} />
              </button>
              <input
                className="bg-transparent text-[var(--foreground)] focus:outline-none focus:ring-0 border-none w-full text-xl sm:text-2xl font-medium placeholder-opacity-60 placeholder-[var(--foreground)]"
                placeholder={t("editor.titlePlaceholder")}
                maxLength={40}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              {showEmojiPicker && (
                <div className="absolute z-50 top-16 left-4 sm:left-6 shadow-xl rounded-lg overflow-hidden">
                  <EmojiPicker
                    onEmojiClick={handleEmojiSelect}
                    skinTonesDisabled
                    width={300}
                    height={400}
                    previewConfig={{ showPreview: false }}
                    theme={Theme.DARK}
                  />
                </div>
              )}
            </div>

            {/* Dropdowns row - separated for better mobile layout */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-end">
              {/* Folder selection dropdown */}
              <div className="relative" ref={folderDropdownRef}>
                <button
                  onClick={() => {
                    if (selectedNoteType === 'public') return;
                    setShowFolderDropdown(!showFolderDropdown);
                  }}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md bg-[var(--container)] text-sm transition-colors w-full sm:w-auto ${selectedNoteType === 'public' ? 'opacity-60 cursor-not-allowed' : 'hover:bg-opacity-80 text-[var(--foreground)]'}`}
                  title={selectedNoteType === 'public' ? t('editor.folderDisabledPublic') : t("editor.selectFolder")}
                  disabled={selectedNoteType === 'public'}
                >
                  <FolderIcon size={16} />
                  <span className="max-w-[200px] sm:max-w-[100px] truncate">
                    {selectedFolder
                      ? selectedFolder.name
                      : t("editor.noFolder")}
                  </span>
                  <ChevronDown size={14} className="ml-auto" />
                </button>

                {showFolderDropdown && (
                  <div className="absolute left-0 mt-1 w-full sm:w-48 sm:right-0 sm:left-auto rounded-md bg-[var(--container)] shadow-lg z-50">
                    <div className="py-1 max-h-60 overflow-y-auto scrollbar">
                      <button
                        onClick={() => {
                          setSelectedFolder(null);
                          setShowFolderDropdown(false);
                        }}
                        className={`flex items-center w-full text-left px-3 py-2 text-sm ${
                          !selectedFolder
                            ? "bg-[var(--accent-color)] text-white"
                            : "hover:bg-[var(--container)] text-[var(--foreground)]"
                        }`}
                      >
                        {t("editor.noFolder")}
                      </button>

                      {folders.map((folder) => (
                        <button
                          key={folder.id}
                          onClick={() => {
                            setSelectedFolder(folder);
                            setShowFolderDropdown(false);
                          }}
                          className={`flex items-center w-full text-left px-3 py-2 text-sm ${
                            selectedFolder?.id === folder.id
                              ? "bg-[var(--accent-color)] text-white"
                              : "hover:bg-[var(--container)] text-[var(--foreground)]"
                          }`}
                        >
                          {folder.name}
                        </button>
                      ))}

                      <div className="my-1"></div>

                      <button
                        onClick={() => {
                          // createNewFolder();
                          setShowFolderDropdown(false);
                        }}
                        className="flex text-sm text-[var(--accent-color)] hover:bg-[var(--container)]"
                      >
                        {/* + {t("editor.createFolder", { defaultValue: "" })} */}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Note type selection dropdown */}
              <div className="relative" ref={noteTypeDropdownRef}>
                <button
                  onClick={() => setShowNoteTypeDropdown(!showNoteTypeDropdown)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md hover:bg-opacity-80 text-sm transition-colors w-full sm:w-auto relative ${
                    selectedNoteType === 'private' 
                      ? 'bg-gray-500 text-white' 
                      : 'bg-blue-500 text-white'
                  }`}
                  title={t('editor.selectNoteType')}
                >
                  {selectedNoteType === 'private' ? <Lock size={16} /> : <Users size={16} />}
                  <span className="max-w-[200px] sm:max-w-[100px] truncate">
                    {selectedNoteType === 'private' ? t('editor.privateNote') : t('noteTypeSelector.collaborativeNotes')}
                  </span>
                  <ChevronDown size={14} className="ml-auto" />
                  
                  {/* Content indicator */}
                  {hasContent() && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-[var(--background)]" 
                         title={t('editor.hasContent', { defaultValue: 'Esta nota possui conteúdo' })} />
                  )}
                </button>

                {showNoteTypeDropdown && (
                    <div className="absolute left-0 mt-1 w-full sm:w-48 sm:right-0 sm:left-auto rounded-md bg-[var(--container)] shadow-lg z-50">
                      <div className="py-1">
                        {hasContent() && (
                          <div className="px-3 py-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-b border-[var(--border-color)] flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            {t('editor.changingTypeWillSave', { defaultValue: 'Trocar o tipo salvará automaticamente o conteúdo atual' })}
                          </div>
                        )}
                        
                        <button
                          onClick={() => handleNoteTypeChange('private')}
                          className={`flex items-center gap-3 w-full text-left px-3 py-2 text-sm ${
                            selectedNoteType === 'private'
                              ? "bg-[var(--accent-color)] text-white"
                              : "hover:bg-[var(--container)] text-[var(--foreground)]"
                          }`}
                        >
                          <div>
                            <div className="font-medium">{t('editor.privateNote')}</div>
                            <div className="text-xs opacity-70">{t('editor.onlyYouCanSee')}</div>
                          </div>
                        </button>

                        <button
                          onClick={() => handleNoteTypeChange('public')}
                          className={`flex items-center gap-3 w-full text-left px-3 py-2 text-sm ${
                            selectedNoteType === 'public'
                              ? "bg-[var(--accent-color)] text-white"
                              : "hover:bg-[var(--container)] text-[var(--foreground)]"
                          }`}
                        >
                          <div>
                            <div className="font-medium">{t('editor.publicNote')}</div>
                            <div className="text-xs opacity-70">{t('editor.realtimeCollaboration')}</div>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className=" scrollbar bg-[var(--background)] relative flex-grow">
            {!isPreviewMode ? (
              <div className="h-full relative">
                {" "}
                <textarea
                  ref={textareaRef}
                  className="p-5 sm:p-6 w-full bg-transparent text-[var(--foreground)] resize-none focus:outline-none min-h-[270px] sm:min-h-[370px] h-full text-base sm:text-lg overflow-auto transition-all duration-300"
                  placeholder={t("editor.contentPlaceholder")}
                  maxLength={15000}
                  value={content}
                  onChange={handleTextareaChange}
                  style={{ fontSize: "18px", lineHeight: "1.7" }}
                  onDragOver={(e) => e.preventDefault()}
                />
                
                {/* Menu de comandos com / */}
                <SlashCommandMenu
                  isVisible={showSlashMenu}
                  position={slashMenuPosition}
                  filter={slashMenuFilter}
                  selectedIndex={selectedSlashIndex}
                  commands={slashCommands}
                  onSelectCommand={applySlashCommand}
                  onSelectIndex={setSelectedSlashIndex}
                  onClose={() => setShowSlashMenu(false)}
                />
                {/* <div className="absolute bottom-4 right-4">
                  <ClientLayout />
                </div> */}
              </div>
            ) : (
              <div className="markdown-content p-5 sm:p-6 w-full bg-transparent text-[var(--foreground)] min-h-[370px] h-full text-base sm:text-lg overflow-auto">
                {content ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content}
                  </ReactMarkdown>
                ) : (
                  <p className="text-[var(--foreground)] opacity-60 italic">
                    {t("editor.noPreviewContent")}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Note Type Change Confirmation Dialog */}
        {showNoteTypeChangeDialog && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                cancelNoteTypeChange();
              }
            }}
          >
            <div className="bg-[var(--background)] rounded-lg shadow-xl max-w-md w-full border border-[var(--border-color)]">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">
                  {t('editor.changeNoteType', { defaultValue: 'Trocar Tipo de Nota?' })}
                </h3>
                
                <div className="mb-6">
                  <p className="text-[var(--foreground)] opacity-80 mb-3">
                    {isEditingExistingNote 
                      ? t('editor.saveCurrentNoteFirst', { defaultValue: 'O conteúdo da sua nota atual será salvo automaticamente e você continuará editando ela com o novo tipo:' })
                      : t('editor.startNewNoteAs', { defaultValue: 'O que você já escreveu será salvo como uma nova nota do tipo atual. A partir daqui, você continuará escrevendo com o novo tipo:' })
                    }
                  </p>
                  
                  <div className={`flex items-center gap-3 px-3 py-2 rounded-md ${
                    pendingNoteType === 'private' 
                      ? 'bg-[var(--foreground)] text-[var(--background)]' 
                      : 'bg-[var(--foreground)] text-[var(--background)]'
                  }`}>
                    <div className={`w-3 h-3 rounded-full ${
                      pendingNoteType === 'private' ? 'bg-gray-500' : 'bg-blue-500'
                    }`}></div>
                    <span className="font-medium">
                      {pendingNoteType === 'private' ? t('editor.privateNote') : t('editor.publicNote')}
                    </span>
                  </div>

                  <div className="mt-4 p-3 bg-[var(--foreground)]  rounded-md  ">
                    <div className="flex items-start gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p className="text-sm text-[var(--background)] ">
                        {pendingNoteType === 'public' 
                          ? t('editor.noteTypeSwitchExplanation', { defaultValue: 'Seu conteúdo atual será salvo como nota privada e o novo conteúdo será colaborativo, podendo ser compartilhado.' })
                          : 'Seu conteúdo será mantido como privado, visível apenas para você.'
                        }
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={cancelNoteTypeChange}
                    className="flex-1 px-4 py-2 text-[var(--foreground)] bg-[var(--container)] hover:bg-opacity-80 rounded-md transition-colors"
                  >
                    {t('editor.cancel')}
                  </button>
                  <button
                    onClick={confirmNoteTypeChange}
                    className="flex-1 px-4 py-2 bg-[var(--foreground)] text-[var(--background)]  hover:bg-opacity-90 rounded-md transition-colors"
                  >
                    {t('editor.continue', { defaultValue: 'Confirmar Troca' })}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Editor;
