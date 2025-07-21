"use client";

import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { decrypt } from '../app/components/Encryption';

export interface RealtimeCallbacks {
  onNotesChange?: (payload: any) => void;
  onFoldersChange?: (payload: any) => void;
  onTasksChange?: (payload: any) => void;
  onCalendarEventsChange?: (payload: any) => void;
  onNoteSharedChange?: (payload: any) => void;
  onCollaborationChange?: (payload: any) => void;
}

export interface CollaboratorPresence {
  user_id: string;
  online_at: string;
  full_name?: string;
  email?: string;
  avatar_url?: string;
  bio?: string;
  initials?: string;
  permission?: 'owner' | 'admin' | 'write' | 'read';
  cursor_position?: number;
  selection_start?: number;
  selection_end?: number;
  isOnline?: boolean;
  [key: string]: any;
}

export interface ConnectionStatus {
  isConnected: boolean;
  channelCount: number;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
}

export interface CollaborationInvite {
  id: string;
  note_id: string;
  inviter_id: string;
  invitee_email: string;
  invitee_id?: string;
  permission: 'read' | 'write' | 'admin';
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  invite_token: string;
  expires_at: string;
  created_at: string;
}

// Interfaces adicionais para notas públicas
export interface PublicNoteCallbacks {
  onPublicNotesChange?: (payload: any) => void;
  onCollaborationChange?: (payload: any) => void;
  onPresenceChange?: (payload: any) => void;
}

export interface NoteType {
  type: 'private' | 'public';
  id: string;
  title: string;
  content?: string;
  owner_id?: string;
  user_id?: string;
  is_collaborative?: boolean;
  created_at: string;
  updated_at: string;
  allow_anonymous_view?: boolean;
  allow_anonymous_edit?: boolean;
}

class RealtimeManager {
  private channels: Map<string, RealtimeChannel> = new Map();
  private isDebugMode = process.env.NODE_ENV === 'development';
  private connectionStatus: ConnectionStatus = {
    isConnected: false,
    channelCount: 0,
    status: 'disconnected'
  };

  private log(message: string, data?: any) {
    if (this.isDebugMode) {
      console.log(`[RealtimeManager] ${message}`, data || '');
    }
  }

  private updateConnectionStatus() {
    const connectedChannels = Array.from(this.channels.values()).filter(
      channel => channel.state === 'joined'
    );
    
    this.connectionStatus = {
      isConnected: connectedChannels.length > 0,
      channelCount: this.channels.size,
      status: connectedChannels.length > 0 ? 'connected' : 
              this.channels.size > 0 ? 'connecting' : 'disconnected'
    };
  }

