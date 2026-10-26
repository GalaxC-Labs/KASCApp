import type { SupabaseClient } from '@supabase/supabase-js';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type SaleStatus = 'completed' | 'voided';
export type Role = 'owner' | 'employee';

export interface SaleItemInput {
  product_id: string;
  quantity: number;
}

export interface CreateSaleResult {
  sale_id: string;
  bill_no: string;
  subtotal: number;
  discount: number;
  total: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  idempotent?: boolean;
}

export class KascError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function asKascError(e: unknown): KascError {
  const anyE = e as { code?: string; message?: string; error_description?: string };
  return new KascError(
    anyE?.code ?? 'unknown',
    anyE?.message ?? anyE?.error_description ?? 'Unknown error',
  );
}

export function makeKasc(supabase: SupabaseClient) {
  return {
    async createSale(input: {
      items: SaleItemInput[];
      customerName?: string;
      customerPhone?: string;
      discount?: number;
      amountPaid?: number;
      clientRef?: string;
    }): Promise<CreateSaleResult> {
      const { data, error } = await supabase.rpc('create_sale', {
        p_items: input.items,
        p_customer_name: input.customerName ?? 'Walk-in customer',
        p_customer_phone: input.customerPhone ?? '',
        p_discount: input.discount ?? 0,
        p_amount_paid: input.amountPaid ?? 0,
        p_client_ref: input.clientRef ?? crypto.randomUUID(),
      });
      if (error) throw asKascError(error);
      return data as CreateSaleResult;
    },

    async recordPayment(saleId: string, amount: number, note = '') {
      const { data, error } = await supabase.rpc('record_payment', {
        p_sale_id: saleId, p_amount: amount, p_note: note,
      });
      if (error) throw asKascError(error);
      return data as { sale_id: string; amount_paid: number; payment_status: PaymentStatus };
    },

    async recordRefund(saleId: string, amount: number, note = '') {
      const { data, error } = await supabase.rpc('record_refund', {
        p_sale_id: saleId, p_amount: amount, p_note: note,
      });
      if (error) throw asKascError(error);
      return data as { sale_id: string; refunded_amount: number; net_paid: number };
    },

    async voidSale(saleId: string, reason: string) {
      const { data, error } = await supabase.rpc('void_sale', {
        p_sale_id: saleId, p_reason: reason,
      });
      if (error) throw asKascError(error);
      return data as { sale_id: string; status: 'voided' };
    },
    async setUserRole(userId: string, role: Role) {
      const { data, error } = await supabase.rpc('set_user_role', {
        p_user_id: userId, p_role: role,
      });
      if (error) throw asKascError(error);
      return data as { user_id: string; role: Role };
    },

    async setUserActive(userId: string, active: boolean) {
      const { data, error } = await supabase.rpc('set_user_active', {
        p_user_id: userId, p_active: active,
      });
      if (error) throw asKascError(error);
      return data as { user_id: string; active: boolean };
    },

    async setUserDisplayName(userId: string, name: string) {
      const { data, error } = await supabase.rpc('set_user_display_name', {
        p_user_id: userId, p_name: name,
      });
      if (error) throw asKascError(error);
      return data as { user_id: string; display_name: string };
    },
    async updateAppSettings(input: {
      shopName: string;
      shopAddress: string;
      shopPhone: string;
      billFooter: string;
      unpaidDaysThreshold: number;
    }) {
      const { data, error } = await supabase.rpc('update_app_settings', {
        p_shop_name: input.shopName,
        p_shop_address: input.shopAddress,
        p_shop_phone: input.shopPhone,
        p_bill_footer: input.billFooter,
        p_unpaid_days_threshold: input.unpaidDaysThreshold,
      });
      if (error) throw asKascError(error);
      return data as { ok: boolean };
    },
    
    async ignoreLowStock(productId: string, note: string) {
      const { data, error } = await supabase.rpc('ignore_low_stock', {
        p_product_id: productId, p_note: note,
      });
      if (error) throw asKascError(error);
      return data as { ok: boolean };
    },

    async unignoreLowStock(productId: string) {
      const { data, error } = await supabase.rpc('unignore_low_stock', {
        p_product_id: productId,
      });
      if (error) throw asKascError(error);
      return data as { ok: boolean };
    },

    async adjustStock(input: {
      productId: string;
      delta: number;
      movementType: 'opening' | 'purchase' | 'purchase_return' | 'adjustment';
      note?: string;
    }) {
      const { data, error } = await supabase.rpc('adjust_stock', {
        p_product_id: input.productId,
        p_quantity_delta: input.delta,
        p_movement_type: input.movementType,
        p_note: input.note ?? '',
      });
      if (error) throw asKascError(error);
      return data as { product_id: string; stock_qty: number };
    },

    async currentProfile() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, role, active')
        .eq('user_id', auth.user.id)
        .single();
      if (error) return null;
      return data as { user_id: string; display_name: string; role: Role; active: boolean };
    },
  };
}
