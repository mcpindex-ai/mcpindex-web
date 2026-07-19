import { UV_INSTALL_WIRED } from './install/commands';

/**
 * One-line gate install. Re-exported (as a scalar) from the install manifest so
 * the homepage CTA and /install render one value with no hand-synced drift, and
 * without dragging the GATE_METHODS array into the client bundle.
 *
 * Hero policy: the auditable uv path leads (installs the signed PyPI package,
 * then the wiring wizard); curl|sh is the demoted, labeled alternative.
 */
export const INSTALL_SHELL_COMMAND = UV_INSTALL_WIRED;