  getConnectionStatus(): ConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Inscreve-se em mudanças de dados do usuário em tempo real
   */
  subscribeToUserData(userId: string, callbacks: RealtimeCallbacks) {
    const channelName = `user-data-${userId}`;
    
    // Se já existe um canal para este usuário, desinscrever primeiro
    if (this.channels.has(channelName)) {
      this.unsubscribe(channelName);
    }

    this.log(`Subscribing to user data for user: ${userId}`);

    const channel = supabase
      .channel(channelName)
      // Notas
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'notes', 
          filter: `user_id=eq.${userId}` 
        },
        (payload) => {
          this.log('Notes changed:', payload);
          callbacks.onNotesChange?.(payload);
        }
      )
      // Pastas
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'folders', 
          filter: `user_id=eq.${userId}` 
        },
        (payload) => {
          this.log('Folders changed:', payload);
          callbacks.onFoldersChange?.(payload);
        }
      )
      // Tarefas
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'tasks', 
          filter: `user_id=eq.${userId}` 
        },
        (payload) => {
          this.log('Tasks changed:', payload);
          callbacks.onTasksChange?.(payload);
        }
      )
      // Eventos do calendário
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'calendar_events', 
          filter: `user_id=eq.${userId}` 
        },
        (payload) => {
          this.log('Calendar events changed:', payload);
          callbacks.onCalendarEventsChange?.(payload);
        }
      )
      .subscribe((status) => {
        this.log(`Subscription status for ${channelName}:`, status);
        this.updateConnectionStatus();
        
        if (status === 'CHANNEL_ERROR') {
          console.error(`Channel error for ${channelName}`);
          // Retry connection after a delay
          setTimeout(() => {
            this.subscribeToUserData(userId, callbacks);
          }, 5000);
        }
      });

    this.channels.set(channelName, channel);
    return channel;
  }

  /**
   * Inscreve-se em mudanças de compartilhamento de notas
   */
  subscribeToSharedNotes(userId: string, callbacks: RealtimeCallbacks) {
    const channelName = `shared-notes-${userId}`;
    
    if (this.channels.has(channelName)) {
      this.unsubscribe(channelName);
    }

    this.log(`Subscribing to shared notes for user: ${userId}`);

    const channel = supabase
      .channel(channelName)
      // Compartilhamentos onde o usuário é owner ou shared_with
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'note_shares', 
          filter: `owner_id=eq.${userId}` 
        },
        (payload) => {
          this.log('Note shares (owner) changed:', payload);
          callbacks.onNoteSharedChange?.(payload);
        }
      )
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'note_shares', 
          filter: `shared_with_id=eq.${userId}` 
        },
        (payload) => {
          this.log('Note shares (shared with) changed:', payload);
          callbacks.onNoteSharedChange?.(payload);
        }
      )
      // Links públicos
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'public_note_links', 
          filter: `owner_id=eq.${userId}` 
        },
        (payload) => {
          this.log('Public note links changed:', payload);
          callbacks.onNoteSharedChange?.(payload);
        }
      )
      .subscribe((status) => {
        this.log(`Subscription status for ${channelName}:`, status);
        this.updateConnectionStatus();
        
        if (status === 'CHANNEL_ERROR') {
          console.error(`Shared notes channel error for ${channelName}`);
          setTimeout(() => {
            this.subscribeToSharedNotes(userId, callbacks);
          }, 5000);
        }
      });

    this.channels.set(channelName, channel);
    return channel;
  }

  /**
   * Inscreve-se em colaboração em tempo real em uma nota específica
   */
  subscribeToNoteCollaboration(noteId: string, userId: string, callbacks: RealtimeCallbacks) {
    const channelName = `note-collaboration-${noteId}`;
    
    if (this.channels.has(channelName)) {
      this.unsubscribe(channelName);
    }

    this.log(`Subscribing to collaboration for note: ${noteId}`);

    const channel = supabase
      .channel(channelName)
      // Atividade na nota
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'note_activity', 
          filter: `note_id=eq.${noteId}` 
        },
        (payload) => {
          // Não notificar sobre suas próprias ações
          if ((payload.new as any)?.user_id !== userId) {
            this.log('Note activity changed:', payload);
            callbacks.onCollaborationChange?.(payload);
          }
        }
      )
      // Presença - usuários online na nota
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        this.log('Presence sync:', state);
        callbacks.onCollaborationChange?.({ type: 'presence', state });
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        this.log('User joined:', { key, newPresences });
        callbacks.onCollaborationChange?.({ type: 'user_joined', key, newPresences });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        this.log('User left:', { key, leftPresences });
        callbacks.onCollaborationChange?.({ type: 'user_left', key, leftPresences });
      })
      .subscribe(async (status) => {
        this.log(`Subscription status for ${channelName}:`, status);
        
        if (status === 'SUBSCRIBED') {
          // Indicar presença na nota
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        }
      });

    this.channels.set(channelName, channel);
    return channel;
  }

  /**
   * Envia uma atividade de colaboração para outros usuários
   * TEMPORARILY DISABLED - Activities disabled to prevent errors
   */
  async sendCollaborationActivity(noteId: string, userId: string, activityType: string, data?: any, isPublicNote = false) {
    // DISABLED: Collaboration activities temporarily disabled to prevent errors
    console.log('[DEBUG] Collaboration activity disabled:', { noteId, userId, activityType, data, isPublicNote });
    return; // Early return - no database insertion
  }

  /**
   * Atualiza a presença do usuário em uma nota
   */
  async updateUserPresence(noteId: string, userId: string, presence: Partial<CollaboratorPresence>, isPublicNote = false) {
    try {
      console.log('[DEBUG] Updating user presence:', { noteId, userId, isPublicNote, presence });
      
      const presenceData: any = {
        user_id: userId,
        is_online: true,
        cursor_position: presence.cursor_position || null,
        selection_start: presence.selection_start || null,
        selection_end: presence.selection_end || null,
        last_activity: new Date().toISOString(),
      };

      // Set the correct note reference based on note type
      if (isPublicNote) {
        presenceData.public_note_id = noteId;
        presenceData.note_id = null;
      } else {
        presenceData.note_id = noteId;
        presenceData.public_note_id = null;
      }

      console.log('[DEBUG] Presence data to upsert:', presenceData);

      // Use manual upsert logic since we have conditional unique constraints
      let result;
      if (isPublicNote) {
        // Try to update first
        const { data: updateData, error: updateError } = await supabase
          .from('user_presence')
          .update(presenceData)
          .eq('user_id', userId)
          .eq('public_note_id', noteId)
          .select();

        if (updateError || !updateData || updateData.length === 0) {
          // If update failed or no rows affected, try insert
          const { data: insertData, error: insertError } = await supabase
            .from('user_presence')
            .insert(presenceData)
            .select();
          
          result = { data: insertData, error: insertError };
        } else {
          result = { data: updateData, error: updateError };
        }
      } else {
        // For private notes
        const { data: updateData, error: updateError } = await supabase
          .from('user_presence')
          .update(presenceData)
          .eq('user_id', userId)
          .eq('note_id', noteId)
          .select();

        if (updateError || !updateData || updateData.length === 0) {
          // If update failed or no rows affected, try insert
          const { data: insertData, error: insertError } = await supabase
            .from('user_presence')
            .insert(presenceData)
            .select();
          
          result = { data: insertData, error: insertError };
        } else {
          result = { data: updateData, error: updateError };
        }
      }

      if (result.error) {
        console.error('[ERROR] Error updating user presence:', result.error);
        return { success: false, error: result.error.message };
      }

      console.log('[DEBUG] Successfully updated user presence:', result.data);
      return { success: true, data: result.data };
    } catch (error) {
      console.error('[ERROR] Exception updating user presence:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Convida um usuário para colaborar em uma nota
   */
  async inviteUserToNote(noteId: string, inviteeEmail: string, permission: 'read' | 'write' | 'admin' = 'read') {
    try {
      const { data, error } = await supabase
        .from('collaboration_invites')
        .insert({
          note_id: noteId,
          inviter_id: (await supabase.auth.getUser()).data.user?.id,
          invitee_email: inviteeEmail,
          permission: permission,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      this.log(`Sent collaboration invite to ${inviteeEmail}`, data);
      return data;
    } catch (error) {
      console.error('Error sending collaboration invite:', error);
      throw error;
    }
  }

  /**
   * Aceita um convite de colaboração
   */
  async acceptCollaborationInvite(inviteToken: string) {
    try {
      const { data, error } = await supabase.rpc('accept_collaboration_invite', {
        invite_token_param: inviteToken
      });

      if (error) {
        throw error;
      }

      this.log('Accepted collaboration invite:', data);
      return data;
    } catch (error) {
      console.error('Error accepting collaboration invite:', error);
      throw error;
    }
  }

  /**
   * Busca colaboradores de uma nota com informações de perfil
   */
  async getNoteCollaborators(noteId: string): Promise<CollaboratorPresence[]> {
    try {
      console.log('[DEBUG] getNoteCollaborators called for noteId:', noteId);
      
      // Simplified approach - assume it's a public note and get collaborators directly
      const collaborators: CollaboratorPresence[] = [];

      // First, get the note owner
      console.log('[DEBUG] Fetching public note data...');
      const { data: publicNoteData, error: noteError } = await supabase
        .from('public_notes')
        .select('owner_id')
        .eq('id', noteId)
        .single();

      console.log('[DEBUG] Public note query result:', { data: publicNoteData, error: noteError });

      if (noteError) {
        console.error('[DEBUG] Error fetching public note:', noteError);
        return [];
      }

      if (publicNoteData?.owner_id) {
        // Get owner profile
        console.log('[DEBUG] Fetching owner profile for ID:', publicNoteData.owner_id);
        const { data: ownerProfile, error: ownerError } = await supabase
          .from('profiles')
          .select('id, email, full_name, avatar_url, bio')
          .eq('id', publicNoteData.owner_id)
          .single();

        console.log('[DEBUG] Owner profile query result:', { data: ownerProfile, error: ownerError });

        if (ownerProfile) {
          collaborators.push({
            user_id: ownerProfile.id,
            email: ownerProfile.email,
            full_name: ownerProfile.full_name,
            avatar_url: ownerProfile.avatar_url,
            bio: ownerProfile.bio,
            initials: this.getInitials(ownerProfile.full_name, ownerProfile.email),
            permission: 'owner',
            online_at: new Date().toISOString(),
            isOnline: false, // Simplified - not checking online status for now
            cursor_position: undefined,
            selection_start: undefined,
            selection_end: undefined,
          });
        }
      }

      // Get all shared collaborators for this public note
      console.log('[DEBUG] Fetching note shares...');
      const { data: shares, error } = await supabase
        .from('note_shares')
        .select('shared_with_id, permission')
        .eq('public_note_id', noteId);

      console.log('[DEBUG] Note shares query result:', { sharesCount: shares?.length || 0, shares, error });

      if (error) {
        console.error('[DEBUG] Error fetching shares:', error);
        console.log('[DEBUG] Returning collaborators (owner only):', collaborators.length);
        return collaborators; // Return at least the owner
      } else if (shares && shares.length > 0) {
        // Get profiles for all shared users
        const userIds = shares.map(share => share.shared_with_id);
        console.log('[DEBUG] Fetching profiles for user IDs:', userIds);
        
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email, full_name, avatar_url, bio')
          .in('id', userIds);

        console.log('[DEBUG] Shared user profiles query result:', { profilesCount: profiles?.length || 0, profiles, error: profilesError });

        if (profiles) {
          shares.forEach(share => {
            const profile = profiles.find(p => p.id === share.shared_with_id);
            if (profile) {
              console.log('[DEBUG] Adding collaborator:', { id: profile.id, name: profile.full_name, permission: share.permission });
              collaborators.push({
                user_id: profile.id,
                email: profile.email,
                full_name: profile.full_name,
                avatar_url: profile.avatar_url,
                bio: profile.bio,
                initials: this.getInitials(profile.full_name, profile.email),
                permission: share.permission,
                online_at: new Date().toISOString(),
                isOnline: false, // Simplified - not checking online status for now
                cursor_position: undefined,
                selection_start: undefined,
                selection_end: undefined,
              });
            } else {
              console.warn('[DEBUG] Profile not found for user ID:', share.shared_with_id);
            }
          });
        }
      } else {
        console.log('[DEBUG] No shares found for this note');
      }

      console.log('[DEBUG] Final collaborators list:', collaborators.length, collaborators.map(c => ({ 
        id: c.user_id, 
        name: c.full_name, 
        email: c.email,
        permission: c.permission 
      })));
      
      return collaborators;
    } catch (error) {
      console.error('Error fetching note collaborators:', error);
      return [];
    }
  }

  /**
   * Busca todos os colaboradores de uma nota pública, incluindo o dono e todos que aceitaram convite,
   * mesmo que não tenham profile preenchido.
   * Retorna: [{ user_id, full_name, email, isOwner }]
   */
  async getAllNoteCollaborators(noteId: string): Promise<Array<{ user_id: string, full_name?: string, email?: string, isOwner: boolean }>> {
    // 1. Buscar o dono da nota
    const { data: note, error: noteError } = await supabase
      .from('public_notes')
      .select('owner_id')
      .eq('id', noteId)
      .single();
    if (noteError || !note) return [];
    const ownerId = note.owner_id;

    // 2. Buscar todos os colaboradores (note_shares)
    const { data: shares, error: sharesError } = await supabase
      .from('note_shares')
      .select('shared_with_id')
      .eq('public_note_id', noteId);
    if (sharesError) return [{ user_id: ownerId, isOwner: true }];

    // 3. Montar lista de IDs únicos (dono + colaboradores)
    const collaboratorIds = [ownerId, ...shares.map(s => s.shared_with_id)]
      .filter((v, i, arr) => arr.indexOf(v) === i);

    // 4. Buscar profiles para quem tiver
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, bio')
      .in('id', collaboratorIds);
    // Mapear profiles por id
    const profileMap = (profiles || []).reduce((acc, p) => { acc[p.id] = p; return acc; }, {} as any);

    // 5. Montar lista final
    return collaboratorIds.map(uid => ({
      user_id: uid,
      full_name: profileMap[uid]?.full_name,
      email: profileMap[uid]?.email,
      isOwner: uid === ownerId
    }));
  }

  /**
   * Registra uma atividade na nota
   */
  private async logNoteActivity(
    noteId: string, 
    userId: string, 
    activityType: string, 
    metadata?: any
  ): Promise<void> {
    try {
      await supabase
        .from('note_activity')
        .insert({
          note_id: noteId,
          user_id: userId,
          activity_type: activityType,
          metadata: metadata || {},
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error logging note activity:', error);
    }
  }

  /**
   * Atualiza a permissão de um colaborador
   */
  async updateCollaboratorPermission(
    noteId: string, 
    collaboratorId: string, 
    newPermission: 'read' | 'write' | 'admin'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // First check if this is a public note
      const { data: publicNote } = await supabase
        .from('public_notes')
        .select('id')
        .eq('id', noteId)
        .single();

      if (publicNote) {
        // For public notes, use public_note_id
        const { error } = await supabase
          .from('note_shares')
          .update({ 
            permission: newPermission,
            updated_at: new Date().toISOString()
          })
          .eq('public_note_id', noteId)
          .eq('shared_with_id', collaboratorId);

        if (error) {
          throw error;
        }

        // Log activity for public note
        await this.logPublicNoteActivity(noteId, collaboratorId, 'permission_changed', {
          old_permission: 'unknown',
          new_permission: newPermission
        });
      } else {
        // For private notes, use note_id
        const { error } = await supabase
          .from('note_shares')
          .update({ 
            permission: newPermission,
            updated_at: new Date().toISOString()
          })
          .eq('note_id', noteId)
          .eq('shared_with_id', collaboratorId);

        if (error) {
          throw error;
        }

        // Log activity for private note
        await this.logNoteActivity(noteId, collaboratorId, 'permission_changed', {
          old_permission: 'unknown',
          new_permission: newPermission
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating collaborator permission:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update permission'
      };
    }
  }

  /**
   * Remove um colaborador da nota
   */
  async removeCollaborator(
    noteId: string, 
    collaboratorId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // First check if this is a public note
      const { data: publicNote } = await supabase
        .from('public_notes')
        .select('id')
        .eq('id', noteId)
        .single();

      if (publicNote) {
        // For public notes, use public_note_id
        const { error } = await supabase
          .from('note_shares')
          .delete()
          .eq('public_note_id', noteId)
          .eq('shared_with_id', collaboratorId);

        if (error) {
          throw error;
        }

        // Log activity for public note
        await this.logPublicNoteActivity(noteId, collaboratorId, 'collaborator_removed');
      } else {
        // For private notes, use note_id
        const { error } = await supabase
          .from('note_shares')
          .delete()
          .eq('note_id', noteId)
          .eq('shared_with_id', collaboratorId);

        if (error) {
          throw error;
        }

        // Log activity for private note
        await this.logNoteActivity(noteId, collaboratorId, 'collaborator_removed');
      }

      return { success: true };
    } catch (error) {
      console.error('Error removing collaborator:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to remove collaborator'
      };
    }
  }

  /**
   * Verifica se o usuário tem permissão para gerenciar a nota
   */
  async canManageNote(noteId: string, userId: string): Promise<boolean> {
    try {
      // Verifica se é o dono da nota
      const { data: note } = await supabase
        .from('notes')
        .select('user_id')
        .eq('id', noteId)
        .single();

      if (note?.user_id === userId) {
        return true;
      }

      // Verifica se tem permissão de admin
      const { data: share } = await supabase
        .from('note_shares')
        .select('permission')
        .eq('note_id', noteId)
        .eq('shared_with_id', userId)
        .single();

      return share?.permission === 'admin';
    } catch (error) {
      console.error('Error checking note permissions:', error);
      return false;
    }
  }

  /**
   * Obtém as permissões do usuário para uma nota (versão robusta com logs)
   */
  async getUserNotePermission(noteId: string, userId: string): Promise<'owner' | 'admin' | 'write' | 'read' | null> {
    try {
      console.log('[DEBUG] getUserNotePermission called:', { noteId, userId });

      // First, check if it's a public note
      const { data: publicNote, error: publicNoteError } = await supabase
        .from('public_notes')
        .select('owner_id')
        .eq('id', noteId)
        .single();

      console.log('[DEBUG] Public note query result:', { publicNote, publicNoteError });

      if (publicNoteError) {
        console.log('[DEBUG] Not a public note or error:', publicNoteError);
        // Might be a private note, check that instead
        const { data: privateNote, error: privateNoteError } = await supabase
          .from('notes')
          .select('user_id')
          .eq('id', noteId)
          .eq('user_id', userId)
          .single();

        console.log('[DEBUG] Private note query result:', { privateNote, privateNoteError });

        if (privateNote) {
          return 'owner'; // User owns the private note
        }
        
        console.log('[DEBUG] No permission found for private note');
        return null;
      }

      if (publicNote) {
        // For public notes, check owner_id
        if (publicNote.owner_id === userId) {
          console.log('[DEBUG] User is owner of public note');
          return 'owner';
        }
        
        // Check collaboration permissions for public notes
        const { data: share, error: shareError } = await supabase
          .from('note_shares')
          .select('permission')
          .eq('public_note_id', noteId)
          .eq('shared_with_id', userId)
          .single();

        console.log('[DEBUG] Share permission query result:', { share, shareError });

        if (shareError) {
          console.log('[DEBUG] No share permission found, but user might still access as owner');
          // WORKAROUND: If user is owner but no explicit share, still allow
          return publicNote.owner_id === userId ? 'owner' : null;
        }

        return share?.permission as 'admin' | 'write' | 'read' || null;
      }

      console.log('[DEBUG] No note found at all');
      return null;
    } catch (error) {
      console.error('[DEBUG] Error in getUserNotePermission:', error);
      return null;
    }
  }

  /**
   * Inscreve-se APENAS em notas públicas (colaborativas) do usuário
   */
  subscribeToPublicNotes(userId: string, callbacks: PublicNoteCallbacks) {
    const channelName = `public-notes-${userId}`;
    
    if (this.channels.has(channelName)) {
      this.unsubscribe(channelName);
    }

    this.log(`Subscribing to PUBLIC notes only for user: ${userId}`);

    const channel = supabase
      .channel(channelName)
      // APENAS notas públicas
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'public_notes', 
          filter: `owner_id=eq.${userId}` 
        },
        (payload) => {
          this.log('Public notes changed (realtime):', payload);
          callbacks.onPublicNotesChange?.(payload);
        }
      )
      // Colaboração em notas públicas
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'note_shares', 
          filter: `shared_with_id=eq.${userId}` 
        },
        (payload) => {
          // Só notificar se for para notas públicas
          if ((payload.new as any)?.public_note_id) {
            this.log('Public note collaboration changed:', payload);
            callbacks.onCollaborationChange?.(payload);
          }
        }
      )
      .subscribe((status) => {
        this.log(`Public notes subscription status: ${status}`);
        this.updateConnectionStatus();
      });

    this.channels.set(channelName, channel);
    return channel;
  }

  /**
   * Colaboração em tempo real APENAS para notas públicas
   */
  subscribeToPublicNoteCollaboration(publicNoteId: string, userId: string, callbacks: PublicNoteCallbacks) {
    const channelName = `public-note-collab-${publicNoteId}`;
    
    if (this.channels.has(channelName)) {
      this.unsubscribe(channelName);
    }

    this.log(`Subscribing to PUBLIC note collaboration: ${publicNoteId}`);

    const channel = supabase
      .channel(channelName)
      // Atividade apenas em notas públicas
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'note_activity', 
          filter: `public_note_id=eq.${publicNoteId}` 
        },
        (payload) => {
          if ((payload.new as any)?.user_id !== userId) {
            this.log('Public note activity:', payload);
            callbacks.onCollaborationChange?.(payload);
          }
        }
      )
      // Presença em tempo real
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        this.log('Presence sync in public note:', state);
        callbacks.onPresenceChange?.({ type: 'presence', state });
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        this.log('User joined public note:', { key, newPresences });
        callbacks.onPresenceChange?.({ type: 'user_joined', key, newPresences });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        this.log('User left public note:', { key, leftPresences });
        callbacks.onPresenceChange?.({ type: 'user_left', key, leftPresences });
      })
      .subscribe(async (status) => {
        this.log(`Public note collaboration status: ${status}`);
        
        if (status === 'SUBSCRIBED') {
          // Get user profile information
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email, avatar_url, bio')
            .eq('id', userId)
            .single();

          // Tracking de presença apenas em notas públicas
          await channel.track({
            user_id: userId,
            public_note_id: publicNoteId,
            online_at: new Date().toISOString(),
            full_name: profile?.full_name,
            email: profile?.email,
            avatar_url: profile?.avatar_url,
            bio: profile?.bio,
          });

          // Also update presence in database
          await this.updateUserPresence(publicNoteId, userId, {}, true);
        }
      });

    this.channels.set(channelName, channel);
    return channel;
  }

  /**
   * Busca notas públicas do usuário (próprias e colaborativas)
   */
  async getPublicNotes(userId: string): Promise<NoteType[]> {
    try {
      console.log('🔍 Fetching public notes for user:', userId);
      
      // Get notes owned by the user
      const { data: ownedNotes, error: ownedError } = await supabase
        .from('public_notes')
        .select('*')
        .eq('owner_id', userId)
        .order('updated_at', { ascending: false });

      if (ownedError) {
        console.error('❌ Error fetching owned public notes:', ownedError);
        throw ownedError;
      }

      // Get notes where user is a collaborator
      const { data: sharedNotes, error: sharedError } = await supabase
        .from('note_shares')
        .select(`
          public_note_id,
          permission,
          shared_with_id
        `)
        .eq('shared_with_id', userId)
        .not('public_note_id', 'is', null);

      if (sharedError) {
        console.error('❌ Error fetching shared notes:', sharedError);
        throw sharedError;
      }

      // Get full note data for shared notes
      let collaborativeNotes: any[] = [];
      if (sharedNotes && sharedNotes.length > 0) {
        const sharedNoteIds = sharedNotes.map(share => share.public_note_id);
        const { data: collaborativeNotesData, error: collaborativeError } = await supabase
          .from('public_notes')
          .select('*')
          .in('id', sharedNoteIds)
          .order('updated_at', { ascending: false });

        if (collaborativeError) {
          console.error('❌ Error fetching collaborative note details:', collaborativeError);
        } else {
          collaborativeNotes = collaborativeNotesData || [];
        }
      }

      console.log('✅ Owned notes fetched:', ownedNotes);
      console.log('✅ Collaborative notes fetched:', collaborativeNotes);

      // Combine and deduplicate notes
      const allNotes = [...(ownedNotes || []), ...collaborativeNotes];
      const uniqueNotes = allNotes.filter((note, index, self) => 
        self.findIndex(n => n.id === note.id) === index
      );

      return uniqueNotes.map(note => ({
        type: 'public' as const,
        id: note.id,
        title: note.title,
        content: note.content,
        owner_id: note.owner_id,
        created_at: note.created_at,
        updated_at: note.updated_at,
        allow_anonymous_view: note.allow_anonymous_view,
        allow_anonymous_edit: note.allow_anonymous_edit,
        is_collaborative: true,
      }));
    } catch (error) {
      console.error('❌ Error in getPublicNotes:', error);
      return [];
    }
  }

  /**
   * Cria uma nova nota pública
   */
  async createPublicNote(title: string, content: string = '', options?: {
    allowAnonymousView?: boolean;
    allowAnonymousEdit?: boolean;
  }): Promise<{ success: boolean; note?: NoteType; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();
      
      if (!user.user) {
        return { success: false, error: 'User not authenticated' };
      }

      const { data, error } = await supabase
        .from('public_notes')
        .insert({
          title,
          content,
          owner_id: user.user.id,
          allow_anonymous_view: options?.allowAnonymousView || false,
          allow_anonymous_edit: options?.allowAnonymousEdit || false,
        })
        .select()
        .single();

      if (error) throw error;

      const publicNote: NoteType = {
        type: 'public',
        id: data.id,
        title: data.title,
        content: data.content,
        owner_id: data.owner_id,
        created_at: data.created_at,
        updated_at: data.updated_at,
        allow_anonymous_view: data.allow_anonymous_view,
        allow_anonymous_edit: data.allow_anonymous_edit,
        is_collaborative: true,
      };

      return { success: true, note: publicNote };
    } catch (error) {
      console.error('Error creating public note:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create public note'
      };
    }
  }

  /**
   * Atualiza uma nota pública
   */
  async updatePublicNote(noteId: string, updates: {
    title?: string;
    content?: string;
    allowAnonymousView?: boolean;
    allowAnonymousEdit?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: any = {};
      
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.allowAnonymousView !== undefined) updateData.allow_anonymous_view = updates.allowAnonymousView;
      if (updates.allowAnonymousEdit !== undefined) updateData.allow_anonymous_edit = updates.allowAnonymousEdit;

      const { error } = await supabase
        .from('public_notes')
        .update(updateData)
        .eq('id', noteId);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error('Error updating public note:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update public note'
      };
    }
  }

  /**
   * Remove inscrição de um canal específico
   */
  unsubscribe(channelName: string) {
    const channel = this.channels.get(channelName);
    if (channel) {
      this.log(`Unsubscribing from channel: ${channelName}`);
      channel.unsubscribe();
      this.channels.delete(channelName);
    }
  }

  /**
   * Remove todas as inscrições
   */
  unsubscribeAll() {
    this.log('Unsubscribing from all channels');
    this.channels.forEach((channel, channelName) => {
      this.log(`Unsubscribing from: ${channelName}`);
      channel.unsubscribe();
    });
    this.channels.clear();
  }

  /**
   * Obtém o status de todos os canais
   */
  getChannelsStatus() {
    const status: { [key: string]: string } = {};
    this.channels.forEach((channel, name) => {
      status[name] = channel.state;
    });
    return status;
  }

  /**
   * Verifica se está conectado
   */
  isConnected() {
    return Array.from(this.channels.values()).some(
      channel => channel.state === 'joined'
    );
  }

  /**
   * Gera iniciais a partir do nome ou email
   */
  private getInitials(fullName?: string, email?: string): string {
    if (fullName && fullName.trim()) {
      const nameParts = fullName.trim().split(' ');
      if (nameParts.length > 1) {
        return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
      }
      return fullName.substring(0, 2).toUpperCase();
    }
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return 'U';
  }



  /**
   * Registra uma atividade em uma nota pública
   */
  private async logPublicNoteActivity(
    publicNoteId: string, 
    userId: string, 
    activityType: string, 
    metadata?: any
  ): Promise<void> {
    try {
      await supabase
        .from('note_activity')
        .insert({
          public_note_id: publicNoteId,
          user_id: userId,
          activity_type: activityType,
          activity_data: metadata || {},
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error logging public note activity:', error);
    }
  }

  /**
   * Gera um código de convite para colaboração em uma nota pública
   */
  async generateInviteCode(
    publicNoteId: string,
    permission: 'read' | 'write' | 'admin' = 'read',
    maxUses?: number,
    expiresAt?: Date
  ): Promise<{ success: boolean; inviteCode?: string; error?: string }> {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        return { success: false, error: 'Usuário não autenticado' };
      }

      // Verificar se o usuário é dono da nota
      const { data: noteData, error: noteError } = await supabase
        .from('public_notes')
        .select('owner_id')
        .eq('id', publicNoteId)
        .single();

      if (noteError || !noteData || noteData.owner_id !== currentUser.id) {
        return { success: false, error: 'Apenas o dono da nota pode gerar códigos de convite' };
      }

      // Gerar código único
      const { data: inviteCode, error: codeError } = await supabase.rpc('generate_invite_code');
      
      if (codeError || !inviteCode) {
        console.error('Error generating invite code:', codeError);
        return { success: false, error: 'Erro ao gerar código de convite' };
      }

      // Criar o convite na base de dados
      const { error: insertError } = await supabase
        .from('collaboration_invites')
        .insert({
          invite_code: inviteCode,
          public_note_id: publicNoteId,
          created_by: currentUser.id,
          permission: permission,
          max_uses: maxUses,
          current_uses: 0,
          expires_at: expiresAt?.toISOString(),
          is_active: true
        });

      if (insertError) {
        console.error('Error inserting invite code:', insertError);
        throw insertError;
      }

      // Log da atividade
      await this.logPublicNoteActivity(publicNoteId, currentUser.id, 'invite_code_generated', {
        permission,
        max_uses: maxUses,
        expires_at: expiresAt?.toISOString()
      });

      return { success: true, inviteCode };
    } catch (error) {
      console.error('Error generating invite code:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro ao gerar código de convite'
      };
    }
  }

  /**
   * Usa um código de convite para juntar-se à colaboração em uma nota
   */
  async useInviteCode(inviteCode: string): Promise<{ success: boolean; noteId?: string; error?: string }> {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        return { success: false, error: 'Usuário não autenticado' };
      }

      // Buscar o convite pelo código
      const { data: inviteData, error: inviteError } = await supabase
        .from('collaboration_invites')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase())
        .eq('is_active', true)
        .single();

      if (inviteError || !inviteData) {
        return { success: false, error: 'Código de convite inválido ou expirado' };
      }

      // Verificar se o convite não expirou
      if (inviteData.expires_at && new Date(inviteData.expires_at) < new Date()) {
        return { success: false, error: 'Este código de convite expirou' };
      }

      // Verificar se não excedeu o limite de usos
      if (inviteData.max_uses && inviteData.current_uses >= inviteData.max_uses) {
        return { success: false, error: 'Este código de convite já foi usado o máximo de vezes permitido' };
      }

      // Verificar se o usuário já é colaborador
      const { data: existingShare } = await supabase
        .from('note_shares')
        .select('id')
        .eq('public_note_id', inviteData.public_note_id)
        .eq('shared_with_id', currentUser.id)
        .single();

      if (existingShare) {
        return { success: false, error: 'Você já é um colaborador desta nota' };
      }

      // Verificar se o usuário não é o próprio dono da nota
      const { data: noteData } = await supabase
        .from('public_notes')
        .select('owner_id')
        .eq('id', inviteData.public_note_id)
        .single();

      if (noteData?.owner_id === currentUser.id) {
        return { success: false, error: 'Você já é o dono desta nota' };
      }

      // Adicionar como colaborador
      const { error: shareError } = await supabase
        .from('note_shares')
        .insert({
          public_note_id: inviteData.public_note_id,
          owner_id: inviteData.created_by,
          shared_with_id: currentUser.id,
          permission: inviteData.permission,
          invited_at: new Date().toISOString(),
          last_accessed_at: new Date().toISOString()
        });

      if (shareError) {
        throw shareError;
      }

      // Incrementar contador de usos
      const { error: updateError } = await supabase
        .from('collaboration_invites')
        .update({ 
          current_uses: inviteData.current_uses + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', inviteData.id);

      if (updateError) {
        console.error('Error updating invite usage count:', updateError);
      }

      // Log da atividade
      await this.logPublicNoteActivity(inviteData.public_note_id, currentUser.id, 'joined_via_invite', {
        invite_code: inviteCode,
        permission: inviteData.permission
      });

      return { success: true, noteId: inviteData.public_note_id };
    } catch (error) {
      console.error('Error using invite code:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro ao usar código de convite'
      };
    }
  }

  /**
   * Lista os códigos de convite ativos para uma nota
   */
  async getInviteCodes(publicNoteId: string): Promise<{ success: boolean; invites?: any[]; error?: string }> {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        return { success: false, error: 'Usuário não autenticado' };
      }

      // Verificar se o usuário é dono da nota
      const { data: noteData } = await supabase
        .from('public_notes')
        .select('owner_id')
        .eq('id', publicNoteId)
        .single();

      if (!noteData || noteData.owner_id !== currentUser.id) {
        return { success: false, error: 'Apenas o dono da nota pode ver códigos de convite' };
      }

      const { data: invites, error } = await supabase
        .from('collaboration_invites')
        .select('*')
        .eq('public_note_id', publicNoteId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return { success: true, invites: invites || [] };
    } catch (error) {
      console.error('Error fetching invite codes:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro ao buscar códigos de convite'
      };
    }
  }

  /**
   * Desativa um código de convite
   */
  async deactivateInviteCode(inviteId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        return { success: false, error: 'Usuário não autenticado' };
      }

      const { error } = await supabase
        .from('collaboration_invites')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', inviteId)
        .eq('created_by', currentUser.id);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.error('Error deactivating invite code:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro ao desativar código de convite'
      };
    }
  }

  /**
   * Remove a presença do usuário quando ele sai de uma nota
   */
  async cleanupUserPresence(noteId: string, userId: string, isPublicNote = false) {
    try {
      console.log('[DEBUG] Cleaning up user presence:', { noteId, userId, isPublicNote });
      
      const condition = isPublicNote 
        ? { user_id: userId, public_note_id: noteId }
        : { user_id: userId, note_id: noteId };
      
      const { error } = await supabase
        .from('user_presence')
        .delete()
        .match(condition);

      if (error) {
        console.error('[ERROR] Error cleaning up user presence:', error);
      } else {
        console.log('[DEBUG] Successfully cleaned up user presence');
      }
    } catch (error) {
      console.error('[ERROR] Exception cleaning up user presence:', error);
    }
  }
}

