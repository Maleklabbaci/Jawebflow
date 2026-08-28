import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocalSession } from "@/contexts/LocalSessionContext";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLocation } from "wouter";

export default function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login, register } = useLocalSession();
  const [, setLocation] = useLocation();
  const isRegister = mode === "register";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      if (isRegister) await register(email, password);
      else await login(email, password);
      setLocation("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Une erreur est survenue. Réessaie dans un instant.");
    }
  }

  return (
    <main className="auth-screen dream-shell min-h-screen overflow-hidden px-5 py-6 sm:px-8 lg:px-12">
      <div className="floating-orb floating-orb--lavender" />
      <div className="floating-orb floating-orb--mint" />
      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative max-w-xl pt-6 lg:pt-0">
          <div className="corner-mark corner-mark--top" aria-hidden="true" />
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#665c83]">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/65 text-[#6d5ca8] shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            JawebFlow
          </div>
          <p className="mt-12 text-xs font-semibold uppercase tracking-[0.28em] text-[#746b88]">Atelier conversationnel</p>
          <h1 className="display-serif mt-5 text-5xl leading-[0.96] text-[#3f365d] sm:text-6xl lg:text-7xl">
            Une voix fidèle à votre business.
          </h1>
          <p className="mt-7 max-w-md text-base leading-7 text-[#665f76] sm:text-lg">
            Rassemblez vos produits, vos prix et vos réponses utiles. JawebFlow prépare un espace clair pour votre futur assistant commercial.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <div className="soft-note">
              <Check className="h-4 w-4 text-[#7e6eb4]" />
              <span>Un widget unique, lié à votre activité.</span>
            </div>
            <div className="soft-note">
              <Check className="h-4 w-4 text-[#7e6eb4]" />
              <span>Vos connaissances prêtes pour l’IA.</span>
            </div>
          </div>
          <div className="mt-16 flex items-center gap-4 text-xs uppercase tracking-[0.22em] text-[#807790]">
            <span className="h-px w-10 bg-[#a79bbc]" />
            Algérie · Français · Darija
          </div>
          <div className="corner-mark corner-mark--bottom" aria-hidden="true" />
        </section>

        <section className="auth-panel relative rounded-[2rem] border border-white/70 bg-white/60 p-7 shadow-[0_24px_80px_rgba(94,76,137,0.12)] backdrop-blur-xl sm:p-10">
          <div className="absolute left-8 top-0 h-16 w-px bg-gradient-to-b from-transparent via-[#cbbfdb] to-transparent" />
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7d738f]">Votre espace</p>
          <h2 className="display-serif mt-3 text-4xl text-[#40365e]">{isRegister ? "Commencez doucement." : "Bon retour."}</h2>
          <p className="mt-3 text-sm leading-6 text-[#6a6377]">
            {isRegister ? "Créez votre accès puis générez votre premier widget en quelques instants." : "Connectez-vous pour retrouver la configuration de votre bot."}
          </p>

          <div className="mt-8 grid grid-cols-2 rounded-full bg-[#f3eff6] p-1 text-sm">
            <button type="button" onClick={() => setMode("register")} className={`rounded-full px-4 py-2.5 transition ${isRegister ? "bg-white text-[#483c66] shadow-sm" : "text-[#7d738d]"}`}>Créer un compte</button>
            <button type="button" onClick={() => setMode("login")} className={`rounded-full px-4 py-2.5 transition ${!isRegister ? "bg-white text-[#483c66] shadow-sm" : "text-[#7d738d]"}`}>Se connecter</button>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-[#564d69]">Email professionnel</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="vous@business.dz" required className="h-12 rounded-xl border-[#dfd7e7] bg-white/75 px-4 text-[#443c58] placeholder:text-[#a19aa9]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-[#564d69]">Mot de passe</Label>
              <Input id="password" type="password" autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} placeholder="8 caractères minimum" minLength={8} required className="h-12 rounded-xl border-[#dfd7e7] bg-white/75 px-4 text-[#443c58] placeholder:text-[#a19aa9]" />
            </div>
            {error ? <p role="alert" className="rounded-xl bg-[#fff0f1] px-4 py-3 text-sm text-[#a1435a]">{error}</p> : null}
            <Button type="submit" className="group h-12 w-full rounded-xl bg-[#5d4d87] text-sm font-medium tracking-wide text-white shadow-[0_12px_24px_rgba(93,77,135,0.23)] transition hover:bg-[#4e3f77]">
              {isRegister ? "Entrer dans l’atelier" : "Accéder au dashboard"}
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </form>
          <p className="mt-5 text-center text-xs leading-5 text-[#8a8294]">Mode local de démonstration — la connexion Supabase sera branchée dès que ses clés seront disponibles.</p>
        </section>
      </div>
    </main>
  );
}
