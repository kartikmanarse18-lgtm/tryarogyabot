// ArogyaBot AI backend — Cloudflare Worker
// ----------------------------------------------------------------------
// This is the ONLY place your API keys live. They are set as encrypted
// Worker secrets (via `wrangler secret put`), never shipped to any browser.
// Every visitor's copy of arogyabot.html calls this Worker; the Worker
// calls the AI providers on their behalf and returns just the finished
// report. No user ever needs their own key.
//
// Endpoint:  POST /api/symptom-report   body: { "text": "I have a fever and sore throat" }
// Returns:   200 { ...normalized report, provider: "gemini"|"groq"|"openrouter" }
//            502 { error: "..." }  — only if every configured provider failed
//
// Deploy:
//   npm install -g wrangler
//   wrangler login
//   wrangler secret put GEMINI_API_KEY        (paste key when prompted)
//   wrangler secret put GROQ_API_KEY          (optional)
//   wrangler secret put OPENROUTER_API_KEY    (optional)
//   wrangler deploy
// Then copy the printed https://....workers.dev URL into arogyabot.html's
// AI_BACKEND_URL constant.

const ALLOWED_ORIGIN = '*'; // tighten to your hosting domain once you deploy the HTML somewhere fixed
const TIMEOUT_MS = 20000;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    severity: { type: 'STRING', enum: ['mild', 'moderate', 'severe'] },
    basicReason: { type: 'STRING' },
    causes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { level: { type: 'STRING', enum: ['mild', 'moderate', 'severe'] }, text: { type: 'STRING' } },
        required: ['level', 'text']
      }
    },
    possibleDiseases: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Specific named conditions/diseases that could plausibly explain the symptom, most likely first.' },
    differentialDiagnosis: { type: 'ARRAY', items: { type: 'STRING' }, description: 'For each plausible condition, one short sentence naming it and the specific feature that would distinguish it from the others.' },
    confirmatoryDiagnosis: { type: 'STRING', description: 'The specific test(s) or clinical exam a doctor would use to confirm which of the possible diseases it actually is.' },
    whenToSeeDoctor: { type: 'STRING' },
    homeRemedies: { type: 'ARRAY', items: { type: 'STRING' } },
    specialist: { type: 'STRING' },
    redFlags: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['title', 'severity', 'basicReason', 'causes', 'possibleDiseases', 'differentialDiagnosis', 'confirmatoryDiagnosis', 'whenToSeeDoctor', 'homeRemedies', 'specialist', 'redFlags']
};

const SYSTEM_PROMPT = 'You are a careful, safety-conscious medical information assistant inside a consumer health app. Give general educational health information only — never a diagnosis. Keep it calm, clear, and medically responsible. Do not name specific medications, dosages, or timing — use generic phrasing like "an over-the-counter pain reliever as directed on the label" instead. For possibleDiseases, list specific named conditions (most likely first) that could plausibly explain the symptom — not just severity tiers. For differentialDiagnosis, write one short sentence per plausible condition naming it plus the specific detail that would distinguish it from the others. For confirmatoryDiagnosis, name the actual test(s) or exam a doctor would order to confirm which condition it is. Always make clear these are educational possibilities, not an actual diagnosis, and that only a licensed doctor can confirm one. If the description sounds like a medical emergency, still fill out every field but set severity to "severe" and make the doctor/red-flag guidance reflect real urgency.';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}
function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: corsHeaders() });
}
function stripFences(raw) {
  return (raw || '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
}
async function withTimeout(fn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try { return await fn(controller.signal); } finally { clearTimeout(timer); }
}
function normalize(parsed, provider) {
  return {
    icon: 'fa-solid fa-wand-magic-sparkles',
    provider,
    title: parsed.title || 'Symptom Report',
    severity: ['mild', 'moderate', 'severe'].includes(parsed.severity) ? parsed.severity : 'moderate',
    basicReason: parsed.basicReason || 'No summary returned — please try rephrasing.',
    causes: Array.isArray(parsed.causes) && parsed.causes.length
      ? parsed.causes.map(c => ({ level: ['mild', 'moderate', 'severe'].includes(c.level) ? c.level : 'moderate', text: c.text || '' }))
      : [{ level: 'moderate', text: 'Not enough detail returned — consult a doctor for evaluation.' }],
    possibleDiseases: Array.isArray(parsed.possibleDiseases) && parsed.possibleDiseases.length ? parsed.possibleDiseases : ['Not enough detail returned to name specific conditions'],
    differentialDiagnosis: Array.isArray(parsed.differentialDiagnosis) && parsed.differentialDiagnosis.length ? parsed.differentialDiagnosis : ['A doctor can narrow this down after a physical exam and your full history'],
    confirmatoryDiagnosis: parsed.confirmatoryDiagnosis || 'A doctor will recommend specific tests/exams to confirm the exact cause.',
    whenToSeeDoctor: parsed.whenToSeeDoctor || 'If symptoms persist or worsen, consult a doctor.',
    homeRemedies: Array.isArray(parsed.homeRemedies) && parsed.homeRemedies.length ? parsed.homeRemedies : ['Rest and stay hydrated', 'Monitor your symptoms and consult a doctor if they worsen'],
    specialist: parsed.specialist || 'General Physician',
    redFlags: Array.isArray(parsed.redFlags) && parsed.redFlags.length ? parsed.redFlags : ['Rapidly worsening symptoms', 'Difficulty breathing', 'Severe pain']
  };
}

// --- Gemini: grounded with live Google Search, then structured into JSON ---
// Two calls because combining Google Search grounding with a forced JSON
// schema in one call is currently only supported on Gemini 3 preview models.
// This keeps working reliably on the stable gemini-2.5 line.
async function fetchGemini(text, env) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('Gemini: no API key configured on the server');

  let groundedFacts = '';
  try {
    const groundedBody = {
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nA user described this symptom: "${text.replace(/"/g, '\\"')}"\nUsing current, reliable medical information, write a short factual briefing (plain text, no formatting) covering: the most likely cause(s), typical care, and genuine red-flag warning signs. This briefing will be restructured into a form afterward, so just get the facts right.` }] }],
      tools: [{ google_search: {} }]
    };
    const resp = await withTimeout(signal => fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(groundedBody), signal
    }));
    if (resp.ok) {
      const data = await resp.json();
      groundedFacts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text || '';
    }
  } catch (e) { /* grounding is a best-effort enhancement — fall through to direct structuring below */ }

  const structuringPrompt = groundedFacts
    ? `${SYSTEM_PROMPT}\n\nHere is a researched briefing on a user's symptom:\n"""${groundedFacts}"""\nReturn the structured report for the single most likely symptom/condition described in that briefing.`
    : `${SYSTEM_PROMPT}\n\nA user described this symptom in their own words: "${text.replace(/"/g, '\\"')}"\nReturn the structured report for the single most likely symptom/condition being described.`;

  const body = {
    contents: [{ parts: [{ text: structuringPrompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }
  };
  const resp = await withTimeout(signal => fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal
  }));
  if (!resp.ok) {
    let detail = ''; try { const e = await resp.json(); detail = e && e.error && e.error.message || ''; } catch (e) {}
    throw new Error(`Gemini API error ${resp.status}${detail ? ': ' + detail : ''}`);
  }
  const data = await resp.json();
  const raw = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!raw) throw new Error('Empty response from Gemini');
  let parsed; try { parsed = JSON.parse(stripFences(raw)); } catch (e) { throw new Error('Gemini: could not parse response'); }
  return normalize(parsed, groundedFacts ? 'gemini-grounded' : 'gemini');
}

