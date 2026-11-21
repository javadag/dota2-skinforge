/**
 * High-level mod pipeline orchestrator (Public Facade).
 *
 * stage (assets + compiled items_game) -> post-compile passes -> pack (VPK) -> mount (gameinfo) -> sign.
 * Everything that touches Dota 2 happens only after the VPK builds cleanly.
 */

export * from './pipelineStatus'
export * from './selectionBuilder'
export * from './packInstaller'
