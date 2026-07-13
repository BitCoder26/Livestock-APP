export type BackendActionResult = {
  requiresBackend: boolean;
  message: string;
};

export async function requestPasswordChange(): Promise<BackendActionResult> {
  return {
    requiresBackend: true,
    message:
      'Password changes are ready in the app UI, but you still need to connect a real auth backend to complete them.',
  };
}

export async function requestSignOutAllDevices(): Promise<BackendActionResult> {
  return {
    requiresBackend: true,
    message:
      'Sign out of all devices needs a real auth backend so active sessions can be revoked everywhere.',
  };
}

export async function requestDeleteAccount(): Promise<BackendActionResult> {
  return {
    requiresBackend: true,
    message:
      'Local account data was cleared on this device. To permanently delete the account everywhere, connect a real auth backend.',
  };
}
