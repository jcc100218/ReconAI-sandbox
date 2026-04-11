// ══════════════════════════════════════════════════════════════════
// mfl-proxy — Supabase Edge Function
// Proxies requests to the MyFantasyLeague API to bypass CORS.
// MFL explicitly blocks cross-origin browser requests, so this
// Edge Function acts as a server-side relay.
//
// POST body: { url: string }
// The url must start with https://api.myfantasyleague.com/ or
// https://www followed by myfantasyleague.com to be accepted.
// ══════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function isValidMflUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith("myfantasyleague.com");
  } catch {
    return false;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url || !isValidMflUrl(url)) {
      return new Response(
        JSON.stringify({ error: "Invalid URL — only myfantasyleague.com URLs are allowed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mflRes = await fetch(url, {
      headers: {
        "User-Agent": "FantasyWarRoom/1.0",
        "Accept": "application/json",
      },
    });

    if (!mflRes.ok) {
      const status = mflRes.status;
      let msg = `MFL API error ${status}`;
      if (status === 401 || status === 403) {
        msg = "This MFL league is private. Provide your API key to connect.";
      } else if (status === 429) {
        msg = "MFL rate limit reached. Wait a moment and try again.";
      }
      return new Response(
        JSON.stringify({ error: msg }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await mflRes.text();
    return new Response(data, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[mfl-proxy] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Proxy error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
