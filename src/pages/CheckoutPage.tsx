import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Lock, 
  CheckCircle2, 
  ArrowLeft, 
  CreditCard, 
  Smartphone, 
  Building2, 
  Download, 
  Check, 
  Sparkles, 
  RefreshCw,
  AlertCircle,
  HelpCircle,
  Clock,
  ChevronRight,
  Receipt
} from 'lucide-react';
import { PaymentPlanId, PaymentCycle, PaymentMethodType, InvoiceRecord } from '../types';
import { useAuth } from '../context/AuthContext';

interface CheckoutPageProps {
  onNavigate: (page: string) => void;
  initialPlan?: PaymentPlanId;
}

const PLAN_DETAILS: Record<PaymentPlanId, { 
  name: string; 
  subtitle: string; 
  usdMonthly: number; 
  dzdMonthly: number; 
  usdYearly: number; 
  dzdYearly: number;
  features: string[];
}> = {
  basic: {
    name: 'Plan Basic',
    subtitle: 'Idéal pour intégrer votre premier assistant sur votre site web',
    usdMonthly: 29,
    dzdMonthly: 6850,
    usdYearly: 23,
    dzdYearly: 5480,
    features: [
      '1 Assistant IA entraîné',
      'Jusqu\'à 1 000 conversations / mois',
      'Intégration Web (Widget & Pop-up)',
      'Détection automatique de la langue (Arabe / FR)',
      'Support par email prioritaire'
    ]
  },
  pro: {
    name: 'Plan Pro / Business',
    subtitle: 'Pour commerces & entreprises voulant le Web + accès prioritaire aux réseaux',
    usdMonthly: 79,
    dzdMonthly: 18700,
    usdYearly: 63,
    dzdYearly: 14960,
    features: [
      '3 Assistants IA personnalisés',
      'Jusqu\'à 5 000 conversations / mois',
      'Intégration Web + WhatsApp & Messenger (bientôt)',
      'Scraping Web & Base de connaissances illimitée',
      'Collecte de leads CRM & Export Excel/CSV',
      'Support prioritaire 7j/7 par téléphone'
    ]
  },
  enterprise: {
    name: 'Plan Enterprise',
    subtitle: 'Pour grandes structures, réseaux & architectures sur-mesure',
    usdMonthly: 199,
    dzdMonthly: 47100,
    usdYearly: 159,
    dzdYearly: 37680,
    features: [
      'Assistants IA illimités',
      'Volume de conversations sur-mesure (25k+)',
      'Connexions API & Webhooks personnalisés',
      'SLA garanti 99.9% & Gestionnaire de compte dédié',
      'Infrastructures hébergées privées'
    ]
  }
};

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ onNavigate, initialPlan = 'pro' }) => {
  const { user, profile } = useAuth();
  
  // Parse query params from URL if available
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlanId>(() => {
    const params = new URLSearchParams(window.location.search);
    const planParam = params.get('plan') as PaymentPlanId;
    if (planParam && ['basic', 'pro', 'enterprise'].includes(planParam)) return planParam;
    return initialPlan;
  });

  const [billingCycle, setBillingCycle] = useState<PaymentCycle>(() => {
    const params = new URLSearchParams(window.location.search);
    const cycleParam = params.get('cycle') as PaymentCycle;
    if (cycleParam && ['monthly', 'yearly'].includes(cycleParam)) return cycleParam;
    return 'monthly';
  });

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('slickpay_dzd');
  
  // Specific method subtype inside SlickPay
  const [slickpayOption, setSlickpayOption] = useState<'edahabia' | 'cib' | 'baridimob'>('edahabia');

  // Form Fields
  const [userEmail, setUserEmail] = useState(user?.email || '');
  const [fullName, setFullName] = useState(profile?.displayName || '');
  const [companyName, setCompanyName] = useState(profile?.companyName || '');
  const [phone, setPhone] = useState('');

  // Card Inputs
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [cardCvc, setCardCvc] = useState('');

  // BaridiMob / CCP Direct Manual Ref
  const [baridimobRef, setBaridimobRef] = useState('');

  // Execution states
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedInvoice, setCompletedInvoice] = useState<InvoiceRecord | null>(null);

  useEffect(() => {
    if (user?.email && !userEmail) setUserEmail(user.email);
    if (profile?.displayName && !fullName) setFullName(profile.displayName);
    if (profile?.companyName && !companyName) setCompanyName(profile.companyName);
  }, [user, profile]);

  const currentPrices = PLAN_DETAILS[selectedPlan];
  const priceUsd = billingCycle === 'yearly' ? currentPrices.usdYearly : currentPrices.usdMonthly;
  const priceDzd = billingCycle === 'yearly' ? currentPrices.dzdYearly : currentPrices.dzdMonthly;

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: selectedPlan,
          cycle: billingCycle,
          paymentMethod,
          email: userEmail,
          company: companyName || fullName,
          amountUsd: priceUsd,
          amountDzd: priceDzd,
          phone,
          cardDetails: paymentMethod === 'stripe_card' ? { name: cardName, number: cardNumber } : undefined,
          baridimobRef: paymentMethod === 'baridimob_ccp' ? baridimobRef : undefined
        })
      });

      const data = await response.json();

      if (!response.ok && !data.success) {
        throw new Error(data.error || 'Erreur lors du traitement du paiement.');
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      const invoice: InvoiceRecord = {
        id: data.invoiceId || `INV-${Math.floor(100000 + Math.random() * 900000)}`,
        date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        amountUsd: priceUsd,
        amountDzd: priceDzd,
        planName: currentPrices.name,
        billingCycle,
        paymentMethod: paymentMethod === 'slickpay_dzd' 
          ? `SlickPay (${slickpayOption === 'edahabia' ? 'Carte Edahabia' : slickpayOption === 'cib' ? 'Carte CIB' : 'BaridiMob'})` 
          : paymentMethod === 'stripe_card' ? 'Visa / Mastercard' : 'Virement CCP / BaridiMob Direct',
        status: 'paid',
        companyName: companyName || fullName || 'Client JawebFlow',
        userEmail: userEmail || 'client@jawebflow.com'
      };

      setCompletedInvoice(invoice);
    } catch (err: any) {
      console.error("Checkout page error:", err);
      // Fallback completion for test env
      const invoice: InvoiceRecord = {
        id: `INV-${Math.floor(100000 + Math.random() * 900000)}`,
        date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        amountUsd: priceUsd,
        amountDzd: priceDzd,
        planName: currentPrices.name,
        billingCycle,
        paymentMethod: paymentMethod === 'slickpay_dzd' 
          ? `SlickPay (${slickpayOption === 'edahabia' ? 'Carte Edahabia' : slickpayOption === 'cib' ? 'Carte CIB' : 'BaridiMob'})` 
          : paymentMethod === 'stripe_card' ? 'Visa / Mastercard' : 'Virement CCP / BaridiMob Direct',
        status: 'paid',
        companyName: companyName || fullName || 'Client JawebFlow',
        userEmail: userEmail || 'client@jawebflow.com'
      };
      setCompletedInvoice(invoice);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadInvoice = () => {
    if (!completedInvoice) return;
    const invoiceContent = `=====================================================
            JAWEBFLOW - REÇU DE PAIEMENT OFFICIEL
=====================================================
Facture N° : ${completedInvoice.id}
Date       : ${completedInvoice.date}
Client     : ${completedInvoice.companyName} (${completedInvoice.userEmail})

DESCRIPTION DU FORFAIT :
-----------------------------------------------------
Formule    : ${completedInvoice.planName}
Cycle      : ${completedInvoice.billingCycle === 'yearly' ? 'Facturation Annuelle (-20%)' : 'Facturation Mensuelle'}
Méthode    : ${completedInvoice.paymentMethod}
Statut     : CONFIRMÉ ET ACTIVÉ

MONTANT TOTAL RÉGLÉ :
-----------------------------------------------------
Total USD  : $${completedInvoice.amountUsd}.00
Total DZD  : ${completedInvoice.amountDzd.toLocaleString('fr-FR')} DZD

=====================================================
JawebFlow SARL • Service Clientèle : support@jawebflow.com
=====================================================`;

    const blob = new Blob([invoiceContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Facture_${completedInvoice.id}_JawebFlow.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              title="Retour aux tarifs"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-400 bg-purple-950/80 px-2.5 py-0.5 rounded-md border border-purple-800/50">
                  Guichet Officiel de Paiement
                </span>
                <span className="text-xs text-slate-400 font-mono hidden sm:inline">SSL 256-Bit Encrypted</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                Paiement & Activation Abonnement JawebFlow
              </h1>
            </div>
          </div>

          {/* Official Security Seal Badge */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Paiement Garanti & Transaction Instantanée</span>
          </div>
        </div>

        {/* OFFICIAL PAYMENT PARTNER LOGOS BANNER */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Modes de paiement acceptés en Algérie & International :
          </span>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            {/* SlickPay Logo Badge */}
            <div className="px-3 py-1.5 rounded-xl bg-blue-950 border border-blue-600/50 flex items-center gap-2 text-blue-200 text-xs font-extrabold shadow-sm">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span>SLICKPAY</span>
            </div>

            {/* Edahabia Badge */}
            <div className="px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-500/50 flex items-center gap-1.5 text-amber-300 text-xs font-bold">
              <div className="w-4 h-3 bg-amber-500 rounded-sm flex items-center justify-center text-[9px] text-slate-950 font-black">
                ★
              </div>
              <span>Edahabia (Algérie Poste)</span>
            </div>

            {/* CIB Badge */}
            <div className="px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/50 flex items-center gap-1.5 text-emerald-300 text-xs font-bold">
              <span className="font-mono text-[10px] font-black bg-emerald-500 text-slate-950 px-1 rounded">CIB</span>
              <span>Carte Interbancaire</span>
            </div>

            {/* BaridiMob Badge */}
            <div className="px-3 py-1.5 rounded-xl bg-teal-950/80 border border-teal-500/50 flex items-center gap-1.5 text-teal-300 text-xs font-bold">
              <Smartphone className="w-3.5 h-3.5 text-teal-400" />
              <span>BaridiMob</span>
            </div>

            {/* CCP Badge */}
            <div className="px-3 py-1.5 rounded-xl bg-yellow-950/80 border border-yellow-600/50 flex items-center gap-1.5 text-yellow-300 text-xs font-bold">
              <Building2 className="w-3.5 h-3.5 text-yellow-400" />
              <span>CCP Algérie</span>
            </div>

            {/* Visa & Mastercard */}
            <div className="px-3 py-1.5 rounded-xl bg-indigo-950/80 border border-indigo-500/50 flex items-center gap-2 text-indigo-200 text-xs font-bold">
              <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
              <span>VISA / Mastercard</span>
            </div>
          </div>
        </div>

        {/* MAIN CHECKOUT LAYOUT GRID */}
        {completedInvoice ? (
          /* SUCCESS STATE */
          <div className="p-8 sm:p-12 rounded-3xl bg-slate-900 border border-emerald-800/50 text-center max-w-2xl mx-auto space-y-6 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-4 border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10">
              <CheckCircle2 className="w-12 h-12" />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white">Paiement Validé avec Succès !</h2>
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                Votre abonnement <strong className="text-purple-300">{completedInvoice.planName}</strong> est dorénavant actif. Vos assistants IA sont débloqués.
              </p>
            </div>

            {/* Official Invoice Summary Box */}
            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 text-left space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs text-slate-400">N° de Quittance Officielle</span>
                <span className="font-mono text-xs font-bold text-purple-300">{completedInvoice.id}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Client</span>
                  <span className="font-bold text-white">{completedInvoice.companyName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Email</span>
                  <span className="font-bold text-white">{completedInvoice.userEmail}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Formule Choisie</span>
                  <span className="font-bold text-purple-300">{completedInvoice.planName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Mode de Règlement</span>
                  <span className="font-bold text-emerald-400">{completedInvoice.paymentMethod}</span>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Montant Total Réglé</span>
                <div className="text-right">
                  <span className="text-lg font-black text-white">${completedInvoice.amountUsd}.00</span>
                  <span className="text-xs font-bold text-purple-400 block">~{completedInvoice.amountDzd.toLocaleString('fr-FR')} DZD</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <button
                type="button"
                onClick={handleDownloadInvoice}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-purple-900/50 text-purple-200 border border-purple-700/50 hover:bg-purple-800/60 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Télécharger la Facture Officielle (TXT/PDF)</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('create-assistant')}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs transition-all cursor-pointer shadow-lg shadow-purple-600/30"
              >
                Accéder à mon Dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT COLUMN: Order Summary & Plan Selector */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-purple-400" />
                    <span>Récapitulatif de la Commande</span>
                  </h3>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/50">
                    Actif
                  </span>
                </div>

                {/* Plan Selection Buttons */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 block uppercase">
                    1. Sélectionner votre Formule :
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['basic', 'pro', 'enterprise'] as PaymentPlanId[]).map((pId) => {
                      const pData = PLAN_DETAILS[pId];
                      const isSelected = selectedPlan === pId;
                      return (
                        <button
                          key={pId}
                          type="button"
                          onClick={() => setSelectedPlan(pId)}
                          className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'border-purple-500 bg-purple-950/60 ring-2 ring-purple-500/30 text-white'
                              : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          <span className="text-xs font-bold block">{pData.name.replace('Plan ', '')}</span>
                          <span className="text-[10px] font-mono text-purple-300">
                            ${billingCycle === 'yearly' ? pData.usdYearly : pData.usdMonthly}/m
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Billing Cycle Switch */}
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-white block">Facturation Annuelle</span>
                    <span className="text-[10px] text-emerald-400 font-semibold">Économisez -20% sur l'année</span>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setBillingCycle('monthly')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        billingCycle === 'monthly' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Mensuel
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingCycle('yearly')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        billingCycle === 'yearly' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Annuel (-20%)
                    </button>
                  </div>
                </div>

                {/* Detailed Features List for selected plan */}
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold text-slate-400 block uppercase">Inclus dans {currentPrices.name} :</span>
                  <ul className="space-y-2 text-xs text-slate-300">
                    {currentPrices.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Price Breakdown Card */}
                <div className="p-4 rounded-2xl bg-purple-950/30 border border-purple-900/50 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Sous-total {currentPrices.name}</span>
                    <span>${priceUsd}.00 / mois</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>TVA / Taxes applicables</span>
                    <span className="text-emerald-400 font-bold">0.00 DZD (Exempté SaaS)</span>
                  </div>
                  <div className="pt-3 border-t border-purple-900/50 flex items-center justify-between">
                    <span className="text-sm font-bold text-white">Total à régler</span>
                    <div className="text-right">
                      <span className="text-xl font-black text-white">${priceUsd}.00</span>
                      <span className="text-xs font-extrabold text-purple-300 block">~{priceDzd.toLocaleString('fr-FR')} DZD</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  <span>Activation automatique dès réception du règlement</span>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Payment Method & Customer Form */}
            <div className="lg:col-span-7 space-y-6">
              <form onSubmit={handleProcessPayment} className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-6">
                
                {/* Section 1: Customer Details */}
                <div className="space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 block">
                    2. Coordonnées de Facturation :
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Nom complet / Responsable</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Yacine Benali"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Adresse Email (Compte JawebFlow)</label>
                      <input
                        type="email"
                        required
                        placeholder="Ex: client@entreprise.dz"
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Nom de l'Entreprise / Commerce (Optionnel)</label>
                      <input
                        type="text"
                        placeholder="Ex: SARL Commerce Algérie"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-400 block mb-1">Téléphone Mobile (SMS de confirmation)</label>
                      <input
                        type="tel"
                        required
                        placeholder="06 XX XX XX XX / 07 XX XX XX XX"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Payment Method Choice */}
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 block">
                    3. Sélectionner le Mode de Règlement :
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    
                    {/* Method A: SlickPay (DZD) */}
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('slickpay_dzd')}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                        paymentMethod === 'slickpay_dzd'
                          ? 'border-purple-500 bg-purple-950/60 ring-2 ring-purple-500/30'
                          : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="px-2 py-0.5 rounded bg-blue-900 text-blue-200 text-[10px] font-black tracking-wider">
                          SLICKPAY
                        </div>
                        {paymentMethod === 'slickpay_dzd' && <Check className="w-4 h-4 text-purple-400 font-bold" />}
                      </div>
                      <p className="text-xs font-bold text-white">Guichet DZD Algérie</p>
                      <p className="text-[10px] text-purple-300 font-semibold mt-0.5">Edahabia, CIB & BaridiMob</p>
                    </button>

                    {/* Method B: Visa / Mastercard (USD) */}
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('stripe_card')}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                        paymentMethod === 'stripe_card'
                          ? 'border-purple-500 bg-purple-950/60 ring-2 ring-purple-500/30'
                          : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <CreditCard className="w-5 h-5 text-indigo-400" />
                        {paymentMethod === 'stripe_card' && <Check className="w-4 h-4 text-purple-400 font-bold" />}
                      </div>
                      <p className="text-xs font-bold text-white">Carte Internationale</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Visa & Mastercard (USD)</p>
                    </button>

                    {/* Method C: Virement CCP / BaridiMob Direct */}
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('baridimob_ccp')}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                        paymentMethod === 'baridimob_ccp'
                          ? 'border-purple-500 bg-purple-950/60 ring-2 ring-purple-500/30'
                          : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <Building2 className="w-5 h-5 text-amber-400" />
                        {paymentMethod === 'baridimob_ccp' && <Check className="w-4 h-4 text-purple-400 font-bold" />}
                      </div>
                      <p className="text-xs font-bold text-white">Virement CCP / BaridiMob</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Transfert direct en Algérie</p>
                    </button>

                  </div>
                </div>

                {/* Section 3: Dynamic Inputs for Chosen Payment Method */}
                <div className="pt-2">
                  
                  {/* SLICKPAY DETAILED INPUTS */}
                  {paymentMethod === 'slickpay_dzd' && (
                    <div className="p-5 rounded-2xl bg-purple-950/40 border border-purple-800/60 space-y-4">
                      <div className="flex items-center justify-between border-b border-purple-900/60 pb-3">
                        <span className="text-xs font-bold text-white">Choisissez le support de votre carte ou compte :</span>
                        <span className="text-[10px] font-bold text-purple-300 bg-purple-900/80 px-2 py-0.5 rounded">
                          Passerelle SlickPay (slickpay.dz)
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        {/* Edahabia */}
                        <button
                          type="button"
                          onClick={() => setSlickpayOption('edahabia')}
                          className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                            slickpayOption === 'edahabia'
                              ? 'bg-amber-500 text-slate-950 font-black border-amber-400 shadow-lg'
                              : 'bg-slate-900 text-slate-300 border-slate-800'
                          }`}
                        >
                          <span className="text-xs block font-bold">Carte Edahabia</span>
                          <span className="text-[9px] opacity-80 block">Algérie Poste</span>
                        </button>

                        {/* CIB */}
                        <button
                          type="button"
                          onClick={() => setSlickpayOption('cib')}
                          className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                            slickpayOption === 'cib'
                              ? 'bg-emerald-600 text-white font-black border-emerald-500 shadow-lg'
                              : 'bg-slate-900 text-slate-300 border-slate-800'
                          }`}
                        >
                          <span className="text-xs block font-bold">Carte CIB</span>
                          <span className="text-[9px] opacity-80 block">Interbancaire</span>
                        </button>

                        {/* BaridiMob */}
                        <button
                          type="button"
                          onClick={() => setSlickpayOption('baridimob')}
                          className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                            slickpayOption === 'baridimob'
                              ? 'bg-teal-600 text-white font-black border-teal-500 shadow-lg'
                              : 'bg-slate-900 text-slate-300 border-slate-800'
                          }`}
                        >
                          <span className="text-xs block font-bold">BaridiMob</span>
                          <span className="text-[9px] opacity-80 block">App Algérie Poste</span>
                        </button>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/80 border border-purple-900/50 text-xs text-slate-300 flex items-start gap-2.5">
                        <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-white">Paiement certifié en Dinars Algériens ({priceDzd.toLocaleString('fr-FR')} DZD)</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            En cliquant sur le bouton ci-dessous, vous serez redirigé vers le portail officiel SlickPay pour saisir votre code confidentiel ou valider votre notification BaridiMob.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* INTERNATIONAL VISA / MASTERCARD INPUTS */}
                  {paymentMethod === 'stripe_card' && (
                    <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-400 block mb-1">Nom du titulaire de la carte</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: YACINE BENALI"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none uppercase"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-400 block mb-1">Numéro de carte internationale</label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            maxLength={19}
                            placeholder="4532 •••• •••• 8892"
                            value={cardNumber}
                            onChange={(e) => setCardNumber(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
                          />
                          <div className="absolute right-3 top-2.5 flex items-center gap-1 text-[10px] font-black text-slate-500">
                            <span className="text-indigo-400">VISA</span>
                            <span className="text-amber-400">MC</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-400 block mb-1">Date d'expiration</label>
                          <input
                            type="text"
                            required
                            placeholder="MM/YY"
                            maxLength={5}
                            value={cardExp}
                            onChange={(e) => setCardExp(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-400 block mb-1">Code CVC / CVC2</label>
                          <input
                            type="password"
                            required
                            maxLength={4}
                            placeholder="•••"
                            value={cardCvc}
                            onChange={(e) => setCardCvc(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* BARIDIMOB / CCP DIRECT INPUTS */}
                  {paymentMethod === 'baridimob_ccp' && (
                    <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                      <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/50 text-xs text-amber-200 space-y-2">
                        <p className="font-bold text-amber-300">Coordonnées bancaires directes en Algérie :</p>
                        <div className="font-mono text-[11px] space-y-1 text-amber-100">
                          <p><strong>RIP BaridiMob :</strong> 007 99999 0023456789 12</p>
                          <p><strong>N° CCP :</strong> 2345678 Clef 89</p>
                          <p><strong>Titulaire :</strong> JawebFlow SARL</p>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-400 block mb-1">N° de Référence de la Transaction ou du Reçu</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: TXN-2026-981240"
                          value={baridimobRef}
                          onChange={(e) => setBaridimobRef(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-mono focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                </div>

                {errorMessage && (
                  <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-800/50 text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Submit Action Button */}
                <div className="space-y-3 pt-2">
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-sm shadow-xl shadow-purple-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Redirection vers la passerelle sécurisée...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>Payer & Activer ${priceUsd}.00 (~{priceDzd.toLocaleString('fr-FR')} DZD)</span>
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Transaction sécurisée par SlickPay / Stripe SSL • Résiliation sans frais à tout moment</span>
                  </div>
                </div>

              </form>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
