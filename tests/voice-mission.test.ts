/**
 * 🎯 LA MISSION DE L'AGENT VOCAL — tests
 * ============================================================================
 * Ce que ces tests protègent :
 *   1. l'agent POSE la question qui rapporte (le CTA du marchand) et il note la
 *      demande : c'est ce qui transforme un appel en client ;
 *   2. le CTA est bien celui du marchand — pas un texte inventé par nous ;
 *   3. les langues cochées arrivent vraiment dans le prompt, et c'est TOUJOURS
 *      la langue du client qui gagne ;
 *   4. l'outil voyage dans le jeton (`Constrained`) : le navigateur ne peut ni
 *      le retirer ni en ajouter un autre ;
 *   5. le prompt reste minuscule : la connaissance vit dans la base, pas dans
 *      les consignes.
 */
import { describe, expect, it } from 'vitest';
import {
  LEAD_TOOL_NAME,
  LANGUAGE_LABELS,
  languageInstruction,
  leadToolDeclaration,
  liveTools,
  missionInstruction,
  normalizedLanguages,
  normalizedMission,
} from '../functions/_shared/voice/mission';
import { buildVoiceSystemPrompt } from '../functions/_shared/voice/prompt';
import { buildTokenSetup } from '../functions/_shared/voice/live';
import { DEFAULT_SITE_CHAT, buildSiteVoicePrompt, normalizeSiteChat } from '../functions/_shared/site-chat';

const KB = '- Horaires : de 9h à 18h, fermé le vendredi.\n- Livraison : 48 h à Blida, Alger et Oran.';

describe('la mission du marchand (le CTA)', () => {
  it('par défaut, l’agent veut les coordonnées et note nom + numéro + besoin', () => {
    const mission = normalizedMission(undefined);
    expect(mission).toMatchObject({ enabled: true, goal: 'lead', collect: ['nom', 'telephone', 'besoin'] });
  });

  it('respecte le choix du marchand : objectif, CTA et champs', () => {
    const mission = normalizedMission({ goal: 'appointment', cta: 'Prendre rendez-vous', collect: ['nom', 'telephone', 'date'] });
    expect(mission.goal).toBe('appointment');
    const line = missionInstruction(mission);
    expect(line).toContain('Prendre rendez-vous');
    expect(line).toMatch(/FIXER UN RENDEZ-VOUS/);
    expect(line).toContain(LEAD_TOOL_NAME);
  });

  it('refuse les valeurs inconnues (objectif, champs) sans jamais planter', () => {
    const mission = normalizedMission({ goal: 'devenir-riche', collect: ['telephone', 'numero-de-carte'] });
    expect(mission.goal).toBe('lead');
    expect(mission.collect).toEqual(['telephone']);
  });

  it('une mission coupée = aucun outil dans le jeton (le chat reste)', () => {
    const off = normalizedMission({ enabled: false, goal: 'lead' });
    expect(off.enabled).toBe(false);
    expect(liveTools(off)).toEqual([]);
    expect(missionInstruction(off)).toBe('');
  });

  it('l’outil demande toujours le téléphone et sait trier la demande', () => {
    const decl = leadToolDeclaration(normalizedMission(undefined));
    expect(decl.name).toBe(LEAD_TOOL_NAME);
    expect((decl.parameters as any).required).toContain('telephone');
    expect((decl.parameters as any).properties.type_demande.enum).toContain('rendez-vous');
    expect(decl.description).toMatch(/nom et le numéro/i);
  });

  it('l’outil voyage DANS le jeton (le navigateur ne peut pas le changer)', () => {
    const withTool = buildTokenSetup('gemini-3.8-live', 'Puck', 'SYS', liveTools(normalizedMission(undefined))) as any;
    expect(withTool.tools[0].functionDeclarations[0].name).toBe(LEAD_TOOL_NAME);
    const without = buildTokenSetup('gemini-3.8-live', 'Puck', 'SYS') as any;
    expect(without.tools).toBeUndefined();
  });
});

describe('les langues de l’agent', () => {
  it('ne garde que des langues connues, dans l’ordre choisi', () => {
    expect(normalizedLanguages(['fr', 'darija', 'klingon'])).toEqual(['fr', 'darija']);
    expect(normalizedLanguages('ar')).toEqual(['ar']);
    expect(normalizedLanguages('auto')).toEqual([]);
  });

  it('la consigne garde TOUJOURS la langue du client gagnante', () => {
    const line = languageInstruction(['darija', 'fr']);
    expect(line).toContain(LANGUAGE_LABELS.darija);
    expect(line).toContain(LANGUAGE_LABELS.fr);
    expect(line).toMatch(/TOUJOURS dans la langue que le client/);
    expect(line).not.toContain(LANGUAGE_LABELS.en);
  });

  it('les langues cochées arrivent dans le prompt de l’agent (et rien d’autre)', () => {
    const prompt = buildVoiceSystemPrompt(
      { businessName: 'Boutique Nour' },
      KB,
      '',
      { mission: normalizedMission({ goal: 'lead', cta: 'Laisser un numéro' }), languages: normalizedLanguages(['darija', 'ar']) },
    );
    expect(prompt).toContain('Laisser un numéro');
    expect(prompt).toContain(LANGUAGE_LABELS.darija);
    expect(prompt).toContain('Horaires : de 9h à 18h');
    // Le prompt reste minuscule : la connaissance vit dans la base, pas ici.
    expect(prompt.length).toBeLessThan(6_000);
  });
});

describe('le site vitrine : son CTA et ses langues', () => {
  it('l’agent du site propose de créer un assistant gratuitement et note le contact', () => {
    const prompt = buildSiteVoicePrompt(DEFAULT_SITE_CHAT);
    expect(prompt).toContain('Créer son assistant gratuitement');
    expect(prompt).toContain(LEAD_TOOL_NAME);
    expect(prompt).toContain(LANGUAGE_LABELS.darija);
  });

  it('les réglages du site gardent les langues et la mission (assainis)', () => {
    const config = normalizeSiteChat({
      widget: {
        voice: {
          enabled: true,
          languages: ['fr', 'ar', 'nawak'],
          mission: { enabled: true, goal: 'appointment', cta: 'Prendre rendez-vous', collect: ['nom', 'telephone', 'date'] },
        },
      },
    });
    expect(config.widget.voice.languages).toEqual(['fr', 'ar']);
    expect(config.widget.voice.mission).toMatchObject({ goal: 'appointment', cta: 'Prendre rendez-vous' });
    expect(config.widget.voice.mission.collect).toContain('date');
  });
});
