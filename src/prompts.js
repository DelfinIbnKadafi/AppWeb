const { normalizeDomain } = require("./config");

// ask only what's missing, flags win
async function askConfig(preset = {}) {
  const prompts = require("prompts"); // lazy, only needed for interactive mode
  const has = (k) => preset[k] !== undefined;

  const answers = await prompts(
    [
      {
        type: has("name") ? null : "text",
        name: "name",
        message: "Enter App Name",
        validate: (v) => (v.trim() ? true : "Name can't be empty"),
      },
      {
        type: has("domain") ? null : "text",
        name: "domain",
        message: "Enter App Domain",
        validate: (v) => {
          try {
            normalizeDomain(v);
            return true;
          } catch (e) {
            return e.message;
          }
        },
      },
      {
        type: has("entry") ? null : "text",
        name: "entry",
        message: "Enter App Entry Point",
        initial: (prev, values) => {
          const d = values.domain || preset.domain;
          return d ? "https://" + normalizeDomain(d) : "";
        },
      },
      {
        type: has("block") ? null : "confirm",
        name: "block",
        message: "Force Block Another Domain? (default no)",
        initial: false,
      },
      {
        type: has("platform") ? null : "select",
        name: "platform",
        message: "App Platform",
        choices: [
          { title: "Android (.apk)", value: "android" },
          { title: "Windows (.exe)", value: "windows" },
          { title: "Both", value: "both" },
        ],
        initial: 1,
      },
    ],
    {
      onCancel: () => {
        throw new Error("Cancelled");
      },
    }
  );

  return { ...preset, ...answers };
}

module.exports = { askConfig };
