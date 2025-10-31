import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Loader } from "lucide-react";

const ChatPage = lazy(async () => import("../pages/Chat"));
const SettingsPage = lazy(async () => import("../pages/Settings"));

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center text-[var(--muted)]">
            <Loader className="h-6 w-6 animate-spin" aria-hidden />
          </div>
        }
      >
        <ChatPage />
      </Suspense>
    ),
  },
  {
    path: "/settings",
    element: (
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center text-[var(--muted)]">
            <Loader className="h-6 w-6 animate-spin" aria-hidden />
          </div>
        }
      >
        <SettingsPage />
      </Suspense>
    ),
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
