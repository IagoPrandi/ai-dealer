import { pathToFileURL } from "node:url";
import {
  createSwitchboardProofConfig,
  runSwitchboardRandomnessProofOfLife,
} from "./switchboard.js";

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
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
