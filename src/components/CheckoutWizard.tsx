import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  HelpCircle,
  Lock,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  X,
  Zap,
} from 'lucide-react';

interface CheckoutWizardProps {
  billingCycle: 'monthly' | 'yearly';
  setBillingCycle: (cycle: 'monthly' | 'yearly') => void;
  selectedCheckoutPlan: 'basic' | 'pro' | 'enterprise';
  setSelectedCheckoutPlan: (plan: 'basic' | 'pro' | 'enterprise') => void;
  checkoutStep: number;
  setCheckoutStep: (step: number) => void;
  checkoutName: string;
  setCheckoutName: (val: string) => void;
  checkoutEmail: string;
  setCheckoutEmail: (val: string) => void;
  checkoutCompany: string;
  setCheckoutCompany: (val: string) => void;
  checkoutPhone: string;
  setCheckoutPhone: (val: string) => void;
  checkoutPaymentMethod: 'slickpay_dzd' | 'stripe_card' | 'baridimob_ccp';
  setCheckoutPaymentMethod: (val: 'slickpay_dzd' | 'stripe_card' | 'baridimob_ccp') => void;
  checkoutSlickpayType: 'edahabia' | 'cib' | 'baridimob';
  setCheckoutSlickpayType: (val: 'edahabia' | 'cib' | 'baridimob') => void;
  checkoutCardNumber: string;
  setCheckoutCardNumber: (val: string) => void;
  checkoutCardExp: string;
  setCheckoutCardExp: (val: string) => void;
  checkoutCardCvc: string;
  setCheckoutCardCvc: (val: string) => void;
  checkoutRipRef: string;
  setCheckoutRipRef: (val: string) => void;
  isProcessingPayment: boolean;
  handleConfirmPayment: () => void;
  setBillingViewMode: (mode: 'overview' | 'checkout') => void;
  user: any;
}

