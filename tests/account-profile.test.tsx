// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { uid: 'user-1', email: 'user@example.test', displayName: 'Maya' },
  profile: { uid: 'user-1', email: 'user@example.test', displayName: 'Maya', companyName: 'Atelier Initial', phoneNumber: '+33100000000' },
  updateProfile: vi.fn(),
  updateUserAccountProfile: vi.fn().mockResolvedValue(undefined),
  changeUserPassword: vi.fn(),
  sendResetPassword: vi.fn(),
}));

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ ...mocks, logout: vi.fn() }),
}));
vi.mock('../src/lib/supabase', () => ({
  updateUserAccountProfile: mocks.updateUserAccountProfile,
  changeUserPassword: mocks.changeUserPassword,
  sendResetPassword: mocks.sendResetPassword,
}));

import { AccountProfileView } from '../src/components/AccountProfileView';

afterEach(() => {
  cleanup();
  mocks.updateProfile.mockReset();
  mocks.updateUserAccountProfile.mockClear();
});

describe('Profil entreprise', () => {
  it('enregistre le nom et le téléphone du profil dans l’assistant, puis dans le compte', async () => {
    const onAssistantProfileUpdate = vi.fn().mockResolvedValue(undefined);
    render(<AccountProfileView onAssistantProfileUpdate={onAssistantProfileUpdate} />);

    fireEvent.change(screen.getByLabelText("Nom de l'Entreprise"), { target: { value: 'Cabinet Horizon' } });
    fireEvent.change(screen.getByLabelText('Téléphone / WhatsApp'), { target: { value: '+33 6 12 34 56 78' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));

    await waitFor(() => expect(screen.getByText(/Profil et informations de l’assistant mis à jour/)).toBeTruthy());
    expect(onAssistantProfileUpdate).toHaveBeenCalledWith({ companyName: 'Cabinet Horizon', phoneNumber: '+33 6 12 34 56 78' });
    expect(mocks.updateUserAccountProfile).toHaveBeenCalledWith('user-1', expect.objectContaining({
      companyName: 'Cabinet Horizon',
      phoneNumber: '+33 6 12 34 56 78',
    }));
    expect(onAssistantProfileUpdate.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateUserAccountProfile.mock.invocationCallOrder[0]);
  });

  it('n’affiche pas de succès si la synchronisation de l’assistant échoue', async () => {
    const onAssistantProfileUpdate = vi.fn().mockRejectedValue(new Error('Assistant indisponible'));
    render(<AccountProfileView onAssistantProfileUpdate={onAssistantProfileUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
    expect(await screen.findByText('Assistant indisponible')).toBeTruthy();
    expect(mocks.updateUserAccountProfile).not.toHaveBeenCalled();
  });
});