// Criar e exportar uma instância única
export const realtimeManager = new RealtimeManager();

// Hooks úteis para usar nos componentes
export const useRealtimeConnection = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: false,
    channelCount: 0,
    status: 'disconnected'
  });

  useEffect(() => {
    const checkConnection = () => {
      setConnectionStatus(realtimeManager.getConnectionStatus());
    };

    const interval = setInterval(checkConnection, 1000);
    return () => clearInterval(interval);
  }, []);

  return connectionStatus;
};

export const useRealtimeUserData = (userId: string | undefined, callbacks: RealtimeCallbacks) => {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!userId) return;

    realtimeManager.subscribeToUserData(userId, callbacks);
    
    // Verificar status da conexão
    const checkConnection = () => {
      setIsConnected(realtimeManager.isConnected());
    };

    const interval = setInterval(checkConnection, 1000);
    
    return () => {
      clearInterval(interval);
      realtimeManager.unsubscribe(`user-data-${userId}`);
    };
  }, [userId]); // Remove callbacks dependency to avoid unnecessary re-subscriptions

  return { isConnected };
};

export const useRealtimeNoteCollaboration = (
  noteId: string | undefined, 
  userId: string | undefined, 
  callbacks: RealtimeCallbacks
) => {
  const [collaborators, setCollaborators] = useState<any[]>([]);

  useEffect(() => {
    if (!noteId || !userId) return;

    const enhancedCallbacks = {
      ...callbacks,
      onCollaborationChange: (payload: any) => {
        if (payload.type === 'presence') {
          const users = Object.values(payload.state).flat();
          setCollaborators(users);
        }
        callbacks.onCollaborationChange?.(payload);
      }
    };

    realtimeManager.subscribeToNoteCollaboration(noteId, userId, enhancedCallbacks);
    
    return () => {
      realtimeManager.unsubscribe(`note-collaboration-${noteId}`);
    };
  }, [noteId, userId]); // Remove callbacks dependency

  const sendActivity = (activityType: string, data?: any) => {
    // DISABLED: Collaboration activities temporarily disabled to prevent errors
    console.log('[DEBUG] Private note activity disabled:', { noteId, userId, activityType, data });
    return; // Early return - no database operations
  };

  return { collaborators, sendActivity };
};

