import React, { useState } from 'react';
import { 
  User, 
  Building, 
  Mail, 
  Phone, 
  Lock, 
  KeyRound, 
  Camera, 
  Check, 
  AlertCircle, 
  Save, 
  ShieldCheck, 
  LogOut,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { updateUserAccountProfile, changeUserPassword, sendResetPassword } from '../lib/firebase';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80'
];

export const AccountProfileView: React.FC = () => {
  const { user, profile, logout } = useAuth();

  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || '');
  const [companyName, setCompanyName] = useState(profile?.companyName || '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phoneNumber || '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || user?.photoURL || '');

  // Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Status state
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      await updateUserAccountProfile(user.uid, {
        displayName: displayName.trim(),
        companyName: companyName.trim(),
        phoneNumber: phoneNumber.trim(),
        photoURL: photoURL.trim(),
      });
      setSaveMessage({ type: 'success', text: 'Profil et informations entreprise mis à jour avec succès !' });
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err: any) {
      setSaveMessage({ type: 'error', text: err.message || 'Erreur lors de la mise à jour.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Le mot de passe doit comporter au moins 6 caractères.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Les deux mots de passe ne correspondent pas.' });
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordMessage(null);

    try {
      await changeUserPassword(newPassword);
      setPasswordMessage({ type: 'success', text: 'Mot de passe modifié avec succès !' });
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordMessage(null), 4000);
    } catch (err: any) {
      setPasswordMessage({ 
        type: 'error', 
        text: err.code === 'auth/requires-recent-login' 
          ? 'Pour des raisons de sécurité, veuillez vous reconnecter avant de changer votre mot de passe.' 
          : (err.message || 'Erreur lors de la modification du mot de passe.') 
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!user?.email) return;
    setIsSendingReset(true);
    setPasswordMessage(null);

    try {
      await sendResetPassword(user.email);
      setPasswordMessage({ type: 'success', text: `Un lien de réinitialisation sécurisé a été envoyé à ${user.email}.` });
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err.message || "Erreur lors de l'envoi de l'email." });
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Title */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Gestion de votre Compte & Entreprise</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Mettez à jour les informations de votre profil, de votre entreprise et gérez la sécurité de vos accès.
        </p>
      </div>

      {/* Profile & Business Form */}
      <form onSubmit={handleSaveProfile} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900">Informations Personnelles & Entreprise</h3>
            <p className="text-xs text-slate-500">Ces détails apparaissent sur votre espace et vos factures.</p>
          </div>
        </div>

        {saveMessage && (
          <div className={`p-4 rounded-xl text-xs flex items-center gap-2 ${
            saveMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}>
            {saveMessage.type === 'success' ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{saveMessage.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Display Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">Nom & Prénom</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex: Sarah Benjelloun"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
                required
              />
            </div>
          </div>

          {/* Company Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">Nom de l'Entreprise</label>
            <div className="relative">
              <Building className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ex: Atlas Digital SARL"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
              />
            </div>
          </div>

          {/* Email (Read Only with badge) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">Adresse Email (Compte)</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 text-xs cursor-not-allowed"
              />
            </div>
            <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-medium">
              <Check className="w-3 h-3" /> Compte authentifié
            </span>
          </div>

          {/* Phone Number / WhatsApp */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">Numéro Téléphone / WhatsApp Pro</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Ex: +212 6 12 34 56 78"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
              />
            </div>
          </div>
        </div>

        {/* Photo URL / Avatar */}
        <div className="space-y-3 pt-2">
          <label className="block text-xs font-semibold text-slate-700">Photo de profil ou Logo d'Entreprise</label>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-purple-100 border-2 border-purple-200 overflow-hidden shrink-0 flex items-center justify-center">
              {photoURL ? (
                <img src={photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-6 h-6 text-purple-600" />
              )}
            </div>
            <div className="flex-1 w-full space-y-1.5">
              <input
                type="url"
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                placeholder="Lien URL de votre logo ou photo (ex: https://monsite.com/logo.png)"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-purple-600 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">Ou choisissez un avatar prédéfini :</span>
                <div className="flex items-center gap-1.5">
                  {PRESET_AVATARS.map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPhotoURL(url)}
                      className="w-6 h-6 rounded-full overflow-hidden border border-slate-200 hover:border-purple-600 transition-all cursor-pointer hover:scale-110"
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm shadow-purple-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Enregistrement en cours...' : 'Enregistrer les modifications'}</span>
          </button>
        </div>
      </form>

      {/* Security & Password Form */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Sécurité & Mot de Passe</h3>
              <p className="text-xs text-slate-500">Mettez à jour votre mot de passe d'accès.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSendResetEmail}
            disabled={isSendingReset}
            className="text-xs text-purple-600 hover:text-purple-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-purple-50 transition-colors cursor-pointer"
          >
            {isSendingReset ? 'Envoi...' : 'Recevoir un lien par email'}
          </button>
        </div>

        {passwordMessage && (
          <div className={`p-4 rounded-xl text-xs flex items-center gap-2 ${
            passwordMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}>
            {passwordMessage.type === 'success' ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{passwordMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Nouveau Mot de Passe</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 6 caractères"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-purple-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Confirmer le Mot de Passe</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Répétez le mot de passe"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:bg-white focus:border-purple-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isUpdatingPassword || !newPassword}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40"
            >
              <KeyRound className="w-4 h-4" />
              <span>{isUpdatingPassword ? 'Modification...' : 'Changer le mot de passe'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Logout Row */}
      <div className="p-5 rounded-2xl bg-rose-50/50 border border-rose-100 flex items-center justify-between">
        <div>
          <h4 className="font-bold text-xs text-rose-900">Déconnexion de session</h4>
          <p className="text-[11px] text-rose-700">Fermer la session sur cet appareil.</p>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="px-4 py-2 rounded-xl bg-white hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Se déconnecter</span>
        </button>
      </div>
    </div>
  );
};
