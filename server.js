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

function injectConfig(html) {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const tag = `<script>window.__SB_URL__=${JSON.stringify(url)};window.__SB_KEY__=${JSON.stringify(key)};</script>`;
  return html.replace('</head>', tag + '\n</head>');
}

const indexHtml = injectConfig(fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'));
const appHtml   = injectConfig(fs.readFileSync(path.join(__dirname, 'public', 'app.html'), 'utf8'));

app.use(express.json());

// HTML routes before express.static so config injection takes precedence
app.get('/',           (_req, res) => res.type('html').send(indexHtml));
app.get('/index.html', (_req, res) => res.type('html').send(indexHtml));
app.get('/app.html',   (_req, res) => res.type('html').send(appHtml));
app.get('/app',        (_req, res) => res.type('html').send(appHtml));

app.use(express.static(path.join(__dirname, 'public')));

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
