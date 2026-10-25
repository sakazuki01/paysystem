import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { uninstallDevShim } from "../telegram/devShim";
import { resetTg } from "../telegram/telegram";

afterEach(() => {
  cleanup();
  uninstallDevShim();
  resetTg();
});
