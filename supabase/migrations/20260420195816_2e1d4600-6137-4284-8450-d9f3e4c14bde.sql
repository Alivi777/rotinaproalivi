
-- 1. Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'member');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Roles viewable by authenticated"
  ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Payment methods
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payment methods viewable by authenticated"
  ON public.payment_methods FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins insert payment methods"
  ON public.payment_methods FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update payment methods"
  ON public.payment_methods FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete payment methods"
  ON public.payment_methods FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_payment_methods_updated
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.payment_methods (name, sort_order) VALUES
  ('PIX', 1),
  ('Cartão de Crédito', 2),
  ('Cartão de Débito', 3),
  ('Dinheiro', 4),
  ('Boleto', 5),
  ('Convênio', 6);

-- 3. Monthly goals (one row per month)
CREATE TABLE public.monthly_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month date NOT NULL UNIQUE, -- always day=01
  new_patients_target integer NOT NULL DEFAULT 0,
  new_clients_target integer NOT NULL DEFAULT 0,
  revenue_target numeric(12,2) NOT NULL DEFAULT 0,
  profit_target numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.monthly_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Goals viewable by authenticated"
  ON public.monthly_goals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins insert goals"
  ON public.monthly_goals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update goals"
  ON public.monthly_goals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete goals"
  ON public.monthly_goals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_monthly_goals_updated
  BEFORE UPDATE ON public.monthly_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Sales (linked to clients)
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  profit numeric(12,2) GENERATED ALWAYS AS (amount - cost) STORED,
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  is_new_patient boolean NOT NULL DEFAULT false,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_date ON public.sales(sale_date);
CREATE INDEX idx_sales_client ON public.sales(client_id);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sales viewable by authenticated"
  ON public.sales FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert sales"
  ON public.sales FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated update sales"
  ON public.sales FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins delete sales"
  ON public.sales FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_sales_updated
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Bootstrap: make the first existing user an admin (so the panel is usable immediately)
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'admin'::app_role
FROM public.profiles
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT DO NOTHING;
