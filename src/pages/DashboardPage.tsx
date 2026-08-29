import React, { useEffect, useState } from 'react';

interface AssistantConfig {
  assistantId: string;
  plan: 'free' | 'pro';
  brandingEnabled: boolean;
}

export const DashboardPage = () => {
  const [config, setConfig] = useState<AssistantConfig | null>(null);

  // This is a placeholder for the actual ID retrieval.
  // In a real app, this would come from Auth.
  const assistantId = 'asst_live'; 

  useEffect(() => {
    fetch(`/api/assistant/config/${assistantId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch config');
        return res.json();
      })
      .then(data => setConfig(data))
      .catch(err => {
        console.error(err);
        // Set a default config if fetch fails
        setConfig({
          assistantId,
          plan: 'basic',
          brandingEnabled: true
        });
      });
  }, [assistantId]);

  const planDetails: Record<string, {name: string, price: string, conversations: string}> = {
    'basic': {name: 'Basic', price: '29 $', conversations: '1 000'},
    'pro': {name: 'Pro / Business', price: '79 $', conversations: '5 000'},
    'enterprise': {name: 'Enterprise', price: '199 $', conversations: 'Illimitées'}
  };

  const details = planDetails[config?.plan || 'basic'] || planDetails['basic'];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Mon Plan & Facturation</h1>
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <h2 className="text-2xl font-bold mb-6">Plan actuel : <span className="text-purple-600">{details.name}</span></h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-50 p-6 rounded-xl">
            <p className="text-sm text-slate-500 mb-1">Prix</p>
            <p className="text-2xl font-bold">{details.price} <span className="text-sm font-normal text-slate-500">/ mois</span></p>
          </div>
          <div className="bg-slate-50 p-6 rounded-xl">
            <p className="text-sm text-slate-500 mb-1">Conversations</p>
            <p className="text-2xl font-bold">{details.conversations}</p>
          </div>
          <div className="bg-slate-50 p-6 rounded-xl">
            <p className="text-sm text-slate-500 mb-1">Marque JawebFlow</p>
            <p className="text-xl font-bold">{config?.brandingEnabled ? 'Activée' : 'Désactivée'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
