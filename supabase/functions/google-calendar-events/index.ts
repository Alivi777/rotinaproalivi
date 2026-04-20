// Edge function: lista próximos eventos do Google Calendar do usuário logado
// Refresca o access_token automaticamente se necessário
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CLIENT_ID = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: tokenRow } = await admin
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!tokenRow) {
      return new Response(JSON.stringify({ connected: false, events: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken = tokenRow.access_token;
    const expired = tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() < Date.now() + 60_000;

    if (expired && tokenRow.refresh_token && CLIENT_ID && CLIENT_SECRET) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token, CLIENT_ID, CLIENT_SECRET);
      if (refreshed.access_token) {
        accessToken = refreshed.access_token;
        await admin
          .from("google_calendar_tokens")
          .update({
            access_token: accessToken,
            expires_at: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString(),
          })
          .eq("user_id", user.id);
      }
    }

    const now = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 1);

    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "20",
    });

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!calRes.ok) {
      const errBody = await calRes.text();
      console.error("Google Calendar API error:", errBody);
      return new Response(
        JSON.stringify({ connected: true, events: [], error: "Erro ao buscar eventos. Reconecte o Google." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const calData = await calRes.json();
    return new Response(
      JSON.stringify({
        connected: true,
        events: (calData.items ?? []).map((e: any) => ({
          id: e.id,
          summary: e.summary ?? "(sem título)",
          start: e.start?.dateTime ?? e.start?.date,
          end: e.end?.dateTime ?? e.end?.date,
          attendees: (e.attendees ?? []).length,
          location: e.location ?? null,
          htmlLink: e.htmlLink ?? null,
        })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("google-calendar-events error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
