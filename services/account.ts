/**
 * services/account.ts
 *
 * Mock account service for Butterfly Trading.
 *
 * Architecture
 * ────────────
 * Mirrors the shape of a real Supabase integration so that swapping in
 * production database calls requires minimal changes to the rest of the app.
 *
 * Each function is marked with a "PRODUCTION SWAP" comment describing
 * exactly what replaces the mock logic when you're ready to go live.
 *
 * Data model alignment (from Butterfly_Data_Model_Architecture.docx):
 *   Account.type        →  AccountType enum below
 *   Account.status      →  AccountStatus enum below
 *   Account.ni_number   →  encrypted at rest; never stored in plain text
 *   Account.cash_balance → decimal, GBP, default 0
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Mirrors the Account.type enum in the data model. */
export type AccountType = 'ISA' | 'GIA';

/** Mirrors the Account.status enum in the data model. */
export type AccountStatus = 'active' | 'suspended' | 'closed';

export interface Account {
  accountId: string;
  userId: string;
  type: AccountType;
  status: AccountStatus;
  cashBalance: number;
  currency: string;
  niNumber?: string; // ISA only — encrypted in production
  createdAt: string;
}

export interface CreateAccountParams {
  type: AccountType;
  niNumber?: string; // ISA only — collected on ni-number screen, encrypted in production
}

// ─── Mock config ──────────────────────────────────────────────────────────────

/** Simulated network latency (ms) for mock API calls. */
const MOCK_DELAY_MS = 600;

// ─── Session state ─────────────────────────────────────────────────────────
// In a real app this would be persisted to Supabase against the Account row.
// A user may hold multiple accounts (1:Many per data model), so we store an array.

let _sessionAccounts: Account[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const mockUUID = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

// ─── Service ──────────────────────────────────────────────────────────────────

export const accountService = {
  /**
   * Creates a new account of the given type for the current user.
   *
   * MOCK: stores the account in module-level session state.
   * NI number is not required here in the mock — it is collected on the
   * ni-number screen after account creation and encrypted in production.
   *
   * PRODUCTION SWAP:
   *   const { data, error } = await supabase
   *     .from('accounts')
   *     .insert({
   *       user_id: userId,
   *       type: params.type,
   *       status: 'active',
   *       cash_balance: 0,
   *       currency: 'GBP',
   *       // ni_number is encrypted server-side via a Supabase edge function
   *       // — never pass it directly to the client-side supabase insert.
   *     })
   *     .select()
   *     .single();
   *   if (error) throw error;
   *   return mapRowToAccount(data);
   *
   * NI number encryption note:
   *   After account creation, POST ni_number to a dedicated edge function:
   *   POST /api/account/set-ni-number
   *   { accountId, niNumber }
   *   The edge function encrypts with pgcrypto before writing to the DB.
   *   The plain-text value should never travel through the standard
   *   Supabase client insert path.
   */
  async createAccount(params: CreateAccountParams): Promise<Account> {
    await delay(MOCK_DELAY_MS);

    // Guard: one account per type per user at MVP
    const existing = _sessionAccounts.find((a) => a.type === params.type);
    if (existing) {
      console.log('[Account mock] Account of this type already exists:', existing.accountId);
      return existing;
    }

    const account: Account = {
      accountId: mockUUID(),
      userId: 'mock_user_id',
      type: params.type,
      status: 'active',
      cashBalance: 0,
      currency: 'GBP',
      niNumber: params.niNumber, // undefined until ni-number screen; encrypted in production
      createdAt: new Date().toISOString(),
    };

    _sessionAccounts.push(account);
    console.log('[Account mock] Account created:', account.accountId, account.type);
    return account;
  },

  /**
   * Returns all accounts for the current user.
   *
   * PRODUCTION SWAP:
   *   const { data, error } = await supabase
   *     .from('accounts')
   *     .select('*')
   *     .eq('user_id', userId)
   *     .eq('status', 'active');
   *   if (error) throw error;
   *   return data.map(mapRowToAccount);
   */
  async getAccounts(): Promise<Account[]> {
    await delay(MOCK_DELAY_MS);
    return [..._sessionAccounts];
  },

  /**
   * Returns a single account by ID.
   *
   * PRODUCTION SWAP:
   *   const { data, error } = await supabase
   *     .from('accounts')
   *     .select('*')
   *     .eq('account_id', accountId)
   *     .single();
   *   if (error) throw error;
   *   return mapRowToAccount(data);
   */
  async getAccount(accountId: string): Promise<Account | null> {
    await delay(200);
    return _sessionAccounts.find((a) => a.accountId === accountId) ?? null;
  },

  /**
   * Checks whether the user already holds an account of a given type.
   * Used to prevent duplicate ISA / GIA creation at the selection screen.
   *
   * PRODUCTION SWAP:
   *   const { count } = await supabase
   *     .from('accounts')
   *     .select('*', { count: 'exact', head: true })
   *     .eq('user_id', userId)
   *     .eq('type', type);
   *   return (count ?? 0) > 0;
   */
  async hasAccountOfType(type: AccountType): Promise<boolean> {
    await delay(200);
    return _sessionAccounts.some((a) => a.type === type);
  },

  /**
   * Resets mock session state.
   * Useful for development and testing — not needed in production.
   */
  resetMock(): void {
    _sessionAccounts = [];
    console.log('[Account mock] State reset');
  },
};