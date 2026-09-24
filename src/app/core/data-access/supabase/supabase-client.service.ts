import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, inject } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';
import { browserAuthLock } from './browser-auth-lock';

@Service()
export class SupabaseClientService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly client = this.createSupabaseClient();

  getClient(): SupabaseClient | null {
    return this.client;
  }

  private createSupabaseClient(): SupabaseClient | null {
    const supabaseUrl = environment.supabaseUrl.trim();
    const supabaseKey = environment.supabaseKey.trim();

    if (!supabaseUrl || !supabaseKey) {
      return null;
    }

    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: this.isBrowser,
        autoRefreshToken: this.isBrowser,
        ...(this.isBrowser && globalThis.navigator?.locks ? { lock: browserAuthLock } : {}),
      },
    });
  }
}
