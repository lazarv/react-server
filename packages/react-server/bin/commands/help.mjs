import help from "../help.mjs";
import logo from "../logo.mjs";

export default (cli) =>
  cli.command("help", "show getting started guide").action(async () => {
    await logo();
    await help();
  });
