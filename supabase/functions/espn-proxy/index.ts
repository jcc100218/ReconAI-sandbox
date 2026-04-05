// ══════════════════════════════════════════════════════════════════
// espn-proxy — Supabase Edge Function
// Proxies requests to the ESPN Fantasy API with Cookie header.
// Browsers cannot set Cookie headers directly (forbidden header name),
// so this function acts as an intermediary for private league access.
//
// POST body: { url: string, espnS2: string, swid: string }
// ══════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url, espnS2, swid } = await req.json();

    if (!url || !url.startsWith("https://lm-api-reads.fantasy.espn.com/")) {
      return new Response(
        JSON.stringify({ error: "Invalid URL — only ESPN Fantasy API URLs are allowed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (espnS2 && swid) {
      headers["Cookie"] = `espn_s2=${espnS2}; SWID=${swid}`;
    }

    const espnRes = await fetch(url, { headers });

    if (!espnRes.ok) {
      return new Response(
        JSON.stringify({ error: `ESPN API error ${espnRes.status}` }),
        { status: espnRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await espnRes.json();
    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[espn-proxy] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Proxy error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
