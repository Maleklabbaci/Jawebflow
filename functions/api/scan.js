/**
 * JAWEBFLOW - SITE SCANNER (CLOUDFLARE EDGE + FIRESTORE)
 * Scanne tout le site (pages, produits, etc.) + Gemini Vision -> Firestore
 */

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { doubleValue: v };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (Array.isArray(v)) {
      fields[k] = { arrayValue: { values: v.map(x => ({ stringValue: String(x) })) } };
    }
  }
  return fields;
}

async function saveToFirestore(env, path, data) {
  const db = env.FIRESTORE_DATABASE_ID || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/${db}/documents/${path}?key=${env.FIRESTORE_API_KEY}`;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(data) })
  });
}

async function analyzeWithVision(imageUrl, apiKey) {
  try {
    const imgRes = await fetch(imageUrl, { headers: { 'User-Agent': 'JawebFlowBot/1.0' } });
    if (!imgRes.ok) return [];
    const buffer = await imgRes.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: `Analyse cette image. Réponds UNIQUEMENT en JSON : {"keywords":["mot-cle1","personnage","couleur"]}` },
            { inlineData: { data: base64, mimeType: 'image/jpeg' } }
          ]
        }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 150 }
      })
    });
    const data = await res.json();
    const match = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]).keywords || [] : [];
  } catch { return []; }
}

export async function onRequestPost(context) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  try {
    const { assistantId, siteUrl } = await context.request.json();
    const env = context.env;
    if (!assistantId || !siteUrl) return new Response(JSON.stringify({ error: "Champs requis" }), { status: 400, headers: cors });

    const sitemapRes = await fetch(`${siteUrl}/sitemap.xml`, { headers: { 'User-Agent': 'JawebFlowBot/1.0' } }).catch(() => null);
    let urls = [];
    if (sitemapRes && sitemapRes.ok) {
      const xml = await sitemapRes.text();
      const locRegex = /<loc>(.*?)<\/loc>/gi;
      let m;
      while ((m = locRegex.exec(xml)) !== null) urls.push(m[1].trim());
    }
    if (urls.length === 0) urls = [siteUrl];

    let count = 0;
    for (const pageUrl of urls.slice(0, 100)) {
      try {
        const pageRes = await fetch(pageUrl, { headers: { 'User-Agent': 'JawebFlowBot/1.0' } });
        if (!pageRes.ok) continue;
        const html = await pageRes.text();

        const title = (html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i) || html.match(/<title>(.*?)<\/title>/i) || [])[1] || '';
        const desc = (html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["'](.*?)["']/i) || [])[1] || '';
        const img = (html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i) || [])[1] || '';
        const price = (html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["'](.*?)["']/i) || [])[1] || '';

        if (!title || title.length < 3) continue;

        let tags = [];
        if (img && env.GEMINI_API_KEY) {
          tags = await analyzeWithVision(img, env.GEMINI_API_KEY);
        }

        const type = pageUrl.includes('product') || price ? 'produit' : 'info';
        const docId = pageUrl.replace(/[^a-zA-Z0-9]/g, '_').slice(-80);

        await saveToFirestore(env, `assistants/${assistantId}/knowledge_base/${docId}`, {
          title,
          content: desc || title,
          url: pageUrl,
          price: price || '',
          currency: 'DA',
          type,
          tags,
          scannedAt: new Date().toISOString()
        });
        count++;
      } catch {}
    }

    await saveToFirestore(env, `assistants/${assistantId}`, {
      siteUrl,
      lastScanAt: new Date().toISOString(),
      totalResources: count
    });

    return new Response(JSON.stringify({ success: true, scanned: count }), { status: 200, headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
