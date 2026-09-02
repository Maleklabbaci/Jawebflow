import React from 'react';
import { Lock, Sparkles, ArrowRight, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';

interface LockedFeatureGateProps {
  title: string;
  subtitle: string;
  icon?: React.ElementType;
  featureName?: string;
  benefits: string[];
  recommendedPlan?: 'basic' | 'pro';
  onUpgradeClick: () => void;
  requiredPlanName?: string;
}

export const LockedFeatureGate: React.FC<LockedFeatureGateProps> = ({
  title,
  subtitle,
  icon: Icon = Lock,
  featureName,
  benefits,
  recommendedPlan = 'basic',
  onUpgradeClick,
  requiredPlanName = 'Starter ou Pro'
}) => {
  const IconComponent = Icon || Lock;
  return (
    <div className="p-6 sm:p-10 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-8 animate-in fade-in duration-200 max-w-4xl mx-auto">
      {/* Header Badge & Title */}
      <div className="text-center max-w-xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shadow-xs">
          <Lock className="w-3.5 h-3.5 text-amber-600" />
          <span>Fonctionnalité Verrouillée · Plan {requiredPlanName}</span>
        </div>

        <div className="w-16 h-16 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 mx-auto shadow-xs">
          <IconComponent className="w-8 h-8" />
        </div>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {title}
        </h2>

        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
          {subtitle}
        </p>
      </div>

      {/* Benefits Bento Box */}
      <div className="p-6 sm:p-7 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4 max-w-xl mx-auto">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
          <span>Ce qui est débloqué avec votre forfait :</span>
        </h4>

        <div className="space-y-3">
          {benefits.map((benefit, idx) => (
            <div key={idx} className="flex items-start gap-3 text-xs sm:text-sm text-slate-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="font-medium leading-snug">{benefit}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Upgrade CTA Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
        <button
          type="button"
          onClick={onUpgradeClick}
          className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-sm shadow-purple-600/20 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
          <span>Débloquer avec le Plan {recommendedPlan === 'basic' ? 'Starter (29$)' : 'Pro (79$)'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Free Plan Capabilities Reminder */}
      <div className="border-t border-slate-100 pt-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
        <ShieldCheck className="w-4 h-4 text-slate-400" />
        <span>
          Votre compte gratuit vous permet de configurer votre Base de Connaissances, l'Apparence du Widget et de tester votre Webhook.
        </span>
      </div>
    </div>
  );
};
