import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // History mode: generate brief histories for named items
    if (body.historyMode && body.itemNames) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `You are a knowledgeable historian and object expert. Given a list of object names detected by a camera, provide a brief but interesting historical background for each. Include origin, cultural significance, or evolution over time.

Respond ONLY with valid JSON: {"histories": [{"name":"...","history":"2-3 sentence history"}]}
Keep histories concise but informative and fascinating.`,
            },
            {
              role: "user",
              content: `Provide brief histories for these objects detected in a scene: ${body.itemNames}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("History generation failed");
      }

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content ?? "";
      let jsonStr = raw;
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();

      let result;
      try {
        result = JSON.parse(jsonStr);
      } catch {
        result = { histories: [] };
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Standard mode: image analysis
    const { imageBase64 } = body;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a real-time scene analysis AI. Given a camera frame, quickly identify the main visible objects/items in the scene. For each detected item, provide:
- name: short label
- confidence: "high", "medium", or "low"
- bbox: normalized bounding box [x_min, y_min, x_max, y_max] (0-1 range)
- brief: one-sentence description

Respond ONLY with valid JSON: {"items": [{"name":"...","confidence":"...","bbox":[0,0,1,1],"brief":"..."}]}
Keep it to the 5 most prominent/interesting items. Be fast and concise.`,
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageBase64 } },
              { type: "text", text: "Identify the main objects in this camera frame." },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please slow down." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("Scene analysis failed");
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "";

    let jsonStr = raw;
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      result = { items: [] };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("live-sense error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
