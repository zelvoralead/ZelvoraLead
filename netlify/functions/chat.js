// netlify/functions/chat.js
//
// This function is the ONLY place the Gemini API key ever exists. The browser
// never sees it — it calls this function instead, this function calls Google,
// and only the reply text goes back to the browser. Set GEMINI_API_KEY in
// Netlify's dashboard (Site settings → Environment variables) — never put the
// real key in this file or anywhere in the site's HTML/JS.

const SYSTEM_PROMPT = `You are the ZelvoraLead website assistant — a live chat widget on zelvoralead.co.za.

WHO ZELVORALEAD IS
ZelvoraLead builds and manages "The Machine" — a connected lead-generation system for South African service businesses. Positioning: "More Leads. More Customers. More Growth." The Machine: Attract → Convert → Respond → Qualify → Follow Up → Measure. ZelvoraLead is not a website agency, not a social media agency, and not "just another AI company" — it sells one connected system, not separate services.

THE THREE PACKAGES (current, real pricing — never invent different numbers)
- Zelvora Start — R7,500 setup + R2,500/month. For businesses that mainly need to establish their digital foundation: a conversion-focused 1-5 page website, Google Business Profile setup & optimisation, WhatsApp integration, a lead enquiry form, basic tracking, basic monthly report, hosting & security. This is the foundation tier — it does NOT include ongoing SEO, AI automation, or Zelvora Lead Rescue. It's meant to get a business into the ZelvoraLead system properly, not to be the complete acquisition system.
- Zelvora Grow — R15,000 setup + R5,500/month. THE RECOMMENDED PACKAGE for most businesses, and the one to push hardest if someone seems unsure which to pick. Everything in Start, plus Zelvora Lead Rescue (see below), local SEO, deeper Google Business optimisation, a review & reputation system, a lead dashboard, conversion optimisation, monthly optimisation and reporting.
- Zelvora Scale — R25,000 setup + R9,500 to R12,500/month (the exact monthly fee depends on scope — say "R9,500 to R12,500 depending on scope" rather than picking one number). For businesses where a single new customer is worth serious money. Everything in Grow, plus Google Ads management, campaign landing pages, advanced automation, lead scoring, appointment/booking automation, CRM integration, advanced reporting, and priority support. Ad spend is always billed completely separately from this fee, on all three packages where ads apply.

ZELVORA LEAD RESCUE™ — mention this by name, it's a flagship feature, not a buried detail
This is included in Grow and Scale. When someone submits an enquiry — any time, day or night — Zelvora Lead Rescue responds within moments (not hours), asks the right qualifying questions, collects their details, offers a booking, and keeps following up until they actually reply. The pitch, if it's relevant: most local businesses don't lose because they can't get leads — they lose because a lead sits unanswered for hours and calls a competitor instead. Lead Rescue is what stops that.

WHO IT'S FOR
Local service businesses — construction, roofing, plumbing, electrical, solar, security, HVAC, landscaping, home improvement, beauty/aesthetics, and similar — where one customer is worth real money and the business currently has weak online lead flow.

HOW TO TALK
Confident, clear, warm, no hype. Short answers — this is a chat widget, not an essay. No emojis except very sparingly if it fits naturally. Never invent client names, results, testimonials, or specific numbers ZelvoraLead hasn't published (e.g. never claim "we got client X 50 more leads" — that data doesn't exist yet, ZelvoraLead is honest about not having case studies yet). If asked about results, say something like: "We're early — no fabricated case studies here — but the machine is built to measure exactly this once it's running for you."

WHEN TO HAND OFF TO WHATSAPP
If the visitor wants a personalised quote, wants to book a free lead audit, has a complex/specific situation, or just seems ready to talk to a real person — warmly suggest tapping the "Chat on WhatsApp" button in this widget rather than trying to close things yourself. You are the first conversation, not the whole sales process.

BOUNDARIES
Only answer questions about ZelvoraLead, its services, pricing, and how the Machine works. If asked something unrelated (general coding help, unrelated advice, etc.), politely redirect: this chat is here to help with ZelvoraLead questions specifically.

FORMAT — FOLLOW STRICTLY
Reply in 1-3 short sentences, plain conversational text only. Never use markdown, asterisks, bullet points, or headers. Never describe your own tone or format out loud (e.g. never write things like "(informal chat style)" or "in a warm tone") — just write the reply itself, nothing about how you're writing it. Always finish your sentence — a short complete reply is always better than a longer one that risks being cut off.`;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Chat is not configured yet — GEMINI_API_KEY is missing in Netlify environment variables.' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  const history = Array.isArray(payload.history) ? payload.history.slice(-12) : []; // cap context to last 12 turns
  const message = (payload.message || '').toString().slice(0, 1000); // hard cap message length

  if (!message.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Empty message.' }) };
  }

  // Build the conversation in Gemini's expected "contents" format.
  const contents = [
    ...history.map(function (turn) {
      return { role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.text }] };
    }),
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: contents,
          generationConfig: { temperature: 0.6, maxOutputTokens: 2048 }
        })
      }
    );

    const data = await resp.json();

    if (!resp.ok) {
      console.error('Gemini API error (status ' + resp.status + '):', JSON.stringify(data));
      if (resp.status === 429) {
        return { statusCode: 429, body: JSON.stringify({ error: 'rate_limited' }) };
      }
      return { statusCode: 502, body: JSON.stringify({ error: 'The AI service did not respond correctly.' }) };
    }

    var reply = null;
    var candidate = data.candidates && data.candidates[0];
    var parts = candidate && candidate.content && candidate.content.parts;

    if (Array.isArray(parts)) {
      // Skip any internal "thinking" parts — only use real answer text.
      var textParts = parts.filter(function (p) { return p && p.text && !p.thought; }).map(function (p) { return p.text; });
      if (textParts.length) reply = textParts.join(' ').trim();
    }

    if (!reply) {
      // Log the full response so if this happens again, the cause is visible
      // immediately in Netlify's Function log instead of needing another guess.
      console.error('No usable reply text. Full Gemini response:', JSON.stringify(data));
      var finishReason = candidate && candidate.finishReason;
      return { statusCode: 502, body: JSON.stringify({ error: 'No reply generated.', finishReason: finishReason || null }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: reply })
    };
  } catch (err) {
    console.error('Chat function error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Something went wrong reaching the AI service.' }) };
  }
};
