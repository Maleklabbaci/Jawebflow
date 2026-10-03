import React, { useState, useEffect, useRef } from 'react';
import {
  Instagram,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  Send,
  Loader2,
  MessageSquare,
  Bell,
} from 'lucide-react';
import { Stepper, type StepDef } from './dashboard/Stepper';
import { Toggle } from './automations/ui';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { LEGACY_DEFAULT_GREETING } from '../../functions/_shared/ig-automation-core';

export interface InstagramIntegrationData {
  connected: boolean;
  assistantId?: string;
  instagramUserId?: string;
  instagramUsername?: string;
  pageId?: string;
  pageName?: string;
  profilePictureUrl?: string;
  autoReplyEnabled: boolean;
  respondToStories: boolean;
  respondToComments: boolean;
  assistantTone: string;
  customGreeting?: string;
  lastConnectedAt?: any;
  webhookStatus?: 'active' | 'pending' | 'error';
  totalMessagesHandled?: number;
  unresolvedCount?: number;
}

interface InstagramIntegrationProps {
  assistantId: string;
  businessName: string;
  websiteUrl?: string;
  knowledgeNotes?: Array<{ id?: string; title: string; content: string; category?: string }>;
  onGoToSimulator?: () => void;
  /** Ouvre l'onglet « Automatisations » (commentaires, mots-clés, stories). */
  onGoToAutomations?: () => void;
  /** Venu des Automatisations : met en avant « Autoriser les commentaires ». */
  highlightCommentsAuth?: boolean;
}

const IG_STEPS: StepDef[] = [
  { id: 'connect', label: 'Connexion' },
  { id: 'rules', label: 'Réglages' },
  { id: 'test', label: 'Test' },
];

