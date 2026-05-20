import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BUILD_TIME = new Date().toISOString();

function injectConfig(html) {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!url || !key) console.warn('[MonCoach] ATTENTION: SUPABASE_URL ou SUPABASE_PUBLISHABLE_KEY manquant!');
  const tag = `<script>window.__SB_URL__=${JSON.stringify(url)};window.__SB_KEY__=${JSON.stringify(key)};window.__BUILD__=${JSON.stringify(BUILD_TIME)};</script>`;
  return html.replace('</head>', tag + '\n</head>');
}

const indexHtml = injectConfig(fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'));
const appHtml   = injectConfig(fs.readFileSync(path.join(__dirname, 'public', 'app.html'), 'utf8'));

console.log(`[MonCoach] Build: ${BUILD_TIME}`);
console.log(`[MonCoach] SUPABASE_URL set: ${!!process.env.SUPABASE_URL}`);
console.log(`[MonCoach] SUPABASE_PUBLISHABLE_KEY set: ${!!process.env.SUPABASE_PUBLISHABLE_KEY}`);

app.use(express.json());

function sendHtml(res, html) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.type('html').send(html);
}

// HTML routes before express.static so config injection takes precedence
app.get('/',           (_req, res) => sendHtml(res, indexHtml));
app.get('/index.html', (_req, res) => sendHtml(res, indexHtml));
app.get('/app.html',   (_req, res) => sendHtml(res, appHtml));
app.get('/app',        (_req, res) => sendHtml(res, appHtml));

// Endpoint de debug — vérifie que les variables Render sont bien lues
app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || null,
    build: BUILD_TIME,
  });
});

app.use(express.static(path.join(__dirname, 'public')));

// ---- AUTH API — appels directs à l'API REST Supabase, aucun SDK importé ----

