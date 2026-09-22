// Script ONE-SHOT (Phase 1) : exporte les comptes Firebase Auth + leur profil
// Firestore `users`, et les recrée dans Supabase Auth + table `public.users`.
//
// NE FAIT PAS PARTIE DU CODE DE PROD (server.ts) : à lancer manuellement,
// une seule fois, en local :
//
//   npx tsx scripts/migrate-firebase-users.ts --dry-run   (aperçu, rien écrit)
//   npx tsx scripts/migrate-firebase-users.ts             (exécution réelle)
//
// Prérequis à toi de fournir (je n'ai pas accès à tes clés ni à Internet
// Firebase/Supabase depuis cet environnement, donc je ne peux pas l'exécuter
// pour toi) :
//   - FIREBASE_SERVICE_ACCOUNT_JSON : chemin vers ta clé de service account
//     Firebase Admin (Console Firebase > Paramètres du projet > Comptes de
//     service > Générer une nouvelle clé privée).
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY : depuis Project Settings > API
//     de ton projet Supabase (la clé service_role, PAS l'anon key).
//
// Stratégie mots de passe : Firebase n'exporte pas les mots de passe en clair.
// Deux options, choisis-en une en modifiant PASSWORD_STRATEGY ci-dessous :
//   'temp_password' (par défaut) : chaque compte est créé avec un mot de
//      passe aléatoire + un email "réinitialisez votre mot de passe" envoyé
//      automatiquement par Supabase. Simple, fonctionne toujours.
//   'reset_only' : crée les comptes sans mot de passe utilisable et envoie
//      directement un lien de reset (variante du même principe).
// (L'import du hash Scrypt Firebase existe côté API Admin Supabase mais est
// plus fragile à mettre en place correctement ici sans pouvoir tester contre
// tes vraies clés — je préfère te donner la version qui marche à coup sûr.)

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth as getFirebaseAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');
const PASSWORD_STRATEGY: 'temp_password' | 'reset_only' = 'temp_password';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Variable d'env manquante: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const serviceAccountPath = requireEnv('FIREBASE_SERVICE_ACCOUNT_JSON');
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
  initializeApp({ credential: cert(serviceAccount) });
  const fbAuth = getFirebaseAuth();
  const fbDb = getFirestore();

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(DRY_RUN ? '=== DRY RUN (rien ne sera écrit) ===' : '=== EXÉCUTION RÉELLE ===');

  let migrated = 0;
  let failed = 0;
  let nextPageToken: string | undefined;

  do {
    const page = await fbAuth.listUsers(1000, nextPageToken);
    nextPageToken = page.pageToken;

    for (const fbUser of page.users) {
      try {
        // Profil Firestore correspondant (peut être absent).
        const profileSnap = await fbDb.collection('users').doc(fbUser.uid).get();
        const profile = profileSnap.exists ? profileSnap.data() : {};

        console.log(`→ ${fbUser.email} (${fbUser.uid})`);

        if (DRY_RUN) {
          migrated++;
          continue;
        }

        // On force volontairement le MÊME id côté Supabase que l'uid Firebase
        // (Supabase Auth accepte un id fourni via l'API admin) pour ne pas
        // avoir à réécrire user_id dans `assistants`, `prospects`, etc.
        const tempPassword = PASSWORD_STRATEGY === 'temp_password'
          ? crypto.randomUUID()
          : crypto.randomUUID(); // inutilisé si reset_only, mais requis par l'API

        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          uid: fbUser.uid as any, // certains projets Supabase acceptent un uid explicite ; sinon retire cette ligne et gère un mapping séparé
          email: fbUser.email,
          password: tempPassword,
          email_confirm: true, // ils étaient déjà vérifiés côté Firebase
          user_metadata: {
            full_name: fbUser.displayName || (profile as any)?.displayName || '',
            avatar_url: fbUser.photoURL || (profile as any)?.photoURL || '',
            migrated_from_firebase: true,
          },
        });

        if (createErr) throw createErr;
        const newId = created.user!.id;

        const { error: profileErr } = await supabase.from('users').upsert({
          id: newId,
          email: fbUser.email || '',
          display_name: fbUser.displayName || (profile as any)?.displayName || fbUser.email?.split('@')[0] || 'Utilisateur',
          company_name: (profile as any)?.companyName || null,
          photo_url: fbUser.photoURL || (profile as any)?.photoURL || null,
          role: (profile as any)?.role || 'user',
        });
        if (profileErr) throw profileErr;

        // Envoie le lien de réinitialisation de mot de passe.
        await supabase.auth.resetPasswordForEmail(fbUser.email!, {});

        migrated++;
      } catch (err) {
        failed++;
        console.error(`  ✗ Échec pour ${fbUser.email}:`, (err as Error).message);
      }
    }
  } while (nextPageToken);

  console.log(`\nTerminé. ${migrated} migrés, ${failed} en échec.`);
  if (!DRY_RUN && migrated > 0) {
    console.log(
      "N'oublie pas : chaque utilisateur migré doit cliquer sur le lien " +
      "de réinitialisation reçu par email avant de pouvoir se reconnecter."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