// --- Groq (OpenAI-compatible, JSON mode) ---
async function fetchGroq(text, env) {
  const key = env.GROQ_API_KEY;
  if (!key) throw new Error('Groq: no API key configured on the server');
  const body = {
    model: 'openai/gpt-oss-120b',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT + ' Respond with ONLY a single JSON object with exactly these keys: title, severity ("mild"|"moderate"|"severe"), basicReason, causes (array of {level, text}), possibleDiseases (array of specific named condition strings, most likely first), differentialDiagnosis (array of strings, one per plausible condition naming it plus its distinguishing feature), confirmatoryDiagnosis (string naming the test/exam that would confirm it), whenToSeeDoctor, homeRemedies (array of strings), specialist, redFlags (array of strings).' },
      { role: 'user', content: `A user described this symptom: "${text.replace(/"/g, '\\"')}"\nReturn the structured report for the single most likely symptom/condition being described.` }
    ]
  };
  const resp = await withTimeout(signal => fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body), signal
  }));
  if (!resp.ok) {
    let detail = ''; try { const e = await resp.json(); detail = e && e.error && e.error.message || ''; } catch (e) {}
    throw new Error(`Groq API error ${resp.status}${detail ? ': ' + detail : ''}`);
  }
  const data = await resp.json();
  const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!raw) throw new Error('Empty response from Groq');
  let parsed; try { parsed = JSON.parse(stripFences(raw)); } catch (e) { throw new Error('Groq: could not parse response'); }
  return normalize(parsed, 'groq');
}

// --- OpenRouter (OpenAI-compatible, free-tier model) ---
async function fetchOpenRouter(text, env) {
  const key = env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OpenRouter: no API key configured on the server');
  const body = {
    model: 'z-ai/glm-5.2:free',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT + ' Respond with ONLY a single JSON object with exactly these keys: title, severity ("mild"|"moderate"|"severe"), basicReason, causes (array of {level, text}), possibleDiseases (array of specific named condition strings, most likely first), differentialDiagnosis (array of strings, one per plausible condition naming it plus its distinguishing feature), confirmatoryDiagnosis (string naming the test/exam that would confirm it), whenToSeeDoctor, homeRemedies (array of strings), specialist, redFlags (array of strings).' },
      { role: 'user', content: `A user described this symptom: "${text.replace(/"/g, '\\"')}"\nReturn the structured report for the single most likely symptom/condition being described.` }
    ]
  };
  const resp = await withTimeout(signal => fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'HTTP-Referer': 'https://arogyabot.app', 'X-Title': 'ArogyaBot' },
    body: JSON.stringify(body), signal
  }));
  if (!resp.ok) {
    let detail = ''; try { const e = await resp.json(); detail = e && e.error && e.error.message || ''; } catch (e) {}
    throw new Error(`OpenRouter API error ${resp.status}${detail ? ': ' + detail : ''}`);
  }
  const data = await resp.json();
  const raw = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!raw) throw new Error('Empty response from OpenRouter');
  let parsed; try { parsed = JSON.parse(stripFences(raw)); } catch (e) { throw new Error('OpenRouter: could not parse response'); }
  return normalize(parsed, 'openrouter');
}

