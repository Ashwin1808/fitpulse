INSERT INTO products (sku, name, description, category, price_cents, stock) VALUES
    ('FPS-DUMBBELL-ADJ', 'Adjustable Dumbbell Set', 'Space-saving pair with quick-lock plates from 5 to 52.5 lb.', 'Strength', 18999, 12),
    ('FPS-BAND-KIT', 'Resistance Band Kit', 'Five latex loop bands for warm-ups, mobility, and accessory work.', 'Strength', 3499, 40),
    ('FPS-WHEY-VANILLA', 'Whey Protein Isolate', 'Fast-digesting vanilla isolate with 25 g protein per scoop.', 'Nutrition', 5999, 25),
    ('FPS-YOGA-MAT', 'Yoga Mat Pro', 'Extra-grip six-millimetre mat built for training and recovery.', 'Recovery', 4499, 18),
    ('FPS-FOAM-ROLLER', 'Grid Foam Roller', 'Dense textured roller for post-session muscle release.', 'Recovery', 2499, 30),
    ('FPS-JUMP-ROPE', 'Speed Jump Rope', 'Adjustable bearing rope for conditioning and coordination.', 'Conditioning', 1999, 50),
    ('FPS-SHAKER', 'Insulated Shaker Bottle', 'Leak-proof 700 ml shaker that keeps drinks cold for hours.', 'Accessories', 1499, 60),
    ('FPS-KETTLEBELL-16', 'Kettlebell 16 kg', 'Powder-coated competition-style kettlebell with a wide handle.', 'Strength', 7999, 22),
    ('FPS-TRACKER', 'FitPulse Smart Tracker', 'Heart-rate and recovery tracker with a seven-day battery.', 'Wearables', 12999, 15),
    ('FPS-GLOVES', 'Training Grip Gloves', 'Breathable lifting gloves with silicone palm grip.', 'Accessories', 1899, 35)
ON CONFLICT (sku) DO NOTHING;

INSERT INTO foods (name, description, category, serving_size, calories, protein_g, carbs_g, fat_g) VALUES
    ('Greek Yogurt Parfait', 'Layered Greek yogurt, granola, and mixed berries.', 'breakfast', '1 bowl (300 g)', 320, 20, 38, 8),
    ('Avocado Toast', 'Sourdough toast with smashed avocado, lemon, and chilli flakes.', 'breakfast', '2 slices (180 g)', 280, 9, 30, 15),
    ('Berry Oatmeal', 'Rolled oats cooked with milk and topped with mixed berries.', 'breakfast', '1 bowl (280 g)', 240, 7, 42, 5),
    ('Veggie Egg White Omelette', 'Egg whites, spinach, peppers, and feta with a side of greens.', 'breakfast', '1 omelette (200 g)', 210, 24, 8, 9),
    ('Protein Pancakes', 'Oat and whey pancakes with a spoon of Greek yogurt.', 'breakfast', '3 pancakes (240 g)', 360, 28, 44, 8),
    ('Peanut Butter Banana Smoothie', 'Banana, peanut butter, oats, and milk blended smooth.', 'breakfast', '1 glass (450 ml)', 410, 18, 48, 16)
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
    demo_order_id INTEGER;
    demo_tracking_id INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM orders WHERE order_number = 'FP-DEMO-0001') THEN
        INSERT INTO orders (order_number, customer_name, customer_email, status, total_cents, created_at, updated_at)
        VALUES ('FP-DEMO-0001', 'Demo Athlete', 'demo@fitpulse.app', 'IN_TRANSIT', 0, now() - interval '2 days', now() - interval '6 hours')
        RETURNING id INTO demo_order_id;

        INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity, line_total_cents)
        SELECT demo_order_id, id, name, price_cents, 1, price_cents
        FROM products
        WHERE sku IN ('FPS-DUMBBELL-ADJ', 'FPS-SHAKER', 'FPS-WHEY-VANILLA');

        UPDATE orders
        SET total_cents = (SELECT COALESCE(SUM(line_total_cents), 0) FROM order_items WHERE order_id = demo_order_id)
        WHERE id = demo_order_id;

        INSERT INTO order_tracking (order_id, order_number, status, carrier, tracking_code, estimated_delivery, created_at, updated_at)
        VALUES (demo_order_id, 'FP-DEMO-0001', 'IN_TRANSIT', 'FitPulse Express', 'FPX-DEMO-0001', CURRENT_DATE + 2, now() - interval '2 days', now() - interval '6 hours')
        RETURNING id INTO demo_tracking_id;

        INSERT INTO tracking_events (tracking_id, status, message, created_at) VALUES
            (demo_tracking_id, 'CONFIRMED', 'Order received and confirmed by FitPulse.', now() - interval '2 days'),
            (demo_tracking_id, 'PROCESSING', 'Packed at the fulfilment centre and handed to the carrier.', now() - interval '35 hours'),
            (demo_tracking_id, 'IN_TRANSIT', 'Shipment is moving through the local delivery network.', now() - interval '6 hours');
    END IF;
END;
$$;
