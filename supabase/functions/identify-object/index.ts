import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, userHint } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const messages: any[] = [
      {
        role: "system",
        content: `You are a cultural heritage and antique object identification expert. When given an image of an object (and optionally a name hint from the user), you must:
1. Identify what the object is
2. Provide a clear, concise name for it
3. Estimate when this type of object was first created or when this specific object likely dates from (e.g. "~1920s", "circa 500 BC", "Mid-18th century")
4. Write a rich historical description (2-4 paragraphs) covering its origins, cultural significance, typical era/region, and any interesting facts

Respond ONLY with valid JSON in this exact format:
{"name": "Object Name", "description": "Brief one-line description", "estimated_origin": "~1920s", "history": "Detailed historical context..."}`
      },
    ];

    const userContent: any[] = [];
    if (imageBase64) {
      userContent.push({
        type: "image_url",
        image_url: { url: imageBase64 },
      });
    }

    let textPrompt = "Identify this object, estimate when it was created/originated, and provide its historical background.";
    if (userHint) {
      textPrompt += ` The user thinks it might be: "${userHint}".`;
    }
    userContent.push({ type: "text", text: textPrompt });

    messages.push({ role: "user", content: userContent });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI identification failed");
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
      result = { name: userHint || "Unknown Object", description: "AI-identified object", estimated_origin: "Unknown", history: raw };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("identify-object error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
