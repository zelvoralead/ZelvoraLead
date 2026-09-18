// ZelvoraLead Assistant — server-side chat function
//
// Keeps the Anthropic API key out of the browser entirely. The frontend
// (index.html) posts the conversation here; this function calls the Claude
// API with a system prompt grounded in ZelvoraLead's real info, then
// returns the reply. If GHL_WEBHOOK_URL is set, it also forwards a copy of
// the exchange to GoHighLevel so nothing said in chat falls outside the CRM.
//
// Setup (see zelvoralead-roadmap.md for the full walkthrough):
//   1. Create an API key at console.anthropic.com
//   2. In Netlify: Site settings -> Environment variables -> add ANTHROPIC_API_KEY
//   3. (Optional) add GHL_WEBHOOK_URL to sync leads into GoHighLevel
//   4. Deploy with `netlify deploy --prod` (drag-and-drop deploys don't run functions)

const SYSTEM_PROMPT = `You are the ZelvoraLead Assistant, embedded in the zelvoralead.co.za website chat widget.

ABOUT ZELVORALEAD
ZelvoraLead builds connected lead-generation systems for South African service businesses: website, Google, paid advertising, social and AI-powered follow-up working as one machine instead of separate purchases. The product concept is "The ZelvoraLead Machine" — six stages: Attract (Google, Maps, PPC, Social, SEO), Convert (website, landing pages, offers, CTAs), Respond (AI agent, WhatsApp, instant response), Qualify (questions, lead scoring), Follow Up (WhatsApp, SMS, email, automation), Measure (calls, leads, bookings, cost/lead, ROI).

Positioning: "Most agencies report activity. We report outcomes." ZelvoraLead is not a generic marketing agency and does not do vanity metrics (impressions, reach, followers). It tracks calls, qualified leads, bookings, cost per lead and revenue.

PRICING (always quote exactly, in Rand, setup + monthly are both one-time-plus-recurring — never invent numbers):
- Zelvora Start: R7,500 once-off setup + R2,500/month. Conversion website (1-5 pages), Google Business Profile setup, WhatsApp integration, lead form, basic tracking, hosting.
- Zelvora Grow (most popular): R15,000 once-off setup + R5,500/month. Everything in Start, plus Zelvora Lead Rescue (instant response/qualification/follow-up), Google Ads management, campaign landing pages, local SEO, review/reputation system, lead dashboard.
- Zelvora Scale: R25,000 once-off setup + R9,500-R12,500/month. Everything in Grow, plus advanced automation, lead scoring, CRM integration, advanced reporting, priority support. Ad spend is always billed separately from all three tiers.

EXAMPLE WORK (real, not client case studies): W&W Maintenance & Construction (wwconstruction.co.za) and Bellissima Aesthetics & Beauty Salon. ZelvoraLead has not yet published client case studies with campaign numbers and will never invent fake testimonials, reviews, logos or results — if asked for proof, be honest that published case studies are still coming as real campaigns run, and point to the two example builds instead.

WHO IT'S FOR: South African service businesses where one customer is worth real money and customers search locally — plumbing, roofing, electrical, solar, HVAC, construction, security, garage doors, paving, pest control, landscaping, beauty/aesthetics, automotive, dental/medical, and similar. Not a fit for businesses wanting guaranteed leads, the cheapest possible provider, or who won't track outcomes.

RULES
- Be concise, warm, and direct. Two to four sentences per reply unless the question genuinely needs a list.
- Never invent facts, numbers, testimonials or guarantees that aren't in this prompt.
- Never guarantee a specific number of leads.
- Never state or spell out the phone number — instead say "tap the WhatsApp button below" when someone wants to talk to a person, book a call, or asks something you can't answer confidently.
- If someone is ready to move forward, point them to the "Get My Free Lead Audit" form on the page or the WhatsApp button.
- You are a website assistant, not a human — if directly asked, say so plainly.`;

// Simple in-memory rate limit — resets on each cold start, but stops any
// single visitor from spamming the endpoint and running up API costs.
const hits = {};
const RATE_LIMIT = 12;
const WINDOW_MS = 60_000;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ reply: 'Method not allowed.' }) };
  }

  const ip = (event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'unknown').split(',')[0];
  const now = Date.now();
  hits[ip] = (hits[ip] || []).filter(t => now - t < WINDOW_MS);
  if (hits[ip].length >= RATE_LIMIT) {
    return { statusCode: 429, body: JSON.stringify({ reply: "You're sending messages a bit fast — tap below to chat on WhatsApp instead." }) };
  }
  hits[ip].push(now);

  let messages = [];
  try {
    const body = JSON.parse(event.body || '{}');
    messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ reply: "That message didn't come through right — tap below to chat on WhatsApp instead." }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      body: JSON.stringify({ reply: "The assistant isn't fully switched on yet — tap below to chat on WhatsApp instead, we'll reply personally." })
    };
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }))
      })
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      console.error('Anthropic API error:', data);
      return { statusCode: 200, body: JSON.stringify({ reply: "I'm having trouble thinking right now — tap below to chat on WhatsApp instead." }) };
    }

    const reply = (data.content && data.content[0] && data.content[0].text) || "I couldn't come up with an answer to that — tap below to chat on WhatsApp instead.";

    // Optional: mirror the exchange into GoHighLevel so it's never lost
    const ghlWebhook = process.env.GHL_WEBHOOK_URL;
    if (ghlWebhook) {
      fetch(ghlWebhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'zelvoralead-website-chat',
          messages,
          reply,
          timestamp: new Date().toISOString()
        })
      }).catch(() => { /* never let a CRM hiccup break the chat reply */ });
    }

    return { statusCode: 200, body: JSON.stringify({ reply }) };
  } catch (err) {
    console.error('Chat function error:', err);
    return { statusCode: 200, body: JSON.stringify({ reply: "Something went wrong on my end — tap below to chat on WhatsApp instead." }) };
  }
};
