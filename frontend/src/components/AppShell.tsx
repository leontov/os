import type { PropsWithChildren, ReactNode } from "react";

interface AppShellProps {
  navigation?: ReactNode;
  mobileNavigation?: ReactNode;
  header?: ReactNode;
  inspector?: ReactNode;
  footer?: ReactNode;
}

const AppShell = ({ navigation, mobileNavigation, header, inspector, footer, children }: PropsWithChildren<AppShellProps>) => (
  <div className="min-h-screen bg-gradient-to-br from-background-main via-background-accent to-background-main text-text-primary">
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 transition-[padding] sm:px-6 lg:px-8 lg:pb-12">
      <div className="flex items-start gap-6 lg:gap-8">
        {navigation ? <aside className="hidden w-[5.5rem] flex-none lg:block xl:w-[6.5rem]">{navigation}</aside> : null}
        <div className="flex min-h-[70vh] flex-1 flex-col gap-6">
          {header}
          <div className="flex flex-1 flex-col gap-6 lg:flex-row">
            <section className="flex min-h-[24rem] flex-1 flex-col gap-6">{children}</section>
            {inspector ? <aside className="hidden w-full max-w-sm flex-none lg:flex">{inspector}</aside> : null}
          </div>
          {footer ? <div className="mt-auto">{footer}</div> : null}
        </div>
      </div>
    </div>
    {mobileNavigation ? (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border-strong/40 bg-background-panel/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-18px_48px_-28px_rgba(15,23,42,0.55)] backdrop-blur lg:hidden">
        {mobileNavigation}
      </div>
    ) : null}
  </div>
);

export default AppShell;