export const useRealtimePublicNotes = (userId: string | undefined, callbacks: PublicNoteCallbacks) => {
  useEffect(() => {
    if (!userId) return;

    realtimeManager.subscribeToPublicNotes(userId, callbacks);
    
    return () => {
      realtimeManager.unsubscribe(`public-notes-${userId}`);
    };
  }, [userId]); // Remove callbacks dependency

  return;
};

export const useRealtimePublicNoteCollaboration = (
  publicNoteId: string | undefined, 
  userId: string | undefined, 
  callbacks: PublicNoteCallbacks
) => {
  useEffect(() => {
    if (!publicNoteId || !userId) return;

    realtimeManager.subscribeToPublicNoteCollaboration(publicNoteId, userId, callbacks);
    
    return () => {
      realtimeManager.unsubscribe(`public-note-collab-${publicNoteId}`);
    };
  }, [publicNoteId, userId]); // Remove callbacks dependency

  return;
};

// Hook para notas privadas (SEM realtime) com infinite scrolling
export const usePrivateNotes = (userId: string | undefined) => {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [isFetching, setIsFetching] = useState(false);

  const NOTES_PER_PAGE = 20;

  const fetchPrivateNotes = useCallback(async (isNewFetch = false) => {
    if (!userId || isFetching) return;
    
    setIsFetching(true);
    if (isNewFetch) {
      setLoading(true);
    }

    const currentPage = isNewFetch ? 0 : page;
    const from = currentPage * NOTES_PER_PAGE;
    const to = from + NOTES_PER_PAGE - 1;
    
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', userId)
        .order('favorite', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      
      // Descriptografar as notas antes de retornar
      const decryptedNotes = (data || []).map((note) => {
        try {
          return {
            ...note,
            title: decrypt(note.title),
            content: note.content ? decrypt(note.content) : '',
          };
        } catch (decryptError) {
          console.error('Error decrypting note:', decryptError);
          return {
            ...note,
            title: 'Error decrypting title',
            content: 'Error decrypting content',
          };
        }
      });
      
      if (isNewFetch) {
        setNotes(decryptedNotes);
        setPage(1);
      } else {
        setNotes(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const newNotes = decryptedNotes.filter(n => !existingIds.has(n.id));
          return [...prev, ...newNotes];
        });
        setPage(prev => prev + 1);
      }
      
      setHasMore(data.length === NOTES_PER_PAGE);
    } catch (error) {
      console.error('Error fetching private notes:', error);
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [userId, page, isFetching]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore && !isFetching) {
      fetchPrivateNotes(false);
    }
  }, [loading, hasMore, isFetching, fetchPrivateNotes]);

  const refresh = useCallback(() => {
    setPage(0);
    setHasMore(true);
    fetchPrivateNotes(true);
  }, [fetchPrivateNotes]);

  useEffect(() => {
    if (userId) {
      refresh();
    } else {
      setNotes([]);
      setLoading(false);
      setHasMore(true);
      setPage(0);
    }
  }, [userId]);

  return { 
    notes, 
    loading, 
    hasMore,
    refresh,
    loadMore,
    type: 'private' as const
  };
};

