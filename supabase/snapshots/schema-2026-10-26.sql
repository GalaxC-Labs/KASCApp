--
-- PostgreSQL database dump
--

\restrict 9HLBDMT0auZNNVXifQ4i8a0K03tToaQPXxy3drcRuoOMmLVusfWEJWR7gNL4cyI

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'owner',
    'employee'
);


--
-- Name: adjust_stock(uuid, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.adjust_stock(p_product_id uuid, p_quantity_delta numeric, p_movement_type text, p_note text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$

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

    set stock_qty = stock_qty + p_quantity_delta

    where id = p_product_id;



  insert into public.stock_movements(

    product_id, movement_type, quantity_delta,

    reference_type, reference_id, note, created_by

  )

  values (

    p_product_id, p_movement_type, p_quantity_delta,

    'manual', null, coalesce(p_note, ''), v_uid

  );



  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)

  values (

    v_uid, 'stock.adjust', 'product', p_product_id::text,

    jsonb_build_object('delta', p_quantity_delta, 'type', p_movement_type, 'note', p_note)

  );



  return jsonb_build_object(

    'product_id', p_product_id,

    'stock_qty', v_product.stock_qty + p_quantity_delta

  );

end;

$$;


--
-- Name: create_sale(jsonb, text, numeric, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_sale(p_items jsonb, p_customer_name text DEFAULT 'Walk-in customer'::text, p_discount numeric DEFAULT 0, p_amount_paid numeric DEFAULT 0, p_client_ref text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$

declare

  v_uid uuid := auth.uid();

  v_sale_id uuid;

  v_bill_no text;

  v_subtotal numeric(12,2) := 0;

  v_total numeric(12,2);

  v_payment text;

  v_line_total numeric(12,2);

  v_qty numeric(14,3);

  v_item record;

  v_product public.products%rowtype;

begin

  if v_uid is null or not public.is_active_user() then

    raise exception 'Not an active user' using errcode = '42501';

  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'

     or jsonb_array_length(p_items) = 0 then

    raise exception 'Sale must contain at least one item' using errcode = '22023';

  end if;

  if exists (

    select 1 from jsonb_array_elements(p_items) e

    where (e ->> 'product_id') is null or (e ->> 'quantity') is null

  ) then

    raise exception 'Each item needs product_id and quantity' using errcode = '22023';

  end if;

  if p_discount is null or p_discount < 0 then

    raise exception 'Discount cannot be negative' using errcode = '22023';

  end if;

  if p_amount_paid is null or p_amount_paid < 0 then

    raise exception 'Amount paid cannot be negative' using errcode = '22023';

  end if;



  for v_product in

    select p.* from public.products p

    where p.id in (

      select distinct (e ->> 'product_id')::uuid

      from jsonb_array_elements(p_items) e

    )

    order by p.id for update

  loop

    select coalesce(sum((e ->> 'quantity')::numeric), 0)

      into v_qty

      from jsonb_array_elements(p_items) e

      where (e ->> 'product_id')::uuid = v_product.id;

    if v_qty <= 0 then

      raise exception 'Quantity for % must be positive', v_product.name using errcode = '22023';

    end if;

    if not v_product.is_active then

      raise exception 'Product % is inactive', v_product.name using errcode = '23514';

    end if;

    if v_product.stock_qty < v_qty then

      raise exception 'Insufficient stock for % (on hand %, requested %)',

        v_product.name, v_product.stock_qty, v_qty using errcode = '23514';

    end if;

  end loop;



  for v_item in

    select (e ->> 'product_id')::uuid as product_id,

           (e ->> 'quantity')::numeric as quantity

    from jsonb_array_elements(p_items) with ordinality as t(e, ord)

    order by ord

  loop

    select * into v_product from public.products where id = v_item.product_id;

    if not found then

      raise exception 'Product % not found', v_item.product_id using errcode = '23503';

    end if;

    v_line_total := round(v_product.selling_price * v_item.quantity, 2);

    v_subtotal := v_subtotal + v_line_total;

  end loop;



  v_total := round(v_subtotal - p_discount, 2);

  if v_total < 0 then

    raise exception 'Discount exceeds subtotal' using errcode = '22023';

  end if;

  if p_amount_paid > v_total then

    raise exception 'Amount paid (%) exceeds total (%)', p_amount_paid, v_total

      using errcode = '22023';

  end if;



  v_payment := case

    when v_total = 0 then 'paid'

    when p_amount_paid <= 0 then 'unpaid'

    when p_amount_paid >= v_total then 'paid'

    else 'partial'

  end;



  insert into public.sales(

    bill_no, employee_id, customer_name, subtotal, discount, total,

    amount_paid, payment_status, client_ref

  ) values (

    'INV-' || to_char(now(), 'YYYYMMDD') || '-' ||

      lpad(nextval('public.bill_no_seq')::text, 6, '0'),

    v_uid, coalesce(nullif(trim(p_customer_name), ''), 'Walk-in customer'),

    v_subtotal, p_discount, v_total, p_amount_paid, v_payment, p_client_ref

  )

  on conflict (client_ref) where client_ref is not null do nothing

  returning id, bill_no into v_sale_id, v_bill_no;



  if v_sale_id is null then

    select id, bill_no into v_sale_id, v_bill_no

      from public.sales where client_ref = p_client_ref;

    return jsonb_build_object('sale_id', v_sale_id, 'bill_no', v_bill_no,

                              'idempotent', true);

  end if;



  for v_item in

    select (e ->> 'product_id')::uuid as product_id,

           (e ->> 'quantity')::numeric as quantity

    from jsonb_array_elements(p_items) with ordinality as t(e, ord)

    order by ord

  loop

    select * into v_product from public.products where id = v_item.product_id;

    v_line_total := round(v_product.selling_price * v_item.quantity, 2);



    insert into public.sale_items(

      sale_id, product_id, product_name_snapshot, quantity, unit_price, line_total

    ) values (

      v_sale_id, v_product.id, v_product.name,

      v_item.quantity, v_product.selling_price, v_line_total

    );



    update public.products

      set stock_qty = stock_qty - v_item.quantity

      where id = v_product.id;



    insert into public.stock_movements(

      product_id, movement_type, quantity_delta, reference_type,

      reference_id, note, created_by

    ) values (

      v_product.id, 'sale', -v_item.quantity, 'sale', v_sale_id, '', v_uid

    );

  end loop;



  if p_amount_paid > 0 then

    insert into public.payments(sale_id, amount, recorded_by, note)

    values (v_sale_id, p_amount_paid, v_uid, 'Initial payment');

  end if;



  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)

  values (

    v_uid, 'sale.create', 'sale', v_sale_id::text,

    jsonb_build_object(

      'bill_no', v_bill_no, 'total', v_total,

      'amount_paid', p_amount_paid, 'items', jsonb_array_length(p_items)

    )

  );



  return jsonb_build_object(

    'sale_id', v_sale_id, 'bill_no', v_bill_no,

    'subtotal', v_subtotal, 'discount', p_discount, 'total', v_total,

    'amount_paid', p_amount_paid, 'payment_status', v_payment

  );

end;

$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$

begin

  insert into public.profiles(user_id, display_name, role)

  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name',''), 'employee')

  on conflict (user_id) do nothing;

  return new;

end;

$$;


--
-- Name: is_active_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_active_user() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$

  select exists (

    select 1 from public.profiles p

    where p.user_id = auth.uid() and p.active = true

  );

$$;


--
-- Name: is_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_owner() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$

  select exists (

    select 1 from public.profiles p

    where p.user_id = auth.uid() and p.active = true and p.role = 'owner'

  );

$$;


--
-- Name: record_payment(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_payment(p_sale_id uuid, p_amount numeric, p_note text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$

declare

  v_uid uuid := auth.uid();

  v_sale public.sales%rowtype;

  v_new_paid numeric(12,2);

  v_status text;

begin

  if v_uid is null or not public.is_active_user() then

    raise exception 'Not an active user' using errcode = '42501';

  end if;

  if p_amount is null or p_amount <= 0 then

    raise exception 'Payment amount must be positive' using errcode = '22023';

  end if;



  select * into v_sale from public.sales where id = p_sale_id for update;

  if not found then

    raise exception 'Sale not found' using errcode = 'P0002';

  end if;

  if not public.is_owner() and v_sale.employee_id <> v_uid then

    raise exception 'Not allowed to record payment on this sale' using errcode = '42501';

  end if;

  if v_sale.status = 'voided' then

    raise exception 'Cannot record payment on a voided sale' using errcode = '22023';

  end if;

  if v_sale.amount_paid + p_amount > v_sale.total then

    raise exception 'Payment exceeds remaining balance (remaining %)',

      v_sale.total - v_sale.amount_paid using errcode = '22023';

  end if;



  v_new_paid := v_sale.amount_paid + p_amount;

  v_status := case

    when v_new_paid >= v_sale.total then 'paid'

    when v_new_paid > 0 then 'partial'

    else 'unpaid'

  end;



  update public.sales

    set amount_paid = v_new_paid, payment_status = v_status

    where id = p_sale_id;



  insert into public.payments(sale_id, amount, recorded_by, note)

  values (p_sale_id, p_amount, v_uid, coalesce(p_note, ''));



  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)

  values (

    v_uid, 'sale.payment', 'sale', p_sale_id::text,

    jsonb_build_object(

      'amount', p_amount, 'new_paid', v_new_paid,

      'status', v_status, 'note', p_note

    )

  );



  return jsonb_build_object(

    'sale_id', p_sale_id,

    'amount_paid', v_new_paid,

    'payment_status', v_status

  );

end;

$$;


--
-- Name: record_refund(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_refund(p_sale_id uuid, p_amount numeric, p_note text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$

declare

  v_uid uuid := auth.uid();

  v_sale public.sales%rowtype;

  v_new_refunded numeric(12,2);

begin

  if v_uid is null or not public.is_active_user() then

    raise exception 'Not an active user' using errcode = '42501';

  end if;

  if p_amount is null or p_amount <= 0 then

    raise exception 'Refund amount must be positive' using errcode = '22023';

  end if;



  select * into v_sale from public.sales where id = p_sale_id for update;

  if not found then

    raise exception 'Sale not found' using errcode = 'P0002';

  end if;

  if not public.is_owner() and v_sale.employee_id <> v_uid then

    raise exception 'Not allowed to refund this sale' using errcode = '42501';

  end if;

  if v_sale.status = 'voided' then

    raise exception 'Cannot refund a voided sale (refund it before voiding)'

      using errcode = '22023';

  end if;

  if p_amount > (v_sale.amount_paid - v_sale.refunded_amount) then

    raise exception 'Refund (%) exceeds refundable balance (%)',

      p_amount, v_sale.amount_paid - v_sale.refunded_amount

      using errcode = '22023';

  end if;



  v_new_refunded := v_sale.refunded_amount + p_amount;



  update public.sales

    set refunded_amount = v_new_refunded

    where id = p_sale_id;



  insert into public.refunds(sale_id, amount, recorded_by, note)

  values (p_sale_id, p_amount, v_uid, coalesce(p_note, ''));



  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)

  values (

    v_uid, 'sale.refund', 'sale', p_sale_id::text,

    jsonb_build_object(

      'amount', p_amount, 'total_refunded', v_new_refunded,

      'note', p_note

    )

  );



  return jsonb_build_object(

    'sale_id', p_sale_id,

    'refunded_amount', v_new_refunded,

    'net_paid', v_sale.amount_paid - v_new_refunded

  );

end;

$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: set_user_active(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_active(p_user_id uuid, p_active boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$

declare

  v_uid uuid := auth.uid();

  v_target public.profiles%rowtype;

begin

  if v_uid is null or not public.is_owner() then

    raise exception 'Owner only' using errcode = '42501';

  end if;

  if v_uid = p_user_id then

    raise exception 'You cannot deactivate yourself' using errcode = '22023';

  end if;

  select * into v_target from public.profiles where user_id = p_user_id for update;

  if not found then

    raise exception 'User not found' using errcode = 'P0002';

  end if;

  update public.profiles set active = p_active where user_id = p_user_id;

  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)

  values (v_uid, 'user.active', 'profile', p_user_id::text,

          jsonb_build_object('active', p_active));

  return jsonb_build_object('user_id', p_user_id, 'active', p_active);

end;

$$;


--
-- Name: set_user_display_name(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_display_name(p_user_id uuid, p_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$

declare

  v_uid uuid := auth.uid();

begin

  if v_uid is null or not public.is_owner() then

    raise exception 'Owner only' using errcode = '42501';

  end if;

  if p_name is null or length(trim(p_name)) = 0 then

    raise exception 'Display name cannot be empty' using errcode = '22023';

  end if;

  update public.profiles set display_name = trim(p_name) where user_id = p_user_id;

  if not found then

    raise exception 'User not found' using errcode = 'P0002';

  end if;

  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)

  values (v_uid, 'user.rename', 'profile', p_user_id::text,

          jsonb_build_object('name', trim(p_name)));

  return jsonb_build_object('user_id', p_user_id, 'display_name', trim(p_name));

end;

$$;


--
-- Name: set_user_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_role(p_user_id uuid, p_role public.app_role) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$

declare

  v_uid uuid := auth.uid();

  v_target public.profiles%rowtype;

begin

  if v_uid is null or not public.is_owner() then

    raise exception 'Owner only' using errcode = '42501';

  end if;

  if v_uid = p_user_id then

    raise exception 'You cannot change your own role' using errcode = '22023';

  end if;

  select * into v_target from public.profiles where user_id = p_user_id for update;

  if not found then

    raise exception 'User not found' using errcode = 'P0002';

  end if;

  if v_target.role = p_role then

    return jsonb_build_object('user_id', p_user_id, 'role', p_role, 'unchanged', true);

  end if;

  update public.profiles set role = p_role where user_id = p_user_id;

  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)

  values (v_uid, 'user.role', 'profile', p_user_id::text,

          jsonb_build_object('from', v_target.role, 'to', p_role));

  return jsonb_build_object('user_id', p_user_id, 'role', p_role);

end;

$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$

begin

  new.updated_at := now();

  return new;

end;

$$;


--
-- Name: void_sale(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.void_sale(p_sale_id uuid, p_reason text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$

declare

  v_uid uuid := auth.uid();

  v_sale public.sales%rowtype;

  v_item record;

begin

  if v_uid is null or not public.is_active_user() then

    raise exception 'Not an active user' using errcode = '42501';

  end if;



  select * into v_sale from public.sales where id = p_sale_id for update;

  if not found then

    raise exception 'Sale not found' using errcode = 'P0002';

  end if;

  if not public.is_owner() and v_sale.employee_id <> v_uid then

    raise exception 'Not allowed to void this sale' using errcode = '42501';

  end if;

  if v_sale.status = 'voided' then

    raise exception 'Sale is already voided' using errcode = '22023';

  end if;

  if v_sale.amount_paid > v_sale.refunded_amount then

    raise exception 'Refund outstanding balance (%) before voiding',

      v_sale.amount_paid - v_sale.refunded_amount

      using errcode = '22023';

  end if;



  for v_item in

    select product_id, quantity from public.sale_items where sale_id = p_sale_id

  loop

    update public.products

      set stock_qty = stock_qty + v_item.quantity

      where id = v_item.product_id;



    insert into public.stock_movements(

      product_id, movement_type, quantity_delta, reference_type,

      reference_id, note, created_by

    ) values (

      v_item.product_id, 'sale_return', v_item.quantity,

      'sale', p_sale_id, coalesce(p_reason, ''), v_uid

    );

  end loop;



  update public.sales set status = 'voided' where id = p_sale_id;



  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)

  values (

    v_uid, 'sale.void', 'sale', p_sale_id::text,

    jsonb_build_object('bill_no', v_sale.bill_no, 'reason', p_reason)

  );



  return jsonb_build_object('sale_id', p_sale_id, 'status', 'voided');

end;

$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: bill_no_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bill_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    recorded_by uuid NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: product_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_costs (
    product_id uuid NOT NULL,
    cost_price numeric(12,2) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_costs_cost_price_check CHECK ((cost_price >= (0)::numeric))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sku text,
    name text NOT NULL,
    category text DEFAULT 'General'::text NOT NULL,
    unit text DEFAULT 'bag'::text NOT NULL,
    selling_price numeric(12,2) DEFAULT 0 NOT NULL,
    stock_qty numeric(14,3) DEFAULT 0 NOT NULL,
    reorder_level numeric(14,3) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT products_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT products_reorder_level_check CHECK ((reorder_level >= (0)::numeric)),
    CONSTRAINT products_selling_price_check CHECK ((selling_price >= (0)::numeric)),
    CONSTRAINT products_stock_qty_check CHECK ((stock_qty >= (0)::numeric))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    user_id uuid NOT NULL,
    display_name text DEFAULT ''::text NOT NULL,
    role public.app_role DEFAULT 'employee'::public.app_role NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    recorded_by uuid NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT refunds_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: sale_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name_snapshot text NOT NULL,
    quantity numeric(14,3) NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    line_total numeric(12,2) NOT NULL,
    CONSTRAINT sale_items_line_total_check CHECK ((line_total >= (0)::numeric)),
    CONSTRAINT sale_items_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT sale_items_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bill_no text NOT NULL,
    employee_id uuid NOT NULL,
    customer_name text DEFAULT 'Walk-in customer'::text NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    discount numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) NOT NULL,
    amount_paid numeric(12,2) DEFAULT 0 NOT NULL,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_ref text,
    refunded_amount numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT sales_amount_paid_check CHECK ((amount_paid >= (0)::numeric)),
    CONSTRAINT sales_discount_check CHECK ((discount >= (0)::numeric)),
    CONSTRAINT sales_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text]))),
    CONSTRAINT sales_refunded_amount_check CHECK ((refunded_amount >= (0)::numeric)),
    CONSTRAINT sales_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'voided'::text]))),
    CONSTRAINT sales_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT sales_total_check CHECK ((total >= (0)::numeric))
);


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    movement_type text NOT NULL,
    quantity_delta numeric(14,3) NOT NULL,
    reference_type text,
    reference_id uuid,
    note text DEFAULT ''::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stock_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['opening'::text, 'purchase'::text, 'sale'::text, 'sale_return'::text, 'purchase_return'::text, 'adjustment'::text]))),
    CONSTRAINT stock_movements_quantity_delta_check CHECK ((quantity_delta <> (0)::numeric))
);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: product_costs product_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_costs
    ADD CONSTRAINT product_costs_pkey PRIMARY KEY (product_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- Name: sales sales_bill_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_bill_no_key UNIQUE (bill_no);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: payments_recorded_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_recorded_idx ON public.payments USING btree (recorded_by, created_at DESC);


--
-- Name: payments_sale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_sale_idx ON public.payments USING btree (sale_id, created_at DESC);


--
-- Name: refunds_recorded_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refunds_recorded_idx ON public.refunds USING btree (recorded_by, created_at DESC);


--
-- Name: refunds_sale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refunds_sale_idx ON public.refunds USING btree (sale_id, created_at DESC);


--
-- Name: sale_items_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_items_product_idx ON public.sale_items USING btree (product_id);


--
-- Name: sale_items_sale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sale_items_sale_idx ON public.sale_items USING btree (sale_id);


--
-- Name: sales_client_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sales_client_ref_key ON public.sales USING btree (client_ref) WHERE (client_ref IS NOT NULL);


--
-- Name: sales_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_created_idx ON public.sales USING btree (created_at DESC);


--
-- Name: sales_employee_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sales_employee_created_idx ON public.sales USING btree (employee_id, created_at DESC);


--
-- Name: stock_movements_product_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_product_created_idx ON public.stock_movements USING btree (product_id, created_at DESC);


--
-- Name: stock_movements_reference_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movements_reference_idx ON public.stock_movements USING btree (reference_type, reference_id);


--
-- Name: product_costs product_costs_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_costs_touch_updated_at BEFORE UPDATE ON public.product_costs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: products products_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_touch_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: audit_log audit_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(user_id);


--
-- Name: payments payments_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(user_id);


--
-- Name: payments payments_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE RESTRICT;


--
-- Name: product_costs product_costs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_costs
    ADD CONSTRAINT product_costs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refunds refunds_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(user_id);


--
-- Name: refunds refunds_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE RESTRICT;


--
-- Name: sale_items sale_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: sale_items sale_items_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE RESTRICT;


--
-- Name: sales sales_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.profiles(user_id);


--
-- Name: stock_movements stock_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(user_id);


--
-- Name: stock_movements stock_movements_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_log_insert_active_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_insert_active_user ON public.audit_log FOR INSERT TO authenticated WITH CHECK ((public.is_active_user() AND (actor_id = auth.uid())));


--
-- Name: audit_log audit_log_read_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_read_owner ON public.audit_log FOR SELECT TO authenticated USING (public.is_owner());


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_read_owner_or_own_sale; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_read_owner_or_own_sale ON public.payments FOR SELECT TO authenticated USING ((public.is_active_user() AND (public.is_owner() OR (EXISTS ( SELECT 1
   FROM public.sales s
  WHERE ((s.id = payments.sale_id) AND (s.employee_id = auth.uid())))))));


--
-- Name: product_costs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;

--
-- Name: product_costs product_costs_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_costs_insert_owner ON public.product_costs FOR INSERT TO authenticated WITH CHECK (public.is_owner());


--
-- Name: product_costs product_costs_read_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_costs_read_owner ON public.product_costs FOR SELECT TO authenticated USING (public.is_owner());


--
-- Name: product_costs product_costs_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_costs_update_owner ON public.product_costs FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_insert_owner ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_owner());


