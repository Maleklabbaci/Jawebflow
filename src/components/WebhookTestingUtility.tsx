import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Code2, 
  Copy, 
  Check, 
  Loader2, 
  ExternalLink, 
  Save, 
  ShieldCheck, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Server,
  Activity,
  ArrowRight
} from 'lucide-react';

interface WebhookTestingUtilityProps {
  initialWebhookUrl: string;
  assistantId: string;
  businessName: string;
  onSaveWebhookUrl: (url: string) => Promise<void> | void;
  isSavingGlobal?: boolean;
}

interface WebhookTestResult {
  success: boolean;
  status: number;
  statusText: string;
  responseTimeMs: number;
  message: string;
  details?: string;
  responseBody?: string;
  sentPayload?: any;
}

export const WebhookTestingUtility: React.FC<WebhookTestingUtilityProps> = ({
  initialWebhookUrl,
  assistantId,
  businessName,
  onSaveWebhookUrl,
  isSavingGlobal = false
}) => {
  const [webhookUrl, setWebhookUrl] = useState<string>(initialWebhookUrl || '');
  const [testType, setTestType] = useState<'ping' | 'lead_test'>('ping');
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [isVerifyingAndSaving, setIsVerifyingAndSaving] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const [lastVerifiedUrl, setLastVerifiedUrl] = useState<string>(initialWebhookUrl || '');
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);
  const [copiedResponse, setCopiedResponse] = useState<boolean>(false);
  const [showPayloadDetails, setShowPayloadDetails] = useState<boolean>(false);
  const [showResponseHeaders, setShowResponseHeaders] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialWebhookUrl && initialWebhookUrl !== webhookUrl) {
      setWebhookUrl(initialWebhookUrl);
      setLastVerifiedUrl(initialWebhookUrl);
    }
  }, [initialWebhookUrl]);

  const isValidUrl = (url: string): boolean => {
    if (!url.trim()) return false;
    try {
      const parsed = new URL(url.trim());
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const getSamplePayload = (type: 'ping' | 'lead_test') => {
    const timestampIso = new Date().toISOString();
    const deliveryId = `ping_preview_${Date.now()}`;

    if (type === 'ping') {
      return {
        event: 'webhook.ping',
        deliveryId,
        timestamp: timestampIso,
        source: 'JawebFlow Platform Webhook Verifier',
        assistant: {
          id: assistantId || 'assistant_default',
          businessName: businessName || 'Mon Entreprise'
        },
        data: {
          message: 'Ping de vérification de connectivité réussi.',
          verifiedAt: timestampIso
        }
      };
    }

    return {
      event: 'lead.captured.test',
      deliveryId,
      timestamp: timestampIso,
      source: 'JawebFlow Platform Webhook Verifier',
      assistant: {
        id: assistantId || 'assistant_default',
        businessName: businessName || 'Mon Entreprise'
      },
      data: {
        test: true,
        leadId: 'lead_test_alg_58',
        fullName: 'Ahmed Benmansour',
        email: 'ahmed.benmansour@example.dz',
        phone: '+213 555 12 34 56',
        need: 'Demande de devis & validation de routage Webhook en temps réel',
        language: 'fr',
        wilaya: '16 - Alger',
        capturedAt: timestampIso
      }
    };
  };

  const runPingTest = async (targetUrl: string, type: 'ping' | 'lead_test'): Promise<WebhookTestResult> => {
    const payload = getSamplePayload(type);
    
    const response = await fetch('/api/webhook/test-ping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhookUrl: targetUrl.trim(),
        testType: type,
        payload
      })
    });

    const data = await response.json();

    const result: WebhookTestResult = {
      success: Boolean(data.success),
      status: data.status || (data.success ? 200 : 0),
      statusText: data.statusText || (data.success ? 'OK' : 'Failed'),
      responseTimeMs: data.responseTimeMs || 0,
      message: data.message || (data.success ? 'Connexion établie avec succès' : 'Échec de connexion'),
      details: data.details,
      responseBody: data.responseBody,
      sentPayload: data.sentPayload || payload
    };

    return result;
  };

  const handleTestConnection = async () => {
    if (!isValidUrl(webhookUrl)) return;
    setIsPinging(true);
    setTestResult(null);
    setSaveSuccessMessage(null);

    try {
      const result = await runPingTest(webhookUrl, testType);
      setTestResult(result);
      if (result.success) {
        setLastVerifiedUrl(webhookUrl.trim());
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        status: 0,
        statusText: 'Client Error',
        responseTimeMs: 0,
        message: 'Impossible d\'exécuter le test de connexion.',
        details: err?.message || 'Erreur inconnue'
      });
    } finally {
      setIsPinging(false);
    }
  };

  const handleVerifyAndSave = async () => {
    if (!isValidUrl(webhookUrl)) return;
    setIsVerifyingAndSaving(true);
    setSaveSuccessMessage(null);

    try {
      // 1. Run live ping test first
      const result = await runPingTest(webhookUrl, testType);
      setTestResult(result);

      if (result.success) {
        setLastVerifiedUrl(webhookUrl.trim());
        // 2. Persist to Firestore
        await onSaveWebhookUrl(webhookUrl.trim());
        setSaveSuccessMessage(`✅ URL vérifiée (${result.status} ${result.statusText} en ${result.responseTimeMs}ms) et enregistrée avec succès !`);
        setTimeout(() => setSaveSuccessMessage(null), 5000);
      } else {
        // Did not pass verification
        setSaveSuccessMessage(null);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        status: 0,
        statusText: 'Error',
        responseTimeMs: 0,
        message: 'Erreur lors de la vérification préalable.',
        details: err?.message
      });
    } finally {
      setIsVerifyingAndSaving(false);
    }
  };

  const handleDirectSave = async () => {
    if (!webhookUrl.trim()) {
      await onSaveWebhookUrl('');
      setLastVerifiedUrl('');
      setTestResult(null);
      setSaveSuccessMessage('URL du webhook réinitialisée.');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
      return;
    }

    if (!isValidUrl(webhookUrl)) return;
    await onSaveWebhookUrl(webhookUrl.trim());
    setSaveSuccessMessage('Paramètres de webhook enregistrés.');
    setTimeout(() => setSaveSuccessMessage(null), 3000);
  };

  const handleCopyPayload = () => {
    const payloadStr = JSON.stringify(getSamplePayload(testType), null, 2);
    navigator.clipboard.writeText(payloadStr);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  const handleCopyResponse = () => {
    if (!testResult?.responseBody) return;
    navigator.clipboard.writeText(testResult.responseBody);
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  const isCurrentUrlVerified = 
    Boolean(webhookUrl.trim()) && 
    webhookUrl.trim() === lastVerifiedUrl.trim() && 
    testResult?.success;

  const hasUrlChangedSinceVerification = 
    Boolean(lastVerifiedUrl) && 
    webhookUrl.trim() !== lastVerifiedUrl.trim();

  return (
    <div 
      id="webhook-testing-utility"
      className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <Zap className="w-3.5 h-3.5" />
            <span>Automatisation & Webhooks</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Testeur & Vérificateur de Webhook</span>
            {isCurrentUrlVerified && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Vérifié & Actif
              </span>
            )}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
            Transmettez instantanément chaque prospect capturé (nom, téléphone, email, besoin qualifié) à votre serveur, CRM ou workflow Make / Zapier.
          </p>
        </div>

        {/* Quick presets hints */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span className="font-medium text-slate-400">Compatible avec :</span>
          <span className="px-2 py-0.5 rounded-md bg-slate-100 font-mono text-slate-700">Make</span>
          <span className="px-2 py-0.5 rounded-md bg-slate-100 font-mono text-slate-700">Zapier</span>
          <span className="px-2 py-0.5 rounded-md bg-slate-100 font-mono text-slate-700">n8n</span>
          <span className="px-2 py-0.5 rounded-md bg-slate-100 font-mono text-slate-700">REST API</span>
        </div>
      </div>

      {/* Target URL Input with Status Indicator */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="webhook-target-url-input" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-slate-400" />
            <span>URL du Endpoint Webhook cible</span>
          </label>

          {hasUrlChangedSinceVerification && (
            <span className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              URL modifiée : test recommandé avant enregistrement
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <input
              id="webhook-target-url-input"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://votre-domaine.dz/api/webhooks/leads ou https://hook.eu1.make.com/..."
              className={`w-full px-4 py-2.5 rounded-xl text-xs sm:text-sm text-slate-900 bg-slate-50 border transition-all focus:bg-white focus:outline-none focus:ring-2 ${
                webhookUrl && !isValidUrl(webhookUrl)
                  ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20'
                  : isCurrentUrlVerified
                    ? 'border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500/20'
                    : 'border-slate-200 focus:border-purple-600 focus:ring-purple-600/20'
              }`}
            />
            {webhookUrl && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {isValidUrl(webhookUrl) ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">URL Valide</span>
                ) : (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">URL Invalide (https:// requis)</span>
                )}
              </div>
            )}
          </div>

          {/* Test Type Selector */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setTestType('ping')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                testType === 'ping'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Ping simple
            </button>
            <button
              type="button"
              onClick={() => setTestType('lead_test')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                testType === 'lead_test'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Prospect test
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons: Ping Connection, Verify & Save, or Direct Save */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* Primary Action: Send Test Ping */}
          <button
            id="btn-webhook-ping-test"
            type="button"
            onClick={handleTestConnection}
            disabled={!isValidUrl(webhookUrl) || isPinging || isVerifyingAndSaving}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/20 active:scale-98"
          >
            {isPinging ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Envoi du ping en cours…</span>
              </>
            ) : (
              <>
                <Activity className="w-3.5 h-3.5" />
                <span>Tester la connexion (Ping)</span>
              </>
            )}
          </button>

          {/* Secondary Action: Verify & Save in 1 click */}
          <button
            id="btn-webhook-verify-and-save"
            type="button"
            onClick={handleVerifyAndSave}
            disabled={!isValidUrl(webhookUrl) || isPinging || isVerifyingAndSaving || isSavingGlobal}
            className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 shadow-sm shadow-purple-600/20 active:scale-98"
          >
            {isVerifyingAndSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Vérification & Enregistrement…</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Vérifier & Enregistrer</span>
              </>
            )}
          </button>
        </div>

        {/* Bypass / Simple Save Button */}
        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={handleDirectSave}
            disabled={isSavingGlobal || isVerifyingAndSaving}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
            title="Enregistrer l'URL directement"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Enregistrer</span>
          </button>
        </div>
      </div>

      {/* Save Success Banner */}
      {saveSuccessMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* Diagnostics / Ping Results Card */}
      {testResult && (
        <div 
          id="webhook-test-results-panel"
          className={`p-4 sm:p-5 rounded-2xl border transition-all animate-in fade-in duration-200 space-y-3.5 ${
            testResult.success 
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' 
              : 'bg-rose-50/70 border-rose-200 text-rose-950'
          }`}
        >
          {/* Status Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 border-current/10">
            <div className="flex items-center gap-2.5">
              {testResult.success ? (
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-sm">
                  <AlertCircle className="w-4 h-4" />
                </div>
              )}
              <div>
                <div className="font-bold text-xs sm:text-sm flex items-center gap-2">
                  <span>{testResult.message}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    testResult.success ? 'bg-emerald-200/60 text-emerald-800' : 'bg-rose-200/60 text-rose-800'
                  }`}>
                    HTTP {testResult.status} {testResult.statusText}
                  </span>
                </div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  {testResult.details}
                </div>
              </div>
            </div>

            {/* Latency badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/70 border border-current/10 text-[11px] font-mono font-semibold self-start sm:self-auto">
              <Clock className="w-3 h-3 opacity-60" />
              <span>Latence : {testResult.responseTimeMs} ms</span>
            </div>
          </div>

          {/* Response Body Inspector */}
          {testResult.responseBody && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold opacity-90">
                <span>Corps de la réponse renvoyée par votre serveur (Response Body) :</span>
                <button
                  type="button"
                  onClick={handleCopyResponse}
                  className="px-2 py-0.5 rounded hover:bg-black/5 text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copiedResponse ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedResponse ? 'Copié' : 'Copier'}</span>
                </button>
              </div>
              <pre className="p-3 rounded-xl bg-slate-950 text-slate-200 font-mono text-[11px] max-h-36 overflow-y-auto leading-relaxed whitespace-pre-wrap border border-slate-800">
                {testResult.responseBody}
              </pre>
            </div>
          )}

          {/* Collapsible Headers Sent */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowResponseHeaders(!showResponseHeaders)}
              className="text-[11px] font-semibold flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
            >
              {showResponseHeaders ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>En-têtes HTTP envoyés (Headers)</span>
            </button>

            {showResponseHeaders && (
              <div className="mt-2 p-3 rounded-xl bg-slate-900 text-slate-300 font-mono text-[10px] space-y-1 border border-slate-800">
                <div><span className="text-purple-400">Content-Type:</span> application/json</div>
                <div><span className="text-purple-400">User-Agent:</span> JawebFlow-Webhook-Tester/2.0 (+https://jawebflow.dz)</div>
                <div><span className="text-purple-400">X-JawebFlow-Event:</span> {testType === 'ping' ? 'ping' : 'lead.captured.test'}</div>
                <div><span className="text-purple-400">X-JawebFlow-Timestamp:</span> {new Date().toISOString()}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* JSON Payload Inspector & Schema Preview */}
      <div className="pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setShowPayloadDetails(!showPayloadDetails)}
          className="w-full flex items-center justify-between text-xs font-bold text-slate-700 hover:text-slate-900 py-1 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-purple-600" />
            <span>Structure du Payload JSON transmis lors des captures</span>
          </div>
          <div className="flex items-center gap-1 text-slate-400 text-[11px]">
            <span>{showPayloadDetails ? 'Masquer' : 'Afficher l\'exemple'}</span>
            {showPayloadDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {showPayloadDetails && (
          <div className="mt-3 space-y-2 animate-in fade-in duration-150">
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Exemple d'objet JSON envoyé par JawebFlow :</span>
              <button
                type="button"
                onClick={handleCopyPayload}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
              >
                {copiedPayload ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedPayload ? 'Copié' : 'Copier le JSON'}</span>
              </button>
            </div>

            <pre className="p-4 rounded-xl bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
              <code>{JSON.stringify(getSamplePayload(testType), null, 2)}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