// Hook para notas públicas (COM realtime) com infinite scrolling
export const usePublicNotes = (userId: string | undefined) => {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [isFetching, setIsFetching] = useState(false);

  const NOTES_PER_PAGE = 20;

  const fetchPublicNotes = useCallback(async (isNewFetch = false) => {
    if (!userId || isFetching) {
      console.log('⚠️ No userId provided or already fetching public notes');
      return;
    }
    
    setIsFetching(true);
    if (isNewFetch) {
      setLoading(true);
    }

    const currentPage = isNewFetch ? 0 : page;
    const from = currentPage * NOTES_PER_PAGE;
    
    console.log('🔄 Fetching public notes for user:', userId, 'page:', currentPage);
    
    try {
      // Fetch owned public notes
      const { data: ownedNotes, error: ownedError } = await supabase
        .from('public_notes')
        .select('*')
        .eq('owner_id', userId)
        .order('updated_at', { ascending: false })
        .range(from, from + NOTES_PER_PAGE - 1);

      if (ownedError) throw ownedError;

      // Fetch shared public notes
      const { data: sharedNotes, error: sharedError } = await supabase
        .from('note_shares')
        .select(`
          public_note_id,
          permission,
          shared_with_id,
          public_notes!inner(*)
        `)
        .eq('shared_with_id', userId)
        .not('public_note_id', 'is', null)
        .order('created_at', { ascending: false })
        .range(from, from + NOTES_PER_PAGE - 1);

      if (sharedError) {
        console.warn('Error fetching shared notes:', sharedError);
      }

      // Process shared notes
      const collaborativeNotes = (sharedNotes || []).map(share => ({
        ...share.public_notes,
        is_collaborative: true,
        permission: share.permission
      }));

      // Combine and deduplicate notes
      const allNotes = [...(ownedNotes || []), ...collaborativeNotes];
      const uniqueNotes = allNotes.filter((note, index, self) => 
        self.findIndex(n => n.id === note.id) === index
      );

      // Convert to NoteType format
      const formattedNotes = uniqueNotes.map(note => ({
        type: 'public' as const,
        id: note.id,
        title: note.title,
        content: note.content,
        owner_id: note.owner_id,
        created_at: note.created_at,
        updated_at: note.updated_at,
        allow_anonymous_view: note.allow_anonymous_view,
        allow_anonymous_edit: note.allow_anonymous_edit,
        is_collaborative: true,
      }));

      console.log('📄 Public notes received:', formattedNotes.length);

      if (isNewFetch) {
        setNotes(formattedNotes);
        setPage(1);
      } else {
        setNotes(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const newNotes = formattedNotes.filter(n => !existingIds.has(n.id));
          return [...prev, ...newNotes];
        });
        setPage(prev => prev + 1);
      }
      
      setHasMore(allNotes.length === NOTES_PER_PAGE);
    } catch (error) {
      console.error('❌ Error fetching public notes:', error);
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [userId, page, isFetching]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore && !isFetching) {
      fetchPublicNotes(false);
    }
  }, [loading, hasMore, isFetching, fetchPublicNotes]);

  const refresh = useCallback(() => {
    setPage(0);
    setHasMore(true);
    fetchPublicNotes(true);
  }, [fetchPublicNotes]);

  useEffect(() => {
    if (!userId) return;

    // Fetch inicial
    refresh();

    // Subscrever a mudanças em tempo real
    realtimeManager.subscribeToPublicNotes(userId, {
      onPublicNotesChange: (payload) => {
        console.log('🔄 Public notes updated:', payload);
        refresh(); // Recarregar notas públicas
      }
    });

    // Verificar conexão
    const checkConnection = () => {
      setIsConnected(realtimeManager.isConnected());
    };
    const interval = setInterval(checkConnection, 2000);
    
    return () => {
      clearInterval(interval);
      realtimeManager.unsubscribe(`public-notes-${userId}`);
    };
  }, [userId]);

  return { 
    notes, 
    loading, 
    isConnected,
    hasMore,
    refresh,
    loadMore,
    type: 'public' as const
  };
};