function sbHeaders(token) {
  const h = {
    'Content-Type': 'application/json',
    'apikey': process.env.SUPABASE_PUBLISHABLE_KEY,
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function sbUrl(path) {
  return `${process.env.SUPABASE_URL}${path}`;
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

    const authRes = await fetch(sbUrl('/auth/v1/token?grant_type=password'), {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const auth = await authRes.json();
    if (!authRes.ok) return res.status(400).json({ error: auth.error_description || auth.message || 'Identifiants incorrects' });

    const profileRes = await fetch(sbUrl(`/rest/v1/profiles?id=eq.${auth.user.id}&select=id`), {
      headers: sbHeaders(auth.access_token),
    });
    const profiles = await profileRes.json();

    res.json({
      access_token: auth.access_token,
      refresh_token: auth.refresh_token,
      user_id: auth.user.id,
      has_profile: Array.isArray(profiles) && profiles.length > 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Tous les champs sont requis' });

    const signupRes = await fetch(sbUrl('/auth/v1/signup'), {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({ email, password, data: { first_name: name } }),
    });
    const data = await signupRes.json();
    if (!signupRes.ok) return res.status(400).json({ error: data.msg || data.message || 'Erreur inscription' });

    if (!data.access_token) {
      return res.status(200).json({ needs_confirmation: true });
    }

    res.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user_id: data.user?.id,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/profiles', async (req, res) => {
  try {
    const { access_token, user_id, profile } = req.body;
    if (!access_token || !user_id) return res.status(401).json({ error: 'Non authentifié — désactivez la confirmation email dans Supabase' });

    const upsertRes = await fetch(sbUrl('/rest/v1/profiles'), {
      method: 'POST',
      headers: { ...sbHeaders(access_token), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: user_id, ...profile }),
    });
    if (!upsertRes.ok) {
      const err = await upsertRes.json();
      return res.status(400).json({ error: err.message || 'Erreur sauvegarde profil' });
    }

    if (profile.weight_start) {
      await fetch(sbUrl('/rest/v1/weight_logs'), {
        method: 'POST',
        headers: { ...sbHeaders(access_token), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id, date: new Date().toISOString().split('T')[0], weight: profile.weight_start }),
      });
    }

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function buildSynthesisPrompt(profile, journals, weightHistory) {
  const age = profile.birth_date
    ? Math.floor((Date.now() - new Date(profile.birth_date)) / 31557600000)
    : 'inconnu';

  const equipment = Array.isArray(profile.equipment)
    ? profile.equipment.join(', ')
    : profile.equipment || 'non renseigné';

  const recentWeight = weightHistory?.length
    ? weightHistory[weightHistory.length - 1].weight
    : profile.weight_start;

  const journalSummary = (journals || []).map(j => {
    const parts = [];
    if (j.sante?.poids) parts.push(`poids ${j.sante.poids}kg`);
    if (j.sante?.fatigue !== undefined) parts.push(`fatigue ${j.sante.fatigue}/5`);
    if (j.sante?.douleur_genou !== undefined) parts.push(`genou ${j.sante.douleur_genou}/5`);
    if (j.alim?.hydratation !== undefined) parts.push(`eau ${j.alim.hydratation}L`);
    if (j.sport?.fait) parts.push(`sport: ${j.sport.type || 'oui'} ${j.sport.duree || ''}min`);
    if (j.hygiene?.qualite_sommeil) parts.push(`sommeil ${j.hygiene.qualite_sommeil}/5`);
    return `  - ${j.date}: ${parts.join(', ')}`;
  }).join('\n');

  return `Tu es un coach bien-être expert, bienveillant et précis. Voici le profil complet de ton patient :

PROFIL :
- Prénom : ${profile.first_name || 'Patient'}
- Âge : ${age} ans
- Sexe : ${profile.gender || 'non renseigné'}
- Profession : ${profile.profession || 'non renseigné'}
- Taille : ${profile.height || '?'} cm
- Poids de départ : ${profile.weight_start || '?'} kg
- Poids actuel : ${recentWeight || '?'} kg
- Objectif : ${profile.weight_target || '?'} kg
- Traitement : ${profile.treatment || 'aucun'} (${profile.treatment_frequency || ''})
- Problème genou : ${profile.knee_issue ? 'OUI — genou droit arthrosique' : 'non'}
- Équipement : ${equipment}
- Niveau fitness : ${profile.fitness_level || 'sédentaire'}

DONNÉES DES 7 DERNIERS JOURS :
${journalSummary || '  Aucune donnée disponible'}

ÉVOLUTION DU POIDS :
${weightHistory?.map(w => `  - ${w.date}: ${w.weight} kg`).join('\n') || '  Aucune pesée'}

Génère une analyse structurée avec exactement ce format :

📊 **Bilan de la semaine**
[Synthèse en 3-4 phrases sur les tendances générales observées]

🍽 **Nutrition — 3 conseils concrets**
1. [Conseil spécifique basé sur les données]
2. [Conseil spécifique basé sur les données]
3. [Conseil spécifique basé sur les données]

🏋️ **Sport — recommandations adaptées**
[2-3 paragraphes adaptés au profil]

💊 **Traitement — suivi**
[Point sur la régularité de la prise et les effets observés]

🎯 **Meilleur combo pour accélérer la perte de poids**
[Combinaison nutrition + sport + récupération]

✅ **3 actions prioritaires cette semaine**
1. [Action concrète et mesurable]
2. [Action concrète et mesurable]
3. [Action concrète et mesurable]`;
}

function buildQuestionPrompt(profile, question) {
  const age = profile.birth_date
    ? Math.floor((Date.now() - new Date(profile.birth_date)) / 31557600000)
    : 'inconnu';

  return `Tu es un coach bien-être expert et bienveillant.

PROFIL DU PATIENT :
- Prénom : ${profile.first_name || 'Patient'}, ${age} ans, ${profile.gender || ''}
- Poids : ${profile.weight_start || '?'} kg → objectif ${profile.weight_target || '?'} kg
- Traitement : ${profile.treatment || 'aucun'} (${profile.treatment_frequency || ''})
- Genou : ${profile.knee_issue ? 'problème genou droit arthrosique' : 'pas de problème'}
- Équipement : ${Array.isArray(profile.equipment) ? profile.equipment.join(', ') : profile.equipment || 'non renseigné'}
- Niveau : ${profile.fitness_level || 'sédentaire'}

QUESTION : ${question}

Réponds de manière personnalisée, pratique et bienveillante en 3-5 paragraphes.`;
}


app.post('/api/ai', async (req, res) => {
  const { type, profile, journals, weightHistory, question } = req.body;
  if (!type || !profile) return res.status(400).json({ error: 'Missing required fields' });

  try {
    let systemPrompt, userMessage;

    if (type === 'synthesis') {
      systemPrompt = 'Tu es un coach bien-être expert, spécialisé en perte de poids saine et durable, nutrition équilibrée, et activité physique adaptée.';
      userMessage = buildSynthesisPrompt(profile, journals, weightHistory);
    } else if (type === 'question') {
      if (!question) return res.status(400).json({ error: 'Missing question' });
      systemPrompt = 'Tu es un coach bien-être expert, bienveillant et à l\'écoute.';
      userMessage = buildQuestionPrompt(profile, question);
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    res.json({ response: message.content[0]?.text || '' });
  } catch (err) {
    console.error('AI error:', err);
    res.status(500).json({ error: 'AI service error', details: err.message });
  }
});


app.listen(PORT, () => {
  console.log(`\n🌿 Mon Coach Bien-Être`);
  console.log(`   → http://localhost:${PORT}`);
  console.log(`   → http://localhost:${PORT}/app.html\n`);
});
