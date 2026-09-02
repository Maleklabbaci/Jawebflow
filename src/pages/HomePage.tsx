import React from 'react';
import { HeroSection } from '../components/HeroSection';
import { InteractiveChatMockup } from '../components/InteractiveChatMockup';
import { KnowledgeBaseSection } from '../components/KnowledgeBaseSection';
import { ProcessSection } from '../components/ProcessSection';
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
    <div className="space-y-4">
      {/* Hero Section */}
      <HeroSection 
        onOpenAssistantModal={onOpenAssistantModal}
        onScrollToParcours={() => onNavigate('services')}
      />

      {/* Interactive Real Integrated Widget Website Preview */}
      <InteractiveChatMockup 
        onOpenKnowledgeDetails={() => scrollToSection('knowledge-section')}
        onOpenAssistantModal={onOpenAssistantModal}
      />

      {/* Knowledge Base Section */}
      <KnowledgeBaseSection />

      {/* Process Section */}
      <ProcessSection 
        onOpenAssistantModal={onOpenAssistantModal}
      />

      {/* Call to Action Final Section */}
      <CtaSection 
        onOpenAssistantModal={onOpenAssistantModal}
        onNavigate={onNavigate}
      />
    </div>
  );
};