// Hook para colaboração (APENAS notas públicas) - Versão workaround simplificada
export const usePublicNoteCollaboration = (
  publicNoteId: string | undefined,
  userId: string | undefined
) => {
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  
  // Load initial collaborators
  useEffect(() => {
    if (!publicNoteId || !userId) {
      console.log('[DEBUG] Missing publicNoteId or userId, skipping collaboration setup');
      return;
    }

    const loadCollaborators = async () => {
      try {
        console.log('[DEBUG] Loading collaborators for note:', publicNoteId);
        const collaboratorsList = await realtimeManager.getNoteCollaborators(publicNoteId);
        console.log('[DEBUG] Collaborators loaded:', collaboratorsList.length, collaboratorsList.map(c => ({
          id: c.user_id,
          name: c.full_name,
          email: c.email,
          permission: c.permission
        })));
        setCollaborators(collaboratorsList);
      } catch (error) {
        console.error('Error loading collaborators:', error);
        setCollaborators([]);
      }
    };

    loadCollaborators();
  }, [publicNoteId, userId]);

  // Function to refresh collaborators
  const refreshCollaborators = useCallback(async () => {
    if (!publicNoteId) return;
    try {
      console.log('[DEBUG] Refreshing collaborators for note:', publicNoteId);
      const collaboratorsList = await realtimeManager.getNoteCollaborators(publicNoteId);
      console.log('[DEBUG] Collaborators refreshed:', collaboratorsList.length, collaboratorsList.map(c => ({
        id: c.user_id,
        name: c.full_name,
        email: c.email,
        permission: c.permission
      })));
      setCollaborators(collaboratorsList);
    } catch (error) {
      console.error('Error refreshing collaborators:', error);
    }
  }, [publicNoteId]);

  // Workaround: Set all collaborators as "online" for display purposes
  const onlineUsers = collaborators.map(c => ({ 
    user_id: c.user_id, 
    full_name: c.full_name 
  }));

  return { 
    collaborators, 
    onlineUsers, // All collaborators are considered "online" for display
    refreshCollaborators,
    sendActivity: (activityType: string, data?: any) => {
      // DISABLED: Collaboration activities temporarily disabled to prevent errors
      console.log('[DEBUG] Public note activity disabled:', { publicNoteId, userId, activityType, data });
      return; // Early return - no database operations
    }
  };
};
