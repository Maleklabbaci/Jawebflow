import React, { useState } from 'react';
import { 
  Mail, 
  Phone, 
  MapPin, 
  Send, 
  MessageCircle, 
  Building2, 
  Sparkles, 
  CheckCircle2, 
  Clock,
  ShieldCheck
} from 'lucide-react';

interface ContactPageProps {
  onOpenAssistantModal: () => void;
  onNavigate: (page: string) => void;
}

export const ContactPage: React.FC<ContactPageProps> = ({ onOpenAssistantModal }) => {
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    sector: 'services',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="pt-28 pb-20 px-6 sm:px-10 lg:px-16 max-w-[1440px] mx-auto space-y-16">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold backdrop-blur-xl">
          <MessageCircle className="w-3.5 h-3.5 text-purple-400" />
          <span>Équipe d'ingénieurs & Support dédié</span>
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-display tracking-tight text-neutral-100">
          Parlons de votre projet et de <br />
          <span className="bg-gradient-to-r from-purple-300 via-fuchsia-200 to-indigo-300 bg-clip-text text-transparent">
            vos objectifs de conversion.
          </span>
        </h1>
        <p className="text-neutral-300 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
          Déploiement clé en main, cadrage sur-mesure ou facture proforma d'entreprise : nous vous répondons sous 2 heures ouvrées.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Contact Info & Guarantees (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 sm:p-8 rounded-3xl bg-neutral-950/40 border border-white/10 backdrop-blur-2xl space-y-6 shadow-xl">
            <h3 className="text-xl font-bold text-neutral-100 font-display">Coordonnées directes</h3>
            
            <div className="space-y-4 text-xs sm:text-sm text-neutral-300">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex-shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-neutral-400 text-[11px]">Email professionnel</span>
                  <a href="mailto:contact@jawebflow.dz" className="font-semibold text-neutral-100 hover:text-purple-300 transition-colors">
                    contact@jawebflow.dz
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex-shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-neutral-400 text-[11px]">Ligne directe & WhatsApp Pro</span>
                  <span className="font-semibold text-neutral-100">+213 (0) 550 00 00 00</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex-shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-neutral-400 text-[11px]">Bureaux & Interventions</span>
                  <span className="font-semibold text-neutral-100">Alger, Oran, Constantine — Déploiement partout en Algérie 🇩🇿</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex-shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-neutral-400 text-[11px]">Horaires de support</span>
                  <span className="font-semibold text-neutral-100">Lundi au Samedi : 08h30 – 18h30</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-neutral-950/40 border border-white/10 backdrop-blur-2xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-300">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>Garanties d'accompagnement</span>
            </div>
            <ul className="text-xs text-neutral-300 space-y-2">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Devis proforma officiel avec coordonnées fiscales sous 2h</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Installation et paramétrage offerts sur votre site</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Paiement sécurisé et facturation d’entreprise conforme</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Contact / Proforma Form (7 cols) */}
        <div className="lg:col-span-7">
          <div className="p-6 sm:p-8 rounded-3xl bg-neutral-950/50 border border-white/10 backdrop-blur-2xl shadow-2xl space-y-6">
            <div>
              <h3 className="text-xl font-bold text-neutral-100 font-display">Demande d'accompagnement & Devis</h3>
              <p className="text-xs text-neutral-400 mt-1">Remplissez ce formulaire pour recevoir une proposition adaptée à votre entreprise.</p>
            </div>

            {submitted ? (
              <div className="p-8 rounded-2xl bg-purple-500/20 border border-purple-500/40 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-purple-500/30 flex items-center justify-center text-purple-300 mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-lg font-bold text-neutral-100">Message bien transmis !</h4>
                <p className="text-xs text-neutral-300 max-w-md mx-auto">
                  Notre équipe technique et commerciale vous contactera dans les plus brefs délais avec une démonstration personnalisée.
                </p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="mt-4 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold"
                >
                  Envoyer une autre demande
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">Nom et Prénom</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Karim Benali"
                      className="w-full bg-neutral-900/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">Nom de l'entreprise ou marque</label>
                    <input
                      type="text"
                      required
                      value={formData.company}
                      onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                      placeholder="Ex: SARL Alger Tech, Maison Bio..."
                      className="w-full bg-neutral-900/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">Adresse Email</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="contact@entreprise.dz"
                      className="w-full bg-neutral-900/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1.5">Numéro de Téléphone (DZ)</label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="05 / 06 / 07 ..."
                      className="w-full bg-neutral-900/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Secteur d'activité</label>
                  <select
                    value={formData.sector}
                    onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                    className="w-full bg-neutral-900/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-neutral-100 focus:outline-none focus:border-purple-500 transition-all cursor-pointer"
                  >
                    <option value="services">Services & Agence B2B</option>
                    <option value="ecommerce">E-commerce & Vente en ligne</option>
                    <option value="formation">Institut, École & Formation</option>
                    <option value="cabinet">Cabinet Médical & Santé</option>
                    <option value="autre">Autre domaine d'activité</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Votre message ou spécificités du projet</label>
                  <textarea
                    rows={3}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Précisez vos besoins : intégration sur votre site actuel, connexion WhatsApp, volume de demandes..."
                    className="w-full bg-neutral-900/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-all resize-none"
                  ></textarea>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-purple-600/40 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>Envoyer ma demande & recevoir le devis</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
