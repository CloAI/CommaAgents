/** Choices shown before quitting with work in progress. */
interface QuitDialogOptions {
  readonly message: string;
  readonly detail: string;
  readonly buttons: string[];
  readonly defaultId: 0;
  readonly cancelId: 0;
}

/**
 * Describe the confirmation shown when runs would be stopped.
 * @param {number} activeRuns - Number of runs still running.
 * @returns {QuitDialogOptions} Dialog content.
 */
export function quitDialogOptions(activeRuns: number): QuitDialogOptions {
  const noun = activeRuns === 1 ? "run is" : "runs are";
  return {
    message: `${activeRuns} ${noun} still active. Quit and stop ${activeRuns === 1 ? "it" : "them"}?`,
    detail: "Quitting stops the daemon and every run it is executing.",
    buttons: ["Cancel", "Quit"],
    defaultId: 0,
    cancelId: 0,
  };
}

/**
 * Decide whether quitting may go ahead, asking only when work would be lost.
 * @param {number} activeRuns - Number of runs still running.
 * @param {(options: QuitDialogOptions) => Promise<number>} ask - Shows the dialog and resolves to the pressed button's index.
 * @returns {Promise<boolean>} Whether to quit.
 */
export async function confirmQuit(
  activeRuns: number,
  ask: (options: QuitDialogOptions) => Promise<number>,
): Promise<boolean> {
  if (activeRuns === 0) {
    return true;
  }
  return (await ask(quitDialogOptions(activeRuns))) === 1;
}