--
-- Name: products products_read_active_or_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_read_active_or_owner ON public.products FOR SELECT TO authenticated USING ((public.is_active_user() AND ((is_active = true) OR public.is_owner())));


--
-- Name: products products_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_update_owner ON public.products FOR UPDATE TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_read_self_or_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_read_self_or_owner ON public.profiles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_owner()));


--
-- Name: refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: refunds refunds_read_owner_or_own_sale; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY refunds_read_owner_or_own_sale ON public.refunds FOR SELECT TO authenticated USING ((public.is_active_user() AND (public.is_owner() OR (EXISTS ( SELECT 1
   FROM public.sales s
  WHERE ((s.id = refunds.sale_id) AND (s.employee_id = auth.uid())))))));


--
-- Name: sale_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_items sale_items_insert_owner_or_own_sale; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_items_insert_owner_or_own_sale ON public.sale_items FOR INSERT TO authenticated WITH CHECK ((public.is_active_user() AND (public.is_owner() OR (EXISTS ( SELECT 1
   FROM public.sales s
  WHERE ((s.id = sale_items.sale_id) AND (s.employee_id = auth.uid())))))));


--
-- Name: sale_items sale_items_read_owner_or_own_sale; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_items_read_owner_or_own_sale ON public.sale_items FOR SELECT TO authenticated USING ((public.is_active_user() AND (public.is_owner() OR (EXISTS ( SELECT 1
   FROM public.sales s
  WHERE ((s.id = sale_items.sale_id) AND (s.employee_id = auth.uid())))))));


--
-- Name: sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

--
-- Name: sales sales_insert_owner_or_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_insert_owner_or_self ON public.sales FOR INSERT TO authenticated WITH CHECK ((public.is_active_user() AND (public.is_owner() OR (employee_id = auth.uid()))));


--
-- Name: sales sales_read_owner_or_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sales_read_owner_or_own ON public.sales FOR SELECT TO authenticated USING ((public.is_active_user() AND (public.is_owner() OR (employee_id = auth.uid()))));


--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements stock_movements_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_movements_insert_owner ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (public.is_owner());


--
-- Name: stock_movements stock_movements_read_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stock_movements_read_owner ON public.stock_movements FOR SELECT TO authenticated USING (public.is_owner());


--
-- PostgreSQL database dump complete
--

\unrestrict 9HLBDMT0auZNNVXifQ4i8a0K03tToaQPXxy3drcRuoOMmLVusfWEJWR7gNL4cyI

