import { setConfiguredVrfToSwitchboardDevnet } from "./switchboard.js";

if (import.meta.url === `file://${process.argv[1]}`) {
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