export const InstagramIntegration: React.FC<InstagramIntegrationProps> = ({
  assistantId,
  businessName,
  websiteUrl = '',
  knowledgeNotes = [],
  onGoToSimulator,
  highlightCommentsAuth = false
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [saveLoading, setSaveLoading] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  // 🔔 Alertes Instagram : le compte officiel JawebFlow envoie les leads et
  // les demandes d'aide humaine en DM au marchand (10 s d'activation, une fois).
  // Parcours clair : 1) le code se COPIE en un clic — 2) un bouton ouvre la
  // discussion avec le message déjà pré-rempli (coller en secours) — 3) Envoyer.
  const [notifEnabled, setNotifEnabled] = useState<boolean>(false);
  const [notifBusy, setNotifBusy] = useState<boolean>(false);
  const [notifCode, setNotifCode] = useState<string>('');
  const [notifLink, setNotifLink] = useState<string>('');
  const [codeCopied, setCodeCopied] = useState<boolean>(false);

  const activateNotifs = async () => {
    setNotifBusy(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token || null;
      const res = await fetch('/api/instagram/notify-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ assistantId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.link) {
        setNotifCode(String(data.code || ''));
        setNotifLink(String(data.link));
        setCodeCopied(false);
        try {
          await navigator.clipboard.writeText(String(data.code || ''));
          setCodeCopied(true);
        } catch { /* bouton manuel à l'étape 1 */ }
      } else {
        setNotification({ type: 'error', message: data.error || "Activation impossible pour le moment." });
      }
    } catch {
      setNotification({ type: 'error', message: 'Réseau indisponible.' });
    }
    setNotifBusy(false);
  };

  const copyNotifCode = async () => {
    if (!notifCode) return;
    try {
      await navigator.clipboard.writeText(notifCode);
      setCodeCopied(true);
    } catch { /* navigateur ancien : sélection manuelle */ }
  };

  // Integration Configuration State
  const [integrationData, setIntegrationData] = useState<InstagramIntegrationData>({
    connected: false,
    instagramUsername: '',
    pageName: '',
    autoReplyEnabled: true,
    respondToStories: true,
    respondToComments: false,
    assistantTone: 'professionnel',
    customGreeting: '',
    webhookStatus: 'active',
    totalMessagesHandled: 0,
    unresolvedCount: 0
  });

  // ── Parcours en 3 étapes (hooks tout en haut : avant tout « return » anticipé) ──
  const [step, setStep] = useState(0);
  const [connectionJustVerified, setConnectionJustVerified] = useState(false);
  useEffect(() => {
    // Un compte déjà lié s’ouvre directement sur ses réglages. Après une nouvelle
    // connexion OAuth, on reste au contraire sur Connexion pour montrer la preuve.
    if (integrationData.connected && !connectionJustVerified) setStep((cur) => (cur === 0 ? 1 : cur));
  }, [integrationData.connected, connectionJustVerified]);
  const maxReachable = integrationData.connected ? 2 : 0;

  // Simulator / Test State for Instagram DM
  const [testDmInput, setTestDmInput] = useState('');
  const [testDmMessages, setTestDmMessages] = useState<Array<{ sender: 'user' | 'bot'; text: string; time: string }>>([
    {
      sender: 'bot',
      text: 'Salam 👋 Bienvenue sur notre page Instagram ! Comment puis-je vous aider ?',
      time: 'À l\'instant'
    }
  ]);
  const [isTestingDm, setIsTestingDm] = useState(false);
  const [repairingSubscription, setRepairingSubscription] = useState(false);

  // Empêche de renvoyer deux fois le même code d'autorisation Meta à
  // /api/instagram/oauth/exchange (les codes OAuth sont à usage unique ;
  // un double envoi déclenche l'erreur "invalid client_secret and code").
  const processedAuthCodesRef = useRef<Set<string>>(new Set());
  // Pour détecter une connexion ANNULÉE (fenêtre Meta fermée sans valider) et ne pas rester bloqué sur « en cours… ».
  const exchangeInFlightRef = useRef(false);
  const popupWatchRef = useRef<number | null>(null);
  useEffect(() => () => { if (popupWatchRef.current) window.clearInterval(popupWatchRef.current); }, []);

  // Local storage cache keys for offline resilience
  const getCacheKey = (uid: string) => `jawebflow_ig_config_${uid}`;

  const loadLocalCache = (uid: string): InstagramIntegrationData | null => {
    try {
      const cached = localStorage.getItem(getCacheKey(uid));
      if (cached) return JSON.parse(cached);
    } catch (e) {
      // Ignore JSON parse errors
    }
    return null;
  };

  const saveLocalCache = (uid: string, data: InstagramIntegrationData) => {
    try {
      localStorage.setItem(getCacheKey(uid), JSON.stringify(data));
    } catch (e) {
      // Ignore storage quota errors
    }
  };

  // Remplace les anciens `doc(db,...)/getDoc/setDoc` Firestore : la table
  // Supabase `instagram_integrations` est en RLS service_role uniquement,
  // donc on passe par /api/instagram/integration avec le jeton Supabase.
  const authHeader = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const loadRemoteIntegration = async (): Promise<Partial<InstagramIntegrationData> | null> => {
    const res = await fetch('/api/instagram/integration', { headers: await authHeader() });
    if (!res.ok) return null;
    const { data } = await res.json();
    return data || null;
  };

  const saveRemoteIntegration = async (patch: Partial<InstagramIntegrationData>): Promise<boolean> => {
    try {
      const res = await fetch('/api/instagram/integration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(patch)
      });
      if (!res.ok) {
        console.warn('[instagram] sauvegarde serveur refusée:', res.status, (await res.text().catch(() => '')).slice(0, 200));
        return false;
      }
      return true;
    } catch (e: any) {
      console.warn('[instagram] sauvegarde serveur impossible:', e?.message || e);
      return false;
    }
  };

  // Load existing Instagram connection from Firestore or Local Cache
  useEffect(() => {
    let isMounted = true;
    const fetchInstagramData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      // Step 1: Pre-populate from local cache immediately
      const cached = loadLocalCache(user.uid);
      if (cached && isMounted) {
        setIntegrationData(prev => ({
          ...prev,
          ...cached
        }));
      }

      // Step 2: Sync with Supabase (via l'API, RLS service_role) avec repli local
      try {
        const data = await loadRemoteIntegration();
        if (data && isMounted) {
          const merged = { ...integrationData, ...data, assistantId: (data as any).assistantId || assistantId };
          // L'ancien texte pré-rempli n'a jamais été un choix du marchand : le serveur l'ignore, donc on ne l'affiche pas.
          if (merged.customGreeting === LEGACY_DEFAULT_GREETING) merged.customGreeting = '';
          setIntegrationData(merged);
          saveLocalCache(user.uid, merged);
          if (assistantId && (data as any).assistantId !== assistantId) {
            await saveRemoteIntegration({ assistantId });
          }
        }
      } catch (err: any) {
        console.warn('Note: Chargement Supabase Instagram en mode local/cache:', err?.message || err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInstagramData();

    // Process and exchange incoming Instagram Authorization Code with our backend or direct activation
    const processAuthCode = async (rawCode: string) => {
      exchangeInFlightRef.current = true;
      try {
        await processAuthCodeInner(rawCode);
      } finally {
        exchangeInFlightRef.current = false;
      }
    };
    const processAuthCodeInner = async (rawCode: string) => {
      if (!rawCode) return;

      // Sanitize authorization code (Meta appends #_ at the end)
      const cleanCode = rawCode.split('#')[0].replace(/_$/, '').trim();

      // Garde-fou anti double-soumission : un code Meta ne peut être échangé qu'une fois.
      if (processedAuthCodesRef.current.has(cleanCode)) return;
      processedAuthCodesRef.current.add(cleanCode);

      setIsConnecting(true);

      let serverResult: any = null;

      try {
        const response = await fetch('/api/instagram/oauth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            code: cleanCode, 
            userId: user?.uid,
            assistantId,
            redirectUri: `${window.location.origin}/`
          })
        });

        const text = await response.text();
        if (text && text.trim()) {
          try {
            serverResult = JSON.parse(text);
          } catch (parseErr) {
            console.warn('Réponse serveur non JSON:', parseErr);
            serverResult = { error: text.slice(0, 240) };
          }
        }
        if (!response.ok && !serverResult) {
          serverResult = { error: `Erreur serveur OAuth (${response.status})` };
        }
      } catch (netErr) {
        console.warn('Exchange API network notice (static hosting environment):', netErr);
      }

      if (!serverResult?.success || !serverResult?.accessToken || !serverResult?.instagramUserId || !serverResult?.instagramUsername) {
        setIsConnecting(false);
        const rawOauthError = String(serverResult?.error || '');
        const alreadyUsed = /authorization code has been used/i.test(rawOauthError);
        setNotification(alreadyUsed ? {
          type: 'success',
          message: '✅ Meta indique que ce code a déjà été utilisé : la connexion a DÉJÀ été enregistrée (aucun problème). Si « Compte connecté » s’affiche ci-dessous, tout est en ordre — envoie simplement un message privé à ton compte pour tester la réponse.'
        } : {
          type: 'error',
          message: `Connexion Instagram refusée : ${rawOauthError || 'Meta n’a pas renvoyé de jeton valide.'}`
        });
        return;
      }

      // Les commentaires ont-ils été autorisés ? (information confirmée par Meta) : si oui, une
      // simple « reconnexion » demandera de nouveau cette autorisation (sinon elle serait perdue).
      if (user?.uid && Array.isArray(serverResult.permissions) && serverResult.permissions.length) {
        try {
          const key = `jawebflow_ig_comments_ok_${user.uid}`;
          if (serverResult.permissions.includes('instagram_business_manage_comments')) localStorage.setItem(key, '1');
          else localStorage.removeItem(key);
        } catch { /* stockage indisponible */ }
      }

      // Seules les données confirmées par Meta peuvent activer l’intégration.
      const finalUsername = String(serverResult.instagramUsername).trim();
      const finalUserId = String(serverResult.instagramUserId);
      const finalPageName = serverResult.accountName || finalUsername;
      const finalAccessToken = serverResult.accessToken;

      // L'échange serveur tente aussi d'abonner le compte aux événements "messages".
      // Sans cet abonnement Meta n'enverra jamais les DM entrants au webhook.
      const isSubscribed = serverResult.subscribed === true;

      const updatedPayload: InstagramIntegrationData = {
        ...integrationData,
        connected: true,
        assistantId,
        instagramUserId: finalUserId,
        instagramUsername: finalUsername,
        pageName: finalPageName,
        accessToken: finalAccessToken || integrationData.accessToken || '',
        // Première connexion : tout est activé. Reconnexion : on GARDE les choix du marchand.
        autoReplyEnabled: integrationData.connected ? integrationData.autoReplyEnabled : true,
        respondToStories: integrationData.connected ? integrationData.respondToStories : true,
        respondToComments: false,
        lastConnectedAt: new Date().toISOString(),
        webhookStatus: isSubscribed ? 'active' : 'error',
        totalMessagesHandled: integrationData.totalMessagesHandled || 0,
        unresolvedCount: 0
      };

      // La connexion est-elle VRAIMENT mémorisée côté serveur ?
      // L'échange serveur sauvegarde déjà le lien Meta ; on complète TOUJOURS
      // avec les données du tableau de bord (assistant, ton, accueil...) :
      // c'est CE rattachement qui donne accès à la base de connaissances.
      let serverSaved = serverResult.serverSaved === true;
      if (user?.uid) {
        saveLocalCache(user.uid, updatedPayload);
        const dashboardSaved = await saveRemoteIntegration(updatedPayload);
        serverSaved = serverSaved || dashboardSaved;
      }

      setIntegrationData(updatedPayload);
      setConnectionJustVerified(true);
      setStep(0);
      setIsConnecting(false);

      if (!serverSaved) {
        setNotification({
          type: 'error',
          message: `⚠️ Compte connecté chez Meta, MAIS la mémorisation sur le serveur a échoué (${serverResult.saveError || 'raison inconnue'}) : le robot ne pourra pas répondre. Déconnecte puis reconnecte le compte ; si ça persiste, vérifie la table instagram_integrations.`
        });
      } else if (isSubscribed) {
        setNotification({
          type: 'success',
          message: `Compte Instagram (${finalUsername}) connecté, mémorisé sur le serveur et abonné aux messages. L'IA est prête pour vos DMs.`
        });
      } else {
        setNotification({
          type: 'error',
          message: `Compte connecté, mais la réception des messages privés n'a pas pu être activée. Cliquez sur « Terminer la connexion » ci-dessous.`
        });
      }
    };

    // 1. Check for incoming Instagram Authorization Code in direct URL params (e.g. mobile redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const oauthError = urlParams.get('error_description') || urlParams.get('error_reason') || urlParams.get('error');
    if (oauthError && user) {
      setNotification({ type: 'error', message: `Meta a refusé l’autorisation : ${oauthError}` });
    }
    let authCode = urlParams.get('code');
    // FIX « This authorization code has been used » : le code de connexion Meta
    // est à USAGE UNIQUE. Il était retiré du stockage uniquement quand il
    // provenait du stockage — quand il venait de l'URL, il Y RESTAIT et un
    // simple retour sur cette page le renvoyait à Meta (déjà consommé) →
    // erreur affichée ALORS QUE la connexion avait réussi. On le consomme
    // maintenant une seule fois, quel que soit son origine.
    try {
      const storedCode = localStorage.getItem('jawebflow_last_ig_auth_code');
      if (!authCode && storedCode) authCode = storedCode;
      // On ne consomme le code QUE si l'utilisateur est chargé (sinon on le
      // garde : l'effet se relance à l'arrivée de la session). Le jeter
      // prématurément perdait la connexion — faux « connecté » jamais sauvé.
      if (storedCode && user) localStorage.removeItem('jawebflow_last_ig_auth_code');
    } catch (e) {
      // Safe fallback
    }

    if (authCode && user && !oauthError) {
      window.history.replaceState({}, document.title, window.location.pathname);
      processAuthCode(authCode);
    } else if (authCode && !user) {
      try { localStorage.setItem('jawebflow_last_ig_auth_code', authCode); } catch { /* ignore */ }
    }

    // 2. Listen for messages sent from popup window
    const handlePopupAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'INSTAGRAM_AUTH_SUCCESS' && user) {
        const incomingCode = event.data?.code;
        if (incomingCode) {
          processAuthCode(incomingCode);
        }
      }
    };

    window.addEventListener('message', handlePopupAuthMessage);

    return () => { 
      isMounted = false; 
      window.removeEventListener('message', handlePopupAuthMessage);
    };
  }, [user?.uid, businessName]);

    // Ouvre le vrai flux Instagram Login de Meta. La connexion n'est validée
  // qu'après retour d'un code OAuth échangé côté serveur contre un token réel.
  // Venu des Automatisations pour autoriser les commentaires : on amène la carte à l'écran.
  useEffect(() => {
    if (highlightCommentsAuth && !loading) {
      document.getElementById('instagram-comments-card')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightCommentsAuth, loading]);

  const BASE_SCOPES = ['instagram_business_basic', 'instagram_business_manage_messages'];
  // Autorisation SUPPLÉMENTAIRE demandée à part : si l'application Meta ne l'a pas
  // encore activée, seule cette demande échoue — la connexion normale reste intacte.
  const COMMENT_SCOPES = [...BASE_SCOPES, 'instagram_business_manage_comments'];

  const startOAuth = async (scopes: string[]) => {
    if (!user) {
      setNotification({ type: 'error', message: 'Vous devez être connecté à JawebFlow pour lier Instagram.' });
      return;
    }

    // L’App ID Meta est public ; le secret reste exclusivement côté serveur.
    const appId = '1376023754506953';
    const redirectUri = `${window.location.origin}/`;
    const scope = scopes.join(',');
    const oauthUrl = new URL('https://www.instagram.com/oauth/authorize');
    oauthUrl.searchParams.set('client_id', appId);
    oauthUrl.searchParams.set('redirect_uri', redirectUri);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('scope', scope);

    setIsConnecting(true);
    setNotification({ type: 'info', message: 'Validez les autorisations dans la fenêtre Meta qui vient de s’ouvrir.' });
    const popup = window.open(oauthUrl.toString(), 'instagram-oauth', 'width=560,height=760,menubar=no,toolbar=no');
    if (!popup) {
      setIsConnecting(false);
      setNotification({ type: 'error', message: 'La fenêtre Meta a été bloquée. Autorisez les fenêtres pop-up puis réessayez.' });
      return;
    }
    // Fenêtre fermée sans valider (annulation) : on débloque le bouton au lieu de rester sur « en cours… ».
    // Le popup se ferme ~0,3 s APRÈS avoir transmis le code : on laisse l'échange démarrer avant de conclure.
    if (popupWatchRef.current) window.clearInterval(popupWatchRef.current);
    popupWatchRef.current = window.setInterval(() => {
      if (!popup.closed) return;
      if (popupWatchRef.current) window.clearInterval(popupWatchRef.current);
      popupWatchRef.current = null;
      window.setTimeout(() => {
        if (exchangeInFlightRef.current) return;
        setIsConnecting(false);
        setNotification((prev) => (prev?.type === 'error' || prev?.type === 'success' ? prev : { type: 'info', message: 'Connexion annulée : rien n’a été modifié.' }));
      }, 1500);
    }, 500);
  };

  /** Connecter / reconnecter (messages privés). */
  const commentsAlreadyAuthorized = () => {
    try { return Boolean(user?.uid && localStorage.getItem(`jawebflow_ig_comments_ok_${user.uid}`)); } catch { return false; }
  };
  const handleConnectInstagram = () => startOAuth(commentsAlreadyAuthorized() ? COMMENT_SCOPES : BASE_SCOPES);
  /** Autoriser aussi les commentaires (réponses publiques + message privé après commentaire). */
  const handleAuthorizeComments = () => startOAuth(COMMENT_SCOPES);

  // Disconnect Instagram Account
  const handleDisconnect = async () => {
    if (!user) return;
    if (!window.confirm("Êtes-vous sûr de vouloir déconnecter votre compte Instagram de JawebFlow ? Le bot arrêtera de répondre aux DMs.")) {
      return;
    }

    try {
      setSaveLoading(true);
      const disconnectedPayload: InstagramIntegrationData = {
        ...integrationData,
        connected: false,
        webhookStatus: 'pending'
      };

      saveLocalCache(user.uid, disconnectedPayload);
      setConnectionJustVerified(false);
      setIntegrationData(disconnectedPayload);

      try {
        await saveRemoteIntegration({ connected: false, webhookStatus: 'pending' });
      } catch (fsErr) {
        // Safe offline fallback
      }

      setNotification({
        type: 'info',
        message: 'Le compte Instagram a été déconnecté avec succès.'
      });
    } catch (err) {
      console.error('Erreur de déconnexion Instagram:', err);
    } finally {
      setSaveLoading(false);
    }
  };

  // Enregistre les réglages (accueil, ton) — et dit la VÉRITÉ si ça a échoué.
  // On n'envoie QUE ces champs : renvoyer l'ancien jeton Meta gardé par le navigateur
  // écraserait le jeton renouvelé automatiquement par le serveur.
  const handleSaveSettings = async () => {
    if (!user) return;
    setSaveLoading(true);
    const ok = await saveRemoteIntegration({
      autoReplyEnabled: integrationData.autoReplyEnabled,
      respondToStories: integrationData.respondToStories,
      assistantTone: integrationData.assistantTone,
      customGreeting: (integrationData.customGreeting || '').trim()
    });
    setSaveLoading(false);
    if (ok) {
      saveLocalCache(user.uid, integrationData);
      setNotification({ type: 'success', message: 'Tes réglages Instagram sont enregistrés.' });
      setTimeout(() => setNotification(null), 4000);
    } else {
      setNotification({ type: 'error', message: 'L’enregistrement a échoué. Vérifie ta connexion internet puis réessaie.' });
    }
  };

  // Interrupteurs : appliqués TOUT DE SUITE (plus besoin de penser à « Enregistrer »).
  const toggleSetting = async (key: 'autoReplyEnabled' | 'respondToStories') => {
    if (!user) return;
    const next = !integrationData[key];
    setIntegrationData(prev => ({ ...prev, [key]: next }));
    const ok = await saveRemoteIntegration({ [key]: next });
    if (!ok) {
      setIntegrationData(prev => ({ ...prev, [key]: !next }));
      setNotification({ type: 'error', message: 'Le changement n’a pas pu être enregistré. Réessaie dans un instant.' });
      return;
    }
    saveLocalCache(user.uid, { ...integrationData, [key]: next });
    setNotification({
      type: 'success',
      message: key === 'autoReplyEnabled'
        ? (next ? 'Les réponses de l’IA sont activées.' : 'Les réponses de l’IA sont en pause. Tes automatisations par mots-clés continuent de répondre.')
        : (next ? 'L’IA répondra aux réponses à tes stories.' : 'L’IA ne répondra plus aux réponses à tes stories (tes règles « story » continuent).')
    });
    setTimeout(() => setNotification(null), 4000);
  };

  // Simulateur : pose VRAIMENT la question à l'assistant (mêmes informations que sur Instagram).
  // Aucune réponse inventée : si l'assistant est injoignable, on le dit.
  const handleSendTestDm = async () => {
    if (!testDmInput.trim() || isTestingDm) return;

    const userText = testDmInput.trim();
    setTestDmInput('');
    const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const botSays = (text: string) => setTestDmMessages(prev => [...prev, { sender: 'bot', text, time: now() }]);

    setTestDmMessages(prev => [...prev, { sender: 'user', text: userText, time: now() }]);
    setIsTestingDm(true);

    try {
      if (!assistantId) {
        botSays('Configure d’abord ton assistant (onglets « Mon site web » ou « Mes informations ») pour pouvoir le tester ici.');
        return;
      }
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assistantId, businessName, website: websiteUrl, knowledgeNotes, message: userText })
      });
      const data = await response.json().catch(() => ({}));
      const reply = response.ok ? String(data?.text || data?.message || '').trim() : '';
      botSays(reply || 'Je n’ai pas pu joindre l’assistant pour le moment. Vérifie ta connexion puis réessaie.');
    } catch {
      botSays('Je n’ai pas pu joindre l’assistant pour le moment. Vérifie ta connexion puis réessaie.');
    } finally {
      setIsTestingDm(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
        <p className="text-sm font-medium text-slate-600">Chargement de la connexion Instagram...</p>
      </div>
    );
  }

  const webhookCallbackUrl = 'https://jawebflow.pages.dev/api/webhook/instagram';
  // Le serveur peut enregistrer le pseudo avec ou sans « @ » : on l'affiche toujours pareil.
  const igHandle = integrationData.instagramUsername ? `@${integrationData.instagramUsername.replace(/^@/, '')}` : '';

  // Réabonne manuellement le compte connecté aux événements "messages".
  // Nécessaire pour toute connexion établie AVANT ce correctif : le token est
  // valide mais Meta n'a jamais été informé qu'il doit pousser les DM au webhook.
  const handleRepairSubscription = async () => {
    if (!user?.uid || !integrationData.connected) {
      setNotification({ type: 'error', message: "Connecte d'abord ton compte Instagram." });
      return;
    }
    setRepairingSubscription(true);
    try {
      const res = await fetch('/api/instagram/diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ action: 'subscribe' })
      });
      const data = await res.json().catch(() => ({}));
      const success = res.ok && data?.success === true;

      const updatedPayload: InstagramIntegrationData = {
        ...integrationData,
        webhookStatus: success ? 'active' : 'error'
      };
      setIntegrationData(updatedPayload);
      saveLocalCache(user.uid, updatedPayload);

      setNotification({
        type: success ? 'success' : 'error',
        message: success
          ? (data?.message || 'Terminé : Instagram transmettra désormais tes messages privés à l’assistant.')
          : `Échec de la réparation : ${data?.error || 'la connexion a probablement expiré, reconnecte ton compte.'}`
      });
    } catch (e: any) {
      setNotification({ type: 'error', message: e?.message || "Erreur réseau pendant la réparation de l'abonnement." });
    } finally {
      setRepairingSubscription(false);
    }
  };

  const card = 'rounded-[28px] bg-white p-6 sm:p-8 shadow-[0_1px_2px_rgba(27,22,71,0.04)]';
  const primary = 'inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#a23dff] to-[#5a2cff] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_22px_-12px_rgba(110,50,255,0.7)] transition hover:brightness-110 disabled:opacity-50 cursor-pointer';
  const ghost = 'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-slate-500 transition hover:bg-slate-100 cursor-pointer';

  const rows: Array<{ key: 'autoReplyEnabled' | 'respondToStories'; title: string; hint: string }> = [
    { key: 'autoReplyEnabled', title: 'Répondre à mes messages privés', hint: 'L’assistant répond tout de suite à tes clients, jour et nuit.' },
    { key: 'respondToStories', title: 'Répondre aux réponses à mes stories', hint: 'Quand un abonné répond à une story, l’assistant lui répond.' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-in fade-in duration-200">
      {notification && (
        <div role="status" className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm ${
          notification.type === 'success' ? 'bg-emerald-50 text-emerald-800'
          : notification.type === 'error' ? 'bg-rose-50 text-rose-800'
          : 'bg-indigo-50 text-indigo-800'
        }`}>
          <span className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : notification.type === 'error' ? <AlertCircle className="h-4 w-4 shrink-0" /> : <Sparkles className="h-4 w-4 shrink-0" />}
            {notification.message}
          </span>
          <button type="button" onClick={() => setNotification(null)} className="text-xs font-semibold opacity-70 hover:opacity-100">Fermer</button>
        </div>
      )}

      {integrationData.connected && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white px-5 py-3 shadow-[0_1px_2px_rgba(27,22,71,0.04)]">
          <span className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Compte Connecté : {igHandle || 'ton compte Instagram'}
            {integrationData.webhookStatus === 'active' && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">Connexion confirmée</span>}
          </span>
          <span className="flex flex-wrap items-center gap-3">
            {integrationData.webhookStatus !== 'active' && (
              <button type="button" onClick={handleRepairSubscription} disabled={repairingSubscription} className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer">
                {repairingSubscription ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Terminer la connexion
              </button>
            )}
            <button type="button" onClick={handleConnectInstagram} disabled={isConnecting} className="text-xs font-medium text-slate-500 underline cursor-pointer">Reconnecter</button>
            <button type="button" onClick={handleDisconnect} disabled={saveLoading} className="text-xs font-medium text-rose-600 underline cursor-pointer">Déconnecter</button>
          </span>
        </div>
      )}

      <div className="rounded-[28px] bg-white px-6 py-5 shadow-[0_1px_2px_rgba(27,22,71,0.04)]">
        <Stepper steps={IG_STEPS} current={step} maxReachable={maxReachable} onSelect={setStep} />
      </div>

      {/* ───── Étape 1 : connexion ───── */}
      {step === 0 && (
        <div className={card} data-testid="ig-step-connect">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 text-white"><Instagram className="h-6 w-6" /></div>
          <h3 className="mt-5 text-xl">Connecte ton compte Instagram</h3>
          <p className="mt-1 text-[15px] text-slate-500">En un clic. Ton assistant pourra alors répondre à tes messages privés.</p>

          {integrationData.connected ? (
            <div className="mt-6 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Connexion Instagram vérifiée
              </div>
              <div className="grid gap-1 text-xs text-emerald-800 sm:grid-cols-2">
                <span>Compte : <strong>{igHandle}</strong></span>
                <span>Identifiant professionnel : <strong>{integrationData.instagramUserId || 'confirmé'}</strong></span>
                <span>Compte enregistré sur le serveur : <strong>Oui</strong></span>
                <span>Messages privés : <strong>{integrationData.webhookStatus === 'active' ? 'Réception active' : 'À terminer'}</strong></span>
              </div>
            </div>
          ) : (
            <button type="button" id="btn-instagram-oauth-connect" onClick={handleConnectInstagram} disabled={isConnecting} className={`${primary} mt-6`}>
              {isConnecting ? <><Loader2 className="h-4 w-4 animate-spin" /> Connexion en cours…</> : <><Instagram className="h-4 w-4" /> Connecter mon Instagram</>}
            </button>
          )}

          <div className="mt-8 flex justify-end">
            <button type="button" onClick={() => setStep(1)} disabled={!integrationData.connected} className={primary}>Continuer <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* ───── Étape 2 : réglages ───── */}
      {step === 1 && (
        <div className={card} data-testid="ig-step-rules">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xl">Que doit faire ton assistant ?</h3>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${integrationData.autoReplyEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {integrationData.autoReplyEnabled ? 'IA active' : 'IA en pause'}
            </span>
          </div>
          <p className="mt-1 text-[15px] text-slate-500">Active ce que tu veux. Tu pourras changer à tout moment.</p>

          <div className="mt-6 space-y-3">
            {rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-4 rounded-2xl bg-[#f6f7fd] p-4">
                <div>
                  <p className="text-sm font-semibold text-[#1b1647]">{r.title}</p>
                  <p className="text-xs text-slate-500">{r.hint}</p>
                </div>
                <Toggle checked={Boolean(integrationData[r.key])} onChange={() => toggleSetting(r.key)} label={r.key === 'autoReplyEnabled' ? "Répondre aux messages privés avec l'IA" : r.title} />
              </div>
            ))}
            <div id="instagram-comments-card" className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 ${highlightCommentsAuth ? 'bg-purple-50 ring-2 ring-purple-200' : 'bg-[#f6f7fd]'}`}>
              <div>
                <p className="text-sm font-semibold text-[#1b1647]">Répondre aux commentaires</p>
                <p className="text-xs text-slate-500">Quelqu’un commente « prix » ? Il reçoit la réponse en message privé.</p>
              </div>
              <button type="button" onClick={handleAuthorizeComments} disabled={isConnecting} className="rounded-full border border-purple-200 bg-white px-4 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-50 cursor-pointer">Autoriser les commentaires</button>
            </div>
          </div>

          <div className="mt-6">
            <label htmlFor="instagram-greeting" className="block text-sm font-semibold text-[#1b1647]">Message d’accueil <span className="font-light text-slate-400">(facultatif)</span></label>
            <input
              id="instagram-greeting"
              aria-label="Message d'accueil"
              type="text"
              value={integrationData.customGreeting || ''}
              onChange={(e) => setIntegrationData((prev) => ({ ...prev, customGreeting: e.target.value }))}
              placeholder="Ex. Salam 👋 Bienvenue chez {entreprise} ! Comment puis-je vous aider ?"
              className="mt-2 w-full border bg-white px-4 py-3 text-sm text-slate-900"
            />
            <p className="mt-1 text-xs text-slate-400">Envoyé quand quelqu’un dit « bonjour ». Vide : l’assistant salue tout seul.</p>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <button type="button" onClick={() => setStep(0)} className={ghost}><ArrowLeft className="h-4 w-4" /> Retour</button>
            <span className="flex flex-wrap gap-2">
              <button type="button" onClick={handleSaveSettings} disabled={saveLoading} className={ghost}>
                {saveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Enregistrer
              </button>
              <button type="button" onClick={() => setStep(2)} className={primary}>Continuer <ArrowRight className="h-4 w-4" /></button>
            </span>
          </div>
        </div>
      )}

      {/* ───── Étape 3 : test ───── */}
      {step === 2 && (
        <div className={card} data-testid="ig-step-test">
          <h3 className="text-xl">Teste ton assistant</h3>
          <p className="mt-1 text-[15px] text-slate-500">Pose une question comme un client : tu vois la réponse qu’il enverrait.</p>

          <div className="mt-6 space-y-2 rounded-2xl bg-[#f6f7fd] p-4">
            {testDmMessages.map((m, i) => (
              <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <span className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.sender === 'user' ? 'bg-gradient-to-r from-[#a23dff] to-[#5a2cff] text-white' : 'bg-white text-slate-700'}`}>{m.text}</span>
              </div>
            ))}
            {isTestingDm && <p className="text-xs text-slate-400">L’assistant écrit…</p>}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={testDmInput}
              onChange={(e) => setTestDmInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSendTestDm(); }}
              placeholder="Écrire un message Instagram..."
              aria-label="Message de test"
              className="min-w-0 flex-1 border bg-white px-4 py-3 text-sm text-slate-900"
            />
            <button type="button" onClick={() => void handleSendTestDm()} disabled={isTestingDm || !testDmInput.trim()} aria-label="Envoyer" className={primary}><Send className="h-4 w-4" /></button>
          </div>

          <div className="mt-6 rounded-2xl bg-[#f6f7fd] p-4">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 h-5 w-5 text-purple-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#1b1647]">Être prévenu dans Instagram <span className="font-light text-slate-400">(facultatif)</span></p>
                <p className="text-xs text-slate-500">Reçois un message quand un client est intéressé ou demande de l’aide.</p>
                {!notifCode ? (
                  <button type="button" onClick={activateNotifs} disabled={notifBusy || notifEnabled} className={`mt-3 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer ${notifEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-[#1b1647] text-white disabled:opacity-50'}`}>
                    {notifEnabled ? '✓ Alertes activées' : notifBusy ? '…' : 'Activer les alertes'}
                  </button>
                ) : (
                  <div className="mt-3 space-y-2">
                    <button type="button" onClick={copyNotifCode} className="rounded-full border-2 border-dashed border-purple-300 bg-white px-4 py-1.5 text-sm font-semibold tracking-widest text-purple-700 cursor-pointer">
                      {notifCode} <span className="ml-2 text-[10px] font-semibold">{codeCopied ? 'Copié ✓' : 'Copier'}</span>
                    </button>
                    <p className="text-xs text-slate-500">Puis envoie ce code en message privé au compte JawebFlow :</p>
                    <a href={notifLink} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-full bg-purple-600 px-4 py-2 text-xs font-semibold text-white">Ouvrir Instagram</a>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setStep(1)} className={ghost}><ArrowLeft className="h-4 w-4" /> Retour</button>
            <span className="flex flex-wrap gap-2">
              {onGoToSimulator && <button type="button" onClick={onGoToSimulator} className={ghost}><MessageSquare className="h-4 w-4" /> Test complet</button>}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
