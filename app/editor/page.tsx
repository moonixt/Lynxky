"use client";
import { Analytics } from "@vercel/analytics/next";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Editor from "../components/editor";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { ArrowLeft, Lock, Users } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "next-i18next";
import { useEffect } from "react";

function EditorContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const noteType = searchParams?.get('type') === 'public' ? 'public' : 'private';

 // Auto-scroll to middle of page on load
  useEffect(() => {
    const scrollToMiddle = () => {
      const viewportHeight = window.innerHeight;
      const scrollTarget = viewportHeight * 0.45; // Scroll to 45% of viewport height
      
      // Try multiple times to ensure it works
      setTimeout(() => {
        window.scrollTo({
          top: scrollTarget,
          behavior: 'smooth'
        });
      }, 100);
      
      setTimeout(() => {
        window.scrollTo({
          top: scrollTarget,
          behavior: 'smooth'
        });
      }, 500);
      
      setTimeout(() => {
        window.scrollTo({
          top: scrollTarget,
          behavior: 'smooth'
        });
      }, 1000);
    };

    // Execute scroll on component mount
    scrollToMiddle();
  }, []); // Empty dependency array - only run once on mount

  return (
    <>
      <ProtectedRoute allowReadOnly={false}>
        <div className="h-screen bg-[var(--background)] overflow-y-auto scrollbar flex flex-col">
          <div className="sticky top-0 bg-[var(--background)]/60 bg-opacity-90 backdrop-blur-sm z-10 py-3 px-4 flex items-center">
            <Link
              href="/dashboard"
              className="p-2 rounded-full hover:bg-[var(--container)] transition-colors mr-2"
              title={t("editor.backToDashboard")}
            >
              <ArrowLeft size={20} className="text-[var(--foreground)]" />
            </Link>
            
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-[var(--foreground)]">
                {noteType === 'public' ? 'New Public Note' : t("editor.newNote")}
              </h1>
              
              {/* Note type indicator */}
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                noteType === 'public' 
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}>
                {noteType === 'public' ? <Users size={12} /> : <Lock size={12} />}
                <span>{noteType === 'public' ? 'Collaborative' : 'Private'}</span>
              </div>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto scrollbar">
            <Editor />
          </div>
        </div>
      </ProtectedRoute>
      <Analytics />
    </>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={
      <div className="h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-[var(--foreground)] text-lg">Loading editor...</div>
      </div>
    }>
      <EditorContent />
    </Suspense>
  );
}
