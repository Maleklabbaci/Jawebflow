import React from 'react';
import { HeroSection } from '../components/HeroSection';
import { InteractiveChatMockup } from '../components/InteractiveChatMockup';
import { TrustSection } from '../components/TrustSection';
import { KnowledgeBaseSection } from '../components/KnowledgeBaseSection';
import { ProcessSection } from '../components/ProcessSection';
import { FaqSection } from '../components/FaqSection';
import { CtaSection } from '../components/CtaSection';

interface HomePageProps {
  onOpenAssistantModal: () => void;
  onNavigate: (page: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onOpenAssistantModal, onNavigate }) => {
  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-2 sm:space-y-4">
      {/* Hero Section — inchangé (validé par le client) */}
      <HeroSection 
        onOpenAssistantModal={onOpenAssistantModal}
        onScrollToParcours={() => onNavigate('services')}
      />

      {/* Interactive Real Integrated Widget Website Preview */}
      <InteractiveChatMockup 
        onOpenKnowledgeDetails={() => scrollToSection('knowledge-section')}
        onOpenAssistantModal={onOpenAssistantModal}
      />

      {/* Ce que ça change concrètement (bénéfices + avant / après) */}
      <TrustSection
        onOpenAssistantModal={onOpenAssistantModal}
        onNavigate={onNavigate}
      />

      {/* Knowledge Base Section */}
      <KnowledgeBaseSection />

      {/* Process Section */}
      <ProcessSection 
        onOpenAssistantModal={onOpenAssistantModal}
      />

      {/* Objections & objections prix : les questions qui débloquent la décision */}
      <FaqSection
        onOpenAssistantModal={onOpenAssistantModal}
        onNavigate={onNavigate}
      />

      {/* Call to Action Final Section */}
      <CtaSection 
        onOpenAssistantModal={onOpenAssistantModal}
        onNavigate={onNavigate}
      />
    </div>
  );
};
