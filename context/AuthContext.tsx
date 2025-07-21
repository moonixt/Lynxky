"use client";

import { createContext, useContext, useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { Session, User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

export type SignUpResult = {
  success: boolean;
  needsEmailConfirmation: boolean;
  user?: User;
};

type AuthContextType = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    let refreshTimer: NodeJS.Timeout | null = null;
    let heartbeatInterval: NodeJS.Timeout | null = null;

    // Função para configurar refresh automático
    const setupTokenRefresh = (session: Session | null) => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }

      if (!session?.expires_at) return;

      // Refresh token 10 minutos antes de expirar (mais seguro)
      const expiresAt = session.expires_at * 1000; // Converter para milliseconds
      const refreshTime = expiresAt - Date.now() - (10 * 60 * 1000); // 10 minutos antes
      
      if (refreshTime > 0) {
        refreshTimer = setTimeout(async () => {
          try {
            console.log("Refreshing session automatically...");
            const { data, error } = await supabase.auth.refreshSession();
            
            if (error) {
              console.error("Error refreshing session:", error);
              // Tentar novamente em 1 minuto se falhar
              setTimeout(() => setupTokenRefresh(session), 60 * 1000);
            } else {
              console.log("Session refreshed successfully");
            }
          } catch (error) {
            console.error("Failed to refresh session:", error);
            // Tentar novamente em 1 minuto se falhar
            setTimeout(() => setupTokenRefresh(session), 60 * 1000);
          }
        }, refreshTime);
      }
    };

    // Função para enviar heartbeat e manter sessão ativa
    const setupHeartbeat = () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }

      heartbeatInterval = setInterval(async () => {
        if (!mounted) return;

        try {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            // Atualizar último heartbeat
            if (typeof window !== "undefined") {
              localStorage.setItem("lastHeartbeat", Date.now().toString());
            }
          }
        } catch (error) {
          console.error("Heartbeat failed:", error);
        }
      }, 5 * 60 * 1000); // A cada 5 minutos
    };

    // Configurar o supabase para usar persistência baseada em cookies
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;

      console.log("Auth state changed:", event);
      console.log("New session:", !!newSession);

      setSession(newSession);
      setUser(newSession?.user ?? null);
      setIsLoading(false);

      // Configurar refresh automático para a nova sessão
      setupTokenRefresh(newSession);

      if (event === "SIGNED_IN") {
        console.log("Usuário conectado");
        // Configurar heartbeat
        setupHeartbeat();
        // Salvar timestamp do último login
        if (typeof window !== "undefined") {
          localStorage.setItem("lastLoginTime", Date.now().toString());
          localStorage.setItem("lastHeartbeat", Date.now().toString());
        }
      } else if (event === "SIGNED_OUT") {
        console.log("Usuário desconectado, redirecionando para login");
        // Limpar dados de sessão
        if (typeof window !== "undefined") {
          localStorage.removeItem("lastLoginTime");
          localStorage.removeItem("lastHeartbeat");
          localStorage.removeItem("userEmail");
          localStorage.removeItem("sessionExpiry");
        }
        // Limpar intervals
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        router.push("/login");
      } else if (event === "TOKEN_REFRESHED") {
        console.log("Token refreshed successfully");
        // Atualizar heartbeat
        if (typeof window !== "undefined") {
          localStorage.setItem("lastHeartbeat", Date.now().toString());
        }
      }
    });

    // Verificar sessão inicial
    const checkSession = async () => {
      if (!mounted) return;

      try {
        // Primeiro, verificar se há dados de sessão no localStorage
        if (typeof window !== "undefined") {
          const lastHeartbeat = localStorage.getItem("lastHeartbeat");
          const lastLogin = localStorage.getItem("lastLoginTime");
          
          // Se não há heartbeat recente (mais de 30 minutos), limpar dados
          if (lastHeartbeat) {
            const timeSinceHeartbeat = Date.now() - parseInt(lastHeartbeat);
            if (timeSinceHeartbeat > 30 * 60 * 1000) { // 30 minutos
              console.log("No recent heartbeat, clearing session data");
              localStorage.removeItem("lastLoginTime");
              localStorage.removeItem("lastHeartbeat");
              localStorage.removeItem("userEmail");
              localStorage.removeItem("sessionExpiry");
            }
          }
        }

        const { data, error } = await supabase.auth.getSession();
        console.log("Verificação inicial de sessão:", !!data.session);

        if (error) {
          console.error("Erro ao verificar sessão:", error);
          throw error;
        }

        if (data.session && mounted) {
          setSession(data.session);
          setUser(data.session.user);
          setupTokenRefresh(data.session);
          setupHeartbeat();

          // Verificar se a sessão ainda é válida
          const now = Date.now();
          const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : 0;
          
          if (expiresAt > 0 && now >= expiresAt) {
            console.log("Session expired, attempting refresh...");
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            
            if (refreshError) {
              console.error("Failed to refresh expired session:", refreshError);
              await supabase.auth.signOut();
            }
          }
        }
      } catch (error) {
        console.error("Falha ao verificar sessão:", error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    checkSession();

    // Verificar periodicamente se a sessão ainda é válida (a cada 15 minutos)
    const sessionCheckInterval = setInterval(async () => {
      if (!mounted) return;

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const now = Date.now();
        const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : 0;
        
        // Se a sessão vai expirar em menos de 15 minutos, tentar refresh
        if (expiresAt > 0 && (expiresAt - now) < (15 * 60 * 1000)) {
          console.log("Session expiring soon, attempting refresh...");
          try {
            const { error } = await supabase.auth.refreshSession();
            if (error) {
              console.error("Failed to refresh session:", error);
            } else {
              console.log("Session refreshed proactively");
            }
          } catch (error) {
            console.error("Error during proactive refresh:", error);
          }
        }
      }
    }, 15 * 60 * 1000); // 15 minutos

    // Listener para reconectar quando a janela voltar ao foco
    const handleFocus = async () => {
      if (!mounted) return;
      
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          // Verificar se precisa atualizar a sessão
          const now = Date.now();
          const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : 0;
          
          if (expiresAt > 0 && (expiresAt - now) < (20 * 60 * 1000)) { // Se expira em menos de 20 min
            console.log("Window focused, checking session...");
            await supabase.auth.refreshSession();
          }
        }
      } catch (error) {
        console.error("Error during focus refresh:", error);
      }
    };

    // Listener para quando a conexão volta
    const handleOnline = async () => {
      if (!mounted) return;
      
      console.log("Connection restored, checking session...");
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await supabase.auth.refreshSession();
        }
      } catch (error) {
        console.error("Error during online refresh:", error);
      }
    };

    // Adicionar listeners
    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleFocus);
      window.addEventListener("online", handleOnline);
    }

    // Cleanup
    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      clearInterval(sessionCheckInterval);
      
      // Remover listeners
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleFocus);
        window.removeEventListener("online", handleOnline);
      }
    };
  }, [router]);

  const signIn = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      
      // Primeiro, limpar qualquer sessão existente
      await supabase.auth.signOut();
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Verificação manual da sessão após login
      const sessionCheck = await supabase.auth.getSession();
      console.log("Sessão após login:", !!sessionCheck.data.session);

      // Salvar informações adicionais no localStorage para persistência
      if (typeof window !== "undefined" && sessionCheck.data.session) {
        localStorage.setItem("userEmail", email);
        localStorage.setItem("lastLoginTime", Date.now().toString());
        localStorage.setItem("lastHeartbeat", Date.now().toString());
        localStorage.setItem("sessionExpiry", (sessionCheck.data.session.expires_at! * 1000).toString());
        
        // Salvar um flag de login bem-sucedido
        localStorage.setItem("loginSuccess", "true");
      }

      return data;
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      // Limpar dados em caso de erro
      if (typeof window !== "undefined") {
        localStorage.removeItem("userEmail");
        localStorage.removeItem("lastLoginTime");
        localStorage.removeItem("lastHeartbeat");
        localStorage.removeItem("sessionExpiry");
        localStorage.removeItem("loginSuccess");
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
  ): Promise<SignUpResult> => {
    try {
      console.log("Tentando criar conta com:", email);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Para garantir que a sessão seja persistida
          emailRedirectTo: window.location.origin,
          data: {
            // Dados customizados, se necessário
          },
        },
      });

      if (error) {
        console.error("Erro ao criar conta:", error);
        throw error;
      }

      console.log("Conta criada:", !!data.user);

      // Sempre requer confirmação de email
      return {
        success: true,
        needsEmailConfirmation: true,
        user: data.user || undefined,
      };
    } catch (error) {
      console.error("Erro ao criar conta:", error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      console.log("Tentando logout");
      
      // Limpar dados locais antes do logout
      if (typeof window !== "undefined") {
        localStorage.removeItem("lastLoginTime");
        localStorage.removeItem("lastHeartbeat");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("sessionExpiry");
        localStorage.removeItem("loginSuccess");
      }

      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Erro ao fazer logout:", error);
        throw error;
      }

      console.log("Logout bem sucedido");
      // O redirecionamento já será tratado pelo onAuthStateChange
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
      throw error;
    }
  };

  // Memoizar o valor do contexto para evitar re-renderizações desnecessárias
  const contextValue = useMemo(
    () => ({
      user,
      session,
      isLoading,
      signIn,
      signUp,
      signOut,
    }),
    [user, session, isLoading],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}
