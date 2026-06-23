import {
  createSwitchboardProofConfig,
  runSwitchboardRandomnessProofOfLife,
} from "./switchboard.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  void createSwitchboardProofConfig()
    .then((config) => runSwitchboardRandomnessProofOfLife(config))
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error: unknown) => {
      console.error(
        error instanceof Error ? error.message : "Switchboard proof failed.",
      );
      process.exitCode = 1;
    });
}
