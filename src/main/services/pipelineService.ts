/**
 * High-level mod pipeline orchestrator (Public Facade).
 * Decomposed into modular sub-services under ./pipeline/
 *
 * stage (assets + merged items_game) -> pack (VPK) -> mount (gameinfo) -> sign
 * Everything that touches the game happens only after the pack was built successfully.
 */

export * from './pipeline/pipelineStatus'
export * from './pipeline/bundleBuilder'
export * from './pipeline/selectionBuilder'
export * from './pipeline/packInstaller'
