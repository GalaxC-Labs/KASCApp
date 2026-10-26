import type { SupabaseClient } from '@supabase/supabase-js';

export type AppSettings = {
  shop_name: string;
  shop_address: string;
  shop_phone: string;
  shop_gstin: string;
  bill_footer: string;
  unpaid_days_threshold: number;
};

export const defaultSettings: AppSettings = {
  shop_name: 'Karthi Agro Service Centre',
  shop_address: '',
  shop_phone: '',
  shop_gstin: '',
  bill_footer: 'Thank you for your business.',
  unpaid_days_threshold: 7,
};

export async function loadAppSettings(
  supabase: SupabaseClient,
): Promise<AppSettings> {
  const { data } = await supabase
    .from('app_settings')
    .select('shop_name, shop_address, shop_phone, shop_gstin, bill_footer, unpaid_days_threshold')
    .eq('id', 1)
    .maybeSingle();
  return (data as AppSettings | null) ?? defaultSettings;
}