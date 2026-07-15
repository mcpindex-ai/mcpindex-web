import { CURL_INSTALL } from './install/commands';

/**
 * One-line gate install. Re-exported (as a scalar) from the install manifest so
 * the homepage CTA and /install render one value with no hand-synced drift, and
 * without dragging the GATE_METHODS array into the client bundle.
 */
export const INSTALL_SHELL_COMMAND = CURL_INSTALL;
