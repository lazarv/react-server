import colors from "picocolors";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

const logColors = {
  info: colors.cyan,
  error: colors.red,
  warn: colors.yellow,
};

export const createTheme = (type = "info", context) => ({
  prefix: {
    idle:
      colors.gray(timeFormatter.format(new Date())) +
      colors.bold(logColors[type](" [react-server]")),
    done:
      colors.gray(timeFormatter.format(new Date())) +
      colors.bold(logColors[type](" [react-server]")),
  },
  icon: {
    checked: "✅",
    unchecked: "  ",
    cursor: " ",
  },
  style: {
    answer: colors.white,
    highlight: (message) => colors.bold(colors.magenta(message)),
    message: (message) =>
      (message ? `${colors.white(message)} ` : "") + colors.green("➜"),
    renderSelectedChoices: (selected) => {
      const choices = [
        ...(context?.props?.preset?.features ?? []),
        ...selected,
      ];
      return choices.length > 0
        ? choices
            .map(
              (feature) =>
                feature.selectedName ??
                feature.name ??
                context?.env?.features?.[feature]?.name ??
                feature
            )
            .join(", ")
        : "None";
    },
    ...context?.env?.style,
  },
});

export const theme = createTheme();
export const warning = createTheme("warn");
