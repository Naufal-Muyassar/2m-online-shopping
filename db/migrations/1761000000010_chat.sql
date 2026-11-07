-- Up Migration

CREATE TYPE chat_channel AS ENUM ('customer_admin', 'courier_admin', 'customer_courier');

-- One thread per conversation. customer_courier belongs to an order and is never visible to admins.
CREATE TABLE chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel chat_channel NOT NULL,
  branch_id uuid NOT NULL REFERENCES branches(id),
  customer_id uuid REFERENCES users(id),
  courier_id uuid REFERENCES couriers(user_id),
  order_id uuid REFERENCES orders(id),
  customer_read_at timestamptz,
  courier_read_at timestamptz,
  admin_read_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_threads_shape CHECK (
    (channel = 'customer_admin' AND customer_id IS NOT NULL AND courier_id IS NULL AND order_id IS NULL)
    OR (channel = 'courier_admin' AND courier_id IS NOT NULL AND customer_id IS NULL AND order_id IS NULL)
    OR (channel = 'customer_courier' AND customer_id IS NOT NULL AND courier_id IS NOT NULL AND order_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX chat_threads_customer_admin_key ON chat_threads (branch_id, customer_id) WHERE channel = 'customer_admin';
CREATE UNIQUE INDEX chat_threads_courier_admin_key ON chat_threads (branch_id, courier_id) WHERE channel = 'courier_admin';
CREATE UNIQUE INDEX chat_threads_customer_courier_key ON chat_threads (order_id, courier_id) WHERE channel = 'customer_courier';
CREATE INDEX chat_threads_branch_recent ON chat_threads (branch_id, last_message_at DESC);

CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES chat_threads(id),
  sender_id uuid NOT NULL REFERENCES users(id),
  sender_role text NOT NULL CHECK (sender_role IN ('customer', 'courier', 'admin')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  client_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, client_id)
);

CREATE INDEX chat_messages_thread_recent ON chat_messages (thread_id, created_at DESC);

-- Down Migration

DROP TABLE chat_messages;
DROP TABLE chat_threads;
DROP TYPE chat_channel;
