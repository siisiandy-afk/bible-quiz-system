import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env?.VITE_SUPABASE_URL || '';
const rawAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  rawUrl &&
  rawAnonKey &&
  rawUrl.trim().length > 0 &&
  rawAnonKey.trim().length > 0 &&
  !rawUrl.includes('your-project-id')
);

let pendingPasswordRecovery =
  typeof window !== 'undefined' &&
  (window.location.hash.includes('type=recovery') ||
    new URLSearchParams(window.location.search).get('type') === 'recovery');

export const supabase = isSupabaseConfigured
  ? createClient(rawUrl.trim(), rawAnonKey.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null;

if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      pendingPasswordRecovery = true;
    }
  });
}

/**
 * Quiz Master Authentication Service
 */
export const authService = {
  async signInWithEmail({ email, password }) {
    if (!isSupabaseConfigured) {
      return {
        data: null,
        error: new Error('Supabase Auth is not configured. Add credentials to .env to enable.'),
      };
    }
    return await supabase.auth.signInWithPassword({ email, password });
  },

  async signUpWithEmail({ email, password }) {
    if (!isSupabaseConfigured) {
      return {
        data: null,
        error: new Error('Supabase Auth is not configured. Add credentials to .env to enable.'),
      };
    }
    return await supabase.auth.signUp({ email, password });
  },

  async signOut() {
    if (isSupabaseConfigured && supabase) {
      return await supabase.auth.signOut();
    }
    return { error: null };
  },

  async getSession() {
    if (!isSupabaseConfigured || !supabase) {
      return { data: { session: null }, error: null };
    }
    return await supabase.auth.getSession();
  },

  async getUser() {
    if (!isSupabaseConfigured || !supabase) {
      return { data: { user: null }, error: null };
    }
    return await supabase.auth.getUser();
  },

  onAuthStateChange(callback) {
    if (!isSupabaseConfigured || !supabase) {
      return { data: { subscription: { unsubscribe: () => {} } } };
    }
    return supabase.auth.onAuthStateChange(callback);
  },

  consumePendingRecovery() {
    const val = pendingPasswordRecovery;
    pendingPasswordRecovery = false;
    return val;
  },

  async resetPasswordForEmail(email) {
    if (!isSupabaseConfigured || !supabase) {
      return {
        data: null,
        error: new Error('Supabase Auth is not configured. Add credentials to .env to enable.'),
      };
    }
    const redirectTo =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : undefined;
    return await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  },

  async updatePassword({ newPassword }) {
    if (!isSupabaseConfigured || !supabase) {
      return {
        data: null,
        error: new Error('Supabase Auth is not configured. Add credentials to .env to enable.'),
      };
    }
    return await supabase.auth.updateUser({ password: newPassword });
  },

  async changePassword({ email, currentPassword, newPassword }) {
    if (!isSupabaseConfigured || !supabase) {
      return {
        data: null,
        error: new Error('Supabase Auth is not configured. Add credentials to .env to enable.'),
      };
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (verifyError) {
      return {
        data: null,
        error: new Error(
          verifyError.message === 'Invalid login credentials'
            ? 'Current password is incorrect.'
            : verifyError.message
        ),
      };
    }

    return await supabase.auth.updateUser({ password: newPassword });
  },
};

/**
 * Room Management and Contestant Verification Service
 */
export const roomService = {
  /**
   * Verifies if an active room exists in the database.
   */
  async verifyRoom(roomCode) {
    const cleanCode = String(roomCode).trim();
    if (!isSupabaseConfigured || !supabase) {
      return {
        exists: false,
        error: 'Database service is not configured. Please contact administrator.',
      };
    }

    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', cleanCode)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('Error verifying room in Supabase:', error);
        return { exists: false, error: error.message };
      }

      if (!data) {
        return { exists: false, error: 'Room does not exist or has ended.' };
      }

      return { exists: true, room: data };
    } catch (err) {
      console.error('Unexpected error verifying room:', err);
      return { exists: false, error: err.message || 'Failed to verify room' };
    }
  },

  /**
   * Creates and registers a new room in Supabase.
   */
  async createRoom({ roomCode, hostId = null, gameMode = 'standard' }) {
    const cleanCode = String(roomCode).trim();
    if (!isSupabaseConfigured || !supabase) {
      return {
        success: false,
        error: 'Database service is not configured.',
      };
    }

    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert({
          room_code: cleanCode,
          host_id: hostId,
          status: 'LOCKED',
          game_mode: gameMode,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to register room in Supabase:', error);
        return { success: false, error: error.message };
      }

      return { success: true, room: data };
    } catch (err) {
      console.error('Unexpected error creating room in Supabase:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Advances room to the next round, clearing per-round buzzer locks.
   */
  async nextRound(roomCode) {
    const cleanCode = String(roomCode).trim();
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database service is not configured.' };
    }

    try {
      const { data, error } = await supabase.rpc('next_round', {
        p_room_code: cleanCode,
      });

      if (error) {
        console.error('Error advancing round in Supabase:', error);
        return { success: false, error: error.message };
      }

      return data || { success: true };
    } catch (err) {
      console.error('Unexpected error advancing round:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Updates room status (OPEN or LOCKED)
   */
  async updateRoomStatus(roomCode, status) {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      await supabase
        .from('rooms')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('room_code', String(roomCode).trim())
        .eq('is_active', true);
    } catch (err) {
      console.error('Error updating room status in Supabase:', err);
    }
  },

  /**
   * Closes a room when the host exits
   */
  async closeRoom(roomCode) {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      await supabase
        .from('rooms')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('room_code', String(roomCode).trim());
    } catch (err) {
      console.error('Error closing room in Supabase:', err);
    }
  },

  /**
   * Registers a contestant in an active room
   */
  async registerContestant(roomCode, playerName, sessionId) {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database service is not configured.' };
    }

    try {
      const verifyRes = await this.verifyRoom(roomCode);
      if (!verifyRes.exists || !verifyRes.room) {
        return { success: false, error: 'Cannot register: room not found.' };
      }

      const { data, error } = await supabase
        .from('contestants')
        .upsert(
          {
            room_id: verifyRes.room.id,
            name: String(playerName).trim(),
            session_id: sessionId,
            is_online: true,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'room_id,name' }
        )
        .select()
        .single();

      if (error) {
        console.error('Error registering contestant in Supabase:', error);
        return { success: false, error: error.message };
      }

      return { success: true, contestant: data };
    } catch (err) {
      console.error('Unexpected error registering contestant:', err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Records an atomic buzzer press with server-authoritative timestamps
   */
  async recordBuzz(roomCode, playerName) {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database service is not configured.' };
    }

    try {
      const { data, error } = await supabase.rpc('record_buzz', {
        p_room_code: String(roomCode).trim(),
        p_contestant_name: String(playerName).trim(),
      });

      if (error) {
        console.error('Error recording buzz in Supabase:', error);
        return { success: false, error: error.message };
      }

      return data;
    } catch (err) {
      console.error('Unexpected error recording buzz:', err);
      return { success: false, error: err.message };
    }
  },
};
