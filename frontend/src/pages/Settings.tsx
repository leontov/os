import { useMemo } from "react";
import { ArrowLeft, Globe, Monitor, Moon, SunMedium, Minimize2, Maximize2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { SegmentedControl } from "../components/ui/Segmented";
import { useTheme } from "../design/theme";
import { useI18n } from "../app/i18n";

function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme, reduceMotion, setReduceMotion } = useTheme();
  const { locale, setLocale, t } = useI18n();

  const themeOptions = useMemo(
    () => [
      { value: "dark", label: t("settings.theme.dark"), icon: <Moon aria-hidden className="h-4 w-4" /> },
      { value: "light", label: t("settings.theme.light"), icon: <SunMedium aria-hidden className="h-4 w-4" /> },
      { value: "system", label: t("settings.theme.system"), icon: <Monitor aria-hidden className="h-4 w-4" /> },
    ],
    [t],
  );

  const motionOptions = useMemo(
    () => [
      { value: "reduced", label: t("settings.motion.reduced"), icon: <Minimize2 aria-hidden className="h-4 w-4" /> },
      { value: "full", label: t("settings.motion.full"), icon: <Maximize2 aria-hidden className="h-4 w-4" /> },
    ],
    [t],
  );

  const localeOptions = useMemo(
    () => [
      { value: "ru", label: t("settings.locale.ru"), icon: <Globe aria-hidden className="h-4 w-4" /> },
      { value: "en", label: t("settings.locale.en"), icon: <Globe aria-hidden className="h-4 w-4" /> },
    ],
    [t],
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-12 text-[var(--text)]">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
          <p className="text-sm text-[var(--muted)]">Настройте внешний вид, язык и доступность Kolibri.</p>
        </div>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft aria-hidden />
          Назад
        </Button>
      </header>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">{t("settings.theme")}</h2>
        <SegmentedControl
          options={themeOptions}
          value={theme}
          onValueChange={(value: string) => value && setTheme(value as typeof theme)}
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">{t("settings.motion")}</h2>
        <SegmentedControl
          options={motionOptions}
          value={reduceMotion ? "reduced" : "full"}
          onValueChange={(value: string) => setReduceMotion(value === "reduced")}
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">{t("settings.locale")}</h2>
        <SegmentedControl
          options={localeOptions}
          value={locale}
          onValueChange={(value: string) => value && setLocale(value as typeof locale)}
        />
      </section>
    </div>
  );
}

export default SettingsPage;
