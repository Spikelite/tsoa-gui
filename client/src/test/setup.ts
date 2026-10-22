import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library unmounts after each test on its own only when test
// functions are globals, which this project does not turn on.
afterEach(cleanup);
