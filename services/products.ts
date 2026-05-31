/**
 * services/products.ts
 *
 * Product data service for Butterfly Trading.
 *
 * Architecture
 * ────────────
 * Unlike kyc.ts and account.ts, this service is not mocked — it reads
 * directly from the Supabase products table which is seeded with real data.
 *
 * Data model alignment (from Butterfly_Data_Model_Architecture.docx):
 *   Product.type          →  ProductType below ('ETF' | 'equity')
 *   Product.status        →  'active' | 'suspended' | 'removed'
 *   Product.sdg_tags      →  integer array of UN SDG numbers
 *   Product.esg_gate_passed / vol_gate_passed / ai_gate_passed → screening gates
 */

import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductType = 'ETF' | 'equity';

export interface Product {
  productId: string;
  isin: string;
  ticker: string;
  name: string;
  type: ProductType;
  esgIndex: string;
  sdgTags: number[];
  esgGatePassed: boolean;
  volGatePassed: boolean;
  aiGatePassed: boolean;
  volatility12m: number | null;
  maxDrawdown12m: number | null;
  aumGbp: number | null;
  ter: number | null;
  status: string;
  createdAt: string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRow = (row: any): Product => ({
  productId: row.product_id,
  isin: row.isin,
  ticker: row.ticker,
  name: row.name,
  type: row.type as ProductType,
  esgIndex: row.esg_index,
  sdgTags: row.sdg_tags ?? [],
  esgGatePassed: row.esg_gate_passed,
  volGatePassed: row.vol_gate_passed,
  aiGatePassed: row.ai_gate_passed,
  volatility12m: row.volatility_12m,
  maxDrawdown12m: row.max_drawdown_12m,
  aumGbp: row.aum_gbp,
  ter: row.ter,
  status: row.status,
  createdAt: row.created_at,
});

// ─── Service ──────────────────────────────────────────────────────────────────

export const productService = {
  /**
   * Returns all active products, ordered ETFs first then equities,
   * alphabetically by ticker within each group.
   */
  async getProducts(): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('status', 'active')
      .order('type', { ascending: false }) // ETF before equity alphabetically
      .order('ticker', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  /**
   * Returns a single product by ID.
   */
  async getProduct(productId: string): Promise<Product | null> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('product_id', productId)
      .single();

    if (error) throw error;
    return data ? mapRow(data) : null;
  },

  /**
   * Returns products filtered by type.
   */
  async getProductsByType(type: ProductType): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('status', 'active')
      .eq('type', type)
      .order('ticker', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(mapRow);
  },

  /**
   * Returns products that are aligned with a specific SDG.
   * Uses Postgres array containment operator via filter.
   */
  async getProductsBySdg(sdg: number): Promise<Product[]> {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('status', 'active')
      .contains('sdg_tags', [sdg])
      .order('ticker', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(mapRow);
  },
};