// --- OCR: real Gemini multimodal extraction for lab reports / prescriptions ---
const OCR_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reportType: { type: 'STRING', description: 'e.g. "Complete Blood Count", "Prescription", "Lipid Profile"' },
    tests: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          value: { type: 'STRING' },
          unit: { type: 'STRING' },
          referenceRange: { type: 'STRING' },
          status: { type: 'STRING', enum: ['low', 'normal', 'high', 'unknown'] }
        },
        required: ['name', 'value', 'status']
      }
    },
    medications: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Only for prescriptions: drug name + dose + frequency as written, verbatim.' },
    summary: { type: 'STRING' }
  },
  required: ['reportType', 'tests', 'summary']
};
const OCR_SYSTEM_PROMPT = 'You are an OCR and medical-document extraction assistant. Read the attached lab report or prescription image/PDF and extract every test result or medication line exactly as written — never invent, guess, or round values you cannot clearly read. If a field is illegible, omit that line rather than guessing. Do not interpret or diagnose; only transcribe and lightly flag whether a numeric result is low/normal/high relative to any reference range printed on the document itself. This output will be labeled "AI-extracted, unverified" to the patient.';

async function fetchOcrExtraction(base64Data, mimeType, env) {
  const key = env.GEMINI_API_KEY;
  if (!key) throw new Error('OCR: no Gemini API key configured on the server');
  const body = {
    contents: [{
      parts: [
        { text: OCR_SYSTEM_PROMPT },
        { inline_data: { mime_type: mimeType, data: base64Data } }
      ]
    }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: OCR_RESPONSE_SCHEMA }
  };
  const resp = await withTimeout(signal => fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal
  }));
  if (!resp.ok) {
    let detail = ''; try { const e = await resp.json(); detail = e && e.error && e.error.message || ''; } catch (e) {}
    throw new Error(`Gemini OCR error ${resp.status}${detail ? ': ' + detail : ''}`);
  }
  const data = await resp.json();
  const raw = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!raw) throw new Error('Empty response from Gemini OCR');
  let parsed; try { parsed = JSON.parse(stripFences(raw)); } catch (e) { throw new Error('OCR: could not parse response'); }
  return {
    reportType: parsed.reportType || 'Medical Document',
    tests: Array.isArray(parsed.tests) ? parsed.tests.map(t => ({ name: t.name || '', value: t.value || '', unit: t.unit || '', referenceRange: t.referenceRange || '', status: ['low', 'normal', 'high', 'unknown'].includes(t.status) ? t.status : 'unknown' })) : [],
    medications: Array.isArray(parsed.medications) ? parsed.medications : [],
    summary: parsed.summary || ''
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/ocr-extract') {
      let base64Data, mimeType;
      try {
        const body = await request.json();
        base64Data = body && body.base64Data;
        mimeType = body && body.mimeType;
      } catch (e) {}
      if (!base64Data || !mimeType) return json({ error: 'Missing "base64Data" or "mimeType" in request body' }, 400);
      if (!env.GEMINI_API_KEY) return json({ error: 'OCR requires GEMINI_API_KEY to be configured on the server (set via wrangler secret put) — Groq/OpenRouter do not support document vision here' }, 500);
      try {
        const result = await fetchOcrExtraction(base64Data, mimeType, env);
        return json(result, 200);
      } catch (err) {
        return json({ error: err && err.message ? err.message : String(err) }, 502);
      }
    }

    if (request.method !== 'POST' || url.pathname !== '/api/symptom-report') {
      return json({ error: 'POST /api/symptom-report with { "text": "..." } or POST /api/ocr-extract with { "base64Data": "...", "mimeType": "..." }' }, 404);
    }
    let text;
    try { const body = await request.json(); text = (body && body.text || '').trim(); } catch (e) {}
    if (!text) return json({ error: 'Missing "text" in request body' }, 400);

    const fetchers = [];
    if (env.GEMINI_API_KEY) fetchers.push(fetchGemini(text, env));
    if (env.GROQ_API_KEY) fetchers.push(fetchGroq(text, env));
    if (env.OPENROUTER_API_KEY) fetchers.push(fetchOpenRouter(text, env));
    if (!fetchers.length) return json({ error: 'No provider keys configured on the server (set via wrangler secret put)' }, 500);

    try {
      const report = await Promise.any(fetchers);
      return json(report, 200);
    } catch (aggErr) {
      const msgs = (aggErr && aggErr.errors ? aggErr.errors : [aggErr]).map(e => e && e.message ? e.message : String(e));
      return json({ error: msgs.join(' | ') }, 502);
    }
  }
};
