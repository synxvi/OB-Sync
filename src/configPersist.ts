import { base64url } from "rfc4648";
import { reverseString } from "./misc";

import type { ObsSyncPluginSettings } from "./baseTypes";

const DEFAULT_README: string =
  "The file contains sensitive info, so DO NOT take screenshot of, copy, or share it to anyone! It's also generated automatically, so do not edit it manually.";

interface MessyConfigType {
  readme: string;
  d: string;
}

/**
 * this should accept the result after loadData();
 */
export const messyConfigToNormal = (
  x: MessyConfigType | ObsSyncPluginSettings | null | undefined
): ObsSyncPluginSettings | null | undefined => {
  if (x === null || x === undefined) {
    console.debug("the messy config is null or undefined, skip");
    return x as any;
  }
  if ("readme" in x && "d" in x) {
    const y = JSON.parse(
      (
        base64url.parse(reverseString(x["d"]), {
          out: Buffer.alloc as any,
          loose: true,
        }) as Buffer
      ).toString("utf-8")
    );
    return y;
  } else {
    return x;
  }
};

/**
 * this should accept the result of original config
 */
export const normalConfigToMessy = (
  x: ObsSyncPluginSettings | null | undefined
) => {
  if (x === null || x === undefined) {
    console.debug("the normal config is null or undefined, skip");
    return x;
  }
  const y = {
    readme: DEFAULT_README,
    d: reverseString(
      base64url.stringify(Buffer.from(JSON.stringify(x), "utf-8"), {
        pad: false,
      })
    ),
  };
  return y;
};
