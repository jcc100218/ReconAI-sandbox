// ══════════════════════════════════════════════════════════════════
// ai-analyze — Supabase Edge Function
// Server-side AI proxy for Fantasy Wars platform.
// Validates subscription tier, enforces rate limits, routes to
// optimal AI model (Gemini Flash / Claude Sonnet / Claude Opus).
// ══════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS ────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Tier config ─────────────────────────────────────────────────
const TIER_LIMITS: Record<string, number> = {
  free: 5,           // 5 calls/day for authenticated free users
  scout: 50,         // 50 calls/day
  warroom: 100,      // 100 calls/day
  commissioner: -1,  // Unlimited
};

const TIER_RANK: Record<string, number> = {
  free: 0,
  scout: 1,
  warroom: 2,
  commissioner: 3,
};

// ── Server-authoritative model routing ──────────────────────────
// Client-side MODEL_ROUTING is only used for BYOK path.
// This is the source of truth for server-routed calls.
interface Route {
  provider: "anthropic" | "gemini";
  model: string;
  tierMin: string;
}

const MODEL_ROUTING: Record<string, Route> = {
  // Complex reasoning -> Claude Sonnet
  "trade-chat":        { provider: "anthropic", model: "claude-sonnet-4-20250514", tierMin: "scout" },
  "trade-scout":       { provider: "anthropic", model: "claude-sonnet-4-20250514", tierMin: "scout" },
  "draft-scout":       { provider: "anthropic", model: "claude-sonnet-4-20250514", tierMin: "scout" },
  "pick-analysis":     { provider: "anthropic", model: "claude-sonnet-4-20250514", tierMin: "scout" },
  "player-scout":      { provider: "anthropic", model: "claude-sonnet-4-20250514", tierMin: "scout" },
  // Simple tasks -> Gemini Flash
  "home-chat":         { provider: "gemini", model: "gemini-2.0-flash", tierMin: "scout" },
  "waiver-chat":       { provider: "gemini", model: "gemini-2.0-flash", tierMin: "scout" },
  "waiver-agent":      { provider: "gemini", model: "gemini-2.0-flash", tierMin: "scout" },
  "draft-chat":        { provider: "gemini", model: "gemini-2.0-flash", tierMin: "scout" },
  "strategy-analysis": { provider: "gemini", model: "gemini-2.0-flash", tierMin: "scout" },
  "memory-summary":    { provider: "gemini", model: "gemini-2.0-flash", tierMin: "scout" },
  "power-posts":       { provider: "gemini", model: "gemini-2.0-flash", tierMin: "scout" },
  "recon-chat":        { provider: "gemini", model: "gemini-2.0-flash", tierMin: "scout" },
  // Commissioner-only -> Claude Opus for deep analysis
  "deep-analysis":     { provider: "anthropic", model: "claude-opus-4-20250514", tierMin: "commissioner" },
  "league-report":     { provider: "anthropic", model: "claude-opus-4-20250514", tierMin: "commissioner" },
  "rule-simulator":    { provider: "anthropic", model: "claude-opus-4-20250514", tierMin: "commissioner" },
  "trade-audit":       { provider: "anthropic", model: "claude-opus-4-20250514", tierMin: "commissioner" },
};

// Commissioner tier gets auto-upgraded to Opus for complex tasks
const COMMISSIONER_OPUS_TYPES = new Set([
  "trade-chat", "trade-scout", "draft-scout", "player-scout", "pick-analysis",
]);

// ── JWT decode (lightweight, no external deps) ──────────────────
function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload;
  } catch {
    return null;
  }
}

