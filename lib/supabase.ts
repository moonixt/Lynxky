import { createClient } from "@supabase/supabase-js";

// Certifique-se de que as variáveis de ambiente estão definidas corretamente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Verificação para navegador
if (typeof window !== "undefined" && (!supabaseUrl || !supabaseAnonKey)) {
  console.error(
    "Supabase URL ou chave anônima não definidas. Verifique suas variáveis de ambiente.",
  );
}

// Cliente para operações do usuário (browser)
export const supabase = createClient(
  supabaseUrl || "https://placeholder-url.supabase.co", // Nunca será uma string vazia
  supabaseAnonKey || "placeholder-key-for-type-checking", // Nunca será uma string vazia
  {
    auth: {
      persistSession: true,
      storageKey: "sb-auth-token",
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storage: {
        getItem: (key) => {
          if (typeof window === "undefined") return null;

          // Tentar obter do localStorage primeiro
          const value = window.localStorage.getItem(key);
          if (value) return value;

          // Fallback para cookie se não estiver no localStorage
          const cookie = document.cookie
            .split("; ")
            .find((row) => row.startsWith(`${key}=`));

          return cookie ? decodeURIComponent(cookie.split("=")[1]) : null;
        },
        setItem: (key, value) => {
          if (typeof window === "undefined") return;

          // Armazenar no localStorage
          window.localStorage.setItem(key, value);

          // E também em um cookie com expiração mais longa
          const maxAge = 365 * 24 * 60 * 60; // 1 ano em segundos
          const isSecure = window.location.protocol === 'https:';
          document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${isSecure ? '; Secure' : ''}`;
        },
        removeItem: (key) => {
          if (typeof window === "undefined") return;

          // Remover do localStorage
          window.localStorage.removeItem(key);

          // E também do cookie
          document.cookie = `${key}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        },
      },
    },
  },
);

// Cliente para operações de servidor (APIs, webhooks) - com permissões completas
export const supabaseAdmin = createClient(
  supabaseUrl || "https://placeholder-url.supabase.co",
  supabaseServiceKey || "placeholder-key-for-type-checking",
  {
    auth: {
      persistSession: false, // Não precisamos persistir sessão para operações de servidor
    },
  },
);
