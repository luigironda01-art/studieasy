import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// Initialize clients inside handler to avoid build-time errors
function getClients() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
  });
  return { supabase, openrouter };
}

const CHAT_MODEL = "anthropic/claude-3.5-sonnet";
const WEB_SEARCH_MODEL = "perplexity/sonar-pro";
const MAX_HISTORY_MESSAGES = 20;
const MAX_CONTEXT_CHARS = 8000;

function buildSystemPrompt(
  bookTitle: string | null,
  chapterSummaries: string | null,
  webSearch: boolean
): string {
  let prompt = `Sei un assistente di studio intelligente chiamato "Buddy". Aiuti gli studenti a studiare, comprendere e approfondire i loro materiali.

Regole:
- Rispondi in italiano a meno che lo studente non scriva in un'altra lingua
- Sii chiaro, conciso e utile
- Usa esempi pratici quando possibile
- Se non sai qualcosa, dillo onestamente
- Puoi usare markdown per formattare le risposte (grassetto, elenchi, code blocks, ecc.)
- Se lo studente chiede di un argomento del libro, basati sul contesto fornito`;

  if (bookTitle && chapterSummaries) {
    prompt += `\n\n--- CONTESTO DEL LIBRO ---
Libro: "${bookTitle}"

Contenuto dei capitoli (riassunti):
${chapterSummaries}
--- FINE CONTESTO ---

Usa questo contesto per rispondere a domande sul libro. Se la domanda non riguarda il libro, rispondi normalmente.`;
  }

  if (webSearch) {
    prompt += `\n\nLo studente ha attivato la ricerca web. Cerca informazioni aggiornate e pertinenti su internet per rispondere alla domanda. Cita le fonti quando possibile.`;
  }

  return prompt;
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, openrouter } = getClients();
    const body = await request.json();
    const {
      conversationId,
      message,
      userId,
      sourceId,
      webSearch = false,
    } = body as {
      conversationId: string | null;
      message: string;
      userId: string;
      sourceId: string | null;
      webSearch: boolean;
    };

    if (!message?.trim() || !userId) {
      return new Response(JSON.stringify({ error: "Missing message or userId" }), { status: 400 });
    }

    // 1. Get or create conversation
    let convId = conversationId;
    if (!convId) {
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          source_id: sourceId || null,
          title: message.slice(0, 80).trim(),
        })
        .select("id")
        .single();

      if (convError || !conv) {
        console.error("Error creating conversation:", convError);
        return new Response(JSON.stringify({ error: "Failed to create conversation" }), { status: 500 });
      }
      convId = conv.id;
    }

    // 2. Save user message
    const { error: msgError } = await supabase.from("messages").insert({
      conversation_id: convId,
      role: "user",
      content: message.trim(),
    });
    if (msgError) {
      console.error("Error saving user message:", msgError);
    }

    // 3. Fetch conversation history
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(MAX_HISTORY_MESSAGES + 1);

    const historyMessages = (history || [])
      .slice(0, -1) // Exclude the message we just inserted
      .map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // 4. Fetch book context if sourceId provided
    let bookTitle: string | null = null;
    let chapterSummaries: string | null = null;

    if (sourceId) {
      const { data: source } = await supabase
        .from("sources")
        .select("title")
        .eq("id", sourceId)
        .single();
      bookTitle = source?.title || null;

      // Get chapter summaries (shorter than full text, better for context)
      const { data: chapters } = await supabase
        .from("chapters")
        .select("title, processed_text")
        .eq("source_id", sourceId)
        .eq("processing_status", "completed")
        .order("order_index");

      if (chapters && chapters.length > 0) {
        // Check for AI-generated summaries first
        const { data: summaries } = await supabase
          .from("summaries")
          .select("chapter_id, content")
          .in("chapter_id", chapters.map((c: { id?: string; title: string }) => c.id || "").filter(Boolean));

        const summaryMap = new Map(
          (summaries || []).map((s: { chapter_id: string; content: string }) => [s.chapter_id, s.content])
        );

        let contextText = "";
        for (const ch of chapters) {
          const chId = (ch as { id?: string }).id;
          const summary = chId ? summaryMap.get(chId) : null;
          const text = summary || ch.processed_text || "";
          // Truncate per chapter to stay within limits
          const truncated = text.slice(0, Math.floor(MAX_CONTEXT_CHARS / chapters.length));
          contextText += `\n## ${ch.title}\n${truncated}\n`;
        }
        chapterSummaries = contextText.slice(0, MAX_CONTEXT_CHARS);
      }
    }

    // 5. Build messages for AI
    const systemPrompt = buildSystemPrompt(bookTitle, chapterSummaries, webSearch);
    const model = webSearch ? WEB_SEARCH_MODEL : CHAT_MODEL;

    const aiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: message.trim() },
    ];

    // 6. Stream response
    const stream = await openrouter.chat.completions.create({
      model,
      messages: aiMessages,
      max_tokens: 4096,
      stream: true,
    });

    const encoder = new TextEncoder();
    let fullResponse = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send conversationId first so frontend knows it
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ conversationId: convId })}\n\n`)
          );

          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || "";
            if (text) {
              fullResponse += text;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
              );
            }
          }

          // Save complete assistant message
          if (fullResponse.trim()) {
            await supabase.from("messages").insert({
              conversation_id: convId,
              role: "assistant",
              content: fullResponse.trim(),
            });

            // Update conversation timestamp
            await supabase
              .from("conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", convId);
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("Streaming error:", err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Errore durante la generazione della risposta" })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// GET: fetch conversations list
export async function GET(request: NextRequest) {
  try {
    const { supabase } = getClients();
    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) {
      return new Response(JSON.stringify({ error: "Missing userId" }), { status: 400 });
    }

    const { data, error } = await supabase
      .from("conversations")
      .select("id, title, source_id, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ conversations: data || [] }));
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

// DELETE: delete a conversation
export async function DELETE(request: NextRequest) {
  try {
    const { supabase } = getClients();
    const { conversationId, userId } = await request.json();

    if (!conversationId || !userId) {
      return new Response(JSON.stringify({ error: "Missing params" }), { status: 400 });
    }

    // Messages cascade-delete via FK
    const { error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId)
      .eq("user_id", userId);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }));
  } catch {
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