export const CheckoutWizard: React.FC<CheckoutWizardProps> = ({
  billingCycle,
  setBillingCycle,
  selectedCheckoutPlan,
  setSelectedCheckoutPlan,
  checkoutStep,
  setCheckoutStep,
  checkoutName,
  setCheckoutName,
  checkoutEmail,
  setCheckoutEmail,
  checkoutCompany,
  setCheckoutCompany,
  checkoutPhone,
  setCheckoutPhone,
  checkoutPaymentMethod,
  setCheckoutPaymentMethod,
  checkoutSlickpayType,
  setCheckoutSlickpayType,
  checkoutCardNumber,
  setCheckoutCardNumber,
  checkoutCardExp,
  setCheckoutCardExp,
  checkoutCardCvc,
  setCheckoutCardCvc,
  checkoutRipRef,
  setCheckoutRipRef,
  isProcessingPayment,
  handleConfirmPayment,
  setBillingViewMode,
  user,
}) => {
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [gatewayStep, setGatewayStep] = useState<'card_input' | 'otp_verify' | 'processing'>('card_input');
  const [gatewayOtp, setGatewayOtp] = useState('');
  const [gatewayError, setGatewayError] = useState<string | null>(null);

  const [gatewayCardNum, setGatewayCardNum] = useState(checkoutCardNumber || '5078 9823 4110 9012');
  const [gatewayExp, setGatewayExp] = useState(checkoutCardExp || '12/28');
  const [gatewayCvc, setGatewayCvc] = useState(checkoutCardCvc || '741');
  const [gatewayHolder, setGatewayHolder] = useState(checkoutName || user?.displayName || 'YACINE BENALI');

  const getDzdAmountStr = () => {
    if (selectedCheckoutPlan === 'basic') {
      return billingCycle === 'monthly' ? '6 850' : '65 760';
    } else if (selectedCheckoutPlan === 'pro') {
      return billingCycle === 'monthly' ? '18 700' : '179 500';
    } else {
      return billingCycle === 'monthly' ? '47 100' : '452 160';
    }
  };

  const getUsdAmountStr = () => {
    if (selectedCheckoutPlan === 'basic') {
      return billingCycle === 'monthly' ? '$29' : '$276';
    } else if (selectedCheckoutPlan === 'pro') {
      return billingCycle === 'monthly' ? '$79' : '$756';
    } else {
      return billingCycle === 'monthly' ? '$199' : '$1 908';
    }
  };

  const handleStartGateway = () => {
    setGatewayStep('card_input');
    setGatewayError(null);
    setShowGatewayModal(true);
  };

  const handleProceedToOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gatewayCardNum || gatewayCardNum.length < 10) {
      setGatewayError('Veuillez saisir un numéro de carte valide (16 chiffres).');
      return;
    }
    setGatewayError(null);
    setGatewayStep('processing');
    setTimeout(() => {
      setGatewayStep('otp_verify');
    }, 800);
  };

  const handleValidateOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gatewayOtp.trim()) {
      setGatewayError('Veuillez entrer le code SMS OTP (ex: 123456)');
      return;
    }
    setGatewayError(null);
    setGatewayStep('processing');
    setTimeout(() => {
      setShowGatewayModal(false);
      handleConfirmPayment();
    }, 1200);
  };
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Sub-Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setBillingViewMode('overview')}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer flex items-center justify-center"
            title="Retour à l'aperçu"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200">
                Guichet Client Officiel
              </span>
              <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">Cryptage 256-Bit SSL</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">
              Paiement & Activation en 4 Étapes Simples
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setBillingViewMode('overview')}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer self-start sm:self-auto"
        >
          ← Annuler / Mes Factures
        </button>
      </div>

      {/* Certified Partners Banner */}
      <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="text-xs font-bold text-slate-300">
            Passerelles Certifiées : SlickPay (Edahabia, CIB, BaridiMob DZD) & Cartes Internationales
          </span>
        </div>
        <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" /> Activation Immédiate
        </span>
      </div>

      {/* 4-STEP PROGRESS STEPPER */}
      <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <button
            type="button"
            onClick={() => setCheckoutStep(1)}
            className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              checkoutStep === 1
                ? 'bg-purple-600 text-white font-extrabold shadow-md'
                : checkoutStep > 1
                ? 'bg-purple-50 text-purple-700 font-semibold border border-purple-200'
                : 'bg-slate-100 text-slate-500 font-medium'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                checkoutStep === 1
                  ? 'bg-white text-purple-600'
                  : checkoutStep > 1
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-300 text-slate-700'
              }`}
            >
              {checkoutStep > 1 ? <Check className="w-3 h-3" /> : '1'}
            </span>
            <span className="text-xs">1. Formule</span>
          </button>

          <button
            type="button"
            onClick={() => setCheckoutStep(2)}
            className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              checkoutStep === 2
                ? 'bg-purple-600 text-white font-extrabold shadow-md'
                : checkoutStep > 2
                ? 'bg-purple-50 text-purple-700 font-semibold border border-purple-200'
                : 'bg-slate-100 text-slate-500 font-medium'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                checkoutStep === 2
                  ? 'bg-white text-purple-600'
                  : checkoutStep > 2
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-300 text-slate-700'
              }`}
            >
              {checkoutStep > 2 ? <Check className="w-3 h-3" /> : '2'}
            </span>
            <span className="text-xs">2. Coordonnées</span>
          </button>

          <button
            type="button"
            onClick={() => setCheckoutStep(3)}
            className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              checkoutStep === 3
                ? 'bg-purple-600 text-white font-extrabold shadow-md'
                : checkoutStep > 3
                ? 'bg-purple-50 text-purple-700 font-semibold border border-purple-200'
                : 'bg-slate-100 text-slate-500 font-medium'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                checkoutStep === 3
                  ? 'bg-white text-purple-600'
                  : checkoutStep > 3
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-300 text-slate-700'
              }`}
            >
              {checkoutStep > 3 ? <Check className="w-3 h-3" /> : '3'}
            </span>
            <span className="text-xs">3. Paiement</span>
          </button>

          <button
            type="button"
            onClick={() => setCheckoutStep(4)}
            className={`p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
              checkoutStep === 4
                ? 'bg-purple-600 text-white font-extrabold shadow-md'
                : 'bg-slate-100 text-slate-500 font-medium'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                checkoutStep === 4 ? 'bg-white text-purple-600' : 'bg-slate-300 text-slate-700'
              }`}
            >
              4
            </span>
            <span className="text-xs">4. Activation</span>
          </button>
        </div>
      </div>

      {/* STEP CONTENT PANEL */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        {/* STEP 1: FORMULE */}
        {checkoutStep === 1 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-purple-600 uppercase tracking-wider block">Étape 1 sur 4</span>
                <h2 className="text-lg font-bold text-slate-900">Choisissez votre Formule & Période</h2>
              </div>

              {/* Cycle Switch */}
              <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    billingCycle === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Mensuel
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('yearly')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    billingCycle === 'yearly' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Annuel</span>
                  <span className="bg-purple-200 text-purple-900 text-[9px] font-extrabold px-1.5 py-0.5 rounded">-20%</span>
                </button>
              </div>
            </div>

            {/* Plan Choice Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Basic Card */}
              <div
                onClick={() => setSelectedCheckoutPlan('basic')}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                  selectedCheckoutPlan === 'basic'
                    ? 'border-purple-600 bg-purple-50/40 shadow-md ring-2 ring-purple-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-extrabold text-slate-900 text-base">Plan Basic</h3>
                    {selectedCheckoutPlan === 'basic' && (
                      <span className="p-1 rounded-full bg-purple-600 text-white">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mb-3">Pour équiper un premier site web.</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-slate-900">
                      ${billingCycle === 'monthly' ? 29 : 23}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">/mois</span>
                  </div>
                  <p className="text-[11px] text-purple-700 font-bold mt-1">
                    ~{billingCycle === 'monthly' ? '6 850' : '5 480'} DZD /mois
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1.5">
                  <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" /> Widget Web (1 site)</p>
                  <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" /> 1 000 conversations / mois</p>
                  <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" /> IA entraînée sur votre doc</p>
                </div>
              </div>

              {/* Pro Card */}
              <div
                onClick={() => setSelectedCheckoutPlan('pro')}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative flex flex-col justify-between space-y-4 ${
                  selectedCheckoutPlan === 'pro'
                    ? 'border-purple-600 bg-purple-50/40 shadow-md ring-2 ring-purple-600/20'
                    : 'border-purple-200 hover:border-purple-300 bg-white'
                }`}
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-sm">
                  Populaire & Recommandé
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-extrabold text-slate-900 text-base">Plan Pro / Business</h3>
                    {selectedCheckoutPlan === 'pro' && (
                      <span className="p-1 rounded-full bg-purple-600 text-white">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mb-3">Pour PME & E-commerce en croissance.</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-slate-900">
                      ${billingCycle === 'monthly' ? 79 : 63}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">/mois</span>
                  </div>
                  <p className="text-[11px] text-purple-700 font-bold mt-1">
                    ~{billingCycle === 'monthly' ? '18 700' : '14 960'} DZD /mois
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1.5">
                  <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600 font-bold" /> Web + WhatsApp Intégré</p>
                  <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600 font-bold" /> 5 000 conversations / mois</p>
                  <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600 font-bold" /> Capture de leads & CRM synchro</p>
                </div>
              </div>

              {/* Enterprise Card */}
              <div
                onClick={() => setSelectedCheckoutPlan('enterprise')}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                  selectedCheckoutPlan === 'enterprise'
                    ? 'border-purple-600 bg-purple-50/40 shadow-md ring-2 ring-purple-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-extrabold text-slate-900 text-base">Plan Enterprise</h3>
                    {selectedCheckoutPlan === 'enterprise' && (
                      <span className="p-1 rounded-full bg-purple-600 text-white">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mb-3">Grands comptes & volumes illimités.</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-slate-900">
                      ${billingCycle === 'monthly' ? 199 : 159}
                    </span>
                    <span className="text-xs text-slate-500 font-semibold">/mois</span>
                  </div>
                  <p className="text-[11px] text-purple-700 font-bold mt-1">
                    ~{billingCycle === 'monthly' ? '47 100' : '37 680'} DZD /mois
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1.5">
                  <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" /> Conversations illimitées</p>
                  <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" /> API sur-mesure & Serveur dédié</p>
                  <p className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-600" /> Support prioritaire VIP 24/7</p>
                </div>
              </div>
            </div>

            {/* Next Step Button */}
            <div className="pt-4 flex justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCheckoutStep(2)}
                className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <span>Continuer : Vos Coordonnées (Étape 2/4)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: COORDONNÉES CLIENT */}
        {checkoutStep === 2 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-purple-600 uppercase tracking-wider block">Étape 2 sur 4</span>
              <h2 className="text-lg font-bold text-slate-900">Vos Coordonnées de Facturation</h2>
              <p className="text-xs text-slate-500 mt-0.5">Ces informations figureront directement sur votre facture certifiée JawebFlow.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">Nom complet / Responsable *</label>
                <input
                  type="text"
                  value={checkoutName}
                  onChange={(e) => setCheckoutName(e.target.value)}
                  placeholder="Ex: Yacine Benali"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Adresse Email *</label>
                <input
                  type="email"
                  value={checkoutEmail}
                  onChange={(e) => setCheckoutEmail(e.target.value)}
                  placeholder="votre-email@entreprise.dz"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Nom de l'Entreprise / Commerce</label>
                <input
                  type="text"
                  value={checkoutCompany}
                  onChange={(e) => setCheckoutCompany(e.target.value)}
                  placeholder="Ex: E-Commerce Algérie SARL"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Téléphone Mobile (Optionnel)</label>
                <input
                  type="text"
                  value={checkoutPhone}
                  onChange={(e) => setCheckoutPhone(e.target.value)}
                  placeholder="05 XX XX XX XX / 07 XX XX XX XX"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCheckoutStep(1)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>← Modifier la Formule</span>
              </button>

              <button
                type="button"
                onClick={() => setCheckoutStep(3)}
                className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <span>Continuer : Mode de Paiement (Étape 3/4)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: MODE DE PAIEMENT */}
        {checkoutStep === 3 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-purple-600 uppercase tracking-wider block">Étape 3 sur 4</span>
              <h2 className="text-lg font-bold text-slate-900">Choisissez votre Mode de Règlement</h2>
              <p className="text-xs text-slate-500 mt-0.5">Toutes les méthodes sont sécurisées et certifiées.</p>
            </div>

            {/* Payment Method Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div
                onClick={() => setCheckoutPaymentMethod('slickpay_dzd')}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  checkoutPaymentMethod === 'slickpay_dzd'
                    ? 'border-purple-600 bg-purple-50/40 shadow-md ring-2 ring-purple-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-slate-900">SlickPay (DZD)</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                </div>
                <p className="text-[11px] text-slate-500">Edahabia, Carte CIB & BaridiMob (National DZD)</p>
              </div>

              <div
                onClick={() => setCheckoutPaymentMethod('stripe_card')}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  checkoutPaymentMethod === 'stripe_card'
                    ? 'border-purple-600 bg-purple-50/40 shadow-md ring-2 ring-purple-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-slate-900">Carte Internationale</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                </div>
                <p className="text-[11px] text-slate-500">VISA / Mastercard (Devises Internationales)</p>
              </div>

              <div
                onClick={() => setCheckoutPaymentMethod('baridimob_ccp')}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  checkoutPaymentMethod === 'baridimob_ccp'
                    ? 'border-purple-600 bg-purple-50/40 shadow-md ring-2 ring-purple-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-slate-900">Virement Direct</span>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                </div>
                <p className="text-[11px] text-slate-500">CCP & RIP BaridiMob (Algérie Poste)</p>
              </div>
            </div>

            {/* Method Specific Details */}
            {checkoutPaymentMethod === 'slickpay_dzd' && (
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 text-slate-100 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-slate-300 block">Support de carte sélectionné :</span>
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Certifié SATIM & Algérie Poste
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCheckoutSlickpayType('edahabia')}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      checkoutSlickpayType === 'edahabia' ? 'bg-purple-600 border-purple-500 text-white shadow-md' : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Carte Edahabia</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutSlickpayType('cib')}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      checkoutSlickpayType === 'cib' ? 'bg-purple-600 border-purple-500 text-white shadow-md' : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Carte CIB</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutSlickpayType('baridimob')}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      checkoutSlickpayType === 'baridimob' ? 'bg-purple-600 border-purple-500 text-white shadow-md' : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>BaridiMob OTP</span>
                  </button>
                </div>

                {/* Explanatory Process Box */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs text-slate-300">
                  <div className="flex items-center gap-2 text-purple-300 font-bold border-b border-slate-800 pb-1.5">
                    <HelpCircle className="w-4 h-4 text-purple-400" />
                    <span>Comment se déroule le paiement avec SlickPay ({checkoutSlickpayType.toUpperCase()}) ?</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1 text-[11px]">
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                      <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-extrabold flex items-center justify-center text-[10px]">1</span>
                      <p className="font-bold text-slate-200">Choix du moyen</p>
                      <p className="text-slate-400 text-[10px]">Vous sélectionnez Edahabia, CIB ou BaridiMob.</p>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                      <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-extrabold flex items-center justify-center text-[10px]">2</span>
                      <p className="font-bold text-slate-200">Guichet SATIM</p>
                      <p className="text-slate-400 text-[10px]">Redirection vers la page sécurisée SATIM / SlickPay.</p>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                      <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-extrabold flex items-center justify-center text-[10px]">3</span>
                      <p className="font-bold text-slate-200">Code SMS OTP</p>
                      <p className="text-slate-400 text-[10px]">Saisie du code secret SMS reçu sur votre mobile.</p>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-extrabold flex items-center justify-center text-[10px]">4</span>
                      <p className="font-bold text-emerald-300">Activation 24/7</p>
                      <p className="text-slate-400 text-[10px]">Validation automatique et reçu certifié PDF en direct.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {checkoutPaymentMethod === 'stripe_card' && (
              <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 mb-1 font-semibold">Numéro de carte bancaire</label>
                    <input
                      type="text"
                      value={checkoutCardNumber}
                      onChange={(e) => setCheckoutCardNumber(e.target.value)}
                      placeholder="4500 •••• •••• 1234"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Expiration</label>
                    <input
                      type="text"
                      value={checkoutCardExp}
                      onChange={(e) => setCheckoutCardExp(e.target.value)}
                      placeholder="MM/YY"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">CVC</label>
                    <input
                      type="text"
                      value={checkoutCardCvc}
                      onChange={(e) => setCheckoutCardCvc(e.target.value)}
                      placeholder="123"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {checkoutPaymentMethod === 'baridimob_ccp' && (
              <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 space-y-3 text-xs">
                <p className="font-bold text-slate-200">Coordonnées CCP & RIP Algérie :</p>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono space-y-1 text-slate-300">
                  <p>RIP BaridiMob : <span className="text-purple-300 font-bold">007 99999 0023412984 45</span></p>
                  <p>N° CCP : <span className="text-purple-300 font-bold">0023412984 Clé 45</span></p>
                  <p>Titulaire : <span className="text-slate-200">JawebFlow Algérie SARL</span></p>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Référence du reçu de virement (Optionnel)</label>
                  <input
                    type="text"
                    value={checkoutRipRef}
                    onChange={(e) => setCheckoutRipRef(e.target.value)}
                    placeholder="Ex: Ref 98421002"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>
            )}

            <div className="pt-4 flex items-center justify-between border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCheckoutStep(2)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>← Retour aux Coordonnées</span>
              </button>

              <button
                type="button"
                onClick={() => setCheckoutStep(4)}
                className="px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <span>Continuer : Récapitulatif & Activation (Étape 4/4)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: RÉCAPITULATIF & ACTIVATION */}
        {checkoutStep === 4 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-purple-600 uppercase tracking-wider block">Étape 4 sur 4</span>
              <h2 className="text-lg font-bold text-slate-900">Récapitulatif & Activation Immédiate</h2>
              <p className="text-xs text-slate-500 mt-0.5">Vérifiez vos éléments avant de valider l'activation en direct.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Order Summary Box */}
              <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-400">Récapitulatif Commande</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-bold border border-emerald-500/30">
                    Prêt à valider
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Formule sélectionnée :</span>
                    <span className="font-extrabold text-white">
                      {selectedCheckoutPlan === 'basic' ? 'Plan Basic' : selectedCheckoutPlan === 'pro' ? 'Plan Pro / Business' : 'Plan Enterprise'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Période :</span>
                    <span className="font-semibold text-slate-200">
                      {billingCycle === 'monthly' ? 'Facturation Mensuelle' : 'Facturation Annuelle (-20%)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Moyen de paiement :</span>
                    <span className="font-semibold text-purple-300">
                      {checkoutPaymentMethod === 'slickpay_dzd'
                        ? `SlickPay DZD (${checkoutSlickpayType.toUpperCase()})`
                        : checkoutPaymentMethod === 'stripe_card'
                        ? 'Carte Visa/Mastercard'
                        : 'Virement CCP / BaridiMob'}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-slate-400 font-medium">Total en USD :</span>
                    <span className="text-2xl font-black text-white">
                      ${selectedCheckoutPlan === 'basic'
                        ? (billingCycle === 'monthly' ? 29 : 276)
                        : selectedCheckoutPlan === 'pro'
                        ? (billingCycle === 'monthly' ? 79 : 756)
                        : (billingCycle === 'monthly' ? 199 : 1908)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Équivalent DZD :</span>
                    <span className="font-extrabold text-purple-300 font-mono">
                      ~{selectedCheckoutPlan === 'basic'
                        ? (billingCycle === 'monthly' ? '6 850' : '65 760')
                        : selectedCheckoutPlan === 'pro'
                        ? (billingCycle === 'monthly' ? '18 700' : '179 500')
                        : (billingCycle === 'monthly' ? '47 100' : '452 160')} DZD
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Confirmation Box */}
              <div className="p-5 rounded-2xl bg-purple-50/50 border border-purple-200 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-purple-800 font-bold text-sm">
                    <ShieldCheck className="w-5 h-5 text-purple-600" />
                    <span>Activation Instantanée Garantie</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    En cliquant sur le bouton ci-dessous, votre abonnement sera immédiatement activé et votre reçu/facture de paiement sera généré dans votre espace.
                  </p>
                  <div className="text-[11px] text-slate-500 space-y-1 pt-2">
                    <p>• Destinataire : <strong className="text-slate-800">{checkoutEmail || user?.email}</strong></p>
                    <p>• Titulaire : <strong className="text-slate-800">{checkoutName || user?.displayName || 'Compte Client'}</strong></p>
                  </div>
                </div>

                {/* Confirm CTA */}
                <button
                  type="button"
                  disabled={isProcessingPayment}
                  onClick={handleStartGateway}
                  className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xs sm:text-sm transition-all cursor-pointer shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2"
                >
                  {isProcessingPayment ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Validation de votre paiement en cours...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4.5 h-4.5 fill-current" />
                      <span>⚡ PASSER AU PAIEMENT ({checkoutPaymentMethod === 'slickpay_dzd' ? 'SLICKPAY DZD' : checkoutPaymentMethod === 'stripe_card' ? 'VISA/MASTERCARD' : 'CCP ALGERIE'})</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-start border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCheckoutStep(3)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>← Modifier le Mode de Paiement</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          REALISTIC SLICKPAY / SATIM E-PAYMENT GATEWAY MODAL SIMULATION
          ========================================================================= */}
      {showGatewayModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 text-slate-900 space-y-0 relative">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black text-sm shadow-sm">
                  SP
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-purple-400">
                      {checkoutPaymentMethod === 'slickpay_dzd' ? 'SlickPay SATIM DZD' : checkoutPaymentMethod === 'stripe_card' ? 'Stripe Gateway International' : 'Algérie Poste CCP'}
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-emerald-400" /> SSL 256-bit
                    </span>
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-200 mt-0.5">
                    Guichet de Paiement Officiel & Sécurisé
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowGatewayModal(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Transaction Details Strip */}
            <div className="bg-purple-50 p-4 border-b border-purple-100 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 block font-medium">Commerçant Bénéficiaire :</span>
                <span className="font-extrabold text-slate-900">JawebFlow Algérie SARL</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block font-medium">Montant à Débiter :</span>
                <span className="font-black text-purple-700 text-base font-mono">
                  {checkoutPaymentMethod === 'slickpay_dzd' ? `${getDzdAmountStr()} DZD` : `${getUsdAmountStr()} USD`}
                </span>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              
              {/* Error Message */}
              {gatewayError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
                  <X className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{gatewayError}</span>
                </div>
              )}

              {/* State 1: Processing Loader */}
              {gatewayStep === 'processing' && (
                <div className="py-12 text-center space-y-4">
                  <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Communication avec la Banque SATIM...</h4>
                    <p className="text-xs text-slate-500 mt-1">Vérification de l'autorisation et sécurisation 3-D Secure en cours.</p>
                  </div>
                </div>
              )}

              {/* State 2: Card Details Input (Edahabia / CIB / Visa) */}
              {gatewayStep === 'card_input' && (
                <form onSubmit={handleProceedToOtp} className="space-y-4 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-purple-600" />
                      Saisie des coordonnées de votre {checkoutSlickpayType === 'edahabia' ? 'Carte Edahabia' : checkoutSlickpayType === 'cib' ? 'Carte CIB' : 'Carte Bancaire'}
                    </span>
                    <span className="text-[10px] text-purple-700 font-mono font-bold bg-purple-100 px-2 py-0.5 rounded">
                      Réseau SATIM DZ
                    </span>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Numéro de la carte (16 chiffres) *</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={gatewayCardNum}
                        onChange={(e) => setGatewayCardNum(e.target.value)}
                        placeholder="5078 •••• •••• 9012"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                        required
                      />
                      <CreditCard className="w-5 h-5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Expiration (MM/AA) *</label>
                      <input
                        type="text"
                        value={gatewayExp}
                        onChange={(e) => setGatewayExp(e.target.value)}
                        placeholder="12/28"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">Cryptogramme (CVC) *</label>
                      <input
                        type="password"
                        maxLength={4}
                        value={gatewayCvc}
                        onChange={(e) => setGatewayCvc(e.target.value)}
                        placeholder="741"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Nom du Titulaire de la Carte *</label>
                    <input
                      type="text"
                      value={gatewayHolder}
                      onChange={(e) => setGatewayHolder(e.target.value)}
                      placeholder="Ex: YACINE BENALI"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 uppercase"
                      required
                    />
                  </div>

                  <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-800 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Sécurité 3-D Secure Active :
                    </p>
                    <p>Un code de confirmation SMS unique sera envoyé à votre numéro de mobile lié à la carte.</p>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-sm transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
                  >
                    <span>Demander l'autorisation & Envoyer le Code SMS</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}

              {/* State 3: OTP Verification Step */}
              {gatewayStep === 'otp_verify' && (
                <form onSubmit={handleValidateOtp} className="space-y-4 text-xs animate-in fade-in duration-200">
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-amber-950">
                      <Smartphone className="w-4 h-4 text-amber-600" />
                      <span>Authentification Forte SATIM / Algérie Poste</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-800">
                      Un code secret de sécurité à 6 chiffres a été envoyé par SMS sur votre téléphone mobile au <strong>+213 6** ** ** 45</strong>.
                    </p>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-slate-800 font-extrabold">Entrer le code SMS OTP (6 chiffres) *</label>
                      <span className="text-[10px] text-slate-400 font-mono">Expire dans : 02:45</span>
                    </div>
                    <input
                      type="text"
                      maxLength={6}
                      value={gatewayOtp}
                      onChange={(e) => setGatewayOtp(e.target.value)}
                      placeholder="Ex: 123456"
                      className="w-full text-center tracking-widest text-xl font-black px-3.5 py-3 rounded-xl border-2 border-purple-600 bg-purple-50/50 text-slate-900 font-mono focus:bg-white focus:outline-none focus:ring-4 focus:ring-purple-600/20"
                      autoFocus
                    />
                  </div>

                  {/* Test Helper Button */}
                  <button
                    type="button"
                    onClick={() => setGatewayOtp('123456')}
                    className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-purple-700 font-bold text-[11px] transition-colors cursor-pointer border border-slate-200 flex items-center justify-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5 fill-current text-purple-600" />
                    <span>⚡ Simuler la réception du code SMS "123456"</span>
                  </button>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-all cursor-pointer shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      <span>VALIDER ET DEBITER {checkoutPaymentMethod === 'slickpay_dzd' ? `${getDzdAmountStr()} DZD` : `${getUsdAmountStr()}`}</span>
                    </button>
                  </div>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => setGatewayStep('card_input')}
                      className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                    >
                      ← Revenir à la saisie de carte
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-50 p-3.5 border-t border-slate-200 text-center text-[10px] text-slate-400 flex items-center justify-between">
              <span>SlickPay SAS © 2026 - Certifié SATIM & GIE Monétique Algérie</span>
              <span className="font-mono text-slate-500">N° Trans: SAT-982341</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
