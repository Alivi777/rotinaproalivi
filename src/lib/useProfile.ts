import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";

export type Sector = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
};

export type Profile = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  sector_id: string | null;
};

export function useSectors() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("sectors")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        if (data) setSectors(data as Sector[]);
        setLoading(false);
      });
  }, []);

  return { sectors, loading };
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, email, sector_id")
      .eq("user_id", user.id)
      .maybeSingle();
    setProfile(data as Profile | null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { profile, loading, reload };
}
