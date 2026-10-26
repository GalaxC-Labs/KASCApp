begin;

-- 1. Add invoice_no column to stock_movements
alter table public.stock_movements
  add column if not exists invoice_no text not null default '';

-- 2. Update adjust_stock to accept invoice_no
drop function if exists public.adjust_stock(uuid, numeric, text, text);

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_quantity_delta numeric,
  p_movement_type text,
  p_note text default '',
  p_invoice_no text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_product public.products%rowtype;
begin
  if v_uid is null or not public.is_owner() then
    raise exception 'Owner only' using errcode = '42501';
  end if;
  if p_movement_type not in ('opening','purchase','purchase_return','adjustment') then
    raise exception 'Invalid movement type for manual adjustment' using errcode = '22023';
  end if;
  if p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'Quantity delta cannot be zero' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if v_product.stock_qty + p_quantity_delta < 0 then
    raise exception 'Adjustment would make stock negative (on hand %)',
      v_product.stock_qty using errcode = '23514';
  end if;

  update public.products
    set stock_qty = stock_qty + p_quantity_delta,
        low_stock_ignored = case
          when stock_qty + p_quantity_delta > reorder_level then false
          else low_stock_ignored
        end,
        low_stock_ignore_note = case
          when stock_qty + p_quantity_delta > reorder_level then ''
          else low_stock_ignore_note
        end,
        low_stock_ignored_at = case
          when stock_qty + p_quantity_delta > reorder_level then null
          else low_stock_ignored_at
        end,
        low_stock_ignored_by = case
          when stock_qty + p_quantity_delta > reorder_level then null
          else low_stock_ignored_by
        end
    where id = p_product_id;

  insert into public.stock_movements(
    product_id, movement_type, quantity_delta,
    reference_type, reference_id, note, invoice_no, created_by
  ) values (
    p_product_id, p_movement_type, p_quantity_delta,
    'manual', null, coalesce(p_note, ''), coalesce(trim(p_invoice_no), ''), v_uid
  );

  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
  values (v_uid, 'stock.adjust', 'product', p_product_id::text,
          jsonb_build_object('delta', p_quantity_delta, 'type', p_movement_type,
                             'note', p_note, 'invoice_no', p_invoice_no));

  return jsonb_build_object(
    'product_id', p_product_id,
    'stock_qty', v_product.stock_qty + p_quantity_delta
  );
end;
$$;

revoke all on function public.adjust_stock(uuid, numeric, text, text, text) from public, anon;
grant execute on function public.adjust_stock(uuid, numeric, text, text, text) to authenticated;

-- 3. Stock ledger RPC
create or replace function public.get_stock_ledger(
  p_product_id uuid default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  movement_id uuid,
  movement_date timestamptz,
  invoice_no text,
  movement_type text,
  product_id uuid,
  product_name text,
  product_unit text,
  quantity_delta numeric,
  received numeric,
  sales numeric,
  open_stock numeric,
  remaining_stock numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select sm.product_id, coalesce(sum(sm.quantity_delta), 0) as baseline
    from public.stock_movements sm
    where (p_product_id is null or sm.product_id = p_product_id)
      and (p_date_from is null or sm.created_at < p_date_from)
    group by sm.product_id
  ),
  filtered as (
    select sm.*
    from public.stock_movements sm
    where (p_product_id is null or sm.product_id = p_product_id)
      and (p_date_from is null or sm.created_at >= p_date_from)
      and (p_date_to is null or sm.created_at <= p_date_to)
  ),
  augmented as (
    select
      sm.id as movement_id,
      sm.created_at as movement_date,
      case
        when sm.reference_type = 'sale' then s.bill_no
        else coalesce(nullif(sm.invoice_no, ''), sm.note, '')
      end as invoice_no,
      sm.movement_type,
      sm.product_id,
      p.name as product_name,
      p.unit as product_unit,
      sm.quantity_delta,
      greatest(sm.quantity_delta, 0) as received,
      case when sm.quantity_delta < 0 then abs(sm.quantity_delta) else 0 end as sales,
      coalesce(b.baseline, 0) as baseline
    from filtered sm
    join public.products p on p.id = sm.product_id
    left join public.sales s on sm.reference_type = 'sale' and sm.reference_id = s.id
    left join base b on b.product_id = sm.product_id
  )
  select
    movement_id,
    movement_date,
    invoice_no,
    movement_type,
    product_id,
    product_name,
    product_unit,
    quantity_delta,
    received,
    sales,
    baseline + sum(quantity_delta) over (
      partition by product_id order by movement_date, movement_id
    ) - quantity_delta as open_stock,
    baseline + sum(quantity_delta) over (
      partition by product_id order by movement_date, movement_id
    ) as remaining_stock
  from augmented
  order by movement_date desc, movement_id desc;
$$;

revoke all on function public.get_stock_ledger(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_stock_ledger(uuid, timestamptz, timestamptz) to authenticated;

commit;