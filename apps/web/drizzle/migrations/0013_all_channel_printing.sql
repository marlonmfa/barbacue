-- Capture new orders from every integration at the database boundary.
-- Totem and QR retain their existing transactional version-1 ticket writer.
-- No historical order is backfilled or printed by applying this migration.
CREATE OR REPLACE FUNCTION enqueue_integrated_order_print() RETURNS trigger AS $$
DECLARE
  table_number integer;
  table_label text;
BEGIN
  IF NEW.channel IN ('kiosk', 'table_qr') OR NEW.status IN ('cancelled', 'delivered') THEN
    RETURN NEW;
  END IF;
  SELECT number, label INTO table_number, table_label FROM restaurant_tables WHERE id = NEW.table_id;
  INSERT INTO kitchen_print_jobs (order_id, ticket)
  VALUES (NEW.id, jsonb_build_object(
    'version', 2,
    'orderId', NEW.id,
    'orderNumber', upper(left(NEW.id::text, 8)),
    'brand', NEW.brand,
    'channel', coalesce(nullif(NEW.channel, ''), 'other'),
    'orderType', NEW.order_type,
    'tableNumber', table_number,
    'tableLabel', table_label,
    'customerName', NEW.customer_name,
    'customerPhone', NEW.customer_phone,
    'deliveryAddress', NEW.delivery_address,
    'items', NEW.items,
    'notes', NEW.notes,
    'createdAt', coalesce(NEW.created_at, now()),
    'status', coalesce(NEW.status::text, 'pending'),
    'subtotalCents', NEW.subtotal_cents,
    'discountCents', coalesce(NEW.discount_cents, 0),
    'deliveryFeeCents', NEW.delivery_fee_cents,
    'totalCents', NEW.total_cents,
    'changeForCents', NEW.change_for_cents,
    'payment', jsonb_build_object('method', NEW.payment_method, 'status', coalesce(NEW.payment_status::text, 'pending'), 'label', 'Situacao no recebimento'),
    'reprint', false
  )) ON CONFLICT (order_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER orders_print_on_insert AFTER INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION enqueue_integrated_order_print();
