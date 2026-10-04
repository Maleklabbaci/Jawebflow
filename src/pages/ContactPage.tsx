import React, { useState } from 'react';
import {
  Mail,
  Phone,
  MapPin,
  Send,
  MessageCircle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ArrowRight
} from 'lucide-react';

interface ContactPageProps {
  onOpenAssistantModal: () => void;
  onNavigate: (page: string) => void;
}

type Status = 'idle' | 'sending' | 'sent' | 'error';

export const ContactPage: React.FC<ContactPageProps> = ({ onOpenAssistantModal }) => {
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    sector: 'services',
    message: ''
  });
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const update = (field: keyof typeof formData, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'sending') return;

    setStatus('sending');
    setErrorMessage('');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.ok) {
        // On ne dit JAMAIS « message envoyé » si personne ne l'a reçu.
        setErrorMessage(
          data?.error ||
            'Nous n’avons pas pu transmettre votre demande. Écrivez-nous directement à contact@jawebflow.dz.'
        );
        setStatus('error');
        return;
      }

      setStatus('sent');
    } catch {
      setErrorMessage(
        'Connexion interrompue. Réessayez, ou écrivez-nous directement à contact@jawebflow.dz — nous répondons sous 2 heures ouvrées.'
      );
      setStatus('error');
    }
  };

  const mailtoFallback = `mailto:contact@jawebflow.dz?subject=${encodeURIComponent(
    `Demande de devis — ${formData.company || 'mon entreprise'}`
  )}&body=${encodeURIComponent(
    `${formData.message}\n\n${formData.name}\n${formData.company}\n${formData.email}\n${formData.phone}`
  )}`;

  return (
    <div className="mx-auto max-w-[1440px] space-y-14 px-6 pb-20 pt-28 sm:px-10 lg:px-16">
      {/* Header */}
      <div className="mx-auto max-w-3xl space-y-5 text-center">
        <span className="lux-eyebrow">
          <MessageCircle className="h-3.5 w-3.5 text-purple-300" />
          Réponse sous 2 heures ouvrées
        </span>
        <h1 className="lux-h1">
          Parlons de votre projet. <br />
          <span className="lux-accent">Et de ce que ça peut vous rapporter.</span>
        </h1>
        <p className="lux-lead mx-auto max-w-2xl">
          Déploiement clé en main, cadrage sur mesure ou facture proforma d’entreprise :
          dites-nous simplement ce dont vous avez besoin, nous revenons vers vous avec une
          proposition claire — prix et délais inclus.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Contact Info & Guarantees (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          <div className="lux-card space-y-6 p-6 sm:p-8">
            <h2 className="lux-h3 text-[1.1rem]">Coordonnées directes</h2>

            <div className="space-y-5 text-[0.84rem] text-neutral-300">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/12 text-purple-200">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <span className="block text-[0.68rem] uppercase tracking-[0.12em] text-neutral-500">Email professionnel</span>
                  <a href="mailto:contact@jawebflow.dz" className="font-medium text-neutral-100 transition-colors hover:text-purple-200">
                    contact@jawebflow.dz
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/12 text-purple-200">
                  <Phone className="h-4 w-4" />
                </div>
                <div>
                  <span className="block text-[0.68rem] uppercase tracking-[0.12em] text-neutral-500">Ligne directe & WhatsApp Pro</span>
                  <span className="font-medium text-neutral-100">+213 (0) 550 00 00 00</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/12 text-purple-200">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <span className="block text-[0.68rem] uppercase tracking-[0.12em] text-neutral-500">Bureaux & interventions</span>
                  <span className="font-medium text-neutral-100">Alger, Oran, Constantine — déploiement partout en Algérie 🇩🇿</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/12 text-purple-200">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <span className="block text-[0.68rem] uppercase tracking-[0.12em] text-neutral-500">Horaires de support</span>
                  <span className="font-medium text-neutral-100">Lundi au samedi : 08h30 – 18h30</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lux-card space-y-3.5 p-6">
            <div className="flex items-center gap-2 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-purple-200">
              <ShieldCheck className="h-4 w-4 text-purple-300" />
              <span>Ce que vous obtenez en nous écrivant</span>
            </div>
            <ul className="space-y-2.5">
              {[
                'Un devis proforma officiel avec vos mentions fiscales, sous 2 heures ouvrées',
                'L’installation et le paramétrage offerts sur votre site',
                'Une démonstration adaptée à votre activité, sans engagement',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[0.82rem] font-light leading-relaxed text-neutral-300">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-300" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="lux-card p-6">
            <p className="lux-sub text-[0.84rem]">
              Pressé ? Vous pouvez déjà créer votre espace et préparer votre assistant
              gratuitement — sans carte bancaire.
            </p>
            <button onClick={onOpenAssistantModal} className="btn btn-primary btn-sm mt-4">
              <span>Créer mon assistant</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Contact / Proforma Form (7 cols) */}
        <div className="lg:col-span-7">
          <div className="lux-card p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="lux-h3 text-[1.15rem]">Demande d’accompagnement & devis</h2>
              <p className="lux-sub mt-1.5 text-[0.84rem]">
                Deux minutes suffisent. Plus votre message est précis, plus notre proposition l’est aussi.
              </p>
            </div>

            {status === 'sent' ? (
              <div className="space-y-4 rounded-2xl border border-purple-400/30 bg-purple-500/[0.08] p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20 text-purple-200">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="lux-h3 text-[1.1rem]">Demande transmise à l’équipe</h3>
                <p className="lux-sub mx-auto max-w-md text-[0.84rem]">
                  Merci {formData.name.split(' ')[0] || ''} — nous revenons vers vous sous 2 heures ouvrées
                  avec une proposition adaptée à {formData.company || 'votre entreprise'}.
                </p>
                <button onClick={() => setStatus('idle')} className="btn btn-glass btn-sm">
                  Envoyer une autre demande
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label className="lux-label" htmlFor="contact-name">Nom et prénom</label>
                    <input
                      id="contact-name"
                      type="text"
                      required
                      autoComplete="name"
                      value={formData.name}
                      onChange={(e) => update('name', e.target.value)}
                      placeholder="Ex : Karim Benali"
                      className="lux-input"
                    />
                  </div>
                  <div>
                    <label className="lux-label" htmlFor="contact-company">Entreprise ou marque</label>
                    <input
                      id="contact-company"
                      type="text"
                      required
                      autoComplete="organization"
                      value={formData.company}
                      onChange={(e) => update('company', e.target.value)}
                      placeholder="Ex : SARL Alger Tech"
                      className="lux-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label className="lux-label" htmlFor="contact-email">Adresse email</label>
                    <input
                      id="contact-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={formData.email}
                      onChange={(e) => update('email', e.target.value)}
                      placeholder="contact@entreprise.dz"
                      className="lux-input"
                    />
                  </div>
                  <div>
                    <label className="lux-label" htmlFor="contact-phone">Téléphone (DZ)</label>
                    <input
                      id="contact-phone"
                      type="tel"
                      required
                      autoComplete="tel"
                      value={formData.phone}
                      onChange={(e) => update('phone', e.target.value)}
                      placeholder="05 / 06 / 07 …"
                      className="lux-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="lux-label" htmlFor="contact-sector">Secteur d’activité</label>
                  <select
                    id="contact-sector"
                    value={formData.sector}
                    onChange={(e) => update('sector', e.target.value)}
                    className="lux-input cursor-pointer"
                  >
                    <option value="services">Services & Agence B2B</option>
                    <option value="ecommerce">E-commerce & Vente en ligne</option>
                    <option value="formation">Institut, École & Formation</option>
                    <option value="cabinet">Cabinet médical & Santé</option>
                    <option value="autre">Autre domaine d’activité</option>
                  </select>
                </div>

                <div>
                  <label className="lux-label" htmlFor="contact-message">Votre besoin</label>
                  <textarea
                    id="contact-message"
                    rows={4}
                    value={formData.message}
                    onChange={(e) => update('message', e.target.value)}
                    placeholder="Ex : je veux installer l’assistant sur ma boutique Shopify, avec les frais de livraison par wilaya et une facture proforma pour ma société."
                    className="lux-input"
                  />
                </div>

                {status === 'error' && (
                  <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-400/30 bg-rose-500/[0.08] p-3.5 text-[0.82rem] leading-snug text-rose-200">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-300" />
                    <div className="space-y-1.5">
                      <p>{errorMessage}</p>
                      <a href={mailtoFallback} className="inline-block font-medium text-white underline underline-offset-4">
                        Ouvrir mon logiciel d’email (message pré-rempli)
                      </a>
                    </div>
                  </div>
                )}

                <button type="submit" disabled={status === 'sending'} className="btn btn-primary btn-block btn-lg">
                  {status === 'sending' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Envoi en cours…</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Recevoir ma proposition</span>
                    </>
                  )}
                </button>

                <p className="lux-note text-center text-[0.76rem]">
                  Vos coordonnées servent uniquement à vous répondre. Jamais de revente, jamais de spam.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
