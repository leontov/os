export default {
  ci: {
    collect: {
      startServerCommand: "pnpm preview -- --host 0.0.0.0 --port 4173",
      url: ["http://127.0.0.1:4173/"],
      numberOfRuns: 1,
      settings: {
        preset: "desktop",
        formFactor: "desktop",
        screenEmulation: {
          mobile: false,
          width: 1440,
          height: 900,
          deviceScaleFactor: 1,
          disabled: false
        },
        throttlingMethod: "provided",
        chromeFlags: "--headless=new --no-sandbox --disable-dev-shm-usage --allow-insecure-localhost --disable-gpu"
      }
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:pwa": ["warn", { minScore: 0.85 }],
        "max-potential-fid": ["warn", { maxNumericValue: 100 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }]
      }
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouse"
    }
  }
};
