import { defineConfig, devices } from "@playwright/test";

// Every skin has to work on a landscape screen, and every skin but Sci-Fi FOF
// on a phone held upright too, so every end-to-end test runs on both. Sci-Fi
// FOF's layout for a phone held upright is not done yet.
export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:4173" },
  projects: [
    { name: "landscape", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
