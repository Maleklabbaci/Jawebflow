export function buildDemoReply(message: string) {
  const normalized = message.trim().toLocaleLowerCase("fr-FR");
  if (/\b(bonjour|salam|hello|slm)\b/.test(normalized)) {
    return "Salam ! Je peux vous renseigner sur les produits, les prix et la livraison. Quel produit souhaitez-vous découvrir ?";
  }
  if (/\b(prix|tarif|combien|coût)\b/.test(normalized)) {
    return "Je consulte uniquement les informations commerciales disponibles avant de confirmer un prix. Quel produit vous intéresse ?";
  }
  if (/\b(livraison|livrer|wilaya)\b/.test(normalized)) {
    return "Je vérifie les conditions de livraison enregistrées pour votre zone. Indiquez-moi votre wilaya et le produit concerné.";
  }
  return "Merci pour votre message. Je peux répondre à partir des produits, prix, FAQ et informations de livraison configurés par ce business.";
}