// ── Main handler ────────────────────────────────────────────────
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Extract JWT and username ──
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const claims = decodeJWT(token);
    const username = (claims?.sleeper_username as string) || (claims?.sub as string) || "";
    if (!username) {
      return new Response(
        JSON.stringify({ error: "Invalid token — no username found" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Init Supabase admin client ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ── 3. Look up user tier ──
    const { data: user } = await supabase
      .from("users")
      .select("tier")
      .eq("sleeper_username", username)
      .single();

    const tier = user?.tier || "free";

    // ── 4. Rate limit check ──
    const limit = TIER_LIMITS[tier] ?? 0;
    if (limit !== -1) {
      const { data: rlResult, error: rlError } = await supabase.rpc("increment_rate_limit", {
        p_username: username,
        p_limit: limit,
      });

      if (rlError) {
        console.error("Rate limit error:", rlError);
        // Don't block on rate limit DB errors — allow the call
      } else if (rlResult && !rlResult.allowed) {
        return new Response(
          JSON.stringify({
            error: `Daily limit reached (${rlResult.count}/${rlResult.limit}). Resets at midnight UTC. Upgrade your plan for more daily AI calls.`,
            limit: rlResult.limit,
            used: rlResult.count,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Unlimited tier — still track for analytics
      await supabase.rpc("increment_rate_limit", {
        p_username: username,
        p_limit: -1,
      }).catch(() => {});
    }

    // ── 5. Parse request and route ──
    const body = await req.json();
    const { type, context } = body;

    let parsed: Record<string, unknown>;
    try {
      parsed = typeof context === "string" ? JSON.parse(context) : context || {};
    } catch {
      parsed = {};
    }

    const callType = (parsed.callType as string) || type || "recon-chat";
    const route = { ...(MODEL_ROUTING[callType] || MODEL_ROUTING["recon-chat"]) };

    // Check tier minimum for this route
    const routeTierMin = TIER_RANK[route.tierMin] || 0;
    const userTierRank = TIER_RANK[tier] || 0;
    if (userTierRank < routeTierMin) {
      return new Response(
        JSON.stringify({ error: `This feature requires ${route.tierMin} tier or higher.` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Commissioner auto-upgrade to Opus for complex tasks
    if (tier === "commissioner" && COMMISSIONER_OPUS_TYPES.has(callType)) {
      route.provider = "anthropic";
      route.model = "claude-opus-4-20250514";
    }

    // Web search forces Anthropic
    const useWebSearch = parsed.useWebSearch === true;
    if (useWebSearch && route.provider !== "anthropic") {
      route.provider = "anthropic";
      route.model = "claude-sonnet-4-20250514";
    }

    const system = (parsed.system as string) || "Dynasty FF advisor. Values from DHQ (0-10000 scale). Be specific.";
    const messages = (parsed.messages as Array<{ role: string; content: string }>) || [];
    const maxTokens = (parsed.maxTokens as number) || 600;

    // ── 6. Call AI provider ──
    let responseText = "";
    let tokensUsed = 0;

    if (route.provider === "anthropic") {
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) throw new Error("Anthropic API key not configured");

      const anthropicBody: Record<string, unknown> = {
        model: route.model,
        max_tokens: useWebSearch ? Math.max(maxTokens, 1500) : maxTokens,
        system,
        messages,
      };
      if (useWebSearch) {
        anthropicBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      };
      if (useWebSearch) {
        headers["anthropic-beta"] = "web-search-2025-03-05";
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify(anthropicBody),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as Record<string, Record<string, string>>).error?.message || `Anthropic API error ${res.status}`);
      }

      const data = await res.json();
      responseText = ((data as Record<string, Array<{ type: string; text?: string }>>).content || [])
        .filter((c) => c.type === "text")
        .map((c) => c.text || "")
        .join("");
      tokensUsed = ((data as Record<string, Record<string, number>>).usage?.input_tokens || 0) +
                   ((data as Record<string, Record<string, number>>).usage?.output_tokens || 0);

    } else {
      // Gemini
      const apiKey = Deno.env.get("GOOGLE_AI_KEY");
      if (!apiKey) throw new Error("Google AI key not configured");

      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: route.model,
            max_tokens: maxTokens,
            messages: [{ role: "system", content: system }, ...messages],
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as Record<string, Record<string, string>>).error?.message || `Gemini API error ${res.status}`);
      }

      const data = await res.json();
      responseText = (data as Record<string, Array<{ message?: { content?: string } }>>).choices?.[0]?.message?.content || "";
      tokensUsed = ((data as Record<string, Record<string, number>>).usage?.total_tokens || 0);
    }

    // ── 7. Get current usage for response ──
    const today = new Date().toISOString().split("T")[0];
    const { data: usageRow } = await supabase
      .from("ai_rate_limits")
      .select("request_count")
      .eq("username", username)
      .eq("date", today)
      .single();

    const currentCount = usageRow?.request_count || 0;

    // Update tokens used
    if (tokensUsed > 0) {
      await supabase
        .from("ai_rate_limits")
        .update({ tokens_used: tokensUsed })
        .eq("username", username)
        .eq("date", today)
        .catch(() => {});
    }

    // ── 8. Return response ──
    return new Response(
      JSON.stringify({
        analysis: responseText || "No response.",
        model: route.model,
        provider: route.provider,
        usage: {
          count: currentCount,
          limit: limit === -1 ? "unlimited" : limit,
          tier,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[ai-analyze] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
