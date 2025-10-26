import type { PropsWithChildren, ReactNode } from "react";

interface AppShellProps {
  navigation?: ReactNode;
  mobileNavigation?: ReactNode;
  header?: ReactNode;
  inspector?: ReactNode;
  footer?: ReactNode;
}

const AppShell = ({ navigation, mobileNavigation, header, inspector, footer, children }: PropsWithChildren<AppShellProps>) => (
  <div className="relative isolate flex min-h-screen flex-col overflow-x-hidden bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.35),transparent_55%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.2),transparent_55%),linear-gradient(135deg,rgb(var(--color-background-main)),rgb(var(--color-background-accent)))] text-text-primary">
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-40 top-[-18rem] h-[38rem] w-[38rem] rounded-full bg-primary/25 blur-[180px]" aria-hidden="true" />
      <div className="absolute right-[-14rem] top-[12rem] h-[30rem] w-[30rem] rounded-full bg-accent/25 blur-[180px]" aria-hidden="true" />
      <div className="absolute bottom-[-18rem] left-1/2 h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-primary/15 blur-[220px]" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/10 via-transparent to-transparent opacity-40 mix-blend-overlay" aria-hidden="true" />
    </div>
    <div className="relative z-10 mx-auto flex w-full max-w-[120rem] flex-1 flex-col px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-safe-area-content transition-[padding] sm:px-6 lg:px-12 lg:pb-16">
      <div className="grid flex-1 gap-6 lg:grid-cols-[auto,minmax(0,1fr)] xl:grid-cols-[auto,minmax(0,1fr),24rem] xl:gap-10">
        {navigation ? (
          <aside className="relative hidden lg:block">
            <div className="sticky top-safe-area-sticky flex h-[calc(100vh-9rem)] w-[5.5rem] flex-col xl:w-[6.5rem]">
              {navigation}
            </div>
          </aside>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col gap-6 lg:gap-8">
          {header ? <div className="flex flex-col gap-6">{header}</div> : null}
          <main className="flex min-h-0 flex-1 flex-col gap-6">{children}</main>
          {footer ? <div className="mt-auto pt-4">{footer}</div> : null}
        </div>
        {inspector ? (
          <aside className="relative hidden xl:block">
            <div className="sticky top-safe-area-sticky h-[calc(100vh-9rem)] overflow-hidden rounded-[2.5rem] border border-white/5 bg-background-panel/70 p-5 backdrop-blur-xl">
              <div className="soft-scroll h-full overflow-y-auto pr-2">
                {inspector}
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
    {mobileNavigation ? (
      <div className="glass-panel-strong fixed inset-x-0 bottom-0 z-40 border-t border-border-strong/40 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-22px_65px_-32px_rgba(15,23,42,0.65)] backdrop-blur lg:hidden">
        {mobileNavigation}
      </div>
    ) : null}
  </div>
);

export default AppShell;
