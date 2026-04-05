// ══════════════════════════════════════════════════════════════════
// yahoo-auth — Supabase Edge Function
// Handles Yahoo OAuth 2.0 flow and proxies Fantasy API requests.
//
// Required Supabase secrets:
//   YAHOO_CLIENT_ID     — from Yahoo Developer Console
//   YAHOO_CLIENT_SECRET — from Yahoo Developer Console
//
// Registered redirect_uri in Yahoo Developer Console must be:
//   https://sxshiqyxhhifvtfqawbq.supabase.co/functions/v1/yahoo-auth
//
// GET  ?code=...&state=... → OAuth callback; returns HTML that postMessages tokens to opener
// POST { action: 'auth_url' }                              → { auth_url, state }
// POST { action: 'api', path, access_token, refresh_token } → { data, new_tokens? }
// ══════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const YAHOO_CLIENT_ID     = Deno.env.get("YAHOO_CLIENT_ID")     ?? "";
const YAHOO_CLIENT_SECRET = Deno.env.get("YAHOO_CLIENT_SECRET") ?? "";

const YAHOO_AUTH_URL  = "https://api.login.yahoo.com/oauth2/request_auth";
const YAHOO_TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";
const YAHOO_API_BASE  = "https://fantasysports.yahooapis.com/fantasy/v2";

// This URL must be registered as a redirect URI in the Yahoo Developer Console
const REDIRECT_URI = "https://sxshiqyxhhifvtfqawbq.supabase.co/functions/v1/yahoo-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // ── OAuth callback — Yahoo redirects here after user approves ──
  if (req.method === "GET") {
    const code  = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      return new Response(
        _callbackHtml(null, "Yahoo denied access: " + error),
        { headers: { "Content-Type": "text/html" } }
      );
    }
    if (!code) {
      return new Response("Missing code parameter", { status: 400 });
    }

    try {
      const tokens = await _exchangeCode(code);
      return new Response(
        _callbackHtml(tokens, null),
        { headers: { "Content-Type": "text/html" } }
      );
    } catch (err) {
      return new Response(
        _callbackHtml(null, (err as Error).message),
        { headers: { "Content-Type": "text/html" } }
      );
    }
  }

  // ── POST actions ───────────────────────────────────────────────
  try {
    const body = await req.json();
    const { action } = body;

    // ── auth_url: generate Yahoo OAuth authorization URL ──
    if (action === "auth_url") {
      if (!YAHOO_CLIENT_ID) {
        return new Response(
          JSON.stringify({ error: "Yahoo credentials not configured. Add YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET to Supabase secrets." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const state = crypto.randomUUID();
      const params = new URLSearchParams({
        client_id:     YAHOO_CLIENT_ID,
        redirect_uri:  REDIRECT_URI,
        response_type: "code",
        scope:         "fantasy-sports-read",
        state,
      });
      const auth_url = YAHOO_AUTH_URL + "?" + params.toString();
      return new Response(
        JSON.stringify({ auth_url, state }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── api: proxy a Yahoo Fantasy API request ──
    if (action === "api") {
      const { path, access_token, refresh_token } = body;
      if (!path || !access_token) {
        return new Response(
          JSON.stringify({ error: "Missing path or access_token" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Attempt the request; refresh token if we get a 401
      let token = access_token as string;
      let newTokens: Record<string, unknown> | null = null;

      let data = await _yahooGet(path, token);
      if (data === null) {
        // 401 — try refreshing
        if (!refresh_token) {
          return new Response(
            JSON.stringify({ error: "Access token expired. Re-connect with Yahoo." }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        try {
          newTokens = await _refreshToken(refresh_token as string);
          token = newTokens.access_token as string;
          data = await _yahooGet(path, token);
        } catch (_e) {
          return new Response(
            JSON.stringify({ error: "Token refresh failed. Re-connect with Yahoo." }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({ data, new_tokens: newTokens }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action: " + action }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[yahoo-auth] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Proxy error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── OAuth helpers ──────────────────────────────────────────────────

async function _exchangeCode(code: string): Promise<Record<string, unknown>> {
  const creds = btoa(`${YAHOO_CLIENT_ID}:${YAHOO_CLIENT_SECRET}`);
  const res = await fetch(YAHOO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type:   "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error("Token exchange failed (" + res.status + "): " + txt);
  }
  return res.json();
}

async function _refreshToken(refreshToken: string): Promise<Record<string, unknown>> {
  const creds = btoa(`${YAHOO_CLIENT_ID}:${YAHOO_CLIENT_SECRET}`);
  const res = await fetch(YAHOO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!res.ok) throw new Error("Refresh failed: " + res.status);
  return res.json();
}

// Returns null on 401 (expired token), throws on other errors
async function _yahooGet(path: string, accessToken: string): Promise<unknown | null> {
  const sep = path.includes("?") ? "&" : "?";
  const fullUrl = YAHOO_API_BASE + path + sep + "format=json";
  const res = await fetch(fullUrl, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Yahoo API error " + res.status + " for " + path);
  return res.json();
}

// ── Popup callback HTML ────────────────────────────────────────────
// Returns an HTML page that postMessages the result back to the opener,
// then closes itself. postMessage('*') works across the cross-origin boundary.

function _callbackHtml(tokens: Record<string, unknown> | null, error: string | null): string {
  if (error) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
<p style="font-family:sans-serif;color:#c0392b;padding:20px;text-align:center">
  <strong>Yahoo auth failed:</strong><br>${error}
</p>
<script>
  try { window.opener.postMessage({type:'yahoo_auth_error',error:${JSON.stringify(error)}}, '*'); } catch(e){}
  setTimeout(function(){ window.close(); }, 2500);
<\/script>
</body></html>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
<p style="font-family:sans-serif;color:#333;padding:30px;text-align:center">
  <strong style="color:#6001d2">Yahoo connected!</strong><br>
  <span style="font-size:14px;color:#666">You can close this window.</span>
</p>
<script>
  try {
    window.opener.postMessage({type:'yahoo_auth_complete',tokens:${JSON.stringify(tokens)}}, '*');
  } catch(e) {}
  setTimeout(function(){ window.close(); }, 800);
<\/script>
</body></html>`;
}
