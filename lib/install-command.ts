import { GATE_METHODS } from './install/manifest';

/**
 * One-line gate install. Re-exported from the install manifest so the homepage
 * and /install render one value (no hand-synced drift).
 */
export const INSTALL_SHELL_COMMAND = GATE_METHODS.find((m) => m.id === 'curl')!.command;
