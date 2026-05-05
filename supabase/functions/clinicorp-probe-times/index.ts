const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const user = Deno.env.get("CLINICORP_API_USER")!;
  const token = Deno.env.get("CLINICORP_API_TOKEN")!;
  const sub = Deno.env.get("CLINICORP_SUBSCRIBER")!;
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0,10);
  const u = new URL("https://api.clinicorp.com/rest/v1/appointment/list");
  for (const k of ["subscriber","subscriber_id","id_subscriber","assinante","id_assinante"]) u.searchParams.set(k, sub);
  for (const k of ["start_date","end_date","start_date_json","end_date_json","data_inicial","data_final","data_inicio","data_fim","from","to"]) u.searchParams.set(k, date);
  const r = await fetch(u, { headers: { Authorization: "Basic " + btoa(`${user}:${token}`), "x-api-user": user, "x-api-token": token, Accept: "application/json" }});
  const j = await r.json();
  function findArr(o: any): any[] {
    if (Array.isArray(o)) return o;
    if (!o || typeof o !== "object") return [];
    for (const v of Object.values(o)) if (Array.isArray(v) && v.length && typeof v[0] === "object") return v as any[];
    for (const v of Object.values(o)) { const r = findArr(v); if (r.length) return r; }
    return [];
  }
  const arr = findArr(j);
  const slim = arr.map((a: any) => ({ name: a.PatientName, dentist: a.Dentist_PersonId, date: a.date, fromTime: a.fromTime, toTime: a.toTime })).sort((a,b)=>String(a.fromTime).localeCompare(String(b.fromTime)));
  return new Response(JSON.stringify({ count: arr.length, slim }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" }});
});
