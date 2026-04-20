import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Contact = {
  id: string;
  external_id: string | null;
  name: string;
  phone: string | null;
  phone_normalized: string | null;
  email: string | null;
  cpf: string | null;
  birth_date: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  last_appointment_at: string | null;
  tags: string[] | null;
  notes: string | null;
  sector_id: string | null;
  is_active: boolean;
  source: string | null;
  created_at: string;
  updated_at: string;
};

export type ContactsQuery = {
  search?: string;
  sectorId?: string | null;
  page?: number;
  pageSize?: number;
};

export function useContacts(q: ContactsQuery) {
  const [data, setData] = useState<Contact[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 25;

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("contacts")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .order("name");

    if (q.sectorId) query = query.eq("sector_id", q.sectorId);
    if (q.search?.trim()) {
      const term = q.search.trim();
      const digits = term.replace(/\D/g, "");
      if (digits.length >= 4) {
        query = query.or(
          `name.ilike.%${term}%,email.ilike.%${term}%,phone_normalized.ilike.%${digits}%,cpf.ilike.%${digits}%`,
        );
      } else {
        query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
      }
    }
    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data: rows, count: c } = await query;
    setData((rows as Contact[]) ?? []);
    setCount(c ?? 0);
    setLoading(false);
  }, [q.search, q.sectorId, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, count, loading, reload: load, page, pageSize };
}
