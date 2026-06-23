import { pathToFileURL } from "node:url";
import { setConfiguredVrfToSwitchboardDevnet } from "./switchboard.js";

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void setConfiguredVrfToSwitchboardDevnet()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error: unknown) => {
      console.error(
        error instanceof Error ? error.message : "Switchboard config failed.",
      );
      process.exitCode = 1;
    });
}
