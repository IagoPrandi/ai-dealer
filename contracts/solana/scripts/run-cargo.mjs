import { spawnSync } from "node:child_process";
import process from "node:process";

const cargoArgs = process.argv.slice(2);

if (cargoArgs.length === 0) {
  console.error("Usage: node scripts/run-cargo.mjs <cargo arguments>");
  process.exit(2);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exitCode = result.status ?? 1;
  return result.status ?? 1;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

if (process.platform !== "win32") {
  run("cargo", cargoArgs);
} else {
  console.log(
    "[solana-programs] Windows detected; running Rust validation in the pinned Linux container.",
  );

  const workspace = process.cwd();
  const dockerBase = [
    "run",
    "--rm",
    "-e",
    "CARGO_BUILD_JOBS=1",
    "-e",
    "CARGO_TARGET_DIR=/target",
    "-v",
    "tyche-cargo-registry:/usr/local/cargo/registry",
    "-v",
    "tyche-cargo-target:/target",
    "-v",
    `${workspace}:/workspace`,
    "-w",
    "/workspace",
    "rust:1.91-bookworm",
  ];

  if (cargoArgs[0] === "clippy" || cargoArgs[0] === "fmt") {
    const component = cargoArgs[0] === "clippy" ? "clippy" : "rustfmt";
    const command = [
      `/usr/local/cargo/bin/rustup component add ${component} >/dev/null`,
      `/usr/local/cargo/bin/cargo ${cargoArgs.map(shellQuote).join(" ")}`,
    ].join(" && ");
    run("docker", [...dockerBase, "bash", "-c", command]);
  } else {
    run("docker", [...dockerBase, "cargo", ...cargoArgs]);
  }
}
