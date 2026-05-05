const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const user = Deno.env.get("CLINICORP_API_USER")!;
  const token = Deno.env.get("CLINICORP_API_TOKEN")!;
  const sub = Deno.env.get("CLINICORP_SUBSCRIBER")!;
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0,10);
  const u = new URL("https://api.clinicorp.com/rest/v1/appointment/list");
  u.searchParams.set("subscriber", sub);
  u.searchParams.set("start_date", date);
  u.searchParams.set("end_date", date);
  const r = await fetch(u, { headers: { Authorization: "Basic " + btoa(`${user}:${token}`), "x-api-user": user, "x-api-token": token, Accept: "application/json" }});
  const text = await r.text();
  let j: unknown; try { j = JSON.parse(text); } catch { j = text; }
  const arr = Array.isArray(j) ? j : ((j as any)?.data ?? (j as any)?.result ?? (j as any)?.appointments ?? []);
  const sample = (arr as any[]).slice(0, 5);
  return new Response(JSON.stringify({ count: arr.length, keys: sample[0] ? Object.keys(sample[0]) : [], sample }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
});
