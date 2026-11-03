import { lazy, Suspense } from "react";

import { App } from "./App";

// Signing in and the account have addresses of their own, outside the
// readings, and load only when opened, so a kiosk never fetches them.
const LoginPage = lazy(() => import("./account/LoginPage").then((module) => ({ default: module.LoginPage })));
const AccountPage = lazy(() => import("./account/AccountPage").then((module) => ({ default: module.AccountPage })));

export const PAGES: Record<string, typeof LoginPage> = { "/login": LoginPage, "/account": AccountPage };

export function Root({ path = window.location.pathname }: { path?: string }) {
  const Page = PAGES[path];
  if (Page === undefined) {
    return <App />;
  }
  return (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );
}
