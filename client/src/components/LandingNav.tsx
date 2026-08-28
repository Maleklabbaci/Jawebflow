import React, { useEffect, useState } from "react";
import { Menu, Sparkles, X } from "lucide-react";

type LandingNavProps = {
  onStart: () => void;
};

const items = [
  { href: "#hero", label: "Accueil" },
  { href: "#connaissances", label: "Connaissances" },
  { href: "#parcours", label: "Parcours" },
  { href: "#demo", label: "Démo" },
];

export default function LandingNav({ onStart }: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 15);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`reference-nav${scrolled ? " reference-nav--scrolled" : ""}`}>
      <div className="reference-nav__inner">
        <a className="reference-brand" href="#hero" aria-label="JawebFlow accueil">
          <span className="reference-brand__mark">J</span>
          <span>JawebFlow</span>
        </a>

        <nav className="reference-nav__links" aria-label="Navigation principale">
          {items.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}
        </nav>

        <div className="reference-nav__actions">
          <button type="button" className="reference-nav__cta" onClick={onStart}><Sparkles size={15} /> Créer mon assistant</button>
          <button type="button" className="reference-nav__toggle" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label="Afficher le menu">
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>
      {open ? <nav className="reference-nav__mobile" aria-label="Navigation mobile">{items.map(item => <a key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</a>)}<button type="button" onClick={onStart}>Créer mon assistant</button></nav> : null}
    </header>
  );
}
