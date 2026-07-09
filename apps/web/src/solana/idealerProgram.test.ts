import assert from "node:assert/strict";
import { test } from "node:test";

import { address } from "@solana/kit";

import {
  confirmedProgramAccountExists,
  IDEALER_PROGRAM_ID,
  waitForConfirmedProgramAccount,
} from "./idealerProgram.js";

type AccountInfoResult = {
  value: null | {
    data: readonly [string, string];
    owner: string;
  };
};

function createAccountReader(results: AccountInfoResult[]) {
  let calls = 0;
  return {
    calls: () => calls,
    client: {
      runtime: {
        rpc: {
          getAccountInfo: () => ({
            send: async () => {
              const result = results[Math.min(calls, results.length - 1)] ?? {
                value: null,
              };
              calls += 1;
              return result;
            },
          }),
        },
      },
    },
  };
}

const ACCOUNT = address("11111111111111111111111111111111");
const PROGRAM_ACCOUNT: AccountInfoResult = {
  value: {
    data: ["", "base64"],
    owner: IDEALER_PROGRAM_ID.toString(),
  },
};

test("confirmedProgramAccountExists returns false for missing accounts", async () => {
  const reader = createAccountReader([{ value: null }]);

  assert.equal(
    await confirmedProgramAccountExists({
      account: ACCOUNT,
      client: reader.client,
      label: "Your round pass",
    }),
    false,
  );
});

test("waitForConfirmedProgramAccount retries until the program account is visible", async () => {
  const reader = createAccountReader([{ value: null }, PROGRAM_ACCOUNT]);

  await waitForConfirmedProgramAccount({
    account: ACCOUNT,
    attempts: 2,
    client: reader.client,
    intervalMs: 0,
    label: "Your round pass",
  });

  assert.equal(reader.calls(), 2);
});

test("waitForConfirmedProgramAccount rejects unexpected account owners", async () => {
  const reader = createAccountReader([
    {
      value: {
        data: ["", "base64"],
        owner: "11111111111111111111111111111111",
      },
    },
  ]);

  await assert.rejects(
    waitForConfirmedProgramAccount({
      account: ACCOUNT,
      attempts: 1,
      client: reader.client,
      intervalMs: 0,
      label: "Your round pass",
    }),
    /owner does not match/,
  );
});
